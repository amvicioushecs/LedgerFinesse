import { describe, expect, it } from "vitest";
import { alternatesFor, isLocale, localizePath, negotiateLocale, stripLocale } from "@/lib/i18n/locales";

describe("isLocale", () => {
  it("accepts en and es only", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("es")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("EN")).toBe(false);
  });
});

describe("negotiateLocale", () => {
  it("defaults to en", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
    expect(negotiateLocale("fr-FR,fr;q=0.9")).toBe("en");
  });

  it("picks es for Spanish browsers, any region", () => {
    expect(negotiateLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(negotiateLocale("es")).toBe("es");
  });

  it("respects q-values", () => {
    expect(negotiateLocale("en;q=0.5,es;q=0.9")).toBe("es");
    expect(negotiateLocale("es;q=0.2,en-US;q=0.8")).toBe("en");
  });

  it("ignores garbage", () => {
    expect(negotiateLocale(";;;,q=abc")).toBe("en");
  });
});

describe("paths", () => {
  it("localizes and strips", () => {
    expect(localizePath("es", "/blog")).toBe("/es/blog");
    expect(localizePath("en", "/")).toBe("/en");
    expect(stripLocale("/es/blog/x")).toEqual({ locale: "es", path: "/blog/x" });
    expect(stripLocale("/es")).toEqual({ locale: "es", path: "/" });
    expect(stripLocale("/blog")).toEqual({ locale: null, path: "/blog" });
    expect(stripLocale("/esx")).toEqual({ locale: null, path: "/esx" });
  });

  it("builds hreflang alternates with x-default", () => {
    expect(alternatesFor("/blog", "https://example.com")).toEqual({
      en: "https://example.com/en/blog",
      es: "https://example.com/es/blog",
      "x-default": "https://example.com/en/blog",
    });
  });
});
