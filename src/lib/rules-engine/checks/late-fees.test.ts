import { describe, expect, it } from "vitest";
import { checkLateFees } from "@/lib/rules-engine/checks/late-fees";
import { capRule, extraction, graceRule, lease, line, ZZ_TESTVILLE } from "@/lib/rules-engine/test-helpers";

const lateFee = (id: string, date: string, amountCents: number) =>
  line({ id, date, category: "late_fee", amountCents, description: "Late fee" });

// Lease default from test-helpers: rent 150000, due day 1, grace 5 days, flat late fee 5000.
describe("checkLateFees: timing", () => {
  it("flags a fee posted inside the grace period for the full amount", () => {
    expect(checkLateFees(extraction([lateFee("f", "2026-03-04", 5000)]), [])).toEqual([
      expect.objectContaining({ category: "late_fee_timing", amountCents: 5000, basis: "lease", ruleId: null }),
    ]);
  });

  it("flags a fee on the last grace day (boundary: due 1 + 5 days = 6th)", () => {
    expect(checkLateFees(extraction([lateFee("f", "2026-03-06", 5000)]), [])[0]?.category).toBe("late_fee_timing");
  });

  it("allows a fee the day after the grace period ends", () => {
    expect(checkLateFees(extraction([lateFee("f", "2026-03-07", 5000)]), [])).toEqual([]);
  });

  it("uses a longer verified grace rule and cites it", () => {
    const rule = graceRule(8, { id: "zz-grace-8" });
    const findings = checkLateFees(extraction([lateFee("f", "2026-03-09", 5000)]), [rule]);
    expect(findings[0]).toMatchObject({ category: "late_fee_timing", basis: "rule", ruleId: "zz-grace-8", citation: rule.citation });
  });

  it("keeps the lease grace period when the rule is shorter", () => {
    expect(checkLateFees(extraction([lateFee("f", "2026-03-06", 5000)]), [graceRule(2)])[0]?.basis).toBe("lease");
  });

  it("ignores an unverified grace rule", () => {
    expect(checkLateFees(extraction([lateFee("f", "2026-03-09", 5000)]), [graceRule(8, { status: "draft" })])).toEqual([]);
  });
});

describe("checkLateFees: amount", () => {
  it("flags the excess over the lease's flat late fee", () => {
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 7500)]), [])).toEqual([
      expect.objectContaining({ category: "late_fee_amount", amountCents: 2500, basis: "lease" }),
    ]);
  });

  it("allows a fee exactly at the lease amount (boundary)", () => {
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 5000)]), [])).toEqual([]);
  });

  it("computes a percent-of-rent lease fee in integer cents", () => {
    const terms = lease({ lateFee: { kind: "percent_of_rent", basisPoints: 500 } }); // 5% of 150000 = 7500
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 7500)], { lease: terms }), [])).toEqual([]);
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 7600)], { lease: terms }), [])[0]?.amountCents).toBe(100);
  });

  it("applies a verified flat cap that is lower than the lease and cites the rule", () => {
    const rule = capRule({ maxFlatCents: 2500, maxPercentOfRentBps: null, whenBoth: "lesser" }, { id: "zz-cap-25" });
    const findings = checkLateFees(extraction([lateFee("f", "2026-03-10", 5000)]), [rule]);
    expect(findings[0]).toMatchObject({ category: "late_fee_amount", amountCents: 2500, basis: "rule", ruleId: "zz-cap-25" });
  });

  it("combines flat and percent caps per whenBoth", () => {
    // 1% of 150000 = 1500; flat 3000.
    const params = { maxFlatCents: 3000, maxPercentOfRentBps: 100 };
    const lesser = capRule({ ...params, whenBoth: "lesser" });
    const greater = capRule({ ...params, whenBoth: "greater" });
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 5000)]), [lesser])[0]?.amountCents).toBe(3500);
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 5000)]), [greater])[0]?.amountCents).toBe(2000);
  });

  it("applies a percent-only cap", () => {
    // 2% of 150000 = 3000
    const rule = capRule({ maxFlatCents: null, maxPercentOfRentBps: 200, whenBoth: "lesser" });
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 5000)]), [rule])[0]?.amountCents).toBe(2000);
  });

  it("ignores a cap rule that sets no cap at all", () => {
    const rule = capRule({ maxFlatCents: null, maxPercentOfRentBps: null, whenBoth: "lesser" });
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 5000)]), [rule])).toEqual([]);
  });

  it("keeps the lease limit when the law cap is higher", () => {
    const rule = capRule({ maxFlatCents: 10000, maxPercentOfRentBps: null, whenBoth: "lesser" });
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 7500)]), [rule])[0]).toMatchObject({ amountCents: 2500, basis: "lease" });
  });

  it("prefers the city cap over the state cap", () => {
    const state = capRule({ maxFlatCents: 4000, maxPercentOfRentBps: null, whenBoth: "lesser" }, { id: "state" });
    const city = capRule({ maxFlatCents: 2500, maxPercentOfRentBps: null, whenBoth: "lesser" }, { id: "city", place: ZZ_TESTVILLE });
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 5000)]), [state, city])[0]).toMatchObject({ ruleId: "city", amountCents: 2500 });
  });
});

describe("checkLateFees: no late-fee clause (prototype regression)", () => {
  it("treats any late fee as unauthorized and invents no cap", () => {
    const terms = lease({ lateFee: null });
    expect(checkLateFees(extraction([lateFee("f", "2026-03-10", 5000)], { lease: terms }), [])).toEqual([
      expect.objectContaining({ category: "unauthorized_fee", amountCents: 5000, basis: "lease" }),
    ]);
  });
});

describe("checkLateFees: grace periods across month ends", () => {
  it("allows a fee for last month's rent once that grace period has ended (due 28th + 5 days = Feb 2)", () => {
    const ext = extraction([lateFee("f", "2026-02-06", 5000)], { lease: lease({ dueDay: 28 }) });
    expect(checkLateFees(ext, [])).toEqual([]);
  });

  it("flags a fee inside a grace period that runs into the next month", () => {
    const ext = extraction([lateFee("f", "2026-02-02", 5000)], { lease: lease({ dueDay: 28 }) });
    expect(checkLateFees(ext, [])[0]?.category).toBe("late_fee_timing");
  });

  it("uses the last day of a short month when the due day doesn't exist (due 31st, Feb has 28 days)", () => {
    const terms = lease({ dueDay: 31, gracePeriodDays: 0 });
    expect(checkLateFees(extraction([lateFee("f", "2026-02-28", 5000)], { lease: terms }), [])[0]?.category).toBe(
      "late_fee_timing",
    );
    expect(checkLateFees(extraction([lateFee("f", "2026-03-01", 5000)], { lease: terms }), [])).toEqual([]);
  });

  it("treats a fee posted before this month's due day as belonging to last month's rent", () => {
    const ext = extraction([lateFee("f", "2026-03-03", 5000)], { lease: lease({ dueDay: 5, gracePeriodDays: 3 }) });
    expect(checkLateFees(ext, [])).toEqual([]);
  });
});
