import { describe, expect, it } from "vitest";
import { computeUnlockFeeCents, netRecoveryCents, requiresCheckout, UNLOCK_FEE_BASIS_POINTS } from "@/lib/pricing";

describe("computeUnlockFeeCents", () => {
  it("is one flat 15%", () => {
    expect(UNLOCK_FEE_BASIS_POINTS).toBe(1500);
    expect(computeUnlockFeeCents(64000)).toBe(9600);
  });

  it("rounds half up to the cent", () => {
    // 15% of 1010 = 151.5 -> 152
    expect(computeUnlockFeeCents(1010)).toBe(152);
    // 15% of 1003 = 150.45 -> 150
    expect(computeUnlockFeeCents(1003)).toBe(150);
  });

  it("charges nothing when nothing was found", () => {
    expect(computeUnlockFeeCents(0)).toBe(0);
    expect(computeUnlockFeeCents(0, { minimumFeeCents: 500 })).toBe(0);
  });

  it("has no minimum by default (open decision), so 3 cents found -> $0 fee", () => {
    expect(computeUnlockFeeCents(3)).toBe(0);
  });

  it("applies a minimum only when one is passed", () => {
    expect(computeUnlockFeeCents(1000, { minimumFeeCents: 500 })).toBe(500);
    expect(computeUnlockFeeCents(64000, { minimumFeeCents: 500 })).toBe(9600);
  });

  it("rejects negative or fractional input", () => {
    expect(() => computeUnlockFeeCents(-1)).toThrow(RangeError);
    expect(() => computeUnlockFeeCents(10.5)).toThrow(RangeError);
    expect(() => computeUnlockFeeCents(100, { minimumFeeCents: -5 })).toThrow(RangeError);
  });
});

describe("requiresCheckout", () => {
  it("is false for a $0 fee and true for any positive fee", () => {
    expect(requiresCheckout(0)).toBe(false);
    expect(requiresCheckout(1)).toBe(true);
  });
});

describe("netRecoveryCents", () => {
  it("is the owed total minus the fee", () => {
    expect(netRecoveryCents(64000)).toBe(54400);
    expect(netRecoveryCents(0)).toBe(0);
  });
});
