import { NextResponse, type NextRequest } from "next/server";
import { verifyCode } from "@/lib/auth/neon-auth";
import { safeNextPath } from "@/lib/auth/safe-next";
import { serverEnv } from "@/lib/env";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { codeDeps, isSameOrigin, rateLimited } from "@/lib/server/runtime";

/** Emailed sign-in / verify code (Neon backend). The email comes from this browser's signed pending cookie only. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  if (serverEnv().backend !== "neon") return new NextResponse("Not found", { status: 404 });
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
  const deps = codeDeps();
  const pending = await deps.pending.get();
  const limit = await rateLimited(request, "signin", pending?.email ?? null);
  if (limit !== "ok") return back(limit === "limited" ? "rate" : "unavailable");
  const result = await verifyCode(deps, { code: String(form.get("code") ?? ""), next, locale });
  return result.kind === "redirect" ? NextResponse.redirect(new URL(result.to, request.url), 303) : back(result.status);
}
