import { describe, expect, it } from "vitest";
import { checkLedgerMath } from "@/lib/rules-engine/checks/ledger-math";
import { extraction, line } from "@/lib/rules-engine/test-helpers";

describe("checkLedgerMath", () => {
  it("finds nothing when every printed balance is correct", () => {
    const ledger = [
      line({ id: "r1", date: "2026-01-01", sequence: 0, amountCents: 150000, reportedBalanceCents: 150000 }),
      line({ id: "p1", date: "2026-01-02", sequence: 1, kind: "payment", category: "payment", amountCents: 150000, reportedBalanceCents: 0 }),
    ];
    expect(checkLedgerMath(extraction(ledger))).toEqual([]);
  });

  it("flags an uncredited payment once, not on every later line", () => {
    const ledger = [
      line({ id: "r1", date: "2026-01-01", sequence: 0, amountCents: 150000, reportedBalanceCents: 150000 }),
      line({ id: "p1", date: "2026-01-02", sequence: 1, kind: "payment", category: "payment", amountCents: 150000, reportedBalanceCents: 150000 }),
      line({ id: "r2", date: "2026-02-01", sequence: 2, amountCents: 150000, reportedBalanceCents: 300000 }),
    ];
    const findings = checkLedgerMath(extraction(ledger));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ category: "math_balance_error", ledgerLineId: "p1", amountCents: 150000, basis: "math", citation: null });
  });

  it("flags a second, larger error only for the increase", () => {
    const ledger = [
      line({ id: "r1", date: "2026-01-01", sequence: 0, amountCents: 1000, reportedBalanceCents: 1050 }),
      line({ id: "r2", date: "2026-02-01", sequence: 1, amountCents: 1000, reportedBalanceCents: 2080 }),
    ];
    expect(checkLedgerMath(extraction(ledger)).map((f) => [f.ledgerLineId, f.amountCents])).toEqual([
      ["r1", 50],
      ["r2", 30],
    ]);
  });

  it("starts from the opening balance (carried-forward balance)", () => {
    const ledger = [line({ id: "r1", date: "2026-01-01", sequence: 0, amountCents: 1000, reportedBalanceCents: 1500 })];
    expect(checkLedgerMath(extraction(ledger, { openingBalanceCents: 500 }))).toEqual([]);
    expect(checkLedgerMath(extraction(ledger, { openingBalanceCents: 0 }))[0]?.amountCents).toBe(500);
  });

  it("ignores drift in the renter's favor", () => {
    const ledger = [line({ id: "r1", date: "2026-01-01", sequence: 0, amountCents: 1000, reportedBalanceCents: 900 })];
    expect(checkLedgerMath(extraction(ledger))).toEqual([]);
  });

  it("skips lines with no printed balance but still counts their amounts", () => {
    const ledger = [
      line({ id: "r1", date: "2026-01-01", sequence: 0, amountCents: 1000, reportedBalanceCents: null }),
      line({ id: "r2", date: "2026-01-01", sequence: 1, amountCents: 500, reportedBalanceCents: 1500 }),
    ];
    expect(checkLedgerMath(extraction(ledger))).toEqual([]);
  });

  it("uses source sequence, not array order, for same-day lines", () => {
    const ledger = [
      line({ id: "b", date: "2026-01-01", sequence: 1, amountCents: 500, reportedBalanceCents: 1500 }),
      line({ id: "a", date: "2026-01-01", sequence: 0, amountCents: 1000, reportedBalanceCents: 1000 }),
    ];
    expect(checkLedgerMath(extraction(ledger))).toEqual([]);
  });
});
