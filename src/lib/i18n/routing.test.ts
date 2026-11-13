import { describe, expect, it } from "vitest";
import { localeRedirect } from "@/lib/i18n/routing";

describe("localeRedirect", () => {
  it("leaves localized paths alone", () => {
    expect(localeRedirect("/es/blog", "en", null)).toBeNull();
    expect(localeRedirect("/en", "es", null)).toBeNull();
  });

  it("prefixes unlocalized paths using the saved choice, then Accept-Language", () => {
    expect(localeRedirect("/", "es-MX,es;q=0.9", null)).toBe("/es");
    expect(localeRedirect("/blog", "fr", null)).toBe("/en/blog");
    expect(localeRedirect("/sample", "en", "es")).toBe("/es/sample");
    expect(localeRedirect("/", "es", "bogus")).toBe("/es");
  });
});
