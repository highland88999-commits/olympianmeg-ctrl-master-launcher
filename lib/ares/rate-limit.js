// ARES Phalanx — in-memory sliding-window rate limiter (pure logic).
// One limiter instance per server process. NOTE: on serverless/edge this
// state is per-instance, not global. It stops casual abuse on every
// instance; a shared store (Supabase/Upstash) is the upgrade path for
// coordinated floods. Documented honestly in the middleware example.

export function createRateLimiter({ windowMs = 60000, maxHits = 60 } = {}) {
  const hits = new Map(); // key -> array of timestamps

  function prune(key, now, window = windowMs) {
    const list = hits.get(key) || [];
    const fresh = list.filter((t) => now - t < window);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
    return fresh;
  }

  return {
    // Returns { allowed, remaining, retryAfterMs }.
    // overrides (Phase 1 rotation): { windowMs, maxHits } replace the
    // instance values for this one call, so the window and cap can
    // rotate per epoch without rebuilding the limiter. Defaults keep
    // the original v0 contract: check(key, now).
    check(key, now = Date.now(), overrides = {}) {
      const window = Number(overrides.windowMs) > 0 ? Number(overrides.windowMs) : windowMs;
      const max = Number(overrides.maxHits) > 0 ? Number(overrides.maxHits) : maxHits;
      const fresh = prune(key, now, window);
      if (fresh.length >= max) {
        const oldest = fresh[0];
        return { allowed: false, remaining: 0, retryAfterMs: window - (now - oldest) };
      }
      fresh.push(now);
      hits.set(key, fresh);
      return { allowed: true, remaining: max - fresh.length, retryAfterMs: 0 };
    },
    count(key, now = Date.now(), overrides = {}) {
      const window = Number(overrides.windowMs) > 0 ? Number(overrides.windowMs) : windowMs;
      return prune(key, now, window).length;
    },
    reset(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
  };
}
