import { NextResponse, type NextRequest } from "next/server";
import { requestPasswordReset } from "@/lib/auth/password";
import { safeNextPath } from "@/lib/auth/safe-next";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { isSameOrigin, passwordDeps } from "@/lib/server/runtime";
import { serverEnv } from "@/lib/env";

/** Sends Supabase's password-reset email. Always answers "sent" so it can't be used to find accounts. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const localeValue = String(form.get("locale") ?? "en");
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const result = await requestPasswordReset(await passwordDeps(request), { email: String(form.get("email") ?? ""), locale });
  // Neon Auth emails a reset code: continue to the code form (same answer whether or not the account exists).
  if (result.status === "reset_sent" && serverEnv().backend === "neon") {
    return NextResponse.redirect(new URL(`/${locale}/reset-password?status=reset_sent`, request.url), 303);
  }
  const url = new URL(`/${locale}/signin`, request.url);
  url.searchParams.set("status", result.status);
  url.searchParams.set("next", safeNextPath(String(form.get("next") ?? ""), locale));
  return NextResponse.redirect(url, 303);
}
