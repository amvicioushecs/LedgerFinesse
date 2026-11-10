import Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditRepository } from "@/lib/audits/memory-repository";
import type { AuditRecord } from "@/lib/audits/types";
import { handleStripeWebhook } from "@/lib/payments/webhook";
import type { RefundGateway } from "@/lib/payments/types";

const AUDIT_1 = "20000000-0000-4000-8000-000000000001";
const AUDIT_2 = "20000000-0000-4000-8000-000000000002";
const SECRET = "whsec_test_unit";
const stripe = new Stripe("sk_test_unit_not_real");

const audit: AuditRecord = {
  id: AUDIT_1, userId: "user-a", status: "preview_ready", locale: "en", jurisdiction: "san-diego-ca",
  tenantName: null, landlordName: null, propertyAddress: null,
  totalOwedCents: 64000, itemCount: 5, linesScanned: 37, feeCents: 9600, unlockedAt: null, createdAt: "2026-11-09T00:00:00Z",
};

function event(type: string, session: Record<string, unknown>, id = "evt_1") {
  return JSON.stringify({
    id, object: "event", type, api_version: "2026-10-28.endive", created: 1, livemode: false,
    data: { object: { id: "cs_test_1", object: "checkout.session", amount_total: 9600, currency: "usd", payment_status: "paid",
      payment_intent: "pi_1", metadata: { audit_id: AUDIT_1, user_id: "user-a" }, ...session } },
  });
}

const signed = (payload: string, secret = SECRET) => ({ rawBody: payload, signature: stripe.webhooks.generateTestHeaderString({ payload, secret }) });

let repo: MemoryAuditRepository;
let refunds: { calls: { paymentIntentId: string; idempotencyKey: string; reason: string }[]; fail: boolean; refund: RefundGateway["refund"] };
const run = (req: { rawBody: string; signature: string | null }) => handleStripeWebhook({ stripe, webhookSecret: SECRET, repo, refunds }, req);

beforeEach(async () => {
  refunds = {
    calls: [],
    fail: false,
    async refund(paymentIntentId, idempotencyKey, reason) {
      this.calls.push({ paymentIntentId, idempotencyKey, reason });
      if (this.fail) throw new Error("stripe down");
      return { refundId: `re_${this.calls.length}`, amountCents: 9600 };
    },
  };
  repo = new MemoryAuditRepository();
  await repo.insertAudit({ ...audit });
  await repo.insertPayment({ auditId: AUDIT_1, userId: "user-a", checkoutSessionId: "cs_test_1", amountCents: 9600, status: "pending" });
});

const status = async () => (await repo.findAudit("user-a", AUDIT_1))?.status;

