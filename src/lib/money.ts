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

/**
 * US-dollar display for integer cents, "$1,234.56". Both locales use US number style
 * because every amount is a US rent charge (Spanish-speaking US renters read "$1,234.56").
 */
export function formatUsd(cents: number): string {
  assertCents(cents, "cents");
  const dollars = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${dollars}.${String(cents % 100).padStart(2, "0")}`;
}
