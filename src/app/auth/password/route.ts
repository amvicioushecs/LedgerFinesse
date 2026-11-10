import { NextResponse, type NextRequest } from "next/server";
import { passwordSignIn } from "@/lib/auth/password";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { isSameOrigin, passwordDeps } from "@/lib/server/runtime";

/** Email + password sign-in or sign-up (Supabase Auth; sign-up sends Supabase's confirmation email). */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const localeValue = String(form.get("locale") ?? "en");
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const result = await passwordSignIn(await passwordDeps(request), {
    intent: form.get("intent") === "signup" ? "signup" : "signin",
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    next: String(form.get("next") ?? ""),
    locale,
  });
  if (result.kind === "redirect") return NextResponse.redirect(new URL(result.to, request.url), 303);
  const url = new URL(`/${locale}/signin`, request.url);
  url.searchParams.set("status", result.status);
  url.searchParams.set("next", result.next);
  return NextResponse.redirect(url, 303);
}
