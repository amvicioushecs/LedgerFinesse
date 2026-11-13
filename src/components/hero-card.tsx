import Link from "next/link";
import type { Dictionary } from "@/content/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

function Row({ title, note, amount, flag }: { title: string; note: string; amount: string; flag?: string }) {
  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted">{note}</p>
        </div>
        <p className={`text-sm font-bold ${flag ? "text-alert" : ""}`}>{amount}</p>
      </div>
      {flag ? <span className="pill mt-1.5 bg-butter text-[0.62rem] text-ink">{flag}</span> : null}
    </li>
  );
}

/** Tilted SAMPLE ledger card from the mockup. Static, clearly labeled sample data. */
export function HeroCard({ t, locale }: { t: Dictionary; locale: Locale }) {
  const c = t.card;
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div aria-hidden className="absolute inset-0 -translate-x-3 translate-y-1 -rotate-3 rounded-lg bg-gold" />
      <figure className="relative rotate-1 rounded-lg border border-line bg-white p-5 shadow-xl">
        <figcaption className="text-[0.65rem] font-bold uppercase tracking-widest text-muted">{c.label}</figcaption>
        <div className="mt-3 flex items-center justify-between border-b-2 border-ink pb-2">
          <p className="font-semibold">{c.title}</p>
          <p className="text-xs text-muted">{c.review}</p>
        </div>
        <ul>
          <Row title={c.rentTitle} note={c.rentNote} amount="$2,450" />
          <Row title={c.lateTitle} note={c.lateNote} amount="$150" flag={c.flag} />
          <Row title={c.mathTitle} note={c.mathNote} amount="$185" flag={c.flag} />
          <Row title={c.feesTitle} note={c.feesNote} amount="$305" flag={c.flag} />
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-mint p-3">
          <div>
            <p className="text-xs text-muted">{c.totalLabel}</p>
            <p className="font-display text-2xl font-bold">$640.00</p>
          </div>
          <Link href={`/${locale}/audits/new`} className="btn btn-forest px-3 py-2 text-xs">
            {c.scanMine}
          </Link>
        </div>
        <p className="mt-2 text-[0.65rem] text-muted">{c.sampleNote}</p>
      </figure>
    </div>
  );
}
