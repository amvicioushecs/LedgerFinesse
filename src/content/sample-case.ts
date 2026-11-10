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
  /** Side-by-side lease text vs. what the ledger billed (sample only). ES flagged for Copy Desk. */
  leaseClauses: [
    {
      section: { en: "Section 4: Base Rent & Grace Period", es: "Sección 4: Renta base y periodo de gracia" },
      leaseText: {
        en: "Base Monthly Rent is $2,450.00, due on the 1st of each month with a five (5) calendar day grace period through the 5th.",
        es: "La renta mensual base es de $2,450.00, pagadera el día 1 de cada mes, con un periodo de gracia de cinco (5) días naturales hasta el día 5.",
      },
      ledgerReality: {
        en: "Ledger charged a $150.00 late fee on June 4th, the same day the ACH payment posted, inside the grace period.",
        es: "El estado de cuenta cobró un cargo por atraso de $150.00 el 4 de junio, el mismo día en que se registró el pago ACH, dentro del periodo de gracia.",
      },
    },
    {
      section: { en: "Section 6: Late Charge Limitation", es: "Sección 6: Límite del cargo por atraso" },
      leaseText: {
        en: "If rent is received after the 5th of the month, a maximum late fee of $75.00 may be assessed.",
        es: "Si la renta se recibe después del día 5 del mes, se puede cobrar un cargo por atraso máximo de $75.00.",
      },
      ledgerReality: {
        en: "Ledger assessed $150.00, double the $75.00 lease limit.",
        es: "El estado de cuenta cobró $150.00, el doble del límite de $75.00 del contrato.",
      },
    },
    {
      section: { en: "Section 11: Utilities & Sub-Metering", es: "Sección 11: Servicios y submedición" },
      leaseText: {
        en: "Tenant shall pay actual sub-metered water/sewer usage. No monthly billing administrative fee, portal fee, or valet trash markup is authorized.",
        es: "El inquilino pagará el consumo real submedido de agua/drenaje. No se autoriza ningún cargo administrativo mensual de facturación, cargo de portal ni recargo de recolección de basura (valet trash).",
      },
      ledgerReality: {
        en: "Ledger billed a $15.00/mo RUBS admin fee for 10 months ($150.00), a $25.00/mo valet trash fee for 3 months ($75.00) and a $40.00 amenity/pest fee twice ($80.00).",
        es: "El estado de cuenta cobró un cargo administrativo RUBS de $15.00/mes durante 10 meses ($150.00), un cargo de valet trash de $25.00/mes durante 3 meses ($75.00) y un cargo de amenidades/plagas de $40.00 dos veces ($80.00).",
      },
    },
  ],
  leaseRefs: {
    late_fee_timing: "Lease § 4",
    late_fee_amount: "Lease § 6",
    unauthorized_fee: "Lease § 11",
  } satisfies Partial<Record<FindingCategory, string>>,
} as const;
