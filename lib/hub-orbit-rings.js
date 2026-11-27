// lib/hub-orbit-rings.js
// THE HUB'S ORBIT RING SYSTEM (Merlin, Nov 27, 2026 — red-pen drawing
// + confirmation the same day):
//
//   "the first circle I drew in the video represents the hub. Each new
//    ring is a ring of user created planets or planets from us."
//
// The reading, stated so Merlin can correct it in one word:
//   - The FIRST (innermost) circle IS the hub as it is right now — the
//     hub stays exactly as it is, at the centre. Nothing about the hub
//     moves to fit the rings; the rings fit around it.
//   - EACH FURTHER ring is a ring of PLANETS — user-created planets AND
//     house-made planets alike. Both kinds live on the rings; no ring
//     is reserved for one kind or the other.
//   - The rings are CONCENTRIC PERFECT CIRCLES centred on the hub, and
//     their radii grow EXPONENTIALLY outward: r_n = r_0 x k^n.
//
// THE FACTOR k (Merlin corrects this with one number if it is wrong):
// measured off his drawing (still + g_24 frame — hand-drawn and wobbly,
// so these are rough): successive ring radii ≈ 90 / 230 / 490 / 700 px,
// ratios ≈ 2.6 / 2.1 / 1.4, geometric mean ≈ 2.0 — inside his stated
// "roughly 1.5–2x the one inside it". k = 2.
//
// THE BASE r_0: the hub's own outer edge — the outermost god lane
// (MAX_BAND_RADIUS, 231) plus the satellites' bulk (hull 11.8 +
// equatorial accent ring 2.48 + tube 0.42 = 14.7), so the first planet
// ring clears everything the hub is. r_1 = 491.4, r_2 = 982.8,
// r_3 = 1965.6 — the three rings of his drawing (hub + 3).
//
// PLACEMENT RULE (world-engine placement logic — this module IS it; no
// placement function existed before: house planets were hand-added to
// the PLANETS table in lib/god-orbits.js and user-created worlds got a
// seed but no hub position): a new planet's distance D from the hub
// centre decides its ring — the ring whose radius is nearest to D on a
// log scale, i.e. boundaries at the geometric midpoints between
// successive rings. Near planets join inner rings, far planets outer
// rings, so the rings stay ordered by distance. The planet keeps its
// own direction from the hub; only its distance is snapped to the
// ring. Existing worlds are NEVER re-placed by this rule — it runs
// only when a planet is added (house: when a PLANETS row is added;
// world engine: when a user-created world is granted a hub orbit).
//
// RENDERING: the rings are drawn as children of the billboarded
// assembly in components/GodOrbitRings.jsx, so they inherit the
// perfect-circle billboard (camera-facing plane) — a flat horizontal
// ring viewed at an angle reads as an ellipse (Part 13 half 1), and
// these rings must read as circles at every camera angle.
// Far plane is 5000 (components/HomeScene.jsx, raised from 2000 for the
// exponential rings): ring 3's far arc (1965.6) stays whole until the camera
// is ~3034 units out, ring 2's (~982.8) until ~4017 — covers any sane
// scroll-out. Depth precision: near 0.1 / far 5000 is still fine for a
// 24-bit depth buffer here (no coplanar surfaces at distance).
//
// Pure data + math — no imports with side effects, no I/O: safe
// everywhere, including node tests.

import { MAX_BAND_RADIUS, ORBIT_CENTER, dist3 } from './god-orbits.js';

/** Exponential growth factor: each ring is k x the one inside it. */
export const ORBIT_RING_GROWTH = 2;

/** Satellite bulk beyond its lane: hull 11.8 + accent ring 2.48 + tube 0.42. */
export const SATELLITE_BULK = 14.7;

/** The hub's outer edge (r_0): outermost god lane + satellite bulk. */
export const HUB_EDGE_RADIUS = MAX_BAND_RADIUS + SATELLITE_BULK; // 245.7

/** How many planet rings the drawing shows (hub + 3). */
export const HUB_ORBIT_RING_COUNT = 3;

/**
 * Radius of planet ring n (n >= 1): r_n = HUB_EDGE_RADIUS x k^n.
 * Ring 0 is the hub itself (radius HUB_EDGE_RADIUS) — not a planet ring.
 */
export function hubOrbitRingRadius(n) {
  return HUB_EDGE_RADIUS * Math.pow(ORBIT_RING_GROWTH, n);
}

/** The drawn planet rings, innermost first: [491.4, 982.8, 1965.6]. */
export const HUB_ORBIT_RING_RADII = Array.from(
  { length: HUB_ORBIT_RING_COUNT },
  (_, i) => hubOrbitRingRadius(i + 1)
);

