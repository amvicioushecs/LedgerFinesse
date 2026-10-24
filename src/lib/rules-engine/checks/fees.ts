import { makeFinding } from "@/lib/rules-engine/finding";
import { resolveRule } from "@/lib/rules-engine/rules";
import type { Extraction, Finding, Rule } from "@/lib/rules-engine/types";

const ABBREVIATIONS = new Map([
  ["tech", "technology"],
  ["admin", "administrative"],
  ["mgmt", "management"],
  ["svc", "service"],
]);
const FILLER_WORDS = new Set(["fee", "fees", "charge", "charges"]);

/**
 * Lowercases, strips punctuation, expands common abbreviations and drops filler
 * words, so "Tech Fee" and "Technology Fee" both become "technology".
 */
export function normalizeFeeName(name: string): string {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => ABBREVIATIONS.get(word) ?? word)
    .filter((word) => !FILLER_WORDS.has(word))
    .join(" ");
}

/** True when the normalized fee name appears as whole words in the normalized ledger description. */
export function feeNameMatches(description: string, feeName: string): boolean {
  const name = normalizeFeeName(feeName);
  return name.length > 0 && ` ${normalizeFeeName(description)} `.includes(` ${name} `);
}

/**
 * Flags junk fees on ledger lines categorized `fee`:
 *
 * 1. A verified `fee_ban` rule names the fee -> full amount, cites the rule.
 *    The law wins even when the lease authorizes the fee.
 * 2. The lease doesn't authorize the fee -> full amount (basis: lease).
 * 3. The lease authorizes it at a fixed amount and more was charged -> the excess.
 *
 * @example lease authorizes "Technology Fee" $15, ledger "Tech Fee" $20 -> finding of $5.
 */
export function checkJunkFees(extraction: Extraction, rules: readonly Rule[]): Finding[] {
  const { lease, place } = extraction;
  const findings: Finding[] = [];

  for (const line of extraction.ledger) {
    if (line.kind !== "charge" || line.category !== "fee") continue;

    const ban = resolveRule(rules, place, "fee_ban", line.date);
    if (ban !== null && ban.params.feeNames.some((name) => feeNameMatches(line.description, name))) {
      findings.push(makeFinding(line, "unauthorized_fee", line.amountCents, ban));
      continue;
    }

    const authorized = lease.authorizedFees.find((fee) => feeNameMatches(line.description, fee.name));
    if (authorized === undefined) {
      findings.push(makeFinding(line, "unauthorized_fee", line.amountCents, "lease"));
    } else if (authorized.amountCents !== null && line.amountCents > authorized.amountCents) {
      findings.push(makeFinding(line, "unauthorized_fee", line.amountCents - authorized.amountCents, "lease"));
    }
  }
  return findings;
}
