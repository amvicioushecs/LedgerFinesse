/** Which preview chrome to show after a checkout return. Driven by payment records, not the URL alone. */
export type PreviewCheckoutState = "confirming" | "retry" | "preview";

export function previewCheckoutState(input: {
  checkoutQuery: string | undefined;
  pendingPayment: boolean;
  paymentAttempts: number;
}): PreviewCheckoutState {
  if (input.pendingPayment && input.checkoutQuery === "success") return "confirming";
  if (input.checkoutQuery === "cancel" || (!input.pendingPayment && input.paymentAttempts > 0)) return "retry";
  return "preview";
}
