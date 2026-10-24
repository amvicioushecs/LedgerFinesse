import { describe, expect, it } from "vitest";
import { computeUnlockFeeCents, UNLOCK_FEE_BASIS_POINTS } from "@/lib/pricing";

describe("computeUnlockFeeCents", () => {
  it("is 25%", () => {
    expect(UNLOCK_FEE_BASIS_POINTS).toBe(2500);
    expect(computeUnlockFeeCents(57600)).toBe(14400);
  });

  it("rounds half up to the cent", () => {
    expect(computeUnlockFeeCents(1001)).toBe(250);
  });

  it("charges nothing when nothing was found", () => {
    expect(computeUnlockFeeCents(0)).toBe(0);
    expect(computeUnlockFeeCents(0, { minimumFeeCents: 500 })).toBe(0);
  });

  it("has no minimum by default (open decision), so 1 cent found -> $0 fee", () => {
    expect(computeUnlockFeeCents(1)).toBe(0);
  });

  it("applies a minimum only when one is passed", () => {
    expect(computeUnlockFeeCents(1000, { minimumFeeCents: 500 })).toBe(500);
    expect(computeUnlockFeeCents(57600, { minimumFeeCents: 500 })).toBe(14400);
  });

  it("rejects negative or fractional input", () => {
    expect(() => computeUnlockFeeCents(-1)).toThrow(RangeError);
    expect(() => computeUnlockFeeCents(10.5)).toThrow(RangeError);
    expect(() => computeUnlockFeeCents(100, { minimumFeeCents: -5 })).toThrow(RangeError);
  });
});
