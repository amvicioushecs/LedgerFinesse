import { describe, expect, it } from "vitest";
import { parseServerEnv, stripeWebhookEnabled } from "@/lib/env";

const neon = {
  DATABASE_URL: "postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?sslmode=require",
  NEON_AUTH_BASE_URL: "https://ep-x.neonauth.us-west-2.aws.neon.tech/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
};
const stripe = { STRIPE_SECRET_KEY: "sk_test_123", STRIPE_WEBHOOK_SECRET: "whsec_123" };

describe("parseServerEnv", () => {
  it("accepts only the memory (development) and neon backends", () => {
    expect(() => parseServerEnv({ LF_BACKEND: "supabase" })).toThrow(/LF_BACKEND must be one of memory, neon/);
  });

  it("defaults to a fully local development setup", () => {
    const env = parseServerEnv({});
    expect(env).toMatchObject({ siteEnv: "development", backend: "memory", stripeMode: "mock", extractionMode: "demo", appUrl: "http://localhost:3000" });
  });

  it("never falls back to development in a production build: SITE_ENV is required (N2)", () => {
    expect(() => parseServerEnv({ NODE_ENV: "production" })).toThrow(/SITE_ENV is required/);
    // The reported hole: a database configured, nothing else set -> mock Stripe with a public webhook secret.
    expect(() => parseServerEnv({ NODE_ENV: "production", LF_BACKEND: "neon", ...neon })).toThrow(/SITE_ENV is required/);
    expect(() => parseServerEnv({ NODE_ENV: "production", SITE_ENV: "  " })).toThrow(/SITE_ENV is required/);
    expect(parseServerEnv({ NODE_ENV: "production", SITE_ENV: "development" }).siteEnv).toBe("development");
    expect(parseServerEnv({ NODE_ENV: "development" }).siteEnv).toBe("development");
    expect(parseServerEnv({ NODE_ENV: "test" }).siteEnv).toBe("development");
    // Anything else a server reports (including empty) is hosted.
    expect(() => parseServerEnv({ NODE_ENV: "" })).toThrow(/SITE_ENV is required/);
  });

  it("lets `next build` prerender without SITE_ENV (the build is not a hosted server; runtime still requires it)", () => {
    expect(parseServerEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }).siteEnv).toBe("development");
    expect(() => parseServerEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-server" })).toThrow(/SITE_ENV is required/);
  });

  it("parses a real Neon + Stripe test configuration", () => {
    const env = parseServerEnv({ SITE_ENV: "preview", LF_BACKEND: "neon", STRIPE_MODE: "stripe", NEXT_PUBLIC_APP_URL: "https://preview.example.com/", ...neon, ...stripe });
    expect(env).toMatchObject({ backend: "neon", stripeMode: "stripe", appUrl: "https://preview.example.com", stripe: { secretKey: "sk_test_123", webhookSecret: "whsec_123" } });
  });

  it("refuses local shortcuts in production", () => {
    expect(() => parseServerEnv({ SITE_ENV: "production" })).toThrow(/LF_BACKEND=memory[^]*STRIPE_MODE=mock[^]*EXTRACTION_MODE=demo/);
  });

  it("allows mock Stripe only in development (its webhook secret is public)", () => {
    expect(() => parseServerEnv({ SITE_ENV: "preview", LF_BACKEND: "neon", ...neon })).toThrow(/STRIPE_MODE=mock is only allowed in SITE_ENV=development/);
    expect(parseServerEnv({ SITE_ENV: "development" }).stripeMode).toBe("mock");
  });

  it("serves the Stripe webhook only for real Stripe or local development", () => {
    expect(stripeWebhookEnabled({ stripeMode: "stripe", siteEnv: "preview" })).toBe(true);
    expect(stripeWebhookEnabled({ stripeMode: "mock", siteEnv: "development" })).toBe(true);
    expect(stripeWebhookEnabled({ stripeMode: "mock", siteEnv: "preview" })).toBe(false);
    expect(stripeWebhookEnabled({ stripeMode: "mock", siteEnv: "production" })).toBe(false);
  });

  it("allows the memory backend (sign-in without email verification) only in development", () => {
    expect(() => parseServerEnv({ SITE_ENV: "preview", STRIPE_MODE: "stripe", ...stripe })).toThrow(/LF_BACKEND=memory is only allowed in SITE_ENV=development/);
  });

  it("uses the dev-session fallback secret only in development and never outside it", () => {
    expect(parseServerEnv({}).devSessionSecret).toBe("local-dev-only-not-a-secret");
    expect(parseServerEnv({ DEV_SESSION_SECRET: "s3cret" }).devSessionSecret).toBe("s3cret");
    const preview = parseServerEnv({ SITE_ENV: "preview", LF_BACKEND: "neon", STRIPE_MODE: "stripe", ...neon, ...stripe });
    expect(preview.devSessionSecret).toBeNull();
  });

  it("reads the daily audit cap (default 10) and rejects nonsense", () => {
    expect(parseServerEnv({}).dailyAuditLimit).toBe(10);
    expect(parseServerEnv({ LF_DAILY_AUDIT_LIMIT: "3" }).dailyAuditLimit).toBe(3);
    expect(() => parseServerEnv({ LF_DAILY_AUDIT_LIMIT: "0" })).toThrow(/LF_DAILY_AUDIT_LIMIT/);
    expect(() => parseServerEnv({ LF_DAILY_AUDIT_LIMIT: "lots" })).toThrow(/LF_DAILY_AUDIT_LIMIT/);
  });

  it("reads rate limits as limit/seconds per action, defaulting to the previous values", () => {
    expect(parseServerEnv({}).rateLimits).toEqual({
      upload: { limit: 10, windowSeconds: 60 }, signin: { limit: 10, windowSeconds: 60 }, checkout: { limit: 20, windowSeconds: 60 },
    });
    expect(parseServerEnv({ LF_RATE_LIMIT_SIGNIN: "5/300" }).rateLimits.signin).toEqual({ limit: 5, windowSeconds: 300 });
    expect(() => parseServerEnv({ LF_RATE_LIMIT_CHECKOUT: "lots" })).toThrow(/LF_RATE_LIMIT_CHECKOUT must look like 20\/60/);
    expect(() => parseServerEnv({ LF_RATE_LIMIT_UPLOAD: "0/60" })).toThrow(/LF_RATE_LIMIT_UPLOAD/);
  });

  it("trusts no client-IP header unless LF_TRUSTED_IP_HEADER names one; per-IP limit defaults to 100/60", () => {
    expect(parseServerEnv({}).trustedIpHeader).toBeNull();
    expect(parseServerEnv({ LF_TRUSTED_IP_HEADER: " X-Real-IP " }).trustedIpHeader).toBe("x-real-ip");
    expect(() => parseServerEnv({ LF_TRUSTED_IP_HEADER: "bad header" })).toThrow(/LF_TRUSTED_IP_HEADER/);
    expect(parseServerEnv({}).ipRateLimit).toEqual({ limit: 100, windowSeconds: 60 });
    expect(parseServerEnv({ LF_RATE_LIMIT_IP: "300/60" }).ipRateLimit).toEqual({ limit: 300, windowSeconds: 60 });
    expect(() => parseServerEnv({ LF_RATE_LIMIT_IP: "many" })).toThrow(/LF_RATE_LIMIT_IP must look like 100\/60/);
  });

  it("reads the per-email wrong-password limit (default 5 per 15 minutes)", () => {
    expect(parseServerEnv({}).passwordFailureLimit).toEqual({ limit: 5, windowSeconds: 900 });
    expect(parseServerEnv({ LF_PASSWORD_FAILURE_LIMIT: "3/600" }).passwordFailureLimit).toEqual({ limit: 3, windowSeconds: 600 });
    expect(() => parseServerEnv({ LF_PASSWORD_FAILURE_LIMIT: "x" })).toThrow(/LF_PASSWORD_FAILURE_LIMIT must look like 5\/900/);
  });

  it("reads how recent a sign-in must be to change a password (default 10 minutes)", () => {
    expect(parseServerEnv({}).passwordChangeRecentSeconds).toBe(600);
    expect(parseServerEnv({ LF_PASSWORD_CHANGE_RECENT_MINUTES: "5" }).passwordChangeRecentSeconds).toBe(300);
    expect(() => parseServerEnv({ LF_PASSWORD_CHANGE_RECENT_MINUTES: "0" })).toThrow(/LF_PASSWORD_CHANGE_RECENT_MINUTES/);
  });

  it("refuses live Stripe keys outside production", () => {
    expect(() => parseServerEnv({ STRIPE_MODE: "stripe", STRIPE_SECRET_KEY: "sk_live_1", STRIPE_WEBHOOK_SECRET: "whsec_1" })).toThrow(/live Stripe key/);
    expect(() => parseServerEnv({ STRIPE_MODE: "stripe", STRIPE_SECRET_KEY: "rk_live_1", STRIPE_WEBHOOK_SECRET: "whsec_1" })).toThrow(/live Stripe key/);
  });

  it("lists every missing variable for the chosen modes", () => {
    expect(() => parseServerEnv({ LF_BACKEND: "neon", STRIPE_MODE: "stripe", EXTRACTION_MODE: "gemini" })).toThrow(
      /DATABASE_URL[^]*NEON_AUTH_BASE_URL[^]*NEON_AUTH_COOKIE_SECRET[^]*STRIPE_SECRET_KEY[^]*STRIPE_WEBHOOK_SECRET[^]*GEMINI_API_KEY/,
    );
  });

  it("requires an https app URL in production", () => {
    expect(() =>
      parseServerEnv({ SITE_ENV: "production", LF_BACKEND: "neon", STRIPE_MODE: "stripe", EXTRACTION_MODE: "gemini", GEMINI_API_KEY: "g", NEXT_PUBLIC_APP_URL: "http://x.com", ...neon, ...stripe }),
    ).toThrow(/https/);
  });
});
