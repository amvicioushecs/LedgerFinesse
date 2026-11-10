import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { MemoryAuditRepository, MemoryDocumentStore } from "@/lib/audits/memory-repository";
import type { AuditDeps } from "@/lib/audits/service";
import { NeonAuditRepository } from "@/lib/audits/neon-repository";
import { SupabaseAuditRepository, SupabaseDocumentStore } from "@/lib/audits/supabase-repository";
import { neonQuery } from "@/lib/db/neon";
import type { AuditRepository, Extractor } from "@/lib/audits/types";
import {
  RECOVERY_PENDING_COOKIE, RECOVERY_PENDING_MAX_AGE, decodeHeld, encodeHeld, heldSessionExpired,
  type CallbackDeps, type HeldSession, type RecoveryConfirmDeps,
} from "@/lib/auth/callback";
import { DEV_SESSION_COOKIE, signDevSession, verifyDevSession } from "@/lib/auth/dev-session";
import { MemoryPasswordProvider } from "@/lib/auth/memory-password";
import { NeonPasswordProvider, startCodeSignIn, type NeonAuthApi, type PendingStore } from "@/lib/auth/neon-auth";
import { neonAuth, neonAuthApi } from "@/lib/auth/neon-auth-server";
import { readNeonSession } from "@/lib/auth/neon-session";
import { PENDING_CODE_COOKIE, PENDING_CODE_MAX_AGE, readPendingCode, signPendingCode, type PendingCode } from "@/lib/auth/pending-code";
import { isLeakedPassword } from "@/lib/auth/pwned";
import { mayChangePassword, type AuthMethod, type PasswordAuthProvider } from "@/lib/auth/password";
import { SupabasePasswordProvider } from "@/lib/auth/supabase-password";
import { serverEnv, type ServerEnv } from "@/lib/env";
import { demoExtractor } from "@/lib/extraction/demo";
import { createGeminiExtractor } from "@/lib/extraction/gemini";
import type { Locale } from "@/lib/i18n/locales";
import { MOCK_WEBHOOK_SECRET, MockCheckoutGateway, MockRefundGateway, mockStripe } from "@/lib/payments/mock-gateway";
import { createStripeClient, StripeCheckoutGateway, StripeRefundGateway } from "@/lib/payments/stripe-gateway";
import type { CheckoutGateway, RefundGateway } from "@/lib/payments/types";
import { NeonRateLimitStore } from "@/lib/rate-limit-neon";
import { MemoryRateLimitStore, checkRateLimit, clientIp, passwordFailureGuard, type RateLimitOutcome, type RateLimitStore, type RateLimitedAction } from "@/lib/rate-limit";
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

