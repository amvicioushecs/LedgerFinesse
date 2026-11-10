import { NextResponse, type NextRequest } from "next/server";
import { attachDocument, canStartAudit, createAudit, scanAudit } from "@/lib/audits/service";
import { readUploadRequest } from "@/lib/audits/upload-request";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { LOCALE_COOKIE } from "@/lib/i18n/routing";
import { auditDeps, getCurrentUser, isSameOrigin, rateLimited } from "@/lib/server/runtime";

/** Upload lease + ledger, run the free scan, then show the result page. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  // Locale comes from the URL or cookie so nothing reads the body before the user is known.
  const hinted = request.nextUrl.searchParams.get("locale") ?? request.cookies.get(LOCALE_COOKIE)?.value ?? "en";
  const locale: Locale = isLocale(hinted) ? hinted : "en";

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/${locale}/signin?next=/${locale}/audits/new`, request.url), 303);

  const refuse = (error: "rate" | "daily") => NextResponse.redirect(new URL(`/${locale}/audits/new?error=${error}`, request.url), 303);
  if (await rateLimited(request, "upload", user.id)) return refuse("rate");
  const deps = await auditDeps();
  if (!(await canStartAudit(deps, user.id))) return refuse("daily");

  const parsed = await readUploadRequest(request);
  if (!parsed.ok) {
    // Over the request cap: refuse outright (the body was never read). Otherwise back to the form.
    if (!parsed.bodyRead) return new NextResponse(parsed.status === 413 ? "Upload too large" : "Length required", { status: parsed.status });
    return NextResponse.redirect(new URL(`/${locale}/audits/new?error=${parsed.error}`, request.url), 303);
  }
  const { form } = parsed;

  const audit = await createAudit(deps, user.id, form);
  if (!audit) return NextResponse.redirect(new URL(`/${form.locale}/audits/new?error=daily`, request.url), 303);
  for (const file of form.files) {
    const attached = await attachDocument(deps, user.id, audit.id, file);
    if (!attached.ok) return NextResponse.redirect(new URL(`/${form.locale}/audits/new?error=generic`, request.url), 303);
  }
  await scanAudit(deps, user.id, audit.id);
  return NextResponse.redirect(new URL(`/${form.locale}/audits/${audit.id}`, request.url), 303);
}
