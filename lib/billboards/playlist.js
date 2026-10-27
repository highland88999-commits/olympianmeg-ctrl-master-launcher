// lib/billboards/playlist.js — Merlin's billboard playlist rule
// (2026-10-27). Pure helpers, headless: no browser, no network, no
// Supabase — callers pass rows in, functions return playlists out.
//
// THE RULE, one sentence per case:
// - ROTATING board: newest published paid ad plays FIRST, then older
//   paid ads newest-first, house ad LAST.
// - SOLO board (whole-space purchase, $25 CAD/mo): the buyer's ad
//   takes the billboard alone — house ad AND rotating entries are
//   off that number for the solo term.
// - SOLO ENDS (cancelled, or expired into paused): the house ad
//   returns to that number and still-active rotating ads return in
//   newest-first order.
//
// SUPABASE SOURCES (the tables that drive this):
// - billboard_queue rows are the wiring input. A row's PUBLISH time
//   is sent_at: the Send action flips staged rows to sent and stamps
//   sent_at in one update, so sent_at marks publication. created_at
//   is only the staging time and serves as the tie-break when rows
//   share one send batch (same sent_at): earlier-staged plays later.
// - billboard_subscriptions rows are the solo state. A solo counts
//   while status is 'active' — the renew cron moves unpaid expiry to
//   'paused' and cancel moves it to 'cancelled', so 'active' alone is
//   the live signal; no period_end check here (a renewal in flight
//   must not flicker a live solo off).
//
// LAYERS (both must agree; tests pin both):
// - Manifest build time: wireQueueIntoManifest() is THE wiring
//   transform for future billboard wirings — it merges sent queue
//   rows into the manifest (never wholesale-replaces: house entries
//   on still-unsold panels are preserved) and orders every board.
// - Panel resolution: manifestToOverrides() (lib/billboards/
//   overrides.js) orders entries the same way and, given a solo map,
//   enforces solo-only even when the manifest is stale (a solo that
//   activated after the last wire). The hub feeds that map from the
//   public /api/billboards/solo endpoint, mirroring the paused guard.
//
// Manifest entries gain two timestamp fields, existing fields
// untouched: publishedAt (ISO, from the queue row's sent_at, falling
// back to created_at) and createdAt (ISO, from the queue row, used
// only as the same-batch tie-break). Entries without timestamps
// (today's house-only manifest) sort as oldest paid — house sorts
// last regardless, so the live all-house manifest already satisfies
// the rule trivially.

/** True for a house/demo entry (flagged, never by company name). */
export function isHouseEntry(entry) {
  return entry?.house === true;
}

