// lib/aquarium/nodes.js
//
// Aquarium feed list + merge law (Merlin, 2026-11-15).
//
// The aquarium is a live-cam viewer: every node is a YouTube embed.
// On 2026-11-15 Merlin's video showed many nodes never loading, so the
// list was live-checked feed by feed (YouTube oEmbed, curl, 2026-11-16):
// a feed counts as dead only if YouTube itself refuses it — 401/403
// (embedding disabled by the owner) or 404 (video gone). Ten feeds
// failed that check and are deleted from the rotation below; the
// deleted set is pinned in DELETED_DEAD_NODES so the decision stays
// auditable and no test can silently re-add one.
//
// ROUND 2 (Nov 15 ~23:55, his words: "there are still feeds that show
// a black screen, not a scene"): the six feeds below were black in his
// video but passed oEmbed at the time, so round 1 kept them. He has now
// said plainly that a black screen is not a scene — they are DELETED
// from the rotation, named in DELETED_BLACK_NODES so the decision stays
// auditable. (Their oEmbed check still passed 200; the phone showed
// black. What the phone shows is the truth that counts.)
//
// USER FEEDS ARE PERMANENT. A feed added through ADD FEED is a user
// feed (origin 'user'): it lives in the Supabase nexus_nodes table AND
// in a localStorage backup, it is merged back in on every load, and no
// dead-feed sweep ever touches it — the sweep only ever names built-in
// ids. Deleting a feed is a separate, PIN-gated manual act
// (see lib/aquarium/pin-gate.js).

// Built-in rotation: the 34 feeds that load, in the original order.
// (The 10 dead feeds were removed from this list; see
// DELETED_DEAD_NODES. The 6 black-screen feeds were removed in round 2;
// see DELETED_BLACK_NODES.)
export const BUILTIN_NODES = [
  { id: 'DHUnz4dyb54', name: 'AQUARIUM' },
  { id: 'XsOU8JnEpNM', name: 'OL DONYO LODGE' },
  { id: '5e4lsEe4Vew', name: 'WOLF CENTER NORTH' },
  { id: 'dIChLG4_WNs', name: 'NKORHO BUSH LODGE' },
  { id: 'ItdXaWUVF48', name: "ROSIE'S PAN AFRICA" },
  { id: 'ydYDqZQpim8', name: 'NAMIB DESERT LIVE' },
  { id: 'S46DdA8Mc4I', name: 'MAKOV STORK NEST' },
  { id: 'F0GOOP82094', name: 'MORTEN HILMER FOREST' },
  { id: '4BrvMGznLTo', name: 'MOUNTAIN WATERFALL' },
  { id: 'ayMw6zvsUpQ', name: 'PACIFIC REEF CAM' },
  { id: 'jzx_n25g3kA', name: 'UTOPIA UNDERWATER' },
  { id: 'ouWBQoVFegI', name: 'BALD EAGLE NEST' },
  { id: 'aXAsMcmtJTc', name: 'NETHERLANDS SEAL CAM' },
  { id: 'yfSyjwY6zSQ', name: 'GRACE GORILLA FOREST' },
  { id: 'azNqXbUW-K4', name: 'TROPICAL FISH CAM' },
  { id: 'yuIm1V7Ne7I', name: 'ONGUMA WATERHOLE' },
  { id: 'QOzC_AbsPlw', name: 'SPACE AMBIENT HUD' },
  { id: 'XyPU5-pNg5E', name: 'AQUARIUM FEED 01' },
  { id: 'Io1Kle7QR-E', name: 'AQUARIUM FEED 02' },
  { id: 'RZFMYVNhd4k', name: 'AQUARIUM FEED 03' },
  { id: 'JMMoRwYo5kE', name: 'AQUARIUM FEED 04' },
  { id: '-qvYCbvbeN8', name: 'AQUARIUM FEED 08' },
  { id: 'SUXPnIEpbn4', name: 'AQUARIUM FEED 09' },
  { id: 'tEtg5Kg3voQ', name: 'AQUARIUM FEED 10' },
  { id: 'abbR-Ttd-cA', name: 'AQUARIUM FEED 11' },
  { id: 'qi0mY6zVQnY', name: 'AQUARIUM FEED 14' },
  { id: 'MwcqP3ta6RI', name: 'AQUARIUM FEED 15' },
  { id: 'fIMbMz2P7Bs', name: 'AQUARIUM FEED 16' },
  { id: 'UDAZWxehMAI', name: 'AQUARIUM FEED 19' },
  { id: 'w3LjpFhySTg', name: 'AQUARIUM FEED 20' },
  { id: '3e_uPkJCTNo', name: 'AQUARIUM FEED 21' },
  { id: 'gJVnp5fF0vM', name: 'AQUARIUM FEED 23' },
  { id: 'typxqJU-pFQ', name: 'AQUARIUM FEED 25' },
  { id: 'E0TZTmTK-Ws', name: 'AQUARIUM FEED 27' },
];

