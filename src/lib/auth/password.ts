import { safeNextPath } from "@/lib/auth/safe-next";
import type { Locale } from "@/lib/i18n/locales";
import type { RateLimitOutcome } from "@/lib/rate-limit";

/** Supabase Auth's default minimum is 6; we ask for 8 characters. bcrypt ignores bytes past 72, so the maximum is in UTF-8 bytes. */
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
  rateLimited: (subject: string) => Promise<RateLimitOutcome>;
  /** Per-email wrong-password limit (5 per 15 minutes by default): reserve before, forgive unless the password was wrong. */
  passwordFailures: { reserve(email: string): Promise<RateLimitOutcome>; forgive(email: string): Promise<void> };
  appUrl: string;
}

export type PasswordStatus = "error" | "weak" | "rate" | "unavailable" | "locked" | "invalid" | "unconfirmed" | "confirm";
export type PasswordResult = { kind: "redirect"; to: string } | { kind: "back"; status: PasswordStatus; next: string };

const validEmail = (email: string) => email.length <= 320 && EMAIL.test(email);
const utf8 = new TextEncoder();
const validPassword = (password: string) =>
  [...password].length >= PASSWORD_MIN_LENGTH && utf8.encode(password).length <= PASSWORD_MAX_LENGTH;

const limitStatus = (outcome: RateLimitOutcome) => (outcome === "limited" ? ("rate" as const) : ("unavailable" as const));

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
  const result = await deps.provider.signUp(email, input.password, callbackUrl(deps.appUrl, input.locale, next));
  return result === "signed_in" ? { kind: "redirect", to: next } : back(result);
}

export async function requestPasswordReset(
  deps: Deps,
  input: { email: string; locale: Locale },
): Promise<{ kind: "back"; status: "reset_sent" | "rate" | "unavailable" | "error" }> {
  const email = input.email.trim();
  if (!validEmail(email)) return { kind: "back", status: "error" };
  const limit = await deps.rateLimited(email.toLowerCase());
  if (limit !== "ok") return { kind: "back", status: limitStatus(limit) };
  try {
    await deps.provider.sendReset(email, callbackUrl(deps.appUrl, input.locale, `/${input.locale}/reset-password`));
  } catch (error) {
    console.error(JSON.stringify({ msg: "password reset email failed", error: String(error) }));
  }
  // Same answer whether or not the address has an account.
  return { kind: "back", status: "reset_sent" };
}

/** How a session was authenticated (Supabase `amr` claim): method and unix seconds. */
export type AuthMethod = { method: string; at: number };

/**
 * A password may be changed from a recovery session (the reset link) or within `recentSeconds` of any sign-in,
 * so a session left open on a shared computer can't be used to take over the account.
 */
export function mayChangePassword(methods: AuthMethod[], nowSeconds: number, recentSeconds: number): boolean {
  return methods.some((m) => m.method === "recovery" || nowSeconds - m.at <= recentSeconds);
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
