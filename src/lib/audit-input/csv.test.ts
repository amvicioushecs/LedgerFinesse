import { describe, expect, it } from "vitest";
import { inferCategory, ledgerFromCsv, parseCsv, toCsv } from "@/lib/audit-input/csv";
import { parseLedgerDate } from "@/lib/audit-input/dates";
import { formatCents, parseDollarsToCents } from "@/lib/audit-input/money";

describe("parseDollarsToCents", () => {
  it.each([
    ["$1,234.56", 123456, false],
    ["1234.5", 123450, false],
    ["(45.00)", 4500, true],
    ["-45", 4500, true],
    ["45.00 CR", 4500, true],
    [".07", 7, false],
  ])("%s", (raw, cents, negative) => {
    expect(parseDollarsToCents(raw)).toEqual({ cents, negative });
  });

  it.each(["", "abc", "1.234", "12.3.4"])("rejects %j", (raw) => {
    expect(parseDollarsToCents(raw)).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats with separators and sign", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-500)).toBe("-$5.00");
  });
});

describe("parseLedgerDate", () => {
  it("parses ISO and US dates", () => {
    expect(parseLedgerDate("2026-03-01")).toBe("2026-03-01");
    expect(parseLedgerDate("3/1/2026")).toBe("2026-03-01");
    expect(parseLedgerDate("03/01/26")).toBe("2026-03-01");
  });

  it("rejects impossible dates", () => {
    expect(parseLedgerDate("2026-02-30")).toBeNull();
    expect(parseLedgerDate("13/01/2026")).toBeNull();
    expect(parseLedgerDate("soon")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("handles quotes, embedded commas and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("accepts tab-separated paste", () => {
    expect(parseCsv("Date\tAmount\n3/1/2026\t100")).toEqual([
      ["Date", "Amount"],
      ["3/1/2026", "100"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["x", 'a "b"', "c,d"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("inferCategory", () => {
  it.each([
    ["Monthly Rent", "rent"],
    ["Late Fee", "late_fee"],
    ["Rent late charge", "late_fee"],
    ["Technology Fee", "fee"],
    ["Water/Sewer", "utility"],
    ["Pet Rent", "pet"],
    ["Garage", "parking"],
  ] as const)("%s -> %s", (description, category) => {
    expect(inferCategory(description, "charge")).toBe(category);
  });
});

describe("ledgerFromCsv", () => {
  it("reads separate charge and payment columns", () => {
    const { lines, errors } = ledgerFromCsv(
      "Date,Description,Charges,Payments,Balance\n" +
        "03/01/2026,Rent,\"1,500.00\",,1500.00\n" +
        "03/03/2026,Online Payment,,1500.00,0.00\n" +
        "03/04/2026,Rent Concession,,50.00,-50.00\n",
    );
    expect(errors).toEqual([]);
    expect(lines.map((l) => [l.date, l.kind, l.category, l.amountCents, l.reportedBalanceCents, l.sequence])).toEqual([
      ["2026-03-01", "charge", "rent", 150000, 150000, 0],
      ["2026-03-03", "payment", "payment", 150000, 0, 1],
      ["2026-03-04", "credit", "payment", 5000, -5000, 2],
    ]);
  });

  it("reads a single signed amount column", () => {
    const { lines } = ledgerFromCsv("date,memo,amount\n2026-03-06,Late Fee,75\n2026-03-07,Payment,-75\n");
    expect(lines.map((l) => [l.kind, l.category, l.amountCents, l.reportedBalanceCents])).toEqual([
      ["charge", "late_fee", 7500, null],
      ["payment", "payment", 7500, null],
    ]);
  });

  it("reports a missing header column", () => {
    expect(ledgerFromCsv("foo,bar\n1,2\n").errors[0]).toMatch(/date column/);
  });

  it("skips bad rows and keeps good ones", () => {
    const { lines, errors } = ledgerFromCsv("Date,Description,Amount\nnope,Rent,10\n2026-03-01,Rent,\n2026-03-01,Rent,10\n");
    expect(lines).toHaveLength(1);
    expect(errors).toEqual(['Row 2: "nope" is not a date.', "Row 3: no amount found."]);
  });
});
