/**
 * Per-IP and per-user (or per-email) request limits, backed by Cloudflare Workers rate-limit bindings.
 * Limits and periods live in wrangler.jsonc (`ratelimits`), one binding per action. Without a binding
 * (`next start`, unit tests) nothing is limited. The daily audit cap is separate (audit service).
 */
export type RateLimitedAction = "upload" | "signin" | "checkout";

export const RATE_LIMIT_BINDINGS = {
  upload: "UPLOAD_RATE_LIMITER",
  signin: "SIGNIN_RATE_LIMITER",
  checkout: "CHECKOUT_RATE_LIMITER",
} as const satisfies Record<RateLimitedAction, string>;

/** The shape of a Workers `RateLimit` binding. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Limiters = Partial<Record<string, Limiter>>;

/** True when either the caller's IP or the subject (user id, or sign-in email) is over the limit. */
export async function isRateLimited(
  limiters: Limiters,
  action: RateLimitedAction,
  who: { ip: string; subject: string | null },
): Promise<boolean> {
  const limiter = limiters[RATE_LIMIT_BINDINGS[action]];
  if (!limiter) return false;
  const keys = [`${action}:ip:${who.ip}`, ...(who.subject ? [`${action}:subject:${who.subject}`] : [])];
  try {
    const results = await Promise.all(keys.map((key) => limiter.limit({ key })));
    return results.some((r) => !r.success);
  } catch (error) {
    // A limiter outage should not take sign-in or checkout down with it.
    console.error(JSON.stringify({ msg: "rate limiter failed", action, error: String(error) }));
    return false;
  }
}

export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
