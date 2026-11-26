// ARES config — thresholds and module toggles.
// Deploy-time values come from env. Runtime toggles live in the
// ares_settings table (dashboard). Edge middleware reads env only.

export const ARES_DEFAULTS = {
  // Sentinel (detection + evidence logging)
  sentinelEnabled: true,
  // Phalanx (blocking: temp bans + 403s)
  phalanxEnabled: true,
  // Sliding window: max requests per IP per minute before rate limiting.
  rateLimitMax: 120,
  rateLimitWindowMs: 60_000,
  // Bot score at/above which a request is treated as a bot.
  botThreshold: 40,
  // Strikes (honeypot hits / bot detections) before a temporary ban.
  strikesBeforeBan: 5,
  // Temporary ban length in minutes.
  banMinutes: 60,
  // Evidence retention in days.
  retentionDays: 90,
  // Phase 1 kill switch (ARCHITECTURE.md §4): when true, ALL Phase 1
  // non-determinism — rotating thresholds, watch-band randomization,
  // jitter — switches OFF and scoring falls back to the static v0
  // heuristics. Auto-scaling is already OFF. Dashboard-toggleable via
  // ares_settings key 'phase1_kill_switch'; env ARES_PHASE1_KILL_SWITCH
  // forces it on. Never true by default.
  killSwitch: false,
};

export function configFromEnv(env = process.env) {
  const bool = (v, d) => (v === undefined ? d : v === '1' || String(v).toLowerCase() === 'true');
  const num = (v, d) => {
    const n = Number(v);
    return v === undefined || !Number.isFinite(n) ? d : n;
  };
  return {
    sentinelEnabled: bool(env.ARES_SENTINEL_ENABLED, ARES_DEFAULTS.sentinelEnabled),
    phalanxEnabled: bool(env.ARES_PHALANX_ENABLED, ARES_DEFAULTS.phalanxEnabled),
    rateLimitMax: num(env.ARES_RATE_LIMIT_MAX, ARES_DEFAULTS.rateLimitMax),
    rateLimitWindowMs: num(env.ARES_RATE_LIMIT_WINDOW_MS, ARES_DEFAULTS.rateLimitWindowMs),
    botThreshold: num(env.ARES_BOT_THRESHOLD, ARES_DEFAULTS.botThreshold),
    strikesBeforeBan: num(env.ARES_STRIKES_BEFORE_BAN, ARES_DEFAULTS.strikesBeforeBan),
    banMinutes: num(env.ARES_BAN_MINUTES, ARES_DEFAULTS.banMinutes),
    retentionDays: num(env.ARES_RETENTION_DAYS, ARES_DEFAULTS.retentionDays),
    killSwitch: bool(env.ARES_PHASE1_KILL_SWITCH, ARES_DEFAULTS.killSwitch),
  };
}

// Event types the system writes. Controlled vocabulary; the dashboard
// groups and labels these for plain-English display.
export const EVENT_TYPES = [
  'honeypot_hit',
  'scanner_path',
  'bot_blocked',
  'rate_limited',
  'blocked_ip_hit',
  // Phase 1: a watch-band flag — suspicious but undecided traffic the
  // Hub logged for the record. Never a strike, never a ban on its own.
  'watch_flagged',
];

export const EVENT_LABELS = {
  honeypot_hit: 'Honeypot trip',
  scanner_path: 'Scanner probe',
  bot_blocked: 'Bot blocked',
  rate_limited: 'Rate limited',
  blocked_ip_hit: 'Banned visitor retry',
  watch_flagged: 'Watch-band flag',
};
