type RateLimitState = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitState>();

function cleanupExpired(now: number) {
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export function consumeRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  cleanupExpired(now);

  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}
