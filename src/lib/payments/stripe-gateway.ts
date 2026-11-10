import Stripe from "stripe";
import { formatUsd } from "@/lib/money";
import type { RefundReason } from "@/lib/audits/types";
import type { CheckoutGateway, CheckoutSessionInfo, CheckoutSessionInput, RefundGateway } from "@/lib/payments/types";

/** Pinned so a dashboard upgrade can't change payload shapes under us. Matches stripe@23.1.0. */
export const STRIPE_API_VERSION = "2026-10-28.endive";
/** Per request (SDK default is 80s). Keeps a slow Stripe call well inside a Worker request. */
export const STRIPE_TIMEOUT_MS = 10_000;

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    // fetch + SubtleCrypto work on Cloudflare Workers (no Node http).
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: STRIPE_TIMEOUT_MS,
    appInfo: { name: "LedgerFinesse" },
  });
}

function lineItemDescription(input: CheckoutSessionInput): string {
  const total = formatUsd(input.totalOwedCents);
  if (input.minimumFeeApplied) {
    const fee = formatUsd(input.amountCents);
    return input.locale === "es"
      ? `Tarifa mínima de ${fee} sobre los ${total} encontrados en tu auditoría`
      : `${fee} minimum fee on the ${total} found in your audit`;
  }
  return input.locale === "es" ? `15% de los ${total} encontrados en tu auditoría` : `15% of the ${total} found in your audit`;
}

function toInfo(s: Stripe.Checkout.Session): CheckoutSessionInfo {
  const status: CheckoutSessionInfo["status"] = s.status === "complete" ? "complete" : s.status === "expired" ? "expired" : "open";
  return { id: s.id, url: s.url, status };
}

export class StripeCheckoutGateway implements CheckoutGateway {
  constructor(private readonly stripe: Stripe) {}

  async createSession(input: CheckoutSessionInput): Promise<CheckoutSessionInfo> {
    const metadata = { audit_id: input.auditId, user_id: input.userId };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        // No payment_method_types: payment methods come from the Dashboard (dynamic payment methods).
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: input.amountCents,
              product_data: {
                name: input.locale === "es" ? "Desbloqueo de auditoría LedgerFinesse" : "LedgerFinesse audit unlock",
                description: lineItemDescription(input),
              },
            },
          },
        ],
        client_reference_id: input.auditId,
        metadata,
        payment_intent_data: { metadata },
        customer_email: input.customerEmail ?? undefined,
        locale: input.locale,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return toInfo(session);
  }

  async retrieveSession(id: string): Promise<CheckoutSessionInfo> {
    return toInfo(await this.stripe.checkout.sessions.retrieve(id));
  }

  async expireSession(id: string): Promise<void> {
    try {
      await this.stripe.checkout.sessions.expire(id);
    } catch (error) {
      // Already complete or expired: re-read so a session that just completed is never treated as replaceable.
      const session = await this.stripe.checkout.sessions.retrieve(id);
      if (session.status === "open") throw error;
      if (session.status === "complete") throw new Error(`checkout session ${id} completed while being replaced`);
    }
  }
}

export class StripeRefundGateway implements RefundGateway {
  constructor(private readonly stripe: Stripe) {}

  /** Full refund (no amount). Stripe's own reason is "duplicate" for a second charge, otherwise "requested_by_customer". */
  async refund(paymentIntentId: string, idempotencyKey: string, reason: RefundReason) {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: reason === "duplicate_payment" ? "duplicate" : "requested_by_customer",
        metadata: { ledgerfinesse_reason: reason },
      },
      { idempotencyKey },
    );
    return { refundId: refund.id, amountCents: refund.amount };
  }
}
