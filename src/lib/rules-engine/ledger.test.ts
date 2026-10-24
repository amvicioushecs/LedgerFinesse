import { describe, expect, it } from "vitest";
import { compareText, lastGraceDay, sortLedger } from "@/lib/rules-engine/ledger";
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

describe("lastGraceDay", () => {
  it("adds the grace days to this month's due date", () => {
    expect(lastGraceDay("2026-03-04", 1, 5)).toBe("2026-03-06");
  });

  it("uses last month's due date when the charge comes before this month's due day", () => {
    expect(lastGraceDay("2026-03-03", 5, 3)).toBe("2026-02-08");
  });

  it("rolls the grace period into the next month", () => {
    expect(lastGraceDay("2026-02-06", 28, 5)).toBe("2026-02-02");
    expect(lastGraceDay("2026-12-30", 28, 5)).toBe("2027-01-02");
  });

  it("moves a due day the month doesn't have to its last day", () => {
    expect(lastGraceDay("2026-02-28", 31, 0)).toBe("2026-02-28");
    expect(lastGraceDay("2028-02-29", 31, 0)).toBe("2028-02-29");
    expect(lastGraceDay("2026-03-01", 31, 0)).toBe("2026-02-28");
  });

  it("crosses the year boundary backwards", () => {
    expect(lastGraceDay("2026-01-02", 5, 3)).toBe("2025-12-08");
  });
});
