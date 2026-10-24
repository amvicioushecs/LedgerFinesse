/**
 * Money helpers. Every amount in LedgerFinesse is an integer number of cents.
 * Floats never touch money math.
 */

/** Throws unless `value` is a non-negative safe integer (cents or basis points). Returns it unchanged. */
export function assertCents(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of cents, got ${value}`);
  }
  return value;
}

/**
 * `basisPoints` of `cents`, rounded half up to the nearest cent, integer math only.
 * 2500 basis points = 25%.
 * @example percentOfCents(1002, 2500) -> 251 (250.5 rounds up)
 */
export function percentOfCents(cents: number, basisPoints: number): number {
  assertCents(cents, "cents");
  assertCents(basisPoints, "basisPoints");
  return Math.floor((cents * basisPoints + 5000) / 10000);
}
