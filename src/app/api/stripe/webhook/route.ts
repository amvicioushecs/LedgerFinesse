import type { NextRequest } from "next/server";
import { serverEnv, stripeWebhookEnabled } from "@/lib/env";
import { handleStripeWebhook } from "@/lib/payments/webhook";
import { webhookDeps } from "@/lib/server/runtime";

/** Stripe webhook: the only place an audit is unlocked. Signature is checked on the raw body. */
export async function POST(request: NextRequest) {
  if (!stripeWebhookEnabled(serverEnv())) return new Response("Not found", { status: 404 });
  const rawBody = await request.text();
  const result = await handleStripeWebhook(webhookDeps(), { rawBody, signature: request.headers.get("stripe-signature") });
  return Response.json({ received: result.status === 200, outcome: result.outcome }, { status: result.status });
}
