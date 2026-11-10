import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAuditRepository, MemoryDocumentStore } from "@/lib/audits/memory-repository";
import { attachDocument, createAudit, getAuditStatus, getFreeResult, getUnlockedReport, listAudits, scanAudit, STALE_SCAN_MS, type AuditDeps } from "@/lib/audits/service";
import { demoExtractor } from "@/lib/extraction/demo";
import type { Extractor } from "@/lib/audits/types";
import { SAMPLE_CASE } from "@/content/sample-case";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const USER = "user-a";
const OTHER = "user-b";

let deps: AuditDeps;
let ids = 0;

beforeEach(() => {
  ids = 0;
  deps = {
    repo: new MemoryAuditRepository(),
    files: new MemoryDocumentStore(),
    extractor: demoExtractor,
    now: () => new Date("2026-11-09T18:00:00Z"),
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
  };
});

async function readyAudit(extractor?: Extractor) {
  if (extractor) deps.extractor = extractor;
  const audit = await createAudit(deps, USER, { locale: "en", jurisdiction: "san-diego-ca", landlordName: SAMPLE_CASE.landlord, tenantName: null, propertyAddress: null });
  expect((await attachDocument(deps, USER, audit.id, { kind: "lease", bytes: PDF, declaredType: "application/pdf" })).ok).toBe(true);
  expect((await attachDocument(deps, USER, audit.id, { kind: "ledger", bytes: PNG, declaredType: "image/png" })).ok).toBe(true);
  return audit;
}

