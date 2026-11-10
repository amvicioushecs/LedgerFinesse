import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/content/dictionaries";
import { Disclaimer } from "@/components/disclaimer";
import { showDrafts } from "@/lib/blog";
import { currentLocale } from "@/lib/i18n/server";
import { localeAlternates, PRIVATE_ROBOTS } from "@/lib/seo";

/**
 * Draft legal copy (attorney review required). Follows the blog-draft rule:
 * visible with a banner and noindex outside production, hidden in production,
 * and omitted from the sitemap and llms.txt until published.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return {
    title: t.terms.title,
    robots: PRIVATE_ROBOTS,
    alternates: localeAlternates(locale, "/terms"),
  };
}

export default async function TermsPage() {
  if (!showDrafts()) notFound();
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p role="note" className="mb-6 rounded-md border-2 border-gold bg-butter p-3 text-sm font-bold" data-testid="draft-banner">
        {t.terms.draftBanner}
      </p>
      <h1 className="font-display text-4xl font-bold">{t.terms.title}</h1>
      <section className="mt-8">
        <h2 className="font-display text-2xl font-bold">{t.terms.refundsTitle}</h2>
        <p className="mt-3 leading-relaxed">{t.terms.refundsIntro}</p>
        <ul className="mt-3 list-disc space-y-1 pl-6 leading-relaxed">
          {t.terms.refundsItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-4 leading-relaxed">{t.terms.refundsUnrecognized}</p>
        <p className="mt-4 leading-relaxed">{t.terms.refundsRetry}</p>
        <p className="mt-4 leading-relaxed">{t.terms.refundsRelock}</p>
      </section>
      <Disclaimer locale={locale} className="mt-8" />
    </article>
  );
}
