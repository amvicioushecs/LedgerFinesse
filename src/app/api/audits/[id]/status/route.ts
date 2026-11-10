import { NextResponse } from "next/server";
import { auditDeps, getCurrentUser } from "@/lib/server/runtime";

/** Owner-only audit status, polled while waiting for the Stripe webhook or a scan. */
export async function GET(_request: Request, { params }: RouteContext<"/api/audits/[id]/status">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const audit = await (await auditDeps()).repo.findAudit(user.id, id);
  if (!audit) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ status: audit.status }, { headers: { "cache-control": "no-store" } });
}
