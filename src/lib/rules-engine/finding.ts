import { assertCents } from "@/lib/money";
import type { Finding, FindingCategory, LedgerLine, Rule } from "@/lib/rules-engine/types";

/**
 * Builds a finding for one ledger line. When `source` is a rule, its citation and
 * source URL are copied from the rule row; code never supplies citation text.
 */
export function makeFinding(
  line: LedgerLine,
  category: FindingCategory,
  amountCents: number,
  source: Rule | "lease" | "math",
): Finding {
  assertCents(amountCents, "finding amountCents");
  const base = { category, ledgerLineId: line.id, date: line.date, amountCents, confidence: line.confidence };
  if (source === "lease" || source === "math") {
    return { ...base, basis: source, ruleId: null, ruleVersion: null, citation: null, sourceUrl: null };
  }
  return {
    ...base,
    basis: "rule",
    ruleId: source.id,
    ruleVersion: source.version,
    citation: source.citation,
    sourceUrl: source.sourceUrl,
  };
}
