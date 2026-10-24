import { describe, expect, it } from "vitest";
import { isVerified, resolveRule } from "@/lib/rules-engine/rules";
import { capRule, graceRule, ZZ_STATE, ZZ_TESTVILLE } from "@/lib/rules-engine/test-helpers";

describe("isVerified", () => {
  it("accepts a verified rule with full evidence", () => {
    expect(isVerified(graceRule(3))).toBe(true);
  });

  it.each([
    ["draft status", { status: "draft" as const }],
    ["retired status", { status: "retired" as const }],
    ["missing citation", { citation: null }],
    ["missing source URL", { sourceUrl: null }],
    ["non-https source URL", { sourceUrl: "http://example.com/zz" }],
    ["missing verifier", { verifiedBy: null }],
    ["missing verification date", { verifiedAt: null }],
  ])("rejects %s", (_label, overrides) => {
    expect(isVerified(graceRule(3, overrides))).toBe(false);
  });
});

describe("resolveRule", () => {
  const stateRule = graceRule(3, { id: "state" });
  const cityRule = graceRule(7, { id: "city", place: ZZ_TESTVILLE });

  it("prefers the city rule over the state rule", () => {
    expect(resolveRule([stateRule, cityRule], ZZ_TESTVILLE, "grace_period", "2026-03-01")?.id).toBe("city");
  });

  it("falls back to the state rule when the city has none", () => {
    expect(resolveRule([stateRule], ZZ_TESTVILLE, "grace_period", "2026-03-01")?.id).toBe("state");
  });

  it("matches the city case-insensitively", () => {
    const place = { stateCode: "ZZ", city: "TESTVILLE" };
    expect(resolveRule([stateRule, cityRule], place, "grace_period", "2026-03-01")?.id).toBe("city");
  });

  it("does not apply a city rule to a state-only place", () => {
    expect(resolveRule([cityRule], ZZ_STATE, "grace_period", "2026-03-01")).toBeNull();
  });

  it("ignores rules from another state", () => {
    expect(resolveRule([graceRule(3, { place: { stateCode: "ZY", city: null } })], ZZ_TESTVILLE, "grace_period", "2026-03-01")).toBeNull();
  });

  it("ignores draft and retired rules, even when they are the only match", () => {
    const draftCity = graceRule(9, { id: "draft", place: ZZ_TESTVILLE, status: "draft" });
    const retiredCity = graceRule(9, { id: "retired", place: ZZ_TESTVILLE, status: "retired" });
    expect(resolveRule([draftCity, retiredCity, stateRule], ZZ_TESTVILLE, "grace_period", "2026-03-01")?.id).toBe("state");
    expect(resolveRule([draftCity, retiredCity], ZZ_TESTVILLE, "grace_period", "2026-03-01")).toBeNull();
  });

  it("only returns the requested rule type", () => {
    const cap = capRule({ maxFlatCents: 2500, maxPercentOfRentBps: null, whenBoth: "lesser" });
    expect(resolveRule([cap], ZZ_TESTVILLE, "grace_period", "2026-03-01")).toBeNull();
    expect(resolveRule([cap], ZZ_TESTVILLE, "late_fee_cap", "2026-03-01")?.params.maxFlatCents).toBe(2500);
  });

  it("honors effective dates: from is inclusive, to is exclusive", () => {
    const rule = graceRule(3, { effectiveFrom: "2026-02-01", effectiveTo: "2026-04-01" });
    expect(resolveRule([rule], ZZ_TESTVILLE, "grace_period", "2026-01-31")).toBeNull();
    expect(resolveRule([rule], ZZ_TESTVILLE, "grace_period", "2026-02-01")).not.toBeNull();
    expect(resolveRule([rule], ZZ_TESTVILLE, "grace_period", "2026-03-31")).not.toBeNull();
    expect(resolveRule([rule], ZZ_TESTVILLE, "grace_period", "2026-04-01")).toBeNull();
  });

  it("picks the highest version when several are in effect", () => {
    const v1 = graceRule(3, { id: "v1", version: 1 });
    const v2 = graceRule(4, { id: "v2", version: 2 });
    expect(resolveRule([v1, v2], ZZ_TESTVILLE, "grace_period", "2026-03-01")?.id).toBe("v2");
    expect(resolveRule([v2, v1], ZZ_TESTVILLE, "grace_period", "2026-03-01")?.id).toBe("v2");
  });
});
