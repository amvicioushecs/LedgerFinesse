import { compareText } from "@/lib/rules-engine/ledger";
import type { IsoDate, Place, Rule, RuleType } from "@/lib/rules-engine/types";

/**
 * A rule is usable only when it is `verified` AND carries its evidence: citation,
 * https source URL, verifier and verification date. Draft and retired rules are
 * never applied.
 */
export function isVerified(rule: Rule): boolean {
  return (
    rule.status === "verified" &&
    Boolean(rule.citation) &&
    Boolean(rule.sourceUrl?.startsWith("https://")) &&
    Boolean(rule.verifiedBy) &&
    Boolean(rule.verifiedAt)
  );
}

/** effectiveFrom is inclusive, effectiveTo is exclusive. */
export function isInEffect(rule: Rule, on: IsoDate): boolean {
  return (
    (rule.effectiveFrom === null || rule.effectiveFrom <= on) &&
    (rule.effectiveTo === null || on < rule.effectiveTo)
  );
}

function newest<T extends Rule>(rules: T[]): T | null {
  const sorted = [...rules].sort((a, b) => b.version - a.version || compareText(a.id, b.id));
  return sorted[0] ?? null;
}

/**
 * The one verified rule of `ruleType` that governs `place` on date `on`.
 * A city rule overrides the state rule; with no city rule, the state rule applies.
 * If several versions are in effect, the highest version wins. Returns null when
 * no verified rule applies (the engine then relies on the lease alone).
 */
export function resolveRule<T extends RuleType>(
  rules: readonly Rule[],
  place: Place,
  ruleType: T,
  on: IsoDate,
): Extract<Rule, { ruleType: T }> | null {
  const usable = rules.filter(
    (rule): rule is Extract<Rule, { ruleType: T }> =>
      rule.ruleType === ruleType &&
      rule.place.stateCode === place.stateCode &&
      isVerified(rule) &&
      isInEffect(rule, on),
  );
  const city = place.city?.toLowerCase() ?? null;
  const cityRule = city === null ? null : newest(usable.filter((rule) => rule.place.city?.toLowerCase() === city));
  return cityRule ?? newest(usable.filter((rule) => rule.place.city === null));
}
