import type { Query } from "@/lib/db/neon";
import type { RateLimitStore } from "@/lib/rate-limit";

/** public.rate_limit_hit / rate_limit_forgive (owner role only; see neon/migrations). */
export class NeonRateLimitStore implements RateLimitStore {
  constructor(private readonly sql: Query) {}

  async hit(keys: string[], limit: number, windowSeconds: number): Promise<boolean> {
    const [row] = await this.sql("select public.rate_limit_hit($1::text[], $2::int, $3::int) as over", [keys, limit, windowSeconds]);
    return row?.over === true;
  }

  async forgive(keys: string[], windowSeconds: number): Promise<void> {
    await this.sql("select public.rate_limit_forgive($1::text[], $2::int)", [keys, windowSeconds]);
  }
}
