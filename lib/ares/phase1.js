// ARES Phase 1 — anti-mapping hardening (pure logic, no I/O, edge-safe).
//
// What lives here:
//   * Seeded PRNG (mulberry32 over an FNV-1a string hash) — the Hub's
//     rotation schedule is deterministic for a given seed, so every
//     serverless instance agrees without shared state, and nothing an
//     attacker observes reveals the seed or the schedule.
//   * Rotating thresholds + rate-limit windows (ARCHITECTURE.md §1c.1):
//     the bot threshold, the per-IP rate cap, and the rate window rotate
//     every 15 minutes (one epoch), drawn from the seeded PRNG. A limit
//     an attacker binary-searched in one epoch is wrong in the next.
//   * Non-deterministic watch-band handling (§1c.2): within the watch
//     band the Hub picks — per epoch, visitor, and path — between silent
//     log, delayed response, and honeypot redirect, so differential
//     probing yields noise, not a decision boundary.
//   * Jittered timing (§1c.4): small random delays on undecided traffic.
//   * A short client fingerprint (UA + language + encoding, FNV-1a) used
//     only to group events for cohort correlation — it is NOT an identity
//     and never leaves the evidence log.
//
// HARD RULES (Phase 1, standing law):
//   * No response may ever reveal a limit value, the seed, the epoch, or
//     which rotation is live. These functions return values for internal
//     enforcement only; callers must never serialize them to a client.
//   * No seed, no rotation: if ARES_ROTATION_SEED is missing/empty, or
//     the kill switch is on, Phase 1 is inert and scoring falls back to
//     the static v0 heuristics (bot threshold 40, env rate limits).
//   * Nothing here blocks anyone. Watch-band actions serve the request
//     normally (possibly delayed, possibly via a honeypot trap route);
//     only the static v0 bot bar and the human-gated ban path deny.

export const ROTATION_EPOCH_MS = 15 * 60 * 1000; // one epoch = 15 minutes

// Watch band: scores at/above WATCH_LOW but below the (rotating) bot
// threshold are undecided, not bots. 15 is the missing-headers-only
// score — a non-browser client, suspicious but not proof of anything.
export const WATCH_LOW = 15;

// Rate-limit windows the rotation may pick from (30s–120s).
export const ROTATION_WINDOWS_MS = [30_000, 45_000, 60_000, 90_000, 120_000];

// Static v0 fallback — what the system enforces when Phase 1 is off
// (no seed, or the kill switch is on). Matches the v0 defaults.
export const STATIC_FALLBACK = Object.freeze({
  botThreshold: 40,
  rateLimitMax: 120,
  rateLimitWindowMs: 60_000,
  watchLow: WATCH_LOW,
});

/** FNV-1a hash of a string -> unsigned 32-bit int. */
export function hashSeedString(str) {
  let h = 0x811c9dc5;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 PRNG. Seed may be a number or a string (hashed first). */
export function createSeededRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeedString(seed)) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which rotation epoch a timestamp falls in. */
export function rotationEpoch(now = Date.now()) {
  return Math.floor(Number(now) / ROTATION_EPOCH_MS);
}

/**
 * Current rotation parameters for one epoch.
 *
 * Inputs are the deployment's base values (env/defaults); the seeded
 * PRNG jitters them per epoch. Ranges are deliberately narrow — the
 * defense must stay sane in every epoch, never wild:
 *   bot threshold: base 40 -> 35..50
 *   rate cap: base -> base * 0.75..1.25 (rounded, min 1)
 *   rate window: one of 30s/45s/60s/90s/120s
 *
 * Returns { epoch, botThreshold, rateLimitMax, rateLimitWindowMs, watchLow }.
 * The seed is never part of the return value.
 */
export function rotationParams({ seed = '', now = Date.now(), baseBotThreshold = 40, baseRateLimitMax = 120, baseRateLimitWindowMs = 60_000 } = {}) {
  const epoch = rotationEpoch(now);
  const rng = createSeededRng(`${seed}:epoch:${epoch}`);
  const thresholdSpread = 16; // 35..50 around a base of 40
  const botThreshold = Math.max(
    20,
    Math.min(60, Math.round(Number(baseBotThreshold) - thresholdSpread / 2 + rng() * thresholdSpread)),
  );
  const rateLimitMax = Math.max(
    1,
    Math.round(Number(baseRateLimitMax) * (0.75 + rng() * 0.5)),
  );
  const rateLimitWindowMs =
    ROTATION_WINDOWS_MS[Math.floor(rng() * ROTATION_WINDOWS_MS.length)];
  return { epoch, botThreshold, rateLimitMax, rateLimitWindowMs, watchLow: WATCH_LOW };
}

/**
 * Is Phase 1 live for this request? Needs a seed AND the kill switch off.
 * Missing seed or kill switch on -> static v0 (fail-open to the known
 * deterministic defense, never to a half-configured rotation).
 */
export function isPhase1Active({ seed = '', killSwitch = false } = {}) {
  const hasSeed = typeof seed === 'string' && seed.trim().length > 0;
  return hasSeed && killSwitch !== true;
}

/**
 * Watch-band action for one (epoch, visitor, path): 'log' | 'delay' |
 * 'honeypot'. Deterministic per epoch/visitor/path — the same visitor
 * repeating the same probe inside one epoch gets the same treatment
 * (stable, not flapping), but the choice is unpredictable to the
 * attacker and changes every epoch. Weighted: silent log 50%, delayed
 * response 30%, honeypot redirect 20%.
 *
 * The caller enforces eligibility: 'honeypot' is only applied to
 * probe-like traffic (a scanner path or a flagged scanner UA below the
 * bar); anything else falls back to 'delay'. That guard lives in the
 * middleware, not here, so this function stays a pure draw.
 */
export function watchAction({ seed = '', epoch = 0, ipHash = '', path = '' } = {}) {
  const rng = createSeededRng(`${seed}:watch:${epoch}:${ipHash}:${path}`);
  const draw = rng();
  if (draw < 0.5) return 'log';
  if (draw < 0.8) return 'delay';
  return 'honeypot';
}

/**
 * Jitter for undecided traffic: 0..maxMs, deterministic for a given
 * salt. Callers pass a time-bucketed salt (e.g. epoch + 10s bucket) so
 * repeated requests vary over time instead of returning one fixed delay
 * an attacker could subtract. Default cap 150ms — small on purpose.
 */
export function jitterMs({ seed = '', salt = '', maxMs = 150 } = {}) {
  const rng = createSeededRng(`${seed}:jitter:${salt}`);
  const cap = Math.max(0, Number(maxMs) || 0);
  return Math.floor(rng() * (cap + 1));
}

/**
 * Short client fingerprint for cohort grouping: FNV-1a over the
 * lowercased user-agent + accept-language + accept-encoding, as 8 hex
 * chars. Grouping signal only — it is not an identity, not a hash of
 * an IP, and it carries no raw header value anywhere.
 */
export function clientFingerprint({ userAgent = '', acceptLanguage = '', acceptEncoding = '' } = {}) {
  const material = [
    String(userAgent || '').toLowerCase().trim(),
    String(acceptLanguage || '').toLowerCase().trim(),
    String(acceptEncoding || '').toLowerCase().trim(),
  ].join('|');
  return hashSeedString(material).toString(16).padStart(8, '0');
}
