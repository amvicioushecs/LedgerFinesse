import { formatCents } from "@/lib/audit-input/money";
import type { Finding, FindingCategory, LeaseTerms, LedgerLine } from "@/lib/rules-engine/types";

export const FINDING_LABELS: Record<FindingCategory, string> = {
  unauthorized_fee: "Fee not allowed by the lease",
  late_fee_timing: "Late fee charged during the grace period",
  late_fee_amount: "Late fee above the allowed amount",
  unauthorized_rent_increase: "Rent above the lease rent",
  math_balance_error: "Balance doesn't add up",
};

function ordinal(day: number): string {
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}

/** One plain-English sentence explaining why a finding was raised, built only from the renter's own data. */
export function explainFinding(finding: Finding, line: LedgerLine, lease: LeaseTerms): string {
  const charged = formatCents(line.amountCents);
  const disputed = formatCents(finding.amountCents);
  const source = finding.basis === "rule" && finding.citation ? ` (${finding.citation})` : "";
  switch (finding.category) {
    case "unauthorized_fee":
      return finding.amountCents === line.amountCents
        ? `"${line.description}" (${charged}) is not one of the fees your lease authorizes${source}.`
        : `"${line.description}" was charged at ${charged}; ${disputed} of it is above the amount your lease sets.`;
    case "late_fee_timing":
      return `A ${charged} late fee was posted on ${line.date}, but rent is due on the ${ordinal(lease.dueDay)} with a ${lease.gracePeriodDays}-day grace period${source}.`;
    case "late_fee_amount":
      return lease.lateFee === null
        ? `Your lease has no late-fee clause, so the ${charged} late fee is not authorized.`
        : `The ${charged} late fee is ${disputed} above the maximum allowed${source}.`;
    case "unauthorized_rent_increase":
      return `Rent of ${charged} was charged during the lease term; the lease rent is ${formatCents(lease.monthlyRentCents)}.`;
    case "math_balance_error":
      return `The balance printed after this line is ${disputed} higher than the charges and payments add up to.`;
  }
}
