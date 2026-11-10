import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/lib/i18n/locales";
import { isSameOrigin, signOut } from "@/lib/server/runtime";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const locale = String(form.get("locale") ?? "en");
  await signOut();
  return NextResponse.redirect(new URL(`/${isLocale(locale) ? locale : "en"}`, request.url), 303);
}
