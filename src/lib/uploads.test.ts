import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, sha256Hex, sniffMime, validateUpload } from "@/lib/uploads";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);

describe("sniffMime", () => {
  it("recognizes pdf, jpeg, png and webp by magic bytes", () => {
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(WEBP)).toBe("image/webp");
  });

  it("returns null for anything else, including html renamed to .pdf", () => {
    expect(sniffMime(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts a file whose content matches an allowed type, using the sniffed type", () => {
    expect(validateUpload({ bytes: PNG, declaredType: "application/octet-stream" })).toEqual({ ok: true, mimeType: "image/png", extension: "png" });
  });

  it("rejects empty, oversized and unknown files with a reason code", () => {
    expect(validateUpload({ bytes: new Uint8Array(), declaredType: "application/pdf" })).toEqual({ ok: false, reason: "empty" });
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(PDF);
    expect(validateUpload({ bytes: big, declaredType: "application/pdf" })).toEqual({ ok: false, reason: "too_large" });
    expect(validateUpload({ bytes: new TextEncoder().encode("hello world, not a pdf"), declaredType: "application/pdf" })).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("caps uploads at 15 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(15 * 1024 * 1024);
  });
});

describe("sha256Hex", () => {
  it("hashes with Web Crypto", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
