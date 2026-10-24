import { describe, expect, it } from "vitest";
import { compareText, dayOfMonth, sortLedger } from "@/lib/rules-engine/ledger";
import { line } from "@/lib/rules-engine/test-helpers";

describe("sortLedger", () => {
  it("orders by date, then source sequence, without mutating the input", () => {
    const input = [
      line({ id: "c", date: "2026-02-01", sequence: 2 }),
      line({ id: "b", date: "2026-01-01", sequence: 1 }),
      line({ id: "a", date: "2026-01-01", sequence: 0 }),
    ];
    expect(sortLedger(input).map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(input.map((l) => l.id)).toEqual(["c", "b", "a"]);
  });

  it("breaks a full tie (same date and sequence) by id", () => {
    const input = [line({ id: "y", date: "2026-01-01" }), line({ id: "x", date: "2026-01-01" })];
    expect(sortLedger(input).map((l) => l.id)).toEqual(["x", "y"]);
  });
});

describe("compareText", () => {
  it("is a plain code-unit comparison", () => {
    expect(compareText("a", "b")).toBe(-1);
    expect(compareText("b", "a")).toBe(1);
    expect(compareText("a", "a")).toBe(0);
  });
});

describe("dayOfMonth", () => {
  it("reads the day from an ISO date", () => {
    expect(dayOfMonth("2026-03-06")).toBe(6);
    expect(dayOfMonth("2026-03-31")).toBe(31);
  });
});
