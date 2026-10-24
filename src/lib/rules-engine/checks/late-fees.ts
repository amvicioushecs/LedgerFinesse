import { percentOfCents } from "@/lib/money";
import { makeFinding } from "@/lib/rules-engine/finding";
import { dayOfMonth } from "@/lib/rules-engine/ledger";
import { resolveRule } from "@/lib/rules-engine/rules";
import type { Extraction, Finding, LateFeeCapRule, LedgerLine, Rule } from "@/lib/rules-engine/types";

/** The cap in cents set by a verified late-fee-cap rule, or null if the rule sets none. */
function capFromRule(rule: LateFeeCapRule, monthlyRentCents: number): number | null {
  const caps: number[] = [];
  if (rule.params.maxFlatCents !== null) caps.push(rule.params.maxFlatCents);
  if (rule.params.maxPercentOfRentBps !== null) caps.push(percentOfCents(monthlyRentCents, rule.params.maxPercentOfRentBps));
  if (caps.length === 0) return null;
  return rule.params.whenBoth === "greater" ? Math.max(...caps) : Math.min(...caps);
}

/**
 * Checks one late-fee charge. At most one finding per line, so amounts never double count.
 *
 * 1. No late-fee clause in the lease -> the whole fee is unauthorized. There is no
 *    default cap (the prototype's hidden $50 default is intentionally gone).
 * 2. Timing: rent due on `dueDay` with `graceDays` is on time through day
 *    `dueDay + graceDays`. A late fee posted on or before that day is not owed.
 *    graceDays = the longer of the lease grace period and a verified `grace_period`
 *    rule's `minDays` (law sets the floor). Amount: the full fee.
 * 3. Amount: the fee may not exceed the lease's late fee, nor a verified
 *    `late_fee_cap` rule's cap, whichever is lower. Amount: the excess.
 *
 * Assumes the late fee relates to rent due in the same calendar month it was posted.
 *
 * @example dueDay 1, grace 5, fee posted on the 6th -> timing finding (full fee).
 * @example dueDay 1, grace 5, fee posted on the 7th -> no timing finding.
 */
function checkLateFee(line: LedgerLine, extraction: Extraction, rules: readonly Rule[]): Finding | null {
  const { lease, place } = extraction;
  if (lease.lateFee === null) return makeFinding(line, "unauthorized_fee", line.amountCents, "lease");

  const graceRule = resolveRule(rules, place, "grace_period", line.date);
  const ruleExtendsGrace = graceRule !== null && graceRule.params.minDays > lease.gracePeriodDays;
  const graceDays = ruleExtendsGrace ? graceRule.params.minDays : lease.gracePeriodDays;
  if (dayOfMonth(line.date) <= lease.dueDay + graceDays) {
    return makeFinding(line, "late_fee_timing", line.amountCents, ruleExtendsGrace ? graceRule : "lease");
  }

  const leaseMaxCents =
    lease.lateFee.kind === "flat"
      ? lease.lateFee.amountCents
      : percentOfCents(lease.monthlyRentCents, lease.lateFee.basisPoints);
  const capRule = resolveRule(rules, place, "late_fee_cap", line.date);
  const lawMaxCents = capRule === null ? null : capFromRule(capRule, lease.monthlyRentCents);
  const lawIsLower = capRule !== null && lawMaxCents !== null && lawMaxCents < leaseMaxCents;
  const allowedCents = lawIsLower ? lawMaxCents : leaseMaxCents;

  if (line.amountCents <= allowedCents) return null;
  return makeFinding(line, "late_fee_amount", line.amountCents - allowedCents, lawIsLower ? capRule : "lease");
}

/** Runs {@link checkLateFee} on every late-fee charge. */
export function checkLateFees(extraction: Extraction, rules: readonly Rule[]): Finding[] {
  const findings: Finding[] = [];
  for (const line of extraction.ledger) {
    if (line.kind !== "charge" || line.category !== "late_fee") continue;
    const finding = checkLateFee(line, extraction, rules);
    if (finding !== null) findings.push(finding);
  }
  return findings;
}
