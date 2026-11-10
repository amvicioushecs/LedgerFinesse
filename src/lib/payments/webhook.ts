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

/** Outcomes that may owe a refund (the repository decides per event; "duplicate" = redelivery, retry). */
const REFUND_ON: ReadonlySet<WebhookOutcome> = new Set(["amount_mismatch", "not_unlockable", "duplicate_payment", "duplicate"]);

const cryptoProvider = (stripe: Stripe) => (stripe.constructor as typeof Stripe).createSubtleCryptoProvider();

/**
 * Verifies the signature on the raw body, then unlocks only for a paid session whose amount matches
 * the stored fee. Dedupe and amount checks run inside one database transaction (apply_checkout_paid),
 * which also records every paid session and flags the ones that did not unlock. Mismatches, audits that
 * can't unlock and second charges are refunded here; if the refund fails we return 500 and the redelivered
 * event (now a "duplicate") retries it with the same idempotency key. Unknown sessions wait for a person.
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
        // Refund policy (Hector, 2026-11-10): full automatic refund for a mismatch, an audit that can't unlock, or a
        // second charge. A redelivered event ("duplicate") retries a refund that failed. The key is the payment
        // intent, so neither a retry nor another event for the same payment can refund twice.
        if (REFUND_ON.has(outcome)) {
          const due = await deps.repo.findRefundDue(event.id);
          if (due) {
            const refund = await deps.refunds.refund(due.paymentIntentId, `refund-${due.paymentIntentId}`, due.reason, due.amountCents);
            await deps.repo.recordRefund(event.id, refund.refundId, refund.amountCents);
            console.warn(JSON.stringify({ msg: "payment refunded", reason: due.reason, eventId: event.id, auditId, refundId: refund.refundId, amountCents: refund.amountCents }));
            return { status: 200, outcome: "refunded" };
          }
          if (outcome !== "duplicate") {
            console.error(JSON.stringify({ msg: "refundable payment has no payment intent; refund by hand", outcome, eventId: event.id, auditId }));
          }
        }
        if (outcome === "unknown_session") {
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
