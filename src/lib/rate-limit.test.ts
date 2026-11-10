import { describe, expect, it, vi } from "vitest";
import { DEFAULT_RATE_LIMITS, MemoryRateLimitStore, clientIp, isRateLimited, type RateLimitStore } from "@/lib/rate-limit";

const limits = DEFAULT_RATE_LIMITS;

describe("isRateLimited (fixed window, Postgres in deployed envs)", () => {
  it("keeps the previous limits: upload and sign-in 10/min, checkout 20/min", () => {
    expect(DEFAULT_RATE_LIMITS).toEqual({
      upload: { limit: 10, windowSeconds: 60 },
      signin: { limit: 10, windowSeconds: 60 },
      checkout: { limit: 20, windowSeconds: 60 },
    });
  });

  it("limits per IP and per user, with keys scoped to the action", async () => {
    let now = 0;
    const store = new MemoryRateLimitStore(() => now);
    const hits: string[][] = [];
    const spy: RateLimitStore = { hit: (keys, limit, window) => (hits.push(keys), store.hit(keys, limit, window)) };
    const tight = { ...limits, upload: { limit: 2, windowSeconds: 60 } };
    const check = (ip: string, subject: string) => isRateLimited({ store: spy, limits: tight, failOpen: false }, "upload", { ip, subject });
    expect(await check("1.2.3.4", "user-a")).toBe(false);
    expect(await check("1.2.3.4", "user-a")).toBe(false);
    expect(await check("1.2.3.4", "user-a")).toBe(true);
    // Same user from another IP is over its per-user count; another user behind the first IP is over the per-IP count.
    expect(await check("5.6.7.8", "user-a")).toBe(true);
    expect(await check("1.2.3.4", "user-b")).toBe(true);
    expect(await check("9.9.9.9", "user-c")).toBe(false);
    expect(hits[0]).toEqual(["upload:ip:1.2.3.4", "upload:subject:user-a"]);
    // A new window starts fresh.
    now = 60_000;
    expect(await check("1.2.3.4", "user-a")).toBe(false);
  });

  it("uses only the IP key when there is no subject", async () => {
    const hit = vi.fn(async () => false);
    await isRateLimited({ store: { hit }, limits, failOpen: false }, "signin", { ip: "1.2.3.4", subject: null });
    expect(hit).toHaveBeenCalledWith(["signin:ip:1.2.3.4"], 10, 60);
  });

  it("fails closed when the limiter is unreachable outside development", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: RateLimitStore = { hit: async () => { throw new Error("db down"); } };
    expect(await isRateLimited({ store: broken, limits, failOpen: false }, "signin", { ip: "1.2.3.4", subject: null })).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("rate limiter unreachable"));
    error.mockRestore();
  });

  it("fails open only in development", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: RateLimitStore = { hit: async () => { throw new Error("db down"); } };
    expect(await isRateLimited({ store: broken, limits, failOpen: true }, "signin", { ip: "1.2.3.4", subject: null })).toBe(false);
    error.mockRestore();
  });
});

describe("clientIp", () => {
  it("prefers the connecting IP header, then the first forwarded hop", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
