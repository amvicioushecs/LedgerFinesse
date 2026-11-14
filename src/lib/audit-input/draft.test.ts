import { describe, expect, it } from "vitest";
import { buildExtraction, EMPTY_DRAFT, type AuditDraft } from "@/lib/audit-input/draft";
import { disputeLetter } from "@/lib/audit-input/letter";
import { audit } from "@/lib/rules-engine/audit";
import { VERIFIED_RULES } from "@/lib/rules-engine/verified-rules";

const draft: AuditDraft = {
  ...EMPTY_DRAFT,
  stateCode: "zz",
  city: "Testville",
  leaseStart: "2026-01-01",
  leaseEnd: "2026-12-31",
  monthlyRent: "1,000",
  dueDay: "1",
  graceDays: "5",
  lateFeeKind: "flat",
  lateFeeValue: "50",
  fees: [{ id: "f1", name: "Technology Fee", amount: "15" }],
  ledger: [
    { id: "a", date: "2026-02-01", description: "Rent", kind: "charge", category: "rent", amount: "1000", balance: "1000" },
    { id: "b", date: "2026-02-03", description: "Late Fee", kind: "charge", category: "late_fee", amount: "75", balance: "1075" },
    { id: "c", date: "2026-02-04", description: "Tech Fee", kind: "charge", category: "fee", amount: "20", balance: "1095" },
    { id: "d", date: "2026-02-05", description: "Payment", kind: "payment", category: "payment", amount: "1000", balance: "120" },
  ],
};

describe("buildExtraction", () => {
  it("converts a complete draft into integer cents", () => {
    const result = buildExtraction(draft);
    if (!result.ok) throw new Error(result.errors.join("; "));
    expect(result.extraction.place).toEqual({ stateCode: "ZZ", city: "Testville" });
    expect(result.extraction.lease.monthlyRentCents).toBe(100000);
    expect(result.extraction.lease.lateFee).toEqual({ kind: "flat", amountCents: 5000 });
    expect(result.extraction.ledger.map((l) => l.amountCents)).toEqual([100000, 7500, 2000, 100000]);
  });

  it("reads a percent late fee as basis points", () => {
    const result = buildExtraction({ ...draft, lateFeeKind: "percent", lateFeeValue: "5.5" });
    expect(result.ok && result.extraction.lease.lateFee).toEqual({ kind: "percent_of_rent", basisPoints: 550 });
  });

  it("lists every missing field on an empty draft", () => {
    const result = buildExtraction(EMPTY_DRAFT);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual([
      "Choose the state the rental is in.",
      "Enter the lease start date.",
      "Enter the monthly rent from the lease.",
      "Add at least one ledger row.",
    ]);
  });

  it("audits end to end and writes a letter", () => {
    const built = buildExtraction(draft);
    if (!built.ok) throw new Error(built.errors.join("; "));
    const result = audit(built.extraction, VERIFIED_RULES);
    expect(result.findings.map((f) => [f.category, f.ledgerLineId, f.amountCents])).toEqual([
      ["late_fee_timing", "b", 7500],
      ["unauthorized_fee", "c", 500],
      ["math_balance_error", "d", 2500],
    ]);
    const letter = disputeLetter(built.extraction, result, {
      tenantName: "",
      landlordName: "Acme Property",
      propertyAddress: "",
      today: "2026-03-01",
    });
    expect(letter).toContain("Dear Acme Property,");
    expect(letter).toContain("[Your name]");
    expect(letter).toContain("Total disputed: $105.00.");
  });
});
