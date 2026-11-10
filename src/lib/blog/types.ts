/** A compiled blog post (see scripts/build-blog.ts). */
export interface BlogPost {
  slug: string;
  locale: "en" | "es";
  title: string;
  description: string;
  date: string;
  primaryKeyword: string | null;
  draft: boolean;
  alternatePath: string | null;
  sources: { title: string; url: string }[];
  body: string;
}
