import { NextResponse, type NextRequest } from "next/server";
import { confirmRecovery } from "@/lib/auth/callback";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { isSameOrigin, recoveryConfirmDeps } from "@/lib/server/runtime";

/** "Continue as <email>" / "Not my account" for a held recovery session. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const localeValue = String(form.get("locale") ?? "en");
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const to = await confirmRecovery(recoveryConfirmDeps(), { action: String(form.get("action") ?? ""), locale });
  return NextResponse.redirect(new URL(to, request.url), 303);
}