function timeMs(value) {
  if (typeof value !== 'string' || !value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/** Publish time of an entry (0 when unknown — sorts oldest). */
export function publishedTime(entry) {
  return timeMs(entry?.publishedAt ?? entry?.sentAt);
}

/** Staging time of an entry (0 when unknown). Tie-break only. */
export function createdTime(entry) {
  return timeMs(entry?.createdAt);
}

/**
 * Order one board's entries for playback: paid entries newest
 * published first (same publish time → earlier-staged plays later →
 * original manifest order as the final tie-break, so the sort is
 * stable and legacy timestamp-less manifests keep their order),
 * house entries always LAST regardless of timestamp. Returns a NEW
 * array; the input is never mutated.
 */
export function orderBoardEntries(entries) {
  const list = (Array.isArray(entries) ? entries : []).map((entry, index) => ({ entry, index }));
  list.sort((a, b) => {
    const aHouse = isHouseEntry(a.entry);
    const bHouse = isHouseEntry(b.entry);
    if (aHouse !== bHouse) return aHouse ? 1 : -1;
    const byPublished = publishedTime(b.entry) - publishedTime(a.entry);
    if (byPublished !== 0) return byPublished;
    const byCreated = createdTime(b.entry) - createdTime(a.entry);
    if (byCreated !== 0) return byCreated;
    return a.index - b.index;
  });
  return list.map(({ entry }) => entry);
}

/**
 * True when a billboard_subscriptions row is a LIVE solo: plan solo
 * and status active. Paused and cancelled solos do not enforce.
 */
export function isActiveSoloSubscription(sub) {
  return sub?.plan === 'solo' && sub?.status === 'active';
}

/**
 * Shape a billboard_subscriptions row (snake_case from Supabase, or
 * camelCase) into a manifest entry, or null when it cannot play
 * (missing company/link/creative, or a non-video/image type). The
 * solo entry is never a house entry.
 */
export function soloEntryFromSubscription(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const company = String(sub.company_name ?? sub.company ?? '').trim();
  const link = String(sub.link_url ?? sub.link ?? '').trim();
  const creativeUrl = String(sub.creative_url ?? sub.creativeUrl ?? '').trim();
  const creativeType = sub.creative_type ?? sub.creativeType;
  if (!company || !link || !creativeUrl) return null;
  if (creativeType !== 'image' && creativeType !== 'video') return null;
  return { company, link, creativeType, creativeUrl, house: false };
}

/**
 * Resolve one board's playlist: an active solo entry plays ALONE;
 * otherwise the rotating order (newest paid first, house last).
 * `soloEntry` is an entry-shaped object or null — subscription rows
 * must be converted with soloEntryFromSubscription first (and
 * checked with isActiveSoloSubscription). Returns a NEW array.
 */
export function resolveBoardPlaylist(entries, soloEntry) {
  if (soloEntry && typeof soloEntry === 'object' && soloEntry.company && soloEntry.link && soloEntry.creativeUrl) {
    return [soloEntry];
  }
  return orderBoardEntries(entries);
}

/**
 * Accept a solo value in either shape the callers hold: an
 * entry-shaped object (used as-is) or a billboard_subscriptions row
 * (used only when it is an ACTIVE solo). Anything else → null.
 */
export function normalizeSoloInput(value) {
  if (!value || typeof value !== 'object') return null;
  if ('plan' in value || 'status' in value || 'billboard_number' in value || 'company_name' in value) {
    return isActiveSoloSubscription(value) ? soloEntryFromSubscription(value) : null;
  }
  if (value.company && value.link && value.creativeUrl) return value;
  return null;
}

function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const company = String(raw.company ?? '').trim();
  const link = String(raw.link ?? '').trim();
  const creativeUrl = String(raw.creativeUrl ?? '').trim();
  if (!company || !link || !creativeUrl) return null;
  if (raw.creativeType !== 'image' && raw.creativeType !== 'video') return null;
  const out = {
    company,
    link,
    creativeType: raw.creativeType,
    creativeUrl,
    house: raw.house === true,
  };
  if (typeof raw.publishedAt === 'string' && raw.publishedAt) out.publishedAt = raw.publishedAt;
  if (typeof raw.createdAt === 'string' && raw.createdAt) out.createdAt = raw.createdAt;
  return out;
}

function clampInterval(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 5 && n <= 60) return Math.floor(n);
  return fallback;
}

function rowKey(row) {
  return `${String(row?.company_name ?? '').trim()}|${String(row?.link_url ?? '').trim()}`;
}

function rowTime(row) {
  return row?.sent_at || row?.created_at || '';
}

/**
 * THE wiring transform for future billboard wirings. Given the
 * current manifest, the sent queue rows, the active solo state, and
 * the house entry template, returns the NEW manifest object:
 * - Sent rows merge in per board (ad rows upsert by company+link
 *   with publishedAt = sent_at, remove rows delete their match),
 *   applied oldest-first so the newest row wins.
 * - A board with an active solo becomes solo-only: house and
 *   rotating entries are evicted from that number.
 * - A board whose solo ENDED restores on the next wire — but the
 *   wire cannot tell an ex-solo entry from a rotating entry by shape
 *   alone, so the caller passes `endedSoloTriples`: the ended solo's
 *   { billboardNumber, company, link }, read from
 *   billboard_subscriptions rows with status paused/cancelled for
 *   that number. Those entries are deleted before ordering, and the
 *   board then restores house + still-sent rotating ads
 *   newest-first. (At render time, before that wire, the existing
 *   stopped guard drops the cancelled entry and the board falls back
 *   to its base slot transiently — the wire is what restores it.)
 * - Every other board orders newest-paid-first with house last, and
 *   gains the house entry when it has none (so a solo ending, or a
 *   board emptied by removals, restores house + still-sent rotating
 *   ads newest-first on the next wire — never a blank board).
 * - Boards untouched by rows or solo keep their existing entries
 *   (re-ordered by the same rule) — house on still-unsold panels is
 *   never wholesale-replaced away.
 * - intervalSeconds: the board's existing interval, else the latest
 *   ad row's interval, else 15.
 * Inputs are never mutated. `soloByNumber` is a Map (or plain
 * object) of billboard number → solo entry or subscription row.
 * `houseEntry` is the house template (company/link/creativeType/
 * creativeUrl/house:true); boards are left houseless only when no
 * template is given.
 */
