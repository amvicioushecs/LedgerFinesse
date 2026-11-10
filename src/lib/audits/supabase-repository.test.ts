import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseAuditRepository } from "@/lib/audits/supabase-repository";

/** Records the PostgREST filters a query builds; resolves to { count }. */
function recordingClient(count: number) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "is", "not"]) builder[m] = (...args: unknown[]) => (calls.push([m, ...args]), builder);
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ count, error: null });
  return { client: builder as unknown as SupabaseClient, calls };
}

describe("SupabaseAuditRepository.hasOpenReview", () => {
  it("counts reviews nobody has resolved (resolved_at is null), so a manually resolved review stops blocking", async () => {
    const admin = recordingClient(0);
    const repo = new SupabaseAuditRepository(recordingClient(0).client, admin.client);
    expect(await repo.hasOpenReview("audit-1")).toBe(false);
    expect(admin.calls).toContainEqual(["is", "resolved_at", null]);
    expect(admin.calls).not.toContainEqual(["is", "refund_id", null]);
  });
});
