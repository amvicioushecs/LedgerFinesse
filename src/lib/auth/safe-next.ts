import type { Locale } from "@/lib/i18n/locales";

/** Only same-origin absolute paths survive a post-login redirect; anything else goes to the upload page. */
export function safeNextPath(next: string | null | undefined, locale: Locale): string {
  const fallback = `/${locale}/audits/new`;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
  return next;
}
