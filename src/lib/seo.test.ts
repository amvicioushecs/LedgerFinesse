import { afterEach, describe, expect, it } from "vitest";
import { localeAlternates, openGraphFor, siteUrl } from "@/lib/seo";

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe("openGraphFor", () => {
  it("sets an absolute og:url from the app URL, plus site_name and a regional og:locale", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
    expect(siteUrl()).toBe("https://app.example.test");
    expect(openGraphFor("en", "/")).toEqual({
      type: "website",
      url: "https://app.example.test/en",
      siteName: "LedgerFinesse",
      locale: "en_US",
    });
    expect(openGraphFor("es", "/blog")).toEqual({
      type: "website",
      url: "https://app.example.test/es/blog",
      siteName: "LedgerFinesse",
      locale: "es_ES",
    });
    expect(localeAlternates("en", "/")?.canonical).toBe("https://app.example.test/en");
  });

  it("keeps article fields on blog posts and still emits site_name and a regional locale", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
    expect(openGraphFor("en", "/blog/late-fees", { type: "article", title: "Late fees", description: "A guide", publishedTime: "2026-11-01" })).toEqual({
      type: "article",
      url: "https://app.example.test/en/blog/late-fees",
      siteName: "LedgerFinesse",
      locale: "en_US",
      title: "Late fees",
      description: "A guide",
      publishedTime: "2026-11-01",
    });
  });
});