/**
 * Boundary between planet ring n and ring n+1 (n >= 1): the geometric
 * midpoint sqrt(r_n x r_{n+1}) — the log-scale halfway point, so a
 * planet joins whichever ring its distance is nearest to in ratio.
 */
export function hubOrbitRingBoundary(n) {
  return HUB_EDGE_RADIUS * Math.pow(ORBIT_RING_GROWTH, n + 0.5);
}

/**
 * Which planet ring a distance D from the hub centre belongs to.
 * Open-ended: distances beyond the drawn rings keep counting outward
 * (ring 4, 5, ...) — the ring exists mathematically even before it is
 * drawn. Anything inside the first boundary joins ring 1: nothing new
 * may live inside the hub itself.
 */
export function ringIndexForDistance(d) {
  if (!Number.isFinite(d) || d <= 0) return 1;
  let n = 1;
  while (d > hubOrbitRingBoundary(n)) n += 1;
  return n;
}

/** Distance of a {x, y, z} centre from the hub centre. */
export function distanceFromHub(center) {
  return dist3(center, ORBIT_CENTER);
}

/**
 * Place a new planet onto its ring: given the planet's desired centre
 * (from either source — a user-created world or a house-made one),
 * return the ring it joins and the centre snapped onto that ring.
 * Only the distance changes — the planet keeps its own direction from
 * the hub. Pure: the input centre is never mutated.
 */
export function placePlanetOnRing(center) {
  const distance = distanceFromHub(center);
  const ringIndex = ringIndexForDistance(distance);
  const radius = hubOrbitRingRadius(ringIndex);
  const dx = center.x - ORBIT_CENTER.x;
  const dy = center.y - ORBIT_CENTER.y;
  const dz = center.z - ORBIT_CENTER.z;
  const len = Math.hypot(dx, dy, dz);
  // A planet exactly at the hub centre has no direction — face it +X.
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const uz = len > 0 ? dz / len : 0;
  return {
    ringIndex,
    radius,
    distance,
    center: {
      x: ORBIT_CENTER.x + ux * radius,
      y: ORBIT_CENTER.y + uy * radius,
      z: ORBIT_CENTER.z + uz * radius,
    },
  };
}

// --- Camera-facing (billboard) blend -------------------------------------
// The orbit rings must read as PERFECT CIRCLES when scrolled out (Part 13
// half 1): a flat horizontal ring viewed at an angle projects as an
// ellipse — at 25° elevation the mean god lane reads 2.34x wider than
// tall (projection math, tests/hub-orbit-rings.test.mjs). So the whole
// ring assembly tilts to face the camera — but ONLY once the camera is
// scrolled out. Inside the hub the layout stays exactly as it is today
// (horizontal, spawn view untouched, drop targets and flight lanes keep
// their analytic home positions), and the assembly morphs smoothly
// between the two as the camera flies out.

/** Inside this distance from the hub centre: today's horizontal layout. */
export const ORBIT_RING_BILLBOARD_NEAR = 250;

/** At or beyond this distance: fully camera-facing (perfect circle). */
export const ORBIT_RING_BILLBOARD_FAR = 700;

/**
 * Billboard blend for a camera distance from the hub centre: 0 =
 * horizontal (home), 1 = fully camera-facing, smoothstep between.
 */
export function orbitRingBillboardBlend(distance) {
  if (!Number.isFinite(distance) || distance <= ORBIT_RING_BILLBOARD_NEAR) return 0;
  if (distance >= ORBIT_RING_BILLBOARD_FAR) return 1;
  const t =
    (distance - ORBIT_RING_BILLBOARD_NEAR) /
    (ORBIT_RING_BILLBOARD_FAR - ORBIT_RING_BILLBOARD_NEAR);
  return t * t * (3 - 2 * t);
}

