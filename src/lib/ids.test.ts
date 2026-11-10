import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/ids";

describe("isUuid", () => {
  it("accepts canonical UUIDs in any case", () => {
    expect(isUuid("10000000-0000-4000-8000-00000000000a")).toBe(true);
    expect(isUuid("10000000-0000-4000-8000-00000000000A")).toBe(true);
  });

  it("rejects anything Postgres would fail to cast", () => {
    for (const bad of ["", "abc", "------------------------------------", "10000000-0000-4000-8000-00000000000g", "10000000000040008000000000000000a", " 10000000-0000-4000-8000-00000000000a"]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
