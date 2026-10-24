import { describe, expect, it } from "vitest";
import { checkRentIncreases } from "@/lib/rules-engine/checks/rent";
import { extraction, lease, line } from "@/lib/rules-engine/test-helpers";

const terms = lease({ startDate: "2026-01-01", endDate: "2026-12-31", monthlyRentCents: 100000 });
const rent = (id: string, date: string, amountCents: number) =>
  line({ id, date, category: "rent", amountCents, description: "Monthly rent" });

describe("checkRentIncreases", () => {
  it("flags a mid-lease increase for the difference", () => {
    const findings = checkRentIncreases(extraction([rent("feb", "2026-02-01", 110000)], { lease: terms }));
    expect(findings).toEqual([
      expect.objectContaining({ category: "unauthorized_rent_increase", ledgerLineId: "feb", amountCents: 10000, basis: "lease" }),
    ]);
  });

  it("does not flag rent equal to the lease rent", () => {
    expect(checkRentIncreases(extraction([rent("jan", "2026-01-01", 100000)], { lease: terms }))).toEqual([]);
  });

  it("does not flag a prorated (lower) first month", () => {
    expect(checkRentIncreases(extraction([rent("jan", "2026-01-15", 54839)], { lease: terms }))).toEqual([]);
  });

  it("does not flag rent after the lease ends", () => {
    expect(checkRentIncreases(extraction([rent("next", "2027-01-01", 120000)], { lease: terms }))).toEqual([]);
  });

  it("treats a null end date as an ongoing term", () => {
    const open = lease({ ...terms, endDate: null });
    expect(checkRentIncreases(extraction([rent("x", "2030-01-01", 100100)], { lease: open }))[0]?.amountCents).toBe(100);
  });

  it("ignores non-rent lines and payments", () => {
    const ledger = [
      line({ id: "fee", date: "2026-02-01", category: "fee", amountCents: 200000 }),
      line({ id: "pay", date: "2026-02-02", kind: "payment", category: "rent", amountCents: 200000 }),
    ];
    expect(checkRentIncreases(extraction(ledger, { lease: terms }))).toEqual([]);
  });
});
