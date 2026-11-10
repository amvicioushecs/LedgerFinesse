import type { FindingCategory, Rule } from "@/lib/rules-engine/types";

/**
 * Jurisdiction database from Hector's app, re-checked against official sources on 2026-11-09.
 * Summaries were rewritten where the original overstated the statute. `verified: false` entries
 * are kept for review but are never shown as law and never become engine rules.
 */

export type StatuteRole = "late_fee_enforceability" | "late_fee" | "rent" | "fees" | "utility" | "retaliation";

export interface Statute {
  citation: string;
  role: StatuteRole;
  title: { en: string; es: string };
  summary: { en: string; es: string };
  sourceUrl: string;
  verified: boolean;
  verifiedAt: string | null;
}

export interface Jurisdiction {
  key: JurisdictionKey;
  label: string;
  city: string;
  stateName: { en: string; es: string };
  stateCode: string;
  statutes: Statute[];
}

export const JURISDICTION_KEYS = ["san-diego-ca", "los-angeles-ca", "austin-tx", "new-york-ny"] as const;
export type JurisdictionKey = (typeof JURISDICTION_KEYS)[number];

const CHECKED = "2026-11-09";
const LEGINFO = (section: string) =>
  `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=${section}.&lawCode=CIV`;

const CA_1671: Statute = {
  citation: "CA Civ. Code § 1671(d)",
  role: "late_fee_enforceability",
  title: { en: "Late fees as liquidated damages (residential leases)", es: "Cargos por atraso como daños liquidados (arrendamientos de vivienda)" },
  summary: {
    en: "In a residential lease, a pre-set damages clause such as a late fee is void unless actual damages would be impracticable or extremely difficult to fix.",
    es: "En un arrendamiento de vivienda, una cláusula de daños fijados de antemano, como un cargo por atraso, es nula salvo que los daños reales sean imprácticos o extremadamente difíciles de determinar.",
  },
  sourceUrl: LEGINFO("1671"),
  verified: true,
  verifiedAt: CHECKED,
};

const CA_1942_5: Statute = {
  citation: "CA Civ. Code § 1942.5",
  role: "retaliation",
  title: { en: "Retaliation by a landlord prohibited", es: "Prohibición de represalias del arrendador" },
  summary: {
    en: "A landlord may not raise rent, cut services, or evict to retaliate against a tenant for lawfully exercising their rights. After certain habitability complaints, the protection runs for 180 days.",
    es: "El arrendador no puede subir la renta, reducir servicios ni desalojar como represalia porque el inquilino ejerció legalmente sus derechos. Tras ciertas quejas de habitabilidad, la protección dura 180 días.",
  },
  sourceUrl: LEGINFO("1942.5"),
  verified: true,
  verifiedAt: CHECKED,
};

const CA_1947_12: Statute = {
  citation: "CA Civ. Code § 1947.12 (AB 1482)",
  role: "rent",
  title: { en: "Statewide limit on rent increases", es: "Límite estatal a los aumentos de renta" },
  summary: {
    en: "For covered units, rent may rise no more than 5% plus inflation, or 10%, whichever is lower, in any 12 months. Many properties are exempt.",
    es: "En las viviendas cubiertas, la renta no puede subir más de 5% más la inflación, o 10%, lo que sea menor, en 12 meses. Muchas propiedades están exentas.",
  },
  sourceUrl: LEGINFO("1947.12"),
  verified: true,
  verifiedAt: CHECKED,
};

