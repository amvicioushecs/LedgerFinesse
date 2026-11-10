import { describe, expect, it } from "vitest";
import { GET } from "@/app/llms.txt/route";
import sitemap from "@/app/sitemap";

describe("llms.txt pricing and disclaimer (Copy Desk round 2b)", () => {
  it("states the pricing line and the not-a-law-firm line exactly", async () => {
    const text = await (await GET()).text();
    expect(text).toContain("pricing (15% of the amount owed, paid upfront, with a $0.50 minimum; free if less than $0.50 is owed) and FAQ.");
    expect(text.split("\n")).toContain("LedgerFinesse is an educational tool, not a law firm, and does not give legal advice.");
    expect(text).not.toContain("flat 15%");
  });
});

describe("draft terms page visibility", () => {
  it("is omitted from the sitemap and llms.txt (blog-draft rule)", async () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/terms"))).toBe(false);
    expect(await (await GET()).text()).not.toMatch(/\/terms/);
  });
});
