import type { AuditRepository } from "@/lib/audits/types";
import type { Locale } from "@/lib/i18n/locales";
import { unlockDecision } from "@/lib/pricing";
import type { CheckoutGateway } from "@/lib/payments/types";

export type StartCheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "processing" }
  | { kind: "no_checkout"; reason: "clean" | "unlocked" | "not_ready" }
  | { kind: "not_found" };

interface Deps {
  repo: AuditRepository;
  gateway: CheckoutGateway;
  appUrl: string;
}

/**
 * Opens (or resumes) Stripe Checkout for an audit. The amount always comes from the stored audit,
 * never from the request. Unlocking happens only in the webhook.
 */
export async function startCheckout(
  deps: Deps,
  user: { userId: string; email: string | null },
  auditId: string,
  locale: Locale,
): Promise<StartCheckoutResult> {
  const audit = await deps.repo.findAudit(user.userId, auditId);
  if (!audit) return { kind: "not_found" };
  if (audit.status === "unlocked") return { kind: "no_checkout", reason: "unlocked" };
  if (audit.status === "clean") return { kind: "no_checkout", reason: "clean" };
  if (audit.status !== "preview_ready" || audit.totalOwedCents === null) return { kind: "no_checkout", reason: "not_ready" };

  const decision = unlockDecision(audit.totalOwedCents);
  if (decision.kind !== "checkout" || decision.feeCents !== audit.feeCents) {
    throw new Error(`stored fee for audit ${auditId} does not match 15% of its total`);
  }

  const pending = await deps.repo.findPendingPayment(auditId);
  if (pending) {
    const session = await deps.gateway.retrieveSession(pending.checkoutSessionId);
    if (session.status === "complete") return { kind: "processing" };
    if (session.status === "open" && session.url && pending.amountCents === decision.feeCents) {
      return { kind: "redirect", url: session.url };
    }
    await deps.repo.setPaymentStatus(pending.checkoutSessionId, "expired");
  }

  const attempt = await deps.repo.countPayments(auditId);
  const back = `${deps.appUrl}/${locale}/audits/${auditId}`;
  const session = await deps.gateway.createSession({
    auditId,
    userId: user.userId,
    amountCents: decision.feeCents,
    totalOwedCents: audit.totalOwedCents,
    locale,
    customerEmail: user.email,
    successUrl: `${back}?checkout=success`,
    cancelUrl: `${back}?checkout=cancel`,
    idempotencyKey: `lf-checkout-${auditId}-${attempt}`,
  });
  if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL");
  try {
    await deps.repo.insertPayment({
      auditId,
      userId: user.userId,
      checkoutSessionId: session.id,
      amountCents: decision.feeCents,
      status: "pending",
    });
  } catch (error) {
    // A concurrent request with the same idempotency key already recorded this session.
    const recorded = await deps.repo.findPendingPayment(auditId);
    if (recorded?.checkoutSessionId !== session.id) throw error;
  }
  return { kind: "redirect", url: session.url };
}
