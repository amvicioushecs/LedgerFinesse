import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeHeld, RECOVERY_PENDING_COOKIE, type HeldSession } from "@/lib/auth/callback";
import type { ServerEnv } from "@/lib/env";

const signOut = vi.fn(async () => ({ error: null }));
const cookieStore = {
  get: vi.fn(),
  delete: vi.fn(),
  set: vi.fn(),
  getAll: vi.fn(() => []),
};

const env = {
  current: {
    siteEnv: "preview",
    backend: "supabase",
    stripeMode: "stripe",
    extractionMode: "demo",
    appUrl: "http://localhost:3000",
    supabase: { url: "https://example.supabase.co", anonKey: "anon", serviceRoleKey: "service" },
    stripe: { secretKey: "sk_test_dummy", webhookSecret: "whsec_dummy" },
    gemini: null,
    devSessionSecret: null,
    dailyAuditLimit: 10,
    rateLimits: { upload: { limit: 10, windowSeconds: 60 }, signin: { limit: 10, windowSeconds: 60 }, checkout: { limit: 10, windowSeconds: 60 } },
    ipRateLimit: { limit: 60, windowSeconds: 60 },
    passwordFailureLimit: { limit: 10, windowSeconds: 60 },
    passwordChangeRecentSeconds: 600,
    trustedIpHeader: null,
  } as ServerEnv,
};

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("@/lib/env", async (original) => ({ ...(await original<typeof import("@/lib/env")>()), serverEnv: () => env.current }));
vi.mock("@supabase/supabase-js", async (original) => {
  const actual = await original<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: () => ({ auth: { admin: { signOut }, getUser: vi.fn(), verifyOtp: vi.fn() } }),
  };
});

const { pendingRecoveryEmail, recoveryConfirmDeps } = await import("@/lib/server/runtime");

function hold(session: HeldSession | Omit<HeldSession, "issuedAt">, issuedAt?: number | "omit") {
  const value =
    issuedAt === "omit"
      ? btoa(JSON.stringify({ accessToken: session.accessToken, refreshToken: session.refreshToken }))
      : encodeHeld({ ...session, issuedAt: issuedAt ?? (session as HeldSession).issuedAt });
  cookieStore.get.mockReturnValue({ name: RECOVERY_PENDING_COOKIE, value });
}

describe("pendingRecoveryEmail (Supabase backend)", () => {
  beforeEach(() => {
    signOut.mockClear();
    cookieStore.get.mockReset();
    cookieStore.delete.mockReset();
    cookieStore.set.mockReset();
    env.current = { ...env.current, backend: "supabase" };
    cookieStore.delete.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
  });

  it("returns null on the memory backend without reading or deleting a cookie", async () => {
    env.current = { ...env.current, backend: "memory" };
    hold({ accessToken: "at", refreshToken: "rt", issuedAt: 1 });
    expect(await pendingRecoveryEmail()).toBeNull();
    expect(cookieStore.get).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("revokes an expired held cookie (issuedAt: 1) without deleting cookies during render", async () => {
    hold({ accessToken: "at-expired", refreshToken: "rt", issuedAt: 1 });
    expect(await pendingRecoveryEmail()).toBeNull();
    expect(signOut).toHaveBeenCalledWith("at-expired", "local");
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("revokes a held cookie with no issuedAt without deleting cookies during render", async () => {
    hold({ accessToken: "at-no-iat", refreshToken: "rt" }, "omit");
    expect(await pendingRecoveryEmail()).toBeNull();
    expect(signOut).toHaveBeenCalledWith("at-no-iat", "local");
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("revoke itself does not set or delete cookies", async () => {
    const deps = recoveryConfirmDeps();
    await deps.revoke({ accessToken: "at-revoke", refreshToken: "rt", issuedAt: 1 });
    expect(signOut).toHaveBeenCalledWith("at-revoke", "local");
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
