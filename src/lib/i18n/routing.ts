import { isLocale, localizePath, negotiateLocale, stripLocale } from "@/lib/i18n/locales";

export const LOCALE_COOKIE = "lf_locale";

/** Where to send a request whose path has no locale segment; null when it already has one. */
export function localeRedirect(pathname: string, acceptLanguage: string | null, savedLocale: string | null): string | null {
  if (stripLocale(pathname).locale !== null) return null;
  const locale = savedLocale && isLocale(savedLocale) ? savedLocale : negotiateLocale(acceptLanguage);
  return localizePath(locale, pathname);
}
