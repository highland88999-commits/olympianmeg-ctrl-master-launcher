// lib/portal-roster.js
// THE PORTAL ROSTER — the one derivation of "one portal for every
// program in the menu", shared by every surface that shows portals:
//   · the Portal Room page (app/portal-room/page.jsx) — server-side,
//     titles looked up in the en dictionary;
//   · the Concourse's Portals 3D panel (components/ConcoursePortals.jsx)
//     — client-side, titles looked up through the live i18n t().
// Both feed the same builder, so the two rooms can never disagree
// about which realms exist.
//
// The derivation (extracted from app/portal-room/page.jsx, where it
// lived inline): walk the satellite registry in order, skip the
// Portal Room itself, dedupe by route (the registry carries a known
// duplicate: 'planet-tech' sits in two sections on one route), and
// resolve each title/subtitle through the caller's lookups. Pure —
// no imports — so node tests exercise it directly against the real
// registry (tests/concourse-portals.test.mjs).

// Section display order for portal surfaces (the room's order).
export const SECTION_ORDER = [
  'SANCTUM',
  'GAMES',
  'OBSERVATORY',
  'AI PROGRAMS',
  'TOOLS',
  'UTILITIES',
  'THERAPY',
  'WISDOM',
  'SHOPPING',
];

// Per-section disc tints for the 3D hall. The shared swirl texture is
// painted warm-neutral (lib/portal-swirl.js); instanceColor multiplies
// it by these hues, so each realm family carries its own light.
export const SECTION_HUES = {
  SANCTUM: '#ffd98a', // molten gold — the inner shrine
  GAMES: '#7ef0c8', // arcade mint
  OBSERVATORY: '#8fd8ff', // telescope ice-blue
  'AI PROGRAMS': '#c9a2ff', // machine violet
  TOOLS: '#ffb37a', // forge orange
  UTILITIES: '#a8e6ff', // clear utility cyan
  THERAPY: '#ffc4dd', // calm rose
  WISDOM: '#ffe9a3', // parchment light
  SHOPPING: '#9dffb0', // market green
};

// Tint for any section the map does not name (defensive default).
export const DEFAULT_SECTION_HUE = '#b9a8ff';

// How many mini portals one wall of the 3D hall holds (6 × 7 grid).
export const WALL_PAGE_SIZE = 42;

// Build the roster. `satellites` is the registry array (entries with
// key/route/section); lookupTitle/lookupSubtitle map a satellite key
// to its display strings ('' or a falsy return means "no subtitle";
// a falsy title falls back to the key itself, as the room always did).
export function buildPortalRoster(satellites, lookupTitle, lookupSubtitle) {
  const seen = new Set();
  const list = [];
  for (const sat of satellites || []) {
    if (sat.key === 'portal-room') continue; // a room does not portal to itself
    if (seen.has(sat.route)) continue;
    seen.add(sat.route);
    list.push({
      key: sat.key,
      route: sat.route,
      section: sat.section,
      title: lookupTitle(sat.key) || sat.key,
      subtitle: lookupSubtitle(sat.key) || '',
    });
  }
  return list;
}

// Split a wall's items into pages of WALL_PAGE_SIZE (the last page
// may be short; an empty list yields no pages at all).
export function paginateWall(items, pageSize = WALL_PAGE_SIZE) {
  const pages = [];
  const list = items || [];
  for (let i = 0; i < list.length; i += pageSize) {
    pages.push(list.slice(i, i + pageSize));
  }
  return pages;
}

// Group a roster (or any filtered slice of one) by section, in
// SECTION_ORDER, dropping empty sections — the room's grouping.
export function groupBySection(programs) {
  const bySection = new Map();
  (programs || []).forEach((p) => {
    if (!bySection.has(p.section)) bySection.set(p.section, []);
    bySection.get(p.section).push(p);
  });
  return SECTION_ORDER.filter((s) => bySection.has(s)).map((s) => ({
    section: s,
    items: bySection.get(s),
  }));
}

// The chip filter the room and the panel share: section match plus a
// case-insensitive search across title, subtitle and key.
export function filterPortals(programs, { section = 'ALL', query = '' } = {}) {
  const q = (query || '').trim().toLowerCase();
  return (programs || []).filter((p) => {
    if (section !== 'ALL' && p.section !== section) return false;
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.subtitle || '').toLowerCase().includes(q) ||
      p.key.toLowerCase().includes(q)
    );
  });
}
