import { describe, expect, it } from "vitest";
import { confirmRecovery, handleAuthCallback, type CallbackDeps, type RecoveryConfirmDeps } from "@/lib/auth/callback";

function deps(over: Partial<CallbackDeps> = {}) {
  const calls: string[] = [];
  const d: CallbackDeps = {
    exchangeCode: async (code) => (calls.push(`exchange:${code}`), true),
    verifyRecovery: async (hash) => (calls.push(`verify:${hash}`), { accessToken: "at", refreshToken: "rt" }),
    holdRecovery: async (p) => void calls.push(`hold:${p.accessToken}/${p.refreshToken}`),
    ...over,
  };
  return { d, calls };
}
const run = (d: CallbackDeps, query: string) => handleAuthCallback(d, new URLSearchParams(query));

describe("auth callback: PKCE code only, except a confirmed recovery link (login CSRF)", () => {
  it("exchanges a PKCE code (same browser) and continues to a safe next path", async () => {
    const { d, calls } = deps();
    expect(await run(d, "code=c1&locale=es&next=%2Fes%2Faudits%2Fnew")).toBe("/es/audits/new");
    expect(calls).toEqual(["exchange:c1"]);
    expect(await run(d, "code=c1&locale=en&next=%2F%2Fevil.com")).toBe("/en/audits/new");
  });

  it("sends a PKCE recovery link to the reset page", async () => {
    const { d } = deps();
    expect(await run(d, "code=c1&locale=en&type=recovery&next=%2Fen%2Faudits")).toBe("/en/reset-password");
  });

  for (const type of ["magiclink", "email", "signup", "invite", "email_change"]) {
    it(`refuses token_hash for type=${type}: no session is opened`, async () => {
      const { d, calls } = deps();
      expect(await run(d, `token_hash=attacker&type=${type}&locale=en`)).toBe("/en/signin?status=expired");
      expect(calls).toEqual([]);
    });
  }

  it("verifies a recovery token_hash but only holds the session until the person confirms the account", async () => {
    const { d, calls } = deps();
    expect(await run(d, "token_hash=h1&type=recovery&locale=es")).toBe("/es/reset-password/confirm");
    expect(calls).toEqual(["verify:h1", "hold:at/rt"]);
  });

  it("an expired or bad link (code or recovery hash) goes back to sign-in", async () => {
    const bad = deps({ exchangeCode: async () => false, verifyRecovery: async () => null });
    expect(await run(bad.d, "code=x&locale=en")).toBe("/en/signin?status=expired");
    expect(await run(bad.d, "token_hash=x&type=recovery&locale=en")).toBe("/en/signin?status=expired");
    expect(await run(bad.d, "locale=xx")).toBe("/en/signin?status=expired");
  });
});

describe("recovery confirm step", () => {
  function confirmDeps(pending: { accessToken: string; refreshToken: string } | null) {
    const calls: string[] = [];
    const d: RecoveryConfirmDeps = {
      takePending: async () => (calls.push("take"), pending),
      setSession: async (p) => (calls.push(`session:${p.accessToken}`), true),
      revoke: async (p) => void calls.push(`revoke:${p.accessToken}`),
    };
    return { d, calls };
  }

  it("continue: sets the held session and opens the reset form", async () => {
    const { d, calls } = confirmDeps({ accessToken: "at", refreshToken: "rt" });
    expect(await confirmRecovery(d, { action: "continue", locale: "en" })).toBe("/en/reset-password");
    expect(calls).toEqual(["take", "session:at"]);
  });

  it("cancel: drops and revokes the held session without signing in", async () => {
    const { d, calls } = confirmDeps({ accessToken: "at", refreshToken: "rt" });
    expect(await confirmRecovery(d, { action: "cancel", locale: "es" })).toBe("/es/signin?status=recovery_cancelled");
    expect(calls).toEqual(["take", "revoke:at"]);
  });

  it("no held session: the link expired", async () => {
    const { d, calls } = confirmDeps(null);
    expect(await confirmRecovery(d, { action: "continue", locale: "en" })).toBe("/en/signin?status=expired");
    expect(calls).toEqual(["take"]);
  });
});

describe("held recovery session cookie value", () => {
  it("round-trips and rejects anything malformed", async () => {
    const { encodeHeld, decodeHeld } = await import("@/lib/auth/callback");
    expect(decodeHeld(encodeHeld({ accessToken: "a.b.c", refreshToken: "r1" }))).toEqual({ accessToken: "a.b.c", refreshToken: "r1" });
    for (const bad of [undefined, "", "%%%", btoa("{}"), btoa('{"accessToken":1,"refreshToken":"x"}')]) expect(decodeHeld(bad)).toBeNull();
  });
});
