import type { Dictionary } from "@/content/dictionaries";
import { feeKind, type UnlockDecision } from "@/lib/pricing";

/** Result-page fee gate: the 15% title and line only when the 15% amount applies, else the minimum variant. */
export function feeGateCopy(r: Dictionary["result"], decision: Extract<UnlockDecision, { kind: "checkout" }>) {
  return decision.minimumApplied
    ? { title: r.feeTitleMinimum, line: r.feeLineMinimum, minimumNote: true }
    : { title: r.feeTitle, line: r.feeLine, minimumNote: false };
}

/** Report fee card label: "(15%)" only when the 15% amount applies. */
export function reportFeeLabel(d: Dictionary["dashboard"], totalOwedCents: number, feeCents: number): string {
  // $0 owed is waived too ("none"); it used to fall back to the 15% label.
  return { percent: d.fee, minimum: d.feeMinimum, free_below_minimum: d.feeFree, none: d.feeFree }[feeKind(totalOwedCents, feeCents)];
}