// The 10 feeds deleted 2026-11-16: live-checked dead via YouTube oEmbed
// (curl, 2026-11-16). `node` is the original 1-based position, `check`
// is the oEmbed HTTP status YouTube returned. 401/403 = the owner
// disabled embedding ("Playback on other websites has been disabled by
// the video owner" — exactly what Merlin's video showed on nodes 13 and
// 17); 404 = the video is gone. Kept here so the deletion is auditable
// and the test can pin that none of these ever comes back.
export const DELETED_DEAD_NODES = [
  { node: 13, id: 'iws3rh5vLAQ', name: 'KILAUEA VOLCANO', check: 'oEmbed 401 — embedding disabled by the owner' },
  { node: 17, id: 'FqQJmDiW0xs', name: 'ANCIENT EGYPT LIVE', check: 'oEmbed 403 — embedding disabled by the owner' },
  { node: 19, id: 'qJ8lYplu1y0', name: 'MAUNAKEA METEOR CAM', check: 'oEmbed 404 — video gone' },
  { node: 28, id: 'HlJ4aRtYhoo', name: 'AQUARIUM FEED 05', check: 'oEmbed 401 — embedding disabled by the owner' },
  { node: 29, id: 'iWCeBAxRCBo', name: 'AQUARIUM FEED 06', check: 'oEmbed 403 — embedding disabled by the owner' },
  { node: 35, id: 'dN1uDn-Luno', name: 'AQUARIUM FEED 12', check: 'oEmbed 403 — embedding disabled by the owner' },
  { node: 36, id: '-479TZi-EAs', name: 'AQUARIUM FEED 13', check: 'oEmbed 404 — video gone' },
  { node: 40, id: 'h8O0UXsL7uk', name: 'AQUARIUM FEED 17', check: 'oEmbed 403 — embedding disabled by the owner' },
  { node: 41, id: '0FBiyFpV__g', name: 'AQUARIUM FEED 18', check: 'oEmbed 401 — embedding disabled by the owner' },
  { node: 49, id: 'UpwNqncnqTE', name: 'AQUARIUM FEED 26', check: 'oEmbed 403 — embedding disabled by the owner' },
];

// The 6 feeds deleted in round 2 (2026-11-15 ~23:55, Merlin's words:
// "there are still feeds that show a black screen, not a scene").
// They passed YouTube oEmbed (200) when round 1 checked them, but they
// read BLACK on his phone — a black screen is not a scene, so they go.
// Kept here so the deletion is auditable and the test can pin that none
// of these ever comes back.
export const DELETED_BLACK_NODES = [
  { node: 4, id: '3n-5EA9augs', name: 'TEXAS WILDLIFE', check: 'oEmbed 200 but black on his phone — deleted round 2 by his order' },
  { node: 9, id: 'qHXFLsnKDq0', name: 'MOUNTAIN STREAM', check: 'oEmbed 200 but black on his phone — deleted round 2 by his order' },
  { node: 16, id: '3szkFHfr6sA', name: 'WOLONG PANDA GROVE', check: 'oEmbed 200 but black on his phone — deleted round 2 by his order' },
  { node: 30, id: 'g6wxYiESkE4', name: 'AQUARIUM FEED 07', check: 'oEmbed 200 but black on his phone — deleted round 2 by his order' },
  { node: 45, id: 'ZrePsYz4c6g', name: 'AQUARIUM FEED 22', check: 'oEmbed 200 but black on his phone — deleted round 2 by his order' },
  { node: 47, id: '-Vck0hn-zqk', name: 'AQUARIUM FEED 24', check: 'oEmbed 200 but black on his phone — deleted round 2 by his order' },
];

export const USER_FEEDS_LS_KEY = 'aquarium:user-feeds:v1';

// A node is a user feed when it carries origin 'user' (Supabase rows
// and localStorage backup entries both carry it). Built-ins carry
// origin 'builtin' or no origin at all (legacy rows).
export function isUserFeed(node) {
  return !!node && node.origin === 'user';
}

// YouTube ID out of any URL a visitor might paste (watch, youtu.be,
// shorts, live, embed). Returns null for anything unrecognizable.
export function extractYouTubeID(url) {
  if (typeof url !== 'string') return null;
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/|shorts\/))([\w-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

// Merge law — the rotation the page shows.
//
//   builtin        the 34 live built-ins above (the fallback).
//   dbRows         rows from Supabase nexus_nodes, or null when the
//                  database did not answer / came back empty.
//   localUserFeeds user feeds from the localStorage backup.
//
// - The database is the source of truth when it answers: its rows
//   (built-ins + user feeds, in created_at order) are the rotation.
//   Local-backup user feeds missing from the database are APPENDED —
//   a user feed is never dropped from view.
// - When the database does not answer, the rotation is the built-ins
//   PLUS the local-backup user feeds — user feeds survive an outage.
// - Duplicates by id collapse (first occurrence wins); the deleted
//   dead and black-screen ids can never re-enter through this merge
//   (they are in neither input by construction).
export function mergeNodes({ builtin, dbRows, localUserFeeds }) {
  const base = Array.isArray(dbRows) && dbRows.length > 0 ? dbRows : builtin;
  const userFeeds = (Array.isArray(localUserFeeds) ? localUserFeeds : []).filter(isUserFeed);
  const seen = new Set();
  const out = [];
  for (const node of [...base, ...userFeeds]) {
    if (!node || typeof node.id !== 'string' || seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

// localStorage backup of user-added feeds — the permanence backstop so
// a user feed survives even if the database is unreachable. No-ops
// outside a browser (tests, server render).
export function loadUserFeedsBackup() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(USER_FEEDS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUserFeed) : [];
  } catch {
    return [];
  }
}

export function saveUserFeedsBackup(feeds) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const userFeeds = (Array.isArray(feeds) ? feeds : []).filter(isUserFeed);
    window.localStorage.setItem(USER_FEEDS_LS_KEY, JSON.stringify(userFeeds));
  } catch {
    // A full or blocked store must never break the page.
  }
}
