import type { Metadata } from "next";
import { getDictionary } from "@/content/dictionaries";
import { SAMPLE_CASE } from "@/content/sample-case";
import { ReportView } from "@/components/report/report-view";
import { toStoredFindings } from "@/lib/audits/service";
import { rulesFor } from "@/lib/jurisdictions";
import { currentLocale } from "@/lib/i18n/server";
import { renderLetter } from "@/lib/letters";
import { computeUnlockFeeCents } from "@/lib/pricing";
import { buildReport } from "@/lib/report";
import { audit } from "@/lib/rules-engine/audit";
import { localeAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return { title: `${t.common.sampleLabel}: ${t.dashboard.title}`, description: t.sample.banner, alternates: localeAlternates(locale, "/sample") };
}

/** SAMPLE dashboard: the real engine run on the fictional San Diego case. */
export default async function SamplePage() {
  const locale = await currentLocale();
  const report = buildReport(SAMPLE_CASE.extraction, audit(SAMPLE_CASE.extraction, rulesFor(SAMPLE_CASE.jurisdiction)), {
    jurisdiction: SAMPLE_CASE.jurisdiction,
    leaseRefs: SAMPLE_CASE.leaseRefs,
  });
  const letter = renderLetter({
    locale,
    date: "2026-11-09",
    tenantName: SAMPLE_CASE.tenantName,
    landlordName: SAMPLE_CASE.landlord,
    propertyAddress: SAMPLE_CASE.address,
    auditRef: SAMPLE_CASE.id,
    jurisdiction: SAMPLE_CASE.jurisdiction,
    report,
  });
  return (
    <ReportView
      locale={locale}
      caseId={SAMPLE_CASE.id}
      landlord={SAMPLE_CASE.landlord}
      address={SAMPLE_CASE.address}
      jurisdiction={SAMPLE_CASE.jurisdiction}
      items={toStoredFindings(report)}
      totalOwedCents={report.totalOwedCents}
      feeCents={computeUnlockFeeCents(report.totalOwedCents)}
      letter={letter}
      leaseClauses={SAMPLE_CASE.leaseClauses}
      isSample
    />
  );
}
