import type { AuditRecord, AuditRepository, DocKind, DocumentStore, Extractor, StoredFinding, StoredLetter } from "@/lib/audits/types";
import { rulesFor, type JurisdictionKey } from "@/lib/jurisdictions";
import type { Locale } from "@/lib/i18n/locales";
import { LETTER_TEMPLATE_VERSION, renderLetter } from "@/lib/letters";
import { unlockDecision, type UnlockDecision } from "@/lib/pricing";
import { buildReport, type FreeSummary, type Report } from "@/lib/report";
import { audit as runEngine } from "@/lib/rules-engine/audit";
import { sha256Hex, validateUpload, type UploadCheck } from "@/lib/uploads";

export const ENGINE_VERSION = "rules-engine 2026-11-09";
/** A scan runs inside one request; one still processing after this long died with it. */
export const STALE_SCAN_MS = 10 * 60_000;

export interface AuditDeps {
  repo: AuditRepository;
  files: DocumentStore;
  extractor: Extractor;
  now: () => Date;
  newId: () => string;
  /** Audits one user may start per rolling 24 hours (LF_DAILY_AUDIT_LIMIT). */
  dailyAuditLimit: number;
}

export interface NewAuditInput {
  locale: Locale;
  jurisdiction: JurisdictionKey;
  tenantName: string | null;
  landlordName: string | null;
  propertyAddress: string | null;
}

const clean = (value: string | null, max: number) => {
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, max);
};

const capWindowStart = (deps: AuditDeps) => new Date(deps.now().getTime() - 24 * 60 * 60_000).toISOString();

/**
 * Daily cap: each scan costs a model call, so one account can't run unlimited scans. This early check lets the
 * route refuse before reading the upload; createAudit enforces the cap atomically.
 */
export async function canStartAudit(deps: AuditDeps, userId: string): Promise<boolean> {
  return (await deps.repo.countAuditsSince(userId, capWindowStart(deps))) < deps.dailyAuditLimit;
}

/** The new draft audit, or null when the user is at the daily cap (checked and inserted atomically). */
export async function createAudit(deps: AuditDeps, userId: string, input: NewAuditInput): Promise<AuditRecord | null> {
  const audit: AuditRecord = {
    id: deps.newId(),
    userId,
    status: "draft",
    locale: input.locale,
    jurisdiction: input.jurisdiction,
    tenantName: clean(input.tenantName, 200),
    landlordName: clean(input.landlordName, 200),
    propertyAddress: clean(input.propertyAddress, 500),
    totalOwedCents: null,
    itemCount: null,
    linesScanned: null,
    feeCents: null,
    unlockedAt: null,
    createdAt: deps.now().toISOString(),
  };
  return (await deps.repo.insertAuditWithinCap(audit, capWindowStart(deps), deps.dailyAuditLimit)) ? audit : null;
}

type Failure<R extends string> = { ok: false; reason: R };

export async function attachDocument(
  deps: AuditDeps,
  userId: string,
  auditId: string,
  file: { kind: DocKind; bytes: Uint8Array; declaredType: string },
): Promise<{ ok: true } | Failure<Extract<UploadCheck, { ok: false }>["reason"] | "not_found" | "not_editable">> {
  const audit = await deps.repo.findAudit(userId, auditId);
  if (!audit) return { ok: false, reason: "not_found" };
  if (audit.status !== "draft") return { ok: false, reason: "not_editable" };
  const check = validateUpload(file);
  if (!check.ok) return check;
  const id = deps.newId();
  const storagePath = `${userId}/${auditId}/${id}.${check.extension}`;
  await deps.files.put(storagePath, file.bytes, check.mimeType);
  await deps.repo.insertDocument({
    id,
    auditId,
    userId,
    kind: file.kind,
    storagePath,
    mimeType: check.mimeType,
    byteSize: file.bytes.byteLength,
    sha256: await sha256Hex(file.bytes),
  });
  return { ok: true };
}

export function toStoredFindings(report: Report): StoredFinding[] {
  return report.items.map((item, position) => ({
    position,
    category: item.category,
    description: item.description,
    firstDate: item.firstDate,
    lastDate: item.lastDate,
    lineNumbers: item.lineNumbers,
    chargedCents: item.chargedCents,
    allowedCents: item.allowedCents,
    owedCents: item.owedCents,
    basis: item.basis,
    citation: item.citation,
    sourceUrl: item.sourceUrl,
    leaseRef: item.leaseRef,
    lawNotes: item.lawNotes.map(({ citation, sourceUrl, summary }) => ({ citation, sourceUrl, summary })),
  }));
}

/** Extract, run the deterministic engine, price it, draft letters, and store everything. */
export async function scanAudit(
  deps: AuditDeps,
  userId: string,
  auditId: string,
): Promise<{ ok: true } | Failure<"not_found" | "not_scannable" | "missing_documents" | "extraction_failed" | "scan_failed">> {
  const audit = await deps.repo.findAudit(userId, auditId);
  if (!audit) return { ok: false, reason: "not_found" };
  if (audit.status !== "draft") return { ok: false, reason: "not_scannable" };
  const docs = await deps.repo.listDocuments(userId, auditId);
  if (!docs.some((d) => d.kind === "lease") || !docs.some((d) => d.kind === "ledger")) {
    return { ok: false, reason: "missing_documents" };
  }
  if (!(await deps.repo.claimForScan(userId, auditId, deps.now().toISOString()))) return { ok: false, reason: "not_scannable" };

  try {
    return await runClaimedScan(deps, audit, docs);
  } catch {
    await deps.repo.markFailed(auditId);
    return { ok: false, reason: "scan_failed" };
  }
}

