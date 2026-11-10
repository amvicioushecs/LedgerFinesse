import type { Locale } from "@/lib/i18n/locales";

export interface CheckoutSessionInput {
  auditId: string;
  userId: string;
  amountCents: number;
  totalOwedCents: number;
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
}
