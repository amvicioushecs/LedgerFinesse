import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { isSameOrigin, startEmailSignIn } from "@/lib/server/runtime";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const localeValue = String(form.get("locale") ?? "en");
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const next = safeNextPath(String(form.get("next") ?? ""), locale);
  const back = (status: string) => {
    const url = new URL(`/${locale}/signin`, request.url);
    url.searchParams.set("status", status);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  };
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });

  const email = String(form.get("email") ?? "").trim();
  if (email.length > 320 || !EMAIL.test(email)) return back("error");

  const result = await startEmailSignIn(email, next, locale);
  if (result.kind === "signed_in") return NextResponse.redirect(new URL(next, request.url), 303);
  return back(result.kind === "email_sent" ? "sent" : "error");
}