// --- PART 13 SECOND REFINEMENT + PART 14 (Merlin, Nov 27, 2026) --------
// (A) THE AXIS IS HORIZONTAL. The rings sit in the flat horizontal
// plane through the hub centre (XZ, y = ORBIT_CENTER.y) — a flat
// disc-like arrangement, the axis around the hub for ALL layers; the
// rings ARE the layers. Placement below snaps every new item onto
// that plane (placeOrbitItem flattens y), unlike placePlanetOnRing
// above, which preserves a planet's own 3D direction (kept untouched
// for the house planets, which are never re-placed).
//
//   HOW HORIZONTAL + PERFECT-CIRCLE BOTH HOLD: a flat horizontal ring
//   viewed at an angle DOES read as an ellipse — that is perspective,
//   not geometry (Part 13 test: 2.34x wider than tall at 25°
//   elevation, and worse lower down), so a purely horizontal ring
//   cannot also read as a perfect circle from a low camera. The fix
//   chosen keeps BOTH rules by splitting them across distance, as
//   Part 13 already did: at the hub (blend 0) the assembly is exactly
//   horizontal — the axis as Merlin drew it; scrolled out (blend 1,
//   250–700 units) the same assembly tilts to face the camera so
//   every ring reads as a perfect circle. The LABELS never tilt or
//   squash either way: ring items wear drei Billboard labels, which
//   always face the camera upright, so names stay readable at every
//   angle. Nothing here picks one rule over the other silently — the
//   blend is the reconciliation, and it is the Part 13 mechanism,
//   unchanged.
//
//   THE LOOK (Treasure Planet reference — Reesecandy2003, DeviantArt:
//   green gas-giant wearing a bright glowing green ring + a dark
//   brown ring): the glow is the look, the tilt in that picture is
//   NOT the orientation. GodOrbitRings draws each planet ring with a
//   bright green glow torus (#39ff88) beside its gold core, and every
//   item added to the hub wears a thin green accent ring — the same
//   glowing-ring read, on the horizontal axis.
//
// (B) RINGS ARE MADE AS RINGS FILL UP. No ring had a capacity before
// this — a ring could hold any number of planets. Capacity is now
// ORBIT_RING_CAPACITY = 12 items per ring (Merlin corrects it with
// one number): twelve sit 30° apart, evenly spaced and readable.
// When a ring reaches 12, the next exponential ring outward is made
// and new items go there. A ring never overflows; it spawns the next
// ring. Distance still decides the STARTING ring (nearest on a log
// scale, as in Part 13); a full starting ring spills OUTWARD to the
// next ring with space — never inward, never onto the full one.
//
// (C) WHAT ORBITS: planets AND every other user-created thing the
// World Engine can place. The kinds below are exactly the
// world_engine_assets categories (lib/auction/helpers.js
// AUCTION_CATEGORIES: world, weather, character, creature, vehicle,
// object, weapon, asset_link) plus 'planet' for house-made planets.
// A weather creation rides as a labelled orb like the rest — it is a
// creation, and the button is offered in every forge sector alike.
//
// STORAGE: there is no server table for hub orbit items (supabase is
// out of scope for this round), so Add to Hub persists to localStorage
// (HUB_ORBIT_ITEMS_KEY) on this device/browser, and GodOrbitRings
// reads it — the item is visible on the hub's rings on the next hub
// visit, and immediately via the hub-orbit-items-changed event. A
// server table (so the rings follow the user across devices) is a
// coordinator call, not snuck in here.

/** The ring plane: flat horizontal (XZ) through the hub centre. */
export const ORBIT_RING_PLANE = 'horizontal';

/** Planets/items per ring before the next ring outward is made. */
export const ORBIT_RING_CAPACITY = 12;

/** Every kind of user-created thing the World Engine can place. */
export const ORBITABLE_KINDS = [
  'world',
  'planet',
  'character',
  'creature',
  'vehicle',
  'weapon',
  'weather',
  'object',
  'asset_link',
];

/**
 * Normalise a world_engine_assets category (or 'planet') to an
 * orbitable kind, or null when the thing is not meant to orbit.
 */
export function normalizeOrbitKind(category) {
  const k = String(category || '').trim().toLowerCase();
  return ORBITABLE_KINDS.includes(k) ? k : null;
}

/** localStorage key for the user's hub orbit items. */
export const HUB_ORBIT_ITEMS_KEY = 'hub-orbit-items-v1';

/** Event fired (on window) whenever the stored items change. */
export const HUB_ORBIT_ITEMS_CHANGED_EVENT = 'hub-orbit-items-changed';

function hubStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  } catch { /* no storage — callers fall back to [] */ }
  return null;
}

