import { safeNextPath } from "@/lib/auth/safe-next";
import { isLocale, type Locale } from "@/lib/i18n/locales";

export interface HeldSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds when the session was held; missing on a malformed cookie is treated as already expired. */
  issuedAt?: number;
}

export interface CallbackDeps {
  /** PKCE: needs the code verifier cookie set in the browser that asked for the email. */
  exchangeCode(code: string): Promise<boolean>;
  /** Verifies a recovery token_hash WITHOUT writing session cookies. */
  verifyRecovery(tokenHash: string): Promise<HeldSession | null>;
  /** Keeps the verified recovery session aside (httpOnly cookie) until the person confirms the account. */
  holdRecovery(session: HeldSession): Promise<void>;
}

const localeOf = (value: string | null): Locale => (value && isLocale(value) ? value : "en");
const expired = (locale: Locale) => `/${locale}/signin?status=expired`;
const confirmedSignIn = (locale: Locale) => `/${locale}/signin?status=confirmed_signin`;

/** PKCE recovery is identified by type=recovery, or by next pointing at the reset page (Supabase's PKCE redirect does not add type). */
function isRecoveryLink(params: URLSearchParams, locale: Locale): boolean {
  if (params.get("type") === "recovery") return true;
  return safeNextPath(params.get("next"), locale) === `/${locale}/reset-password`;
}

/**
 * Landing for auth email links. Returns the path to redirect to.
 *
 * Login CSRF: a token_hash link opens a session in ANY browser, so an attacker could send someone a link for the
 * attacker's own account and sign them into it. So magic link, sign-up confirmation and email change are PKCE only
 * (`code`, which only the browser that asked for the email can exchange). The one token_hash link accepted is a
 * password-recovery link, and its session is only held until the person confirms "Continue as <email>?".
 */
export async function handleAuthCallback(deps: CallbackDeps, params: URLSearchParams): Promise<string> {
  const locale = localeOf(params.get("locale"));
  const type = params.get("type");
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  // error_code (e.g. otp_expired) is on the redirect when Supabase itself rejected the link. A `code` with no
  // error means verify already succeeded: exchange failing is usually a missing PKCE verifier (other device).
  if (params.get("error_code") || params.get("error")) return expired(locale);
  if (code) {
    if (!(await deps.exchangeCode(code))) {
      return isRecoveryLink(params, locale) ? expired(locale) : confirmedSignIn(locale);
    }
    return type === "recovery" ? `/${locale}/reset-password` : safeNextPath(params.get("next"), locale);
  }
  if (tokenHash && type === "recovery") {
    const session = await deps.verifyRecovery(tokenHash);
    if (!session) return expired(locale);
    await deps.holdRecovery(session);
    return `/${locale}/reset-password/confirm`;
  }
  return expired(locale);
}

export interface RecoveryConfirmDeps {
  /** Reads and clears the held recovery session. */
  takePending(): Promise<HeldSession | null>;
  setSession(session: HeldSession): Promise<boolean>;
  /** Best effort: ends the held session server-side on cancel or when the confirm window times out. */
  revoke(session: HeldSession): Promise<void>;
}

export const RECOVERY_PENDING_COOKIE = "lf_recovery_pending";
/** Seconds the held recovery session waits for "Continue as …". */
export const RECOVERY_PENDING_MAX_AGE = 600;

export function heldSessionExpired(session: HeldSession, nowSeconds: number, maxAge = RECOVERY_PENDING_MAX_AGE): boolean {
  const issuedAt = session.issuedAt;
  return typeof issuedAt !== "number" || !Number.isFinite(issuedAt) || nowSeconds - issuedAt > maxAge;
}

export async function confirmRecovery(
  deps: RecoveryConfirmDeps,
  input: { action: string; locale: Locale; nowSeconds?: number },
): Promise<string> {
  const held = await deps.takePending();
  if (!held) return expired(input.locale);
  if (heldSessionExpired(held, input.nowSeconds ?? Math.floor(Date.now() / 1000))) {
    await deps.revoke(held);
    return expired(input.locale);
  }
  if (input.action !== "continue") {
    await deps.revoke(held);
    return `/${input.locale}/signin?status=recovery_cancelled`;
  }
  return (await deps.setSession(held)) ? `/${input.locale}/reset-password` : expired(input.locale);
}

export function encodeHeld(session: HeldSession, issuedAt = session.issuedAt ?? Math.floor(Date.now() / 1000)): string {
  return btoa(JSON.stringify({ accessToken: session.accessToken, refreshToken: session.refreshToken, issuedAt }));
}

export function decodeHeld(value: string | undefined): HeldSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value)) as Partial<HeldSession>;
    if (typeof parsed.accessToken !== "string" || !parsed.accessToken || typeof parsed.refreshToken !== "string" || !parsed.refreshToken) {
      return null;
    }
    const issuedAt = typeof parsed.issuedAt === "number" && Number.isFinite(parsed.issuedAt) ? parsed.issuedAt : undefined;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, issuedAt };
  } catch {
    return null;
  }
}
