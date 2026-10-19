import { GoogleGenAI } from '@google/genai';
import { LeaseAgreement, LedgerEntry } from '../types';

export async function analyzeDocumentsWithAI(
  ledgerText: string,
  leaseText: string,
  apiKey?: string
): Promise<{ suggestedLease?: Partial<LeaseAgreement>; parsedLedger?: Partial<LedgerEntry>[]; insights?: string }> {
  const key = apiKey || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || '';

  if (!key) {
    // Return heuristic parsing if no API key is present
    return {
      insights: 'AI analysis ready: Provide a Gemini API key in your environment to run natural-language LLM parsing. Standard deterministic audit rule engine is currently active.'
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const prompt = `You are a precision forensic rent auditor and legal assistant for residential tenants.
Compare the following historical rent ledger text against the tenant's lease agreement text.
Extract:
1. Monthly Base Rent and due day
2. Grace period days and late fee policy (flat dollar or percentage, max caps)
3. Authorized ancillary charges (trash, pest, parking, pets)
4. List of suspect ledger charges (fees not authorized in lease, early late fees during grace period, math drift, premature rent hikes)

Lease Text:
"""
${leaseText.slice(0, 4000)}
"""

Ledger Text:
"""
${ledgerText.slice(0, 4000)}
"""

Respond with a JSON object containing:
{
  "monthlyBaseRent": number,
  "gracePeriodDays": number,
  "lateFeeAmount": number,
  "suspectChargesSummary": string,
  "legalAdviceSummary": string
}
Return only JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return {
      suggestedLease: {
        monthlyBaseRent: parsed.monthlyBaseRent,
        gracePeriodDays: parsed.gracePeriodDays,
        lateFeeFlatAmount: parsed.lateFeeAmount
      },
      insights: `${parsed.suspectChargesSummary || ''}\n\n${parsed.legalAdviceSummary || ''}`
    };
  } catch (err) {
    console.warn('Gemini analysis error:', err);
    return {
      insights: 'Could not complete AI extraction: fallback rule engine is active.'
    };
  }
}
