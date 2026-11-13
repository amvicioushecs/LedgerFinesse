import { describe, expect, it } from "vitest";
import { getDictionary } from "@/content/dictionaries";
import { feeGateCopy, reportFeeLabel } from "@/content/fee-copy";
import { percentOfCents } from "@/lib/money";
import { computeUnlockFeeCents, MINIMUM_FEE_CENTS, UNLOCK_FEE_BASIS_POINTS, unlockDecision } from "@/lib/pricing";

/** Copy Desk round 2b: result.feeTitle/feeLine and dashboard.fee/feePaid render ONLY when the 15% amount applies. */
describe("15% fee copy appears only when the 15% amount applies", () => {
  const owedValues = [...Array.from({ length: 2001 }, (_, i) => i), 64000, 1_000_000];
  const percentApplies = (owed: number) => owed >= MINIMUM_FEE_CENTS && percentOfCents(owed, UNLOCK_FEE_BASIS_POINTS) >= MINIMUM_FEE_CENTS;

  for (const locale of ["en", "es"] as const) {
    const t = getDictionary(locale);
    const percentStrings = new Set([t.result.feeTitle, t.result.feeLine, t.dashboard.feePaid, t.dashboard.fee]);

    it(`${locale}: result page fee gate (0 to 2000 cents and large totals)`, () => {
      for (const owed of owedValues) {
        const d = unlockDecision(owed);
        if (d.kind !== "checkout") {
          // $0 owed is clean and 1-49 cents unlocks free (result.waived): neither reaches the fee gate.
          expect(owed < MINIMUM_FEE_CENTS, String(owed)).toBe(true);
          continue;
        }
        const copy = feeGateCopy(t.result, d);
        expect(percentStrings.has(copy.title) && percentStrings.has(copy.line), String(owed)).toBe(percentApplies(owed));
        if (!percentApplies(owed)) expect(copy).toEqual({ title: t.result.feeTitleMinimum, line: t.result.feeLineMinimum, minimumNote: true });
      }
      // The boundary: 15% of 329 cents rounds to 49 (minimum applies); of 330, to 50.
      expect(feeGateCopy(t.result, unlockDecision(329) as never).title).toBe(t.result.feeTitleMinimum);
      expect(feeGateCopy(t.result, unlockDecision(330) as never).title).toBe(t.result.feeTitle);
    });

    it(`${locale}: report fee card label`, () => {
      for (const owed of owedValues) {
        const label = reportFeeLabel(t.dashboard, owed, computeUnlockFeeCents(owed));
        expect(percentStrings.has(label), String(owed)).toBe(percentApplies(owed));
        if (!percentApplies(owed)) expect([t.dashboard.feeMinimum, t.dashboard.feeFree], String(owed)).toContain(label);
      }
    });
  }
});
