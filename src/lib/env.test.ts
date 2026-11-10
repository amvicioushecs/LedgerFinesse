import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const supabase = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};
const stripe = { STRIPE_SECRET_KEY: "sk_test_123", STRIPE_WEBHOOK_SECRET: "whsec_123" };

describe("parseServerEnv", () => {
  it("defaults to a fully local development setup", () => {
    const env = parseServerEnv({});
    expect(env).toMatchObject({ siteEnv: "development", backend: "memory", stripeMode: "mock", extractionMode: "demo", appUrl: "http://localhost:3000" });
  });

  it("parses a real Supabase + Stripe test configuration", () => {
    const env = parseServerEnv({ SITE_ENV: "preview", LF_BACKEND: "supabase", STRIPE_MODE: "stripe", NEXT_PUBLIC_APP_URL: "https://preview.example.com/", ...supabase, ...stripe });
    expect(env).toMatchObject({ backend: "supabase", stripeMode: "stripe", appUrl: "https://preview.example.com", stripe: { secretKey: "sk_test_123", webhookSecret: "whsec_123" } });
  });

  it("refuses local shortcuts in production", () => {
    expect(() => parseServerEnv({ SITE_ENV: "production" })).toThrow(/LF_BACKEND=memory[^]*STRIPE_MODE=mock[^]*EXTRACTION_MODE=demo/);
  });

  it("refuses live Stripe keys outside production", () => {
    expect(() => parseServerEnv({ STRIPE_MODE: "stripe", STRIPE_SECRET_KEY: "sk_live_1", STRIPE_WEBHOOK_SECRET: "whsec_1" })).toThrow(/live Stripe key/);
    expect(() => parseServerEnv({ STRIPE_MODE: "stripe", STRIPE_SECRET_KEY: "rk_live_1", STRIPE_WEBHOOK_SECRET: "whsec_1" })).toThrow(/live Stripe key/);
  });

  it("lists every missing variable for the chosen modes", () => {
    expect(() => parseServerEnv({ LF_BACKEND: "supabase", STRIPE_MODE: "stripe", EXTRACTION_MODE: "gemini" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL[^]*NEXT_PUBLIC_SUPABASE_ANON_KEY[^]*SUPABASE_SERVICE_ROLE_KEY[^]*STRIPE_SECRET_KEY[^]*STRIPE_WEBHOOK_SECRET[^]*GEMINI_API_KEY/,
    );
  });

  it("requires an https app URL in production", () => {
    expect(() =>
      parseServerEnv({ SITE_ENV: "production", LF_BACKEND: "supabase", STRIPE_MODE: "stripe", EXTRACTION_MODE: "gemini", GEMINI_API_KEY: "g", NEXT_PUBLIC_APP_URL: "http://x.com", ...supabase, ...stripe }),
    ).toThrow(/https/);
  });
});
