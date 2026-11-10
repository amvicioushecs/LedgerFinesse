/**
 * Read-only Neon Auth session check, safe in Server Component renders. The SDK's getSession() writes any Set-Cookie
 * Neon Auth returns (a revoked session's cookie clear, a session refresh) through cookies().set(), which Next
 * refuses outside a Route Handler or Server Action. This asks Neon Auth directly, forwarding only this request's
 * Neon Auth cookies, and ignores any Set-Cookie: a stale cookie just stops working and expires on its own. Every
 * check goes to Neon Auth (no cookie cache), so a revoked session stops at once.
 */
export interface NeonSession {
  userId: string;
  email: string | null;
  /** When Neon Auth created this session (unix seconds): the password-change recency is judged from this. */
  createdAtSeconds: number;
}

const PREFIX = "__Secure-neon-auth.";
const TOKEN = `${PREFIX}session_token`;

export async function readNeonSession(
  cookies: { name: string; value: string }[],
  config: { authBaseUrl: string; appUrl: string },
  fetchImpl: typeof fetch = fetch,
): Promise<NeonSession | null> {
  const ours = cookies.filter((c) => c.name.startsWith(PREFIX));
  if (!ours.some((c) => c.name === TOKEN && c.value)) return null;
  try {
    const response = await fetchImpl(`${config.authBaseUrl.replace(/\/+$/, "")}/get-session`, {
      headers: { cookie: ours.map((c) => `${c.name}=${c.value}`).join("; "), origin: new URL(config.appUrl).origin },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { session?: { createdAt?: unknown }; user?: { id?: unknown; email?: unknown; emailVerified?: unknown } } | null;
    const createdAt = typeof data?.session?.createdAt === "string" ? Date.parse(data.session.createdAt) : NaN;
    if (!data?.user || typeof data.user.id !== "string" || data.user.emailVerified !== true || !Number.isFinite(createdAt)) return null;
    return { userId: data.user.id, email: typeof data.user.email === "string" ? data.user.email : null, createdAtSeconds: Math.floor(createdAt / 1000) };
  } catch {
    return null;
  }
}
