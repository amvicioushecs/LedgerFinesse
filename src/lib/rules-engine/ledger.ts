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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Last day rent is still on time for the rent period a charge on `chargeDate` belongs to.
 *
 * The period is the most recent due date on or before the charge: this month's if the
 * charge is on or after this month's due day, otherwise last month's. A due day the
 * month doesn't have (e.g. the 31st in February) falls on the month's last day. Rent is
 * on time through `due date + graceDays` calendar days, which may run into the next month.
 *
 * @example lastGraceDay("2026-03-04", 1, 5) -> "2026-03-06"
 * @example lastGraceDay("2026-02-06", 28, 5) -> "2026-02-02" (January's rent, due Jan 28)
 */
export function lastGraceDay(chargeDate: IsoDate, dueDay: number, graceDays: number): IsoDate {
  let year = Number(chargeDate.slice(0, 4));
  let month = Number(chargeDate.slice(5, 7));
  const day = Number(chargeDate.slice(8, 10));
  if (day < Math.min(dueDay, daysInMonth(year, month))) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  const dueDate = Math.min(dueDay, daysInMonth(year, month));
  return new Date(Date.UTC(year, month - 1, dueDate + graceDays)).toISOString().slice(0, 10);
}
