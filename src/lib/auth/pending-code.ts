/**
 * Binds an emailed one-time code to the browser that asked for it (the PKCE equivalent for Neon Auth codes):
 * an httpOnly cookie carrying the purpose and email, HMAC-SHA256 signed with NEON_AUTH_COOKIE_SECRET. The code
 * forms never take an email from the request, so a code (or link) started elsewhere can't sign this browser in.
 */
export type PendingPurpose = "signin" | "verify" | "reset";
export interface PendingCode {
  purpose: PendingPurpose;
  email: string;
}

export const PENDING_CODE_COOKIE = "lf_code_pending";
/** Seconds. Neon Auth codes expire sooner; this only bounds how long the form is offered. */
export const PENDING_CODE_MAX_AGE = 600;
const PURPOSES: readonly string[] = ["signin", "verify", "reset"];

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

const key = (secret: string) => crypto.subtle.importKey("raw", enc.encode(`lf-pending-code:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function signPendingCode(p: PendingCode, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ p: p.purpose, e: p.email, x: nowSeconds + PENDING_CODE_MAX_AGE })));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload)));
  return `${payload}.${b64url(mac)}`;
}

export async function readPendingCode(value: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<PendingCode | null> {
  const parts = value?.split(".") ?? [];
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    // crypto.subtle.verify compares in constant time.
    if (!(await crypto.subtle.verify("HMAC", await key(secret), unb64url(parts[1]), enc.encode(parts[0])))) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64url(parts[0]))) as { p?: unknown; e?: unknown; x?: unknown };
    if (typeof data.p !== "string" || !PURPOSES.includes(data.p) || typeof data.e !== "string" || typeof data.x !== "number") return null;
    if (nowSeconds > data.x) return null;
    return { purpose: data.p as PendingPurpose, email: data.e };
  } catch {
    return null;
  }
}
