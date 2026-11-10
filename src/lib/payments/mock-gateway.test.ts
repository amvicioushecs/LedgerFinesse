import { describe, expect, it } from "vitest";
import { MemoryAuditRepository } from "@/lib/audits/memory-repository";
import { startCheckout } from "@/lib/payments/checkout";
import { MOCK_WEBHOOK_SECRET, MockCheckoutGateway, MockRefundGateway, mockStripe } from "@/lib/payments/mock-gateway";
import { handleStripeWebhook } from "@/lib/payments/webhook";

describe("mock checkout end to end", () => {
  it("unlocks only through the signed webhook path, once", async () => {
    const repo = new MemoryAuditRepository();
    await repo.insertAudit({
      id: "a1", userId: "u1", status: "preview_ready", locale: "en", jurisdiction: "san-diego-ca", tenantName: null, landlordName: null,
      propertyAddress: null, totalOwedCents: 64000, itemCount: 5, linesScanned: 37, feeCents: 9600, unlockedAt: null, createdAt: "2026-11-09T00:00:00Z",
    });
    const gateway = new MockCheckoutGateway("http://localhost:3000");
    const start = await startCheckout({ repo, gateway, appUrl: "http://localhost:3000" }, { userId: "u1", email: null }, "a1", "en");
    expect(start.kind).toBe("redirect");
    const id = new URL((start as { url: string }).url).searchParams.get("session")!;
    expect(gateway.describe(id)).toMatchObject({ amountCents: 9600, auditId: "a1" });

    const paid = gateway.complete(id)!;
    const deps = { stripe: mockStripe, webhookSecret: MOCK_WEBHOOK_SECRET, repo, refunds: new MockRefundGateway() };
    expect(await handleStripeWebhook(deps, paid)).toEqual({ status: 200, outcome: "unlocked" });
    expect(await handleStripeWebhook(deps, paid)).toEqual({ status: 200, outcome: "duplicate" });
    expect(gateway.complete(id)).toBeNull();
    expect(paid.successUrl).toBe("http://localhost:3000/en/audits/a1?checkout=success");
  });

  it("mock refunds are idempotent per key and an expired mock session cannot be paid", async () => {
    const refunds = new MockRefundGateway();
    expect(await refunds.refund("pi_mock_abc", "refund-evt_1")).toBe(await refunds.refund("pi_mock_abc", "refund-evt_1"));
    expect(refunds.refunds.size).toBe(1);
    const gateway = new MockCheckoutGateway("http://localhost:3000");
    const s = await gateway.createSession({ auditId: "a1", userId: "u1", amountCents: 9600, totalOwedCents: 64000, locale: "en", customerEmail: null, successUrl: "s", cancelUrl: "c", idempotencyKey: "k" });
    await gateway.expireSession(s.id);
    expect(gateway.complete(s.id)).toBeNull();
  });
});
