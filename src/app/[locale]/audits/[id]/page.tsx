import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { fill, getDictionary } from "@/content/dictionaries";
import { WaitForStatus } from "@/components/audit/wait-for-status";
import { Disclaimer } from "@/components/disclaimer";
import { ReportView } from "@/components/report/report-view";
import { getFreeResult, getUnlockedReport, isFreeUnlockBelowMinimum } from "@/lib/audits/service";
import type { Locale } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { isUuid } from "@/lib/ids";
import { formatUsd } from "@/lib/money";
import { auditDeps, getCurrentUser } from "@/lib/server/runtime";
import { PRIVATE_ROBOTS } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await currentLocale());
  return { title: t.dashboard.title, robots: PRIVATE_ROBOTS };
}

type Props = PageProps<"/[locale]/audits/[id]">;

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">{children}</div>;
}

async function AuditContent({ locale, params, searchParams }: { locale: Locale; params: Props["params"]; searchParams: Props["searchParams"] }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/audits/${id}`)}`);
  if (!isUuid(id)) notFound();

  const t = getDictionary(locale);
  const r = t.result;
  const deps = await auditDeps();
  const free = await getFreeResult(deps, user.id, id);
  if (!free) notFound();
  const { audit, summary, decision, paymentUnderReview } = free;
  const caseId = audit.id.slice(0, 8).toUpperCase();

  if (audit.status === "unlocked") {
    const report = await getUnlockedReport(deps, user.id, id, locale);
    if (!report) notFound();
    return (
      <>
        {isFreeUnlockBelowMinimum(audit) ? (
          <p role="note" className="mx-auto mt-6 max-w-5xl rounded-md bg-mint p-3 text-sm font-semibold sm:px-6" data-testid="free-unlock-flag">{r.waived}</p>
        ) : null}
        <ReportView
          locale={locale}
          caseId={caseId}
          landlord={audit.landlordName}
          address={audit.propertyAddress}
          jurisdiction={audit.jurisdiction}
          items={report.items}
          totalOwedCents={audit.totalOwedCents ?? 0}
          feeCents={audit.feeCents ?? 0}
          letter={report.letter?.body ?? null}
        />
      </>
    );
  }

  if (audit.status === "draft" || audit.status === "processing") {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-bold">{audit.status === "draft" ? r.draftTitle : r.processingTitle}</h1>
        {audit.status === "draft" ? (
          <p className="mt-2 text-muted">{r.draftBody}</p>
        ) : (
          <WaitForStatus auditId={audit.id} href={`/${locale}/audits/${audit.id}`} waitingFor="processing" />
        )}
        <Link href={`/${locale}/audits/new`} className="btn btn-gold mt-6">{t.dashboard.scanAnother}</Link>
      </Shell>
    );
  }

  if (audit.status === "failed") {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-bold">{r.failedTitle}</h1>
        <p className="mt-2 text-muted">{r.failedBody}</p>
        <Link href={`/${locale}/audits/new`} className="btn btn-gold mt-6">{t.dashboard.scanAnother}</Link>
      </Shell>
    );
  }

  if (audit.status === "clean" || !summary || !decision || decision.kind !== "checkout") {
    return (
      <Shell>
        <p className="pill bg-mint text-forest">$0.00</p>
        <h1 className="font-display mt-3 text-3xl font-bold" data-testid="clean-title">{r.zeroTitle}</h1>
        <p className="mt-2 text-muted">{r.zeroBody}</p>
        <Disclaimer locale={locale} className="mt-8" />
      </Shell>
    );
  }

  const total = formatUsd(summary.totalOwedCents);
  const fee = formatUsd(decision.feeCents);
  const net = formatUsd(summary.totalOwedCents - decision.feeCents);
  const checkout = typeof query.checkout === "string" ? query.checkout : null;

  if (paymentUnderReview) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-bold" data-testid="payment-review">{r.reviewTitle}</h1>
        <p className="mt-2 text-muted">{r.reviewBody}</p>
      </Shell>
    );
  }

  if (checkout === "success") {
    return (
      <Shell>
        <WaitForStatus auditId={audit.id} href={`/${locale}/audits/${audit.id}`} waitingFor="preview_ready" />
        <h1 className="font-display text-3xl font-bold" data-testid="payment-pending">{r.pendingTitle}</h1>
        <p className="mt-2 text-muted">{r.pendingBody}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="pill bg-butter text-ink">{r.foundBadge}</p>
      <h1 className="font-display mt-3 text-4xl font-bold" data-testid="found-title">{fill(r.foundTitle, { total })}</h1>
      <p className="mt-2 text-muted">{fill(r.foundLead, { count: summary.itemCount })}</p>

      <div className="mt-6 rounded-lg bg-mint p-6" data-testid="free-summary">
        <p className="text-xs font-bold uppercase text-muted">{r.totalLabel}</p>
        <p className="font-display text-5xl font-bold" data-testid="free-total">{total}</p>
        <p className="text-sm">{fill(r.across, { count: summary.itemCount })}</p>
      </div>

      <div className="mt-6 rounded-lg border-2 border-dashed border-line p-6 text-center">
        <p className="text-2xl" aria-hidden>🔒</p>
        <h2 className="mt-1 font-bold">{r.lockedTitle}</h2>
        <p className="mt-1 text-sm text-muted">{r.lockedBody}</p>
      </div>

      {checkout === "cancel" ? <p role="status" className="mt-6 rounded-md bg-butter p-3 text-sm font-semibold">{r.cancelled}</p> : null}
      {checkout === "error" ? <p role="alert" className="mt-6 rounded-md bg-butter p-3 text-sm font-semibold text-alert">{r.checkoutError}</p> : null}
      {checkout === "rate" ? <p role="alert" className="mt-6 rounded-md bg-butter p-3 text-sm font-semibold text-alert">{r.checkoutRate}</p> : null}
      {checkout === "unavailable" ? <p role="alert" className="mt-6 rounded-md bg-butter p-3 text-sm font-semibold text-alert">{getDictionary(locale).common.unavailable}</p> : null}

      <section className="mt-6 rounded-lg border-2 border-forest p-6" data-testid="fee-gate">
        <h2 className="font-display text-2xl font-bold">{decision.minimumApplied ? fill(r.feeTitleMinimum, { fee }) : r.feeTitle}</h2>
        <p className="mt-2" data-testid="fee-line">{fill(decision.minimumApplied ? r.feeLineMinimum : r.feeLine, { fee, total })}</p>
        <p className="mt-1 text-sm text-muted">{fill(r.keep, { net, total })}</p>
        <form action="/api/checkout" method="post" className="mt-5">
          <input type="hidden" name="auditId" value={audit.id} />
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="btn btn-gold w-full sm:w-auto" data-testid="pay">
            {fill(r.pay, { fee })}
          </button>
        </form>
        <p className="mt-3 text-xs text-muted">🔐 {r.securedBy}</p>
      </section>
      <Disclaimer locale={locale} className="mt-8" />
    </Shell>
  );
}

export default async function AuditPage({ params, searchParams }: Props) {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-14">{t.common.loading}</div>}>
      <AuditContent locale={locale} params={params} searchParams={searchParams} />
    </Suspense>
  );
}
