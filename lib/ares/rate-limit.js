// ARES Phalanx — in-memory sliding-window rate limiter (pure logic).
// One limiter instance per server process. NOTE: on serverless/edge this
// state is per-instance, not global. It stops casual abuse on every
// instance; a shared store (Supabase/Upstash) is the upgrade path for
// coordinated floods. Documented honestly in the middleware example.

export function createRateLimiter({ windowMs = 60000, maxHits = 60 } = {}) {
  const hits = new Map(); // key -> array of timestamps

  function prune(key, now) {
    const list = hits.get(key) || [];
    const fresh = list.filter((t) => now - t < windowMs);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
    return fresh;
  }

  return {
    // Returns { allowed, remaining, retryAfterMs }.
    check(key, now = Date.now()) {
      const fresh = prune(key, now);
      if (fresh.length >= maxHits) {
        const oldest = fresh[0];
        return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - oldest) };
      }
      fresh.push(now);
      hits.set(key, fresh);
      return { allowed: true, remaining: maxHits - fresh.length, retryAfterMs: 0 };
    },
    count(key, now = Date.now()) {
      return prune(key, now).length;
    },
    reset(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
  };
}
