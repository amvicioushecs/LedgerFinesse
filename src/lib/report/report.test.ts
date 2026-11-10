import { describe, expect, it } from "vitest";
import { audit } from "@/lib/rules-engine/audit";
import { rulesFor } from "@/lib/jurisdictions";
import { SAMPLE_CASE } from "@/content/sample-case";
import { buildReport, freeSummary } from "@/lib/report";

describe("sample San Diego case through the real engine", () => {
  const result = audit(SAMPLE_CASE.extraction, rulesFor(SAMPLE_CASE.jurisdiction));
  const report = buildReport(SAMPLE_CASE.extraction, result, { jurisdiction: SAMPLE_CASE.jurisdiction, leaseRefs: SAMPLE_CASE.leaseRefs });

  it("finds $640 across five grouped items", () => {
    expect(result.totalFoundCents).toBe(64000);
    expect(report.totalOwedCents).toBe(64000);
    expect(report.items.map((i) => [i.category, i.owedCents, i.lineCount])).toEqual([
      ["unauthorized_fee", 15000, 10],
      ["late_fee_timing", 15000, 1],
      ["math_balance_error", 18500, 1],
      ["unauthorized_fee", 7500, 3],
      ["unauthorized_fee", 8000, 2],
    ]);
  });

  it("orders items by first date (ledger order) and keeps charged = allowed + owed", () => {
    const math = report.items[2];
    expect(math).toMatchObject({ chargedCents: 263500, allowedCents: 245000, firstDate: "2026-08-01" });
    for (const item of report.items) expect(item.chargedCents - item.allowedCents).toBe(item.owedCents);
  });

  it("cites lease sections, never § 1671(d), as the basis; § 1671(d) is only a note on the late fee", () => {
    expect(report.items[1].leaseRef).toBe("Lease § 4");
    expect(report.items[0].leaseRef).toBe("Lease § 11");
    expect(report.items.every((i) => !(i.citation ?? "").includes("1671"))).toBe(true);
    expect(report.items[1].lawNotes.map((n) => n.citation)).toEqual(["CA Civ. Code § 1671(d)"]);
    expect(report.items[2].lawNotes).toEqual([]);
  });

  it("free summary exposes only count, total and line count", () => {
    expect(freeSummary(report)).toEqual({ itemCount: 5, totalOwedCents: 64000, linesScanned: SAMPLE_CASE.extraction.ledger.length });
  });
});

describe("buildReport on a clean ledger", () => {
  it("returns zero items and zero owed", () => {
    const extraction = { ...SAMPLE_CASE.extraction, ledger: SAMPLE_CASE.extraction.ledger.filter((l) => l.category === "rent" && l.date < "2026-03-01") };
    const result = audit({ ...extraction, ledger: extraction.ledger.map((l) => ({ ...l, reportedBalanceCents: null })) }, []);
    const report = buildReport(extraction, result, { jurisdiction: "san-diego-ca" });
    expect(report.items).toEqual([]);
    expect(report.totalOwedCents).toBe(0);
  });
});
