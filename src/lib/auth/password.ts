import { safeNextPath } from "@/lib/auth/safe-next";
import type { Locale } from "@/lib/i18n/locales";

/** Supabase Auth's default minimum is 6; we ask for 8. bcrypt ignores bytes past 72. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email + password auth (Supabase Auth in deployed envs, an in-memory store in development). */
export interface PasswordAuthProvider {
  signIn(email: string, password: string): Promise<"ok" | "invalid" | "unconfirmed" | "error">;
  /** "confirm": Supabase sent a confirmation email (also returned for an existing address, so accounts aren't revealed). */
  signUp(email: string, password: string, confirmRedirectTo: string): Promise<"signed_in" | "confirm" | "weak" | "error">;
  sendReset(email: string, redirectTo: string): Promise<void>;
  /** Sets a new password for the signed-in (recovery) session. */
  updatePassword(password: string): Promise<"ok" | "weak" | "error">;
}

interface Deps {
  provider: PasswordAuthProvider;
  /** Same limiter and keys as the magic link: "signin" action, per IP and per subject. */
  rateLimited: (subject: string) => Promise<boolean>;
  /** Per-email wrong-password limit (5 per 15 minutes by default): reserve before, forgive unless the password was wrong. */
  passwordFailures: { reserve(email: string): Promise<boolean>; forgive(email: string): Promise<void> };
  appUrl: string;
}

export type PasswordStatus = "error" | "weak" | "rate" | "locked" | "invalid" | "unconfirmed" | "confirm";
export type PasswordResult = { kind: "redirect"; to: string } | { kind: "back"; status: PasswordStatus; next: string };

const validEmail = (email: string) => email.length <= 320 && EMAIL.test(email);
const validPassword = (password: string) => password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;

/** Supabase email links land on /auth/callback, which exchanges the code and continues to `next` (re-checked there). */
function callbackUrl(appUrl: string, locale: Locale, next: string): string {
  const url = new URL("/auth/callback", appUrl);
  url.searchParams.set("locale", locale);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function passwordSignIn(
  deps: Deps,
  input: { intent: "signin" | "signup"; email: string; password: string; next: string | null; locale: Locale },
): Promise<PasswordResult> {
  const next = safeNextPath(input.next, input.locale);
  const email = input.email.trim();
  const back = (status: PasswordStatus): PasswordResult => ({ kind: "back", status, next });
  if (!validEmail(email)) return back("error");
  if (!validPassword(input.password)) return back(input.intent === "signup" ? "weak" : "invalid");
  if (await deps.rateLimited(email.toLowerCase())) return back("rate");

  if (input.intent === "signin") {
    const subject = email.toLowerCase();
    if (await deps.passwordFailures.reserve(subject)) return back("locked");
    const result = await deps.provider.signIn(email, input.password);
    if (result !== "invalid") await deps.passwordFailures.forgive(subject);
    return result === "ok" ? { kind: "redirect", to: next } : back(result);
  }
  const result = await deps.provider.signUp(email, input.password, callbackUrl(deps.appUrl, input.locale, next));
  return result === "signed_in" ? { kind: "redirect", to: next } : back(result);
}

export async function requestPasswordReset(
  deps: Deps,
  input: { email: string; locale: Locale },
): Promise<{ kind: "back"; status: "reset_sent" | "rate" | "error" }> {
  const email = input.email.trim();
  if (!validEmail(email)) return { kind: "back", status: "error" };
  if (await deps.rateLimited(email.toLowerCase())) return { kind: "back", status: "rate" };
  try {
    await deps.provider.sendReset(email, callbackUrl(deps.appUrl, input.locale, `/${input.locale}/reset-password`));
  } catch (error) {
    console.error(JSON.stringify({ msg: "password reset email failed", error: String(error) }));
  }
  // Same answer whether or not the address has an account.
  return { kind: "back", status: "reset_sent" };
}

export async function updatePassword(
  deps: Deps,
  input: { userId: string | null; password: string; locale: Locale },
): Promise<{ kind: "redirect"; to: string } | { kind: "back"; status: "weak" | "rate" | "error" }> {
  if (!input.userId) return { kind: "redirect", to: `/${input.locale}/signin?status=expired` };
  if (!validPassword(input.password)) return { kind: "back", status: "weak" };
  if (await deps.rateLimited(input.userId)) return { kind: "back", status: "rate" };
  const result = await deps.provider.updatePassword(input.password);
  return result === "ok" ? { kind: "redirect", to: `/${input.locale}/audits?password=updated` } : { kind: "back", status: result };
}
