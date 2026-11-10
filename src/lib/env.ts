/**
 * Server configuration. In `next dev` and tests the defaults run everything locally (memory store, mock Stripe,
 * demo extraction). A production build requires SITE_ENV; production refuses those shortcuts, and
 * non-production refuses live Stripe keys.
 */

import { DEFAULT_IP_RATE_LIMIT, DEFAULT_RATE_LIMITS, type RateLimit, type RateLimits } from "@/lib/rate-limit";

export interface ServerEnv {
  siteEnv: "development" | "preview" | "production";
  backend: "memory" | "supabase";
  stripeMode: "mock" | "stripe";
  extractionMode: "demo" | "gemini";
  appUrl: string;
  supabase: { url: string; anonKey: string; serviceRoleKey: string } | null;
  stripe: { secretKey: string; webhookSecret: string } | null;
  gemini: { apiKey: string; model: string } | null;
  /** Signs local dev sessions (backend=memory, development only). Null everywhere else: no fallback secret. */
  devSessionSecret: string | null;
  /** Audits one user may start per rolling 24 hours. */
  dailyAuditLimit: number;
  /** Per action: hits per fixed window, per IP and per user. */
  rateLimits: RateLimits;
  /** Loose per-IP limit; applies only with trustedIpHeader. */
  ipRateLimit: RateLimit;
  /** Lower-case header name the host sets with the client IP; null (default) turns per-IP limits off. */
  trustedIpHeader: string | null;
}

type Raw = Record<string, string | undefined>;

function pick<T extends string>(raw: Raw, name: string, allowed: readonly T[], fallback: T, errors: string[]): T {
  const value = raw[name]?.trim() || fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    errors.push(`${name} must be one of ${allowed.join(", ")}`);
    return fallback;
  }
  return value as T;
}

