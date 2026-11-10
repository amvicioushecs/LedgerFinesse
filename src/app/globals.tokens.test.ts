import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("design tokens (Design Desk a11y)", () => {
  it("darkens muted text to #52625b and leaves mint #dce9e1 unchanged", () => {
    expect(css).toMatch(/--color-muted:\s*#52625b\b/);
    expect(css).toMatch(/--color-mint:\s*#dce9e1\b/);
    expect(css).not.toMatch(/--color-muted:\s*#5d6d66\b/);
  });
});
