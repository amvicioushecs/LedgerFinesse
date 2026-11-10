import { beforeEach, describe, expect, it } from "vitest";
import { NeonPasswordProvider, fromSdkError, resetWithCode, startCodeSignIn, verifyCode, type NeonAuthApi, type NeonAuthResult, type PendingStore } from "@/lib/auth/neon-auth";
import type { PendingCode } from "@/lib/auth/pending-code";
import type { PasswordAuthProvider } from "@/lib/auth/password";
import type { RateLimitOutcome } from "@/lib/rate-limit";

const ok: NeonAuthResult = { ok: true };
const fail = (code: string): NeonAuthResult => ({ ok: false, code });

class FakeApi implements NeonAuthApi {
  calls: string[] = [];
  results: Partial<Record<keyof NeonAuthApi, NeonAuthResult>> = {};
  private r(name: keyof NeonAuthApi, detail: string) { this.calls.push(`${name}:${detail}`); return Promise.resolve(this.results[name] ?? ok); }
  signInEmail(email: string) { return this.r("signInEmail", email); }
  signUpEmail(email: string) { return this.r("signUpEmail", email); }
  sendOtp(email: string, type: string) { return this.r("sendOtp", `${type}:${email}`); }
  signInOtp(email: string, otp: string) { return this.r("signInOtp", `${email}:${otp}`); }
  verifyEmailOtp(email: string, otp: string) { return this.r("verifyEmailOtp", `${email}:${otp}`); }
  resetPasswordOtp(email: string, otp: string) { return this.r("resetPasswordOtp", `${email}:${otp}`); }
}
class FakePending implements PendingStore {
  value: PendingCode | null = null;
  async set(p: PendingCode) { this.value = p; }
  async get() { return this.value; }
  async clear() { this.value = null; }
}
function failures(outcome: RateLimitOutcome = "ok") {
  const log: string[] = [];
  return { log, guard: { reserve: async (e: string) => (log.push(`reserve:${e}`), outcome), forgive: async (e: string) => { log.push(`forgive:${e}`); } } };
}

let api: FakeApi;
let pending: FakePending;
beforeEach(() => { api = new FakeApi(); pending = new FakePending(); });

describe("email code sign-in (replaces the magic link: same-browser completion)", () => {
  it("sends a sign-in code and remembers the email only in this browser", async () => {
    expect(await startCodeSignIn({ api, pending }, "A@Example.com")).toBe("code_sent");
    expect(api.calls).toEqual(["sendOtp:sign-in:a@example.com"]);
    expect(pending.value).toEqual({ purpose: "signin", email: "a@example.com" });
  });

  it("verifies against the email in the signed cookie, never one from the form, then follows a safe next path", async () => {
    await pending.set({ purpose: "signin", email: "a@example.com" });
    const f = failures();
    expect(await verifyCode({ api, pending, failures: f.guard }, { code: "123456", next: "https://evil.example/x", locale: "en" })).toEqual({ kind: "redirect", to: "/en/audits/new" });
    expect(api.calls).toEqual(["signInOtp:a@example.com:123456"]);
    expect(pending.value).toBeNull();
    expect(f.log).toEqual(["reserve:a@example.com", "forgive:a@example.com"]);
  });

  it("refuses a code in a browser that never asked for one (login CSRF), without calling Neon Auth", async () => {
    expect(await verifyCode({ api, pending, failures: failures().guard }, { code: "123456", next: null, locale: "es" })).toEqual({ kind: "back", status: "expired" });
    expect(api.calls).toEqual([]);
  });

  it("counts a wrong code as a failure and keeps the pending sign-in for another try", async () => {
    await pending.set({ purpose: "signin", email: "a@example.com" });
    api.results.signInOtp = fail("INVALID_OTP");
    const f = failures();
    expect(await verifyCode({ api, pending, failures: f.guard }, { code: "000000", next: null, locale: "en" })).toEqual({ kind: "back", status: "code_invalid" });
    expect(f.log).toEqual(["reserve:a@example.com"]);
    expect(pending.value).not.toBeNull();
  });

  it("drops the pending sign-in once Neon Auth burns the code (too many attempts or expired)", async () => {
    for (const code of ["TOO_MANY_ATTEMPTS", "OTP_EXPIRED"]) {
      await pending.set({ purpose: "signin", email: "a@example.com" });
      api.results.signInOtp = fail(code);
      expect(await verifyCode({ api, pending, failures: failures().guard }, { code: "000000", next: null, locale: "en" })).toEqual({ kind: "back", status: "expired" });
      expect(pending.value).toBeNull();
    }
  });

  it("rejects malformed codes before any call, and stops at the per-email failure limit", async () => {
    await pending.set({ purpose: "signin", email: "a@example.com" });
    expect(await verifyCode({ api, pending, failures: failures().guard }, { code: "12ab", next: null, locale: "en" })).toEqual({ kind: "back", status: "code_invalid" });
    expect(await verifyCode({ api, pending, failures: failures("limited").guard }, { code: "123456", next: null, locale: "en" })).toEqual({ kind: "back", status: "locked" });
    expect(await verifyCode({ api, pending, failures: failures("unavailable").guard }, { code: "123456", next: null, locale: "en" })).toEqual({ kind: "back", status: "unavailable" });
    expect(api.calls).toEqual([]);
  });

  it("confirms the email for a verify code (Neon Auth signs the user in after verification)", async () => {
    await pending.set({ purpose: "verify", email: "a@example.com" });
    expect(await verifyCode({ api, pending, failures: failures().guard }, { code: "654321", next: "/es/audits", locale: "es" })).toEqual({ kind: "redirect", to: "/es/audits" });
    expect(api.calls).toEqual(["verifyEmailOtp:a@example.com:654321"]);
  });

  it("never completes a reset code through the sign-in form", async () => {
    await pending.set({ purpose: "reset", email: "a@example.com" });
    expect(await verifyCode({ api, pending, failures: failures().guard }, { code: "123456", next: null, locale: "en" })).toEqual({ kind: "back", status: "expired" });
    expect(api.calls).toEqual([]);
  });
});

