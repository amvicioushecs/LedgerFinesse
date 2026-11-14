import { parseDollarsToCents } from "@/lib/audit-input/money";
import type { Extraction, IsoDate, LedgerCategory, LedgerLine, LeaseLateFee } from "@/lib/rules-engine/types";

export interface FeeDraft {
  id: string;
  name: string;
  /** Blank = the lease authorizes the fee without a fixed amount. */
  amount: string;
}

export interface LedgerDraftLine {
  id: string;
  date: IsoDate;
  description: string;
  kind: LedgerLine["kind"];
  category: LedgerCategory;
  amount: string;
  /** Blank = the ledger doesn't print a balance on this line. */
  balance: string;
}

/** Everything the renter types into the workspace, kept as strings until audited. */
export interface AuditDraft {
  stateCode: string;
  city: string;
  leaseStart: IsoDate;
  leaseEnd: IsoDate;
  monthlyRent: string;
  dueDay: string;
  graceDays: string;
  lateFeeKind: "none" | "flat" | "percent";
  lateFeeValue: string;
  fees: FeeDraft[];
  openingBalance: string;
  ledger: LedgerDraftLine[];
  tenantName: string;
  landlordName: string;
  propertyAddress: string;
}

export const EMPTY_DRAFT: AuditDraft = {
  stateCode: "",
  city: "",
  leaseStart: "",
  leaseEnd: "",
  monthlyRent: "",
  dueDay: "1",
  graceDays: "0",
  lateFeeKind: "none",
  lateFeeValue: "",
  fees: [],
  openingBalance: "0",
  ledger: [],
  tenantName: "",
  landlordName: "",
  propertyAddress: "",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function wholeNumber(raw: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value >= min && value <= max ? value : null;
}

export type BuildResult = { ok: true; extraction: Extraction } | { ok: false; errors: string[] };

/** Validates the draft and converts it into the rules engine's integer-cent `Extraction`. */
export function buildExtraction(draft: AuditDraft): BuildResult {
  const errors: string[] = [];

  const stateCode = draft.stateCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateCode)) errors.push("Choose the state the rental is in.");

  if (!ISO_DATE.test(draft.leaseStart)) errors.push("Enter the lease start date.");
  if (draft.leaseEnd !== "" && !ISO_DATE.test(draft.leaseEnd)) errors.push("The lease end date is not a date.");
  if (draft.leaseEnd !== "" && draft.leaseEnd < draft.leaseStart) errors.push("The lease ends before it starts.");

  const rent = parseDollarsToCents(draft.monthlyRent);
  if (!rent || rent.negative || rent.cents === 0) errors.push("Enter the monthly rent from the lease.");

  const dueDay = wholeNumber(draft.dueDay, 1, 31);
  if (dueDay === null) errors.push("Rent due day must be between 1 and 31.");
  const graceDays = wholeNumber(draft.graceDays, 0, 31);
  if (graceDays === null) errors.push("Grace period must be between 0 and 31 days.");

  let lateFee: LeaseLateFee | null = null;
  if (draft.lateFeeKind !== "none") {
    const value = parseDollarsToCents(draft.lateFeeValue);
    if (!value || value.negative) {
      errors.push(draft.lateFeeKind === "flat" ? "Enter the lease's late fee amount." : "Enter the lease's late fee percent.");
    } else if (draft.lateFeeKind === "flat") {
      lateFee = { kind: "flat", amountCents: value.cents };
    } else {
      // "5" percent -> 500 cents-of-a-percent -> 500 basis points.
      lateFee = { kind: "percent_of_rent", basisPoints: value.cents };
    }
  }

  const authorizedFees: Extraction["lease"]["authorizedFees"] = [];
  draft.fees.forEach((fee, i) => {
    const name = fee.name.trim();
    if (name === "") {
      if (fee.amount.trim() !== "") errors.push(`Lease fee ${i + 1} needs a name.`);
      return;
    }
    if (fee.amount.trim() === "") {
      authorizedFees.push({ name, amountCents: null });
      return;
    }
    const amount = parseDollarsToCents(fee.amount);
    if (!amount || amount.negative) errors.push(`"${name}" amount is not a dollar amount.`);
    else authorizedFees.push({ name, amountCents: amount.cents });
  });

  const opening = parseDollarsToCents(draft.openingBalance === "" ? "0" : draft.openingBalance);
  if (!opening) errors.push("Opening balance is not a dollar amount.");

  if (draft.ledger.length === 0) errors.push("Add at least one ledger row.");
  const ledger: LedgerLine[] = [];
  draft.ledger.forEach((row, i) => {
    const label = `Ledger row ${i + 1}`;
    const amount = parseDollarsToCents(row.amount);
    const balance = row.balance.trim() === "" ? null : parseDollarsToCents(row.balance);
    if (!ISO_DATE.test(row.date)) errors.push(`${label}: enter a date.`);
    if (!amount || amount.negative || amount.cents === 0) errors.push(`${label}: enter a positive amount.`);
    if (row.balance.trim() !== "" && !balance) errors.push(`${label}: balance is not a dollar amount.`);
    if (!amount || !ISO_DATE.test(row.date)) return;
    ledger.push({
      id: row.id,
      sequence: i,
      date: row.date,
      description: row.description.trim(),
      kind: row.kind,
      category: row.kind === "charge" ? row.category : "payment",
      amountCents: amount.cents,
      reportedBalanceCents: balance ? (balance.negative ? -balance.cents : balance.cents) : null,
      confidence: 1,
    });
  });

  if (errors.length > 0 || !rent || dueDay === null || graceDays === null || !opening) return { ok: false, errors };
  return {
    ok: true,
    extraction: {
      place: { stateCode, city: draft.city.trim() || null },
      lease: {
        startDate: draft.leaseStart,
        endDate: draft.leaseEnd || null,
        monthlyRentCents: rent.cents,
        dueDay,
        gracePeriodDays: graceDays,
        lateFee,
        authorizedFees,
      },
      openingBalanceCents: opening.negative ? -opening.cents : opening.cents,
      ledger,
    },
  };
}
