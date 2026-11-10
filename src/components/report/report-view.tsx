import Link from "next/link";
import type { StoredFinding } from "@/lib/audits/types";
import { fill, getDictionary } from "@/content/dictionaries";
import { Disclaimer } from "@/components/disclaimer";
import { LetterActions } from "@/components/report/letter-actions";
import { ReportTabs } from "@/components/report/report-tabs";
import { getJurisdiction, rulesFor, type JurisdictionKey } from "@/lib/jurisdictions";
import type { Locale } from "@/lib/i18n/locales";
import { formatUsd } from "@/lib/money";

export interface LeaseClause {
  section: Record<Locale, string>;
  leaseText: Record<Locale, string>;
  ledgerReality: Record<Locale, string>;
}

export interface ReportViewProps {
  locale: Locale;
  caseId: string;
  landlord: string | null;
  address: string | null;
  jurisdiction: JurisdictionKey;
  items: StoredFinding[];
  totalOwedCents: number;
  feeCents: number;
  letter: string | null;
  leaseClauses?: readonly LeaseClause[];
  isSample?: boolean;
}

function explain(locale: Locale, item: StoredFinding): string {
  const t = getDictionary(locale).explain;
  return fill(t[item.category], {
    description: item.description,
    count: item.lineNumbers.length,
    charged: formatUsd(item.chargedCents),
    allowed: formatUsd(item.allowedCents),
    owed: formatUsd(item.owedCents),
    date: item.firstDate,
  });
}

function dateRange(item: StoredFinding) {
  return item.firstDate === item.lastDate ? item.firstDate : `${item.firstDate} → ${item.lastDate}`;
}

