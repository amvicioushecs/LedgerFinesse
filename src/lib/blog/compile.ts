import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { BlogPost } from "@/lib/blog/types";

export type { BlogPost };

/**
 * Build-time blog compiler (Node only): reads content/blog/{en,es}/*.mdx, validates frontmatter,
 * rewrites product links to real routes, and refuses JSX (posts are rendered as Markdown).
 */

const Front = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  lang: z.enum(["en", "es"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  primaryKeyword: z.string().optional(),
  alternate: z.string().regex(/^\/(en|es)\/[a-z0-9-]+$/).optional(),
  draft: z.boolean().default(true),
  sources: z.array(z.object({ title: z.string().min(1), url: z.url().startsWith("https://") })).min(1),
});

export function compilePost(source: string, file: string): BlogPost {
  const { data, content } = matter(source);
  const front = Front.parse(data);
  const folder = file.split(/[\\/]/).at(-2);
  if (folder && (folder === "en" || folder === "es") && folder !== front.lang) {
    throw new Error(`${file}: lang "${front.lang}" does not match its folder`);
  }
  if (/^\s*(import|export)\s/m.test(content) || /<[A-Z][A-Za-z]*[\s/>]/.test(content)) {
    throw new Error(`${file}: JSX/ESM is not supported in posts; use Markdown`);
  }
  if (/15\s*%?\s*[–-]\s*25\s*%|\b(20|25)\s*%\s*(fee|upfront)/i.test(content)) {
    throw new Error(`${file}: old tiered pricing found; the fee is a flat 15%`);
  }
  const body = content.replace(/\]\((?:\/(en|es))?\/signup\)/g, (_m, l: string | undefined) => `](/${l ?? front.lang}/audits/new)`).trim();
  const alternatePath = front.alternate ? front.alternate.replace(/^\/(en|es)\//, "/$1/blog/") : null;
  return {
    slug: front.slug,
    locale: front.lang,
    title: front.title,
    description: front.description,
    date: front.date,
    primaryKeyword: front.primaryKeyword ?? null,
    draft: front.draft,
    alternatePath,
    sources: front.sources,
    body,
  };
}

export function compileAll(root = path.join(process.cwd(), "content/blog")): BlogPost[] {
  const posts: BlogPost[] = [];
  for (const locale of ["en", "es"]) {
    const dir = path.join(root, locale);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".mdx") || f.endsWith(".md")).sort()) {
      posts.push(compilePost(readFileSync(path.join(dir, file), "utf8"), `${locale}/${file}`));
    }
  }
  return posts;
}
