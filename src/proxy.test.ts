import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadProxy() {
  vi.resetModules();
  return (await import("@/proxy")).proxy;
}

describe("proxy", () => {
  it("refuses to serve pages when a production build has no SITE_ENV (fails closed, N2)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_ENV", "");
    vi.stubEnv("LF_BACKEND", "neon");
    const proxy = await loadProxy();
    const res = await proxy(new NextRequest("https://app.test/en"));
    expect(res.status).toBe(503);
  });

  it("also fails closed when the runtime has no NODE_ENV at all (the Spacefast worker under workerd)", async () => {
    vi.stubEnv("NODE_ENV", undefined);
    vi.stubEnv("SITE_ENV", undefined);
    vi.stubEnv("LF_BACKEND", "neon");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@ep-x.example.invalid/db");
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.invalid/db/auth");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "0123456789abcdef0123456789abcdef");
    const proxy = await loadProxy();
    expect((await proxy(new NextRequest("https://app.test/en"))).status).toBe(503);
  });

  it("serves pages with a valid configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_ENV", "development");
    const proxy = await loadProxy();
    const res = await proxy(new NextRequest("https://app.test/en"));
    expect(res.status).toBe(200);
  });
});
