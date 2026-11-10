import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/content/dictionaries";
import { JsonLd } from "@/components/json-ld";
import { listPosts } from "@/lib/blog";
import { currentLocale } from "@/lib/i18n/server";
import { localeAlternates } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  return { title: t.blog.title, description: t.blog.lead, alternates: localeAlternates(locale, "/blog") };
}

export default async function BlogIndex() {
  const locale = await currentLocale();
  const t = getDictionary(locale);
  const posts = listPosts(locale);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd data={breadcrumbLd([{ name: t.blog.breadcrumbHome, path: `/${locale}` }, { name: t.nav.blog, path: `/${locale}/blog` }])} />
      <h1 className="font-display text-4xl font-bold">{t.blog.title}</h1>
      <p className="mt-3 text-muted">{t.blog.lead}</p>
      <ul className="mt-10 space-y-6">
        {posts.map((post) => (
          <li key={post.slug} className="rounded-lg border border-line p-6">
            {post.draft ? <p className="pill mb-2 bg-butter text-alert">{t.blog.draft}</p> : null}
            <h2 className="font-display text-2xl font-bold">
              <Link href={`/${locale}/blog/${post.slug}`} className="hover:underline">{post.title}</Link>
            </h2>
            <p className="mt-2 text-sm text-muted">{post.description}</p>
            <p className="mt-3 text-xs text-muted">
              {t.blog.published} <time dateTime={post.date}>{post.date}</time>
            </p>
            <Link href={`/${locale}/blog/${post.slug}`} className="mt-3 inline-block text-sm font-semibold underline">
              {t.blog.readMore} →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