export function wireQueueIntoManifest({ manifest, sentRows, soloByNumber, houseEntry, endedSoloTriples }) {
  const boards = new Map();
  const rawBoards = manifest && typeof manifest === 'object' ? manifest.billboards : null;
  if (rawBoards && typeof rawBoards === 'object') {
    for (const [key, board] of Object.entries(rawBoards)) {
      const number = Number(key);
      if (!Number.isInteger(number) || number < 1 || number > 44) continue;
      const entries = (Array.isArray(board?.entries) ? board.entries : [])
        .map(cleanEntry)
        .filter(Boolean);
      const interval = Number(board?.intervalSeconds);
      boards.set(number, {
        intervalSeconds: Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 15,
        entries,
      });
    }
  }

  const rows = (Array.isArray(sentRows) ? sentRows : [])
    .filter((r) => r && typeof r === 'object')
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(rowTime(a)) || 0;
      const tb = Date.parse(rowTime(b)) || 0;
      if (ta !== tb) return ta - tb;
      const ca = Date.parse(a.created_at || '') || 0;
      const cb = Date.parse(b.created_at || '') || 0;
      return ca - cb;
    });
  for (const row of rows) {
    const number = Number(row.billboard_number);
    if (!Number.isInteger(number) || number < 1 || number > 44) continue;
    if (!boards.has(number)) boards.set(number, { intervalSeconds: 15, entries: [] });
    const board = boards.get(number);
    if (row.kind === 'remove') {
      const key = rowKey(row);
      board.entries = board.entries.filter((e) => `${e.company}|${e.link}` !== key);
      continue;
    }
    if (row.kind !== 'ad') continue;
    const entry = cleanEntry({
      company: row.company_name,
      link: row.link_url,
      creativeType: row.creative_type,
      creativeUrl: row.creative_url,
      house: row.is_house === true,
    });
    if (!entry) continue;
    entry.publishedAt = row.sent_at || row.created_at || undefined;
    if (row.created_at) entry.createdAt = row.created_at;
    if (entry.publishedAt === undefined) delete entry.publishedAt;
    const key = `${entry.company}|${entry.link}`;
    const at = board.entries.findIndex((e) => `${e.company}|${e.link}` === key);
    if (at >= 0) board.entries[at] = entry;
    else board.entries.push(entry);
    board.intervalSeconds = clampInterval(row.rotation_interval_seconds, board.intervalSeconds);
  }

  const soloMap = soloByNumber instanceof Map
    ? soloByNumber
    : new Map(Object.entries(soloByNumber || {}).map(([k, v]) => [Number(k), v]));
  const cleanHouse = houseEntry ? cleanEntry(houseEntry) : null;

  // Ended solos: delete the ex-solo entry from its board BEFORE
  // ordering, so the next wire restores house + rotating instead of
  // carrying the dead solo entry forward.
  for (const t of Array.isArray(endedSoloTriples) ? endedSoloTriples : []) {
    const number = Number(t?.billboardNumber);
    if (!Number.isInteger(number) || number < 1 || number > 44) continue;
    const board = boards.get(number);
    if (!board) continue;
    const key = `${String(t.company ?? '').trim()}|${String(t.link ?? '').trim()}`;
    board.entries = board.entries.filter((e) => `${e.company}|${e.link}` !== key);
  }

  const outBoards = {};
  for (const number of [...boards.keys()].sort((a, b) => a - b)) {
    const board = boards.get(number);
    const solo = normalizeSoloInput(soloMap.get(number));
    if (solo) {
      outBoards[String(number)] = { intervalSeconds: board.intervalSeconds, entries: [solo] };
      continue;
    }
    const ordered = orderBoardEntries(board.entries);
    if (cleanHouse && !ordered.some(isHouseEntry)) ordered.push({ ...cleanHouse });
    outBoards[String(number)] = { intervalSeconds: board.intervalSeconds, entries: ordered };
  }
  return { version: 1, billboards: outBoards };
}
