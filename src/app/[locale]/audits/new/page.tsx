import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDictionary } from "@/content/dictionaries";
import { Disclaimer } from "@/components/disclaimer";
import { UploadForm } from "@/components/audit/upload-form";
import { serverEnv } from "@/lib/env";
import { MAX_SCAN_BYTES, MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { JURISDICTION_KEYS, getJurisdiction } from "@/lib/jurisdictions";
import type { Locale } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/server/runtime";
import { PRIVATE_ROBOTS } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await currentLocale());
  return { title: t.upload.title, robots: PRIVATE_ROBOTS };
}

const ERRORS = { type: "errorType", size: "errorSize", missing: "missing", generic: "errorGeneric", rate: "errorRate", daily: "errorDaily", unavailable: "unavailable" } as const;

async function Upload({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/audits/new">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/audits/new`)}`);
  const t = getDictionary(locale);
  const params = await searchParams;
  const errorKey = typeof params.error === "string" && params.error in ERRORS ? ERRORS[params.error as keyof typeof ERRORS] : null;
  const demo = serverEnv().extractionMode === "demo";
  return (
    <>
      <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-mint px-3 py-2 text-sm font-semibold text-forest">✓ {t.upload.accountActive}</p>
      {demo ? (
        <p role="note" className="mt-4 rounded-md border-2 border-gold bg-butter p-3 text-sm font-semibold" data-testid="demo-note">
          {t.upload.demoNote}
        </p>
      ) : null}
      {errorKey ? (
        <p role="alert" className="mt-4 rounded-md bg-butter p-3 text-sm font-semibold text-alert">
          {errorKey === "unavailable" ? t.common.unavailable : t.upload[errorKey]}
        </p>
      ) : null}
      <div className="mt-6 rounded-lg border border-line p-5 sm:p-7">
        <h2 className="font-display text-2xl font-bold">{t.upload.ctaTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.upload.ctaLead}</p>
        <div className="mt-5">
          <UploadForm
            locale={locale}
            labels={{ ...t.upload }}
            maxFileBytes={MAX_UPLOAD_BYTES}
            maxTotalBytes={MAX_SCAN_BYTES}
            jurisdictions={JURISDICTION_KEYS.map((key) => ({ key, label: getJurisdiction(key).label }))}
          />
        </div>
        <p className="mt-5 text-xs text-muted">
          <strong>{t.upload.lawEngine}:</strong> {t.upload.lawNote}
        </p>
      </div>
    </>
  );
}

export default async function NewAuditPage({ searchParams }: PageProps<"/[locale]/audits/new">) {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="pill bg-mint text-forest">{t.upload.badge}</p>
      <h1 className="font-display mt-4 text-4xl font-bold">{t.upload.title}</h1>
      <p className="mt-3 max-w-2xl text-muted">{t.upload.lead}</p>
      <Suspense fallback={<p className="mt-6">{t.common.loading}</p>}>
        <Upload locale={locale} searchParams={searchParams} />
      </Suspense>
      <Disclaimer locale={locale} className="mt-8" />
    </div>
  );
}
