import { describe, expect, it } from "vitest";
import { assertCents, percentOfCents } from "@/lib/money";

describe("assertCents", () => {
  it("returns valid integer cents unchanged", () => {
    expect(assertCents(0)).toBe(0);
    expect(assertCents(57600)).toBe(57600);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects %s", (value) => {
    expect(() => assertCents(value)).toThrow(RangeError);
  });
});

describe("percentOfCents", () => {
  it("computes 25% exactly when divisible", () => {
    expect(percentOfCents(57600, 2500)).toBe(14400);
  });

  it("rounds half up to the cent", () => {
    expect(percentOfCents(1001, 2500)).toBe(250); // 250.25
    expect(percentOfCents(1002, 2500)).toBe(251); // 250.5
    expect(percentOfCents(1003, 2500)).toBe(251); // 250.75
  });

  it("rejects non-integer basis points", () => {
    expect(() => percentOfCents(100, 12.5)).toThrow(RangeError);
  });
});
