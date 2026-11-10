import type { Locale } from "@/lib/i18n/locales";

const PROBE_ORIGIN = "https://lf.invalid";
// Control characters (the URL parser silently strips tab/CR/LF) and backslashes (treated as "/").
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

/** Only same-origin paths survive a post-login redirect; anything else goes to the upload page. */
export function safeNextPath(next: string | null | undefined, locale: Locale): string {
  const fallback = `/${locale}/audits/new`;
  if (!next || !next.startsWith("/") || UNSAFE.test(next)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || UNSAFE.test(decoded)) return fallback;
  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  // Normalization can collapse dot segments into "//host" ("/.//evil.com", "/%2e%2e//evil.com"),
  // which a browser reads as another origin. Check the output, not just the input.
  const out = `${url.pathname}${url.search}${url.hash}`;
  if (url.origin !== PROBE_ORIGIN || out.startsWith("//")) return fallback;
  return out;
}
