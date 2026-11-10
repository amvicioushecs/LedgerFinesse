import { safeNextPath } from "@/lib/auth/safe-next";
import type { Locale } from "@/lib/i18n/locales";
import type { RateLimitOutcome } from "@/lib/rate-limit";

/** We ask for 8 characters. Hashes like bcrypt ignore bytes past 72, so the maximum is in UTF-8 bytes. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email + password auth (Neon Auth in deployed envs, an in-memory store in development). */
export interface PasswordAuthProvider {
  signIn(email: string, password: string): Promise<"ok" | "invalid" | "unconfirmed" | "error">;
  /** "confirm": a confirmation code was emailed (also returned for an existing address, so accounts aren't revealed). */
  signUp(email: string, password: string): Promise<"signed_in" | "confirm" | "weak" | "error">;
  sendReset(email: string): Promise<void>;
  /** Sets a new password for the signed-in session. */
  updatePassword(password: string): Promise<"ok" | "weak" | "error">;
}

interface Deps {
  provider: PasswordAuthProvider;
  /** Same limiter and keys as email-code sign-in: "signin" action, per IP and per subject. */
  rateLimited: (subject: string) => Promise<RateLimitOutcome>;
  /** Per-email wrong-password limit (5 per 15 minutes by default): reserve before, forgive unless the password was wrong. */
  passwordFailures: { reserve(email: string): Promise<RateLimitOutcome>; forgive(email: string): Promise<void> };
  /** Breach-data check on new passwords (Neon backend: HIBP range API). Omitted: no check. */
  leakedPassword?: (password: string) => Promise<boolean>;
}

export type PasswordStatus = "error" | "weak" | "leaked" | "rate" | "unavailable" | "locked" | "invalid" | "unconfirmed" | "confirm";
export type PasswordResult = { kind: "redirect"; to: string } | { kind: "back"; status: PasswordStatus; next: string };

const validEmail = (email: string) => email.length <= 320 && EMAIL.test(email);
const utf8 = new TextEncoder();
export const validPassword = (password: string) =>
  [...password].length >= PASSWORD_MIN_LENGTH && utf8.encode(password).length <= PASSWORD_MAX_LENGTH;

const limitStatus = (outcome: RateLimitOutcome) => (outcome === "limited" ? ("rate" as const) : ("unavailable" as const));

export async function passwordSignIn(
  deps: Deps,
  input: { intent: "signin" | "signup"; email: string; password: string; next: string | null; locale: Locale },
): Promise<PasswordResult> {
  const next = safeNextPath(input.next, input.locale);
  const email = input.email.trim();
  const back = (status: PasswordStatus): PasswordResult => ({ kind: "back", status, next });
  if (!validEmail(email)) return back("error");
  if (!validPassword(input.password)) return back(input.intent === "signup" ? "weak" : "invalid");
  const limit = await deps.rateLimited(email.toLowerCase());
  if (limit !== "ok") return back(limitStatus(limit));

  if (input.intent === "signin") {
    const subject = email.toLowerCase();
    const failures = await deps.passwordFailures.reserve(subject);
    if (failures !== "ok") return back(failures === "limited" ? "locked" : "unavailable");
    const result = await deps.provider.signIn(email, input.password);
    if (result !== "invalid") await deps.passwordFailures.forgive(subject);
    return result === "ok" ? { kind: "redirect", to: next } : back(result);
  }
  if (await deps.leakedPassword?.(input.password)) return back("leaked");
  const result = await deps.provider.signUp(email, input.password);
  return result === "signed_in" ? { kind: "redirect", to: next } : back(result);
}

export async function requestPasswordReset(
  deps: Deps,
  input: { email: string },
): Promise<{ kind: "back"; status: "reset_sent" | "rate" | "unavailable" | "error" }> {
  const email = input.email.trim();
  if (!validEmail(email)) return { kind: "back", status: "error" };
  const limit = await deps.rateLimited(email.toLowerCase());
  if (limit !== "ok") return { kind: "back", status: limitStatus(limit) };
  try {
    await deps.provider.sendReset(email);
  } catch (error) {
    console.error(JSON.stringify({ msg: "password reset email failed", error: String(error) }));
  }
  // Same answer whether or not the address has an account.
  return { kind: "back", status: "reset_sent" };
}

/** How and when (unix seconds) a session was authenticated. */
export type AuthMethod = { method: string; at: number };

/**
 * A password may be changed within `recentSeconds` of a sign-in. Method names are ignored (time only, no
 * recovery exemption), so a session left open on a shared computer can't be used to take over the account.
 */
export function mayChangePassword(methods: AuthMethod[], nowSeconds: number, recentSeconds: number): boolean {
  return methods.some((m) => nowSeconds - m.at <= recentSeconds);
}

export async function updatePassword(
  deps: Deps,
  input: { userId: string | null; password: string; locale: Locale; mayChange: boolean },
): Promise<{ kind: "redirect"; to: string } | { kind: "back"; status: "weak" | "rate" | "unavailable" | "error" }> {
  if (!input.userId) return { kind: "redirect", to: `/${input.locale}/signin?status=expired` };
  if (!input.mayChange) {
    return { kind: "redirect", to: `/${input.locale}/signin?status=reauth&next=${encodeURIComponent(`/${input.locale}/reset-password`)}` };
  }
  if (!validPassword(input.password)) return { kind: "back", status: "weak" };
  const limit = await deps.rateLimited(input.userId);
  if (limit !== "ok") return { kind: "back", status: limitStatus(limit) };
  const result = await deps.provider.updatePassword(input.password);
  return result === "ok" ? { kind: "redirect", to: `/${input.locale}/audits?password=updated` } : { kind: "back", status: result };
}
