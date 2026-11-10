export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the best supported locale from an Accept-Language header by q-value.
 * Region subtags are ignored ("es-MX" -> "es"). Unknown or malformed input -> "en".
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  let best: { locale: Locale; q: number } | null = null;
  for (const part of acceptLanguage.split(",")) {
    const [tag, ...params] = part.trim().split(";");
    const base = tag?.trim().toLowerCase().split("-")[0] ?? "";
    if (!isLocale(base)) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam === undefined ? 1 : Number(qParam.slice(2));
    if (!Number.isFinite(q) || q <= 0) continue;
    if (best === null || q > best.q) best = { locale: base, q };
  }
  return best?.locale ?? DEFAULT_LOCALE;
}

/** "/blog" -> "/es/blog"; "/" -> "/es". */
export function localizePath(locale: Locale, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Splits a leading locale segment off a pathname. */
export function stripLocale(pathname: string): { locale: Locale | null; path: string } {
  const segment = pathname.split("/")[1] ?? "";
  if (!isLocale(segment)) return { locale: null, path: pathname };
  const rest = pathname.slice(segment.length + 1);
  return { locale: segment, path: rest === "" ? "/" : rest };
}

/** hreflang alternates for a locale-free path, with x-default pointing at English. */
export function alternatesFor(path: string, origin: string): Record<Locale | "x-default", string> {
  return {
    en: `${origin}${localizePath("en", path)}`,
    es: `${origin}${localizePath("es", path)}`,
    "x-default": `${origin}${localizePath(DEFAULT_LOCALE, path)}`,
  };
}
