// lib/home-positions.js
// Where the ten god towers + named anchors live in the hub scene.
//
// Merlin, 2026-09-30: spawn must be IN THE MIDDLE of the ten Zeus-style
// category towers, with the ads visible from spawn. So the towers ring the
// spawn point itself (ORBIT_CENTER) — one tower per god menu, each carrying
// the full Stake ad inventory on four sides, the whole tower slowly
// rotating, so the ads read from spawn in every direction. The orbiting
// satellite constellation stays where it is, inside the tower ring; the
// parked TRON bike sits dead-ahead (-Z) just inside the ring, on a
// tower-free axis.
//
// ARTEMIS_POS — Merlin's seat: a sanctum high above the tower ring, apart
// from every cluster. BABEL_POS — legacy reference point (portal-gate docs).

import { ORBIT_CENTER } from './god-orbits.js';
import { GOD_MENUS } from './god-menus.js';

// Just outside the outermost satellite ring (65.8), so the ten towers crown
// the hub without crowding the satellites or the spawn view.
export const TOWER_ORBIT_RADIUS = 76;
// Half-step phase: no tower sits on the ±Z axes. The bike parks dead-ahead
// on -Z and must never spawn inside a tower collider.
const TOWER_PHASE = Math.PI / GOD_MENUS.length; // 18°

/** The 10 god-tower satellites: { god, pos }, one per menu category. */
export const GOD_TOWER_SPOTS = GOD_MENUS.map((m, i) => {
  const a = (i / GOD_MENUS.length) * Math.PI * 2 + TOWER_PHASE;
  return {
    god: m.god,
    pos: [
      ORBIT_CENTER.x + Math.sin(a) * TOWER_ORBIT_RADIUS,
      ORBIT_CENTER.y,
      ORBIT_CENTER.z + Math.cos(a) * TOWER_ORBIT_RADIUS,
    ],
  };
});

/** Convenience: god name → position array. */
export const GOD_TOWER_POS = Object.fromEntries(
  GOD_TOWER_SPOTS.map((s) => [s.god, s.pos])
);

// Legacy reference point (portal-gate docs) — a position in the tower
// field, not a tower itself.
export const BABEL_POS = [
  ORBIT_CENTER.x + Math.sin((Math.PI * 7) / 10) * TOWER_ORBIT_RADIUS,
  ORBIT_CENTER.y + 10,
  ORBIT_CENTER.z + Math.cos((Math.PI * 7) / 10) * TOWER_ORBIT_RADIUS,
];

// Merlin's seat — above the tower ring, apart from every cluster.
export const ARTEMIS_POS = [ORBIT_CENTER.x, ORBIT_CENTER.y + 65, ORBIT_CENTER.z];
