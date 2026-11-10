import { POSTS } from "@/content/blog.generated";
import type { BlogPost } from "@/lib/blog/types";
import type { Locale } from "@/lib/i18n/locales";

/** Drafts are visible (with a banner, noindex) outside production and hidden in production. */
export function showDrafts(): boolean {
  return process.env.SITE_ENV !== "production";
}

export function listPosts(locale: Locale): BlogPost[] {
  return POSTS.filter((p) => p.locale === locale && (showDrafts() || !p.draft)).sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(locale: Locale, slug: string): BlogPost | null {
  return listPosts(locale).find((p) => p.slug === slug) ?? null;
}

/** Twin post in the other language, if published under the same rules. */
export function alternateOf(post: BlogPost): BlogPost | null {
  if (!post.alternatePath) return null;
  const [, locale, , slug] = post.alternatePath.split("/");
  return POSTS.find((p) => p.locale === locale && p.slug === slug && (showDrafts() || !p.draft)) ?? null;
}
