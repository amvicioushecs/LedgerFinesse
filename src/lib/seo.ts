import type { Metadata } from "next";
import { alternatesFor, localizePath, type Locale } from "@/lib/i18n/locales";

/** Canonical origin for links, sitemap and JSON-LD. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Canonical + hreflang alternates for a locale-free path. */
export function localeAlternates(locale: Locale, path: string): Metadata["alternates"] {
  const origin = siteUrl();
  return { canonical: `${origin}${localizePath(locale, path)}`, languages: alternatesFor(path, origin) };
}

/** Pages that must never be indexed (account, checkout, audits). */
export const PRIVATE_ROBOTS: Metadata["robots"] = { index: false, follow: false };
