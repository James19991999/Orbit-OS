import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface LimitResult { ok: boolean; remaining: number; retryAfterSec: number }
export interface Limiter { check(key: string): Promise<LimitResult> }

/** In-memory sliding window. Fine for one instance; set UPSTASH_* for distributed limits on Vercel. */
export class MemoryLimiter implements Limiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  async check(key: string): Promise<LimitResult> {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((this.windowMs - (now - arr[0])) / 1000)) };
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 10_000) this.hits.delete(this.hits.keys().next().value as string);
    return { ok: true, remaining: this.limit - arr.length, retryAfterSec: 0 };
  }
}

class UpstashLimiter implements Limiter {
  constructor(private rl: Ratelimit, private fallback: MemoryLimiter) {}
  async check(key: string): Promise<LimitResult> {
    try {
      const r = await this.rl.limit(key);
      return { ok: r.success, remaining: r.remaining, retryAfterSec: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)) };
    } catch {
      return this.fallback.check(key); // fail open to the local limiter, never fully open
    }
  }
}

const cache = new Map<string, Limiter>();
export function limiter(name: string, limit: number, windowSec: number): Limiter {
  const id = `${name}:${limit}:${windowSec}`;
  let l = cache.get(id);
  if (l) return l;
  const mem = new MemoryLimiter(limit, windowSec * 1000);
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    l = new UpstashLimiter(new Ratelimit({
      redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }),
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`), prefix: `orbitos:${name}`,
    }), mem);
  } else {
    l = mem;
  }
  cache.set(id, l);
  return l;
}
