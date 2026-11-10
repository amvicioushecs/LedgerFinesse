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

  it("also fails closed when the runtime has no NODE_ENV at all (the worker under workerd)", async () => {
    vi.stubEnv("NODE_ENV", undefined);
    vi.stubEnv("SITE_ENV", undefined);
    vi.stubEnv("LF_BACKEND", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
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
