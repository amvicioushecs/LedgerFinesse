import { assertCents, percentOfCents } from "@/lib/money";

/** Unlock fee: 25% of the total found. */
export const UNLOCK_FEE_BASIS_POINTS = 2500;

export interface UnlockFeeOptions {
  /**
   * OPEN DECISION: whether tiny findings carry a minimum unlock fee.
   * Default 0 = no minimum. Do not set a value in production code until the
   * product owner decides.
   */
  minimumFeeCents?: number;
}

/**
 * Fee in cents to unlock a report.
 *
 * - $0 found -> $0 fee (no charge, no checkout).
 * - Otherwise 25% of `totalFoundCents`, rounded half up to the cent.
 * - With a minimum set, the fee is never below it (still $0 when nothing was found).
 * - Very small totals can round to a $0 fee (e.g. 1 cent found). Callers must treat
 *   a $0 fee as "free unlock / no checkout"; checkout needs an amount > 0.
 *
 * @example computeUnlockFeeCents(57600) -> 14400 ("$576 found, so you pay $144")
 */
export function computeUnlockFeeCents(totalFoundCents: number, options: UnlockFeeOptions = {}): number {
  assertCents(totalFoundCents, "totalFoundCents");
  const minimumFeeCents = assertCents(options.minimumFeeCents ?? 0, "minimumFeeCents");
  if (totalFoundCents === 0) return 0;
  return Math.max(percentOfCents(totalFoundCents, UNLOCK_FEE_BASIS_POINTS), minimumFeeCents);
}
