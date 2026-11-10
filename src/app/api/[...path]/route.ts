import type { NextRequest } from "next/server";
import { dispatch, type Route } from "@/routes/dispatch";
import { GET as auditStatus } from "@/routes/api/audit-status";
import { POST as createAudit } from "@/routes/api/audits";
import { POST as checkout } from "@/routes/api/checkout";
import { POST as checkoutMock } from "@/routes/api/checkout-mock";
import { POST as stripeWebhook } from "@/routes/api/stripe-webhook";

/** Every /api/* endpoint, in one Route Handler entry (see src/routes/dispatch.ts for why). */
const routes: Route[] = [
  { pattern: ["audits"], methods: { POST: createAudit } },
  { pattern: ["audits", ":id", "status"], methods: { GET: auditStatus } },
  { pattern: ["checkout"], methods: { POST: checkout } },
  { pattern: ["checkout", "mock"], methods: { POST: checkoutMock } },
  { pattern: ["stripe", "webhook"], methods: { POST: stripeWebhook } },
];

export async function POST(request: NextRequest, { params }: RouteContext<"/api/[...path]">) {
  return dispatch(routes, "POST", request, (await params).path);
}

export async function GET(request: NextRequest, { params }: RouteContext<"/api/[...path]">) {
  return dispatch(routes, "GET", request, (await params).path);
}
