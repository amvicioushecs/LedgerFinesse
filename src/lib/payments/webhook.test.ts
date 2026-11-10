import Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditRepository } from "@/lib/audits/memory-repository";
import type { AuditRecord } from "@/lib/audits/types";
import { handleStripeWebhook } from "@/lib/payments/webhook";

const SECRET = "whsec_test_unit";
const stripe = new Stripe("sk_test_unit_not_real");

const audit: AuditRecord = {
  id: "audit-1", userId: "user-a", status: "preview_ready", locale: "en", jurisdiction: "san-diego-ca",
  tenantName: null, landlordName: null, propertyAddress: null,
  totalOwedCents: 64000, itemCount: 5, linesScanned: 37, feeCents: 9600, unlockedAt: null, createdAt: "2026-11-09T00:00:00Z",
};

function event(type: string, session: Record<string, unknown>, id = "evt_1") {
  return JSON.stringify({
    id, object: "event", type, api_version: "2026-10-28.endive", created: 1, livemode: false,
    data: { object: { id: "cs_test_1", object: "checkout.session", amount_total: 9600, currency: "usd", payment_status: "paid",
      payment_intent: "pi_1", metadata: { audit_id: "audit-1", user_id: "user-a" }, ...session } },
  });
}

const signed = (payload: string, secret = SECRET) => ({ rawBody: payload, signature: stripe.webhooks.generateTestHeaderString({ payload, secret }) });

let repo: MemoryAuditRepository;
const run = (req: { rawBody: string; signature: string | null }) => handleStripeWebhook({ stripe, webhookSecret: SECRET, repo }, req);

beforeEach(async () => {
  repo = new MemoryAuditRepository();
  await repo.insertAudit({ ...audit });
  await repo.insertPayment({ auditId: "audit-1", userId: "user-a", checkoutSessionId: "cs_test_1", amountCents: 9600, status: "pending" });
});

const status = async () => (await repo.findAudit("user-a", "audit-1"))?.status;

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

  it("refuses an amount that does not match the stored fee", async () => {
    expect(await run(signed(event("checkout.session.completed", { amount_total: 100 })))).toEqual({ status: 200, outcome: "amount_mismatch" });
    expect(await status()).toBe("preview_ready");
  });

  it("dedupes replays of the same event id", async () => {
    const req = signed(event("checkout.session.completed", {}));
    await run(req);
    expect(await run(req)).toEqual({ status: 200, outcome: "duplicate" });
  });

  it("ignores events without our metadata and unrelated types", async () => {
    expect(await run(signed(event("checkout.session.completed", { metadata: {} })))).toEqual({ status: 200, outcome: "ignored" });
    expect(await run(signed(event("customer.created", {}, "evt_2")))).toEqual({ status: 200, outcome: "ignored" });
  });

  it("marks failed and expired sessions", async () => {
    expect(await run(signed(event("checkout.session.expired", { payment_status: "unpaid" }, "evt_3")))).toEqual({ status: 200, outcome: "expired" });
    expect(await repo.findPendingPayment("audit-1")).toBeNull();
  });

  it("returns 500 so Stripe retries when storage fails", async () => {
    repo.applyCheckoutPaid = async () => { throw new Error("db down"); };
    expect(await run(signed(event("checkout.session.completed", {})))).toEqual({ status: 500, outcome: "error" });
  });
});
