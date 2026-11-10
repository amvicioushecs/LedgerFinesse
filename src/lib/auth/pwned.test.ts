import { describe, expect, it, vi } from "vitest";
import { isLeakedPassword } from "@/lib/auth/pwned";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const RANGE = "1E4C9B93F3F0682250B6CF8331B7EE68FD8:10437277\r\n0000000000000000000000000000000000A:0\r\n";

describe("isLeakedPassword (HIBP k-anonymity range API)", () => {
  it("sends only the first 5 hash characters, with padding, and finds a listed suffix", async () => {
    const fetcher = vi.fn(async () => new Response(RANGE));
    expect(await isLeakedPassword("password", fetcher)).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(new Headers(init.headers).get("add-padding")).toBe("true");
  });

  it("ignores padding rows with a zero count and unlisted passwords", async () => {
    const fetcher = vi.fn(async () => new Response("0000000000000000000000000000000000A:0\r\n"));
    expect(await isLeakedPassword("password", fetcher)).toBe(false);
  });

  it("fails open (false) when the service is down, so sign-up still works", async () => {
    expect(await isLeakedPassword("password", async () => new Response("", { status: 503 }))).toBe(false);
    expect(await isLeakedPassword("password", async () => { throw new Error("offline"); })).toBe(false);
  });
});