describe("upload", () => {
  it("stores files under the owner's folder with the sniffed type", async () => {
    const audit = await readyAudit();
    const docs = await deps.repo.listDocuments(USER, audit.id);
    expect(docs.map((d) => [d.kind, d.mimeType])).toEqual([["lease", "application/pdf"], ["ledger", "image/png"]]);
    for (const d of docs) {
      expect(d.storagePath.startsWith(`${USER}/${audit.id}/`)).toBe(true);
      expect(await deps.files.get(d.storagePath)).not.toBeNull();
    }
  });

  it("rejects disguised files and other users' audits", async () => {
    const audit = await createAudit(deps, USER, { locale: "en", jurisdiction: "san-diego-ca", landlordName: null, tenantName: null, propertyAddress: null });
    const html = new TextEncoder().encode("<html>hi</html>");
    expect(await attachDocument(deps, USER, audit.id, { kind: "lease", bytes: html, declaredType: "application/pdf" })).toEqual({ ok: false, reason: "unsupported_type" });
    expect(await attachDocument(deps, OTHER, audit.id, { kind: "lease", bytes: PDF, declaredType: "application/pdf" })).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("scan", () => {
  it("needs both a lease and a ledger", async () => {
    const audit = await createAudit(deps, USER, { locale: "en", jurisdiction: "san-diego-ca", landlordName: null, tenantName: null, propertyAddress: null });
    await attachDocument(deps, USER, audit.id, { kind: "lease", bytes: PDF, declaredType: "application/pdf" });
    expect(await scanAudit(deps, USER, audit.id)).toEqual({ ok: false, reason: "missing_documents" });
  });

  it("stores count, total and a 15% fee; the free result shows nothing line-level", async () => {
    const audit = await readyAudit();
    expect(await scanAudit(deps, USER, audit.id)).toEqual({ ok: true });
    const result = await getFreeResult(deps, USER, audit.id);
    expect(result).toEqual({
      audit: expect.objectContaining({ status: "preview_ready", totalOwedCents: 64000, itemCount: 5, feeCents: 9600 }),
      summary: { itemCount: 5, totalOwedCents: 64000, linesScanned: SAMPLE_CASE.extraction.ledger.length },
      decision: { kind: "checkout", feeCents: 9600 },
      paymentUnderReview: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/RUBS|Late Charge|1942/);
  });

  it("keeps the breakdown and letter locked until unlock", async () => {
    const audit = await readyAudit();
    await scanAudit(deps, USER, audit.id);
    expect(await getUnlockedReport(deps, USER, audit.id, "en")).toBeNull();
  });

  it("cannot be run twice or by another user", async () => {
    const audit = await readyAudit();
    expect(await scanAudit(deps, OTHER, audit.id)).toEqual({ ok: false, reason: "not_found" });
    await scanAudit(deps, USER, audit.id);
    expect(await scanAudit(deps, USER, audit.id)).toEqual({ ok: false, reason: "not_scannable" });
  });

  it("marks a clean ledger clean with no fee and no checkout", async () => {
    const clean: Extractor = { source: "demo", extract: async () => ({ ...SAMPLE_CASE.extraction, ledger: [] }) };
    const audit = await readyAudit(clean);
    await scanAudit(deps, USER, audit.id);
    const result = await getFreeResult(deps, USER, audit.id);
    expect(result?.audit).toMatchObject({ status: "clean", totalOwedCents: 0, feeCents: 0 });
    expect(result?.decision).toEqual({ kind: "clean", feeCents: 0 });
  });

  it("unlocks for free when 15% is below Stripe's minimum charge", async () => {
    const tiny: Extractor = {
      source: "demo",
      extract: async () => ({
        ...SAMPLE_CASE.extraction,
        ledger: [{ id: "x", sequence: 0, date: "2026-02-01", description: "Mystery Fee", kind: "charge", category: "fee", amountCents: 300, reportedBalanceCents: null, confidence: 1 }],
      }),
    };
    const audit = await readyAudit(tiny);
    await scanAudit(deps, USER, audit.id);
    expect((await getFreeResult(deps, USER, audit.id))?.audit).toMatchObject({ status: "unlocked", feeCents: 0, totalOwedCents: 300 });
    expect((await getUnlockedReport(deps, USER, audit.id, "en"))?.items).toHaveLength(1);
  });

  it("marks the audit failed when extraction throws", async () => {
    const broken: Extractor = { source: "model", extract: async () => { throw new Error("model down"); } };
    const audit = await readyAudit(broken);
    expect(await scanAudit(deps, USER, audit.id)).toEqual({ ok: false, reason: "extraction_failed" });
    expect((await getFreeResult(deps, USER, audit.id))?.audit.status).toBe("failed");
  });
});

describe("an audit never stays stuck in processing", () => {
  it("marks the audit failed when storing the result throws", async () => {
    const audit = await readyAudit();
    deps.repo.saveScanResult = async () => {
      throw new Error("db down");
    };
    expect(await scanAudit(deps, USER, audit.id)).toEqual({ ok: false, reason: "scan_failed" });
    expect((await getFreeResult(deps, USER, audit.id))?.audit.status).toBe("failed");
  });

  it("fails a scan claimed more than 10 minutes ago when the owner next reads it", async () => {
    const audit = await readyAudit();
    let clock = new Date("2026-11-09T18:00:00Z").getTime();
    deps.now = () => new Date(clock);
    expect(await deps.repo.claimForScan(USER, audit.id, deps.now().toISOString())).toBe(true); // the request then died mid-scan
    expect(STALE_SCAN_MS).toBe(10 * 60_000);

    clock += STALE_SCAN_MS - 1000;
    expect(await getAuditStatus(deps, USER, audit.id)).toBe("processing");
    clock += 2000;
    expect(await getAuditStatus(deps, OTHER, audit.id)).toBeNull();
    expect((await listAudits(deps, USER)).map((a) => a.status)).toEqual(["failed"]);
    expect((await getFreeResult(deps, USER, audit.id))?.audit.status).toBe("failed");
  });
});

describe("a paid checkout that did not unlock", () => {
  it("is reported as under review instead of offering checkout again", async () => {
    const audit = await readyAudit();
    await scanAudit(deps, USER, audit.id);
    expect((await getFreeResult(deps, USER, audit.id))?.paymentUnderReview).toBe(false);
    await deps.repo.insertPayment({ auditId: audit.id, userId: USER, checkoutSessionId: "cs_test_1", amountCents: 9600, status: "pending" });
    expect(await deps.repo.applyCheckoutPaid({ eventId: "evt_1", eventType: "checkout.session.completed", checkoutSessionId: "cs_test_1", auditId: audit.id, amountCents: 100, currency: "usd", paymentIntentId: "pi_1" })).toBe("amount_mismatch");
    expect((await getFreeResult(deps, USER, audit.id))?.paymentUnderReview).toBe(true);
  });
});

describe("after a verified payment", () => {
  it("returns the stored breakdown and the letter in the requested language", async () => {
    const audit = await readyAudit();
    await scanAudit(deps, USER, audit.id);
    await deps.repo.insertPayment({ auditId: audit.id, userId: USER, checkoutSessionId: "cs_test_1", amountCents: 9600, status: "pending" });
    expect(await deps.repo.applyCheckoutPaid({ eventId: "evt_1", eventType: "checkout.session.completed", checkoutSessionId: "cs_test_1", auditId: audit.id, amountCents: 9600, currency: "usd", paymentIntentId: "pi_1" })).toBe("unlocked");
    const report = await getUnlockedReport(deps, USER, audit.id, "es");
    expect(report?.items.reduce((s, i) => s + i.owedCents, 0)).toBe(64000);
    expect(report?.letter?.body).toContain("diez (10) días hábiles");
    expect(report?.letter?.body).toContain(SAMPLE_CASE.landlord);
    expect(await getUnlockedReport(deps, OTHER, audit.id, "en")).toBeNull();
  });
});
