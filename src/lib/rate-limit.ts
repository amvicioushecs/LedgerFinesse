/**
 * Fixed-window request limits. The hard limit is per user (or per sign-in email): LF_RATE_LIMIT_<ACTION>. A loose
 * per-IP limit (LF_RATE_LIMIT_IP, default 100/60) applies only when LF_TRUSTED_IP_HEADER names a header the host
 * sets itself; by default no header is trusted and per-IP limits are off, because a client can send any
 * cf-connecting-ip or x-forwarded-for it likes (each spoofed value would also be a fresh key and a new row).
 * Counters live in Supabase Postgres (public.rate_limit_hit: atomic upsert-and-increment per key and window); the
 * development-only memory backend counts in process. The daily audit cap is separate (audit service).
 */
export type RateLimitedAction = "upload" | "signin" | "checkout";

export interface RateLimit {
  limit: number;
  windowSeconds: number;
}

export type RateLimits = Record<RateLimitedAction, RateLimit>;

export const DEFAULT_RATE_LIMITS: RateLimits = {
  upload: { limit: 10, windowSeconds: 60 },
  signin: { limit: 10, windowSeconds: 60 },
  checkout: { limit: 20, windowSeconds: 60 },
};

export const DEFAULT_IP_RATE_LIMIT: RateLimit = { limit: 100, windowSeconds: 60 };

/** Counts one hit for each key in the current window; true when any key is over the limit. */
export interface RateLimitStore {
  hit(keys: string[], limit: number, windowSeconds: number): Promise<boolean>;
}

interface Deps {
  store: RateLimitStore;
  limits: RateLimits;
  /** Loose per-IP limit, used only when the caller's IP came from a trusted header. */
  ipLimit: RateLimit;
  /** Development only. Elsewhere an unreachable limiter refuses the request. */
  failOpen: boolean;
}

/** True when the subject (user id, or sign-in email) or, if known from a trusted header, the IP is over its limit. */
export async function isRateLimited(deps: Deps, action: RateLimitedAction, who: { ip: string | null; subject: string | null }): Promise<boolean> {
  const { limit, windowSeconds } = deps.limits[action];
  const checks: Promise<boolean>[] = [];
  if (who.subject) checks.push(deps.store.hit([`${action}:subject:${who.subject}`], limit, windowSeconds));
  if (who.ip) checks.push(deps.store.hit([`${action}:ip:${who.ip}`], deps.ipLimit.limit, deps.ipLimit.windowSeconds));
  try {
    return (await Promise.all(checks)).some(Boolean);
  } catch (error) {
    console.error(JSON.stringify({ msg: "rate limiter unreachable", action, failOpen: deps.failOpen, error: String(error) }));
    return !deps.failOpen;
  }
}

/** DEVELOPMENT ONLY (memory backend): fixed windows in process memory. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly counts = new Map<string, number>();
  constructor(private readonly now: () => number = Date.now) {}

  async hit(keys: string[], limit: number, windowSeconds: number) {
    const window = Math.floor(this.now() / (windowSeconds * 1000));
    let over = false;
    for (const key of new Set(keys)) {
      const bucket = `${window}:${key}`;
      const hits = (this.counts.get(bucket) ?? 0) + 1;
      this.counts.set(bucket, hits);
      if (hits > limit) over = true;
    }
    return over;
  }
}

const IP = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * The caller's IP from the one header we are configured to trust (LF_TRUSTED_IP_HEADER), else null (per-IP off).
 * For x-forwarded-for only the rightmost hop counts (appended by the nearest proxy); the leftmost is whatever the
 * client sent. Before trusting any header on Spacefast, run a header-echo test on a preview from two networks and
 * confirm the platform overwrites (not passes through) a client-sent value.
 */
export function clientIp(headers: Headers, trustedHeader: string | null): string | null {
  if (!trustedHeader) return null;
  const raw = headers.get(trustedHeader);
  if (!raw) return null;
  const value = (trustedHeader === "x-forwarded-for" ? raw.split(",").at(-1) : raw)?.trim() ?? "";
  return IP.test(value) ? value : null;
}
