import { afterEach, describe, expect, it, vi } from "vitest";

const handled = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments/webhook", () => ({ handleStripeWebhook: (...args: unknown[]) => (handled(...args), { status: 200, outcome: "unlocked" }) }));
vi.mock("@/lib/server/runtime", () => ({ webhookDeps: () => ({}) }));
const env = vi.hoisted(() => ({ current: { stripeMode: "mock", siteEnv: "preview" } as { stripeMode: string; siteEnv: string } }));
vi.mock("@/lib/env", async (original) => ({ ...(await original<typeof import("@/lib/env")>()), serverEnv: () => env.current }));

const { POST } = await import("@/app/api/stripe/webhook/route");
const call = () => POST(new Request("https://app.test/api/stripe/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=x" } }) as never);

afterEach(() => handled.mockClear());

describe("POST /api/stripe/webhook", () => {
  it("is a 404 with mock Stripe anywhere but development, even if config parsing were bypassed (N5)", async () => {
    for (const siteEnv of ["preview", "production"]) {
      env.current = { stripeMode: "mock", siteEnv };
      expect((await call()).status).toBe(404);
    }
    expect(handled).not.toHaveBeenCalled();
  });

  it("reaches the handler for real Stripe, and for mock Stripe in development", async () => {
    env.current = { stripeMode: "stripe", siteEnv: "preview" };
    expect((await call()).status).toBe(200);
    env.current = { stripeMode: "mock", siteEnv: "development" };
    expect((await call()).status).toBe(200);
    expect(handled).toHaveBeenCalledTimes(2);
  });
});
