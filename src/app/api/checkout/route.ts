import { NextResponse, type NextRequest } from "next/server";
import { startCheckout } from "@/lib/payments/checkout";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { checkoutDeps, getCurrentUser, isSameOrigin } from "@/lib/server/runtime";

/** Opens Stripe Checkout for the stored 15% fee. The request carries no amount. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const localeValue = String(form.get("locale") ?? "en");
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const auditId = String(form.get("auditId") ?? "");
  const back = (query: string) => NextResponse.redirect(new URL(`/${locale}/audits/${auditId}${query}`, request.url), 303);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/${locale}/signin`, request.url), 303);

  try {
    const result = await startCheckout(await checkoutDeps(), { userId: user.id, email: user.email }, auditId, locale);
    if (result.kind === "redirect") return NextResponse.redirect(result.url, 303);
    if (result.kind === "processing") return back("?checkout=success");
    if (result.kind === "not_found") return new NextResponse("Not found", { status: 404 });
    return back("");
  } catch (error) {
    console.error(JSON.stringify({ msg: "checkout failed", auditId, error: String(error) }));
    return back("?checkout=error");
  }
}
