import { makeFinding } from "@/lib/rules-engine/finding";
import type { Extraction, Finding, IsoDate, LeaseTerms } from "@/lib/rules-engine/types";

function withinLeaseTerm(date: IsoDate, lease: LeaseTerms): boolean {
  return date >= lease.startDate && (lease.endDate === null || date <= lease.endDate);
}

/**
 * Flags rent charged above the lease's monthly rent during the lease term
 * (an increase the lease doesn't allow). Amount: charged minus lease rent.
 *
 * Not flagged: rent at or below lease rent (e.g. a prorated first month), and rent
 * after the lease end date (month-to-month increases need notice rules and notice
 * dates, which are not in this version).
 *
 * @example lease rent 100000, February rent charge 110000 -> finding of 10000.
 */
export function checkRentIncreases(extraction: Extraction): Finding[] {
  const { lease } = extraction;
  return extraction.ledger
    .filter(
      (line) =>
        line.kind === "charge" &&
        line.category === "rent" &&
        withinLeaseTerm(line.date, lease) &&
        line.amountCents > lease.monthlyRentCents,
    )
    .map((line) => makeFinding(line, "unauthorized_rent_increase", line.amountCents - lease.monthlyRentCents, "lease"));
}
