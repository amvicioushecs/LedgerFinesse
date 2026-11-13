import { describe, expect, it } from "vitest";
import { audit } from "@/lib/rules-engine/audit";
import { isVerified } from "@/lib/rules-engine/rules";
import type { Extraction } from "@/lib/rules-engine/types";
import { getJurisdiction, JURISDICTION_KEYS, lawNotes, retaliationStatute, rulesFor, shownStatutes } from "@/lib/jurisdictions";

describe("jurisdiction database", () => {
  it("has the four places from Hector's app", () => {
    expect(JURISDICTION_KEYS).toEqual(["san-diego-ca", "los-angeles-ca", "austin-tx", "new-york-ny"]);
  });

  it("every verified statute carries an official https source and a verification date", () => {
    for (const key of JURISDICTION_KEYS) {
      for (const s of getJurisdiction(key).statutes.filter((s) => s.verified)) {
        expect(s.sourceUrl, s.citation).toMatch(/^https:\/\//);
        expect(s.verifiedAt, s.citation).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("only shows verified statutes as law", () => {
    const ny = shownStatutes("new-york-ny");
    expect(ny.map((s) => s.citation)).not.toContain("NY Real Prop. Law § 235-bb");
    expect(ny.every((s) => s.verified)).toBe(true);
  });

  it("keeps the wrong NY § 235-bb entry, marked unverified", () => {
    const entry = getJurisdiction("new-york-ny").statutes.find((s) => s.citation.includes("235-bb"));
    expect(entry?.verified).toBe(false);
  });

  it("never describes § 1671(d) as a grace-period rule", () => {
    for (const key of ["san-diego-ca", "los-angeles-ca"] as const) {
      const s = getJurisdiction(key).statutes.find((x) => x.citation.includes("1671"));
      expect(s?.summary.en).not.toMatch(/grace/i);
      expect(s?.role).toBe("late_fee_enforceability");
    }
  });

  it("produces engine rules only from verified entries, all passing isVerified", () => {
    for (const key of JURISDICTION_KEYS) for (const rule of rulesFor(key)) expect(isVerified(rule)).toBe(true);
    expect(rulesFor("san-diego-ca")).toEqual([]);
    expect(rulesFor("austin-tx").map((r) => r.ruleType)).toEqual(["grace_period"]);
    expect(rulesFor("new-york-ny").map((r) => r.ruleType)).toEqual(["late_fee_cap"]);
  });

  it("applies the NY $50 or 5% (lesser) cap through the real engine", () => {
    const extraction: Extraction = {
      place: { stateCode: "NY", city: "New York" },
      lease: { startDate: "2026-01-01", endDate: null, monthlyRentCents: 300000, dueDay: 1, gracePeriodDays: 5, lateFee: { kind: "flat", amountCents: 10000 }, authorizedFees: [] },
      openingBalanceCents: 0,
      ledger: [{ id: "lf", sequence: 0, date: "2026-03-10", description: "Late Fee", kind: "charge", category: "late_fee", amountCents: 10000, reportedBalanceCents: null, confidence: 1 }],
    };
    const result = audit(extraction, rulesFor("new-york-ny"));
    expect(result.findings).toEqual([expect.objectContaining({ category: "late_fee_amount", amountCents: 5000, basis: "rule", citation: "NY Real Prop. Law § 238-a(2)" })]);
  });

  it("exposes a verified retaliation statute where one exists", () => {
    expect(retaliationStatute("san-diego-ca")?.citation).toBe("CA Civ. Code § 1942.5");
    expect(retaliationStatute("new-york-ny")).toBeNull();
  });

  it("gives late-fee law notes for California", () => {
    expect(lawNotes("san-diego-ca", "late_fee_amount").map((s) => s.citation)).toEqual(["CA Civ. Code § 1671(d)"]);
    expect(lawNotes("austin-tx", "math_balance_error")).toEqual([]);
  });
});
