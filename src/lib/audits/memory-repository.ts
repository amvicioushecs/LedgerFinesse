import type {
  AuditRecord,
  AuditRepository,
  CheckoutPaidEvent,
  CheckoutPaidOutcome,
  DocumentRecord,
  DocumentStore,
  PaymentRecord,
  ScanResult,
  StoredFinding,
  StoredLetter,
} from "@/lib/audits/types";
import type { Locale } from "@/lib/i18n/locales";

/**
 * In-process store for tests, local e2e and demo mode. Mirrors the SQL rules in
 * supabase/migrations (owner scoping, paywall, apply_checkout_paid). Never used in production.
 */
export class MemoryAuditRepository implements AuditRepository {
  private audits = new Map<string, AuditRecord>();
  private documents: DocumentRecord[] = [];
  private scans = new Map<string, ScanResult>();
  private payments = new Map<string, PaymentRecord>();
  private events = new Set<string>();
  private scanStartedAt = new Map<string, string>();

  async insertAudit(audit: AuditRecord) {
    this.audits.set(audit.id, { ...audit });
  }

  async findAudit(userId: string, auditId: string) {
    const audit = this.audits.get(auditId);
    return audit && audit.userId === userId ? { ...audit } : null;
  }

  async listAudits(userId: string) {
    return [...this.audits.values()]
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({ ...a }));
  }

  async insertDocument(doc: DocumentRecord) {
    this.documents.push({ ...doc });
  }

  async listDocuments(userId: string, auditId: string) {
    return this.documents.filter((d) => d.userId === userId && d.auditId === auditId).map((d) => ({ ...d }));
  }

  async claimForScan(userId: string, auditId: string, startedAt: string) {
    const audit = this.audits.get(auditId);
    if (!audit || audit.userId !== userId || audit.status !== "draft") return false;
    audit.status = "processing";
    this.scanStartedAt.set(auditId, startedAt);
    return true;
  }

  async saveScanResult(auditId: string, result: ScanResult) {
    const audit = this.audits.get(auditId);
    if (!audit) throw new Error(`unknown audit ${auditId}`);
    this.scans.set(auditId, structuredClone(result));
    Object.assign(audit, {
      status: result.status,
      totalOwedCents: result.totalOwedCents,
      itemCount: result.itemCount,
      linesScanned: result.linesScanned,
      feeCents: result.feeCents,
      unlockedAt: result.unlockedAt,
    });
  }

  async markFailed(auditId: string) {
    const audit = this.audits.get(auditId);
    if (audit?.status === "processing") audit.status = "failed";
  }

  async failStaleScans(userId: string, startedBefore: string) {
    for (const audit of this.audits.values()) {
      const started = this.scanStartedAt.get(audit.id);
      if (audit.userId === userId && audit.status === "processing" && started !== undefined && started < startedBefore) {
        audit.status = "failed";
      }
    }
  }

  private unlockedScan(userId: string, auditId: string): ScanResult | null {
    const audit = this.audits.get(auditId);
    if (!audit || audit.userId !== userId || audit.status !== "unlocked") return null;
    return this.scans.get(auditId) ?? null;
  }

  async findUnlockedFindings(userId: string, auditId: string): Promise<StoredFinding[]> {
    return structuredClone(this.unlockedScan(userId, auditId)?.findings ?? []);
  }

  async findUnlockedLetter(userId: string, auditId: string, locale: Locale): Promise<StoredLetter | null> {
    const letter = this.unlockedScan(userId, auditId)?.letters.find((l) => l.locale === locale);
    return letter ? { ...letter } : null;
  }

  async insertPayment(payment: PaymentRecord) {
    if (this.payments.has(payment.checkoutSessionId)) throw new Error("duplicate checkout session");
    this.payments.set(payment.checkoutSessionId, { ...payment });
  }

  async findPendingPayment(auditId: string) {
    const found = [...this.payments.values()].find((p) => p.auditId === auditId && p.status === "pending");
    return found ? { ...found } : null;
  }

  async countPayments(auditId: string) {
    return [...this.payments.values()].filter((p) => p.auditId === auditId).length;
  }

  async setPaymentStatus(checkoutSessionId: string, status: PaymentRecord["status"]) {
    const payment = this.payments.get(checkoutSessionId);
    if (payment && payment.status === "pending") payment.status = status;
  }

  async applyCheckoutPaid(event: CheckoutPaidEvent): Promise<CheckoutPaidOutcome> {
    if (this.events.has(event.eventId)) return "duplicate";
    this.events.add(event.eventId);
    const payment = this.payments.get(event.checkoutSessionId);
    const audit = this.audits.get(event.auditId);
    if (!payment || !audit || payment.auditId !== audit.id) return "unknown_session";
    if (audit.status === "unlocked") return "already_unlocked";
    if (audit.status !== "preview_ready") return "not_unlockable";
    if (event.currency !== "usd" || event.amountCents !== audit.feeCents || event.amountCents !== payment.amountCents) {
      return "amount_mismatch";
    }
    payment.status = "paid";
    audit.status = "unlocked";
    audit.unlockedAt = new Date().toISOString();
    return "unlocked";
  }
}

export class MemoryDocumentStore implements DocumentStore {
  private objects = new Map<string, Uint8Array>();

  async put(path: string, bytes: Uint8Array) {
    this.objects.set(path, bytes.slice());
  }

  async get(path: string) {
    return this.objects.get(path)?.slice() ?? null;
  }
}
