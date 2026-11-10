import type { JurisdictionKey } from "@/lib/jurisdictions";
import type { Extraction, FindingCategory, LedgerLine } from "@/lib/rules-engine/types";

/**
 * SAMPLE case from Hector's app (fictional tenant and landlord). Shown on /[locale]/sample and used
 * by demo extraction outside production. The real rules engine reproduces the $640 from these lines.
 */

const RENT = 245000;
const RUBS = 1500;
const VALET = 2500;
const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] as const;

function buildLedger(): LedgerLine[] {
  const lines: Omit<LedgerLine, "sequence" | "confidence">[] = [];
  let balance = 0;
  const push = (l: Omit<LedgerLine, "sequence" | "confidence" | "reportedBalanceCents">, reportedOverride?: number) => {
    balance += l.kind === "charge" ? l.amountCents : -l.amountCents;
    lines.push({ ...l, reportedBalanceCents: reportedOverride ?? balance });
  };
  for (const m of months) {
    const d = (day: string) => `2026-${m}-${day}`;
    // Aug: the printed balance after rent carries a $185 debit with no matching line.
    const phantom = m === "08" ? 18500 : 0;
    push({ id: `rent-${m}`, date: d("01"), description: "Base Rent", kind: "charge", category: "rent", amountCents: RENT }, balance + RENT + phantom);
    balance += phantom;
    push({ id: `rubs-${m}`, date: d("01"), description: "RUBS Billing Admin Fee", kind: "charge", category: "fee", amountCents: RUBS });
    if (m >= "08") push({ id: `valet-${m}`, date: d("01"), description: "Valet Trash/Portal Fee", kind: "charge", category: "fee", amountCents: VALET });
    if (m === "09") {
      push({ id: "pest-09a", date: d("01"), description: "Amenity/Pest Fee", kind: "charge", category: "fee", amountCents: 4000 });
      push({ id: "pest-09b", date: d("01"), description: "Amenity/Pest Fee", kind: "charge", category: "fee", amountCents: 4000 });
    }
    // June: ACH lands on the 4th (inside the grace period) and a late charge posts anyway; paid with July.
    push({ id: `pay-${m}`, date: d(m === "06" ? "04" : "03"), description: "ACH Payment - Thank You", kind: "payment", category: "payment", amountCents: balance });
    if (m === "06") push({ id: "late-06", date: d("04"), description: "Late Charge", kind: "charge", category: "late_fee", amountCents: 15000 });
  }
  return lines.map((l, i) => ({ ...l, sequence: i, confidence: 0.98 }));
}

export const SAMPLE_CASE = {
  id: "LF-849204",
  tenantName: "Jordan Vance",
  landlord: "Pacific Crest Residential Management LLC",
  address: "2840 University Ave, Apt 4B, San Diego, CA 92104",
  jurisdiction: "san-diego-ca" as JurisdictionKey,
  ledgerFileName: "Resident_Portal_Ledger_Scan_2026.jpg",
  leaseFileName: "Executed_Lease_Agreement.pdf",
  extraction: {
    place: { stateCode: "CA", city: "San Diego" },
    lease: {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monthlyRentCents: RENT,
      dueDay: 1,
      // Due the 1st, on time through the 5th.
      gracePeriodDays: 4,
      lateFee: { kind: "flat", amountCents: 7500 },
      authorizedFees: [],
    },
    openingBalanceCents: 0,
    ledger: buildLedger(),
  } satisfies Extraction,
  leaseRefs: {
    late_fee_timing: "Lease § 4",
    late_fee_amount: "Lease § 6",
    unauthorized_fee: "Lease § 11",
  } satisfies Partial<Record<FindingCategory, string>>,
} as const;
