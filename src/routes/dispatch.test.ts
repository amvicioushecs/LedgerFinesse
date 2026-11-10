import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { dispatch, type Route } from "@/routes/dispatch";

const calls: string[] = [];
const ok = (name: string) => async (_r: Request, ...params: string[]) => {
  calls.push([name, ...params].join(":"));
  return new Response(name);
};
const routes: Route[] = [
  { pattern: ["audits"], methods: { POST: ok("create") } },
  { pattern: ["audits", ":id", "status"], methods: { GET: ok("status") } },
  { pattern: ["stripe", "webhook"], methods: { POST: ok("webhook") } },
];
const req = new NextRequest("https://app.test/api/x", { method: "POST" });

describe("dispatch", () => {
  it("calls the handler for the path and method, passing :params", async () => {
    expect(await (await dispatch(routes, "POST", req, ["audits"])).text()).toBe("create");
    expect(await (await dispatch(routes, "GET", req, ["audits", "abc", "status"])).text()).toBe("status");
    expect(calls).toEqual(["create", "status:abc"]);
  });

  it("answers 404 for an unknown path (including extra or missing segments) and 405 for another method", async () => {
    for (const segments of [[], ["nope"], ["audits", "x"], ["audits", "abc", "status", "more"], ["stripe"]]) {
      expect((await dispatch(routes, "POST", req, segments)).status).toBe(404);
    }
    const wrong = await dispatch(routes, "GET", req, ["stripe", "webhook"]);
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("POST");
    expect((await dispatch(routes, "DELETE", req, ["audits"])).status).toBe(405);
  });

  it("does not match inherited object keys as methods", async () => {
    expect((await dispatch(routes, "constructor", req, ["audits"])).status).toBe(405);
  });
});
