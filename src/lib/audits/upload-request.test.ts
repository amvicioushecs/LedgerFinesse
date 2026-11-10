import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_REQUEST_BYTES, readUploadRequest } from "@/lib/audits/upload-request";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function formRequest(form: FormData, headers: Record<string, string> = {}) {
  const request = new Request("https://lf.example/api/audits", { method: "POST", body: form });
  return new Request(request, { headers: { ...Object.fromEntries(request.headers), ...headers } });
}

function goodForm() {
  const form = new FormData();
  form.set("locale", "es");
  form.set("jurisdiction", "san-diego-ca");
  form.set("tenantName", "Jordan");
  form.set("lease", new File([PDF], "lease.pdf", { type: "application/pdf" }));
  form.set("ledger", new File([PNG], "ledger.png", { type: "image/png" }));
  return form;
}

afterEach(() => vi.restoreAllMocks());

describe("readUploadRequest", () => {
  it("parses a valid upload", async () => {
    const request = formRequest(goodForm(), { "content-length": "2000" });
    const result = await readUploadRequest(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.form).toMatchObject({ locale: "es", jurisdiction: "san-diego-ca", tenantName: "Jordan", landlordName: null });
    expect(result.form.files.map((f) => [f.kind, f.declaredType, f.bytes.byteLength])).toEqual([
      ["ledger", "image/png", PNG.byteLength],
      ["lease", "application/pdf", PDF.byteLength],
    ]);
  });

  it("answers 413 from content-length without buffering the body", async () => {
    const request = formRequest(goodForm(), { "content-length": String(MAX_UPLOAD_REQUEST_BYTES + 1) });
    const formData = vi.spyOn(request, "formData");
    expect(await readUploadRequest(request)).toEqual({ ok: false, status: 413, error: "size", bodyRead: false });
    expect(formData).not.toHaveBeenCalled();
  });

  it("requires a content-length", async () => {
    const request = formRequest(goodForm());
    request.headers.delete("content-length");
    const formData = vi.spyOn(request, "formData");
    expect(await readUploadRequest(request)).toEqual({ ok: false, status: 411, error: "generic", bodyRead: false });
    expect(formData).not.toHaveBeenCalled();
  });

  it("checks each file's size before reading its bytes", async () => {
    const form = goodForm();
    form.set("lease", new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.pdf", { type: "application/pdf" }));
    const request = formRequest(form, { "content-length": "2000" });
    const read = vi.spyOn(File.prototype, "arrayBuffer");
    expect(await readUploadRequest(request)).toEqual({ ok: false, status: 413, error: "size", bodyRead: true });
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects a missing file, disguised type and unknown jurisdiction", async () => {
    const missing = goodForm();
    missing.delete("ledger");
    expect(await readUploadRequest(formRequest(missing, { "content-length": "2000" }))).toEqual({ ok: false, status: 400, error: "missing", bodyRead: true });

    const disguised = goodForm();
    disguised.set("lease", new File([new TextEncoder().encode("<html>")], "lease.pdf", { type: "application/pdf" }));
    expect(await readUploadRequest(formRequest(disguised, { "content-length": "2000" }))).toEqual({ ok: false, status: 400, error: "type", bodyRead: true });

    const place = goodForm();
    place.set("jurisdiction", "atlantis");
    expect(await readUploadRequest(formRequest(place, { "content-length": "2000" }))).toEqual({ ok: false, status: 400, error: "generic", bodyRead: true });
  });
});
