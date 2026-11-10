import { assertCents, percentOfCents } from "@/lib/money";

/** Unlock fee: one flat 15% of the verified amount owed. */
export const UNLOCK_FEE_BASIS_POINTS = 1500;

export interface UnlockFeeOptions {
  /**
   * OPEN DECISION: whether tiny findings carry a minimum unlock fee.
   * Default 0 = no minimum. Do not set a value in production code until the
   * product owner decides.
   */
  minimumFeeCents?: number;
}

/**
 * Fee in cents to unlock a report. Always computed on the server from the stored audit.
 *
 * - $0 owed -> $0 fee (no charge, no checkout).
 * - Otherwise 15% of `totalOwedCents`, rounded half up to the cent.
 * - With a minimum set, the fee is never below it (still $0 when nothing is owed).
 * - Very small totals can round to a $0 fee; callers treat that as a free unlock.
 *
 * @example computeUnlockFeeCents(64000) -> 9600 ("$640 owed, so you pay $96")
 */
export function computeUnlockFeeCents(totalOwedCents: number, options: UnlockFeeOptions = {}): number {
  assertCents(totalOwedCents, "totalOwedCents");
  const minimumFeeCents = assertCents(options.minimumFeeCents ?? 0, "minimumFeeCents");
  if (totalOwedCents === 0) return 0;
  return Math.max(percentOfCents(totalOwedCents, UNLOCK_FEE_BASIS_POINTS), minimumFeeCents);
}

/** A checkout is only ever created for a positive fee. */
export function requiresCheckout(feeCents: number): boolean {
  return assertCents(feeCents, "feeCents") > 0;
}

/** What the renter keeps after the fee. */
export function netRecoveryCents(totalOwedCents: number): number {
  return totalOwedCents - computeUnlockFeeCents(totalOwedCents);
}
