import type { IsoDate, LedgerLine } from "@/lib/rules-engine/types";

/** Locale-independent string compare, so ordering is identical on every machine. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ledger in source order: date, then original sequence, then id. Never mutates the input. */
export function sortLedger(lines: readonly LedgerLine[]): LedgerLine[] {
  return [...lines].sort(
    (a, b) => compareText(a.date, b.date) || a.sequence - b.sequence || compareText(a.id, b.id),
  );
}

export function dayOfMonth(date: IsoDate): number {
  return Number(date.slice(8, 10));
}
