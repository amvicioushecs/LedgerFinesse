import { lawNotes, type JurisdictionKey, type Statute } from "@/lib/jurisdictions";
import type { AuditResult, Extraction, Finding, FindingCategory, LedgerLine } from "@/lib/rules-engine/types";

export interface ReportItem {
  key: string;
  category: FindingCategory;
  description: string;
  firstDate: string;
  lastDate: string;
  lineIds: string[];
  lineCount: number;
  lineNumbers: number[];
  chargedCents: number;
  allowedCents: number;
  owedCents: number;
  basis: Finding["basis"];
  citation: string | null;
  sourceUrl: string | null;
  leaseRef: string | null;
  lawNotes: Statute[];
}

export interface Report {
  items: ReportItem[];
  totalOwedCents: number;
  linesScanned: number;
}

export interface FreeSummary {
  itemCount: number;
  totalOwedCents: number;
  linesScanned: number;
}

interface BuildOptions {
  jurisdiction: JurisdictionKey;
  leaseRefs?: Partial<Record<FindingCategory, string>>;
}

function normalize(description: string): string {
  return description.toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

/** What the landlord charged on the line the finding points at. For math drift, the printed balance jump. */
function chargedFor(finding: Finding, line: LedgerLine): number {
  return finding.category === "math_balance_error" ? line.amountCents + finding.amountCents : line.amountCents;
}

/** Group engine findings into report items (same category + same charge name), oldest first. */
export function buildReport(extraction: Extraction, result: AuditResult, options: BuildOptions): Report {
  const lines = new Map(extraction.ledger.map((l, index) => [l.id, { line: l, number: index + 1 }]));
  const groups = new Map<string, ReportItem>();

  for (const finding of result.findings) {
    const entry = lines.get(finding.ledgerLineId);
    if (entry === undefined) throw new Error(`finding points at unknown ledger line ${finding.ledgerLineId}`);
    const { line, number } = entry;
    const key = `${finding.category}:${normalize(line.description)}`;
    const charged = chargedFor(finding, line);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        key,
        category: finding.category,
        description: line.description,
        firstDate: finding.date,
        lastDate: finding.date,
        lineIds: [line.id],
        lineCount: 1,
        lineNumbers: [number],
        chargedCents: charged,
        allowedCents: charged - finding.amountCents,
        owedCents: finding.amountCents,
        basis: finding.basis,
        citation: finding.citation,
        sourceUrl: finding.sourceUrl,
        leaseRef: finding.basis === "lease" ? (options.leaseRefs?.[finding.category] ?? null) : null,
        lawNotes: lawNotes(options.jurisdiction, finding.category),
      });
    } else {
      existing.lineIds.push(line.id);
      existing.lineNumbers.push(number);
      existing.lineCount += 1;
      existing.chargedCents += charged;
      existing.owedCents += finding.amountCents;
      existing.allowedCents = existing.chargedCents - existing.owedCents;
      if (finding.date < existing.firstDate) existing.firstDate = finding.date;
      if (finding.date > existing.lastDate) existing.lastDate = finding.date;
    }
  }

  const items = [...groups.values()].sort(
    (a, b) => a.firstDate.localeCompare(b.firstDate) || a.lineNumbers[0] - b.lineNumbers[0],
  );
  const totalOwedCents = items.reduce((sum, i) => sum + i.owedCents, 0);
  if (totalOwedCents !== result.totalFoundCents) throw new Error("report total does not match engine total");
  return { items, totalOwedCents, linesScanned: extraction.ledger.length };
}

/** The only data a free scan may expose. */
export function freeSummary(report: Report): FreeSummary {
  return { itemCount: report.items.length, totalOwedCents: report.totalOwedCents, linesScanned: report.linesScanned };
}
