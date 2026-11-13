import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, localeRedirect } from "@/lib/i18n/routing";

/** "/" picks a language (saved choice, then Accept-Language). The proxy covers other paths. */
export function GET(request: NextRequest) {
  const target = localeRedirect("/", request.headers.get("accept-language"), request.cookies.get(LOCALE_COOKIE)?.value ?? null) ?? "/en";
  return NextResponse.redirect(new URL(target, request.url), 307);
}
