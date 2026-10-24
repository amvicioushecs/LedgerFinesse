/**
 * Test builders. Everything here uses the FICTIONAL jurisdiction ZZ / Testville.
 * Citations and URLs are placeholders, not real law. Never put real statute text here.
 */
import type {
  Extraction,
  FeeBanRule,
  GracePeriodRule,
  LateFeeCapRule,
  LeaseTerms,
  LedgerLine,
  Place,
} from "@/lib/rules-engine/types";

export const ZZ_STATE: Place = { stateCode: "ZZ", city: null };
export const ZZ_TESTVILLE: Place = { stateCode: "ZZ", city: "Testville" };

export function lease(overrides: Partial<LeaseTerms> = {}): LeaseTerms {
  return {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monthlyRentCents: 150000,
    dueDay: 1,
    gracePeriodDays: 5,
    lateFee: { kind: "flat", amountCents: 5000 },
    authorizedFees: [],
    ...overrides,
  };
}

export function line(overrides: Partial<LedgerLine> & Pick<LedgerLine, "id" | "date">): LedgerLine {
  return {
    sequence: 0,
    description: "Charge",
    kind: "charge",
    category: "other",
    amountCents: 0,
    reportedBalanceCents: null,
    confidence: 1,
    ...overrides,
  };
}

export function extraction(ledger: LedgerLine[], overrides: Partial<Extraction> = {}): Extraction {
  return { place: ZZ_TESTVILLE, lease: lease(), openingBalanceCents: 0, ledger, ...overrides };
}

const verifiedEvidence = {
  version: 1,
  place: ZZ_STATE,
  status: "verified" as const,
  citation: "ZZ Fictional Code § 0-000 (test fixture, not a real law)",
  sourceUrl: "https://example.com/zz-fictional-code",
  verifiedBy: "fixture-verifier",
  verifiedAt: "2026-10-24",
  effectiveFrom: null,
  effectiveTo: null,
};

export function graceRule(minDays: number, overrides: Partial<GracePeriodRule> = {}): GracePeriodRule {
  return { id: "zz-grace", ruleKey: "grace_period", ruleType: "grace_period", ...verifiedEvidence, params: { minDays }, ...overrides };
}

export function capRule(
  params: LateFeeCapRule["params"],
  overrides: Partial<LateFeeCapRule> = {},
): LateFeeCapRule {
  return { id: "zz-cap", ruleKey: "late_fee_cap", ruleType: "late_fee_cap", ...verifiedEvidence, params, ...overrides };
}

export function feeBanRule(feeNames: string[], overrides: Partial<FeeBanRule> = {}): FeeBanRule {
  return { id: "zz-fee-ban", ruleKey: "fee_ban", ruleType: "fee_ban", ...verifiedEvidence, params: { feeNames }, ...overrides };
}
