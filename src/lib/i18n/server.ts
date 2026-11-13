import "server-only";
import { locale as rootLocale } from "next/root-params";
import { getDictionary } from "@/content/dictionaries";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/locales";

/** Current locale from the root `[locale]` segment. */
export async function currentLocale(): Promise<Locale> {
  const value = await rootLocale();
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function dictionary() {
  const locale = await currentLocale();
  return { locale, t: getDictionary(locale) };
}
