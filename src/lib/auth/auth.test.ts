import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next";
import { devUserId, signDevSession, verifyDevSession } from "@/lib/auth/dev-session";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/es/audits/new", "en")).toBe("/es/audits/new");
    expect(safeNextPath("/en/audits?x=1", "en")).toBe("/en/audits?x=1");
  });

  it("falls back for open-redirect attempts and junk", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, "/%2F%2Fevil.com", "audits"]) {
      expect(safeNextPath(bad, "es")).toBe("/es/audits/new");
    }
  });

  it("rejects paths the URL parser turns into another host (tab/newline stripping, encoded controls)", () => {
    for (const bad of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/%09/evil.com", "/%0a/evil.com", "/\u0000/evil.com", "/\t\\evil.com"]) {
      const out = safeNextPath(bad, "en");
      expect(out).toBe("/en/audits/new");
      expect(new URL(out, "https://lf.example").origin).toBe("https://lf.example");
    }
  });

  it("rejects paths that dot-segment normalization collapses into a protocol-relative //host", () => {
    for (const bad of ["/.//evil.com", "/%2e%2e//evil.com", "/%2e//evil.com", "/a/..//evil.com", "/./%2e//evil.com/x?y#z"]) {
      const out = safeNextPath(bad, "en");
      expect(out, bad).toBe("/en/audits/new");
      expect(new URL(out, "http://localhost:3000").origin).toBe("http://localhost:3000");
    }
  });

  it("returns a normalized same-origin path with query and hash", () => {
    expect(safeNextPath("/en/audits/./new?x=1#top", "en")).toBe("/en/audits/new?x=1#top");
  });
});

describe("dev session", () => {
  it("round-trips a signed email and rejects tampering", async () => {
    const token = await signDevSession("Renter@Example.com", "secret", 1_800_000_000);
    expect(await verifyDevSession(token, "secret")).toEqual({ id: await devUserId("renter@example.com"), email: "renter@example.com", signedInAt: 1_800_000_000 });
    expect(await verifyDevSession(token.replace(".1800000000.", ".1900000000."), "secret")).toBeNull();
    expect(await verifyDevSession(token, "other")).toBeNull();
    expect(await verifyDevSession(token.replace(/^[^.]+/, btoa("evil@example.com")), "secret")).toBeNull();
    expect(await verifyDevSession("garbage", "secret")).toBeNull();
  });

  it("derives a stable uuid-shaped id per email", async () => {
    const id = await devUserId("a@example.com");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await devUserId("a@example.com")).toBe(id);
  });
});
