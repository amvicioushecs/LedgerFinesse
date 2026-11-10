import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/content/dictionaries";
import { Disclaimer } from "@/components/disclaimer";
import { HeroCard } from "@/components/hero-card";
import { JsonLd } from "@/components/json-ld";
import { currentLocale } from "@/lib/i18n/server";
import { localeAlternates } from "@/lib/seo";
import { faqLd, organizationLd, websiteLd } from "@/lib/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return { title: { absolute: t.meta.title }, description: t.meta.description, alternates: localeAlternates(locale, "/") };
}

export default async function LandingPage() {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  const scan = `/${locale}/audits/new`;
  return (
    <>
      <JsonLd data={[organizationLd(), websiteLd(locale, t), faqLd(t, locale)]} />

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 md:py-20 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="pill bg-mint text-forest">✦ {t.hero.eyebrow}</p>
          <h1 className="font-display mt-5 text-5xl leading-[1.02] font-bold text-ink sm:text-6xl">{t.hero.title}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink/85">
            {t.hero.bodyBefore}
            <strong>{t.hero.bodyStrong}</strong>
            {t.hero.bodyAfter}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={scan} className="btn btn-gold" data-testid="hero-cta">
              {t.hero.cta} →
            </Link>
            <Link href={`/${locale}/sample`} className="btn btn-outline">
              👁 {t.hero.preview}
            </Link>
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm text-muted">
            <span aria-hidden>🛡</span>
            {t.hero.note}
          </p>
        </div>
        <HeroCard t={t} locale={locale} />
      </section>

      <section id="how" className="border-t border-line bg-cream">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-4xl font-bold">{t.how.title}</h2>
          <p className="mt-3 max-w-2xl text-muted">{t.how.lead}</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {t.how.steps.map((step, i) => (
              <li key={step.title} className="rounded-lg border border-line bg-white p-6">
                <p className="font-display text-3xl font-bold text-gold-deep">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-4xl font-bold">{t.checks.title}</h2>
        <p className="mt-3 max-w-2xl text-muted">{t.checks.lead}</p>
        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {t.checks.items.map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-md border border-line p-4">
              <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-forest text-xs text-white">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={t.stats.label} className="bg-forest-deep text-white">
        <ul className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {t.stats.items.map((stat) => (
            <li key={stat.value} className="border-white/20 lg:border-l lg:pl-6 lg:first:border-l-0 lg:first:pl-0">
              <p className="font-display text-4xl font-bold text-butter">{stat.value}</p>
              <p className="mt-2 text-sm text-white/85">{stat.text}</p>
              <a href={stat.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-gold underline underline-offset-2">
                {t.stats.sourceLabel} ↗
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display max-w-xl text-4xl font-bold">{t.pricing.title}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="rounded-lg border border-line p-7">
            <p>
              <span className="font-display text-4xl font-bold">{t.pricing.freePrice}</span>{" "}
              <span className="text-sm text-muted">{t.pricing.freeNote}</span>
            </p>
            <h3 className="mt-4 text-lg font-bold">{t.pricing.freeTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.pricing.freeBody}</p>
          </article>
          <article className="rounded-lg border-2 border-forest p-7" data-testid="pricing-paid">
            <p>
              <span className="font-display text-4xl font-bold">{t.pricing.paidPrice}</span>{" "}
              <span className="text-sm text-muted">{t.pricing.paidNote}</span>
            </p>
            <h3 className="mt-4 text-lg font-bold">{t.pricing.paidTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.pricing.paidBody}</p>
            <p className="mt-4 rounded-md bg-mint p-3 text-sm font-semibold">{t.pricing.example}</p>
          </article>
        </div>
        <div className="mt-12 flex flex-col items-start gap-4 rounded-lg bg-cream p-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-2xl font-bold">{t.pricing.ctaText}</p>
          <Link href={scan} className="btn btn-gold">
            {t.pricing.cta}
          </Link>
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-cream">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-4xl font-bold">{t.faq.title}</h2>
          <div className="mt-8 divide-y divide-line rounded-lg border border-line bg-white">
            {t.faq.items.map((item) => (
              <details key={item.q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {item.q}
                  <span aria-hidden className="text-xl text-muted group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
          <Disclaimer locale={locale} className="mt-6" />
        </div>
      </section>
    </>
  );
}
