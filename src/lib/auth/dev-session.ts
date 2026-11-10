/**
 * Local-only sign-in for LF_BACKEND=memory (dev and e2e): an HMAC-signed email cookie, no email sent.
 * Never used with Supabase; production refuses the memory backend.
 */
export const DEV_SESSION_COOKIE = "lf_dev_session";

const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function devUserId(email: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`lf-dev:${email}`)));
  const h = [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** `signedInAt` (unix seconds) is signed too: password changes need a recent sign-in. */
export async function signDevSession(email: string, secret: string, signedInAt = Math.floor(Date.now() / 1000)): Promise<string> {
  const body = `${btoa(email.trim().toLowerCase())}.${signedInAt}`;
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyDevSession(token: string | undefined, secret: string): Promise<{ id: string; email: string; signedInAt: number } | null> {
  const [payload, at, sig] = token?.split(".") ?? [];
  if (!payload || !at || !sig || !/^\d+$/.test(at) || !timingSafeEqual(sig, await hmac(secret, `${payload}.${at}`))) return null;
  let email: string;
  try {
    email = atob(payload);
  } catch {
    return null;
  }
  return { id: await devUserId(email), email, signedInAt: Number(at) };
}
