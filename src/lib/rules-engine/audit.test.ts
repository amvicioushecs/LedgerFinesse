import { describe, expect, it } from "vitest";
import { audit } from "@/lib/rules-engine/audit";
import { capRule, extraction, feeBanRule, graceRule, lease, line } from "@/lib/rules-engine/test-helpers";

const ledger = [
  line({ id: "rent-jan", date: "2026-01-01", sequence: 0, category: "rent", amountCents: 150000, reportedBalanceCents: 150000 }),
  line({ id: "tech-jan", date: "2026-01-01", sequence: 1, category: "fee", description: "Tech Fee", amountCents: 1800, reportedBalanceCents: 151800 }),
  line({ id: "late-jan", date: "2026-01-03", sequence: 2, category: "late_fee", amountCents: 5000, reportedBalanceCents: 156800 }),
  line({ id: "pay-jan", date: "2026-01-04", sequence: 3, kind: "payment", category: "payment", amountCents: 150000, reportedBalanceCents: 6800 }),
];
const rules = [graceRule(3), capRule({ maxFlatCents: 4000, maxPercentOfRentBps: null, whenBoth: "lesser" }), feeBanRule(["Pool Fee"])];

describe("audit", () => {
  it("returns sorted findings, the total, and a per-category preview summary", () => {
    const result = audit(extraction(ledger), rules);
    expect(result.findings.map((f) => [f.ledgerLineId, f.category, f.amountCents])).toEqual([
      ["tech-jan", "unauthorized_fee", 1800],
      ["late-jan", "late_fee_timing", 5000],
    ]);
    expect(result.totalFoundCents).toBe(6800);
    expect(result.previewSummary).toEqual([
      { category: "late_fee_timing", count: 1, amountCents: 5000 },
      { category: "unauthorized_fee", count: 1, amountCents: 1800 },
    ]);
  });

  it("totals equal the sum of findings", () => {
    const result = audit(extraction(ledger), rules);
    expect(result.totalFoundCents).toBe(result.findings.reduce((s, f) => s + f.amountCents, 0));
  });

  it("returns an empty, zero result for a clean ledger", () => {
    expect(audit(extraction([ledger[0]!]), rules)).toEqual({ findings: [], totalFoundCents: 0, previewSummary: [] });
  });

  it("is deterministic: same input gives byte-identical output", () => {
    expect(JSON.stringify(audit(extraction(ledger), rules))).toBe(JSON.stringify(audit(extraction(ledger), rules)));
  });

  it("is order-independent: shuffled ledger and rules give the same result", () => {
    const shuffled = extraction([ledger[3]!, ledger[1]!, ledger[0]!, ledger[2]!]);
    expect(audit(shuffled, [...rules].reverse())).toEqual(audit(extraction(ledger), rules));
  });

  it("does not mutate its input", () => {
    const input = extraction(ledger);
    const before = JSON.stringify(input);
    audit(input, rules);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    ["fractional cents", { amountCents: 10.5 }],
    ["negative amount", { amountCents: -100 }],
    ["bad date", { date: "03/01/2026" }],
    ["confidence above 1", { confidence: 1.2 }],
  ])("rejects %s", (_label, overrides) => {
    const bad = line({ id: "bad", date: "2026-03-01", amountCents: 100, ...overrides });
    expect(() => audit(extraction([bad]), [])).toThrow(RangeError);
  });

  it("rejects a printed balance that isn't whole cents", () => {
    const bad = line({ id: "bad", date: "2026-03-01", amountCents: 100, reportedBalanceCents: 100.5 });
    expect(() => audit(extraction([bad]), [])).toThrow(RangeError);
  });

  it.each([
    ["due day 0", { lease: lease({ dueDay: 0 }) }],
    ["due day 32", { lease: lease({ dueDay: 32 }) }],
    ["fractional grace period", { lease: lease({ gracePeriodDays: 2.5 }) }],
    ["negative rent", { lease: lease({ monthlyRentCents: -1 }) }],
    ["fractional opening balance", { openingBalanceCents: 1.5 }],
  ])("rejects %s", (_label, overrides) => {
    expect(() => audit(extraction([], overrides), [])).toThrow(RangeError);
  });

  it("accepts a negative opening balance (a credit carried in)", () => {
    expect(audit(extraction([], { openingBalanceCents: -2500 }), []).totalFoundCents).toBe(0);
  });
});
