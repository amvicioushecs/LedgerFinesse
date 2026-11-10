import { describe, expect, it } from "vitest";
import { MemoryPasswordProvider } from "@/lib/auth/memory-password";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  mayChangePassword,
  passwordSignIn,
  requestPasswordReset,
  updatePassword,
  type PasswordAuthProvider,
} from "@/lib/auth/password";
import { SupabasePasswordProvider } from "@/lib/auth/supabase-password";

const APP = "https://app.test";

function fakeProvider(overrides: Partial<PasswordAuthProvider> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = <T,>(method: string, value: T) => async (...args: unknown[]) => {
    calls.push({ method, args });
    return value;
  };
  const provider: PasswordAuthProvider = {
    signIn: record("signIn", "ok" as const),
    signUp: record("signUp", "confirm" as const),
    sendReset: record("sendReset", undefined),
    updatePassword: record("updatePassword", "ok" as const),
    ...overrides,
  };
  return { provider, calls };
}

const notLimited = async () => false;
const noFailures = { reserve: async () => false, forgive: async () => {} };
const base = { email: "a@example.com", password: "correct horse", locale: "en" as const };

describe("passwordSignIn: per-email wrong-password limit", () => {
  function guard(locked = false) {
    const log: string[] = [];
    return { log, g: { reserve: async (e: string) => (log.push(`reserve:${e}`), locked), forgive: async (e: string) => void log.push(`forgive:${e}`) } };
  }
  const signIn = (provider: PasswordAuthProvider, passwordFailures: ReturnType<typeof guard>["g"]) =>
    passwordSignIn({ provider, rateLimited: notLimited, passwordFailures, appUrl: APP }, { ...base, email: "A@x.co", intent: "signin", next: "/en/audits" });

  it("a wrong password keeps its reserved failure", async () => {
    const { log, g } = guard();
    expect(await signIn(fakeProvider({ signIn: async () => "invalid" }).provider, g)).toEqual({ kind: "back", status: "invalid", next: "/en/audits" });
    expect(log).toEqual(["reserve:a@x.co"]);
  });

  for (const result of ["ok", "unconfirmed", "error"] as const) {
    it(`a sign-in that ends "${result}" is not counted as a failure`, async () => {
      const { log, g } = guard();
      await signIn(fakeProvider({ signIn: async () => result }).provider, g);
      expect(log).toEqual(["reserve:a@x.co", "forgive:a@x.co"]);
    });
  }

  it("over the limit: refused as locked without asking the provider", async () => {
    const { provider, calls } = fakeProvider();
    expect(await signIn(provider, guard(true).g)).toEqual({ kind: "back", status: "locked", next: "/en/audits" });
    expect(calls).toHaveLength(0);
  });

  it("sign-up does not touch the wrong-password counter", async () => {
    const { log, g } = guard();
    await passwordSignIn({ provider: fakeProvider().provider, rateLimited: notLimited, passwordFailures: g, appUrl: APP }, { ...base, intent: "signup", next: null });
    expect(log).toEqual([]);
  });
});

