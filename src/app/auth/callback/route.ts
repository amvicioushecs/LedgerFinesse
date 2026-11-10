import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { isLocale } from "@/lib/i18n/locales";
import { supabaseForRequest } from "@/lib/server/runtime";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "recovery", "magiclink", "email", "invite", "email_change"];

/**
 * Landing for Supabase email links (magic link, sign-up confirmation, password reset): opens a session, then continues
 * to `next`. `code` is the PKCE flow (same browser); `token_hash` + `type` works from any device once the email
 * templates link to /auth/callback?token_hash={{ .TokenHash }}&type=... (Supabase dashboard setting).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const localeValue = params.get("locale") ?? "en";
  const locale = isLocale(localeValue) ? localeValue : "en";
  const type = params.get("type") as EmailOtpType | null;
  const next = type === "recovery" ? `/${locale}/reset-password` : safeNextPath(params.get("next"), locale);
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  if (code || (tokenHash && type && OTP_TYPES.includes(type))) {
    const supabase = await supabaseForRequest();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
    if (!error) return NextResponse.redirect(new URL(next, request.url), 303);
  }
  const url = new URL(`/${locale}/signin`, request.url);
  url.searchParams.set("status", "expired");
  return NextResponse.redirect(url, 303);
}
