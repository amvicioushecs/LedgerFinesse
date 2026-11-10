import type { Dictionary } from "@/content/dictionaries";
import { localizePath, type Locale } from "@/lib/i18n/locales";
import { siteUrl } from "@/lib/seo";

export function organizationLd() {
  const origin = siteUrl();
  return { "@context": "https://schema.org", "@type": "Organization", "@id": `${origin}/#org`, name: "LedgerFinesse", url: origin };
}

export function websiteLd(locale: Locale, t: Dictionary) {
  const origin = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: t.meta.siteName,
    description: t.meta.description,
    url: `${origin}${localizePath(locale, "/")}`,
    inLanguage: locale,
    publisher: { "@id": `${origin}/#org` },
  };
}

export function faqLd(t: Dictionary, locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
    mainEntity: t.faq.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  const origin = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: `${origin}${item.path}` })),
  };
}
