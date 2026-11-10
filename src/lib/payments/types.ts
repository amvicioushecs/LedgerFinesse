import type { RefundReason } from "@/lib/audits/types";
import type { Locale } from "@/lib/i18n/locales";

export interface CheckoutSessionInput {
  auditId: string;
  userId: string;
  amountCents: number;
  totalOwedCents: number;
  /** The fee is the 50-cent minimum, not 15% (the line item says so). */
  minimumFeeApplied: boolean;
  locale: Locale;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

export interface CheckoutSessionInfo {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
}

/** The slice of Stripe Checkout we use; real (Stripe SDK) and mock implementations. */
export interface CheckoutGateway {
  createSession(input: CheckoutSessionInput): Promise<CheckoutSessionInfo>;
  retrieveSession(id: string): Promise<CheckoutSessionInfo>;
  /** Makes an open session unpayable at Stripe. */
  expireSession(id: string): Promise<void>;
}

/**
 * Fully refunds a payment intent (refund policy, Hector 2026-11-10). The caller passes the idempotency key
 * (refund-<payment intent>), so a retry or a second event can never refund twice. paidCents is only used by the mock.
 */
export interface RefundGateway {
  refund(paymentIntentId: string, idempotencyKey: string, reason: RefundReason, paidCents?: number): Promise<{ refundId: string; amountCents: number }>;
}
