# Rules engine

Deterministic audit of a renter's lease + ledger. Entry point: `audit(extraction, rules)` in `audit.ts`.

- **Pure:** no network, no clock, no randomness. Same input (in any array order) gives identical output.
- **Integer cents only.** Money helpers live in `src/lib/money.ts`; the unlock fee in `src/lib/pricing.ts`.
- **Only verified rules apply.** `rules.ts` ignores any rule that isn't `status: "verified"` with a citation, https source URL, verifier and verification date, or that isn't in effect on the charge date. City rules override state rules.
- **Citations come from rule data, never from code.** Findings copy `citation` and `sourceUrl` from the rule row.
- **The AI only extracts.** This engine receives a normalized `Extraction`; it never reads free text as instructions.

| File | Checks |
|---|---|
| `checks/ledger-math.ts` | Running-balance errors (`math_balance_error`) |
| `checks/rent.ts` | Rent above lease rent during the term (`unauthorized_rent_increase`) |
| `checks/late-fees.ts` | Late fee inside the grace period (`late_fee_timing`), over the lease or legal cap (`late_fee_amount`), late fee with no lease clause (`unauthorized_fee`) |
| `checks/fees.ts` | Junk fees: banned by a verified rule, not in the lease, or above the lease amount (`unauthorized_fee`) |

Known-answer fixtures: `__fixtures__/` (see its README).
