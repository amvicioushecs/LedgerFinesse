import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getDictionary } from "@/content/dictionaries";
import { Disclaimer } from "@/components/disclaimer";
import { JsonLd } from "@/components/json-ld";
import { alternateOf, getPost, listPosts } from "@/lib/blog";
import { alternatesFor, isLocale, type Locale } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { openGraphFor, siteUrl } from "@/lib/seo";
import { breadcrumbLd, organizationLd } from "@/lib/structured-data";

export async function generateStaticParams() {
  const value = await rootLocale();
  const locale: Locale = value && isLocale(value) ? value : "en";
  return listPosts(locale).map((p) => ({ slug: p.slug }));
}

type Props = PageProps<"/[locale]/blog/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await currentLocale();
  const { slug } = await params;
  const post = getPost(locale, slug);
  if (!post) return {};
  const origin = siteUrl();
  const twin = alternateOf(post);
  const self = `${origin}/${locale}/blog/${post.slug}`;
  const languages: Record<string, string> = { [locale]: self };
  if (twin) languages[twin.locale] = `${origin}/${twin.locale}/blog/${twin.slug}`;
  languages["x-default"] = languages.en ?? alternatesFor("/blog", origin)["x-default"];
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: self, languages },
    openGraph: openGraphFor(locale, `/blog/${post.slug}`, { type: "article", title: post.title, description: post.description, publishedTime: post.date }),
    robots: post.draft ? { index: false, follow: true } : undefined,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const locale = await currentLocale();
  const { slug } = await params;
  const post = getPost(locale, slug);
  if (!post) notFound();
  const t = getDictionary(locale);
  const origin = siteUrl();
  const url = `${origin}/${locale}/blog/${post.slug}`;
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            inLanguage: locale,
            mainEntityOfPage: url,
            url,
            author: { "@id": `${origin}/#org` },
            publisher: organizationLd(),
            citation: post.sources.map((s) => s.url),
          },
          breadcrumbLd([
            { name: t.blog.breadcrumbHome, path: `/${locale}` },
            { name: t.nav.blog, path: `/${locale}/blog` },
            { name: post.title, path: `/${locale}/blog/${post.slug}` },
          ]),
        ]}
      />
      {post.draft ? (
        <p role="note" className="mb-6 rounded-md border-2 border-gold bg-butter p-3 text-sm font-bold" data-testid="draft-banner">
          {t.blog.draft}
        </p>
      ) : null}
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href={`/${locale}/blog`} className="tap-target hover:underline">{t.blog.back}</Link>
      </nav>
      <h1 className="font-display mt-4 text-4xl leading-tight font-bold sm:text-5xl">{post.title}</h1>
      <p className="mt-3 text-sm text-muted">
        {t.blog.published} <time dateTime={post.date}>{post.date}</time>
      </p>
      <div className="mt-8 space-y-4 leading-relaxed [&_a]:font-semibold [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_h2]:font-display [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:border [&_th]:border-line [&_th]:p-2 [&_ul]:list-disc">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href = "", children }) =>
              href.startsWith("/") ? (
                <Link href={href}>{children}</Link>
              ) : (
                <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
              ),
          }}
        >
          {post.body}
        </ReactMarkdown>
      </div>
      <section aria-labelledby="sources" className="mt-12 rounded-lg border border-line bg-cream p-6" data-testid="sources">
        <h2 id="sources" className="font-display text-xl font-bold">{t.blog.sources}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {post.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a>
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-8 rounded-lg bg-mint p-6">
        <h2 className="font-display text-xl font-bold">{t.blog.ctaTitle}</h2>
        <p className="mt-1 text-sm">{t.blog.ctaBody}</p>
        <Link href={`/${locale}/audits/new`} className="btn btn-gold mt-4">{t.hero.cta} →</Link>
      </section>
      <p className="mt-6 text-xs text-muted">{t.blog.notAdvice}</p>
      <Disclaimer locale={locale} className="mt-2" />
    </article>
  );
}