describe("passwordSignIn", () => {
  it("signs in and continues to a safe next path", async () => {
    const { provider, calls } = fakeProvider();
    expect(await passwordSignIn({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { ...base, intent: "signin", next: "/en/audits" }))
      .toEqual({ kind: "redirect", to: "/en/audits" });
    expect(calls).toEqual([{ method: "signIn", args: ["a@example.com", "correct horse"] }]);
  });

  it("uses safeNextPath: dot-segment and protocol-relative next paths fall back", async () => {
    const { provider } = fakeProvider();
    for (const next of ["/.//evil.com", "//evil.com", "https://evil.com", "/%2e%2e//evil.com"]) {
      expect(await passwordSignIn({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { ...base, intent: "signin", next }))
        .toEqual({ kind: "redirect", to: "/en/audits/new" });
    }
  });

  it("rate limits per email (lower-cased) before calling the provider, like the magic link", async () => {
    const { provider, calls } = fakeProvider();
    const subjects: string[] = [];
    const rateLimited = async (subject: string) => (subjects.push(subject), true);
    expect(await passwordSignIn({ provider, rateLimited, passwordFailures: noFailures, appUrl: APP }, { ...base, email: "A@Example.com", intent: "signin", next: "/en/audits" }))
      .toEqual({ kind: "back", status: "rate", next: "/en/audits" });
    expect(subjects).toEqual(["a@example.com"]);
    expect(calls).toHaveLength(0);
  });

  it("validates email and password length on the server", async () => {
    const { provider, calls } = fakeProvider();
    const run = (email: string, password: string) =>
      passwordSignIn({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { ...base, email, password, intent: "signup", next: "" });
    expect(await run("nope", "long enough pw")).toMatchObject({ kind: "back", status: "error" });
    expect(await run("a@example.com", "x".repeat(PASSWORD_MIN_LENGTH - 1))).toMatchObject({ kind: "back", status: "weak" });
    expect(await run("a@example.com", "x".repeat(PASSWORD_MAX_LENGTH + 1))).toMatchObject({ kind: "back", status: "weak" });
    expect(calls).toHaveLength(0);
  });

  it("measures the 72 limit in UTF-8 bytes (bcrypt's limit), not characters", async () => {
    const { provider, calls } = fakeProvider();
    const run = (password: string) =>
      passwordSignIn({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { ...base, password, intent: "signup", next: "" });
    // 37 two-byte characters = 74 bytes: too long, though only 37 characters.
    expect(await run("ñ".repeat(37))).toMatchObject({ kind: "back", status: "weak" });
    // 18 four-byte emoji = 72 bytes: allowed.
    expect(await run("🔑".repeat(18))).toMatchObject({ kind: "back", status: "confirm" });
    expect(calls).toHaveLength(1);
  });

  it("maps wrong credentials and unconfirmed accounts to their own statuses", async () => {
    for (const result of ["invalid", "unconfirmed", "error"] as const) {
      const { provider } = fakeProvider({ signIn: async () => result });
      expect(await passwordSignIn({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { ...base, intent: "signin", next: "/en/audits" }))
        .toEqual({ kind: "back", status: result, next: "/en/audits" });
    }
  });

  it("signs up with Supabase email confirmation: the link returns through /auth/callback to next", async () => {
    const { provider, calls } = fakeProvider();
    expect(await passwordSignIn({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { ...base, locale: "es", intent: "signup", next: "/es/audits/new" }))
      .toEqual({ kind: "back", status: "confirm", next: "/es/audits/new" });
    expect(calls[0]).toEqual({ method: "signUp", args: ["a@example.com", "correct horse", `${APP}/auth/callback?locale=es&next=%2Fes%2Faudits%2Fnew`] });
  });

  it("goes straight on when sign-up returns a session (confirmation disabled, or the local dev backend)", async () => {
    const { provider } = fakeProvider({ signUp: async () => "signed_in" });
    expect(await passwordSignIn({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { ...base, intent: "signup", next: "/en/audits" }))
      .toEqual({ kind: "redirect", to: "/en/audits" });
  });
});

describe("requestPasswordReset", () => {
  it("always reports the email as sent (no account enumeration) and returns via the callback to the reset page", async () => {
    const { provider, calls } = fakeProvider({ sendReset: async () => { throw new Error("no such user"); } });
    expect(await requestPasswordReset({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { email: "a@example.com", locale: "en" }))
      .toEqual({ kind: "back", status: "reset_sent" });
    const ok = fakeProvider();
    await requestPasswordReset({ provider: ok.provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { email: "a@example.com", locale: "en" });
    expect(ok.calls[0]).toEqual({ method: "sendReset", args: ["a@example.com", `${APP}/auth/callback?locale=en&next=%2Fen%2Freset-password`] });
    expect(calls).toHaveLength(0);
  });

  it("is rate limited per email and validates the address", async () => {
    const { provider, calls } = fakeProvider();
    expect(await requestPasswordReset({ provider, rateLimited: async () => true, passwordFailures: noFailures, appUrl: APP }, { email: "a@example.com", locale: "en" }))
      .toEqual({ kind: "back", status: "rate" });
    expect(await requestPasswordReset({ provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP }, { email: "bad", locale: "en" }))
      .toEqual({ kind: "back", status: "error" });
    expect(calls).toHaveLength(0);
  });
});

describe("updatePassword", () => {
  it("needs a signed-in (recovery) session, a valid password, and is rate limited per user", async () => {
    const { provider, calls } = fakeProvider();
    const deps = { provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP };
    const ok = { mayChange: true };
    expect(await updatePassword(deps, { userId: null, password: "new password", locale: "en", ...ok })).toEqual({ kind: "redirect", to: "/en/signin?status=expired" });
    expect(await updatePassword(deps, { userId: "u1", password: "short", locale: "en", ...ok })).toEqual({ kind: "back", status: "weak" });
    expect(await updatePassword({ ...deps, rateLimited: async () => true }, { userId: "u1", password: "new password", locale: "en", ...ok })).toEqual({ kind: "back", status: "rate" });
    expect(calls).toHaveLength(0);
    expect(await updatePassword(deps, { userId: "u1", password: "new password", locale: "en", ...ok })).toEqual({ kind: "redirect", to: "/en/audits?password=updated" });
    expect(calls).toEqual([{ method: "updatePassword", args: ["new password"] }]);
  });
});

describe("password change needs a recovery session or a recent sign-in", () => {
  const NOW = 1_800_000_000;
  const RECENT = 600;

  it("allows a recovery session, or any sign-in within the window", () => {
    expect(mayChangePassword([{ method: "recovery", at: NOW - 3000 }], NOW, RECENT)).toBe(true);
    expect(mayChangePassword([{ method: "password", at: NOW - 599 }], NOW, RECENT)).toBe(true);
    expect(mayChangePassword([{ method: "otp", at: NOW - 30 }], NOW, RECENT)).toBe(true);
  });

  it("refuses an older session that did not come from a reset link", () => {
    expect(mayChangePassword([{ method: "password", at: NOW - 601 }], NOW, RECENT)).toBe(false);
    expect(mayChangePassword([], NOW, RECENT)).toBe(false);
  });

  it("updatePassword sends an older session back to sign in again, then to the reset page", async () => {
    const { provider, calls } = fakeProvider();
    const deps = { provider, rateLimited: notLimited, passwordFailures: noFailures, appUrl: APP };
    expect(await updatePassword(deps, { userId: "u1", password: "new password", locale: "es", mayChange: false }))
      .toEqual({ kind: "redirect", to: "/es/signin?status=reauth&next=%2Fes%2Freset-password" });
    expect(calls).toHaveLength(0);
  });
});

describe("MemoryPasswordProvider (development only)", () => {
  it("stores a salted PBKDF2 hash, checks it, and does not reveal existing accounts on sign-up", async () => {
    const p = new MemoryPasswordProvider();
    expect(await p.signIn("a@example.com", "correct horse")).toBe("invalid");
    expect(await p.signUp("A@example.com", "correct horse")).toBe("signed_in");
    expect(JSON.stringify([...p.users.values()])).not.toContain("correct horse");
    expect(await p.signIn("a@example.com", "correct horse")).toBe("ok");
    expect(await p.signIn("a@example.com", "wrong horse")).toBe("invalid");
    expect(await p.signUp("a@example.com", "another one")).toBe("confirm");
    expect(await p.signIn("a@example.com", "correct horse")).toBe("ok");
    p.currentEmail = "a@example.com";
    expect(await p.updatePassword("brand new pw")).toBe("ok");
    expect(await p.signIn("a@example.com", "brand new pw")).toBe("ok");
  });
});

describe("SupabasePasswordProvider", () => {
  const auth = (result: { data?: unknown; error?: { code?: string; status?: number } | null }) => {
    const calls: { method: string; args: unknown[] }[] = [];
    const f = (method: string) => async (...args: unknown[]) => (calls.push({ method, args }), { data: result.data ?? {}, error: result.error ?? null });
    return { calls, client: { auth: { signInWithPassword: f("signInWithPassword"), signUp: f("signUp"), resetPasswordForEmail: f("resetPasswordForEmail"), updateUser: f("updateUser") } } };
  };

  it("maps Supabase Auth error codes", async () => {
    expect(await new SupabasePasswordProvider(auth({}).client).signIn("a@x.co", "pw")).toBe("ok");
    expect(await new SupabasePasswordProvider(auth({ error: { code: "invalid_credentials", status: 400 } }).client).signIn("a@x.co", "pw")).toBe("invalid");
    expect(await new SupabasePasswordProvider(auth({ error: { code: "email_not_confirmed", status: 400 } }).client).signIn("a@x.co", "pw")).toBe("unconfirmed");
    expect(await new SupabasePasswordProvider(auth({ error: { code: "unexpected_failure", status: 500 } }).client).signIn("a@x.co", "pw")).toBe("error");
    expect(await new SupabasePasswordProvider(auth({ error: { code: "weak_password", status: 422 } }).client).signUp("a@x.co", "pw", "r")).toBe("weak");
    expect(await new SupabasePasswordProvider(auth({ error: { code: "user_already_exists", status: 422 } }).client).signUp("a@x.co", "pw", "r")).toBe("confirm");
    expect(await new SupabasePasswordProvider(auth({ error: { code: "weak_password", status: 422 } }).client).updatePassword("pw")).toBe("weak");
  });

  it("signs up with the confirmation redirect and reports whether a session came back", async () => {
    const pending = auth({ data: { user: { id: "u" }, session: null } });
    expect(await new SupabasePasswordProvider(pending.client).signUp("a@x.co", "pw", "https://app.test/auth/callback")).toBe("confirm");
    expect(pending.calls[0]).toEqual({ method: "signUp", args: [{ email: "a@x.co", password: "pw", options: { emailRedirectTo: "https://app.test/auth/callback" } }] });
    expect(await new SupabasePasswordProvider(auth({ data: { user: { id: "u" }, session: { access_token: "t" } } }).client).signUp("a@x.co", "pw", "r")).toBe("signed_in");
  });

  it("sends the reset email with the redirect", async () => {
    const a = auth({});
    await new SupabasePasswordProvider(a.client).sendReset("a@x.co", "https://app.test/auth/callback?next=%2Fen%2Freset-password");
    expect(a.calls[0]).toEqual({ method: "resetPasswordForEmail", args: ["a@x.co", { redirectTo: "https://app.test/auth/callback?next=%2Fen%2Freset-password" }] });
  });
});
