import { describe, expect, it } from "vitest";
import { MINIMUM_FEE_CENTS, UNLOCK_FEE_BASIS_POINTS, computeUnlockFeeCents, feeKind, netRecoveryCents, requiresCheckout, unlockDecision } from "@/lib/pricing";

describe("computeUnlockFeeCents: max(15% of owed, $0.50), free under $0.50 owed", () => {
  it("is 15% with a 50-cent floor", () => {
    expect(UNLOCK_FEE_BASIS_POINTS).toBe(1500);
    expect(MINIMUM_FEE_CENTS).toBe(50);
    expect(computeUnlockFeeCents(64000)).toBe(9600);
  });

  it.each([
    [0, 0],
    [49, 0],
    [50, 50],
    [333, 50],
    [334, 50],
    [1_000_000, 150_000],
  ])("boundary: %i cents owed -> %i cents fee", (owed, fee) => {
    expect(computeUnlockFeeCents(owed)).toBe(fee);
  });

  it("rounds half up to the cent above the floor", () => {
    // 15% of 1010 = 151.5 -> 152; 15% of 1003 = 150.45 -> 150
    expect(computeUnlockFeeCents(1010)).toBe(152);
    expect(computeUnlockFeeCents(1003)).toBe(150);
  });

  it("rejects negative or fractional input", () => {
    expect(() => computeUnlockFeeCents(-1)).toThrow(RangeError);
    expect(() => computeUnlockFeeCents(10.5)).toThrow(RangeError);
  });
});

describe("requiresCheckout", () => {
  it("is false for a $0 fee and true for any positive fee", () => {
    expect(requiresCheckout(0)).toBe(false);
    expect(requiresCheckout(50)).toBe(true);
  });
});

describe("netRecoveryCents", () => {
  it("is the owed total minus the fee", () => {
    expect(netRecoveryCents(64000)).toBe(54400);
    expect(netRecoveryCents(50)).toBe(0);
    expect(netRecoveryCents(0)).toBe(0);
  });
});

describe("unlockDecision", () => {
  it.each([
    [0, { kind: "clean", feeCents: 0 }],
    [1, { kind: "free_below_minimum", feeCents: 0 }],
    [49, { kind: "free_below_minimum", feeCents: 0 }],
    [50, { kind: "checkout", feeCents: 50, minimumApplied: true }],
    [329, { kind: "checkout", feeCents: 50, minimumApplied: true }],
    [333, { kind: "checkout", feeCents: 50, minimumApplied: false }],
    [334, { kind: "checkout", feeCents: 50, minimumApplied: false }],
    [1_000_000, { kind: "checkout", feeCents: 150_000, minimumApplied: false }],
  ])("boundary: %i cents owed", (owed, decision) => {
    expect(unlockDecision(owed)).toEqual(decision);
  });
});

describe("feeKind (which fee copy the result page and report show)", () => {
  it.each([
    [0, 0, "none"],
    [49, 0, "free_below_minimum"],
    [50, 50, "minimum"],
    [329, 50, "minimum"],
    [333, 50, "percent"],
    [1_000_000, 150_000, "percent"],
  ] as const)("%i owed with fee %i -> %s", (owed, fee, kind) => {
    expect(feeKind(owed, fee)).toBe(kind);
  });
});
