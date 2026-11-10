import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditRepository } from "@/lib/audits/memory-repository";
import type { AuditRecord } from "@/lib/audits/types";
import { startCheckout } from "@/lib/payments/checkout";
import type { CheckoutGateway, CheckoutSessionInfo, CheckoutSessionInput } from "@/lib/payments/types";

class FakeGateway implements CheckoutGateway {
  created: CheckoutSessionInput[] = [];
  sessions = new Map<string, CheckoutSessionInfo>();
  private byKey = new Map<string, CheckoutSessionInfo>();
  async createSession(input: CheckoutSessionInput) {
    this.created.push(input);
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return existing;
    const s: CheckoutSessionInfo = { id: `cs_test_${this.byKey.size + 1}`, url: `https://checkout.stripe.test/${this.byKey.size + 1}`, status: "open" };
    this.byKey.set(input.idempotencyKey, s);
    this.sessions.set(s.id, s);
    return s;
  }
  async retrieveSession(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw new Error("no such session");
    return s;
  }
  expired: string[] = [];
  async expireSession(id: string) {
    this.expired.push(id);
    const s = this.sessions.get(id);
    if (s) s.status = "expired";
  }
}

const audit = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  id: "audit-1", userId: "user-a", status: "preview_ready", locale: "en", jurisdiction: "san-diego-ca",
  tenantName: null, landlordName: null, propertyAddress: null,
  totalOwedCents: 64000, itemCount: 5, linesScanned: 37, feeCents: 9600, unlockedAt: null, createdAt: "2026-11-09T00:00:00Z",
  ...overrides,
});

let repo: MemoryAuditRepository;
let gateway: FakeGateway;
const deps = () => ({ repo, gateway, appUrl: "https://app.test" });

beforeEach(() => {
  repo = new MemoryAuditRepository();
  gateway = new FakeGateway();
});

describe("startCheckout", () => {
  it("creates a session for exactly the stored 15% fee with audit metadata and one key per attempt", async () => {
    await repo.insertAudit(audit());
    const result = await startCheckout(deps(), { userId: "user-a", email: "a@x.test" }, "audit-1", "es");
    expect(result).toEqual({ kind: "redirect", url: "https://checkout.stripe.test/1" });
    expect(gateway.created[0]).toMatchObject({
      auditId: "audit-1", userId: "user-a", amountCents: 9600, totalOwedCents: 64000, locale: "es", customerEmail: "a@x.test",
      idempotencyKey: "lf-checkout-audit-1-0",
      successUrl: "https://app.test/es/audits/audit-1?checkout=success",
      cancelUrl: "https://app.test/es/audits/audit-1?checkout=cancel",
    });
    expect(await repo.findPendingPayment("audit-1")).toMatchObject({ checkoutSessionId: "cs_test_1", amountCents: 9600 });
  });

  it("reuses the open session instead of creating a second one", async () => {
    await repo.insertAudit(audit());
    await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    const again = await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    expect(again).toEqual({ kind: "redirect", url: "https://checkout.stripe.test/1" });
    expect(gateway.created).toHaveLength(1);
  });

  it("starts a new attempt with a new key after the session expired", async () => {
    await repo.insertAudit(audit());
    await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    gateway.sessions.get("cs_test_1")!.status = "expired";
    const result = await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    expect(result).toEqual({ kind: "redirect", url: "https://checkout.stripe.test/2" });
    expect(gateway.created[1].idempotencyKey).toBe("lf-checkout-audit-1-1");
  });

  it("waits for the webhook when the session is already complete (never unlocks itself)", async () => {
    await repo.insertAudit(audit());
    await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    gateway.sessions.get("cs_test_1")!.status = "complete";
    expect(await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en")).toEqual({ kind: "processing" });
    expect((await repo.findAudit("user-a", "audit-1"))?.status).toBe("preview_ready");
  });

  it("expires a still-open session at Stripe before replacing it, so it can't be paid as well", async () => {
    await repo.insertAudit(audit());
    await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    gateway.sessions.get("cs_test_1")!.url = null; // open but unusable: replaced
    const result = await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    expect(gateway.expired).toEqual(["cs_test_1"]);
    expect(result).toEqual({ kind: "redirect", url: "https://checkout.stripe.test/2" });
  });

  it("does not expire a session Stripe already expired", async () => {
    await repo.insertAudit(audit());
    await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    gateway.sessions.get("cs_test_1")!.status = "expired";
    await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en");
    expect(gateway.expired).toEqual([]);
  });

  it("never opens a second checkout once a payment for the audit is recorded (it is under review)", async () => {
    await repo.insertAudit(audit());
    await repo.insertPayment({ auditId: "audit-1", userId: "user-a", checkoutSessionId: "cs_test_paid", amountCents: 9600, status: "paid" });
    expect(await startCheckout(deps(), { userId: "user-a", email: null }, "audit-1", "en")).toEqual({ kind: "no_checkout", reason: "under_review" });
    expect(gateway.created).toHaveLength(0);
  });

  it("does not open checkout for clean, unlocked, foreign or tampered audits", async () => {
    await repo.insertAudit(audit({ id: "clean", status: "clean", totalOwedCents: 0, feeCents: 0 }));
    await repo.insertAudit(audit({ id: "done", status: "unlocked", unlockedAt: "2026-11-09T00:00:00Z" }));
    await repo.insertAudit(audit({ id: "bad", feeCents: 100 }));
    const user = { userId: "user-a", email: null };
    expect(await startCheckout(deps(), user, "clean", "en")).toEqual({ kind: "no_checkout", reason: "clean" });
    expect(await startCheckout(deps(), user, "done", "en")).toEqual({ kind: "no_checkout", reason: "unlocked" });
    expect(await startCheckout(deps(), { userId: "user-b", email: null }, "clean", "en")).toEqual({ kind: "not_found" });
    await expect(startCheckout(deps(), user, "bad", "en")).rejects.toThrow(/fee/);
    expect(gateway.created).toHaveLength(0);
  });
});
