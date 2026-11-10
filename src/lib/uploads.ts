/** Server-side upload checks: size cap and magic-byte sniffing (the browser's declared type is ignored). */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/**
 * Lease + ledger together. Both go inline in one model request (base64 plus JSON roughly triples the
 * memory), and a Worker isolate has 128 MB: 30 MB of uploads measured ~126 MB before fetch copies the body.
 */
export const MAX_SCAN_BYTES = 15 * 1024 * 1024;

export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

const EXTENSIONS: Record<AllowedMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

export function sniffMime(b: Uint8Array): AllowedMime | null {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export type UploadCheck =
  | { ok: true; mimeType: AllowedMime; extension: string }
  | { ok: false; reason: "empty" | "too_large" | "unsupported_type" };

export function validateUpload(file: { bytes: Uint8Array; declaredType: string }): UploadCheck {
  if (file.bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
  const mimeType = sniffMime(file.bytes);
  if (mimeType === null) return { ok: false, reason: "unsupported_type" };
  return { ok: true, mimeType, extension: EXTENSIONS[mimeType] };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
