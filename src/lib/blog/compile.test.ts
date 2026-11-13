import { describe, expect, it } from "vitest";
import { compilePost, compileAll } from "@/lib/blog/compile";

const post = (front: string, body = "Hello [scan](/signup).") => `---\n${front}\n---\n\n${body}\n`;
const FRONT = [
  'title: "T"',
  'description: "D"',
  'slug: "my-post"',
  'lang: "en"',
  'date: "2026-10-25"',
  'alternate: "/es/mi-post"',
  "draft: true",
  "sources:",
  '  - title: "Src"',
  '    url: "https://example.gov/a"',
].join("\n");

describe("compilePost", () => {
  it("parses frontmatter and rewrites product and alternate links to real routes", () => {
    const p = compilePost(post(FRONT), "en/my-post.mdx");
    expect(p).toMatchObject({ slug: "my-post", locale: "en", draft: true, alternatePath: "/es/blog/mi-post", sources: [{ title: "Src", url: "https://example.gov/a" }] });
    expect(p.body).toContain("[scan](/en/audits/new)");
  });

  it("rewrites the localized signup link too", () => {
    const p = compilePost(post(FRONT.replace('lang: "en"', 'lang: "es"'), "[x](/es/signup)"), "es/my-post.mdx");
    expect(p.body).toContain("[x](/es/audits/new)");
  });

  it("rejects JSX, imports and old tiered pricing", () => {
    expect(() => compilePost(post(FRONT, "<Callout>hi</Callout>"), "a.mdx")).toThrow(/JSX/);
    expect(() => compilePost(post(FRONT, "import X from 'y'"), "a.mdx")).toThrow(/JSX/);
    expect(() => compilePost(post(FRONT, "Pay 15%–25% upfront"), "a.mdx")).toThrow(/pricing/);
  });

  it("requires https sources and a matching folder language", () => {
    expect(() => compilePost(post(FRONT.replace("https://example.gov/a", "http://x")), "en/a.mdx")).toThrow();
    expect(() => compilePost(post(FRONT), "es/a.mdx")).toThrow(/folder/);
  });
});

describe("compileAll", () => {
  it("compiles the repo's posts with EN/ES pairs that point at each other", () => {
    const posts = compileAll();
    expect(posts.length).toBe(6);
    for (const p of posts) {
      const twin = posts.find((q) => `/${q.locale}/blog/${q.slug}` === p.alternatePath);
      expect(twin, p.slug).toBeDefined();
      expect(twin?.alternatePath).toBe(`/${p.locale}/blog/${p.slug}`);
    }
  });
});

describe("generated module", () => {
  it("is up to date with content/blog (run npm run blog:build)", async () => {
    const { POSTS } = await import("@/content/blog.generated");
    expect(POSTS).toEqual(compileAll());
  });
});
