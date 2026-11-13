import { NextResponse, type NextRequest } from "next/server";
import { updatePassword } from "@/lib/auth/password";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { getCurrentUser, isSameOrigin, passwordChangeAllowed, passwordDeps } from "@/lib/server/runtime";

/** New password: only for a recovery session (reset link) or a recent sign-in. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  const form = await request.formData();
  const localeValue = String(form.get("locale") ?? "en");
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const result = await updatePassword(await passwordDeps(request), {
    userId: user?.id ?? null, password: String(form.get("password") ?? ""), locale, mayChange: user ? await passwordChangeAllowed() : false,
  });
  if (result.kind === "redirect") return NextResponse.redirect(new URL(result.to, request.url), 303);
  const url = new URL(`/${locale}/reset-password`, request.url);
  url.searchParams.set("status", result.status);
  return NextResponse.redirect(url, 303);
}
