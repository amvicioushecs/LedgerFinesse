import type { MetadataRoute } from "next";
import { POSTS } from "@/content/blog.generated";
import { alternatesFor, LOCALES } from "@/lib/i18n/locales";
import { siteUrl } from "@/lib/seo";

/** Public, indexable pages only. Drafts are excluded everywhere (they're noindex until published). */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  const pages = ["/", "/sample", "/blog"].flatMap((path) =>
    LOCALES.map((locale) => ({
      url: alternatesFor(path, origin)[locale],
      alternates: { languages: alternatesFor(path, origin) },
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : 0.6,
    })),
  );
  const posts = POSTS.filter((p) => !p.draft).map((p) => ({
    url: `${origin}/${p.locale}/blog/${p.slug}`,
    lastModified: p.date,
    alternates: p.alternatePath ? { languages: { [p.locale]: `${origin}/${p.locale}/blog/${p.slug}`, [p.alternatePath.split("/")[1]]: `${origin}${p.alternatePath}` } } : undefined,
  }));
  return [...pages, ...posts];
}
