import { describe, expect, it } from "vitest";
import { MemoryAuditRepository } from "@/lib/audits/memory-repository";
import { startCheckout } from "@/lib/payments/checkout";
import { MOCK_WEBHOOK_SECRET, MockCheckoutGateway, mockStripe } from "@/lib/payments/mock-gateway";
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
    const deps = { stripe: mockStripe, webhookSecret: MOCK_WEBHOOK_SECRET, repo };
    expect(await handleStripeWebhook(deps, paid)).toEqual({ status: 200, outcome: "unlocked" });
    expect(await handleStripeWebhook(deps, paid)).toEqual({ status: 200, outcome: "duplicate" });
    expect(gateway.complete(id)).toBeNull();
    expect(paid.successUrl).toBe("http://localhost:3000/en/audits/a1?checkout=success");
  });
});
