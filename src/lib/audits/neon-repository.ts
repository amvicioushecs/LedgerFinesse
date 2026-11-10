import { iso, type Query, type Row } from "@/lib/db/neon";
import type {
  AuditRecord, AuditRepository, CheckoutPaidEvent, CheckoutPaidOutcome, DocumentRecord, PaymentRecord, RefundReason, ScanResult, StoredFinding, StoredLetter,
} from "@/lib/audits/types";
import { REFUNDABLE_REASONS } from "@/lib/audits/types";
import type { Locale } from "@/lib/i18n/locales";
import type { AllowedMime } from "@/lib/uploads";

/**
 * Neon (Lakebase Postgres) implementation. The app server is the only database client (owner role; the Data API
 * roles have no grants), so there is no RLS to lean on: every owner read is filtered by `user_id = $userId` here,
 * and the paywall (findings and letters only once the audit is unlocked) is part of those queries.
 */
const AUDIT_COLUMNS =
  "id, user_id, status, locale, jurisdiction_key, tenant_name, landlord_name, property_address, total_owed_cents, item_count, lines_scanned, fee_cents, unlocked_at, created_at";
const REFUNDABLE = [...REFUNDABLE_REASONS];
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toAudit(r: Row): AuditRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    status: r.status as AuditRecord["status"],
    locale: r.locale as Locale,
    jurisdiction: r.jurisdiction_key as AuditRecord["jurisdiction"],
    tenantName: (r.tenant_name as string | null) ?? null,
    landlordName: (r.landlord_name as string | null) ?? null,
    propertyAddress: (r.property_address as string | null) ?? null,
    totalOwedCents: num(r.total_owed_cents),
    itemCount: num(r.item_count),
    linesScanned: num(r.lines_scanned),
    feeCents: num(r.fee_cents),
    unlockedAt: r.unlocked_at ? iso(r.unlocked_at) : null,
    createdAt: iso(r.created_at),
  };
}

const date = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

function toFinding(r: Row): StoredFinding {
  return {
    position: Number(r.position),
    category: r.category as StoredFinding["category"],
    description: String(r.description),
    firstDate: date(r.first_date),
    lastDate: date(r.last_date),
    lineNumbers: (r.line_numbers as unknown[]).map(Number),
    chargedCents: Number(r.charged_cents),
    allowedCents: Number(r.allowed_cents),
    owedCents: Number(r.owed_cents),
    basis: r.basis as StoredFinding["basis"],
    citation: (r.citation as string | null) ?? null,
    sourceUrl: (r.source_url as string | null) ?? null,
    leaseRef: (r.lease_ref as string | null) ?? null,
    lawNotes: (r.law_notes as StoredFinding["lawNotes"]) ?? [],
  };
}

const exists = async (sql: Query, text: string, params: unknown[]) => (await sql(`select exists (${text}) as found`, params))[0]?.found === true;

export class NeonAuditRepository implements AuditRepository {
  /** `userEmail`: the signed-in renter's address, stored on their profile with the first audit. */
  constructor(private readonly sql: Query, private readonly options: { userEmail: string | null } = { userEmail: null }) {}

  async insertAudit(a: AuditRecord) {
    await this.sql("insert into public.profiles (user_id, email, locale) values ($1, $2, $3) on conflict (user_id) do nothing", [
      a.userId, this.options.userEmail ?? "", a.locale,
    ]);
    await this.sql(
      `insert into public.audits (id, user_id, status, locale, jurisdiction_key, tenant_name, landlord_name, property_address, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [a.id, a.userId, a.status, a.locale, a.jurisdiction, a.tenantName, a.landlordName, a.propertyAddress, a.createdAt],
    );
  }

  async findAudit(userId: string, auditId: string) {
    const [row] = await this.sql(`select ${AUDIT_COLUMNS} from public.audits where id = $1 and user_id = $2`, [auditId, userId]);
    return row ? toAudit(row) : null;
  }

  async listAudits(userId: string) {
    return (await this.sql(`select ${AUDIT_COLUMNS} from public.audits where user_id = $1 order by created_at desc limit 100`, [userId])).map(toAudit);
  }

  async countAuditsSince(userId: string, since: string) {
    const [row] = await this.sql("select count(*)::int as n from public.audits where user_id = $1 and created_at >= $2", [userId, since]);
    return Number(row?.n ?? 0);
  }

  async insertAuditWithinCap(a: AuditRecord, since: string, limit: number) {
    const [row] = await this.sql(
      "select public.insert_audit_within_cap($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as ok",
      [a.id, a.userId, a.locale, a.jurisdiction, a.tenantName, a.landlordName, a.propertyAddress, since, limit, this.options.userEmail ?? ""],
    );
    return row?.ok === true;
  }

  async insertDocument(d: DocumentRecord) {
    await this.sql(
      `insert into public.documents (id, audit_id, user_id, kind, storage_path, mime_type, byte_size, sha256) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [d.id, d.auditId, d.userId, d.kind, d.storagePath, d.mimeType, d.byteSize, d.sha256],
    );
  }