describe("handleStripeWebhook", () => {
  it("unlocks on a signed, paid checkout.session.completed with the matching amount", async () => {
    expect(await run(signed(event("checkout.session.completed", {})))).toEqual({ status: 200, outcome: "unlocked" });
    expect(await status()).toBe("unlocked");
  });

  it("rejects a missing or bad signature and a body changed after signing", async () => {
    const payload = event("checkout.session.completed", {});
    expect(await run({ rawBody: payload, signature: null })).toEqual({ status: 400, outcome: "bad_signature" });
    expect(await run(signed(payload, "whsec_wrong"))).toEqual({ status: 400, outcome: "bad_signature" });
    const { signature } = signed(payload);
    expect(await run({ rawBody: payload.replace("9600", "1"), signature })).toEqual({ status: 400, outcome: "bad_signature" });
    expect(await status()).toBe("preview_ready");
  });

  it("does not unlock when the session is not paid yet (async payment methods)", async () => {
    expect(await run(signed(event("checkout.session.completed", { payment_status: "unpaid" })))).toEqual({ status: 200, outcome: "awaiting_payment" });
    expect(await status()).toBe("preview_ready");
  });

  it("unlocks on checkout.session.async_payment_succeeded", async () => {
    expect(await run(signed(event("checkout.session.async_payment_succeeded", {})))).toEqual({ status: 200, outcome: "unlocked" });
  });

  it("refunds an amount that does not match the stored fee in full, keyed on the payment intent; the audit stays locked", async () => {
    expect(await run(signed(event("checkout.session.completed", { amount_total: 100 })))).toEqual({ status: 200, outcome: "refunded" });
    expect(refunds.calls).toEqual([{ paymentIntentId: "pi_1", idempotencyKey: "refund-pi_1", reason: "amount_mismatch" }]);
    expect(await status()).toBe("preview_ready");
    expect(repo.paymentStatus("cs_test_1")).toBe("refunded");
    expect(await repo.hasPaidPayment(AUDIT_1)).toBe(false);
    expect(repo.reviews).toEqual([
      expect.objectContaining({ eventId: "evt_1", reason: "amount_mismatch", checkoutSessionId: "cs_test_1", amountCents: 100, paymentIntentId: "pi_1", refundId: "re_1", refundAmountCents: 9600 }),
    ]);
    expect(repo.reviews[0].refundedAt).toEqual(expect.any(String));
  });

  it("checks the amount against the stored minimum fee: 15% of $3.00 (45 cents) is a mismatch (refunded), 50 cents unlocks", async () => {
    repo = new MemoryAuditRepository();
    await repo.insertAudit({ ...audit, totalOwedCents: 300, feeCents: 50 });
    await repo.insertPayment({ auditId: AUDIT_1, userId: "user-a", checkoutSessionId: "cs_test_1", amountCents: 50, status: "pending" });
    expect(await run(signed(event("checkout.session.completed", { amount_total: 45 })))).toEqual({ status: 200, outcome: "refunded" });
    expect(repo.reviews[0]).toMatchObject({ reason: "amount_mismatch", amountCents: 45 });
    expect(await status()).toBe("preview_ready");

    repo = new MemoryAuditRepository();
    await repo.insertAudit({ ...audit, totalOwedCents: 300, feeCents: 50 });
    await repo.insertPayment({ auditId: AUDIT_1, userId: "user-a", checkoutSessionId: "cs_test_1", amountCents: 50, status: "pending" });
    expect(await run(signed(event("checkout.session.completed", { amount_total: 50 }, "evt_min")))).toEqual({ status: 200, outcome: "unlocked" });
  });

  it("treats a later event for the session that unlocked the audit as already unlocked (no flag, no refund)", async () => {
    await run(signed(event("checkout.session.completed", {})));
    expect(await run(signed(event("checkout.session.async_payment_succeeded", {}, "evt_9")))).toEqual({ status: 200, outcome: "already_unlocked" });
    expect(repo.reviews).toHaveLength(0);
    expect(refunds.calls).toHaveLength(0);
  });

  it("refunds a second paid session for an audit that is already unlocked, once", async () => {
    await run(signed(event("checkout.session.completed", {})));
    await repo.insertPayment({ auditId: AUDIT_1, userId: "user-a", checkoutSessionId: "cs_test_2", amountCents: 9600, status: "pending" });
    const second = signed(event("checkout.session.completed", { id: "cs_test_2", payment_intent: "pi_2" }, "evt_2"));
    expect(await run(second)).toEqual({ status: 200, outcome: "refunded" });
    expect(refunds.calls).toEqual([{ paymentIntentId: "pi_2", idempotencyKey: "refund-pi_2", reason: "duplicate_payment" }]);
    expect(repo.paymentStatus("cs_test_2")).toBe("refunded");
    expect(await status()).toBe("unlocked");
    expect(repo.reviews).toEqual([expect.objectContaining({ eventId: "evt_2", reason: "duplicate_payment", refundId: "re_1" })]);
    expect(await run(second)).toEqual({ status: 200, outcome: "duplicate" });
    expect(await run(signed(event("checkout.session.async_payment_succeeded", { id: "cs_test_2", payment_intent: "pi_2" }, "evt_2b")))).toEqual({ status: 200, outcome: "already_recorded" });
    expect(refunds.calls).toHaveLength(1);
  });

  it("retries a failed refund on redelivery with the same key, and never refunds twice", async () => {
    const req = signed(event("checkout.session.completed", { amount_total: 100 }));
    refunds.fail = true;
    expect(await run(req)).toEqual({ status: 500, outcome: "error" });
    expect(await repo.hasPaidPayment(AUDIT_1)).toBe(true); // refund pending: still blocks a new checkout
    refunds.fail = false;
    expect(await run(req)).toEqual({ status: 200, outcome: "refunded" });
    expect(await run(req)).toEqual({ status: 200, outcome: "duplicate" });
    expect(refunds.calls.map((c) => c.idempotencyKey)).toEqual(["refund-pi_1", "refund-pi_1"]);
  });

  it("refunds a payment for an audit that cannot be unlocked and leaves the audit as it was", async () => {
    await repo.insertAudit({ ...audit, id: AUDIT_2, status: "failed" });
    await repo.insertPayment({ auditId: AUDIT_2, userId: "user-a", checkoutSessionId: "cs_test_3", amountCents: 9600, status: "pending" });
    expect(await run(signed(event("checkout.session.completed", { id: "cs_test_3", payment_intent: "pi_3", metadata: { audit_id: AUDIT_2 } }, "evt_3"))))
      .toEqual({ status: 200, outcome: "refunded" });
    expect(refunds.calls).toEqual([{ paymentIntentId: "pi_3", idempotencyKey: "refund-pi_3", reason: "not_unlockable" }]);
    expect((await repo.findAudit("user-a", AUDIT_2))?.status).toBe("failed");
    expect(repo.reviews).toEqual([expect.objectContaining({ reason: "not_unlockable", refundId: "re_1" })]);
  });

  it("keeps an unknown session in manual review: no refund", async () => {
    expect(await run(signed(event("checkout.session.completed", { id: "cs_test_unknown" }, "evt_4")))).toEqual({ status: 200, outcome: "unknown_session" });
    expect(repo.reviews).toEqual([expect.objectContaining({ eventId: "evt_4", reason: "unknown_session", refundId: null })]);
    expect(await repo.hasOpenReview(AUDIT_1)).toBe(true);
    expect(refunds.calls).toHaveLength(0);
  });

  it("cannot refund without a payment intent: logged for a person, left open", async () => {
    expect(await run(signed(event("checkout.session.completed", { amount_total: 100, payment_intent: null })))).toEqual({ status: 200, outcome: "amount_mismatch" });
    expect(refunds.calls).toHaveLength(0);
    expect(await repo.hasOpenReview(AUDIT_1)).toBe(true);
  });

  it("dedupes replays of the same event id", async () => {
    const req = signed(event("checkout.session.completed", {}));
    await run(req);
    expect(await run(req)).toEqual({ status: 200, outcome: "duplicate" });
  });

  it("ignores an audit_id that is not a UUID instead of failing (and retrying) forever", async () => {
    repo.applyCheckoutPaid = async () => { throw new Error("invalid input syntax for type uuid"); };
    expect(await run(signed(event("checkout.session.completed", { metadata: { audit_id: "not-a-uuid" } }, "evt_u")))).toEqual({ status: 200, outcome: "ignored" });
  });

  it("ignores events without our metadata and unrelated types", async () => {
    expect(await run(signed(event("checkout.session.completed", { metadata: {} })))).toEqual({ status: 200, outcome: "ignored" });
    expect(await run(signed(event("customer.created", {}, "evt_2")))).toEqual({ status: 200, outcome: "ignored" });
  });

  it("marks failed and expired sessions", async () => {
    expect(await run(signed(event("checkout.session.expired", { payment_status: "unpaid" }, "evt_3")))).toEqual({ status: 200, outcome: "expired" });
    expect(await repo.findPendingPayment(AUDIT_1)).toBeNull();
  });

  it("returns 500 so Stripe retries when storage fails", async () => {
    repo.applyCheckoutPaid = async () => { throw new Error("db down"); };
    expect(await run(signed(event("checkout.session.completed", {})))).toEqual({ status: 500, outcome: "error" });
  });
});
