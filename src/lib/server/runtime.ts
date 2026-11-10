import "server-only";
import { cookies } from "next/headers";
import { MemoryAuditRepository, MemoryDocumentStore } from "@/lib/audits/memory-repository";
import type { AuditDeps } from "@/lib/audits/service";
import { NeonAuditRepository } from "@/lib/audits/neon-repository";
import { neonQuery } from "@/lib/db/neon";
import type { AuditRepository, Extractor } from "@/lib/audits/types";
import { DEV_SESSION_COOKIE, signDevSession, verifyDevSession } from "@/lib/auth/dev-session";
import { MemoryPasswordProvider } from "@/lib/auth/memory-password";
import { NeonPasswordProvider, startCodeSignIn, type NeonAuthApi, type PendingStore } from "@/lib/auth/neon-auth";
import { neonAuth, neonAuthApi } from "@/lib/auth/neon-auth-server";
import { readNeonSession } from "@/lib/auth/neon-session";
import { PENDING_CODE_COOKIE, PENDING_CODE_MAX_AGE, readPendingCode, signPendingCode, type PendingCode } from "@/lib/auth/pending-code";
import { isLeakedPassword } from "@/lib/auth/pwned";
import { mayChangePassword, type AuthMethod, type PasswordAuthProvider } from "@/lib/auth/password";
import { serverEnv, type ServerEnv } from "@/lib/env";
import { demoExtractor } from "@/lib/extraction/demo";
import { createGeminiExtractor } from "@/lib/extraction/gemini";
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
  const session = await neonSession(env);
  return session ? { id: session.userId, email: session.email } : null;
}

/**
 * Whether this session may set a new password: a sign-in within the recent window, judged by time only (Neon Auth:
 * when the session was created; dev sessions carry a signed sign-in time).
 */
export async function passwordChangeAllowed(): Promise<boolean> {
  const env = serverEnv();
  const now = Math.floor(Date.now() / 1000);
  let methods: AuthMethod[] = [];
  if (env.backend === "memory") {
    const session = await verifyDevSession((await cookies()).get(DEV_SESSION_COOKIE)?.value, devSecret(env));
    methods = session ? [{ method: "password", at: session.signedInAt }] : [];
  } else {
    // There is no recovery session on Neon: resets use an emailed code.
    const session = await neonSession(env);
    methods = session ? [{ method: "session", at: session.createdAtSeconds }] : [];
  }
  return mayChangePassword(methods, now, env.passwordChangeRecentSeconds);
}

export type SignInResult = { kind: "code_sent" } | { kind: "signed_in" } | { kind: "error" };

function devSecret(env: ServerEnv): string {
  if (!env.devSessionSecret) throw new Error("dev sessions are development-only");
  return env.devSessionSecret;
}

/** Neon Auth: emails a sign-in code bound to this browser. The local memory backend signs in at once (dev only). */
export async function startEmailSignIn(email: string): Promise<SignInResult> {
  const env = serverEnv();
  if (env.backend === "memory") {
    await setDevSession(env, email);
    return { kind: "signed_in" };
  }
  return { kind: (await startCodeSignIn({ api: neonApi(env), pending: pendingStore(env) }, email)) === "code_sent" ? "code_sent" : "error" };
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

/** Development only: the in-memory password store, signing in with the same dev session cookie as email sign-in. */
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
  const provider = env.backend === "memory" ? devPasswordProvider(env) : new NeonPasswordProvider(neonApi(env), pendingStore(env));
  const passwordFailures = passwordFailureGuard({ store: rateLimitStore(env), limit: env.passwordFailureLimit, failOpen: env.siteEnv === "development" });
  const leakedPassword = env.backend === "neon" ? (password: string) => isLeakedPassword(password) : undefined;
  return { provider, rateLimited: (subject: string) => rateLimited(request, "signin", subject), passwordFailures, leakedPassword };
}

export async function signOut(): Promise<void> {
  const env = serverEnv();
  if (env.backend === "memory") {
    (await cookies()).delete(DEV_SESSION_COOKIE);
    return;
  }
  // Deletes the session row in neon_auth and clears this browser's cookies (called from a Route Handler).
  await neonAuth(neonConfig(env)).signOut();
}

async function repository(env: ServerEnv): Promise<{ repo: AuditRepository; files: AuditDeps["files"] }> {
  if (env.backend === "memory") return memory();
  // Uploads: no storage backend is chosen yet. The files live in memory for this request only (upload and scan run
  // in the same request); only their metadata and hashes are stored. The DocumentStore seam is where storage goes.
  const user = await getCurrentUser();
  return { repo: new NeonAuditRepository(neonQuery(neonConfig(env).databaseUrl), { userEmail: user?.email ?? null }), files: new MemoryDocumentStore() };
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

/** Webhook deps: the server-side repository (no user session on webhook requests). */
export function webhookDeps(): { stripe: Stripe; webhookSecret: string; repo: AuditRepository; refunds: RefundGateway } {
  const env = serverEnv();
  const repo = env.backend === "memory" ? memory().repo : new NeonAuditRepository(neonQuery(neonConfig(env).databaseUrl));
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

/** Postgres fixed-window counters (Neon, server only); the development-only memory backend counts in process. */
function rateLimitStore(env: ServerEnv): RateLimitStore {
  if (env.backend === "memory") {
    local.__lfRateLimits ??= new MemoryRateLimitStore();
    return local.__lfRateLimits;
  }
  return new NeonRateLimitStore(neonQuery(neonConfig(env).databaseUrl));
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
