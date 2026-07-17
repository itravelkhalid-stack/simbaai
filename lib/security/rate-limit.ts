/**
 * In-memory sliding-window rate limiter for edge/middleware and route handlers.
 * Suitable for single-instance / soft protection. For multi-region, swap for Upstash.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
};

export function rateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const existing = store.get(params.key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + params.windowMs;
    store.set(params.key, { count: 1, resetAt });
    return {
      ok: true,
      remaining: params.limit - 1,
      resetAt,
      limit: params.limit,
    };
  }

  if (existing.count >= params.limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      limit: params.limit,
    };
  }

  existing.count += 1;
  store.set(params.key, existing);
  return {
    ok: true,
    remaining: params.limit - existing.count,
    resetAt: existing.resetAt,
    limit: params.limit,
  };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Presets for public / auth surfaces */
export const RATE_LIMITS = {
  auth: { limit: 20, windowMs: 60_000 },
  publicApi: { limit: 60, windowMs: 60_000 },
  webhook: { limit: 300, windowMs: 60_000 },
  oauth: { limit: 30, windowMs: 60_000 },
} as const;
