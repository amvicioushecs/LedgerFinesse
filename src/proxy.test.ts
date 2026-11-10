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
    vi.stubEnv("LF_BACKEND", "supabase");
    const proxy = await loadProxy();
    const res = await proxy(new NextRequest("https://app.test/en"));
    expect(res.status).toBe(503);
  });

  it("serves pages with a valid configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_ENV", "development");
    const proxy = await loadProxy();
    const res = await proxy(new NextRequest("https://app.test/en"));
    expect(res.status).toBe(200);
  });
});
