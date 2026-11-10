import { describe, expect, it } from "vitest";
import { fill, getDictionary } from "@/content/dictionaries";

function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

describe("dictionaries", () => {
  it("es has exactly the same keys and array lengths as en", () => {
    expect(leaves(getDictionary("es")).map(([p]) => p)).toEqual(leaves(getDictionary("en")).map(([p]) => p));
  });

  it("uses the same placeholders in both languages", () => {
    const es = new Map(leaves(getDictionary("es")));
    for (const [path, text] of leaves(getDictionary("en"))) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(es.get(path) ?? ""), path).toEqual(names(text));
    }
  });

  it("never mentions the old tiered fee or Whop", () => {
    for (const locale of ["en", "es"] as const) {
      for (const [path, text] of leaves(getDictionary(locale))) {
        expect(text, `${locale}.${path}`).not.toMatch(/15\s*%?\s*[–-]\s*25|20%|25%|whop/i);
      }
    }
  });

  it("never cites § 1671(d) as a grace-period rule", () => {
    for (const locale of ["en", "es"] as const) {
      for (const [path, text] of leaves(getDictionary(locale))) {
        expect(text, `${locale}.${path}`).not.toMatch(/1671/);
      }
    }
  });

  it("links every stat to an https source", () => {
    for (const locale of ["en", "es"] as const) {
      for (const item of getDictionary(locale).stats.items) expect(item.href).toMatch(/^https:\/\//);
    }
  });
});

describe("fill", () => {
  it("replaces known placeholders and keeps unknown ones visible", () => {
    expect(fill("Pay {fee} of {total}", { fee: "$96.00", total: "$640.00" })).toBe("Pay $96.00 of $640.00");
    expect(fill("Hi {name}", {})).toBe("Hi {name}");
  });
});
