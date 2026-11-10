import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, localeRedirect } from "@/lib/i18n/routing";

/**
 * 1. Adds a locale prefix to unlocalized page paths (saved choice, then Accept-Language).
 * 2. With Supabase, refreshes the auth session cookie so Server Components see a valid session.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = localeRedirect(pathname, request.headers.get("accept-language"), request.cookies.get(LOCALE_COOKIE)?.value ?? null);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = search;
    return NextResponse.redirect(url, 307);
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.LF_BACKEND === "supabase" && url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    await supabase.auth.getClaims();
  }
  return response;
}

export const config = {
  // Pages only: skip API routes, auth callback, Next internals, metadata routes and files with an extension.
  matcher: ["/((?!api/|auth/|_next/|sitemap.xml|robots.txt|.*\\.[a-zA-Z0-9]+$).*)"],
};
