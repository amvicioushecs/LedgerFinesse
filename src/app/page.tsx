import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";

const STEPS = [
  {
    title: "Enter your lease terms",
    body: "Monthly rent, due day, grace period, the late fee and every fee your lease actually authorizes.",
  },
  {
    title: "Add your ledger",
    body: "Import the CSV from your resident portal, paste rows from a spreadsheet or type them in. Fix any row before you audit.",
  },
  {
    title: "Review and dispute",
    body: "See each flagged charge next to the lease term it breaks, then download the findings or a ready-to-edit dispute letter.",
  },
];

const CHECKS = [
  {
    title: "Fees the lease never authorized",
    body: "Technology, convenience, admin and other charges that aren't in your lease's fee list, or are billed above the amount it sets.",
  },
  {
    title: "Late fees during the grace period",
    body: "Late charges posted while rent was still on time under your lease's due day and grace period.",
  },
  {
    title: "Late fees above the lease amount",
    body: "Late charges higher than the flat amount or percent of rent your lease allows, or any late fee when the lease has no late-fee clause.",
  },
  {
    title: "Rent above the lease rent",
    body: "Rent charged above your monthly lease rent before the lease term ends.",
  },
  {
    title: "Running balance errors",
    body: "Printed balances that don't equal the previous balance plus charges minus payments and credits.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-12 lg:px-8">
            <div className="lg:col-span-7">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Rent ledger audit</p>
              <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-emerald-950 sm:text-6xl">
                Check every charge on your rent ledger against your lease.
              </h1>
              <p className="mt-6 max-w-2xl text-base text-slate-600 sm:text-lg">
                LedgerFinesse lines up your resident ledger with the terms you signed and flags junk fees, early late
                fees, rent overcharges and balances that don&apos;t add up, with the exact dollar amount for each.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/audit" className="btn-primary px-6 py-3 text-base">
                  Start your audit
                </Link>
                <Link href="#what-we-check" className="btn-secondary px-6 py-3 text-base">
                  What we check
                </Link>
              </div>
              <p className="mt-6 text-xs text-slate-500">Free. No account. Your documents never leave your browser.</p>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-stone-50 p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">How findings are decided</p>
                <ul className="mt-4 space-y-4 text-sm text-slate-700">
                  <li>
                    <strong className="block text-slate-900">Deterministic, not guesswork</strong>
                    The same lease and ledger always produce the same findings. No AI decides what you owe.
                  </li>
                  <li>
                    <strong className="block text-slate-900">Exact to the cent</strong>
                    All math runs in whole cents, so totals never drift from rounding.
                  </li>
                  <li>
                    <strong className="block text-slate-900">Based on your lease</strong>
                    Every finding points to the lease term or ledger arithmetic behind it.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-slate-200 bg-stone-100 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-serif text-3xl font-bold tracking-tight text-emerald-950 sm:text-5xl">How it works</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
                  <div className="font-serif text-4xl font-bold text-amber-500">{String(i + 1).padStart(2, "0")}</div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="what-we-check" className="border-b border-slate-200 py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
            <div className="space-y-4 lg:col-span-5">
              <h2 className="font-serif text-3xl font-bold tracking-tight text-emerald-950 sm:text-5xl">
                What LedgerFinesse checks
              </h2>
              <p className="text-slate-600">
                Findings come from your lease terms and your ledger&apos;s own arithmetic. State and city law checks are
                added only after each rule is verified against the official source.
              </p>
              <Link href="/audit" className="btn-primary">
                Audit my ledger
              </Link>
            </div>
            <div className="divide-y divide-slate-200 border-y border-slate-200 lg:col-span-7">
              {CHECKS.map((check) => (
                <div key={check.title} className="py-5">
                  <h3 className="font-bold text-slate-900">{check.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{check.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-emerald-950 py-16 text-white">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
            <h2 className="font-serif text-3xl font-bold tracking-tight">Have your lease and ledger handy?</h2>
            <Link href="/audit" className="rounded-lg bg-amber-400 px-6 py-3 font-bold text-emerald-950 hover:bg-amber-300">
              Start your audit
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
