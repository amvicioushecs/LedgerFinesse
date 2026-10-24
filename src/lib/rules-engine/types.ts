/**
 * Rules-engine data types. All money is integer cents; all dates are ISO `YYYY-MM-DD`
 * strings (compared as strings, no clock, no time zones).
 */

export type IsoDate = string;

/** City `null` = state-level. `stateCode` is two uppercase letters; fixtures use the fictional `ZZ`. */
export interface Place {
  stateCode: string;
  city: string | null;
}

export type LedgerCategory =
  | "rent"
  | "late_fee"
  | "fee"
  | "utility"
  | "parking"
  | "pet"
  | "deposit"
  | "payment"
  | "other";

export interface LedgerLine {
  id: string;
  /** Position in the source ledger (0-based). Breaks same-day ties so input array order never matters. */
  sequence: number;
  date: IsoDate;
  description: string;
  kind: "charge" | "payment" | "credit";
  category: LedgerCategory;
  /** Always positive; `kind` says which direction it moves the balance. */
  amountCents: number;
  /** Balance printed on the ledger after this line, or null if the ledger doesn't show one. */
  reportedBalanceCents: number | null;
  /** Extraction confidence for this line, 0..1. Copied onto findings. */
  confidence: number;
}

export type LeaseLateFee =
  | { kind: "flat"; amountCents: number }
  | { kind: "percent_of_rent"; basisPoints: number };

export interface LeaseTerms {
  startDate: IsoDate;
  endDate: IsoDate | null;
  monthlyRentCents: number;
  /** Day of month rent is due (1-31). */
  dueDay: number;
  /** Days after the due day that rent is still on time (see checks/late-fees.ts). */
  gracePeriodDays: number;
  /** null = the lease has no late-fee clause, so any late fee is unauthorized. */
  lateFee: LeaseLateFee | null;
  /** Fees the lease authorizes. `amountCents` null = authorized with no fixed amount. */
  authorizedFees: { name: string; amountCents: number | null }[];
}

/** Normalized, renter-confirmed extraction. Produced by the extraction step (not built yet). */
export interface Extraction {
  place: Place;
  lease: LeaseTerms;
  /** Balance carried into the first ledger line (may be negative for a credit). */
  openingBalanceCents: number;
  ledger: LedgerLine[];
}

export type RuleStatus = "draft" | "verified" | "retired";

interface RuleBase {
  id: string;
  ruleKey: string;
  version: number;
  place: Place;
  status: RuleStatus;
  citation: string | null;
  sourceUrl: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  /** Inclusive. null = no start bound. */
  effectiveFrom: IsoDate | null;
  /** Exclusive. null = still in effect. */
  effectiveTo: IsoDate | null;
}

export type GracePeriodRule = RuleBase & {
  ruleType: "grace_period";
  params: { minDays: number };
};

export type LateFeeCapRule = RuleBase & {
  ruleType: "late_fee_cap";
  params: {
    maxFlatCents: number | null;
    maxPercentOfRentBps: number | null;
    /** How to combine when both caps are set. Must be confirmed from the statute at verification. */
    whenBoth: "greater" | "lesser";
  };
};

export type FeeBanRule = RuleBase & {
  ruleType: "fee_ban";
  params: { feeNames: string[] };
};

/** Only the rule types this engine evaluates. Other `rule_type` rows are not loaded. */
export type Rule = GracePeriodRule | LateFeeCapRule | FeeBanRule;
export type RuleType = Rule["ruleType"];

export type FindingCategory =
  | "unauthorized_fee"
  | "late_fee_timing"
  | "late_fee_amount"
  | "unauthorized_rent_increase"
  | "math_balance_error";

export interface Finding {
  category: FindingCategory;
  ledgerLineId: string;
  date: IsoDate;
  amountCents: number;
  /** Where the conclusion comes from: a lease term, a verified rule, or ledger arithmetic. */
  basis: "lease" | "rule" | "math";
  ruleId: string | null;
  ruleVersion: number | null;
  /** Copied from the verified rule; never written in code. */
  citation: string | null;
  sourceUrl: string | null;
  confidence: number;
}

export interface PreviewSummaryItem {
  category: FindingCategory;
  count: number;
  amountCents: number;
}

export interface AuditResult {
  findings: Finding[];
  totalFoundCents: number;
  previewSummary: PreviewSummaryItem[];
}