export function ReportView(props: ReportViewProps) {
  const { locale } = props;
  const t = getDictionary(locale);
  const d = t.dashboard;
  const j = getJurisdiction(props.jurisdiction);
  const place = `${j.city}, ${j.stateName[locale]}`;
  const rules = rulesFor(props.jurisdiction);
  const total = formatUsd(props.totalOwedCents);

  const breakdown = (
    <div>
      <h2 className="font-display text-2xl font-bold">{d.breakdownTitle}</h2>
      <p className="mt-1 text-sm text-muted">{d.breakdownLead}</p>
      <ol className="mt-6 space-y-4" data-testid="breakdown">
        {props.items.map((item) => (
          <li key={item.position} className="rounded-lg border border-line p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="pill bg-butter text-ink">{t.findings[item.category]}</p>
                <h3 className="mt-2 text-lg font-bold">
                  {item.description}
                  {item.lineNumbers.length > 1 ? ` ×${item.lineNumbers.length}` : ""}
                </h3>
                <p className="text-xs text-muted">
                  {dateRange(item)} · {fill(t.explain.lines, { lines: item.lineNumbers.join(", ") })}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md bg-cream p-3">
                <dt className="text-xs text-muted">{d.charged}</dt>
                <dd className="font-bold">{formatUsd(item.chargedCents)}</dd>
              </div>
              <div className="rounded-md bg-cream p-3">
                <dt className="text-xs text-muted">{d.allowed}</dt>
                <dd className="font-bold">{formatUsd(item.allowedCents)}</dd>
              </div>
              <div className="rounded-md bg-mint p-3">
                <dt className="text-xs text-muted">{d.owed}</dt>
                <dd className="font-bold text-alert">{formatUsd(item.owedCents)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm">
              <strong>{d.howOwed}</strong> {explain(locale, item)}
            </p>
            <p className="mt-2 text-xs text-muted">
              {d.basis}:{" "}
              {item.basis === "lease"
                ? [t.findings.basisLease, item.leaseRef].filter(Boolean).join(" · ")
                : item.basis === "math"
                  ? t.findings.basisMath
                  : `${t.findings.basisRule} · `}
              {item.basis === "rule" && item.citation ? (
                item.sourceUrl ? (
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {item.citation}
                  </a>
                ) : (
                  item.citation
                )
              ) : null}
            </p>
            {item.lawNotes.map((note) => (
              <p key={note.citation} className="mt-2 rounded-md border border-line p-2 text-xs text-muted">
                {t.explain.note}:{" "}
                <a href={note.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  {note.citation}
                </a>{" "}
                — {note.summary[locale]}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-forest p-5 text-white">
        <div>
          <p className="text-sm text-white/80">{d.totalBar}</p>
          <p className="font-display text-3xl font-bold" data-testid="report-total">{total}</p>
          {props.landlord ? <p className="text-xs text-white/80">{fill(d.totalBarNote, { landlord: props.landlord })}</p> : null}
        </div>
      </div>
    </div>
  );

  const letter = (
    <div>
      <p className="pill bg-mint text-forest">{d.letterBadge}</p>
      <h2 className="font-display mt-2 text-2xl font-bold">{d.letterTitle}</h2>
      <p role="note" className="mt-3 rounded-md border-2 border-gold bg-butter p-3 text-sm font-semibold" data-testid="attorney-review">
        ⚠ {d.attorneyReview}
      </p>
      {props.letter ? (
        <>
          <div className="mt-4">
            <LetterActions text={props.letter} copy={d.copy} copied={d.copied} print={d.print} />
          </div>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-white p-5 font-sans text-sm leading-relaxed whitespace-pre-wrap" data-testid="letter">
            {props.letter}
          </pre>
        </>
      ) : null}
      <h3 className="mt-6 font-bold">{d.sendTitle}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {d.send.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <Disclaimer locale={locale} className="mt-4" />
    </div>
  );

  const sources = (
    <div className="space-y-8">
      {props.leaseClauses ? (
        <div>
          <p className="pill bg-mint text-forest">{d.sourcesBadge}</p>
          <h2 className="font-display mt-2 text-2xl font-bold">{d.sourcesTitle}</h2>
          <div className="mt-4 space-y-4">
            {props.leaseClauses.map((c) => (
              <article key={c.section.en} className="grid gap-3 rounded-lg border border-line p-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase text-muted">{d.leaseRule} · {c.section[locale]}</p>
                  <p className="mt-1 text-sm">“{c.leaseText[locale]}”</p>
                </div>
                <div className="rounded-md bg-butter p-3">
                  <p className="text-xs font-bold uppercase text-alert">{d.ledgerBilled}</p>
                  <p className="mt-1 text-sm">{c.ledgerReality[locale]}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <h2 className="font-display text-2xl font-bold">{fill(d.rulesTitle, { place })}</h2>
        <p className="mt-1 text-sm text-muted">{d.rulesLead}</p>
        <ul className="mt-4 space-y-3" data-testid="statutes">
          {j.statutes.map((s) => (
            <li key={s.citation} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{s.citation}</p>
                <span className={`pill ${s.verified ? "bg-mint text-forest" : "bg-butter text-alert"}`}>
                  {s.verified ? fill(t.jurisdiction.verified, { date: s.verifiedAt ?? "" }) : t.jurisdiction.unverified}
                </span>
              </div>
              {s.verified ? (
                <>
                  <p className="mt-1 text-sm font-semibold">{s.title[locale]}</p>
                  <p className="mt-1 text-sm text-muted">{s.summary[locale]}</p>
                  <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs underline">
                    {t.jurisdiction.official} ↗
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {props.isSample ? (
        <p role="note" className="mb-6 rounded-md border-2 border-gold bg-butter p-3 text-sm font-bold" data-testid="sample-banner">
          {t.sample.banner}
        </p>
      ) : null}
      <p className="text-xs font-bold uppercase tracking-widest text-muted">{fill(d.caseLabel, { id: props.caseId })}</p>
      <h1 className="font-display mt-1 text-4xl font-bold">{d.title}</h1>
      {props.landlord || props.address ? (
        <p className="mt-2 text-sm text-muted">
          {props.landlord ? `${d.landlord}: ${props.landlord}` : null}
          {props.landlord && props.address ? " · " : null}
          {props.address}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-mint p-5">
          <p className="text-xs font-bold uppercase text-muted">{d.totalOwed}</p>
          <p className="font-display text-4xl font-bold">{total}</p>
          <p className="text-sm">{fill(d.flagged, { count: props.items.length })}</p>
        </div>
        <div className="rounded-lg border border-line p-5">
          <p className="text-xs font-bold uppercase text-muted">{d.lawEngine}</p>
          <p className="mt-1 font-semibold">{place}</p>
          <p className="mt-1 text-sm text-muted">
            {d.lawApplied}: {rules.length > 0 ? rules.map((r) => r.citation).join(", ") : d.noRules}
          </p>
        </div>
        <div className="rounded-lg border border-line p-5">
          <p className="text-xs font-bold uppercase text-muted">{d.feeCard}</p>
          <p className="mt-1 text-sm">
            {d.fee}: <strong>{formatUsd(props.feeCents)}</strong>
          </p>
          <p className="text-sm">
            {d.net}: <strong>{formatUsd(props.totalOwedCents - props.feeCents)}</strong>
          </p>
          <p className="mt-1 text-xs text-muted">{d.feeNote}</p>
        </div>
      </div>

      <div className="mt-8">
        <ReportTabs
          tabs={[
            { id: "breakdown", label: d.tabs.breakdown, panel: breakdown },
            { id: "letter", label: d.tabs.letter, panel: letter },
            { id: "sources", label: d.tabs.sources, panel: sources },
          ]}
        />
      </div>

      <div className="no-print mt-10 flex flex-wrap gap-3">
        <Link href={`/${locale}/audits/new`} className="btn btn-gold">
          {props.isSample ? t.sample.cta : d.scanAnother}
        </Link>
      </div>
    </div>
  );
}
