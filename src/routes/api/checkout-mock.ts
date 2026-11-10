import { NextResponse, type NextRequest } from "next/server";
import { handleStripeWebhook } from "@/lib/payments/webhook";
import { serverEnv } from "@/lib/env";
import { auditDeps, getCurrentUser, isSameOrigin, mockGateway, webhookDeps } from "@/lib/server/runtime";

/** STRIPE_MODE=mock only: "pays" a mock session by sending a signed event through the real webhook handler. */
export async function POST(request: NextRequest) {
  if (serverEnv().stripeMode !== "mock") return new NextResponse("Not found", { status: 404 });
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const form = await request.formData();
  const sessionId = String(form.get("session") ?? "");
  const gateway = mockGateway();
  const session = gateway.describe(sessionId);
  if (!session || !(await (await auditDeps()).repo.findAudit(user.id, session.auditId))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const paid = gateway.complete(sessionId);
  if (!paid) return NextResponse.redirect(session.cancelUrl, 303);
  const result = await handleStripeWebhook(webhookDeps(), paid);
  if (result.status !== 200) return new NextResponse("Webhook failed", { status: 500 });
  return NextResponse.redirect(paid.successUrl, 303);
}
