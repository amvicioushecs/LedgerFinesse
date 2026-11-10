import { describe, expect, it } from "vitest";
import { previewCheckoutState } from "@/lib/payments/preview-state";

describe("previewCheckoutState", () => {
  it("shows confirming only when a payment is still pending on the server, even if the success URL is still open", () => {
    expect(previewCheckoutState({ checkoutQuery: "success", pendingPayment: true, paymentAttempts: 1 })).toBe("confirming");
  });

  it("does not stay on confirming after a failed or expired payment just because ?checkout=success is in the URL", () => {
    expect(previewCheckoutState({ checkoutQuery: "success", pendingPayment: false, paymentAttempts: 1 })).toBe("retry");
    expect(previewCheckoutState({ checkoutQuery: "success", pendingPayment: false, paymentAttempts: 0 })).toBe("preview");
  });

  it("keeps the preview and offers a retry after checkout is cancelled", () => {
    expect(previewCheckoutState({ checkoutQuery: "cancel", pendingPayment: true, paymentAttempts: 1 })).toBe("retry");
  });

  it("offers a retry after a failed payment even without a checkout query", () => {
    expect(previewCheckoutState({ checkoutQuery: undefined, pendingPayment: false, paymentAttempts: 1 })).toBe("retry");
  });

  it("shows the first-time pay CTA when no checkout has been started", () => {
    expect(previewCheckoutState({ checkoutQuery: undefined, pendingPayment: false, paymentAttempts: 0 })).toBe("preview");
  });
});
