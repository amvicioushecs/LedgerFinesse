import { getJurisdiction, retaliationStatute, type JurisdictionKey } from "@/lib/jurisdictions";
import { formatUsd } from "@/lib/money";
import type { Report, ReportItem } from "@/lib/report";
import type { FindingCategory } from "@/lib/rules-engine/types";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Plain-text dispute letter built from a stored report. Every amount comes from the rules engine.
 * The template REQUIRES review by a California-licensed attorney before launch (flagged in the text).
 */
export const LETTER_TEMPLATE_VERSION = "2026-11-09.1";

export interface LetterInput {
  locale: Locale;
  date: string;
  tenantName: string | null;
  landlordName: string | null;
  propertyAddress: string | null;
  auditRef: string;
  jurisdiction: JurisdictionKey;
  report: Report;
}

const CATEGORY: Record<Locale, Record<FindingCategory, string>> = {
  en: {
    unauthorized_fee: "a fee my lease does not authorize",
    late_fee_timing: "a late fee charged inside the lease grace period",
    late_fee_amount: "a late fee above the amount allowed",
    unauthorized_rent_increase: "rent above the amount in my lease",
    math_balance_error: "a running-balance error with no matching charge",
  },
  es: {
    unauthorized_fee: "un cargo que mi contrato no autoriza",
    late_fee_timing: "un cargo por atraso cobrado dentro del periodo de gracia del contrato",
    late_fee_amount: "un cargo por atraso mayor al permitido",
    unauthorized_rent_increase: "una renta mayor a la de mi contrato",
    math_balance_error: "un error en el saldo acumulado sin un cargo que lo respalde",
  },
};

const T = {
  en: {
    heading: "NOTICE OF LEDGER DISPUTE AND REQUEST FOR CREDIT OR REFUND",
    to: "TO",
    from: "FROM",
    property: "Property",
    ref: "LedgerFinesse audit reference",
    re: (total: string) => `RE: Dispute of rent ledger charges totaling ${total}`,
    greeting: (who: string) => `Dear ${who},`,
    defaultLandlord: "Property Manager",
    intro: (place: string) =>
      `I am writing to dispute charges on my resident ledger. I compared each line of the ledger with my signed lease and with the laws that apply in ${place}. I found the following items:`,
    count: (n: number) => (n === 1 ? "" : ` (${n} charges)`),
    dates: (a: string, b: string) => (a === b ? a : `${a} to ${b}`),
    line: (i: number, item: ReportItem, category: string, amount: string, dates: string, count: string) =>
      `${i}. ${item.description}${count}, ${dates}: ${category}. Amount disputed: ${amount}.`,
    basis: "Basis",
    request: (total: string) =>
      `Please credit my account or refund ${total} within ten (10) business days of receiving this letter, and send me an updated ledger showing the correction.`,
    retaliation: (citation: string) =>
      `I am raising this in good faith. ${citation} prohibits retaliation against a tenant for exercising their legal rights.`,
    closing: "Sincerely,",
    yourName: "[Your full name]",
    yourAddress: "[Your address]",
    notice:
      "Template notice: this letter is a template generated from an automated ledger audit. LedgerFinesse is not a law firm and does not provide legal advice. This template must be reviewed by a California-licensed attorney before launch.",
  },
  es: {
    heading: "AVISO DE DISPUTA DEL ESTADO DE CUENTA Y SOLICITUD DE CRÉDITO O REEMBOLSO",
    to: "PARA",
    from: "DE",
    property: "Propiedad",
    ref: "Referencia de auditoría LedgerFinesse",
    re: (total: string) => `ASUNTO: Disputa de cargos del estado de cuenta por un total de ${total}`,
    greeting: (who: string) => `Estimado(a) ${who}:`,
    defaultLandlord: "Administrador de la propiedad",
    intro: (place: string) =>
      `Le escribo para disputar cargos en mi estado de cuenta de inquilino. Comparé cada línea del estado de cuenta con mi contrato firmado y con las leyes que aplican en ${place}. Encontré lo siguiente:`,
    count: (n: number) => (n === 1 ? "" : ` (${n} cargos)`),
    dates: (a: string, b: string) => (a === b ? a : `${a} a ${b}`),
    line: (i: number, item: ReportItem, category: string, amount: string, dates: string, count: string) =>
      `${i}. ${item.description}${count}, ${dates}: ${category}. Monto en disputa: ${amount}.`,
    basis: "Fundamento",
    request: (total: string) =>
      `Le pido acreditar a mi cuenta o reembolsar ${total} dentro de diez (10) días hábiles a partir de recibir esta carta, y enviarme un estado de cuenta actualizado con la corrección.`,
    retaliation: (citation: string) =>
      `Presento esta solicitud de buena fe. ${citation} prohíbe las represalias contra un inquilino por ejercer sus derechos legales.`,
    closing: "Atentamente,",
    yourName: "[Su nombre completo]",
    yourAddress: "[Su dirección]",
    notice:
      "Aviso de plantilla: esta carta es una plantilla generada a partir de una auditoría automatizada del estado de cuenta. LedgerFinesse no es un bufete de abogados y no ofrece asesoría legal. Esta plantilla debe ser revisada por un abogado con licencia en California antes del lanzamiento.",
  },
} as const;

function basisText(locale: Locale, item: ReportItem): string | null {
  const parts = [item.leaseRef, item.basis === "rule" ? item.citation : null].filter((p): p is string => Boolean(p));
  if (item.basis === "math") parts.push(locale === "en" ? "ledger arithmetic" : "aritmética del estado de cuenta");
  return parts.length > 0 ? parts.join("; ") : null;
}

export function renderLetter(input: LetterInput): string {
  const t = T[input.locale];
  const j = getJurisdiction(input.jurisdiction);
  const total = formatUsd(input.report.totalOwedCents);
  const landlord = input.landlordName?.trim() || t.defaultLandlord;
  const tenant = input.tenantName?.trim() || t.yourName;
  const address = input.propertyAddress?.trim() || t.yourAddress;
  const place = `${j.city}, ${j.stateName[input.locale]}`;

  const lines = input.report.items.map((item, i) => {
    const line = t.line(
      i + 1,
      item,
      CATEGORY[input.locale][item.category],
      formatUsd(item.owedCents),
      t.dates(item.firstDate, item.lastDate),
      t.count(item.lineCount),
    );
    const basis = basisText(input.locale, item);
    return basis ? `${line}\n   ${t.basis}: ${basis}.` : line;
  });

  const retaliation = retaliationStatute(input.jurisdiction);
  const paragraphs = [
    input.date,
    t.heading,
    `${t.to}:\n${landlord}`,
    `${t.from}:\n${tenant}\n${t.property}: ${address}\n${t.ref}: ${input.auditRef}`,
    t.re(total),
    t.greeting(landlord),
    t.intro(place),
    lines.join("\n"),
    t.request(total),
    retaliation ? t.retaliation(retaliation.citation) : null,
    `${t.closing}\n\n${tenant}\n${address}`,
    "—",
    t.notice,
  ];
  return paragraphs.filter((p): p is string => p !== null).join("\n\n");
}
