import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { fill, getDictionary } from "@/content/dictionaries";
import { getJurisdiction } from "@/lib/jurisdictions";
import type { Locale } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { formatUsd } from "@/lib/money";
import { listAudits } from "@/lib/audits/service";
import { auditDeps, getCurrentUser } from "@/lib/server/runtime";
import { PRIVATE_ROBOTS } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await currentLocale());
  return { title: t.audits.title, robots: PRIVATE_ROBOTS };
}

async function AuditList({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/signin?next=/${locale}/audits`);
  const t = getDictionary(locale);
  const audits = await listAudits(await auditDeps(), user.id);
  if (audits.length === 0) return <p className="text-muted">{t.audits.empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {audits.map((a) => (
        <li key={a.id}>
          <Link href={`/${locale}/audits/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-cream">
            <span>
              <span className="font-semibold">{getJurisdiction(a.jurisdiction).label}</span>
              <span className="block text-xs text-muted">{a.createdAt.slice(0, 10)} · #{a.id.slice(0, 8).toUpperCase()}</span>
            </span>
            <span className="text-sm">
              {t.audits.status[a.status]}
              {a.totalOwedCents ? ` · ${fill(t.audits.found, { total: formatUsd(a.totalOwedCents) })}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function AuditsPage() {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-bold">{t.audits.title}</h1>
        <Link href={`/${locale}/audits/new`} className="btn btn-gold">{t.audits.start}</Link>
      </div>
      <div className="mt-8">
        <Suspense fallback={<p>{t.common.loading}</p>}>
          <AuditList locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}
