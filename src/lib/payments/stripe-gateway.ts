import Stripe from "stripe";
import { formatUsd } from "@/lib/money";
import type { CheckoutGateway, CheckoutSessionInfo, CheckoutSessionInput } from "@/lib/payments/types";

/** Pinned so a dashboard upgrade can't change payload shapes under us. Matches stripe@23.1.0. */
export const STRIPE_API_VERSION = "2026-10-28.endive";

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    // fetch + SubtleCrypto work on Cloudflare Workers (no Node http).
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    appInfo: { name: "LedgerFinesse" },
  });
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
                description:
                  input.locale === "es"
                    ? `15% de ${formatUsd(input.totalOwedCents)} encontrados en su auditoría`
                    : `15% of the ${formatUsd(input.totalOwedCents)} found in your audit`,
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
}
