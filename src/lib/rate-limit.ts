/**
 * Per-IP and per-user (or per-email) fixed-window request limits. In deployed environments the counters live in
 * Supabase Postgres (public.rate_limit_hit: atomic upsert-and-increment per key and window); the development-only
 * memory backend counts in process. Limits default to the values below and can be set with LF_RATE_LIMIT_<ACTION>
 * ("limit/seconds"). The daily audit cap is separate (audit service).
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

/** Counts one hit for each key in the current window; true when any key is over the limit. */
export interface RateLimitStore {
  hit(keys: string[], limit: number, windowSeconds: number): Promise<boolean>;
}

interface Deps {
  store: RateLimitStore;
  limits: RateLimits;
  /** Development only. Elsewhere an unreachable limiter refuses the request. */
  failOpen: boolean;
}

/** True when either the caller's IP or the subject (user id, or sign-in email) is over the limit. */
export async function isRateLimited(deps: Deps, action: RateLimitedAction, who: { ip: string; subject: string | null }): Promise<boolean> {
  const { limit, windowSeconds } = deps.limits[action];
  const keys = [`${action}:ip:${who.ip}`, ...(who.subject ? [`${action}:subject:${who.subject}`] : [])];
  try {
    return await deps.store.hit(keys, limit, windowSeconds);
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

/**
 * The caller's IP for per-IP limits. NOTE: these headers are only trustworthy when the host sets or overwrites
 * them; confirm which header Spacefast Functions sets before relying on per-IP limits there.
 */
export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
