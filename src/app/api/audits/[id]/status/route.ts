import { NextResponse } from "next/server";
import { getAuditStatus } from "@/lib/audits/service";
import { auditDeps, getCurrentUser } from "@/lib/server/runtime";

/** Owner-only audit status, polled while waiting for the Stripe webhook or a scan. */
export async function GET(_request: Request, { params }: RouteContext<"/api/audits/[id]/status">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = await getAuditStatus(await auditDeps(), user.id, id);
  if (!status) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ status }, { headers: { "cache-control": "no-store" } });
}
