import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
const source = readFileSync(path.join(ROOT, "src/lib/env.ts"), "utf8");

describe(".env.example", () => {
  it("lists every variable env.ts reads, with no values", () => {
    const listed = [...example.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)];
    expect(listed.filter(([, , value]) => value !== "")).toEqual([]);
    const read = [...new Set([...source.matchAll(/(?:raw\.|need\("|pick\(raw, ")([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))]
      // Set by Next/the runtime, not by whoever deploys.
      .filter((name) => name !== "NODE_ENV" && name !== "NEXT_PHASE");
    expect(read.length).toBeGreaterThan(10);
    expect(listed.map(([, name]) => name)).toEqual(expect.arrayContaining(read));
  });

  it("documents exactly the values env.ts accepts for each mode", () => {
    const modes = [...source.matchAll(/pick\(raw, "([A-Z_]+)", \[([^\]]+)\]/g)];
    expect(modes.map((m) => m[1])).toEqual(["SITE_ENV", "LF_BACKEND", "STRIPE_MODE", "EXTRACTION_MODE"]);
    for (const [, name, list] of modes) {
      const accepted = [...list.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
      const documented = example.match(new RegExp(`# ([a-z |]+)\\.?.*\\n(?:#.*\\n)*${name}=`))?.[1];
      expect(documented?.split("|").map((v) => v.trim()).sort(), name).toEqual(accepted);
    }
  });
});
