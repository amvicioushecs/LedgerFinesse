import type { Rule } from "@/lib/rules-engine/types";

/**
 * Statutory rules applied in production. Each entry must be checked against the
 * primary source and carry its citation, HTTPS source URL, verifier and date
 * before it is added here. Empty until real rules are verified, so production
 * findings come only from the renter's lease and ledger arithmetic.
 */
export const VERIFIED_RULES: readonly Rule[] = [];
