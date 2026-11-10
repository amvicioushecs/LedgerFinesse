import { describe, expect, it } from "vitest";
import { GET } from "@/app/llms.txt/route";
import sitemap from "@/app/sitemap";

describe("draft terms page visibility", () => {
  it("is omitted from the sitemap and llms.txt (blog-draft rule)", async () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/terms"))).toBe(false);
    expect(await (await GET()).text()).not.toMatch(/\/terms/);
  });
});
