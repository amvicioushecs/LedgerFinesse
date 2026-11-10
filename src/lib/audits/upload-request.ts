import type { DocKind } from "@/lib/audits/types";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { isJurisdictionKey, type JurisdictionKey } from "@/lib/jurisdictions";
import { MAX_SCAN_BYTES, MAX_UPLOAD_BYTES, validateUpload } from "@/lib/uploads";

/** Both files at the combined cap plus room for the text fields and multipart boundaries. */
export const MAX_UPLOAD_REQUEST_BYTES = MAX_SCAN_BYTES + 64 * 1024;

export type UploadError = "missing" | "size" | "type" | "generic";

export interface UploadForm {
  locale: Locale;
  jurisdiction: JurisdictionKey;
  tenantName: string | null;
  landlordName: string | null;
  propertyAddress: string | null;
  files: { kind: DocKind; bytes: Uint8Array; declaredType: string }[];
}

/** `bodyRead: false` means the request was refused from its headers alone. */
type Rejection = { ok: false; status: 400 | 411 | 413; error: UploadError; bodyRead: boolean };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
};

/**
 * Parse the upload form, refusing oversized requests before any of the body is buffered and
 * oversized files before their bytes are read. Call only after the user is authenticated.
 */
export async function readUploadRequest(request: Request): Promise<{ ok: true; form: UploadForm } | Rejection> {
  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isSafeInteger(length) || length < 0) return { ok: false, status: 411, error: "generic", bodyRead: false };
  if (length > MAX_UPLOAD_REQUEST_BYTES) return { ok: false, status: 413, error: "size", bodyRead: false };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, status: 400, error: "generic", bodyRead: true };
  }
  const localeValue = text(form, "locale") ?? "en";
  const jurisdiction = text(form, "jurisdiction") ?? "";
  if (!isJurisdictionKey(jurisdiction)) return { ok: false, status: 400, error: "generic", bodyRead: true };

  const entries: { kind: DocKind; file: File }[] = [];
  for (const kind of ["ledger", "lease"] as const) {
    const file = form.get(kind);
    if (!(file instanceof File) || file.size === 0) return { ok: false, status: 400, error: "missing", bodyRead: true };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, status: 413, error: "size", bodyRead: true };
    entries.push({ kind, file });
  }
  if (entries.reduce((sum, e) => sum + e.file.size, 0) > MAX_SCAN_BYTES) return { ok: false, status: 413, error: "size", bodyRead: true };

  const files: UploadForm["files"] = [];
  for (const { kind, file } of entries) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateUpload({ bytes, declaredType: file.type });
    if (!check.ok) {
      return check.reason === "too_large"
        ? { ok: false, status: 413, error: "size", bodyRead: true }
        : { ok: false, status: 400, error: check.reason === "empty" ? "missing" : "type", bodyRead: true };
    }
    files.push({ kind, bytes, declaredType: file.type });
  }

  return {
    ok: true,
    form: {
      locale: isLocale(localeValue) ? localeValue : "en",
      jurisdiction,
      tenantName: text(form, "tenantName"),
      landlordName: text(form, "landlordName"),
      propertyAddress: text(form, "propertyAddress"),
      files,
    },
  };
}
