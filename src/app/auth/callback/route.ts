import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { isLocale } from "@/lib/i18n/locales";
import { supabaseForRequest } from "@/lib/server/runtime";

/** Magic-link landing: exchanges the one-time code for a session cookie, then continues. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const localeValue = params.get("locale") ?? "en";
  const locale = isLocale(localeValue) ? localeValue : "en";
  const next = safeNextPath(params.get("next"), locale);
  const code = params.get("code");
  if (code) {
    const supabase = await supabaseForRequest();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url), 303);
  }
  const url = new URL(`/${locale}/signin`, request.url);
  url.searchParams.set("status", "error");
  return NextResponse.redirect(url, 303);
}
