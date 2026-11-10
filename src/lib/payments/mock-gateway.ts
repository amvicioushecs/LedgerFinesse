import Stripe from "stripe";
import type { CheckoutGateway, CheckoutSessionInfo, CheckoutSessionInput, RefundGateway } from "@/lib/payments/types";

/**
 * Local stand-in for Stripe Checkout (STRIPE_MODE=mock; refused in production). "Paying" builds a
 * real checkout.session.completed payload signed with a local secret and runs it through the same
 * webhook handler, so the signature, amount and dedupe paths are the ones production uses.
 */
export const MOCK_WEBHOOK_SECRET = "whsec_local_mock_only";
export const mockStripe = new Stripe("sk_test_local_mock_only", { httpClient: Stripe.createFetchHttpClient() });

interface MockSession extends CheckoutSessionInfo {
  input: CheckoutSessionInput;
}

export class MockCheckoutGateway implements CheckoutGateway {
  private sessions = new Map<string, MockSession>();
  private byKey = new Map<string, string>();

  constructor(private readonly appUrl: string) {}

  async createSession(input: CheckoutSessionInput): Promise<CheckoutSessionInfo> {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return this.view(this.sessions.get(existing)!);
    const id = `cs_test_mock_${crypto.randomUUID().replace(/-/g, "")}`;
    const session: MockSession = {
      id,
      url: `${this.appUrl}/${input.locale}/checkout/mock?session=${id}`,
      status: "open",
      input,
    };
    this.sessions.set(id, session);
    this.byKey.set(input.idempotencyKey, id);
    return this.view(session);
  }

  async retrieveSession(id: string): Promise<CheckoutSessionInfo> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`no mock session ${id}`);
    return this.view(session);
  }

  async expireSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session?.status === "open") session.status = "expired";
  }

  /** Public details for the mock checkout page. */
  describe(id: string): { amountCents: number; totalOwedCents: number; auditId: string; cancelUrl: string; status: string } | null {
    const s = this.sessions.get(id);
    return s
      ? { amountCents: s.input.amountCents, totalOwedCents: s.input.totalOwedCents, auditId: s.input.auditId, cancelUrl: s.input.cancelUrl, status: s.status }
      : null;
  }

  /** Simulates a successful payment: returns a signed webhook request and the success URL. */
  complete(id: string): { rawBody: string; signature: string; successUrl: string } | null {
    const s = this.sessions.get(id);
    if (!s || s.status !== "open") return null;
    s.status = "complete";
    const rawBody = JSON.stringify({
      id: `evt_mock_${crypto.randomUUID().replace(/-/g, "")}`,
      object: "event",
      type: "checkout.session.completed",
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: s.id,
          object: "checkout.session",
          amount_total: s.input.amountCents,
          currency: "usd",
          payment_status: "paid",
          status: "complete",
          payment_intent: `pi_mock_${s.id.slice(-12)}`,
          client_reference_id: s.input.auditId,
          metadata: { audit_id: s.input.auditId, user_id: s.input.userId },
        },
      },
    });
    const signature = mockStripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: MOCK_WEBHOOK_SECRET });
    return { rawBody, signature, successUrl: s.input.successUrl };
  }

  private view(s: MockSession): CheckoutSessionInfo {
    return { id: s.id, url: s.url, status: s.status };
  }
}

/** Local refunds for the mock gateway: records them, moves no money. */
export class MockRefundGateway implements RefundGateway {
  readonly refunds = new Map<string, string>();

  async refund(paymentIntentId: string, idempotencyKey: string): Promise<string> {
    const existing = this.refunds.get(idempotencyKey);
    if (existing) return existing;
    const id = `re_mock_${paymentIntentId.slice(-12)}`;
    this.refunds.set(idempotencyKey, id);
    return id;
  }
}
