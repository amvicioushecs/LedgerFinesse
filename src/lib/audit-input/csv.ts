import { parseLedgerDate } from "@/lib/audit-input/dates";
import { parseDollarsToCents } from "@/lib/audit-input/money";
import type { LedgerCategory, LedgerLine } from "@/lib/rules-engine/types";

/** RFC 4180 style CSV (quoted fields, doubled quotes, CRLF). Also accepts tab-separated text pasted from a spreadsheet. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

type Column = "date" | "description" | "charge" | "payment" | "amount" | "balance" | "category";

function columnFor(header: string): Column | null {
  const h = header.trim().toLowerCase();
  if (/balance/.test(h)) return "balance";
  if (/date|posted/.test(h)) return "date";
  if (/categor|type|code/.test(h)) return "category";
  if (/desc|memo|detail|item|transaction|narrat/.test(h)) return "description";
  if (/payment|credit|paid|receipt/.test(h)) return "payment";
  if (/charge|debit|billed/.test(h)) return "charge";
  if (/amount/.test(h)) return "amount";
  return null;
}

/** Best-effort category from a ledger description. Renters confirm or change it in the workspace. */
export function inferCategory(description: string, kind: LedgerLine["kind"]): LedgerCategory {
  const d = description.toLowerCase();
  if (kind !== "charge") return "payment";
  if (/late/.test(d)) return "late_fee";
  if (/deposit/.test(d)) return "deposit";
  if (/\bpet\b/.test(d)) return "pet";
  if (/parking|garage|\bcarport\b/.test(d)) return "parking";
  if (/water|sewer|electric|\bgas\b|utilit/.test(d)) return "utility";
  if (/\brent\b/.test(d) && !/fee/.test(d)) return "rent";
  return "fee";
}

const CREDIT_WORDS = /credit|concession|adjust|refund|waive|reversal/i;

export interface CsvImportResult {
  lines: LedgerLine[];
  errors: string[];
}

/**
 * Turns ledger CSV text into ledger lines. Needs a header row with a date column,
 * a description column and either an amount column (negative = payment/credit) or
 * separate charge and payment columns. A balance column is optional.
 */
export function ledgerFromCsv(text: string, idPrefix = "line"): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { lines: [], errors: ["Add a header row and at least one ledger row."] };

  const columns = new Map<Column, number>();
  rows[0].forEach((header, index) => {
    const column = columnFor(header);
    if (column && !columns.has(column)) columns.set(column, index);
  });
  const missing: string[] = [];
  if (!columns.has("date")) missing.push("a date column");
  if (!columns.has("description")) missing.push("a description column");
  if (!columns.has("amount") && !columns.has("charge") && !columns.has("payment")) {
    missing.push("an amount column (or charge and payment columns)");
  }
  if (missing.length > 0) return { lines: [], errors: [`The header row needs ${missing.join(", ")}.`] };

  const cell = (row: string[], column: Column) => {
    const index = columns.get(column);
    return index === undefined ? "" : (row[index] ?? "").trim();
  };

  const lines: LedgerLine[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((row, i) => {
    const rowNumber = i + 2;
    const date = parseLedgerDate(cell(row, "date"));
    const description = cell(row, "description") || cell(row, "category");
    if (!date) {
      errors.push(`Row ${rowNumber}: "${cell(row, "date")}" is not a date.`);
      return;
    }

    let kind: LedgerLine["kind"];
    let amountCents: number;
    const charge = parseDollarsToCents(cell(row, "charge"));
    const payment = parseDollarsToCents(cell(row, "payment"));
    const amount = parseDollarsToCents(cell(row, "amount"));
    if (charge && charge.cents > 0) {
      kind = charge.negative ? "credit" : "charge";
      amountCents = charge.cents;
    } else if (payment && payment.cents > 0) {
      kind = payment.negative ? "charge" : "payment";
      amountCents = payment.cents;
    } else if (amount && amount.cents > 0) {
      kind = amount.negative ? "payment" : "charge";
      amountCents = amount.cents;
    } else {
      errors.push(`Row ${rowNumber}: no amount found.`);
      return;
    }
    if (kind === "payment" && CREDIT_WORDS.test(description)) kind = "credit";

    const balanceText = cell(row, "balance");
    const balance = balanceText === "" ? null : parseDollarsToCents(balanceText);
    if (balanceText !== "" && !balance) {
      errors.push(`Row ${rowNumber}: "${balanceText}" is not a balance; it was left blank.`);
    }

    lines.push({
      id: `${idPrefix}-${lines.length + 1}`,
      sequence: lines.length,
      date,
      description,
      kind,
      category: inferCategory(description, kind),
      amountCents,
      reportedBalanceCents: balance ? (balance.negative ? -balance.cents : balance.cents) : null,
      confidence: 1,
    });
  });
  return { lines, errors };
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serializes rows to CSV text with a trailing newline. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\n") + "\n";
}
