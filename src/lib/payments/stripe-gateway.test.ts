import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { STRIPE_API_VERSION, STRIPE_TIMEOUT_MS, StripeCheckoutGateway, StripeRefundGateway, createStripeClient } from "@/lib/payments/stripe-gateway";

describe("createStripeClient", () => {
  it("pins the API version and gives up on a Stripe call after 10 seconds", () => {
    const client = createStripeClient("sk_test_unit_not_real");
    expect(STRIPE_TIMEOUT_MS).toBe(10_000);
    expect(client.getApiField("timeout")).toBe(STRIPE_TIMEOUT_MS);
    expect(client.getApiField("version")).toBe(STRIPE_API_VERSION);
  });
});

describe("StripeCheckoutGateway line item", () => {
  const capture = () => {
    const calls: { params: Stripe.Checkout.SessionCreateParams; options: Stripe.RequestOptions }[] = [];
    const stripe = {
      checkout: { sessions: { create: async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
        calls.push({ params, options });
        return { id: "cs_test_x", url: "https://checkout.stripe.com/x", status: "open" };
      } } },
    } as unknown as Stripe;
    return { calls, gateway: new StripeCheckoutGateway(stripe) };
  };
  const input = { auditId: "a", userId: "u", locale: "en" as const, customerEmail: null, successUrl: "s", cancelUrl: "c", idempotencyKey: "k" };

  it("describes a 15% fee, or the 50-cent minimum when it applies, in usd cents", async () => {
    const { calls, gateway } = capture();
    await gateway.createSession({ ...input, amountCents: 9600, totalOwedCents: 64000, minimumFeeApplied: false });
    await gateway.createSession({ ...input, amountCents: 50, totalOwedCents: 300, minimumFeeApplied: true, locale: "es" });
    const item = (i: number) => calls[i].params.line_items![0].price_data!;
    expect(item(0)).toMatchObject({ currency: "usd", unit_amount: 9600 });
    expect(item(0).product_data!.description).toBe("15% of the $640.00 found in your audit");
    expect(item(1)).toMatchObject({ currency: "usd", unit_amount: 50 });
    expect(item(1).product_data!.description).toBe("Tarifa mínima de $0.50 sobre los $3.00 encontrados en tu auditoría");
    expect(calls[1].options.idempotencyKey).toBe("k");
  });
});

describe("StripeRefundGateway", () => {
  const capture = () => {
    const calls: { params: Stripe.RefundCreateParams; options: Stripe.RequestOptions }[] = [];
    const stripe = {
      refunds: { create: async (params: Stripe.RefundCreateParams, options: Stripe.RequestOptions) => {
        calls.push({ params, options });
        return { id: "re_test_1", amount: 9600, status: "succeeded" };
      } },
    } as unknown as Stripe;
    return { calls, gateway: new StripeRefundGateway(stripe) };
  };

  it.each([
    ["duplicate_payment", "duplicate"],
    ["amount_mismatch", "requested_by_customer"],
    ["not_unlockable", "requested_by_customer"],
  ] as const)("fully refunds a %s payment intent with the caller's idempotency key", async (reason, stripeReason) => {
    const { calls, gateway } = capture();
    expect(await gateway.refund("pi_123", "refund-pi_123", reason)).toEqual({ refundId: "re_test_1", amountCents: 9600 });
    expect(calls[0].params).toEqual({ payment_intent: "pi_123", reason: stripeReason, metadata: { ledgerfinesse_reason: reason } });
    expect(calls[0].params).not.toHaveProperty("amount");
    expect(calls[0].options).toEqual({ idempotencyKey: "refund-pi_123" });
  });
});