export function parseServerEnv(raw: Raw): ServerEnv {
  const errors: string[] = [];
  const need = (name: string) => {
    const value = raw[name]?.trim();
    if (!value) errors.push(`${name} is required`);
    return value ?? "";
  };

  // A production build (next start, the OpenNext worker) never assumes development: SITE_ENV must be set.
  // Only `next dev` and tests may default it; any other server (including a NODE_ENV-less worker, see
  // serverEnv) must set it. `next build` also runs with NODE_ENV=production while prerendering; it is not a server.
  // (Callers that pass no NODE_ENV at all are unit tests of this parser.)
  const building = raw.NEXT_PHASE === "phase-production-build";
  const hosted = raw.NODE_ENV !== undefined && raw.NODE_ENV !== "development" && raw.NODE_ENV !== "test";
  if (hosted && !building && !raw.SITE_ENV?.trim()) {
    errors.push("SITE_ENV is required in a production build (development, preview or production); it has no default there");
  }
  const siteEnv = pick(raw, "SITE_ENV", ["development", "preview", "production"] as const, "development", errors);
  const backend = pick(raw, "LF_BACKEND", ["memory", "supabase"] as const, "memory", errors);
  const stripeMode = pick(raw, "STRIPE_MODE", ["mock", "stripe"] as const, "mock", errors);
  const extractionMode = pick(raw, "EXTRACTION_MODE", ["demo", "gemini"] as const, "demo", errors);
  const appUrl = (raw.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");

  if (siteEnv === "production") {
    const shortcuts = [
      backend === "memory" && "LF_BACKEND=memory",
      stripeMode === "mock" && "STRIPE_MODE=mock",
      extractionMode === "demo" && "EXTRACTION_MODE=demo",
    ].filter(Boolean);
    if (shortcuts.length > 0) errors.push(`production refuses ${shortcuts.join(", ")}`);
    if (!appUrl.startsWith("https://")) errors.push("NEXT_PUBLIC_APP_URL must be https in production");
  } else if (siteEnv !== "development") {
    // The mock webhook secret is in the public repo: anyone could sign a "paid" event.
    if (stripeMode === "mock") errors.push("STRIPE_MODE=mock is only allowed in SITE_ENV=development");
    // Memory-backend sign-in issues a session for any typed email, without verification.
    if (backend === "memory") errors.push("LF_BACKEND=memory is only allowed in SITE_ENV=development");
  }

  const supabase =
    backend === "supabase"
      ? { url: need("NEXT_PUBLIC_SUPABASE_URL"), anonKey: need("NEXT_PUBLIC_SUPABASE_ANON_KEY"), serviceRoleKey: need("SUPABASE_SERVICE_ROLE_KEY") }
      : null;

  let stripe: ServerEnv["stripe"] = null;
  if (stripeMode === "stripe") {
    stripe = { secretKey: need("STRIPE_SECRET_KEY"), webhookSecret: need("STRIPE_WEBHOOK_SECRET") };
    if (siteEnv !== "production" && /^(sk|rk)_live_/.test(stripe.secretKey)) {
      errors.push("a live Stripe key is not allowed outside SITE_ENV=production; use a test-mode or sandbox key");
    }
  }

  const gemini =
    extractionMode === "gemini" ? { apiKey: need("GEMINI_API_KEY"), model: raw.GEMINI_MODEL?.trim() || "gemini-3.8-flash" } : null;

  const dailyAuditLimit = Number(raw.LF_DAILY_AUDIT_LIMIT?.trim() || "10");
  if (!Number.isSafeInteger(dailyAuditLimit) || dailyAuditLimit < 1) errors.push("LF_DAILY_AUDIT_LIMIT must be a positive integer");

  const parseLimit = (name: string, rawValue: string | undefined, fallback: RateLimit): RateLimit => {
    const value = rawValue?.trim();
    if (!value) return fallback;
    const match = /^(\d+)\/(\d+)$/.exec(value);
    const [limit, windowSeconds] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
    if (limit >= 1 && windowSeconds >= 1) return { limit, windowSeconds };
    errors.push(`${name} must look like ${fallback.limit}/${fallback.windowSeconds} (hits per window / window seconds)`);
    return fallback;
  };
  const rateLimits: RateLimits = {
    upload: parseLimit("LF_RATE_LIMIT_UPLOAD", raw.LF_RATE_LIMIT_UPLOAD, DEFAULT_RATE_LIMITS.upload),
    signin: parseLimit("LF_RATE_LIMIT_SIGNIN", raw.LF_RATE_LIMIT_SIGNIN, DEFAULT_RATE_LIMITS.signin),
    checkout: parseLimit("LF_RATE_LIMIT_CHECKOUT", raw.LF_RATE_LIMIT_CHECKOUT, DEFAULT_RATE_LIMITS.checkout),
  };
  const ipRateLimit = parseLimit("LF_RATE_LIMIT_IP", raw.LF_RATE_LIMIT_IP, DEFAULT_IP_RATE_LIMIT);
  const trustedIpHeader = raw.LF_TRUSTED_IP_HEADER?.trim().toLowerCase() || null;
  if (trustedIpHeader && !/^[a-z0-9-]+$/.test(trustedIpHeader)) errors.push("LF_TRUSTED_IP_HEADER must be a header name, e.g. x-real-ip");

  if (errors.length > 0) throw new Error(`Invalid server configuration:\n- ${errors.join("\n- ")}`);
  return {
    siteEnv,
    backend,
    stripeMode,
    extractionMode,
    appUrl,
    supabase,
    stripe,
    gemini,
    devSessionSecret: siteEnv === "development" ? raw.DEV_SESSION_SECRET?.trim() || "local-dev-only-not-a-secret" : null,
    dailyAuditLimit,
    rateLimits,
    ipRateLimit,
    trustedIpHeader,
  };
}

/** The webhook accepts mock-signed events only on a developer machine. */
export function stripeWebhookEnabled(env: Pick<ServerEnv, "stripeMode" | "siteEnv">): boolean {
  return env.stripeMode === "stripe" || (env.stripeMode === "mock" && env.siteEnv === "development");
}

let cached: ServerEnv | null = null;

/** The configuration problem, or null. The proxy answers 503 for every page while this is set. */
export function serverEnvError(): string | null {
  try {
    serverEnv();
    return null;
  } catch (error) {
    return String(error instanceof Error ? error.message : error);
  }
}

export function serverEnv(): ServerEnv {
  // Under workerd process.env may carry no NODE_ENV at runtime: treat that as hosted, never as development.
  cached ??= parseServerEnv({ ...process.env, NODE_ENV: process.env.NODE_ENV || "production" });
  return cached;
}
