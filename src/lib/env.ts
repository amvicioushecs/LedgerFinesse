/**
 * Server configuration. Defaults run everything locally (memory store, mock Stripe, demo extraction);
 * production refuses those shortcuts, and non-production refuses live Stripe keys.
 */

export interface ServerEnv {
  siteEnv: "development" | "preview" | "production";
  backend: "memory" | "supabase";
  stripeMode: "mock" | "stripe";
  extractionMode: "demo" | "gemini";
  appUrl: string;
  supabase: { url: string; anonKey: string; serviceRoleKey: string } | null;
  stripe: { secretKey: string; webhookSecret: string } | null;
  gemini: { apiKey: string; model: string } | null;
  /** Signs local dev sessions when backend=memory. */
  devSessionSecret: string;
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
    devSessionSecret: raw.DEV_SESSION_SECRET?.trim() || "local-dev-only-not-a-secret",
  };
}

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
