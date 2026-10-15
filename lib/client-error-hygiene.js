// lib/client-error-hygiene.js — Intake hygiene for /api/client-error.
//
// The route used to persist EVERY report unconditionally: one scanner
// burst following a shared Facebook link produced ~30 client_errors rows
// in ~20 minutes (2026-10-11), and crawler / ancient-bot reports dominate
// the table, masking real users' crashes (investigation 2026-10-14).
//
// Two conservative filters, both biased to RECORD when in doubt:
//
//   1. Scanner / crawler user-agents are dropped. The token list matches
//      only agents that are never a human's browser: named crawlers, HTTP
//      client libraries, headless test runners. A stock Chrome, Safari,
//      Firefox or Edge user-agent contains none of these tokens.
//   2. Identical (message + user-agent) reports dedupe within a short
//      window: one incapable client retrying the same crash every ~100 s
//      is one signal, not a pile of rows.
//
// The dedupe store is per-process memory. On serverless it is best-effort
// across warm instances, which is fine: it thins bursts and never
// suppresses a first occurrence.

// Deliberately explicit names, not a bare "bot" substring: a budget
// Android brand like CUBOT puts "cubot" in real users' UAs, and a real
// user's report must never be dropped.
const SCANNER_UA_TOKENS = [
  // Named crawlers / link-preview fetchers
  'googlebot',
  'bingbot',
  'yandexbot',
  'baiduspider',
  'duckduckbot',
  'twitterbot',
  'slackbot',
  'discordbot',
  'telegrambot',
  'bytespider',
  'petalbot',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'dotbot',
  'meta-webindexer',
  'facebookexternalhit',
  'ia_archiver',
  'crawler',
  'spider',
  'slurp', // yahoo slurp
  'headless',
  // Monitoring / scanning services
  'lighthouse',
  'pingdom',
  'uptimerobot',
  // HTTP client libraries — never a browser
  'python-requests',
  'python-urllib',
  'curl/',
  'wget',
  'go-http-client',
  'java/',
  'libwww',
  'scrapy',
  'okhttp',
  'node-fetch',
  'axios/',
];

export function isScannerUserAgent(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return false; // no UA: when in doubt, record
  return SCANNER_UA_TOKENS.some((token) => s.includes(token));
}

export function createErrorDeduper(windowMs = 10 * 60 * 1000, maxEntries = 500) {
  const seen = new Map(); // key -> last-recorded timestamp (ms)
  return {
    // True when this (message, ua) should be persisted: the first sighting,
    // or the first sighting after the window has passed. Returning true
    // records the sighting.
    shouldRecord(message, ua, now = Date.now()) {
      const key =
        String(message || '').slice(0, 300) + '\n' + String(ua || '').slice(0, 300);
      const last = seen.get(key);
      if (last !== undefined && now - last < windowMs) return false;
      seen.set(key, now);
      if (seen.size > maxEntries) {
        for (const [k, t] of seen) {
          if (now - t >= windowMs) seen.delete(k);
        }
        while (seen.size > maxEntries) {
          seen.delete(seen.keys().next().value);
        }
      }
      return true;
    },
  };
}
