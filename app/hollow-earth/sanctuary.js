// app/hollow-earth/sanctuary.js — SAFE ZONES + THE SANCTUARY LAW.
//
// Phase 2c (Merlin, Nov 24 ~10:06): "Make sure there are safe
// zones stationed well distanced throughout hollow earth and
// wrap the sanctuary boundaries (create a graphic to wrap the
// borders in) the ring that acts as the boundary for a safe
// zone I mean" + "And any buildings, objects or structures...
// same thing".
//
// Before this phase there was exactly ONE sanctuary: The Haven
// (0, 155, r 28) — the `inBase` flag in spawns.js / zone.js /
// page.jsx. This module generalises that law without changing
// it: the same flag, the same behaviour (no hunt, no attack, no
// aura damage, no hazard/DoT/pool damage inside), now true
// inside ANY zone in SAFE_ZONES — and inside any ring in a
// caller-supplied ring list (the structure rings zone.js builds
// from the world's landmarks, which this module cannot see:
// the landmark table lives in data.js, and data.js imports
// spawns.js, so importing it here would be a cycle).
//
// THE LAW (unchanged from The Haven, extended to every zone):
//   - no monster spawns inside a sanctuary (spawnField +
//     respawnMonster honour it — the old Haven-only exclusion
//     is now the whole list);
//   - a monster hunting the player drops the chase at the
//     boundary (stepMonster's inBase early return — the flag
//     the page feeds in now means "inside any sanctuary");
//   - no aura streak lands on a target standing inside a
//     sanctuary (player via the inBase return; monster prey via
//     the prey guard in stepMonster);
//   - no hit / hazard / DoT / pool damage lands inside
//     (page.jsx damageHunter + the frame-loop guards);
//   - no elemental rain falls inside (rainFor's inBase check);
//   - old age still kills inside (the life line is not damage
//     — the Haven law already said so, and it stays said).
//   - KORUS IS THE ONE EXEMPTION: his telegraphed blasts are
//     his own mechanics (the elemental-aura.js exemptions
//     pattern — Korus is exempt from auras and prey the same
//     way), so his hits bypass sanctuary in damageHunter.
//     The throne court ring is a real sanctuary against the
//     field, but the boss himself can still reach you there —
//     a safe zone at the boss's feet must never make the
//     finale unlosable. The court stays dangerous by design.
//
// PLACEMENT (worker's call — Merlin ordered "well distanced",
// not the numbers): 14 zones, one per habitat band plus the
// outer anchors, so every band holds a refuge and the rim is
// covered too. The Haven stays exactly where it was (0, 155,
// r 28). The other thirteen are r 24, each sitting on its
// band's ground: the seven band hearts (acid ooze-pool,
// fire ember-spire, lightning storm-pylon, poison mire-arch,
// shadow outer anchor, frost outer anchor, mountain
// peak-shrine) plus the outer ring (sand, poison, mountain,
// lightning, shadow, sand again — the far anchors). Measured
// on a 10 m grid over the hunted disc (deck r <= 540, the
// spawn field's edge): the worst point in the world is
// 276 m from the nearest zone boundary (the south-west rim,
// -240,-480), the mean is 90 m. At the Hollow Earth walk
// speed (HE_WALK_SPEED 10 m/s) that is at most ~28 s to
// safety from the single worst point, ~9 s on average —
// "well distanced" in both directions: never clustered, never
// out of reach. Nearest-neighbour spacing between zone
// centres runs 103–367 m. The far side past the rim (deck
// r > 540, toward the antipode) holds no spawn field by
// construction, so it is outside the measurement.
//
// Pure module: no THREE, no DOM, no imports at all — spawns.js
// can import it without a cycle, and the tests pin the table,
// the predicates, and the coverage measurement.

/* Sanctuary gold — the Haven's own ward colour (landmarks.js
 * 'haven': pale pillars + a gold dome on the r 28 boundary).
 * The ring graphic wears it as its edge lines (sanctuary-
 * ring.js); every zone's band wears its own element's colour. */
export const SANCTUARY_GOLD = 0xe8c87a;

/* The fourteen safe zones. Shape { x, z, r, name, element } —
 * the Haven entry keeps the old SAFE_BASE shape ({ x, z, r })
 * so spawns.js can re-export it unchanged. `element` is the
 * band the zone stands in ('gold' for The Haven itself — its
 * ring wears sanctuary gold, not a band colour). */
