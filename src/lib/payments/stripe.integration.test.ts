/**
 * Opt-in: talks to Stripe's TEST API with the real gateway. Skipped unless STRIPE_INTEGRATION=1 and
 * STRIPE_SECRET_KEY is a test-mode key, so it never runs in CI or a plain `npm test`.
 *   STRIPE_INTEGRATION=1 npx vitest run src/lib/payments/stripe.integration.test.ts
 * Creates one Checkout Session per run and expires it. Never prints the key.
 */
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { MemoryAuditRepository } from "@/lib/audits/memory-repository";
import type { AuditRecord } from "@/lib/audits/types";
import { startCheckout } from "@/lib/payments/checkout";
import { createStripeClient, StripeCheckoutGateway, StripeRefundGateway } from "@/lib/payments/stripe-gateway";
import { handleStripeWebhook } from "@/lib/payments/webhook";
import { computeUnlockFeeCents } from "@/lib/pricing";

const key = process.env.STRIPE_SECRET_KEY ?? "";
const enabled = process.env.STRIPE_INTEGRATION === "1";
if (enabled && !/^(sk|rk)_test_/.test(key)) throw new Error("STRIPE_INTEGRATION=1 needs a test-mode STRIPE_SECRET_KEY (sk_test_/rk_test_)");

// An odd total so the 15% rounds: 1234.57 * 0.15 = 185.1855 -> 18519 cents.
const TOTAL_OWED_CENTS = 123_457;
const EXPECTED_FEE_CENTS = 18_519;

