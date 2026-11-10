import { describe, expect, it } from "vitest";
import { STRIPE_API_VERSION, STRIPE_TIMEOUT_MS, createStripeClient } from "@/lib/payments/stripe-gateway";

describe("createStripeClient", () => {
  it("pins the API version and gives up on a Stripe call after 10 seconds", () => {
    const client = createStripeClient("sk_test_unit_not_real");
    expect(STRIPE_TIMEOUT_MS).toBe(10_000);
    expect(client.getApiField("timeout")).toBe(STRIPE_TIMEOUT_MS);
    expect(client.getApiField("version")).toBe(STRIPE_API_VERSION);
  });
});
