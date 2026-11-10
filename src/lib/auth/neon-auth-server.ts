import "server-only";
import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { fromSdkError, type NeonAuthApi, type NeonAuthResult, type OtpType } from "@/lib/auth/neon-auth";

/**
 * Server-side Neon Auth client (Managed Better Auth). The SDK forwards this request's Neon Auth cookies and Origin
 * and writes the session cookies it gets back (httpOnly, Secure, SameSite=Lax, set by Neon Auth). Sessions are
 * rows in neon_auth.session, so sign-out and password resets revoke them. Used only from Route Handlers (it may set
 * cookies); pages read the session with readNeonSession (neon-session.ts), which never writes cookies and skips
 * the SDK's session-data cache, so a revoked session stops working at once.
 */
const SESSION_DATA_TTL_SECONDS = 60;

let cached: { key: string; auth: NeonAuth } | null = null;
export function neonAuth(config: { authBaseUrl: string; cookieSecret: string }): NeonAuth {
  const key = `${config.authBaseUrl}|${config.cookieSecret}`;
  if (cached?.key !== key) {
    cached = { key, auth: createNeonAuth({ baseUrl: config.authBaseUrl, cookies: { secret: config.cookieSecret, sessionDataTtl: SESSION_DATA_TTL_SECONDS }, logLevel: "warn" }) };
  }
  return cached.auth;
}

type SdkResult = { error?: { code?: string; status?: number; message?: string } | null };
const result = (r: SdkResult, kind: "password" | "otp" = "password"): NeonAuthResult => (r.error ? { ok: false, code: fromSdkError(r.error, kind) } : { ok: true });

export function neonAuthApi(config: { authBaseUrl: string; cookieSecret: string; appUrl: string }): NeonAuthApi {
  const auth = neonAuth(config);
  return {
    signInEmail: async (email, password) => result(await auth.signIn.email({ email, password })),
    // Better Auth requires a display name; the app has none, so it stores the email.
    signUpEmail: async (email, password) => result(await auth.signUp.email({ email, password, name: email })),
    sendOtp: async (email: string, type: OtpType) => result(await auth.emailOtp.sendVerificationOtp({ email, type }), "otp"),
    signInOtp: async (email, otp) => result(await auth.signIn.emailOtp({ email, otp }), "otp"),
    verifyEmailOtp: async (email, otp) => result(await auth.emailOtp.verifyEmail({ email, otp }), "otp"),
    // The SDK (0.7.0-beta) maps emailOtp.resetPassword to a path Neon Auth answers 404 for; call the endpoint directly.
    // No session cookie is involved: the code is the proof.
    async resetPasswordOtp(email, otp, password) {
      const response = await fetch(`${config.authBaseUrl.replace(/\/+$/, "")}/email-otp/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: new URL(config.appUrl).origin },
        body: JSON.stringify({ email, otp, password }),
      });
      if (response.ok) return { ok: true };
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      return { ok: false, code: body?.code || `HTTP_${response.status}` };
    },
  };
}
