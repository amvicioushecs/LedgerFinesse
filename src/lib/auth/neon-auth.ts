import { safeNextPath } from "@/lib/auth/safe-next";
import type { PendingCode } from "@/lib/auth/pending-code";
import { validPassword, type PasswordAuthProvider } from "@/lib/auth/password";
import type { Locale } from "@/lib/i18n/locales";
import type { RateLimitOutcome } from "@/lib/rate-limit";

/**
 * Neon Auth (Managed Better Auth) flows. Every call runs on this server (the Neon Auth URL is never sent to the
 * browser and no /api/auth proxy is mounted), so this app's rate limits apply to all of them. Shared SMTP sends
 * codes, not links, so the magic link becomes an emailed 6-digit code, completed only in the browser holding the
 * signed pending-code cookie.
 */
export type NeonAuthResult = { ok: true } | { ok: false; code: string };
export type OtpType = "sign-in" | "email-verification" | "forget-password";

export interface NeonAuthApi {
  signInEmail(email: string, password: string): Promise<NeonAuthResult>;
  signUpEmail(email: string, password: string): Promise<NeonAuthResult>;
  sendOtp(email: string, type: OtpType): Promise<NeonAuthResult>;
  signInOtp(email: string, otp: string): Promise<NeonAuthResult>;
  /** Neon Auth signs the user in after verification (auto_sign_in_after_verification). */
  verifyEmailOtp(email: string, otp: string): Promise<NeonAuthResult>;
  resetPasswordOtp(email: string, otp: string, password: string): Promise<NeonAuthResult>;
}

export interface PendingStore {
  set(pending: PendingCode): Promise<void>;
  get(): Promise<PendingCode | null>;
  clear(): Promise<void>;
}

type FailureGuard = { reserve(email: string): Promise<RateLimitOutcome>; forgive(email: string): Promise<void> };

const normal = (email: string) => email.trim().toLowerCase();
const CODE = /^\d{6}$/;
const BURNED = new Set(["TOO_MANY_ATTEMPTS", "OTP_EXPIRED"]);
const log = (msg: string, code: string) => console.error(JSON.stringify({ msg, code }));

export async function startCodeSignIn(deps: { api: NeonAuthApi; pending: PendingStore }, email: string): Promise<"code_sent" | "error"> {
  const address = normal(email);
  const sent = await deps.api.sendOtp(address, "sign-in");
  if (!sent.ok) {
    log("sign-in code failed", sent.code);
    return "error";
  }
  await deps.pending.set({ purpose: "signin", email: address });
  return "code_sent";
}

export type CodeStatus = "code_invalid" | "expired" | "locked" | "unavailable" | "error";

/** Shared by sign-in, verify and reset: per-email failure limit, then the Neon Auth call; only wrong codes count. */
async function spendCode(
  deps: { pending: PendingStore; failures: FailureGuard },
  pending: PendingCode,
  code: string,
  call: () => Promise<NeonAuthResult>,
): Promise<{ ok: true } | { ok: false; status: CodeStatus }> {
  if (!CODE.test(code)) return { ok: false, status: "code_invalid" };
  const reserved = await deps.failures.reserve(pending.email);
  if (reserved !== "ok") return { ok: false, status: reserved === "limited" ? "locked" : "unavailable" };
  const result = await call();
  if (result.ok) {
    await deps.failures.forgive(pending.email);
    await deps.pending.clear();
    return { ok: true };
  }
  if (result.code === "INVALID_OTP") return { ok: false, status: "code_invalid" };
  await deps.failures.forgive(pending.email);
  if (BURNED.has(result.code)) {
    await deps.pending.clear();
    return { ok: false, status: "expired" };
  }
  log("code check failed", result.code);
  return { ok: false, status: "error" };
}

export async function verifyCode(
  deps: { api: NeonAuthApi; pending: PendingStore; failures: FailureGuard },
  input: { code: string; next: string | null; locale: Locale },
): Promise<{ kind: "redirect"; to: string } | { kind: "back"; status: CodeStatus }> {
  const pending = await deps.pending.get();
  if (!pending || pending.purpose === "reset") return { kind: "back", status: "expired" };
  const code = input.code.trim();
  const spent = await spendCode(deps, pending, code, () =>
    pending.purpose === "signin" ? deps.api.signInOtp(pending.email, code) : deps.api.verifyEmailOtp(pending.email, code));
  return spent.ok ? { kind: "redirect", to: safeNextPath(input.next, input.locale) } : { kind: "back", status: spent.status };
}

