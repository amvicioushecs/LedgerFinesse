import type Stripe from "stripe";
import type { AuditRepository, CheckoutPaidOutcome } from "@/lib/audits/types";
import { isUuid } from "@/lib/ids";
import type { RefundGateway } from "@/lib/payments/types";

export type WebhookOutcome =
  | CheckoutPaidOutcome
  | "refunded"
  | "bad_signature"
  | "awaiting_payment"
  | "failed"
  | "expired"
  | "ignored"
  | "error";

interface Deps {
  stripe: Stripe;
  webhookSecret: string;
  repo: AuditRepository;
  refunds: RefundGateway;
}

/** Paid but not unlocked: a person decides (refund policy for these is an open decision). */
const NEEDS_REVIEW: ReadonlySet<WebhookOutcome> = new Set(["amount_mismatch", "unknown_session", "not_unlockable"]);

const cryptoProvider = (stripe: Stripe) => (stripe.constructor as typeof Stripe).createSubtleCryptoProvider();

/**
 * Verifies the signature on the raw body, then unlocks only for a paid session whose amount matches
 * the stored fee. Dedupe and amount checks run inside one database transaction (apply_checkout_paid),
 * which also records every paid session and flags the ones that did not unlock. A second paid session
 * for an audit that is already unlocked is refunded here; if the refund fails we return 500 and the
 * redelivered event (now a "duplicate") retries it with the same idempotency key.
 */
export async function handleStripeWebhook(
  deps: Deps,
  request: { rawBody: string; signature: string | null },
): Promise<{ status: number; outcome: WebhookOutcome }> {
  if (!request.signature) return { status: 400, outcome: "bad_signature" };
  let event: Stripe.Event;
  try {
    event = await deps.stripe.webhooks.constructEventAsync(
      request.rawBody,
      request.signature,
      deps.webhookSecret,
      undefined,
      cryptoProvider(deps.stripe),
    );
  } catch {
    return { status: 400, outcome: "bad_signature" };
  }

  if (!event.type.startsWith("checkout.session.")) return { status: 200, outcome: "ignored" };
  const session = event.data.object as Stripe.Checkout.Session;
  const auditId = session.metadata?.audit_id;
  // Not ours (or malformed): a uuid cast error would 500 and make Stripe retry for days.
  if (!auditId || !isUuid(auditId)) return { status: 200, outcome: "ignored" };

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        if (session.payment_status !== "paid") return { status: 200, outcome: "awaiting_payment" };
        const outcome = await deps.repo.applyCheckoutPaid({
          eventId: event.id,
          eventType: event.type,
          checkoutSessionId: session.id,
          auditId,
          amountCents: session.amount_total ?? -1,
          currency: session.currency ?? "",
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
        });
        if (outcome === "duplicate_payment" || outcome === "duplicate") {
          const due = await deps.repo.findRefundDue(event.id);
          if (due) {
            const refundId = await deps.refunds.refund(due.paymentIntentId, `refund-${event.id}`);
            await deps.repo.recordRefund(event.id, refundId);
            console.warn(JSON.stringify({ msg: "duplicate checkout refunded", eventId: event.id, auditId, refundId }));
            return { status: 200, outcome: "refunded" };
          }
          if (outcome === "duplicate_payment") {
            console.error(JSON.stringify({ msg: "duplicate checkout without a payment intent; refund by hand", eventId: event.id, auditId }));
          }
        }
        if (NEEDS_REVIEW.has(outcome)) {
          console.error(JSON.stringify({ msg: "paid checkout needs review", outcome, eventId: event.id, auditId }));
        }
        return { status: 200, outcome };
      }
      case "checkout.session.async_payment_failed":
        await deps.repo.setPaymentStatus(session.id, "failed");
        return { status: 200, outcome: "failed" };
      case "checkout.session.expired":
        await deps.repo.setPaymentStatus(session.id, "expired");
        return { status: 200, outcome: "expired" };
      default:
        return { status: 200, outcome: "ignored" };
    }
  } catch (error) {
    console.error(JSON.stringify({ msg: "stripe webhook failed", eventId: event.id, error: String(error) }));
    return { status: 500, outcome: "error" };
  }
}