describe.skipIf(!enabled)("Stripe test API (real gateway)", () => {
  const stripe = createStripeClient(key);
  const gateway = new StripeCheckoutGateway(stripe);
  const auditId = randomUUID();
  const userId = randomUUID();
  const appUrl = "http://localhost:3300";

  async function fixture() {
    const repo = new MemoryAuditRepository();
    const fee = computeUnlockFeeCents(TOTAL_OWED_CENTS);
    const audit: AuditRecord = {
      id: auditId, userId, status: "preview_ready", locale: "en", jurisdiction: "san-diego-ca",
      tenantName: null, landlordName: null, propertyAddress: null,
      totalOwedCents: TOTAL_OWED_CENTS, itemCount: 3, linesScanned: 20, feeCents: fee, unlockedAt: null, createdAt: new Date().toISOString(),
    };
    await repo.insertAudit(audit);
    return repo;
  }

  it("creates a session for 15% of the stored total, idempotently, with the webhook's metadata; signed events unlock once", { timeout: 60_000 }, async () => {
    expect(computeUnlockFeeCents(TOTAL_OWED_CENTS)).toBe(EXPECTED_FEE_CENTS);
    const repo = await fixture();

    const started = await startCheckout({ repo, gateway, appUrl }, { userId, email: "integration@example.com" }, auditId, "en");
    expect(started.kind).toBe("redirect");
    const pending = await repo.findPendingPayment(auditId);
    expect(pending?.amountCents).toBe(EXPECTED_FEE_CENTS);
    const sessionId = pending!.checkoutSessionId;
    expect(sessionId).toMatch(/^cs_test_/);

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items", "payment_intent"] });
    expect(session.livemode).toBe(false);
    expect(session.mode).toBe("payment");
    expect(session.amount_total).toBe(EXPECTED_FEE_CENTS);
    expect(session.currency).toBe("usd");
    expect(session.line_items?.data).toHaveLength(1);
    expect(session.line_items?.data[0]).toMatchObject({ quantity: 1, amount_total: EXPECTED_FEE_CENTS });
    expect(session.metadata).toEqual({ audit_id: auditId, user_id: userId });
    expect(session.client_reference_id).toBe(auditId);
    expect(session.success_url).toBe(`${appUrl}/en/audits/${auditId}?checkout=success`);
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    // Same idempotency key (same audit, same attempt number) -> Stripe replays the same session.
    const retry = await gateway.createSession({
      auditId, userId, amountCents: EXPECTED_FEE_CENTS, totalOwedCents: TOTAL_OWED_CENTS, minimumFeeApplied: false, locale: "en",
      customerEmail: "integration@example.com",
      successUrl: `${appUrl}/en/audits/${auditId}?checkout=success`, cancelUrl: `${appUrl}/en/audits/${auditId}?checkout=cancel`,
      idempotencyKey: `lf-checkout-${auditId}-0`,
    });
    expect(retry.id).toBe(sessionId);
    // And startCheckout resumes the open session instead of creating another.
    expect(await startCheckout({ repo, gateway, appUrl }, { userId, email: "integration@example.com" }, auditId, "en")).toEqual(started);

    // Webhook with the real SDK's signature check: a completed+paid copy of this session, signed locally.
    const webhookSecret = `whsec_${randomUUID().replaceAll("-", "")}`;
    const event = {
      id: `evt_test_${randomUUID().replaceAll("-", "")}`, object: "event", type: "checkout.session.completed", livemode: false,
      api_version: stripe.getApiField("version"), created: Math.floor(Date.now() / 1000),
      data: { object: { ...session, line_items: undefined, status: "complete", payment_status: "paid", payment_intent: "pi_test_integration" } },
    };
    const rawBody = JSON.stringify(event);
    const sign = (payload: string) => stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const deps = { stripe: stripe as Stripe, webhookSecret, repo, refunds: new StripeRefundGateway(stripe) };

    expect(await handleStripeWebhook(deps, { rawBody, signature: sign(rawBody) })).toEqual({ status: 200, outcome: "unlocked" });
    expect((await repo.findAudit(userId, auditId))?.status).toBe("unlocked");
    expect(repo.paymentStatus(sessionId)).toBe("paid");
    // Redelivery of the same event: no-op.
    expect(await handleStripeWebhook(deps, { rawBody, signature: sign(rawBody) })).toEqual({ status: 200, outcome: "duplicate" });
    expect(repo.reviews).toHaveLength(0);
    // Tampered body or wrong secret: rejected.
    expect((await handleStripeWebhook(deps, { rawBody: rawBody.replace(String(EXPECTED_FEE_CENTS), "1"), signature: sign(rawBody) })).outcome).toBe("bad_signature");
    expect((await handleStripeWebhook({ ...deps, webhookSecret: "whsec_other" }, { rawBody, signature: sign(rawBody) })).outcome).toBe("bad_signature");

    // Clean up at Stripe: the real session is still open (nothing was paid); expire it.
    await gateway.expireSession(sessionId);
    expect((await gateway.retrieveSession(sessionId)).status).toBe("expired");
    // Expiring again is tolerated (already expired).
    await expect(gateway.expireSession(sessionId)).resolves.toBeUndefined();
  });

  it("fully refunds a paid payment intent once: same key replays the same refund, a second refund is refused", { timeout: 60_000 }, async () => {
    // A real paid test-mode PaymentIntent (test card), standing in for a mismatched Checkout payment.
    const pi = await stripe.paymentIntents.create({
      amount: 100, currency: "usd", payment_method: "pm_card_visa", confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { audit_id: auditId, user_id: userId, purpose: "ledgerfinesse integration test" },
    });
    expect(pi.status).toBe("succeeded");
    expect(pi.livemode).toBe(false);

    const refunds = new StripeRefundGateway(stripe);
    const first = await refunds.refund(pi.id, `refund-${pi.id}`, "amount_mismatch");
    expect(first.refundId).toMatch(/^re_/);
    expect(first.amountCents).toBe(100);
    // Redelivery retries with the same key: Stripe returns the same refund instead of a second one.
    expect(await refunds.refund(pi.id, `refund-${pi.id}`, "amount_mismatch")).toEqual(first);
    // Another key (what a retry looks like after Stripe's ~24h idempotency window): Stripe refuses a second
    // refund (charge_already_refunded) and the gateway records the refund that already exists.
    await expect(stripe.refunds.create({ payment_intent: pi.id }, { idempotencyKey: `refund-${pi.id}-raw` })).rejects.toMatchObject({ code: "charge_already_refunded" });
    expect(await refunds.refund(pi.id, `refund-${pi.id}-after-window`, "amount_mismatch")).toEqual(first);

    const stored = await stripe.refunds.retrieve(first.refundId);
    expect(stored).toMatchObject({ payment_intent: pi.id, amount: 100, reason: "requested_by_customer", metadata: { ledgerfinesse_reason: "amount_mismatch" } });
    expect((await stripe.refunds.list({ payment_intent: pi.id })).data).toHaveLength(1);
  });
});