/** Anon client with no cookie storage: verifies a recovery link without signing this browser in. */
function supabaseDetached(env: ServerEnv): SupabaseClient {
  if (!env.supabase) throw new Error("Supabase is not configured");
  return createClient(env.supabase.url, env.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** /auth/callback deps. The memory backend sends no email links, so every link is refused there. */
export async function callbackDeps(): Promise<CallbackDeps> {
  const env = serverEnv();
  // Neither the memory backend nor Neon Auth (codes, not links) sends links to this route.
  if (env.backend !== "supabase") return { exchangeCode: async () => false, verifyRecovery: async () => null, holdRecovery: async () => {} };
  return {
    async exchangeCode(code) {
      const { error } = await (await supabaseForRequest(env)).auth.exchangeCodeForSession(code);
      return !error;
    },
    async verifyRecovery(tokenHash) {
      const { data, error } = await supabaseDetached(env).auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (error || !data.session) return null;
      return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
    },
    async holdRecovery(session) {
      (await cookies()).set(RECOVERY_PENDING_COOKIE, encodeHeld(session), {
        httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https://"), path: "/", maxAge: RECOVERY_PENDING_MAX_AGE,
      });
    },
  };
}

async function heldRecovery(): Promise<HeldSession | null> {
  return decodeHeld((await cookies()).get(RECOVERY_PENDING_COOKIE)?.value);
}

/** The account a held recovery link belongs to, checked with Supabase (never read from the cookie itself). */
export async function pendingRecoveryEmail(): Promise<string | null> {
  const env = serverEnv();
  const held = env.backend === "supabase" ? await heldRecovery() : null;
  if (!held) return null;
  if (heldSessionExpired(held, Math.floor(Date.now() / 1000))) {
    // Don't delete cookies during render (Next throws). The cookie expires at maxAge or is cleared on POST.
    await recoveryConfirmDeps().revoke(held);
    return null;
  }
  const { data, error } = await supabaseDetached(env).auth.getUser(held.accessToken);
  return error ? null : (data.user?.email ?? null);
}

export function recoveryConfirmDeps(): RecoveryConfirmDeps {
  const env = serverEnv();
  return {
    async takePending() {
      const held = env.backend === "supabase" ? await heldRecovery() : null;
      (await cookies()).delete(RECOVERY_PENDING_COOKIE);
      return held;
    },
    async setSession(held) {
      const { error } = await (await supabaseForRequest(env)).auth.setSession({ access_token: held.accessToken, refresh_token: held.refreshToken });
      return !error;
    },
    async revoke(held) {
      const { error } = await supabaseAdmin(env).auth.admin.signOut(held.accessToken, "local");
      if (error) console.error(JSON.stringify({ msg: "recovery revoke failed", status: error.status, code: error.code }));
    },
  };
}

function neonConfig(env: ServerEnv): NonNullable<ServerEnv["neon"]> {
  if (!env.neon) throw new Error("Neon is not configured");
  return env.neon;
}

function neonApi(env: ServerEnv): NeonAuthApi {
  return neonAuthApi({ ...neonConfig(env), appUrl: env.appUrl });
}

/** The signed lf_code_pending cookie (see pending-code.ts). */
function pendingStore(env: ServerEnv): PendingStore {
  const secret = neonConfig(env).cookieSecret;
  return {
    async set(pending: PendingCode) {
      (await cookies()).set(PENDING_CODE_COOKIE, await signPendingCode(pending, secret), {
        httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https://"), path: "/", maxAge: PENDING_CODE_MAX_AGE,
      });
    },
    async get() {
      return readPendingCode((await cookies()).get(PENDING_CODE_COOKIE)?.value, secret);
    },
    async clear() {
      (await cookies()).delete(PENDING_CODE_COOKIE);
    },
  };
}

/** The code flow waiting in this browser (Neon backend only), for the sign-in and reset forms. */
export async function pendingCode(): Promise<PendingCode | null> {
  const env = serverEnv();
  return env.backend === "neon" ? pendingStore(env).get() : null;
}

/** Deps for the emailed-code forms: Neon Auth, this browser's pending code, the per-email failure limit. */
export function codeDeps() {
  const env = serverEnv();
  return {
    api: neonApi(env),
    pending: pendingStore(env),
    failures: passwordFailureGuard({ store: rateLimitStore(env), limit: env.passwordFailureLimit, failOpen: env.siteEnv === "development" }),
    leakedPassword: (password: string) => isLeakedPassword(password),
  };
}

/** Neon Auth session, checked with Neon Auth on every call; read-only, so it is safe in Server Component renders. */
async function neonSession(env: ServerEnv) {
  return readNeonSession((await cookies()).getAll(), { authBaseUrl: neonConfig(env).authBaseUrl, appUrl: env.appUrl });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const env = serverEnv();
  if (env.backend === "memory") {
    const session = await verifyDevSession((await cookies()).get(DEV_SESSION_COOKIE)?.value, devSecret(env));
    return session ? { id: session.id, email: session.email } : null;
  }
  if (env.backend === "neon") {
    const session = await neonSession(env);
    return session ? { id: session.userId, email: session.email } : null;
  }
  const supabase = await supabaseForRequest(env);
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

/**
 * Whether this session may set a new password: a sign-in (including recovery) within the recent window, from the
 * verified JWT's `amr` claim timestamps (dev sessions carry a signed sign-in time).
 */
export async function passwordChangeAllowed(): Promise<boolean> {
  const env = serverEnv();
  const now = Math.floor(Date.now() / 1000);
  let methods: AuthMethod[] = [];
  if (env.backend === "memory") {
    const session = await verifyDevSession((await cookies()).get(DEV_SESSION_COOKIE)?.value, devSecret(env));
    methods = session ? [{ method: "password", at: session.signedInAt }] : [];
  } else if (env.backend === "neon") {
    // Time only: when Neon Auth created this session (there is no recovery session; resets use an emailed code).
    const session = await neonSession(env);
    methods = session ? [{ method: "session", at: session.createdAtSeconds }] : [];
  } else {
    const { data, error } = await (await supabaseForRequest(env)).auth.getClaims();
    const amr = error ? [] : ((data?.claims.amr ?? []) as unknown[]);
    methods = amr.flatMap((m) =>
      typeof m === "object" && m && "method" in m && "timestamp" in m ? [{ method: String(m.method), at: Number(m.timestamp) }] : []);
  }
  return mayChangePassword(methods, now, env.passwordChangeRecentSeconds);
}

export type SignInResult = { kind: "email_sent" } | { kind: "code_sent" } | { kind: "signed_in" } | { kind: "error" };

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
  if (env.backend === "neon") {
    return { kind: (await startCodeSignIn({ api: neonApi(env), pending: pendingStore(env) }, email)) === "code_sent" ? "code_sent" : "error" };
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
  const provider =
    env.backend === "memory" ? devPasswordProvider(env)
    : env.backend === "neon" ? new NeonPasswordProvider(neonApi(env), pendingStore(env))
    : new SupabasePasswordProvider(await supabaseForRequest(env));
  const passwordFailures = passwordFailureGuard({ store: rateLimitStore(env), limit: env.passwordFailureLimit, failOpen: env.siteEnv === "development" });
  const leakedPassword = env.backend === "neon" ? (password: string) => isLeakedPassword(password) : undefined;
  return { provider, rateLimited: (subject: string) => rateLimited(request, "signin", subject), passwordFailures, appUrl: env.appUrl, leakedPassword };
}

export async function signOut(): Promise<void> {
  const env = serverEnv();
  if (env.backend === "memory") {
    (await cookies()).delete(DEV_SESSION_COOKIE);
    return;
  }
  if (env.backend === "neon") {
    // Deletes the session row in neon_auth and clears this browser's cookies.
    await neonAuth(neonConfig(env)).signOut();
    return;
  }
  await (await supabaseForRequest(env)).auth.signOut();
}

async function repository(env: ServerEnv): Promise<{ repo: AuditRepository; files: AuditDeps["files"] }> {
  if (env.backend === "memory") return memory();
  if (env.backend === "neon") {
    // Uploads: no storage backend is chosen yet. The files live in memory for this request only (upload and scan
    // run in the same request); only their metadata and hashes are stored. See the PR notes.
    const user = await getCurrentUser();
    return { repo: new NeonAuditRepository(neonQuery(neonConfig(env).databaseUrl), { userEmail: user?.email ?? null }), files: new MemoryDocumentStore() };
  }
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
  const repo =
    env.backend === "memory" ? memory().repo
    : env.backend === "neon" ? new NeonAuditRepository(neonQuery(neonConfig(env).databaseUrl))
    : new SupabaseAuditRepository(supabaseAdmin(env), supabaseAdmin(env));
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
  if (env.backend === "neon") return new NeonRateLimitStore(neonQuery(neonConfig(env).databaseUrl));
  const admin = supabaseAdmin(env);
  return {
    async hit(keys, limit, windowSeconds) {
      const { data, error } = await admin.rpc("rate_limit_hit", { p_keys: keys, p_limit: limit, p_window_seconds: windowSeconds });
      if (error) throw new Error(`rate_limit_hit: ${error.message}`);
      return data === true;
    },
    async forgive(keys, windowSeconds) {
      const { error } = await admin.rpc("rate_limit_forgive", { p_keys: keys, p_window_seconds: windowSeconds });
      if (error) throw new Error(`rate_limit_forgive: ${error.message}`);
    },
  };
}

/** "unavailable" (request refused, "temporarily unavailable") if the limiter is unreachable, except in development. */
export function rateLimited(request: Request, action: RateLimitedAction, subject: string | null): Promise<RateLimitOutcome> {
  const env = serverEnv();
  return checkRateLimit(
    { store: rateLimitStore(env), limits: env.rateLimits, ipLimit: env.ipRateLimit, failOpen: env.siteEnv === "development" },
    action,
    { ip: clientIp(request.headers, env.trustedIpHeader), subject },
  );
}
