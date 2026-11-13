"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ledgerFromCsv, toCsv } from "@/lib/audit-input/csv";
import { buildExtraction, type AuditDraft, type FeeDraft, type LedgerDraftLine } from "@/lib/audit-input/draft";
import { explainFinding, FINDING_LABELS } from "@/lib/audit-input/findings";
import { disputeLetter } from "@/lib/audit-input/letter";
import { centsToInput, formatCents } from "@/lib/audit-input/money";
import { US_STATES } from "@/lib/audit-input/states";
import { audit } from "@/lib/rules-engine/audit";
import type { Finding, LedgerCategory } from "@/lib/rules-engine/types";
import { VERIFIED_RULES } from "@/lib/rules-engine/verified-rules";
import { useDraft } from "@/components/use-draft";

const CATEGORY_OPTIONS: { value: LedgerCategory; label: string }[] = [
  { value: "rent", label: "Rent" },
  { value: "late_fee", label: "Late fee" },
  { value: "fee", label: "Other fee" },
  { value: "utility", label: "Utility" },
  { value: "parking", label: "Parking" },
  { value: "pet", label: "Pet" },
  { value: "deposit", label: "Deposit" },
  { value: "other", label: "Other" },
];

function newId(): string {
  return crypto.randomUUID();
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Card({ title, step, children, actions }: { title: string; step?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-emerald-950">
          {step && <span className="mr-2 text-amber-600">{step}</span>}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function AuditWorkspace() {
  const { draft, setDraft, clearDraft, hydrated } = useDraft();
  const [importText, setImportText] = useState("");
  const [importMessages, setImportMessages] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const built = useMemo(() => buildExtraction(draft), [draft]);
  const result = useMemo(() => (built.ok ? audit(built.extraction, VERIFIED_RULES) : null), [built]);
  const findingsByLine = useMemo(() => {
    const map = new Map<string, Finding[]>();
    result?.findings.forEach((f) => map.set(f.ledgerLineId, [...(map.get(f.ledgerLineId) ?? []), f]));
    return map;
  }, [result]);

  if (!hydrated) {
    return <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-10 text-sm text-slate-500 sm:px-6 lg:px-8">Loading workspace…</main>;
  }

  const set = <K extends keyof AuditDraft>(key: K, value: AuditDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const updateFee = (id: string, patch: Partial<FeeDraft>) =>
    setDraft((d) => ({ ...d, fees: d.fees.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const updateLine = (id: string, patch: Partial<LedgerDraftLine>) =>
    setDraft((d) => ({ ...d, ledger: d.ledger.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const importLedger = (text: string, mode: "replace" | "append") => {
    const { lines, errors } = ledgerFromCsv(text, newId());
    if (lines.length === 0) {
      setImportMessages(errors.length > 0 ? errors : ["No ledger rows found."]);
      return;
    }
    const rows: LedgerDraftLine[] = lines.map((line) => ({
      id: newId(),
      date: line.date,
      description: line.description,
      kind: line.kind,
      category: line.category,
      amount: centsToInput(line.amountCents),
      balance: line.reportedBalanceCents === null ? "" : centsToInput(line.reportedBalanceCents),
    }));
    setDraft((d) => ({ ...d, ledger: mode === "replace" ? rows : [...d.ledger, ...rows] }));
    setImportMessages([`Imported ${rows.length} row${rows.length === 1 ? "" : "s"}. Check each row's type and category.`, ...errors]);
    setImportText("");
  };

  const letter =
    built.ok && result && result.findings.length > 0
      ? disputeLetter(built.extraction, result, {
          tenantName: draft.tenantName,
          landlordName: draft.landlordName,
          propertyAddress: draft.propertyAddress,
          today: localToday(),
        })
      : null;

  const exportFindings = () => {
    if (!built.ok || !result) return;
    const lines = new Map(built.extraction.ledger.map((l) => [l.id, l]));
    const rows = [["Date", "Ledger entry", "Charged", "Finding", "Disputed", "Basis", "Explanation"]];
    result.findings.forEach((f) => {
      const line = lines.get(f.ledgerLineId);
      if (!line) return;
      rows.push([
        f.date,
        line.description,
        centsToInput(line.amountCents),
        FINDING_LABELS[f.category],
        centsToInput(f.amountCents),
        f.basis,
        explainFinding(f, line, built.extraction.lease),
      ]);
    });
    download("ledgerfinesse-findings.csv", toCsv(rows), "text/csv");
  };

  const exportLedger = () => {
    const rows = [["Date", "Description", "Type", "Category", "Amount", "Balance"]];
    draft.ledger.forEach((l) => rows.push([l.date, l.description, l.kind, l.category, l.amount, l.balance]));
    download("ledgerfinesse-ledger.csv", toCsv(rows), "text/csv");
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-emerald-950">Audit workspace</h1>
          <p className="mt-1 text-sm text-slate-600">Saved automatically in this browser. Nothing is uploaded.</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (window.confirm("Clear the lease, ledger and letter details from this browser?")) clearDraft();
          }}
        >
          Start over
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="no-print space-y-6 lg:col-span-7">
          <Card step="1" title="Lease terms">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="label">State</span>
                <select className="field" value={draft.stateCode} onChange={(e) => set("stateCode", e.target.value)}>
                  <option value="">Select a state</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">City (optional)</span>
                <input className="field" value={draft.city} onChange={(e) => set("city", e.target.value)} />
              </label>
              <label>
                <span className="label">Lease start</span>
                <input type="date" className="field" value={draft.leaseStart} onChange={(e) => set("leaseStart", e.target.value)} />
              </label>
              <label>
                <span className="label">Lease end (blank if month-to-month)</span>
                <input type="date" className="field" value={draft.leaseEnd} onChange={(e) => set("leaseEnd", e.target.value)} />
              </label>
              <label>
                <span className="label">Monthly rent ($)</span>
                <input inputMode="decimal" className="field" value={draft.monthlyRent} onChange={(e) => set("monthlyRent", e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className="label">Rent due day</span>
                  <input inputMode="numeric" className="field" value={draft.dueDay} onChange={(e) => set("dueDay", e.target.value)} />
                </label>
                <label>
                  <span className="label">Grace days</span>
                  <input inputMode="numeric" className="field" value={draft.graceDays} onChange={(e) => set("graceDays", e.target.value)} />
                </label>
              </div>
              <label>
                <span className="label">Late fee in the lease</span>
                <select
                  className="field"
                  value={draft.lateFeeKind}
                  onChange={(e) => set("lateFeeKind", e.target.value as AuditDraft["lateFeeKind"])}
                >
                  <option value="none">No late-fee clause</option>
                  <option value="flat">Flat amount</option>
                  <option value="percent">Percent of rent</option>
                </select>
              </label>
              {draft.lateFeeKind !== "none" && (
                <label>
                  <span className="label">{draft.lateFeeKind === "flat" ? "Late fee ($)" : "Late fee (% of rent)"}</span>
                  <input inputMode="decimal" className="field" value={draft.lateFeeValue} onChange={(e) => set("lateFeeValue", e.target.value)} />
                </label>
              )}
              <label>
                <span className="label">Balance before the first ledger row ($)</span>
                <input inputMode="decimal" className="field" value={draft.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} />
              </label>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Fees the lease authorizes</h3>
                <button
                  type="button"
                  className="text-sm font-semibold text-emerald-800 hover:text-emerald-950"
                  onClick={() => set("fees", [...draft.fees, { id: newId(), name: "", amount: "" }])}
                >
                  + Add fee
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                List each fee your lease names, such as &quot;Trash&quot; or &quot;Technology Fee&quot;. Leave the amount blank if the lease
                doesn&apos;t fix one. Fees not listed here are flagged.
              </p>
              {draft.fees.length === 0 && <p className="text-sm text-slate-500">No fees listed.</p>}
              <div className="space-y-2">
                {draft.fees.map((fee) => (
                  <div key={fee.id} className="flex gap-2">
                    <input
                      aria-label="Fee name"
                      placeholder="Fee name"
                      className="field"
                      value={fee.name}
                      onChange={(e) => updateFee(fee.id, { name: e.target.value })}
                    />
                    <input
                      aria-label="Fee amount"
                      placeholder="Amount ($)"
                      inputMode="decimal"
                      className="field max-w-36"
                      value={fee.amount}
                      onChange={(e) => updateFee(fee.id, { amount: e.target.value })}
                    />
                    <button
                      type="button"
                      aria-label="Remove fee"
                      className="btn-secondary px-3"
                      onClick={() => set("fees", draft.fees.filter((f) => f.id !== fee.id))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card
            step="2"
            title="Ledger"
            actions={
              draft.ledger.length > 0 && (
                <button type="button" className="btn-secondary" onClick={exportLedger}>
                  Export CSV
                </button>
              )
            }
          >
            <div className="rounded-xl border border-dashed border-slate-300 bg-stone-50 p-4">
              <p className="text-sm text-slate-700">
                Import a CSV from your resident portal, or paste rows copied from a spreadsheet. It needs a header row with
                a date, a description and either an amount column or charge and payment columns. A balance column is
                optional.
              </p>
              <textarea
                aria-label="Paste ledger rows"
                className="field mt-3 h-28 font-mono text-xs"
                placeholder={"Date,Description,Charges,Payments,Balance"}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={importText.trim() === ""}
                  onClick={() => importLedger(importText, draft.ledger.length > 0 ? "append" : "replace")}
                >
                  {draft.ledger.length > 0 ? "Add pasted rows" : "Import pasted rows"}
                </button>
                <label className="btn-secondary cursor-pointer">
                  Choose CSV file
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) importLedger(await file.text(), "replace");
                    }}
                  />
                </label>
              </div>
              {importMessages.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                  {importMessages.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Description</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Amount ($)</th>
                    <th className="py-2 pr-2">Balance ($)</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.ledger.map((line) => {
                    const flagged = findingsByLine.get(line.id);
                    return (
                      <tr key={line.id} className={`border-b border-slate-100 align-top ${flagged ? "bg-rose-50" : ""}`}>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            aria-label="Date"
                            className="field px-2"
                            value={line.date}
                            onChange={(e) => updateLine(line.id, { date: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            aria-label="Description"
                            className="field px-2"
                            value={line.description}
                            onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          />
                          {flagged?.map((f) => (
                            <span
                              key={f.category}
                              className="mt-1 mr-1 inline-block rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-rose-700"
                            >
                              {FINDING_LABELS[f.category]} · {formatCents(f.amountCents)}
                            </span>
                          ))}
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            aria-label="Type"
                            className="field min-w-28 px-2"
                            value={line.kind}
                            onChange={(e) => updateLine(line.id, { kind: e.target.value as LedgerDraftLine["kind"] })}
                          >
                            <option value="charge">Charge</option>
                            <option value="payment">Payment</option>
                            <option value="credit">Credit</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            aria-label="Category"
                            className="field min-w-32 px-2"
                            disabled={line.kind !== "charge"}
                            value={line.kind === "charge" ? line.category : "payment"}
                            onChange={(e) => updateLine(line.id, { category: e.target.value as LedgerCategory })}
                          >
                            {line.kind !== "charge" && <option value="payment">—</option>}
                            {CATEGORY_OPTIONS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            aria-label="Amount"
                            inputMode="decimal"
                            className="field w-28 px-2 font-mono"
                            value={line.amount}
                            onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            aria-label="Balance"
                            inputMode="decimal"
                            className="field w-28 px-2 font-mono"
                            value={line.balance}
                            onChange={(e) => updateLine(line.id, { balance: e.target.value })}
                          />
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            aria-label="Remove row"
                            className="btn-secondary px-3"
                            onClick={() => set("ledger", draft.ledger.filter((l) => l.id !== line.id))}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {draft.ledger.length === 0 && <p className="py-4 text-sm text-slate-500">No ledger rows yet.</p>}
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-emerald-800 hover:text-emerald-950"
                onClick={() =>
                  set("ledger", [
                    ...draft.ledger,
                    {
                      id: newId(),
                      date: draft.ledger.at(-1)?.date ?? "",
                      description: "",
                      kind: "charge",
                      category: "rent",
                      amount: "",
                      balance: "",
                    },
                  ])
                }
              >
                + Add row
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <div className="lg:sticky lg:top-6 space-y-6">
            <Card
              step="3"
              title="Findings"
              actions={
                result &&
                result.findings.length > 0 && (
                  <button type="button" className="btn-secondary no-print" onClick={exportFindings}>
                    Export CSV
                  </button>
                )
              }
            >
              {!built.ok && (
                <div>
                  <p className="text-sm text-slate-600">Finish these to run the audit:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                    {built.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {built.ok && result && (
                <>
                  <div className="rounded-xl bg-emerald-950 p-5 text-white">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Total disputed</p>
                    <p className="mt-1 font-serif text-4xl font-bold">{formatCents(result.totalFoundCents)}</p>
                    <p className="mt-1 text-sm text-emerald-100">
                      {result.findings.length} finding{result.findings.length === 1 ? "" : "s"} across{" "}
                      {built.extraction.ledger.length} ledger row{built.extraction.ledger.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {result.findings.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-600">
                      No discrepancies found between this ledger and the lease terms you entered. Double-check each
                      row&apos;s category, since fee and late-fee checks depend on it.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-slate-100">
                      {result.findings.map((f) => {
                        const line = built.extraction.ledger.find((l) => l.id === f.ledgerLineId);
                        if (!line) return null;
                        return (
                          <li key={`${f.ledgerLineId}-${f.category}`} className="py-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-sm font-bold text-slate-900">{FINDING_LABELS[f.category]}</span>
                              <span className="font-mono text-sm font-semibold text-rose-700">{formatCents(f.amountCents)}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{explainFinding(f, line, built.extraction.lease)}</p>
                            {f.sourceUrl && (
                              <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-emerald-800 underline">
                                Source
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {result.findings.some((f) => f.basis === "rule") ? null : (
                    <p className="mt-4 text-xs text-slate-500">
                      Findings are based on your lease and ledger arithmetic. State and local law checks are not applied
                      yet. Not legal advice.
                    </p>
                  )}
                </>
              )}
            </Card>

            {letter && (
              <Card step="4" title="Dispute letter">
                <div className="no-print grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="label">Your name</span>
                    <input className="field" value={draft.tenantName} onChange={(e) => set("tenantName", e.target.value)} />
                  </label>
                  <label>
                    <span className="label">Landlord or manager</span>
                    <input className="field" value={draft.landlordName} onChange={(e) => set("landlordName", e.target.value)} />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="label">Rental address</span>
                    <input className="field" value={draft.propertyAddress} onChange={(e) => set("propertyAddress", e.target.value)} />
                  </label>
                </div>
                <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-stone-50 p-4 font-serif text-sm leading-relaxed text-slate-800 print:max-h-none print:border-0 print:bg-white">
                  {letter}
                </pre>
                <div className="no-print mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(letter);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "Copied" : "Copy letter"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => download("dispute-letter.txt", letter, "text/plain")}>
                    Download .txt
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => window.print()}>
                    Print
                  </button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
