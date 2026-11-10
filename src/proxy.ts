import { NextResponse, type NextRequest } from "next/server";
import { serverEnvError } from "@/lib/env";
import { LOCALE_COOKIE, localeRedirect } from "@/lib/i18n/routing";

/**
 * 0. Refuses to serve when the server configuration is invalid.
 * 1. Adds a locale prefix to unlocalized page paths (saved choice, then Accept-Language).
 * Sessions need no refresh here: pages check the Neon Auth session read-only (lib/auth/neon-session.ts).
 */
export async function proxy(request: NextRequest) {
  // Fail closed: a misconfigured deployment (e.g. no SITE_ENV) serves no pages. API and auth routes read the
  // same configuration and throw on their own.
  const configError = serverEnvError();
  if (configError) {
    console.error(JSON.stringify({ msg: "invalid server configuration", error: configError }));
    return new NextResponse("Service unavailable: server configuration is invalid.", { status: 503 });
  }
  const { pathname, search } = request.nextUrl;
  const target = localeRedirect(pathname, request.headers.get("accept-language"), request.cookies.get(LOCALE_COOKIE)?.value ?? null);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = search;
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next({ request });
}

export const config = {
  // Pages only: skip API routes, auth routes, Next internals, metadata routes and files with an extension.
  matcher: ["/((?!api/|auth/|_next/|sitemap.xml|robots.txt|.*\\.[a-zA-Z0-9]+$).*)"],
};
