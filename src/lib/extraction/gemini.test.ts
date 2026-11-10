import { describe, expect, it } from "vitest";
import { createGeminiExtractor, parseModelExtraction } from "@/lib/extraction/gemini";

const modelJson = {
  lease: { startDate: "2026-01-01", endDate: "2026-12-31", monthlyRentCents: 245000, dueDay: 1, gracePeriodDays: 4,
    lateFee: { kind: "flat", amountCents: 7500, basisPoints: null }, authorizedFees: [{ name: "Pet Rent", amountCents: 5000 }] },
  openingBalanceCents: 0,
  ledger: [
    { date: "2026-01-01", description: "Base Rent", kind: "charge", category: "rent", amountCents: 245000, reportedBalanceCents: 245000, confidence: 0.97 },
    { date: "2026-01-03", description: "Payment", kind: "payment", category: "payment", amountCents: 245000, reportedBalanceCents: 0, confidence: 0.9 },
  ],
};

describe("parseModelExtraction", () => {
  it("normalizes model output into an engine Extraction with ids and order", () => {
    const e = parseModelExtraction(modelJson, { stateCode: "CA", city: "San Diego" });
    expect(e.place).toEqual({ stateCode: "CA", city: "San Diego" });
    expect(e.lease.lateFee).toEqual({ kind: "flat", amountCents: 7500 });
    expect(e.ledger.map((l) => [l.id, l.sequence])).toEqual([["line-1", 0], ["line-2", 1]]);
  });

  it("rejects non-integer cents and unknown categories", () => {
    expect(() => parseModelExtraction({ ...modelJson, openingBalanceCents: 1.5 }, { stateCode: "CA", city: null })).toThrow();
    const bad = { ...modelJson, ledger: [{ ...modelJson.ledger[0], category: "bribe" }] };
    expect(() => parseModelExtraction(bad, { stateCode: "CA", city: null })).toThrow();
  });
});

describe("createGeminiExtractor", () => {
  it("sends both documents inline with a JSON schema and parses the reply", async () => {
    let body: { contents: { parts: Record<string, unknown>[] }[]; generationConfig: Record<string, unknown> } | undefined;
    let url = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      url = String(input);
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] }));
    };
    const extractor = createGeminiExtractor({ apiKey: "k", model: "gemini-test" }, fetchImpl);
    const e = await extractor.extract({
      jurisdiction: "austin-tx",
      documents: [
        { kind: "lease", mimeType: "application/pdf", bytes: new Uint8Array([1, 2]) },
        { kind: "ledger", mimeType: "image/png", bytes: new Uint8Array([3]) },
      ],
    });
    expect(url).toContain("/models/gemini-test:generateContent");
    expect(body?.generationConfig).toMatchObject({ responseMimeType: "application/json" });
    expect(body?.contents[0].parts.filter((p) => "inlineData" in p)).toHaveLength(2);
    expect(e.place).toEqual({ stateCode: "TX", city: "Austin" });
    expect(e.ledger).toHaveLength(2);
  });

  it("throws on an API error without leaking the key", async () => {
    const fetchImpl: typeof fetch = async () => new Response("quota", { status: 429 });
    const extractor = createGeminiExtractor({ apiKey: "secret-key", model: "m" }, fetchImpl);
    await expect(extractor.extract({ jurisdiction: "austin-tx", documents: [] })).rejects.toThrow(/429/);
    await expect(extractor.extract({ jurisdiction: "austin-tx", documents: [] })).rejects.not.toThrow(/secret-key/);
  });
});