export const SAFE_ZONES = Object.freeze([
  Object.freeze({ x: 0, z: 155, r: 28, name: 'The Haven', element: 'gold' }),
  Object.freeze({ x: -160, z: 40, r: 24, name: 'Acid Hollow', element: 'acid' }),
  Object.freeze({ x: 160, z: -60, r: 24, name: 'Ember Rest', element: 'fire' }),
  Object.freeze({ x: -70, z: -170, r: 24, name: 'Storm Calm', element: 'lightning' }),
  Object.freeze({ x: 180, z: 110, r: 24, name: 'Spore Sanctuary', element: 'poison' }),
  Object.freeze({ x: -430, z: -240, r: 24, name: 'Gloom Refuge', element: 'shadow' }),
  Object.freeze({ x: -410, z: 290, r: 24, name: 'Frost Haven', element: 'frost' }),
  Object.freeze({ x: 210, z: -150, r: 24, name: 'Mountain Watch', element: 'mountain' }),
  Object.freeze({ x: 140, z: 460, r: 24, name: 'Dune Rest', element: 'sand' }),
  Object.freeze({ x: 420, z: 260, r: 24, name: 'East Reach', element: 'poison' }),
  Object.freeze({ x: 400, z: -290, r: 24, name: 'Storm Heights', element: 'mountain' }),
  Object.freeze({ x: 60, z: -470, r: 24, name: 'Southwatch', element: 'lightning' }),
  Object.freeze({ x: -480, z: 60, r: 24, name: 'West Gloom', element: 'shadow' }),
  Object.freeze({ x: -160, z: 430, r: 24, name: 'North Dunes', element: 'sand' }),
]);

/* The Haven is SAFE_ZONES[0] — the realm's one return point
 * (death + log-off + spawn-to-base all land here, unchanged). */
export const HAVEN_ZONE = SAFE_ZONES[0];

/** True when (x, z) stands inside the given zone/ring ({ x, z, r }). The boundary itself counts as inside. */
export function isInsideZone(x, z, zone) {
  if (!zone) return false;
  return Math.hypot(x - zone.x, z - zone.z) <= zone.r;
}

/** True when (x, z) stands inside ANY of the fourteen safe zones. */
export function isInSanctuary(x, z) {
  for (const zone of SAFE_ZONES) {
    if (isInsideZone(x, z, zone)) return true;
  }
  return false;
}

/** The safe zone (x, z) stands inside, or null. First match wins — zones never overlap, so there is at most one. */
export function sanctuaryAt(x, z) {
  for (const zone of SAFE_ZONES) {
    if (isInsideZone(x, z, zone)) return zone;
  }
  return null;
}

/** True when (x, z) stands inside The Haven only — the trade lives here, and only here. */
export function isInHaven(x, z) {
  return isInsideZone(x, z, HAVEN_ZONE);
}

/**
 * True when (x, z) stands inside any ring in a caller-supplied
 * list — the structure rings zone.js builds from the world's
 * landmarks ({ x, z, r } each, same shape as a zone). A null or
 * empty list never matches.
 */
export function isInsideAnyRing(x, z, rings) {
  if (!Array.isArray(rings)) return false;
  for (const ring of rings) {
    if (ring && isInsideZone(x, z, ring)) return true;
  }
  return false;
}

/** The ring in the list (x, z) stands inside, or null. */
export function ringAt(x, z, rings) {
  if (!Array.isArray(rings)) return null;
  for (const ring of rings) {
    if (ring && isInsideZone(x, z, ring)) return ring;
  }
  return null;
}

/**
 * Coverage measurement: the worst and mean distance from any
 * point on a grid over the hunted disc (deck r <= discR) to
 * the nearest zone BOUNDARY (0 inside a zone). `stepM` is the
 * grid step; `zones` defaults to SAFE_ZONES so the test pins
 * the shipped table, not a copy of it. Pure — the STATE.md
 * numbers come from this function, not from a hand count.
 */
export function measureSanctuaryCoverage(zones = SAFE_ZONES, discR = 540, stepM = 10) {
  let worstM = -1;
  let worstX = 0;
  let worstZ = 0;
  let sum = 0;
  let n = 0;
  for (let x = -discR; x <= discR; x += stepM) {
    for (let z = -discR; z <= discR; z += stepM) {
      if (Math.hypot(x, z) > discR) continue;
      let best = Infinity;
      for (const zone of zones) {
        best = Math.min(best, Math.hypot(x - zone.x, z - zone.z) - zone.r);
      }
      if (best > worstM) { worstM = best; worstX = x; worstZ = z; }
      sum += Math.max(0, best);
      n++;
    }
  }
  return {
    worstM: Math.round(worstM * 10) / 10,
    worstX,
    worstZ,
    meanM: Math.round((sum / Math.max(1, n)) * 10) / 10,
    zones: zones.length,
    discR,
  };
}
