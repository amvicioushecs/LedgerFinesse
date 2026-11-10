import type { Extractor } from "@/lib/audits/types";
import { getJurisdiction } from "@/lib/jurisdictions";
import { SAMPLE_CASE } from "@/content/sample-case";

/**
 * Demo extractor: ignores the uploaded files and returns the SAMPLE case ledger, placed in the
 * chosen city. Used for local development, e2e and the preview. Refused in production (see env).
 */
export const demoExtractor: Extractor = {
  source: "demo",
  async extract({ jurisdiction }) {
    const j = getJurisdiction(jurisdiction);
    return structuredClone({ ...SAMPLE_CASE.extraction, place: { stateCode: j.stateCode, city: j.city } });
  },
};
