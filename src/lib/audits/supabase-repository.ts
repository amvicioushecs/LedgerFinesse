import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditRecord,
  AuditRepository,
  CheckoutPaidEvent,
  CheckoutPaidOutcome,
  RefundReason,
  DocumentRecord,
  DocumentStore,
  PaymentRecord,
  ScanResult,
  StoredFinding,
  StoredLetter,
} from "@/lib/audits/types";
import { REFUNDABLE_REASONS } from "@/lib/audits/types";
import type { Locale } from "@/lib/i18n/locales";
import type { AllowedMime } from "@/lib/uploads";

/**
 * Supabase implementation. Owner reads go through `asUser` (the renter's session, so RLS and the
 * paywall policies apply). Writes and webhook work go through `admin` (service role, server only).
 */
type Row = Record<string, unknown>;

const AUDIT_COLUMNS =
  "id, user_id, status, locale, jurisdiction_key, tenant_name, landlord_name, property_address, total_owed_cents, item_count, lines_scanned, fee_cents, unlocked_at, created_at";

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
    unlockedAt: (r.unlocked_at as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

function toFinding(r: Row): StoredFinding {
  return {
    position: Number(r.position),
    category: r.category as StoredFinding["category"],
    description: String(r.description),
    firstDate: String(r.first_date),
    lastDate: String(r.last_date),
    lineNumbers: (r.line_numbers as number[]).map(Number),
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

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export class SupabaseAuditRepository implements AuditRepository {
  constructor(
    private readonly asUser: SupabaseClient,
    private readonly admin: SupabaseClient,
  ) {}

  async insertAudit(a: AuditRecord) {
    check(
      await this.admin.from("audits").insert({
        id: a.id,
        user_id: a.userId,
        status: a.status,
        locale: a.locale,
        jurisdiction_key: a.jurisdiction,
        tenant_name: a.tenantName,
        landlord_name: a.landlordName,
        property_address: a.propertyAddress,
        created_at: a.createdAt,
      }),
      "insert audit",
    );
  }

  async findAudit(userId: string, auditId: string) {
    const data = check(
      await this.asUser.from("audits").select(AUDIT_COLUMNS).eq("id", auditId).eq("user_id", userId).maybeSingle(),
      "find audit",
    );
    return data ? toAudit(data as Row) : null;
  }

  async listAudits(userId: string) {
    const data = check(
      await this.asUser.from("audits").select(AUDIT_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      "list audits",
    );
    return (data as Row[]).map(toAudit);
  }

  async insertDocument(d: DocumentRecord) {
    check(
      await this.admin.from("documents").insert({
        id: d.id,
        audit_id: d.auditId,
        user_id: d.userId,
        kind: d.kind,
        storage_path: d.storagePath,
        mime_type: d.mimeType,
        byte_size: d.byteSize,
        sha256: d.sha256,
      }),
      "insert document",
    );
  }

  async listDocuments(userId: string, auditId: string) {
    const data = check(
      await this.asUser
        .from("documents")
        .select("id, audit_id, user_id, kind, storage_path, mime_type, byte_size, sha256")
        .eq("audit_id", auditId)
        .eq("user_id", userId)
        .order("created_at"),
      "list documents",
    );
    return (data as Row[]).map((r) => ({
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

  async insertAuditWithinCap(a: AuditRecord, since: string, limit: number) {
    return check(
      await this.admin.rpc("insert_audit_within_cap", {
        p_id: a.id,
        p_user_id: a.userId,
        p_locale: a.locale,
        p_jurisdiction_key: a.jurisdiction,
        p_tenant_name: a.tenantName,
        p_landlord_name: a.landlordName,
        p_property_address: a.propertyAddress,
        p_since: since,
        p_limit: limit,
      }),
      "insert audit within cap",
    ) as boolean;
  }

  async countAuditsSince(userId: string, since: string) {
    const { count, error } = await this.admin
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if (error) throw new Error(`count audits: ${error.message}`);
    return count ?? 0;
  }

  async claimForScan(userId: string, auditId: string, startedAt: string) {
    const data = check(
      await this.admin
        .from("audits")
        .update({ status: "processing", scan_started_at: startedAt })
        .eq("id", auditId)
        .eq("user_id", userId)
        .eq("status", "draft")
        .select("id"),
      "claim audit",
    );
    return (data as Row[]).length === 1;
  }

  async saveScanResult(auditId: string, result: ScanResult) {
    check(await this.admin.rpc("save_scan_result", { p_audit_id: auditId, p_result: result }), "save scan result");
  }

  async markFailed(auditId: string) {
    check(await this.admin.from("audits").update({ status: "failed" }).eq("id", auditId).eq("status", "processing"), "mark failed");
  }

  async failStaleScans(userId: string, startedBefore: string) {
    check(
      await this.admin
        .from("audits")
        .update({ status: "failed" })
        .eq("user_id", userId)
        .eq("status", "processing")
        .lt("scan_started_at", startedBefore),
      "fail stale scans",
    );
  }

  async findUnlockedFindings(userId: string, auditId: string) {
    const data = check(
      await this.asUser.from("findings").select("*").eq("audit_id", auditId).eq("user_id", userId).order("position"),
      "find findings",
    );
    return (data as Row[]).map(toFinding);
  }

  async findUnlockedLetter(userId: string, auditId: string, locale: Locale): Promise<StoredLetter | null> {
    const data = check(
      await this.asUser
        .from("letters")
        .select("locale, template_version, body")
        .eq("audit_id", auditId)
        .eq("user_id", userId)
        .eq("locale", locale)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "find letter",
    );
    if (!data) return null;
    const r = data as Row;
    return { locale: r.locale as Locale, templateVersion: String(r.template_version), body: String(r.body) };
  }

  async insertPayment(p: PaymentRecord) {
    check(
      await this.admin.from("payments").insert({
        audit_id: p.auditId,
        user_id: p.userId,
        stripe_checkout_session_id: p.checkoutSessionId,
        amount_cents: p.amountCents,
        status: p.status,
      }),
      "insert payment",
    );
  }

  async findPendingPayment(auditId: string) {
    const data = check(
      await this.admin
        .from("payments")
        .select("audit_id, user_id, stripe_checkout_session_id, amount_cents, status")
        .eq("audit_id", auditId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "find pending payment",
    );
    if (!data) return null;
    const r = data as Row;
    return {
      auditId: String(r.audit_id),
      userId: String(r.user_id),
      checkoutSessionId: String(r.stripe_checkout_session_id),
      amountCents: Number(r.amount_cents),
      status: r.status as PaymentRecord["status"],
    };
  }

  async countPayments(auditId: string) {
    const { count, error } = await this.admin.from("payments").select("id", { count: "exact", head: true }).eq("audit_id", auditId);
    if (error) throw new Error(`count payments: ${error.message}`);
    return count ?? 0;
  }

  async setPaymentStatus(checkoutSessionId: string, status: PaymentRecord["status"]) {
    check(
      await this.admin.from("payments").update({ status }).eq("stripe_checkout_session_id", checkoutSessionId).eq("status", "pending"),
      "set payment status",
    );
  }

  async applyCheckoutPaid(e: CheckoutPaidEvent): Promise<CheckoutPaidOutcome> {
    const data = check(
      await this.admin.rpc("apply_checkout_paid", {
        p_event_id: e.eventId,
        p_event_type: e.eventType,
        p_session_id: e.checkoutSessionId,
        p_audit_id: e.auditId,
        p_amount_cents: e.amountCents,
        p_currency: e.currency,
        p_payment_intent_id: e.paymentIntentId,
      }),
      "apply checkout paid",
    );
    return data as CheckoutPaidOutcome;
  }

  async hasPaidPayment(auditId: string) {
    const { count, error } = await this.admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("audit_id", auditId)
      .eq("status", "paid");
    if (error) throw new Error(`has paid payment: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async hasOpenReview(auditId: string) {
    const { count, error } = await this.admin
      .from("payment_reviews")
      .select("id", { count: "exact", head: true })
      .eq("audit_id", auditId)
      .is("resolved_at", null);
    if (error) throw new Error(`has open review: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async findRefundDue(eventId: string) {
    const data = check(
      await this.admin
        .from("payment_reviews")
        .select("payment_intent_id, reason, amount_cents")
        .eq("event_id", eventId)
        .in("reason", [...REFUNDABLE_REASONS])
        .is("refund_id", null)
        .maybeSingle(),
      "find refund due",
    ) as { payment_intent_id: string | null; reason: RefundReason; amount_cents: number | string | null } | null;
    return data?.payment_intent_id
      ? { paymentIntentId: data.payment_intent_id, reason: data.reason, amountCents: Number(data.amount_cents ?? 0) }
      : null;
  }

  async recordRefund(eventId: string, refundId: string, amountCents: number) {
    return check(
      await this.admin.rpc("record_refund", { p_event_id: eventId, p_refund_id: refundId, p_amount_cents: amountCents }),
      "record refund",
    ) as boolean;
  }
}

/** Private `documents` bucket, written with the service role after server-side checks. */
export class SupabaseDocumentStore implements DocumentStore {
  constructor(private readonly admin: SupabaseClient) {}

  async put(path: string, bytes: Uint8Array, mimeType: AllowedMime) {
    const { error } = await this.admin.storage.from("documents").upload(path, bytes, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
  }

  async get(path: string) {
    const { data, error } = await this.admin.storage.from("documents").download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
}