// Small deterministic hash (FNV-1a) — spreads same-ring items around
// the circle so two items never share an angle by construction.
function hash01(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** How many items already sit on each ring: { ringIndex: count }. */
export function ringCounts(items) {
  const counts = {};
  for (const it of Array.isArray(items) ? items : []) {
    const n = Number(it && it.ringIndex);
    if (Number.isFinite(n) && n >= 1) counts[n] = (counts[n] || 0) + 1;
  }
  return counts;
}

/**
 * Which ring a distance D belongs to once capacity is honoured: the
 * Part 13 distance ring, spilling OUTWARD while that ring is full.
 */
export function ringIndexForDistanceWithCapacity(d, counts) {
  let n = ringIndexForDistance(d);
  const c = counts || {};
  while ((c[n] || 0) >= ORBIT_RING_CAPACITY) n += 1;
  return n;
}

/**
 * Place one orbitable item onto the horizontal rings.
 * `item`: { id, kind|category, name?, center? (desired hub position),
 *   source? }. `existingItems`: items already on the rings (their
 * ringIndex values are the occupancy). Pure: nothing is mutated.
 * Returns null when the kind is not orbitable. Otherwise returns the
 * stored entry: { id, kind, name, ringIndex, radius, angle, center,
 * source, spawnedNewRing } — center on the horizontal plane
 * (y = ORBIT_CENTER.y), angle evenly slotted 30° apart around the
 * ring so items never stack on one another.
 */
export function placeOrbitItem(item, existingItems) {
  if (!item || typeof item !== 'object') return null;
  const kind = normalizeOrbitKind(item.kind || item.category);
  if (!kind) return null;
  const id = String(item.id || '').trim();
  if (!id) return null;
  const counts = ringCounts(existingItems);
  const desired = item.center ? distanceFromHub(item.center) : hubOrbitRingRadius(1);
  const ringIndex = ringIndexForDistanceWithCapacity(desired, counts);
  const radius = hubOrbitRingRadius(ringIndex);
  const slot = counts[ringIndex] || 0;
  const step = (Math.PI * 2) / ORBIT_RING_CAPACITY;
  const angle = slot * step + hash01(id) * step * 0.4;
  return {
    id,
    kind,
    name: String(item.name || kind),
    ringIndex,
    radius,
    angle,
    center: {
      x: ORBIT_CENTER.x + Math.cos(angle) * radius,
      y: ORBIT_CENTER.y,
      z: ORBIT_CENTER.z + Math.sin(angle) * radius,
    },
    source: String(item.source || ''),
    spawnedNewRing: (counts[ringIndex] || 0) === 0,
  };
}

/**
 * Add one item to a list of hub orbit items (pure). Dedups by id:
 * re-adding an item already on the hub returns its existing entry
 * with added: false — no duplicate, no new ring.
 */
export function addOrbitItem(existingItems, item) {
  const list = Array.isArray(existingItems) ? existingItems.slice() : [];
  const id = String((item && item.id) || '').trim();
  if (id) {
    const found = list.find((e) => e && e.id === id);
    if (found) return { items: list, placed: found, added: false, spawnedNewRing: false };
  }
  const placed = placeOrbitItem(item, list);
  if (!placed) return { items: list, placed: null, added: false, spawnedNewRing: false };
  list.push(placed);
  return { items: list, placed, added: true, spawnedNewRing: placed.spawnedNewRing };
}

/**
 * The ring radii to draw: the three Part 13 rings, plus any further
 * ring an item has actually landed on — a ring beyond 3 only appears
 * once fill-up creates it.
 */
export function drawnHubOrbitRingRadii(items) {
  let maxRing = HUB_ORBIT_RING_COUNT;
  for (const it of Array.isArray(items) ? items : []) {
    const n = Number(it && it.ringIndex);
    if (Number.isFinite(n) && n > maxRing) maxRing = n;
  }
  return Array.from({ length: maxRing }, (_, i) => hubOrbitRingRadius(i + 1));
}

function isStoredOrbitItem(e) {
  return (
    e && typeof e === 'object' &&
    typeof e.id === 'string' && e.id.length > 0 &&
    Number.isFinite(Number(e.ringIndex)) && Number(e.ringIndex) >= 1 &&
    e.center && Number.isFinite(Number(e.center.x)) &&
    Number.isFinite(Number(e.center.y)) && Number.isFinite(Number(e.center.z))
  );
}

/** Read the user's hub orbit items from localStorage (never throws). */
export function loadHubOrbitItems() {
  try {
    const store = hubStorage();
    if (!store) return [];
    const parsed = JSON.parse(store.getItem(HUB_ORBIT_ITEMS_KEY) || 'null');
    return Array.isArray(parsed) ? parsed.filter(isStoredOrbitItem) : [];
  } catch { return []; }
}

/** Write the hub orbit items and notify hub listeners (never throws). */
export function saveHubOrbitItems(items) {
  const list = Array.isArray(items) ? items : [];
  try {
    const store = hubStorage();
    if (store) store.setItem(HUB_ORBIT_ITEMS_KEY, JSON.stringify(list));
  } catch { /* storage full/unavailable — the in-memory list still stands */ }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(HUB_ORBIT_ITEMS_CHANGED_EVENT, { detail: { items: list } }));
    }
  } catch { /* listeners are best-effort */ }
  return list;
}

/**
 * Add to Hub (the button behaviour): send one item to the hub's
 * rings under the Part 13 placement rules. No dialog, no extra step.
 * Returns { items, placed, added, spawnedNewRing }.
 */
export function addItemToHub(item) {
  const existing = loadHubOrbitItems();
  const result = addOrbitItem(existing, item);
  if (result.added) saveHubOrbitItems(result.items);
  return result;
}

/** The stored hub entry for an id, or null when it is not on the hub. */
export function hubOrbitItemFor(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  return loadHubOrbitItems().find((e) => e.id === key) || null;
}
