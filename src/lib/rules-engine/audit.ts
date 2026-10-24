import { assertCents } from "@/lib/money";
import { checkJunkFees } from "@/lib/rules-engine/checks/fees";
import { checkLateFees } from "@/lib/rules-engine/checks/late-fees";
import { checkLedgerMath } from "@/lib/rules-engine/checks/ledger-math";
import { checkRentIncreases } from "@/lib/rules-engine/checks/rent";
import { compareText } from "@/lib/rules-engine/ledger";
import type { AuditResult, Extraction, Finding, FindingCategory, PreviewSummaryItem, Rule } from "@/lib/rules-engine/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Rejects malformed input instead of producing wrong money. */
function validateExtraction(extraction: Extraction): void {
  const { lease } = extraction;
  assertCents(lease.monthlyRentCents, "lease.monthlyRentCents");
  if (!Number.isInteger(lease.dueDay) || lease.dueDay < 1 || lease.dueDay > 31) {
    throw new RangeError(`lease.dueDay must be 1-31, got ${lease.dueDay}`);
  }
  assertCents(lease.gracePeriodDays, "lease.gracePeriodDays");
  if (!isIsoDate(lease.startDate)) throw new RangeError("lease.startDate must be YYYY-MM-DD");
  if (lease.endDate !== null && !isIsoDate(lease.endDate)) throw new RangeError("lease.endDate must be YYYY-MM-DD");
  if (!Number.isSafeInteger(extraction.openingBalanceCents)) {
    throw new RangeError(`openingBalanceCents must be an integer, got ${extraction.openingBalanceCents}`);
  }
  for (const line of extraction.ledger) {
    assertCents(line.amountCents, `ledger line ${line.id} amountCents`);
    if (line.reportedBalanceCents !== null && !Number.isSafeInteger(line.reportedBalanceCents)) {
      throw new RangeError(`ledger line ${line.id} reportedBalanceCents must be an integer`);
    }
    if (!isIsoDate(line.date)) throw new RangeError(`ledger line ${line.id} date must be YYYY-MM-DD`);
    if (!(line.confidence >= 0 && line.confidence <= 1)) {
      throw new RangeError(`ledger line ${line.id} confidence must be 0..1`);
    }
  }
}

function compareFindings(a: Finding, b: Finding): number {
  return compareText(a.date, b.date) || compareText(a.ledgerLineId, b.ledgerLineId) || compareText(a.category, b.category);
}

function summarize(findings: readonly Finding[]): PreviewSummaryItem[] {
  const byCategory = new Map<FindingCategory, PreviewSummaryItem>();
  for (const finding of findings) {
    const item = byCategory.get(finding.category) ?? { category: finding.category, count: 0, amountCents: 0 };
    item.count += 1;
    item.amountCents += finding.amountCents;
    byCategory.set(finding.category, item);
  }
  return [...byCategory.values()].sort((a, b) => compareText(a.category, b.category));
}

/**
 * The deterministic audit: a pure function of the extraction and the rules.
 * No network, no clock, no randomness. Only verified rules are applied
 * (see rules.ts); every amount is integer cents.
 *
 * Findings are sorted by date, ledger line id, then category, so the same input in
 * any array order produces identical output. `totalFoundCents` is the sum of all
 * findings; the unlock fee is computed separately by `src/lib/pricing.ts`.
 */
export function audit(extraction: Extraction, rules: readonly Rule[]): AuditResult {
  validateExtraction(extraction);
  const findings = [
    ...checkLedgerMath(extraction),
    ...checkRentIncreases(extraction),
    ...checkLateFees(extraction, rules),
    ...checkJunkFees(extraction, rules),
  ].sort(compareFindings);
  const totalFoundCents = findings.reduce((sum, finding) => sum + finding.amountCents, 0);
  return { findings, totalFoundCents, previewSummary: summarize(findings) };
}
