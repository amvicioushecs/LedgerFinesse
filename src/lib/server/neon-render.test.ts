/**
 * S1 on the Neon backend: what a page render reads (the pending code, the session, password-change recency) never
 * sets or deletes cookies, whatever state the cookies or the Neon Auth session are in. Writes throw here, as in Next.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_CODE_COOKIE, signPendingCode } from "@/lib/auth/pending-code";
import { parseServerEnv, type ServerEnv } from "@/lib/env";

const SECRET = "x".repeat(40);
const jar = new Map<string, string>();
const refuse = () => {
  throw new Error("Cookies can only be modified in a Server Action or Route Handler");
};
const cookieStore = {
  get: vi.fn((name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined)),
  getAll: vi.fn(() => [...jar].map(([name, value]) => ({ name, value }))),
  set: vi.fn(refuse),
  delete: vi.fn(refuse),
};
const env: { current: ServerEnv } = {
  current: parseServerEnv({
    SITE_ENV: "preview", LF_BACKEND: "neon", STRIPE_MODE: "stripe", STRIPE_SECRET_KEY: "sk_test_dummy", STRIPE_WEBHOOK_SECRET: "whsec_dummy",
    NEXT_PUBLIC_APP_URL: "https://app.example.test", DATABASE_URL: "postgresql://u:p@ep-x.example.test/db", NEON_AUTH_BASE_URL: "https://auth.example.test/db/auth",
    NEON_AUTH_COOKIE_SECRET: SECRET,
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }));
// Render-time reads must not go through the SDK (its getSession writes cookies): fail if they do.
vi.mock("@/lib/auth/neon-auth-server", () => ({ neonAuth: () => { throw new Error("SDK used in a render-time read"); }, neonAuthApi: () => ({}) }));
vi.mock("@/lib/env", async (original) => ({ ...(await original<typeof import("@/lib/env")>()), serverEnv: () => env.current }));

const { getCurrentUser, passwordChangeAllowed, pendingCode } = await import("@/lib/server/runtime");

const sessionBody = (createdAt: string) => ({ session: { createdAt }, user: { id: "u1", email: "a@example.com", emailVerified: true } });
const clearing = { "set-cookie": "__Secure-neon-auth.session_token=; Max-Age=0; Path=/; Secure; HttpOnly" };

describe("Neon backend: render-time reads never write cookies", () => {
  beforeEach(() => {
    jar.clear();
    cookieStore.set.mockClear();
    cookieStore.delete.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("an expired, unsigned, garbled or expiry-less pending code reads as none", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = (o: object) => btoa(JSON.stringify(o)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    for (const value of [
      await signPendingCode({ purpose: "reset", email: "a@example.com" }, SECRET, now - 601),
      `${payload({ p: "reset", e: "a@example.com" })}.forged`,
      "garbage",
    ]) {
      jar.set(PENDING_CODE_COOKIE, value);
      expect(await pendingCode()).toBeNull();
    }
    jar.set(PENDING_CODE_COOKIE, await signPendingCode({ purpose: "reset", email: "a@example.com" }, SECRET));
    expect(await pendingCode()).toEqual({ purpose: "reset", email: "a@example.com" });
  });

  it("a revoked session (Neon Auth answers null and asks to clear cookies) is signed out, and nothing is cleared", async () => {
    jar.set("__Secure-neon-auth.session_token", "tok");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { headers: { "content-type": "application/json", ...clearing } })));
    expect(await getCurrentUser()).toBeNull();
    expect(await passwordChangeAllowed()).toBe(false);
  });

  it("password-change recency is judged by session age only", async () => {
    jar.set("__Secure-neon-auth.session_token", "tok");
    const at = (ms: number) => vi.fn(async () => Response.json(sessionBody(new Date(Date.now() - ms).toISOString()), { headers: clearing }));
    vi.stubGlobal("fetch", at(60_000));
    expect(await getCurrentUser()).toEqual({ id: "u1", email: "a@example.com" });
    expect(await passwordChangeAllowed()).toBe(true);
    vi.stubGlobal("fetch", at(env.current.passwordChangeRecentSeconds * 1000 + 60_000));
    expect(await passwordChangeAllowed()).toBe(false);
  });
});