const JURISDICTIONS: Record<JurisdictionKey, Jurisdiction> = {
  "san-diego-ca": {
    key: "san-diego-ca",
    label: "San Diego, CA",
    city: "San Diego",
    stateName: { en: "California", es: "California" },
    stateCode: "CA",
    statutes: [CA_1671, CA_1947_12, CA_1942_5],
  },
  "los-angeles-ca": {
    key: "los-angeles-ca",
    label: "Los Angeles, CA",
    city: "Los Angeles",
    stateName: { en: "California", es: "California" },
    stateCode: "CA",
    statutes: [
      {
        citation: "LAMC § 151.04 (Rent Stabilization Ordinance)",
        role: "rent",
        title: { en: "Restriction on rents (RSO units)", es: "Restricción de rentas (unidades RSO)" },
        summary: {
          en: "For units under the Los Angeles Rent Stabilization Ordinance, a landlord may not demand, accept or keep more than the maximum adjusted rent, and may not require online payment as the only way to pay.",
          es: "En unidades bajo la Ordenanza de Estabilización de Rentas de Los Ángeles, el arrendador no puede exigir, aceptar ni quedarse con más de la renta máxima ajustada, ni exigir el pago en línea como única forma de pago.",
        },
        sourceUrl: "https://codelibrary.amlegal.com/codes/los_angeles/latest/lamc/0-0-0-195377",
        verified: true,
        verifiedAt: CHECKED,
      },
      CA_1671,
      CA_1942_5,
    ],
  },
  "austin-tx": {
    key: "austin-tx",
    label: "Austin, TX",
    city: "Austin",
    stateName: { en: "Texas", es: "Texas" },
    stateCode: "TX",
    statutes: [
      {
        citation: "TX Prop. Code § 92.019",
        role: "late_fee",
        title: { en: "Late fees: two full days and a reasonable amount", es: "Cargos por atraso: dos días completos y un monto razonable" },
        summary: {
          en: "A late fee is allowed only if it's in a written lease, is reasonable, and rent has stayed unpaid two full days after the due date. Up to 12% of rent (buildings of 4 units or fewer) or 10% (larger buildings) is presumed reasonable.",
          es: "Solo se permite un cargo por atraso si está en un contrato escrito, es razonable y la renta sigue sin pagarse dos días completos después de la fecha de pago. Hasta 12% de la renta (edificios de 4 unidades o menos) o 10% (edificios más grandes) se presume razonable.",
        },
        sourceUrl: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.92.htm",
        verified: true,
        verifiedAt: CHECKED,
      },
      {
        citation: "16 Tex. Admin. Code § 24.281 (PUC)",
        role: "utility",
        title: { en: "Submetered and allocated water: allowed charges", es: "Agua submedida o prorrateada: cargos permitidos" },
        summary: {
          en: "Water bills passed to tenants may include only the utility's water and wastewater charges, not the owner's deposit, late, disconnect or similar fees; a limited service charge is allowed in some cases.",
          es: "Las facturas de agua que se pasan al inquilino solo pueden incluir los cargos de agua y drenaje del servicio público, no los cargos de depósito, atraso, desconexión u otros similares del dueño; en algunos casos se permite un cargo de servicio limitado.",
        },
        sourceUrl: "https://ftp.puc.texas.gov/public/puct-info/agency/rulesnlaws/subrules/water/subchI/24.281/24.281.pdf",
        verified: true,
        verifiedAt: CHECKED,
      },
      {
        citation: "TX Prop. Code § 92.331",
        role: "retaliation",
        title: { en: "Retaliation by a landlord prohibited", es: "Prohibición de represalias del arrendador" },
        summary: {
          en: "For six months after a tenant in good faith exercises a right under the lease or law, a landlord may not retaliate by filing an eviction, cutting services, raising rent or ending the lease.",
          es: "Durante seis meses después de que el inquilino ejerce de buena fe un derecho del contrato o de la ley, el arrendador no puede tomar represalias presentando un desalojo, reduciendo servicios, subiendo la renta o terminando el contrato.",
        },
        sourceUrl: "https://statutes.capitol.texas.gov/GetStatute.aspx?Code=PR&Value=92.331",
        verified: true,
        verifiedAt: CHECKED,
      },
    ],
  },
  "new-york-ny": {
    key: "new-york-ny",
    label: "New York, NY",
    city: "New York",
    stateName: { en: "New York", es: "Nueva York" },
    stateCode: "NY",
    statutes: [
      {
        citation: "NY Real Prop. Law § 238-a(2)",
        role: "late_fee",
        title: { en: "Late fee cap: $50 or 5%, whichever is less", es: "Tope al cargo por atraso: $50 o 5%, lo que sea menor" },
        summary: {
          en: "A late fee may not be charged unless rent is unpaid five days after it was due, and may not exceed $50 or 5% of the monthly rent, whichever is less.",
          es: "No se puede cobrar un cargo por atraso a menos que la renta siga sin pagarse cinco días después de su vencimiento, y no puede ser mayor de $50 o 5% de la renta mensual, lo que sea menor.",
        },
        sourceUrl: "https://dos.ny.gov/system/files/documents/2021/05/dos-guidance-tenant-protection-act-rev.5.25.2021.pdf",
        verified: true,
        verifiedAt: CHECKED,
      },
      {
        citation: "NY Real Prop. Law § 235-bb",
        role: "fees",
        title: { en: "Citation under review", es: "Referencia en revisión" },
        summary: { en: "Under review.", es: "En revisión." },
        sourceUrl: "https://www.nysenate.gov/legislation/laws/RPP/235-BB",
        verified: false,
        verifiedAt: null,
      },
      {
        citation: "NY Real Prop. Law § 223-b",
        role: "retaliation",
        title: { en: "Citation under review", es: "Referencia en revisión" },
        summary: { en: "Under review.", es: "En revisión." },
        sourceUrl: "https://www.nysenate.gov/legislation/laws/RPP/223-B",
        verified: false,
        verifiedAt: null,
      },
    ],
  },
};