  async listDocuments(userId: string, auditId: string) {
    const rows = await this.sql(
      "select id, audit_id, user_id, kind, storage_path, mime_type, byte_size, sha256 from public.documents where audit_id = $1 and user_id = $2 order by created_at",
      [auditId, userId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      auditId: String(r.audit_id),
      userId: String(r.user_id),
      kind: r.kind as DocumentRecord["kind"],
      storagePath: String(r.storage_path),
      mimeType: r.mime_type as AllowedMime,
      byteSize: Number(r.byte_size),
      sha256: String(r.sha256),
    }));
  }

  async claimForScan(userId: string, auditId: string, startedAt: string) {
    const rows = await this.sql(
      "update public.audits set status = 'processing', scan_started_at = $3 where id = $1 and user_id = $2 and status = 'draft' returning id",
      [auditId, userId, startedAt],
    );
    return rows.length === 1;
  }

  async saveScanResult(auditId: string, result: ScanResult) {
    await this.sql("select public.save_scan_result($1, $2::jsonb)", [auditId, JSON.stringify(result)]);
  }

  async markFailed(auditId: string) {
    await this.sql("update public.audits set status = 'failed' where id = $1 and status = 'processing'", [auditId]);
  }

  async failStaleScans(userId: string, startedBefore: string) {
    await this.sql("update public.audits set status = 'failed' where user_id = $1 and status = 'processing' and scan_started_at < $2", [userId, startedBefore]);
  }

  async findUnlockedFindings(userId: string, auditId: string) {
    const rows = await this.sql(
      `select f.* from public.findings f join public.audits a on a.id = f.audit_id
        where f.audit_id = $1 and f.user_id = $2 and a.user_id = $2 and a.status = 'unlocked' order by f.position`,
      [auditId, userId],
    );
    return rows.map(toFinding);
  }

  async findUnlockedLetter(userId: string, auditId: string, locale: Locale): Promise<StoredLetter | null> {
    const [r] = await this.sql(
      `select l.locale, l.template_version, l.body from public.letters l join public.audits a on a.id = l.audit_id
        where l.audit_id = $1 and l.user_id = $2 and a.user_id = $2 and a.status = 'unlocked' and l.locale = $3
        order by l.created_at desc limit 1`,
      [auditId, userId, locale],
    );
    return r ? { locale: r.locale as Locale, templateVersion: String(r.template_version), body: String(r.body) } : null;
  }

  async insertPayment(p: PaymentRecord) {
    await this.sql(
      "insert into public.payments (audit_id, user_id, stripe_checkout_session_id, amount_cents, status) values ($1, $2, $3, $4, $5)",
      [p.auditId, p.userId, p.checkoutSessionId, p.amountCents, p.status],
    );
  }

  async findPendingPayment(auditId: string) {
    const [r] = await this.sql(
      `select audit_id, user_id, stripe_checkout_session_id, amount_cents, status from public.payments
        where audit_id = $1 and status = 'pending' order by created_at desc limit 1`,
      [auditId],
    );
    return r
      ? { auditId: String(r.audit_id), userId: String(r.user_id), checkoutSessionId: String(r.stripe_checkout_session_id), amountCents: Number(r.amount_cents), status: r.status as PaymentRecord["status"] }
      : null;
  }

  async countPayments(auditId: string) {
    const [row] = await this.sql("select count(*)::int as n from public.payments where audit_id = $1", [auditId]);
    return Number(row?.n ?? 0);
  }

  async setPaymentStatus(checkoutSessionId: string, status: PaymentRecord["status"]) {
    await this.sql("update public.payments set status = $2 where stripe_checkout_session_id = $1 and status = 'pending'", [checkoutSessionId, status]);
  }

  async applyCheckoutPaid(e: CheckoutPaidEvent): Promise<CheckoutPaidOutcome> {
    const [row] = await this.sql(
      "select public.apply_checkout_paid($1, $2, $3, $4, $5, $6, $7) as outcome",
      [e.eventId, e.eventType, e.checkoutSessionId, e.auditId, e.amountCents, e.currency, e.paymentIntentId],
    );
    return row?.outcome as CheckoutPaidOutcome;
  }

  hasPaidPayment(auditId: string) {
    return exists(this.sql, "select 1 from public.payments where audit_id = $1 and status = 'paid'", [auditId]);
  }

  hasOpenReview(auditId: string) {
    return exists(this.sql, "select 1 from public.payment_reviews where audit_id = $1 and resolved_at is null", [auditId]);
  }

  hasUnknownSessionReview(auditId: string) {
    return exists(this.sql, "select 1 from public.payment_reviews where audit_id = $1 and reason = 'unknown_session' and resolved_at is null", [auditId]);
  }

  hasPendingRefund(auditId: string) {
    return exists(this.sql, "select 1 from public.payment_reviews where audit_id = $1 and reason = any($2::text[]) and resolved_at is null", [auditId, REFUNDABLE]);
  }

  async findRefundDue(eventId: string) {
    const [r] = await this.sql(
      "select payment_intent_id, reason, amount_cents from public.payment_reviews where event_id = $1 and reason = any($2::text[]) and refund_id is null",
      [eventId, REFUNDABLE],
    );
    return r?.payment_intent_id
      ? { paymentIntentId: String(r.payment_intent_id), reason: r.reason as RefundReason, amountCents: Number(r.amount_cents ?? 0) }
      : null;
  }

  async recordRefund(eventId: string, refundId: string, amountCents: number) {
    const [row] = await this.sql("select public.record_refund($1, $2, $3) as recorded", [eventId, refundId, amountCents]);
    return row?.recorded === true;
  }
}
