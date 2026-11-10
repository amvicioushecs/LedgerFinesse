import { NextResponse, type NextRequest } from "next/server";
import { attachDocument, createAudit, scanAudit } from "@/lib/audits/service";
import { isJurisdictionKey } from "@/lib/jurisdictions";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { auditDeps, getCurrentUser, isSameOrigin } from "@/lib/server/runtime";
import { validateUpload } from "@/lib/uploads";

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
};

/** Upload lease + ledger, run the free scan, then show the result page. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const localeValue = text(form, "locale") ?? "en";
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const back = (error: string) => NextResponse.redirect(new URL(`/${locale}/audits/new?error=${error}`, request.url), 303);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/${locale}/signin?next=/${locale}/audits/new`, request.url), 303);

  const jurisdiction = text(form, "jurisdiction") ?? "";
  if (!isJurisdictionKey(jurisdiction)) return back("generic");

  const files: { kind: "ledger" | "lease"; bytes: Uint8Array; declaredType: string }[] = [];
  for (const kind of ["ledger", "lease"] as const) {
    const file = form.get(kind);
    if (!(file instanceof File) || file.size === 0) return back("missing");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateUpload({ bytes, declaredType: file.type });
    if (!check.ok) return back(check.reason === "too_large" ? "size" : check.reason === "empty" ? "missing" : "type");
    files.push({ kind, bytes, declaredType: file.type });
  }

  const deps = await auditDeps();
  const audit = await createAudit(deps, user.id, {
    locale,
    jurisdiction,
    tenantName: text(form, "tenantName"),
    landlordName: text(form, "landlordName"),
    propertyAddress: text(form, "propertyAddress"),
  });
  for (const file of files) {
    const attached = await attachDocument(deps, user.id, audit.id, file);
    if (!attached.ok) return back("generic");
  }
  await scanAudit(deps, user.id, audit.id);
  return NextResponse.redirect(new URL(`/${locale}/audits/${audit.id}`, request.url), 303);
}
