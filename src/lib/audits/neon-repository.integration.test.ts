/**
 * Opt-in: runs the Neon repository and rate limiter against a real Neon DEV branch.
 *   LF_NEON_TEST=1 DATABASE_URL=... NEON_BRANCH=dev-... npx vitest run src/lib/audits/neon-repository.integration.test.ts
 * Refuses any branch whose name does not start with "dev-" (never production data). Each run uses fresh user ids.
 */
import { describe, expect, it } from "vitest";
import { MemoryDocumentStore } from "@/lib/audits/memory-repository";
import { NeonAuditRepository } from "@/lib/audits/neon-repository";
import { attachDocument, createAudit, getUnlockedReport, scanAudit, type AuditDeps } from "@/lib/audits/service";
import { neonQuery } from "@/lib/db/neon";
import { demoExtractor } from "@/lib/extraction/demo";
import { NeonRateLimitStore } from "@/lib/rate-limit-neon";
import { SAMPLE_CASE } from "@/content/sample-case";

const enabled = process.env.LF_NEON_TEST === "1";
if (enabled && !process.env.NEON_BRANCH?.startsWith("dev-")) throw new Error("LF_NEON_TEST=1 runs only against a dev-* Neon branch");
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

// Network-bound: the dev branch compute may be waking from autosuspend, which can take a few seconds.
describe.skipIf(!enabled)("Neon repository (dev branch)", { timeout: 30_000 }, () => {
  const sql = enabled ? neonQuery(process.env.DATABASE_URL!) : (null as never);
  const deps = (userEmail: string | null = "renter@example.com"): AuditDeps => ({
    repo: new NeonAuditRepository(sql, { userEmail }),
    files: new MemoryDocumentStore(),
    extractor: demoExtractor,
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    dailyAuditLimit: 3,
  });
  const input = { locale: "en" as const, jurisdiction: "san-diego-ca" as const, landlordName: SAMPLE_CASE.landlord, tenantName: null, propertyAddress: null };

  it("creates the profile with the first audit, scopes reads to the owner and enforces the daily cap", async () => {
    const user = crypto.randomUUID(), other = crypto.randomUUID();
    const d = deps();
    const audits = await Promise.all(Array.from({ length: 5 }, () => createAudit(d, user, input)));
    expect(audits.filter(Boolean)).toHaveLength(3);
    const audit = audits.find(Boolean)!;
    expect((await d.repo.findAudit(user, audit.id))?.status).toBe("draft");
    expect(await d.repo.findAudit(other, audit.id)).toBeNull();
    expect(await d.repo.listAudits(other)).toEqual([]);
    expect(await d.repo.listAudits(user)).toHaveLength(3);
    const [profile] = await sql("select email from public.profiles where user_id = $1", [user]);
    expect(profile.email).toBe("renter@example.com");
  });

  it("hides findings and letters until a verified payment unlocks the audit (paywall), and only for the owner", async () => {
    const user = crypto.randomUUID(), other = crypto.randomUUID();
    const d = deps();
    const audit = (await createAudit(d, user, input))!;
    expect((await attachDocument(d, user, audit.id, { kind: "lease", bytes: PDF, declaredType: "application/pdf" })).ok).toBe(true);
    expect((await attachDocument(d, user, audit.id, { kind: "ledger", bytes: PNG, declaredType: "image/png" })).ok).toBe(true);
    expect(await scanAudit(d, user, audit.id)).toEqual({ ok: true });
    const scanned = (await d.repo.findAudit(user, audit.id))!;
    expect(scanned.status).toBe("preview_ready");
    expect(await d.repo.findUnlockedFindings(user, audit.id)).toEqual([]);
    expect(await d.repo.findUnlockedLetter(user, audit.id, "en")).toBeNull();

    const session = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
    await d.repo.insertPayment({ auditId: audit.id, userId: user, checkoutSessionId: session, amountCents: scanned.feeCents!, status: "pending" });
    expect((await d.repo.findPendingPayment(audit.id))?.checkoutSessionId).toBe(session);
    const event = (n: string) => ({ eventId: `evt_${n}_${crypto.randomUUID().slice(0, 8)}`, eventType: "checkout.session.completed", checkoutSessionId: session, auditId: audit.id, amountCents: scanned.feeCents!, currency: "usd", paymentIntentId: `pi_${crypto.randomUUID().slice(0, 8)}` });
    const first = event("a");
    expect(await d.repo.applyCheckoutPaid(first)).toBe("unlocked");
    expect(await d.repo.applyCheckoutPaid(first)).toBe("duplicate");
    expect(await d.repo.hasPaidPayment(audit.id)).toBe(true);
    expect((await d.repo.findUnlockedFindings(user, audit.id)).length).toBeGreaterThan(0);
    expect((await d.repo.findUnlockedLetter(user, audit.id, "en"))?.body).toBeTruthy();
    expect(await d.repo.findUnlockedFindings(other, audit.id)).toEqual([]);
    expect(await d.repo.findUnlockedLetter(other, audit.id, "en")).toBeNull();
    expect((await getUnlockedReport(d, user, audit.id, "en"))).not.toBeNull();
  });

  it("flags a mismatched amount for an automatic refund, records the refund once and closes the review", async () => {
    const user = crypto.randomUUID();
    const d = deps();
    const audit = (await createAudit(d, user, input))!;
    await attachDocument(d, user, audit.id, { kind: "lease", bytes: PDF, declaredType: "application/pdf" });
    await attachDocument(d, user, audit.id, { kind: "ledger", bytes: PNG, declaredType: "image/png" });
    await scanAudit(d, user, audit.id);
    const fee = (await d.repo.findAudit(user, audit.id))!.feeCents!;
    const session = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
    await d.repo.insertPayment({ auditId: audit.id, userId: user, checkoutSessionId: session, amountCents: fee, status: "pending" });
    const eventId = `evt_mm_${crypto.randomUUID().slice(0, 8)}`;
    // Unique per run: the dev branch keeps rows between runs and both ids are unique columns.
    const pi = `pi_mm_${crypto.randomUUID().slice(0, 8)}`;
    const re = `re_test_${crypto.randomUUID().slice(0, 8)}`;
    expect(await d.repo.applyCheckoutPaid({ eventId, eventType: "checkout.session.completed", checkoutSessionId: session, auditId: audit.id, amountCents: fee + 1, currency: "usd", paymentIntentId: pi })).toBe("amount_mismatch");
    expect(await d.repo.hasOpenReview(audit.id)).toBe(true);
    expect(await d.repo.hasPendingRefund(audit.id)).toBe(true);
    expect(await d.repo.hasUnknownSessionReview(audit.id)).toBe(false);
    expect(await d.repo.findRefundDue(eventId)).toEqual({ paymentIntentId: pi, reason: "amount_mismatch", amountCents: fee + 1 });
    expect(await d.repo.recordRefund(eventId, re, fee + 1)).toBe(true);
    expect(await d.repo.recordRefund(eventId, re, fee + 1)).toBe(false);
    expect(await d.repo.hasOpenReview(audit.id)).toBe(false);
    expect(await d.repo.hasPendingRefund(audit.id)).toBe(false);
    expect(await d.repo.hasPaidPayment(audit.id)).toBe(false);
    expect(await d.repo.countPayments(audit.id)).toBe(1);
  });

  it("parks an unrecognized session for a person", async () => {
    const d = deps();
    const audit = (await createAudit(d, crypto.randomUUID(), input))!;
    const outcome = await d.repo.applyCheckoutPaid({ eventId: `evt_unk_${crypto.randomUUID().slice(0, 8)}`, eventType: "checkout.session.completed", checkoutSessionId: `cs_test_unknown_${crypto.randomUUID().slice(0, 8)}`, auditId: audit.id, amountCents: 50, currency: "usd", paymentIntentId: null });
    expect(outcome).toBe("unknown_session");
    expect(await d.repo.hasUnknownSessionReview(audit.id)).toBe(true);
  });

  it("counts rate-limit hits atomically and forgives one", async () => {
    const store = new NeonRateLimitStore(sql);
    const key = `test:subject:${crypto.randomUUID()}`;
    const hits = await Promise.all(Array.from({ length: 4 }, () => store.hit([key], 3, 60)));
    expect(hits.filter(Boolean)).toHaveLength(1);
    await store.forgive([key], 60);
    expect(await store.hit([key], 3, 60)).toBe(true);
  });

  it("grants nothing on app tables or functions to the Data API roles", async () => {
    const rows = await sql(`select r.rolname,
        count(*) filter (where has_table_privilege(r.rolname, c.oid, 'select,insert,update,delete'))::int as tables,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and has_function_privilege(r.rolname, p.oid, 'execute')) as functions
      from pg_roles r cross join pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and r.rolname in ('authenticated', 'anonymous') group by r.rolname`);
    for (const r of rows) expect({ role: r.rolname, tables: r.tables, functions: r.functions }).toEqual({ role: r.rolname, tables: 0, functions: 0 });
  });
});
