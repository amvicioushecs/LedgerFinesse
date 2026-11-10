import { describe, expect, it } from "vitest";
import { audit } from "@/lib/rules-engine/audit";
import { rulesFor } from "@/lib/jurisdictions";
import { SAMPLE_CASE } from "@/content/sample-case";
import { buildReport } from "@/lib/report";
import { LETTER_TEMPLATE_VERSION, renderLetter } from "@/lib/letters";

const report = buildReport(SAMPLE_CASE.extraction, audit(SAMPLE_CASE.extraction, rulesFor("san-diego-ca")), {
  jurisdiction: "san-diego-ca",
  leaseRefs: SAMPLE_CASE.leaseRefs,
});
const base = {
  date: "2026-11-09",
  tenantName: SAMPLE_CASE.tenantName,
  landlordName: SAMPLE_CASE.landlord,
  propertyAddress: SAMPLE_CASE.address,
  auditRef: SAMPLE_CASE.id,
  jurisdiction: "san-diego-ca" as const,
  report,
};

describe("renderLetter", () => {
  it("itemizes every report item and the $640 total, asking for a credit within 10 business days", () => {
    const letter = renderLetter({ ...base, locale: "en" });
    expect(letter).toContain("$640.00");
    expect(letter).toContain("ten (10) business days");
    expect(letter.match(/^\d\. /gm)).toHaveLength(5);
    expect(letter).toContain("RUBS Billing Admin Fee (10 charges)");
    expect(letter).toContain("Lease § 4");
  });

  it("cites only verified statutes: the CA retaliation statute and never § 1671(d) as a grace rule", () => {
    const letter = renderLetter({ ...base, locale: "en" });
    expect(letter).toContain("CA Civ. Code § 1942.5");
    expect(letter).not.toMatch(/1671\(d\)[^\n]*grace/i);
  });

  it("omits the retaliation paragraph where no verified statute exists", () => {
    const letter = renderLetter({ ...base, jurisdiction: "new-york-ny", locale: "en" });
    expect(letter).not.toMatch(/retaliat/i);
  });

  it("carries the attorney-review notice and not-a-law-firm disclaimer in both languages", () => {
    expect(renderLetter({ ...base, locale: "en" })).toMatch(/must be reviewed by a California-licensed attorney before launch/);
    expect(renderLetter({ ...base, locale: "en" })).toMatch(/not a law firm/);
    const es = renderLetter({ ...base, locale: "es" });
    expect(es).toContain("$640.00");
    expect(es).toContain("diez (10) días hábiles");
    expect(es).toMatch(/no es un bufete de abogados/);
  });

  it("uses a placeholder when the tenant name is unknown", () => {
    expect(renderLetter({ ...base, tenantName: null, locale: "en" })).toContain("[Your full name]");
  });

  it("has a template version", () => {
    expect(LETTER_TEMPLATE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