describe("NeonPasswordProvider", () => {
  it("maps sign-in results; an unverified account gets a fresh verify code in this browser", async () => {
    const provider: PasswordAuthProvider = new NeonPasswordProvider(api, pending);
    expect(await provider.signIn("a@example.com", "pw")).toBe("ok");
    api.results.signInEmail = fail("INVALID_EMAIL_OR_PASSWORD");
    expect(await provider.signIn("a@example.com", "pw")).toBe("invalid");
    api.results.signInEmail = fail("EMAIL_NOT_VERIFIED");
    expect(await provider.signIn("A@example.com", "pw")).toBe("unconfirmed");
    expect(api.calls.at(-1)).toBe("sendOtp:email-verification:a@example.com");
    expect(pending.value).toEqual({ purpose: "verify", email: "a@example.com" });
    api.results.signInEmail = fail("SOMETHING_ELSE");
    expect(await provider.signIn("a@example.com", "pw")).toBe("error");
  });

  it("answers an existing address exactly like a new sign-up (no account enumeration)", async () => {
    const provider: PasswordAuthProvider = new NeonPasswordProvider(api, pending);
    expect(await provider.signUp("new@example.com", "pw")).toBe("confirm");
    expect(api.calls).toEqual(["signUpEmail:new@example.com", "sendOtp:email-verification:new@example.com"]);
    const fresh = { ...pending.value };
    for (const code of ["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"]) {
      api.results.signUpEmail = fail(code);
      await pending.clear();
      expect(await provider.signUp("new@example.com", "pw")).toBe("confirm");
      expect(pending.value).toEqual(fresh);
    }
    api.results.signUpEmail = fail("PASSWORD_TOO_SHORT");
    expect(await provider.signUp("x@example.com", "pw")).toBe("weak");
  });

  it("sends a reset code and binds it to this browser, whether or not the account exists", async () => {
    const provider: PasswordAuthProvider = new NeonPasswordProvider(api, pending);
    await provider.sendReset("A@example.com");
    expect(api.calls).toEqual(["sendOtp:forget-password:a@example.com"]);
    expect(pending.value).toEqual({ purpose: "reset", email: "a@example.com" });
  });

  it("does not offer a session password change (Neon Auth resets with a code instead)", async () => {
    expect(await (new NeonPasswordProvider(api, pending) as PasswordAuthProvider).updatePassword("whatever-123")).toBe("error");
    expect(api.calls).toEqual([]);
  });
});

