import { assertCents, percentOfCents } from "@/lib/money";

/** Unlock fee: 15% of the verified amount owed... */
export const UNLOCK_FEE_BASIS_POINTS = 1500;
/** ...but never less than 50 cents (Stripe's smallest USD charge). Decided by Hector, 2026-11-10. */
export const MINIMUM_FEE_CENTS = 50;

/**
 * Fee in cents to unlock a report, always computed on the server from the stored audit:
 * - $0 owed -> no charge (clean).
 * - 1-49 cents owed -> no charge: the report unlocks free and the audit is flagged (free_unlock_below_minimum).
 * - Otherwise max(15% of the total rounded half up to the cent, 50 cents).
 * Mirrored in SQL by the audits_fee_matches_policy check.
 *
 * @example computeUnlockFeeCents(64000) -> 9600; computeUnlockFeeCents(300) -> 50; computeUnlockFeeCents(49) -> 0
 */
export function computeUnlockFeeCents(totalOwedCents: number): number {
  assertCents(totalOwedCents, "totalOwedCents");
  if (totalOwedCents < MINIMUM_FEE_CENTS) return 0;
  return Math.max(percentOfCents(totalOwedCents, UNLOCK_FEE_BASIS_POINTS), MINIMUM_FEE_CENTS);
}

/** A checkout is only ever created for a positive fee. */
export function requiresCheckout(feeCents: number): boolean {
  return assertCents(feeCents, "feeCents") > 0;
}

/** What the renter keeps after the fee. */
export function netRecoveryCents(totalOwedCents: number): number {
  return totalOwedCents - computeUnlockFeeCents(totalOwedCents);
}

export type UnlockDecision =
  | { kind: "clean"; feeCents: 0 }
  | { kind: "free_below_minimum"; feeCents: 0 }
  | { kind: "checkout"; feeCents: number; minimumApplied: boolean };

/** What unlocking an audit costs: nothing owed (clean), under 50 cents owed (free, flagged), or a checkout. */
export function unlockDecision(totalOwedCents: number): UnlockDecision {
  if (assertCents(totalOwedCents, "totalOwedCents") === 0) return { kind: "clean", feeCents: 0 };
  const feeCents = computeUnlockFeeCents(totalOwedCents);
  if (feeCents === 0) return { kind: "free_below_minimum", feeCents: 0 };
  return { kind: "checkout", feeCents, minimumApplied: percentOfCents(totalOwedCents, UNLOCK_FEE_BASIS_POINTS) < MINIMUM_FEE_CENTS };
}

export type FeeKind = "none" | "free_below_minimum" | "minimum" | "percent";

/** Which fee the renter was (or will be) charged, for display. */
export function feeKind(totalOwedCents: number, feeCents: number): FeeKind {
  if (feeCents === 0) return totalOwedCents > 0 ? "free_below_minimum" : "none";
  return percentOfCents(totalOwedCents, UNLOCK_FEE_BASIS_POINTS) < MINIMUM_FEE_CENTS ? "minimum" : "percent";
}
