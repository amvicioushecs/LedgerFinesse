import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IP_RATE_LIMIT, DEFAULT_RATE_LIMITS, MemoryRateLimitStore, clientIp, isRateLimited, type RateLimitStore } from "@/lib/rate-limit";

const limits = DEFAULT_RATE_LIMITS;

describe("isRateLimited (fixed window, Postgres in deployed envs)", () => {
  it("keeps the previous limits: upload and sign-in 10/min, checkout 20/min", () => {
    expect(DEFAULT_RATE_LIMITS).toEqual({
      upload: { limit: 10, windowSeconds: 60 },
      signin: { limit: 10, windowSeconds: 60 },
      checkout: { limit: 20, windowSeconds: 60 },
    });
  });

  it("per-user (or per-email) is the hard limit; per-IP is a separate loose limit", async () => {
    let now = 0;
    const store = new MemoryRateLimitStore(() => now);
    const hits: [string[], number][] = [];
    const spy: RateLimitStore = { hit: (keys, limit, window) => (hits.push([keys, limit]), store.hit(keys, limit, window)) };
    const deps = { store: spy, limits: { ...limits, upload: { limit: 2, windowSeconds: 60 } }, ipLimit: { limit: 2, windowSeconds: 60 }, failOpen: false };
    const check = (ip: string | null, subject: string) => isRateLimited(deps, "upload", { ip, subject });
    expect(await check("1.2.3.4", "user-a")).toBe(false);
    expect(await check("1.2.3.4", "user-a")).toBe(false);
    // Over the per-user limit, whatever the IP.
    expect(await check("5.6.7.8", "user-a")).toBe(true);
    expect(hits.slice(0, 2)).toEqual([[["upload:subject:user-a"], 2], [["upload:ip:1.2.3.4"], 2]]);
    // Another user behind 1.2.3.4 is the 3rd hit from that IP: over the per-IP limit.
    expect(await check("1.2.3.4", "user-b")).toBe(true);
    expect(await check("9.9.9.9", "user-c")).toBe(false);
    now = 60_000;
    expect(await check("1.2.3.4", "user-a")).toBe(false);
  });

  it("with no trusted IP (the default) only the per-user key counts", async () => {
    const hit = vi.fn(async () => false);
    await isRateLimited({ store: { hit }, limits, ipLimit: DEFAULT_IP_RATE_LIMIT, failOpen: false }, "signin", { ip: null, subject: "a@x.co" });
    expect(hit).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledWith(["signin:subject:a@x.co"], 10, 60);
  });

  it("defaults the per-IP limit to 100 per minute", () => {
    expect(DEFAULT_IP_RATE_LIMIT).toEqual({ limit: 100, windowSeconds: 60 });
  });

  it("fails closed when the limiter is unreachable outside development", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: RateLimitStore = { hit: async () => { throw new Error("db down"); } };
    expect(await isRateLimited({ store: broken, limits, ipLimit: DEFAULT_IP_RATE_LIMIT, failOpen: false }, "signin", { ip: null, subject: "a@x.co" })).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("rate limiter unreachable"));
    error.mockRestore();
  });

  it("fails open only in development", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: RateLimitStore = { hit: async () => { throw new Error("db down"); } };
    expect(await isRateLimited({ store: broken, limits, ipLimit: DEFAULT_IP_RATE_LIMIT, failOpen: true }, "signin", { ip: null, subject: "a@x.co" })).toBe(false);
    error.mockRestore();
  });
});

describe("clientIp: only a header we are configured to trust", () => {
  const spoofed = new Headers({ "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "6.6.6.6, 7.7.7.7", "x-real-ip": "6.6.6.6" });

  it("trusts no header by default, so per-IP limits are off", () => {
    expect(clientIp(spoofed, null)).toBeNull();
  });

  it("reads the configured header", () => {
    expect(clientIp(new Headers({ "x-real-ip": " 203.0.113.9 " }), "x-real-ip")).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "cf-connecting-ip": "2001:db8::1" }), "cf-connecting-ip")).toBe("2001:db8::1");
    expect(clientIp(new Headers(), "x-real-ip")).toBeNull();
  });

  it("never uses the leftmost x-forwarded-for hop (client-controlled); takes the hop our proxy appended", () => {
    expect(clientIp(spoofed, "x-forwarded-for")).toBe("7.7.7.7");
  });

  it("ignores values that are not an IP address, so junk can't mint new keys", () => {
    expect(clientIp(new Headers({ "x-real-ip": "x".repeat(500) }), "x-real-ip")).toBeNull();
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4; drop" }), "x-real-ip")).toBeNull();
  });
});