async function runClaimedScan(
  deps: AuditDeps,
  audit: AuditRecord,
  docs: Awaited<ReturnType<AuditRepository["listDocuments"]>>,
): Promise<{ ok: true } | Failure<"extraction_failed">> {
  const auditId = audit.id;
  let report: Report;
  let extraction;
  try {
    const documents = await Promise.all(
      docs.map(async (d) => {
        const bytes = await deps.files.get(d.storagePath);
        if (!bytes) throw new Error(`missing stored file ${d.storagePath}`);
        return { kind: d.kind, mimeType: d.mimeType, bytes };
      }),
    );
    extraction = await deps.extractor.extract({ jurisdiction: audit.jurisdiction, documents });
    const result = runEngine(extraction, rulesFor(audit.jurisdiction));
    report = buildReport(extraction, result, { jurisdiction: audit.jurisdiction });
  } catch {
    await deps.repo.markFailed(auditId);
    return { ok: false, reason: "extraction_failed" };
  }

  const decision = unlockDecision(report.totalOwedCents);
  const now = deps.now();
  const letters: StoredLetter[] =
    report.items.length === 0
      ? []
      : (["en", "es"] as const).map((locale) => ({
          locale,
          templateVersion: LETTER_TEMPLATE_VERSION,
          body: renderLetter({
            locale,
            date: now.toISOString().slice(0, 10),
            tenantName: audit.tenantName,
            landlordName: audit.landlordName,
            propertyAddress: audit.propertyAddress,
            auditRef: auditId.slice(0, 8).toUpperCase(),
            jurisdiction: audit.jurisdiction,
            report,
          }),
        }));

  await deps.repo.saveScanResult(auditId, {
    status: decision.kind === "clean" ? "clean" : decision.kind === "free_below_minimum" ? "unlocked" : "preview_ready",
    totalOwedCents: report.totalOwedCents,
    itemCount: report.items.length,
    linesScanned: report.linesScanned,
    feeCents: decision.feeCents,
    unlockedAt: decision.kind === "free_below_minimum" ? now.toISOString() : null,
    engineVersion: ENGINE_VERSION,
    extraction: { source: deps.extractor.source, data: extraction },
    findings: toStoredFindings(report),
    letters,
  });
  return { ok: true };
}

async function failStaleScans(deps: AuditDeps, userId: string) {
  await deps.repo.failStaleScans(userId, new Date(deps.now().getTime() - STALE_SCAN_MS).toISOString());
}

/** Reads one audit; only a processing audit triggers the stale-scan sweep (a write), then is re-read. */
async function findFresh(deps: AuditDeps, userId: string, auditId: string): Promise<AuditRecord | null> {
  const audit = await deps.repo.findAudit(userId, auditId);
  if (audit?.status !== "processing") return audit;
  await failStaleScans(deps, userId);
  return deps.repo.findAudit(userId, auditId);
}

export async function getAuditStatus(deps: AuditDeps, userId: string, auditId: string): Promise<AuditRecord["status"] | null> {
  return (await findFresh(deps, userId, auditId))?.status ?? null;
}

export async function listAudits(deps: AuditDeps, userId: string): Promise<AuditRecord[]> {
  const audits = await deps.repo.listAudits(userId);
  if (!audits.some((a) => a.status === "processing")) return audits;
  await failStaleScans(deps, userId);
  return deps.repo.listAudits(userId);
}

/** Unlocked free because under 50 cents was owed (no charge). Hector reviews these; stored as audits.free_unlock_below_minimum. */
export function isFreeUnlockBelowMinimum(audit: Pick<AuditRecord, "status" | "feeCents" | "totalOwedCents">): boolean {
  return audit.status === "unlocked" && audit.feeCents === 0 && (audit.totalOwedCents ?? 0) > 0;
}

export interface FreeResult {
  audit: AuditRecord;
  summary: FreeSummary | null;
  decision: UnlockDecision | null;
  /** Unrecognized checkout session: a person is reviewing it. */
  paymentUnderReview: boolean;
  /** Automatic refund failed or is waiting for its retry. */
  refundPending: boolean;
}

/** What anyone signed in as the owner may see before paying: status, count, total, fee. */
export async function getFreeResult(deps: AuditDeps, userId: string, auditId: string): Promise<FreeResult | null> {
  const audit = await findFresh(deps, userId, auditId);
  if (!audit) return null;
  const held = audit.status === "preview_ready";
  if (audit.totalOwedCents === null || audit.itemCount === null) {
    return { audit, summary: null, decision: null, paymentUnderReview: false, refundPending: false };
  }
  return {
    audit,
    summary: { itemCount: audit.itemCount, totalOwedCents: audit.totalOwedCents, linesScanned: audit.linesScanned ?? 0 },
    decision: unlockDecision(audit.totalOwedCents),
    paymentUnderReview: held && (await deps.repo.hasUnknownSessionReview(auditId)),
    refundPending: held && ((await deps.repo.hasPendingRefund(auditId)) || (await deps.repo.hasPaidPayment(auditId))),
  };
}

export interface UnlockedReport {
  audit: AuditRecord;
  items: StoredFinding[];
  letter: StoredLetter | null;
}

/** Full breakdown and letter. Null unless the audit is unlocked and owned by the user. */
export async function getUnlockedReport(
  deps: AuditDeps,
  userId: string,
  auditId: string,
  locale: Locale,
): Promise<UnlockedReport | null> {
  const audit = await deps.repo.findAudit(userId, auditId);
  if (!audit || audit.status !== "unlocked") return null;
  const [items, letter] = await Promise.all([
    deps.repo.findUnlockedFindings(userId, auditId),
    deps.repo.findUnlockedLetter(userId, auditId, locale),
  ]);
  return { audit, items, letter };
}
