import { describe, expect, it } from "vitest";
import { RATE_LIMIT_BINDINGS, clientIp, isRateLimited, type Limiter } from "@/lib/rate-limit";

class CountingLimiter implements Limiter {
  keys: string[] = [];
  constructor(private readonly max: number) {}
  async limit({ key }: { key: string }) {
    this.keys.push(key);
    return { success: this.keys.filter((k) => k === key).length <= this.max };
  }
}

describe("isRateLimited", () => {
  it("names one Workers binding per action (configured in wrangler.jsonc)", () => {
    expect(RATE_LIMIT_BINDINGS).toEqual({ upload: "UPLOAD_RATE_LIMITER", signin: "SIGNIN_RATE_LIMITER", checkout: "CHECKOUT_RATE_LIMITER" });
  });

  it("limits per IP and per user, with keys scoped to the action", async () => {
    const limiter = new CountingLimiter(2);
    const limiters = { UPLOAD_RATE_LIMITER: limiter };
    expect(await isRateLimited(limiters, "upload", { ip: "1.2.3.4", subject: "user-a" })).toBe(false);
    expect(await isRateLimited(limiters, "upload", { ip: "1.2.3.4", subject: "user-a" })).toBe(false);
    expect(await isRateLimited(limiters, "upload", { ip: "1.2.3.4", subject: "user-a" })).toBe(true);
    // Same user from another IP is still over its per-user count.
    expect(await isRateLimited(limiters, "upload", { ip: "5.6.7.8", subject: "user-a" })).toBe(true);
    // Another user behind the first IP is over the per-IP count.
    expect(await isRateLimited(limiters, "upload", { ip: "1.2.3.4", subject: "user-b" })).toBe(true);
    expect(await isRateLimited(limiters, "upload", { ip: "9.9.9.9", subject: "user-c" })).toBe(false);
    expect(limiter.keys[0]).toBe("upload:ip:1.2.3.4");
    expect(limiter.keys[1]).toBe("upload:subject:user-a");
  });

  it("allows everything when the binding is missing (next start, unit tests)", async () => {
    expect(await isRateLimited({}, "checkout", { ip: "1.2.3.4", subject: "u" })).toBe(false);
  });

  it("does not fail closed when the limiter itself errors", async () => {
    const broken: Limiter = { limit: async () => { throw new Error("binding down"); } };
    expect(await isRateLimited({ SIGNIN_RATE_LIMITER: broken }, "signin", { ip: "1.2.3.4", subject: null })).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers Cloudflare's connecting IP, then the first forwarded hop", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