export function isJurisdictionKey(value: string): value is JurisdictionKey {
  return (JURISDICTION_KEYS as readonly string[]).includes(value);
}

export function getJurisdiction(key: JurisdictionKey): Jurisdiction {
  return JURISDICTIONS[key];
}

/** Statutes that may be shown as law: verified only. */
export function shownStatutes(key: JurisdictionKey): Statute[] {
  return JURISDICTIONS[key].statutes.filter((s) => s.verified);
}

export function retaliationStatute(key: JurisdictionKey): Statute | null {
  return shownStatutes(key).find((s) => s.role === "retaliation") ?? null;
}

const NOTE_ROLES: Partial<Record<FindingCategory, StatuteRole[]>> = {
  late_fee_amount: ["late_fee_enforceability"],
  late_fee_timing: ["late_fee_enforceability"],
};

/** Verified context notes for a finding (never the finding's basis; the engine decides that). */
export function lawNotes(key: JurisdictionKey, category: FindingCategory): Statute[] {
  const roles = NOTE_ROLES[category] ?? [];
  return shownStatutes(key).filter((s) => roles.includes(s.role));
}

const VERIFIER = "Code Desk (official-source check; attorney review pending)";

const ENGINE_RULES: Record<JurisdictionKey, Rule[]> = {
  "san-diego-ca": [],
  "los-angeles-ca": [],
  "austin-tx": [
    {
      id: "tx-92-019-grace",
      ruleKey: "tx_late_fee_two_full_days",
      version: 1,
      place: { stateCode: "TX", city: null },
      status: "verified",
      citation: "TX Prop. Code § 92.019(a)(3)",
      sourceUrl: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.92.htm",
      verifiedBy: VERIFIER,
      verifiedAt: CHECKED,
      effectiveFrom: "2019-09-01",
      effectiveTo: null,
      ruleType: "grace_period",
      params: { minDays: 2 },
    },
  ],
  "new-york-ny": [
    {
      id: "ny-238a-cap",
      ruleKey: "ny_late_fee_cap",
      version: 1,
      place: { stateCode: "NY", city: null },
      status: "verified",
      citation: "NY Real Prop. Law § 238-a(2)",
      sourceUrl: "https://dos.ny.gov/system/files/documents/2021/05/dos-guidance-tenant-protection-act-rev.5.25.2021.pdf",
      verifiedBy: VERIFIER,
      verifiedAt: CHECKED,
      effectiveFrom: "2019-06-14",
      effectiveTo: null,
      ruleType: "late_fee_cap",
      params: { maxFlatCents: 5000, maxPercentOfRentBps: 500, whenBoth: "lesser" },
    },
  ],
};

/** Verified engine rules for a place. */
export function rulesFor(key: JurisdictionKey): Rule[] {
  return ENGINE_RULES[key];
}
