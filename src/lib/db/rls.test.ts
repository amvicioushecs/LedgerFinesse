/**
 * RLS and paywall tests against the real migration SQL, on PGlite (in-process Postgres).
 * Covers: owner isolation, locked findings/letters, no renter writes, server-only tables,
 * Storage folder isolation, the fee-policy check, and the Stripe unlock function.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const AUDIT_A = "10000000-0000-4000-8000-00000000000a";
const AUDIT_B = "10000000-0000-4000-8000-00000000000b";

let db: PGlite;

async function as<T>(role: "anon" | "authenticated" | "service_role", userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;

async function seed() {
  await db.exec(`
    truncate public.payment_reviews, public.stripe_events, public.payments, public.letters, public.findings, public.extractions,
      public.documents, public.audits, public.profiles, auth.users, storage.objects cascade;
    insert into auth.users (id, email) values ('${A}', 'a@example.test'), ('${B}', 'b@example.test');
    insert into public.audits (id, user_id, status, jurisdiction_key, total_owed_cents, item_count, lines_scanned, fee_cents)
      values ('${AUDIT_A}', '${A}', 'preview_ready', 'san-diego-ca', 64000, 5, 37, 9600),
             ('${AUDIT_B}', '${B}', 'preview_ready', 'austin-tx', 10000, 1, 12, 1500);
    insert into public.findings (audit_id, user_id, position, category, description, first_date, last_date, line_numbers,
      charged_cents, allowed_cents, owed_cents, basis)
      values ('${AUDIT_A}', '${A}', 0, 'unauthorized_fee', 'RUBS Billing Admin Fee', '2026-01-01', '2026-10-01', '{2}', 15000, 0, 15000, 'lease'),
             ('${AUDIT_B}', '${B}', 0, 'late_fee_timing', 'Late Charge', '2026-06-04', '2026-06-04', '{9}', 10000, 0, 10000, 'lease');
    insert into public.letters (audit_id, user_id, locale, template_version, body)
      values ('${AUDIT_A}', '${A}', 'en', 'v1', 'Dear landlord'), ('${AUDIT_B}', '${B}', 'en', 'v1', 'Dear landlord');
    insert into public.extractions (audit_id, user_id, source, data) values ('${AUDIT_A}', '${A}', 'demo', '{}');
    insert into public.payments (audit_id, user_id, stripe_checkout_session_id, amount_cents)
      values ('${AUDIT_A}', '${A}', 'cs_test_a', 9600), ('${AUDIT_B}', '${B}', 'cs_test_b', 1500);
    insert into storage.objects (bucket_id, name) values ('documents', '${A}/${AUDIT_A}/doc.pdf'), ('documents', '${B}/${AUDIT_B}/doc.pdf');
  `);
}

const pay = (eventId: string, session: string, audit: string, amount: number, paymentIntent = `pi_${session}`) =>
  as("service_role", null, async () =>
    (await rows(`select public.apply_checkout_paid($1, 'checkout.session.completed', $2, $3, $4, 'usd', $5) as r`,
      [eventId, session, audit, amount, paymentIntent]))[0].r as string);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(ROOT, "src/lib/db/supabase-stub.sql"), "utf8"));
  const dir = path.join(ROOT, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
}, 60_000);

afterAll(async () => db?.close());
beforeEach(seed);

describe("owner isolation", () => {
  it("a renter sees only their own audit summary and profile", async () => {
    const audits = await as("authenticated", A, () => rows("select id, total_owed_cents, fee_cents from public.audits"));
    expect(audits).toEqual([{ id: AUDIT_A, total_owed_cents: 64000, fee_cents: 9600 }]);
    const profiles = await as("authenticated", A, () => rows("select user_id from public.profiles"));
    expect(profiles).toEqual([{ user_id: A }]);
  });

  it("anon can read nothing", async () => {
    await expect(as("anon", null, () => rows("select * from public.audits"))).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, () => rows("select * from public.findings"))).rejects.toThrow(/permission denied/);
  });

  it("server-only tables are closed to renters", async () => {
    await expect(as("authenticated", A, () => rows("select * from public.extractions"))).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A, () => rows("select * from public.stripe_events"))).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A, () => rows("select * from public.payment_reviews"))).rejects.toThrow(/permission denied/);
  });
});

describe("paywall", () => {
  it("hides findings and letters until the audit is unlocked", async () => {
    expect(await as("authenticated", A, () => rows("select * from public.findings"))).toEqual([]);
    expect(await as("authenticated", A, () => rows("select * from public.letters"))).toEqual([]);
  });

  it("shows only the owner's findings and letters after a verified unlock", async () => {
    expect(await pay("evt_1", "cs_test_a", AUDIT_A, 9600)).toBe("unlocked");
    const findings = await as("authenticated", A, () => rows("select audit_id from public.findings"));
    expect(findings).toEqual([{ audit_id: AUDIT_A }]);
    expect(await as("authenticated", A, () => rows("select audit_id from public.letters"))).toEqual([{ audit_id: AUDIT_A }]);
    expect(await as("authenticated", B, () => rows("select * from public.findings"))).toEqual([]);
  });

  it("renters cannot unlock, edit fees or status, or insert findings", async () => {
    await expect(as("authenticated", A, () => rows(`update public.audits set status = 'unlocked', unlocked_at = now() where id = $1`, [AUDIT_A])))
      .rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A, () => rows(`update public.audits set fee_cents = 0 where id = $1`, [AUDIT_A])))
      .rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A, () => rows(`insert into public.audits (user_id, jurisdiction_key) values ($1, 'san-diego-ca')`, [A])))
      .rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A, () => rows(`select public.apply_checkout_paid('evt_x', 't', 'cs_test_a', $1, 9600, 'usd', null)`, [AUDIT_A])))
      .rejects.toThrow(/permission denied/);
  });
});

describe("apply_checkout_paid", () => {
  it("refuses an amount that differs from the stored 15% fee but records the payment and flags it", async () => {
    expect(await pay("evt_2", "cs_test_a", AUDIT_A, 100)).toBe("amount_mismatch");
    expect((await rows("select status from public.audits where id = $1", [AUDIT_A]))[0].status).toBe("preview_ready");
    expect((await rows("select status, paid_at is not null as paid from public.payments where stripe_checkout_session_id = 'cs_test_a'"))[0]).toEqual({ status: "paid", paid: true });
    expect(await rows("select event_id, reason, amount_cents, refund_id from public.payment_reviews")).toEqual([
      { event_id: "evt_2", reason: "amount_mismatch", amount_cents: 100, refund_id: null },
    ]);
  });

  it("checks the paid amount against the stored 50-cent minimum fee", async () => {
    await db.query(`update public.audits set total_owed_cents = 300, fee_cents = 50 where id = $1`, [AUDIT_A]);
    await db.query(`update public.findings set charged_cents = 300, owed_cents = 300 where audit_id = $1`, [AUDIT_A]);
    await db.query(`update public.payments set amount_cents = 50 where stripe_checkout_session_id = 'cs_test_a'`);
    expect(await pay("evt_m1", "cs_test_a", AUDIT_A, 45)).toBe("amount_mismatch");
    await db.query(`insert into public.payments (audit_id, user_id, stripe_checkout_session_id, amount_cents) values ($1, $2, 'cs_test_m', 50)`, [AUDIT_A, A]);
    expect(await pay("evt_m2", "cs_test_m", AUDIT_A, 50)).toBe("unlocked");
  });

  it("flags a second paid session for an unlocked audit as a duplicate payment, then records its refund", async () => {
    await db.exec(`insert into public.payments (audit_id, user_id, stripe_checkout_session_id, amount_cents) values ('${AUDIT_A}', '${A}', 'cs_test_a2', 9600)`);
    expect(await pay("evt_6", "cs_test_a", AUDIT_A, 9600)).toBe("unlocked");
    expect(await pay("evt_7", "cs_test_a2", AUDIT_A, 9600)).toBe("duplicate_payment");
    expect(await rows("select event_id, reason from public.payment_reviews")).toEqual([{ event_id: "evt_7", reason: "duplicate_payment" }]);
    expect(await as("service_role", null, () => rows("select public.record_refund('evt_7', 're_test_1') as ok"))).toEqual([{ ok: true }]);
    expect((await rows("select status from public.payments where stripe_checkout_session_id = 'cs_test_a2'"))[0].status).toBe("refunded");
    expect((await rows("select refund_id from public.payment_reviews where event_id = 'evt_7'"))[0].refund_id).toBe("re_test_1");
    await expect(as("authenticated", A, () => rows("select public.record_refund('evt_7', 're_x')"))).rejects.toThrow(/permission denied/);
  });

  it("never unlocks on a missing currency (NULL-safe comparisons)", async () => {
    const call = (eventId: string, amount: number | null, currency: string | null) =>
      as("service_role", null, async () =>
        (await rows(`select public.apply_checkout_paid($1, 'checkout.session.completed', 'cs_test_a', $2, $3, $4, 'pi_null') as r`,
          [eventId, AUDIT_A, amount, currency]))[0].r as string);
    expect(await call("evt_n1", 9600, null)).toBe("amount_mismatch");
    expect((await rows("select status from public.audits where id = $1", [AUDIT_A]))[0].status).toBe("preview_ready");
  });

  it("never unlocks on a missing amount", async () => {
    const r = await as("service_role", null, async () =>
      (await rows(`select public.apply_checkout_paid('evt_n2', 'checkout.session.completed', 'cs_test_a', $1, null, 'usd', 'pi_null2') as r`, [AUDIT_A]))[0].r);
    expect(r).toBe("amount_mismatch");
    expect((await rows("select status from public.audits where id = $1", [AUDIT_A]))[0].status).toBe("preview_ready");
  });

  it("flags an unknown session", async () => {
    expect(await pay("evt_8", "cs_test_nope", AUDIT_A, 9600)).toBe("unknown_session");
    expect(await rows("select event_id, reason, checkout_session_id from public.payment_reviews")).toEqual([
      { event_id: "evt_8", reason: "unknown_session", checkout_session_id: "cs_test_nope" },
    ]);
  });

  it("dedupes a redelivered event and treats a new event after unlock as already unlocked", async () => {
    expect(await pay("evt_3", "cs_test_a", AUDIT_A, 9600)).toBe("unlocked");
    expect(await pay("evt_3", "cs_test_a", AUDIT_A, 9600)).toBe("duplicate");
    expect(await pay("evt_4", "cs_test_a", AUDIT_A, 9600)).toBe("already_unlocked");
    const [payment] = await rows("select status from public.payments where stripe_checkout_session_id = 'cs_test_a'");
    expect(payment.status).toBe("paid");
  });

  it("rejects a session that belongs to another audit", async () => {
    expect(await pay("evt_5", "cs_test_b", AUDIT_A, 1500)).toBe("unknown_session");
  });
});

describe("save_scan_result", () => {
  const AUDIT_C = "10000000-0000-4000-8000-00000000000c";
  const result = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    status: "preview_ready", totalOwedCents: 15000, itemCount: 1, linesScanned: 3, feeCents: 2250, unlockedAt: null,
    engineVersion: "test", extraction: { source: "demo", data: { ledger: [] } },
    findings: [{ position: 0, category: "unauthorized_fee", description: "RUBS", firstDate: "2026-01-01", lastDate: "2026-10-01",
      lineNumbers: [2, 5], chargedCents: 15000, allowedCents: 0, owedCents: 15000, basis: "lease", citation: null, sourceUrl: null,
      leaseRef: "Lease § 11", lawNotes: [] }],
    letters: [{ locale: "en", templateVersion: "v1", body: "Dear landlord" }],
    ...overrides,
  });

  beforeEach(async () => {
    await db.query(`insert into public.audits (id, user_id, status, jurisdiction_key, scan_started_at) values ($1, $2, 'processing', 'san-diego-ca', now())`, [AUDIT_C, A]);
  });

  it("stores findings, letters and the summary in one call", async () => {
    await as("service_role", null, () => rows("select public.save_scan_result($1, $2::jsonb)", [AUDIT_C, result()]));
    const [audit] = await rows("select status, total_owed_cents, fee_cents from public.audits where id = $1", [AUDIT_C]);
    expect(audit).toEqual({ status: "preview_ready", total_owed_cents: 15000, fee_cents: 2250 });
    const [finding] = await rows("select line_numbers, lease_ref from public.findings where audit_id = $1", [AUDIT_C]);
    expect(finding).toEqual({ line_numbers: [2, 5], lease_ref: "Lease § 11" });
  });

  it("rolls back when findings do not add up or the fee is not 15%", async () => {
    await expect(as("service_role", null, () => rows("select public.save_scan_result($1, $2::jsonb)", [AUDIT_C, result({ totalOwedCents: 20000, feeCents: 3000 })])))
      .rejects.toThrow(/do not add up/);
    await expect(as("service_role", null, () => rows("select public.save_scan_result($1, $2::jsonb)", [AUDIT_C, result({ feeCents: 100 })])))
      .rejects.toThrow(/audits_fee_matches_policy/);
    expect(await rows("select * from public.findings where audit_id = $1", [AUDIT_C])).toEqual([]);
  });

  it("only finishes a scan as preview_ready, clean, or unlocked free when under 50 cents is owed", async () => {
    const save = (overrides: Record<string, unknown>) =>
      as("service_role", null, () => rows("select public.save_scan_result($1, $2::jsonb)", [AUDIT_C, result(overrides)]));
    const finding = (owed: number) => [{ position: 0, category: "unauthorized_fee", description: "Mystery", firstDate: "2026-02-01", lastDate: "2026-02-01",
      lineNumbers: [1], chargedCents: owed, allowedCents: 0, owedCents: owed, basis: "lease", citation: null, sourceUrl: null, leaseRef: null, lawNotes: [] }];
    await expect(save({ status: "unlocked", unlockedAt: "2026-11-09T00:00:00Z" })).rejects.toThrow(/may not finish as unlocked/);
    for (const status of ["draft", "processing", "failed"]) {
      await expect(save({ status })).rejects.toThrow(/may not finish as/);
    }
    await expect(save({ status: "preview_ready", totalOwedCents: 300, feeCents: 0, findings: finding(300) })).rejects.toThrow(/may not finish as preview_ready/);
    // 300 cents owed now pays the 50-cent minimum: a free unlock is refused.
    await expect(save({ status: "unlocked", unlockedAt: "2026-11-09T00:00:00Z", totalOwedCents: 300, feeCents: 0, findings: finding(300) }))
      .rejects.toThrow(/may not finish as unlocked/);
    expect((await rows("select status from public.audits where id = $1", [AUDIT_C]))[0].status).toBe("processing");

    await save({ status: "unlocked", unlockedAt: "2026-11-09T00:00:00Z", totalOwedCents: 49, feeCents: 0, findings: finding(49) });
    expect((await rows("select status, fee_cents, free_unlock_below_minimum from public.audits where id = $1", [AUDIT_C]))[0])
      .toEqual({ status: "unlocked", fee_cents: 0, free_unlock_below_minimum: true });
  });

  it("charges the 50-cent minimum when 15% is less", async () => {
    await as("service_role", null, () => rows("select public.save_scan_result($1, $2::jsonb)", [AUDIT_C,
      result({ totalOwedCents: 300, feeCents: 50, findings: [{ position: 0, category: "unauthorized_fee", description: "Mystery", firstDate: "2026-02-01",
        lastDate: "2026-02-01", lineNumbers: [1], chargedCents: 300, allowedCents: 0, owedCents: 300, basis: "lease", citation: null, sourceUrl: null, leaseRef: null, lawNotes: [] }] })]));
    expect((await rows("select status, fee_cents, free_unlock_below_minimum from public.audits where id = $1", [AUDIT_C]))[0])
      .toEqual({ status: "preview_ready", fee_cents: 50, free_unlock_below_minimum: false });
  });

  it("refuses an audit that is not processing, and renters cannot call it", async () => {
    await expect(as("service_role", null, () => rows("select public.save_scan_result($1, $2::jsonb)", [AUDIT_A, result()]))).rejects.toThrow(/not processing/);
    await expect(as("authenticated", A, () => rows("select public.save_scan_result($1, $2::jsonb)", [AUDIT_C, result()]))).rejects.toThrow(/permission denied/);
  });
});

describe("constraints", () => {
  it("rejects any fee other than max(15% of the total, 50 cents)", async () => {
    await expect(db.query(`update public.audits set fee_cents = 12800 where id = $1`, [AUDIT_A])).rejects.toThrow(/audits_fee_matches_policy/);
  });

  it.each([
    [0, 0, true], [49, 0, true], [49, 50, false],
    [50, 50, true], [50, 8, false], [50, 0, false],
    [333, 50, true], [334, 50, true], [334, 0, false],
    [1_000_000, 150_000, true], [1_000_000, 50, false],
  ])("owed %i cents with fee %i cents is allowed: %s", async (owed, fee, ok) => {
    const q = db.query(`update public.audits set total_owed_cents = $2, fee_cents = $3 where id = $1`, [AUDIT_A, owed, fee]);
    if (ok) await expect(q).resolves.toBeDefined();
    else await expect(q).rejects.toThrow(/audits_fee_matches_policy/);
  });

  it("flags free unlocks under the minimum on the record, indexed for review", async () => {
    await db.query(`update public.audits set status = 'unlocked', unlocked_at = now(), total_owed_cents = 49, fee_cents = 0 where id = $1`, [AUDIT_A]);
    expect(await rows(`select id from public.audits where free_unlock_below_minimum`)).toEqual([{ id: AUDIT_A }]);
    expect(await rows(`select indexname from pg_indexes where indexname = 'audits_free_unlock_below_minimum_idx'`)).toHaveLength(1);
  });
});

describe("storage", () => {
  it("documents bucket is private and owners read only their own folder", async () => {
    const [bucket] = await rows("select public, file_size_limit from storage.buckets where id = 'documents'");
    expect(bucket).toEqual({ public: false, file_size_limit: 15728640 });
    const objects = await as("authenticated", A, () => rows("select name from storage.objects"));
    expect(objects).toEqual([{ name: `${A}/${AUDIT_A}/doc.pdf` }]);
    expect(await as("anon", null, () => rows("select name from storage.objects"))).toEqual([]);
  });

  it("renters cannot upload directly", async () => {
    await expect(as("authenticated", A, () => rows(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${A}/x/y.pdf`])))
      .rejects.toThrow(/row-level security/);
  });
});
