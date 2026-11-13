import { describe, expect, it } from "vitest";
import { readNeonSession } from "@/lib/auth/neon-session";

const config = { authBaseUrl: "https://auth.example.test/neondb/auth/", appUrl: "https://app.example.test" };
const TOKEN = { name: "__Secure-neon-auth.session_token", value: "tok.sig" };
const body = (over: { emailVerified?: boolean } = {}) => ({
  session: { id: "s1", userId: "u1", createdAt: "2026-11-10T09:00:00.000Z", expiresAt: "2026-11-17T09:00:00.000Z" },
  user: { id: "u1", email: "a@example.com", emailVerified: over.emailVerified ?? true },
});

function fakeFetch(response: Response | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response.clone();
  };
  return { calls, impl: impl as typeof fetch };
}

describe("readNeonSession (render-safe: reads cookies, never writes them)", () => {
  it("asks Neon Auth with only this request's Neon Auth cookies and returns a verified session", async () => {
    const f = fakeFetch(Response.json(body(), { headers: { "set-cookie": "__Secure-neon-auth.session_token=; Max-Age=0" } }));
    const s = await readNeonSession([TOKEN, { name: "__Secure-neon-auth.local.session_data", value: "d" }, { name: "lf_code_pending", value: "x" }], config, f.impl);
    expect(s).toEqual({ userId: "u1", email: "a@example.com", createdAtSeconds: Date.parse("2026-11-10T09:00:00.000Z") / 1000 });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe("https://auth.example.test/neondb/auth/get-session");
    const headers = new Headers(f.calls[0].init.headers);
    expect(headers.get("cookie")).toBe("__Secure-neon-auth.session_token=tok.sig; __Secure-neon-auth.local.session_data=d");
    expect(headers.get("origin")).toBe("https://app.example.test");
    expect(f.calls[0].init.cache).toBe("no-store");
  });

  it("makes no call without a session token cookie", async () => {
    const f = fakeFetch(Response.json(body()));
    expect(await readNeonSession([{ name: "__Secure-neon-auth.local.session_data", value: "d" }], config, f.impl)).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it("is null for a revoked or expired session (Neon Auth answers null and clears cookies; the clear is ignored here)", async () => {
    const f = fakeFetch(new Response("null", { status: 200, headers: { "content-type": "application/json", "set-cookie": "__Secure-neon-auth.session_token=; Max-Age=0" } }));
    expect(await readNeonSession([TOKEN], config, f.impl)).toBeNull();
  });

  it("is null for an unverified email, an error status, a malformed body, or a network failure", async () => {
    for (const response of [Response.json(body({ emailVerified: false })), new Response("{}", { status: 401 }), new Response("not json"),
      Response.json({ session: { createdAt: "nope" }, user: { id: "u1", emailVerified: true } }), new Error("network")]) {
      expect(await readNeonSession([TOKEN], config, fakeFetch(response).impl)).toBeNull();
    }
  });
});