describe("resetWithCode (the recovery path: code from the email + new password, in the browser that asked)", () => {
  const deps = (outcome: RateLimitOutcome = "ok", leaked = false) => ({ api, pending, failures: failures(outcome).guard, leakedPassword: async () => leaked });

  it("resets with the pending email and sends the user to sign in", async () => {
    await pending.set({ purpose: "reset", email: "a@example.com" });
    expect(await resetWithCode(deps(), { code: "123456", password: "a-new-password", locale: "es" })).toEqual({ kind: "redirect", to: "/es/signin?status=password_reset" });
    expect(api.calls).toEqual(["resetPasswordOtp:a@example.com:123456"]);
    expect(pending.value).toBeNull();
  });

  it("refuses without a pending reset in this browser, or with a sign-in code", async () => {
    expect(await resetWithCode(deps(), { code: "123456", password: "a-new-password", locale: "en" })).toEqual({ kind: "back", status: "expired" });
    await pending.set({ purpose: "signin", email: "a@example.com" });
    expect(await resetWithCode(deps(), { code: "123456", password: "a-new-password", locale: "en" })).toEqual({ kind: "back", status: "expired" });
    expect(api.calls).toEqual([]);
  });

  it("checks length (72 UTF-8 bytes max) and leaked passwords before spending the code", async () => {
    await pending.set({ purpose: "reset", email: "a@example.com" });
    expect(await resetWithCode(deps(), { code: "123456", password: "short", locale: "en" })).toEqual({ kind: "back", status: "weak" });
    expect(await resetWithCode(deps(), { code: "123456", password: "é".repeat(37), locale: "en" })).toEqual({ kind: "back", status: "weak" });
    expect(await resetWithCode(deps("ok", true), { code: "123456", password: "password123", locale: "en" })).toEqual({ kind: "back", status: "leaked" });
    expect(api.calls).toEqual([]);
  });

  it("counts wrong codes against the per-email limit", async () => {
    await pending.set({ purpose: "reset", email: "a@example.com" });
    api.results.resetPasswordOtp = fail("INVALID_OTP");
    expect(await resetWithCode(deps(), { code: "000000", password: "a-new-password", locale: "en" })).toEqual({ kind: "back", status: "code_invalid" });
    expect(await resetWithCode(deps("limited"), { code: "000000", password: "a-new-password", locale: "en" })).toEqual({ kind: "back", status: "locked" });
  });
});

describe("fromSdkError (the SDK reports Supabase-compatible codes; map back to Better Auth's)", () => {
  it("maps credential and account errors", () => {
    expect(fromSdkError({ code: "invalid_credentials", status: 401, message: "Invalid email or password" }, "password")).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(fromSdkError({ code: "email_not_confirmed", status: 422, message: "Email verification required" }, "password")).toBe("EMAIL_NOT_VERIFIED");
    expect(fromSdkError({ code: "user_already_exists", status: 409, message: "User already exists" }, "password")).toBe("USER_ALREADY_EXISTS");
    expect(fromSdkError({ code: "weak_password", status: 400, message: "Password is too short" }, "password")).toBe("PASSWORD_TOO_SHORT");
  });

  it("maps code errors by status and message (Neon Auth: INVALID_OTP 400, TOO_MANY_ATTEMPTS 403, OTP_EXPIRED 400)", () => {
    expect(fromSdkError({ code: "validation_failed", status: 400, message: "Invalid OTP" }, "otp")).toBe("INVALID_OTP");
    expect(fromSdkError({ code: "feature_not_supported", status: 403, message: "Too many attempts" }, "otp")).toBe("TOO_MANY_ATTEMPTS");
    expect(fromSdkError({ code: "validation_failed", status: 400, message: "OTP expired" }, "otp")).toBe("OTP_EXPIRED");
  });

  it("keeps anything else as an unexpected error, never as a wrong password or code", () => {
    expect(fromSdkError({ code: "NETWORK_TIMEOUT", status: 502, message: "timeout" }, "password")).toBe("NETWORK_TIMEOUT");
    expect(fromSdkError({ code: "unexpected_failure", status: 500, message: "boom" }, "otp")).toBe("unexpected_failure");
    expect(fromSdkError({ status: 0 }, "otp")).toBe("HTTP_0");
  });
});