export async function resetWithCode(
  deps: { api: NeonAuthApi; pending: PendingStore; failures: FailureGuard; leakedPassword: (password: string) => Promise<boolean> },
  input: { code: string; password: string; locale: Locale },
): Promise<{ kind: "redirect"; to: string } | { kind: "back"; status: CodeStatus | "weak" | "leaked" }> {
  const pending = await deps.pending.get();
  if (!pending || pending.purpose !== "reset") return { kind: "back", status: "expired" };
  if (!validPassword(input.password)) return { kind: "back", status: "weak" };
  if (await deps.leakedPassword(input.password)) return { kind: "back", status: "leaked" };
  const code = input.code.trim();
  const spent = await spendCode(deps, pending, code, () => deps.api.resetPasswordOtp(pending.email, code, input.password));
  return spent.ok ? { kind: "redirect", to: `/${input.locale}/signin?status=password_reset` } : { kind: "back", status: spent.status };
}

const EXISTS = new Set(["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"]);
const WEAK = new Set(["PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"]);

export class NeonPasswordProvider implements PasswordAuthProvider {
  constructor(private readonly api: NeonAuthApi, private readonly pending: PendingStore) {}

  async signIn(email: string, password: string) {
    const result = await this.api.signInEmail(email.trim(), password);
    if (result.ok) return "ok" as const;
    if (result.code === "INVALID_EMAIL_OR_PASSWORD") return "invalid" as const;
    if (result.code === "EMAIL_NOT_VERIFIED") {
      await this.sendVerify(email);
      return "unconfirmed" as const;
    }
    log("password sign-in failed", result.code);
    return "error" as const;
  }

  /** "confirm" for new and existing addresses alike; only a new account gets a code (from Neon Auth). */
  async signUp(email: string, password: string) {
    const result = await this.api.signUpEmail(email.trim(), password);
    if (!result.ok && WEAK.has(result.code)) return "weak" as const;
    if (!result.ok && !EXISTS.has(result.code)) {
      log("password sign-up failed", result.code);
      return "error" as const;
    }
    if (result.ok) await this.sendVerify(email);
    else await this.pending.set({ purpose: "verify", email: normal(email) });
    return "confirm" as const;
  }

  async sendReset(email: string) {
    const address = normal(email);
    const sent = await this.api.sendOtp(address, "forget-password");
    if (!sent.ok) log("reset code failed", sent.code);
    await this.pending.set({ purpose: "reset", email: address });
  }

  /** Neon Auth changes a password only through the emailed reset code (resetWithCode). */
  async updatePassword() {
    return "error" as const;
  }

  private async sendVerify(email: string) {
    const address = normal(email);
    const sent = await this.api.sendOtp(address, "email-verification");
    if (!sent.ok) log("verification code failed", sent.code);
    await this.pending.set({ purpose: "verify", email: address });
  }
}

/**
 * @neondatabase/auth (0.7.0-beta) rewrites Better Auth errors into its own Supabase-compatible codes and loses the OTP ones
 * (INVALID_OTP and OTP_EXPIRED become validation_failed, TOO_MANY_ATTEMPTS becomes feature_not_supported). Map back,
 * using the status and message for codes. Anything unrecognized stays unexpected (never "wrong password/code").
 */
const FROM_SDK: Record<string, string> = {
  invalid_credentials: "INVALID_EMAIL_OR_PASSWORD",
  email_not_confirmed: "EMAIL_NOT_VERIFIED",
  user_already_exists: "USER_ALREADY_EXISTS",
  email_exists: "USER_ALREADY_EXISTS",
  weak_password: "PASSWORD_TOO_SHORT",
};
export function fromSdkError(error: { code?: string; status?: number; message?: string }, kind: "password" | "otp"): string {
  const message = (error.message ?? "").toLowerCase();
  if (kind === "otp") {
    if (error.status === 403 && message.includes("too many")) return "TOO_MANY_ATTEMPTS";
    if (error.status === 400 && message.includes("expired")) return "OTP_EXPIRED";
    if (error.status === 400 && message.includes("invalid otp")) return "INVALID_OTP";
  } else if (error.code && FROM_SDK[error.code]) {
    return FROM_SDK[error.code];
  }
  return error.code || `HTTP_${error.status ?? 0}`;
}
