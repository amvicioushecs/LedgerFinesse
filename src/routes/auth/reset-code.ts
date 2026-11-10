import { NextResponse, type NextRequest } from "next/server";
import { resetWithCode } from "@/lib/auth/neon-auth";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { codeDeps, isSameOrigin, rateLimited } from "@/lib/server/runtime";
import { serverEnv } from "@/lib/env";

/** Neon backend password reset: the emailed code plus a new password, in the browser that asked for the code. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  if (serverEnv().backend !== "neon") return new NextResponse("Not found", { status: 404 });
  const form = await request.formData();
  const localeValue = String(form.get("locale") ?? "en");
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const back = (status: string) => NextResponse.redirect(new URL(`/${locale}/reset-password?status=${encodeURIComponent(status)}`, request.url), 303);
  const deps = codeDeps();
  const pending = await deps.pending.get();
  const limit = await rateLimited(request, "signin", pending?.email ?? null);
  if (limit !== "ok") return back(limit === "limited" ? "rate" : "unavailable");
  const result = await resetWithCode(deps, { code: String(form.get("code") ?? ""), password: String(form.get("password") ?? ""), locale });
  if (result.kind === "redirect") return NextResponse.redirect(new URL(result.to, request.url), 303);
  if (result.status === "expired") return NextResponse.redirect(new URL(`/${locale}/signin?status=expired`, request.url), 303);
  return back(result.status);
}
