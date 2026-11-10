import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const neon = {
  DATABASE_URL: "postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?sslmode=require",
  NEON_AUTH_BASE_URL: "https://ep-x.neonauth.us-west-2.aws.neon.tech/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
};
const stripe = { STRIPE_SECRET_KEY: "sk_test_123", STRIPE_WEBHOOK_SECRET: "whsec_123" };

describe("parseServerEnv: LF_BACKEND=neon", () => {
  it("reads the Neon database, Neon Auth URL and cookie secret", () => {
    const env = parseServerEnv({ SITE_ENV: "preview", LF_BACKEND: "neon", STRIPE_MODE: "stripe", ...neon, ...stripe });
    expect(env.backend).toBe("neon");
    expect(env.neon).toEqual({ databaseUrl: neon.DATABASE_URL, authBaseUrl: neon.NEON_AUTH_BASE_URL, cookieSecret: neon.NEON_AUTH_COOKIE_SECRET });
    expect(env.supabase).toBeNull();
  });

  it("fails closed when any Neon setting is missing", () => {
    for (const key of Object.keys(neon)) {
      const raw: Record<string, string> = { SITE_ENV: "preview", LF_BACKEND: "neon", STRIPE_MODE: "stripe", ...neon, ...stripe };
      delete raw[key];
      expect(() => parseServerEnv(raw)).toThrow(new RegExp(`${key} is required`));
    }
  });

  it("needs a cookie secret of at least 32 characters and an https Neon Auth URL", () => {
    expect(() => parseServerEnv({ LF_BACKEND: "neon", ...neon, NEON_AUTH_COOKIE_SECRET: "short" })).toThrow(/NEON_AUTH_COOKIE_SECRET must be at least 32 characters/);
    expect(() => parseServerEnv({ LF_BACKEND: "neon", ...neon, NEON_AUTH_BASE_URL: "http://ep-x.example/auth" })).toThrow(/NEON_AUTH_BASE_URL must be an https URL/);
  });

  it("still refuses the memory backend outside development", () => {
    expect(() => parseServerEnv({ SITE_ENV: "preview", LF_BACKEND: "memory", STRIPE_MODE: "stripe", ...stripe })).toThrow(/LF_BACKEND=memory is only allowed/);
  });
});
