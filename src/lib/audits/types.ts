import type { JurisdictionKey, Statute } from "@/lib/jurisdictions";
import type { Locale } from "@/lib/i18n/locales";
import type { AllowedMime } from "@/lib/uploads";
import type { Extraction, Finding, FindingCategory } from "@/lib/rules-engine/types";

export type AuditStatus = "draft" | "processing" | "preview_ready" | "clean" | "unlocked" | "failed";
export type DocKind = "lease" | "ledger";

export interface AuditRecord {
  id: string;
  userId: string;
  status: AuditStatus;
  locale: Locale;
  jurisdiction: JurisdictionKey;
  tenantName: string | null;
  landlordName: string | null;
  propertyAddress: string | null;
  totalOwedCents: number | null;
  itemCount: number | null;
  linesScanned: number | null;
  feeCents: number | null;
  unlockedAt: string | null;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  auditId: string;
  userId: string;
  kind: DocKind;
  storagePath: string;
  mimeType: AllowedMime;
  byteSize: number;
  sha256: string;
}

/** A report item as stored in `findings` (readable by the owner only after unlock). */
export interface StoredFinding {
  position: number;
  category: FindingCategory;
  description: string;
  firstDate: string;
  lastDate: string;
  lineNumbers: number[];
  chargedCents: number;
  allowedCents: number;
  owedCents: number;
  basis: Finding["basis"];
  citation: string | null;
  sourceUrl: string | null;
  leaseRef: string | null;
  lawNotes: Pick<Statute, "citation" | "sourceUrl" | "summary">[];
}

export interface StoredLetter {
  locale: Locale;
  templateVersion: string;
  body: string;
}

export interface ScanResult {
  status: "preview_ready" | "clean" | "unlocked";
  totalOwedCents: number;
  itemCount: number;
  linesScanned: number;
  feeCents: number;
  unlockedAt: string | null;
  engineVersion: string;
  extraction: { source: "model" | "demo"; data: Extraction };
  findings: StoredFinding[];
  letters: StoredLetter[];
}

export interface PaymentRecord {
  auditId: string;
  userId: string;
  checkoutSessionId: string;
  amountCents: number;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
}

export type CheckoutPaidOutcome =
  | "unlocked"
  | "duplicate"
  | "already_unlocked"
  | "duplicate_payment"
  | "amount_mismatch"
  | "unknown_session"
  | "not_unlockable";

/** A paid session that did not unlock its audit (server-only `payment_reviews`). */
export interface PaymentReview {
  eventId: string;
  reason: Exclude<CheckoutPaidOutcome, "unlocked" | "duplicate" | "already_unlocked">;
  auditId: string | null;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  amountCents: number;
  currency: string;
  refundId: string | null;
}

export interface CheckoutPaidEvent {
  eventId: string;
  eventType: string;
  checkoutSessionId: string;
  auditId: string;
  amountCents: number;
  currency: string;
  paymentIntentId: string | null;
}

/**
 * Data access. Owner-scoped reads (`userId` args) must be enforced by the store itself: the Supabase
 * implementation reads through the renter's session so RLS applies; the memory one mirrors the rules.
 */
export interface AuditRepository {
  insertAudit(audit: AuditRecord): Promise<void>;
  findAudit(userId: string, auditId: string): Promise<AuditRecord | null>;
  listAudits(userId: string): Promise<AuditRecord[]>;
  insertDocument(doc: DocumentRecord): Promise<void>;
  listDocuments(userId: string, auditId: string): Promise<DocumentRecord[]>;
  /** Atomically move draft → processing, stamping when the scan started. False if not a draft owned by the user. */
  claimForScan(userId: string, auditId: string, startedAt: string): Promise<boolean>;
  saveScanResult(auditId: string, result: ScanResult): Promise<void>;
  /** processing → failed. No-op for any other status. */
  markFailed(auditId: string): Promise<void>;
  /** Fail the user's audits that have been processing since before `startedBefore` (a scan whose request died). */
  failStaleScans(userId: string, startedBefore: string): Promise<void>;
  /** Empty unless the audit is unlocked (paywall). */
  findUnlockedFindings(userId: string, auditId: string): Promise<StoredFinding[]>;
  findUnlockedLetter(userId: string, auditId: string, locale: Locale): Promise<StoredLetter | null>;
  insertPayment(payment: PaymentRecord): Promise<void>;
  findPendingPayment(auditId: string): Promise<PaymentRecord | null>;
  /** Every checkout attempt ever recorded for the audit (any status). */
  countPayments(auditId: string): Promise<number>;
  setPaymentStatus(checkoutSessionId: string, status: PaymentRecord["status"]): Promise<void>;
  /** Records the payment as paid whenever Stripe took money; flags anything that did not unlock. */
  applyCheckoutPaid(event: CheckoutPaidEvent): Promise<CheckoutPaidOutcome>;
  /** True once any checkout for the audit was paid (unlocked or under review): never open another. */
  hasPaidPayment(auditId: string): Promise<boolean>;
  /** The duplicate charge from this event still waiting for its refund, if any. */
  findRefundDue(eventId: string): Promise<{ paymentIntentId: string } | null>;
  recordRefund(eventId: string, refundId: string): Promise<void>;
}

export interface DocumentStore {
  put(path: string, bytes: Uint8Array, mimeType: AllowedMime): Promise<void>;
  get(path: string): Promise<Uint8Array | null>;
}

export interface ExtractorInput {
  jurisdiction: JurisdictionKey;
  documents: { kind: DocKind; mimeType: AllowedMime; bytes: Uint8Array }[];
}

export interface Extractor {
  readonly source: "model" | "demo";
  extract(input: ExtractorInput): Promise<Extraction>;
}
