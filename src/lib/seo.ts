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

/** Open Graph locale tags use a region subtag (`en_US`), not the site locale alone. */
export function ogLocale(locale: Locale): "en_US" | "es_ES" {
  return locale === "es" ? "es_ES" : "en_US";
}

/** Absolute og:url from the app URL, plus the site name and regional locale required on every public page. */
export function openGraphFor(
  locale: Locale,
  path: string,
  extras?: { type?: "website" | "article"; title?: string; description?: string; publishedTime?: string },
): NonNullable<Metadata["openGraph"]> {
  return {
    type: extras?.type ?? "website",
    url: `${siteUrl()}${localizePath(locale, path)}`,
    siteName: "LedgerFinesse",
    locale: ogLocale(locale),
    ...(extras?.title !== undefined ? { title: extras.title } : {}),
    ...(extras?.description !== undefined ? { description: extras.description } : {}),
    ...(extras?.publishedTime !== undefined ? { publishedTime: extras.publishedTime } : {}),
  };
}
