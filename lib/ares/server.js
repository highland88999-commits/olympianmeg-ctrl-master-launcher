// ARES server helpers — Node runtime only. Never import from client components.
import { createClient } from '@supabase/supabase-js';
import { hashIp } from './ip.js';
import { ARES_DEFAULTS } from './config.js';
import { labelEvent } from './labels.js';

let _service = null;
export function serviceClient() {
  if (_service) return _service;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('ARES: Supabase service role is not configured.');
  _service = createClient(url, key, { auth: { persistSession: false } });
  return _service;
}

let _anon = null;
function anonClient() {
  if (_anon) return _anon;
  _anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
  return _anon;
}

// Dashboard API auth: the browser sends its Supabase access token as
// `Authorization: Bearer <token>`. We verify it; no token, no data.
export async function requireUser(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const { data: { user } } = await anonClient().auth.getUser(token);
    return user || null;
  } catch {
    return null;
  }
}

// Internal routes (ingest/check) are called by our own middleware and
// honeypots, authenticated with a shared secret header.
export function checkInternal(request) {
  const expected = process.env.ARES_INTERNAL_TOKEN;
  if (!expected) return false;
  return request.headers.get('x-ares-internal') === expected;
}

// Settings with a short in-memory cache (30s) so hot paths stay fast.
let _settingsCache = null;
let _settingsAt = 0;
export async function getSettings() {
  const now = Date.now();
  if (_settingsCache && now - _settingsAt < 30_000) return _settingsCache;
  const merged = { ...ARES_DEFAULTS };
  try {
    const { data } = await serviceClient().from('ares_settings').select('key, value');
    for (const row of data || []) {
      if (row.key === 'sentinel_enabled') merged.sentinelEnabled = row.value === true || row.value === 'true';
      if (row.key === 'phalanx_enabled') merged.phalanxEnabled = row.value === true || row.value === 'true';
    }
  } catch {
    // DB unreachable: fall back to env/defaults rather than failing open.
  }
  const env = process.env;
  if (env.ARES_SENTINEL_ENABLED !== undefined)
    merged.sentinelEnabled = env.ARES_SENTINEL_ENABLED === '1' || env.ARES_SENTINEL_ENABLED === 'true';
  if (env.ARES_PHALANX_ENABLED !== undefined)
    merged.phalanxEnabled = env.ARES_PHALANX_ENABLED === '1' || env.ARES_PHALANX_ENABLED === 'true';
  _settingsCache = merged;
  _settingsAt = now;
  return merged;
}

const STRIKE_TYPES = new Set(['honeypot_hit', 'bot_blocked', 'scanner_path']);

export function hashVisitorIp(ip) {
  return hashIp(ip, process.env.ARES_IP_SALT || '');
}

// Write one evidence event. For strike-worthy events, count strikes and
// apply a temporary ban when the threshold is crossed (Phalanx).
//
// Learning pipeline: when the caller supplies ml ({ features,
// feature_version }), the event is labeled (threat_class, confidence,
// agent_source) and the whole bundle is stored under details.ares_ml.
// Until the final consolidated SQL adds real columns, the JSONB details
// column carries the training payload — no schema change needed today.
export async function logEvent({ ip, eventType, path = null, userAgent = null, details = {}, ml = null }) {
  const settings = await getSettings();
  if (!settings.sentinelEnabled) return { logged: false, reason: 'sentinel-disabled' };
  const ipHash = hashVisitorIp(ip);
  const enriched = { ...(details || {}) };
  if (ml && Array.isArray(ml.features)) {
    enriched.ares_ml = {
      feature_version: ml.feature_version,
      features: ml.features,
      ...labelEvent({ eventType }),
    };
  }
  const db = serviceClient();
  const { error } = await db.from('ares_events').insert([{
    ip_hash: ipHash,
    event_type: eventType,
    path,
    user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
    details: enriched,
  }]);
  if (error) return { logged: false, reason: 'db-error' };

  let banned = false;
  if (settings.phalanxEnabled && STRIKE_TYPES.has(eventType)) {
    banned = await applyStrike(db, ipHash, settings, eventType);
  }
  return { logged: true, ipHash, banned };
}

async function applyStrike(db, ipHash, settings, eventType) {
  const { data: existing } = await db
    .from('ares_blocks')
    .select('strikes, expires_at')
    .eq('ip_hash', ipHash)
    .single();

  const strikes = (existing?.strikes || 0) + 1;
  const shouldBan = strikes >= settings.strikesBeforeBan;
  const expiresAt = shouldBan
    ? new Date(Date.now() + settings.banMinutes * 60_000).toISOString()
    : new Date(Date.now() + 24 * 3600_000).toISOString(); // watchlist row

  await db.from('ares_blocks').upsert([{
    ip_hash: ipHash,
    reason: shouldBan ? `Auto-ban: ${strikes} strikes (last: ${eventType})` : `Watching: ${strikes} strike(s)`,
    strikes,
    expires_at: expiresAt,
  }], { onConflict: 'ip_hash' });
  return shouldBan;
}

export async function isBlocked(ip) {
  const ipHash = hashVisitorIp(ip);
  const { data } = await serviceClient()
    .from('ares_blocks')
    .select('reason, expires_at, strikes')
    .eq('ip_hash', ipHash)
    .single();
  if (!data) return { blocked: false };
  if (new Date(data.expires_at).getTime() < Date.now()) return { blocked: false };
  // Only treat it as a ban when strikes hit the threshold; below that it
  // is just a watchlist entry.
  const settings = await getSettings();
  if ((data.strikes || 0) < settings.strikesBeforeBan) return { blocked: false };
  return { blocked: true, reason: data.reason, expiresAt: data.expires_at };
}
