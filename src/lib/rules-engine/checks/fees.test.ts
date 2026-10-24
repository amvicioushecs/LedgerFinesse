import { describe, expect, it } from "vitest";
import { checkJunkFees, feeNameMatches, normalizeFeeName } from "@/lib/rules-engine/checks/fees";
import { extraction, feeBanRule, lease, line } from "@/lib/rules-engine/test-helpers";

const fee = (id: string, description: string, amountCents: number) =>
  line({ id, date: "2026-03-01", category: "fee", description, amountCents });

describe("normalizeFeeName / feeNameMatches", () => {
  it("treats 'Tech Fee' and 'Technology Fee' as the same fee", () => {
    expect(normalizeFeeName("Tech Fee")).toBe("technology");
    expect(normalizeFeeName("Technology Fee")).toBe("technology");
    expect(feeNameMatches("Resident Tech Portal Access Fee", "Technology Fee")).toBe(true);
  });

  it("matches whole words only", () => {
    expect(feeNameMatches("Pet Rent", "Carpet Fee")).toBe(false);
  });

  it("never matches an empty or filler-only name", () => {
    expect(feeNameMatches("Any fee", "Fee")).toBe(false);
  });

  it("is safe for words that are Object prototype keys", () => {
    expect(normalizeFeeName("constructor fee")).toBe("constructor");
  });
});

describe("checkJunkFees", () => {
  it("flags a fee the lease doesn't authorize, full amount", () => {
    expect(checkJunkFees(extraction([fee("f", "Pool Key Fee", 2500)]), [])).toEqual([
      expect.objectContaining({ category: "unauthorized_fee", amountCents: 2500, basis: "lease" }),
    ]);
  });

  it("allows a fee the lease authorizes at that amount (fuzzy name)", () => {
    const terms = lease({ authorizedFees: [{ name: "Technology Fee", amountCents: 1500 }] });
    expect(checkJunkFees(extraction([fee("f", "Tech Fee", 1500)], { lease: terms }), [])).toEqual([]);
  });

  it("flags only the excess over an authorized fixed amount", () => {
    const terms = lease({ authorizedFees: [{ name: "Technology Fee", amountCents: 1500 }] });
    expect(checkJunkFees(extraction([fee("f", "Tech Fee", 2000)], { lease: terms }), [])[0]?.amountCents).toBe(500);
  });

  it("allows any amount when the lease authorizes the fee with no fixed amount", () => {
    const terms = lease({ authorizedFees: [{ name: "Key Replacement", amountCents: null }] });
    expect(checkJunkFees(extraction([fee("f", "Key replacement fee", 9900)], { lease: terms }), [])).toEqual([]);
  });

  it("flags a fee banned by a verified rule even when the lease authorizes it (law wins)", () => {
    const terms = lease({ authorizedFees: [{ name: "Convenience Fee", amountCents: 300 }] });
    const ban = feeBanRule(["Convenience Fee"], { id: "zz-ban" });
    expect(checkJunkFees(extraction([fee("f", "Online Convenience Fee", 300)], { lease: terms }), [ban])[0]).toMatchObject({
      amountCents: 300,
      basis: "rule",
      ruleId: "zz-ban",
      citation: ban.citation,
    });
  });

  it("ignores a draft fee ban", () => {
    const terms = lease({ authorizedFees: [{ name: "Convenience Fee", amountCents: 300 }] });
    const draft = feeBanRule(["Convenience Fee"], { status: "draft" });
    expect(checkJunkFees(extraction([fee("f", "Convenience Fee", 300)], { lease: terms }), [draft])).toEqual([]);
  });

  it("only looks at lines categorized as fees", () => {
    expect(checkJunkFees(extraction([line({ id: "r", date: "2026-03-01", category: "rent", amountCents: 999 })]), [])).toEqual([]);
  });
});
