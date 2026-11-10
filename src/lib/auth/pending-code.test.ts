import { describe, expect, it } from "vitest";
import { PENDING_CODE_MAX_AGE, readPendingCode, signPendingCode } from "@/lib/auth/pending-code";

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = 1_794_300_000;

describe("pending code cookie (binds an emailed code to the browser that asked for it)", () => {
  it("round-trips purpose and email until it expires", async () => {
    const value = await signPendingCode({ purpose: "signin", email: "a@example.com" }, SECRET, NOW);
    expect(await readPendingCode(value, SECRET, NOW + PENDING_CODE_MAX_AGE - 1)).toEqual({ purpose: "signin", email: "a@example.com" });
    expect(await readPendingCode(value, SECRET, NOW + PENDING_CODE_MAX_AGE + 1)).toBeNull();
  });

  it("rejects a tampered payload, another secret, and junk", async () => {
    const value = await signPendingCode({ purpose: "reset", email: "a@example.com" }, SECRET, NOW);
    const [payload, mac] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "reset", e: "attacker@example.com", x: NOW + 600 })).toString("base64url");
    expect(await readPendingCode(`${forged}.${mac}`, SECRET, NOW)).toBeNull();
    expect(await readPendingCode(`${payload}.${mac}x`, SECRET, NOW)).toBeNull();
    expect(await readPendingCode(value, "another-secret-another-secret-123", NOW)).toBeNull();
    for (const junk of [undefined, "", "abc", "a.b.c", "..."]) expect(await readPendingCode(junk, SECRET, NOW)).toBeNull();
  });

  it("only accepts known purposes", async () => {
    // @ts-expect-error unknown purpose
    const value = await signPendingCode({ purpose: "admin", email: "a@example.com" }, SECRET, NOW);
    expect(await readPendingCode(value, SECRET, NOW)).toBeNull();
  });
});
