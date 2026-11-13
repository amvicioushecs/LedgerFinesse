import { explainFinding } from "@/lib/audit-input/findings";
import { formatCents } from "@/lib/audit-input/money";
import type { AuditResult, Extraction } from "@/lib/rules-engine/types";

export interface LetterParties {
  tenantName: string;
  landlordName: string;
  propertyAddress: string;
  /** ISO date the letter is written. */
  today: string;
}

/** Plain-text dispute letter listing each finding. Blank party fields become bracketed placeholders for the renter to fill. */
export function disputeLetter(extraction: Extraction, result: AuditResult, parties: LetterParties): string {
  const tenant = parties.tenantName.trim() || "[Your name]";
  const landlord = parties.landlordName.trim() || "[Landlord or property manager]";
  const address = parties.propertyAddress.trim() || "[Rental address]";
  const lines = new Map(extraction.ledger.map((line) => [line.id, line]));

  const items = result.findings.map((finding, i) => {
    const line = lines.get(finding.ledgerLineId);
    const explanation = line ? explainFinding(finding, line, extraction.lease) : "";
    return `${i + 1}. ${finding.date}: ${line?.description || "Ledger entry"}, disputed amount ${formatCents(finding.amountCents)}. ${explanation}`;
  });

  return [
    parties.today,
    "",
    `To: ${landlord}`,
    `Re: Ledger dispute for ${address}`,
    "",
    `Dear ${landlord},`,
    "",
    `I have reviewed my resident ledger for ${address} against my lease dated ${extraction.lease.startDate}. The following entries do not match the lease terms or do not add up:`,
    "",
    ...items,
    "",
    `Total disputed: ${formatCents(result.totalFoundCents)}.`,
    "",
    "Please correct these entries, credit the disputed amount to my account and send me an updated ledger in writing within 14 days. If you believe any of these charges are valid, please send the lease provision or written agreement that authorizes them.",
    "",
    "Sincerely,",
    tenant,
  ].join("\n");
}
