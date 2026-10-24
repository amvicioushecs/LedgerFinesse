import { makeFinding } from "@/lib/rules-engine/finding";
import { sortLedger } from "@/lib/rules-engine/ledger";
import type { Extraction, Finding } from "@/lib/rules-engine/types";

/**
 * Flags running-balance errors: the ledger's printed balance is higher than the
 * arithmetic says it should be (a charge added without a line, a payment not
 * credited, a bad carry-forward).
 *
 * The computed balance starts at `openingBalanceCents` and adds charges, subtracts
 * payments and credits, in ledger order. At each line with a printed balance,
 * drift = printed - computed. A finding is created only when drift rises above the
 * largest drift already flagged, for the increase only, so one error carried
 * forward on every later line is counted once. Drift in the renter's favor is not
 * a finding (amounts are never negative).
 *
 * @example opening 0, charge 1000 (printed 1000), payment 1000 (printed 50) -> one finding of 50.
 */
export function checkLedgerMath(extraction: Extraction): Finding[] {
  const findings: Finding[] = [];
  let computedCents = extraction.openingBalanceCents;
  let flaggedDriftCents = 0;

  for (const line of sortLedger(extraction.ledger)) {
    computedCents += line.kind === "charge" ? line.amountCents : -line.amountCents;
    if (line.reportedBalanceCents === null) continue;

    const driftCents = line.reportedBalanceCents - computedCents;
    if (driftCents > flaggedDriftCents) {
      findings.push(makeFinding(line, "math_balance_error", driftCents - flaggedDriftCents, "math"));
      flaggedDriftCents = driftCents;
    }
  }
  return findings;
}
