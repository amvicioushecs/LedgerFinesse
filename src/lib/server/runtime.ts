import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { MemoryAuditRepository, MemoryDocumentStore } from "@/lib/audits/memory-repository";
import type { AuditDeps } from "@/lib/audits/service";
import { SupabaseAuditRepository, SupabaseDocumentStore } from "@/lib/audits/supabase-repository";
import type { AuditRepository, Extractor } from "@/lib/audits/types";
import { DEV_SESSION_COOKIE, signDevSession, verifyDevSession } from "@/lib/auth/dev-session";
import { MemoryPasswordProvider } from "@/lib/auth/memory-password";
import type { PasswordAuthProvider } from "@/lib/auth/password";
import { SupabasePasswordProvider } from "@/lib/auth/supabase-password";
import { serverEnv, type ServerEnv } from "@/lib/env";
import { demoExtractor } from "@/lib/extraction/demo";
import { createGeminiExtractor } from "@/lib/extraction/gemini";
import type { Locale } from "@/lib/i18n/locales";
import { MOCK_WEBHOOK_SECRET, MockCheckoutGateway, MockRefundGateway, mockStripe } from "@/lib/payments/mock-gateway";
import { createStripeClient, StripeCheckoutGateway, StripeRefundGateway } from "@/lib/payments/stripe-gateway";
import type { CheckoutGateway, RefundGateway } from "@/lib/payments/types";
import { MemoryRateLimitStore, clientIp, isRateLimited, type RateLimitStore, type RateLimitedAction } from "@/lib/rate-limit";
import type Stripe from "stripe";

export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * Process-wide singletons for the local backends (memory store, mock Stripe sessions and refunds), kept on
 * globalThis so they survive module reloads. DEVELOPMENT ONLY: parseServerEnv refuses memory and mock outside
 * SITE_ENV=development. On Workers each isolate has its own copy, so they are not shared state.
 */
const local = globalThis as typeof globalThis & {
  __lfMemory?: { repo: MemoryAuditRepository; files: MemoryDocumentStore };
  __lfMockGateway?: MockCheckoutGateway;
  __lfMockRefunds?: MockRefundGateway;
  __lfPasswords?: MemoryPasswordProvider;
  __lfRateLimits?: MemoryRateLimitStore;
};

function memory() {
  local.__lfMemory ??= { repo: new MemoryAuditRepository(), files: new MemoryDocumentStore() };
  return local.__lfMemory;
}

export function mockGateway(env: ServerEnv = serverEnv()): MockCheckoutGateway {
  if (env.stripeMode !== "mock") throw new Error("mock checkout is disabled");
  local.__lfMockGateway ??= new MockCheckoutGateway(env.appUrl);
  return local.__lfMockGateway;
}

