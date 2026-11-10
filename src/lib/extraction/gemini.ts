import { z } from "zod";
import type { Extractor } from "@/lib/audits/types";
import { getJurisdiction } from "@/lib/jurisdictions";
import type { Extraction, Place } from "@/lib/rules-engine/types";

/**
 * Gemini reads the lease and ledger into structured data only. It never decides what is owed:
 * every amount and conclusion comes from the deterministic rules engine.
 */

const cents = z.number().int().min(0);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CATEGORIES = ["rent", "late_fee", "fee", "utility", "parking", "pet", "deposit", "payment", "other"] as const;

const ModelExtraction = z.object({
  lease: z.object({
    startDate: date,
    endDate: date.nullable(),
    monthlyRentCents: cents,
    dueDay: z.number().int().min(1).max(31),
    gracePeriodDays: z.number().int().min(0).max(31),
    lateFee: z
      .object({ kind: z.enum(["flat", "percent_of_rent"]), amountCents: cents.nullable(), basisPoints: z.number().int().min(0).max(10000).nullable() })
      .nullable(),
    authorizedFees: z.array(z.object({ name: z.string().min(1).max(120), amountCents: cents.nullable() })).max(50),
  }),
  openingBalanceCents: z.number().int(),
  ledger: z
    .array(
      z.object({
        date,
        description: z.string().min(1).max(300),
        kind: z.enum(["charge", "payment", "credit"]),
        category: z.enum(CATEGORIES),
        amountCents: cents,
        reportedBalanceCents: z.number().int().nullable(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(2000),
});

export function parseModelExtraction(json: unknown, place: Place): Extraction {
  const m = ModelExtraction.parse(json);
  const fee = m.lease.lateFee;
  const lateFee =
    fee === null
      ? null
      : fee.kind === "flat" && fee.amountCents !== null
        ? { kind: "flat" as const, amountCents: fee.amountCents }
        : fee.kind === "percent_of_rent" && fee.basisPoints !== null
          ? { kind: "percent_of_rent" as const, basisPoints: fee.basisPoints }
          : null;
  return {
    place,
    lease: { ...m.lease, lateFee },
    openingBalanceCents: m.openingBalanceCents,
    ledger: m.ledger.map((l, i) => ({ ...l, id: `line-${i + 1}`, sequence: i })),
  };
}

const PROMPT = `You read a residential lease and a tenant rent ledger. Extract data only; do not judge legality.
Return JSON matching the schema. Rules:
- All money as integer US cents (e.g. $2,450.00 -> 245000). Dates as YYYY-MM-DD.
- lease.dueDay: day of month rent is due. lease.gracePeriodDays: days AFTER the due day that rent is still on time
  (due the 1st, on time through the 5th -> 4). Use 0 if the lease has no grace period.
- lease.lateFee: the lease's late fee (flat cents, or percent of rent in basis points; 5% -> 500), or null if none.
- lease.authorizedFees: every recurring or one-time fee the lease expressly allows, with its amount if stated.
- ledger: every line in order as printed. kind is charge, payment or credit. category: rent, late_fee, fee (any other
  landlord fee or add-on), utility, parking, pet, deposit, payment, other. amountCents is always positive.
  reportedBalanceCents: the running balance printed on that line, or null if not printed.
- confidence: 0-1, how sure you are you read the line correctly.`;

const RESPONSE_SCHEMA = z.toJSONSchema(ModelExtraction);

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function createGeminiExtractor(config: { apiKey: string; model: string }, fetchImpl: typeof fetch = fetch): Extractor {
  return {
    source: "model",
    async extract({ jurisdiction, documents }) {
      const j = getJurisdiction(jurisdiction);
      const parts = [
        { text: PROMPT },
        ...documents.flatMap((d) => [
          { text: d.kind === "lease" ? "LEASE:" : "LEDGER:" },
          { inlineData: { mimeType: d.mimeType, data: base64(d.bytes) } },
        ]),
      ];
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA, temperature: 0 },
          }),
        },
      );
      if (!response.ok) throw new Error(`Gemini extraction failed with HTTP ${response.status}`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return parseModelExtraction(JSON.parse(text), { stateCode: j.stateCode, city: j.city });
    },
  };
}
