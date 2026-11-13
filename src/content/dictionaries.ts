import { en, type Dictionary } from "@/content/dictionaries.en";
import { es } from "@/content/dictionaries.es";
import type { Locale } from "@/lib/i18n/locales";

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { en, es };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** Replaces {name} placeholders. Unknown placeholders are left as-is so missing values are visible. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