/** Supabase client bound to the renter's session cookies (RLS applies). */
export async function supabaseForRequest(env: ServerEnv = serverEnv()): Promise<SupabaseClient> {
  if (!env.supabase) throw new Error("Supabase is not configured");
  const store = await cookies();
  return createServerClient(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

function supabaseAdmin(env: ServerEnv): SupabaseClient {
  if (!env.supabase) throw new Error("Supabase is not configured");
  return createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const env = serverEnv();
  if (env.backend === "memory") {
    const token = (await cookies()).get(DEV_SESSION_COOKIE)?.value;
    return verifyDevSession(token, devSecret(env));
  }
  const supabase = await supabaseForRequest(env);
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

export type SignInResult = { kind: "email_sent" } | { kind: "signed_in" } | { kind: "error" };

function devSecret(env: ServerEnv): string {
  if (!env.devSessionSecret) throw new Error("dev sessions are development-only");
  return env.devSessionSecret;
}

/** Email magic link (Supabase) or, for the local memory backend, an immediate dev session. */
export async function startEmailSignIn(email: string, nextPath: string, locale: Locale): Promise<SignInResult> {
  const env = serverEnv();
  if (env.backend === "memory") {
    await setDevSession(env, email);
    return { kind: "signed_in" };
  }
  const supabase = await supabaseForRequest(env);
  const callback = new URL("/auth/callback", env.appUrl);
  callback.searchParams.set("next", nextPath);
  callback.searchParams.set("locale", locale);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  });
  if (error) {
    console.error(JSON.stringify({ msg: "magic link failed", status: error.status, code: error.code }));
    return { kind: "error" };
  }
  return { kind: "email_sent" };
}

async function setDevSession(env: ServerEnv, email: string): Promise<void> {
  (await cookies()).set(DEV_SESSION_COOKIE, await signDevSession(email, devSecret(env)), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/** Development only: the in-memory password store, signing in with the same dev session cookie as the magic link. */
function devPasswordProvider(env: ServerEnv): PasswordAuthProvider {
  devSecret(env);
  local.__lfPasswords ??= new MemoryPasswordProvider();
  const store = local.__lfPasswords;
  return {
    async signIn(email, password) {
      const result = await store.signIn(email, password);
      if (result === "ok") await setDevSession(env, email);
      return result;
    },
    async signUp(email, password) {
      const result = await store.signUp(email, password);
      if (result === "signed_in") await setDevSession(env, email);
      return result;
    },
    sendReset: () => store.sendReset(),
    async updatePassword(password) {
      store.currentEmail = (await getCurrentUser())?.email ?? null;
      return store.updatePassword(password);
    },
  };
}

/** Password sign-in, sign-up and reset: same "signin" rate limits (per IP and per email/user) as the magic link. */
export async function passwordDeps(request: Request) {
  const env = serverEnv();
  const provider = env.backend === "memory" ? devPasswordProvider(env) : new SupabasePasswordProvider(await supabaseForRequest(env));
  return { provider, rateLimited: (subject: string) => rateLimited(request, "signin", subject), appUrl: env.appUrl };
}

export async function signOut(): Promise<void> {
  const env = serverEnv();
  if (env.backend === "memory") {
    (await cookies()).delete(DEV_SESSION_COOKIE);
    return;
  }
  await (await supabaseForRequest(env)).auth.signOut();
}

async function repository(env: ServerEnv): Promise<{ repo: AuditRepository; files: AuditDeps["files"] }> {
  if (env.backend === "memory") return memory();
  const admin = supabaseAdmin(env);
  return { repo: new SupabaseAuditRepository(await supabaseForRequest(env), admin), files: new SupabaseDocumentStore(admin) };
}

function extractor(env: ServerEnv): Extractor {
  return env.gemini ? createGeminiExtractor(env.gemini) : demoExtractor;
}

export async function auditDeps(): Promise<AuditDeps> {
  const env = serverEnv();
  return {
    ...(await repository(env)),
    extractor: extractor(env),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    dailyAuditLimit: env.dailyAuditLimit,
  };
}

export async function checkoutDeps(): Promise<{ repo: AuditRepository; gateway: CheckoutGateway; appUrl: string }> {
  const env = serverEnv();
  const { repo } = await repository(env);
  const gateway = env.stripe ? new StripeCheckoutGateway(createStripeClient(env.stripe.secretKey)) : mockGateway(env);
  return { repo, gateway, appUrl: env.appUrl };
}

/** Webhook deps: service-role repository only (no user session on webhook requests). */
export function webhookDeps(): { stripe: Stripe; webhookSecret: string; repo: AuditRepository; refunds: RefundGateway } {
  const env = serverEnv();
  const repo = env.backend === "memory" ? memory().repo : new SupabaseAuditRepository(supabaseAdmin(env), supabaseAdmin(env));
  if (env.stripe) {
    const stripe = createStripeClient(env.stripe.secretKey);
    return { stripe, webhookSecret: env.stripe.webhookSecret, repo, refunds: new StripeRefundGateway(stripe) };
  }
  local.__lfMockRefunds ??= new MockRefundGateway();
  return { stripe: mockStripe, webhookSecret: MOCK_WEBHOOK_SECRET, repo, refunds: local.__lfMockRefunds };
}

/** Rejects cross-site form posts (defense in depth on top of SameSite=Lax cookies). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return request.headers.get("sec-fetch-site") !== "cross-site";
  return origin === new URL(request.url).origin || origin === serverEnv().appUrl;
}

/** Postgres fixed-window counters (service role); the development-only memory backend counts in process. */
function rateLimitStore(env: ServerEnv): RateLimitStore {
  if (env.backend === "memory") {
    local.__lfRateLimits ??= new MemoryRateLimitStore();
    return local.__lfRateLimits;
  }
  const admin = supabaseAdmin(env);
  return {
    async hit(keys, limit, windowSeconds) {
      const { data, error } = await admin.rpc("rate_limit_hit", { p_keys: keys, p_limit: limit, p_window_seconds: windowSeconds });
      if (error) throw new Error(`rate_limit_hit: ${error.message}`);
      return data === true;
    },
  };
}

/** Fails closed (refuses the request) if the limiter is unreachable, except in development. */
export function rateLimited(request: Request, action: RateLimitedAction, subject: string | null): Promise<boolean> {
  const env = serverEnv();
  return isRateLimited(
    { store: rateLimitStore(env), limits: env.rateLimits, failOpen: env.siteEnv === "development" },
    action,
    { ip: clientIp(request.headers), subject },
  );
}
