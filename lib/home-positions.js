// lib/home-positions.js
// The god-tower constellation lives in its OWN field — close enough to
// spawn that the towers' ad panels read clearly from the spawn viewpoint
// (Merlin, 2026-09-30: spawn must be in view of the ads), still separate
// from the central hub where users spawn, the 10 satellites orbit, and the
// bike parks.
//
// One tower satellite per god-menu category (Merlin, 2026-09-30: "just one
// for each of the categories in the menu"), ringed around the field center
// in GOD_MENUS order.

import { CONSTELLATION_CENTER } from './hub-layout.js';
import { GOD_MENUS } from './god-menus.js';

const CC = CONSTELLATION_CENTER;
const at = (dx, dy, dz) => [CC.x + dx, CC.y + dy, CC.z + dz];

export const ORBIT_RADIUS = 40;

/** The 10 god-tower satellites: { god, pos }, one per menu category. */
export const GOD_TOWER_SPOTS = GOD_MENUS.map((m, i) => ({
  god: m.god,
  pos: at(
    Math.sin((i * Math.PI * 2) / 10) * ORBIT_RADIUS,
    0,
    Math.cos((i * Math.PI * 2) / 10) * ORBIT_RADIUS
  ),
}));

/** Convenience: god name → position array. */
export const GOD_TOWER_POS = Object.fromEntries(
  GOD_TOWER_SPOTS.map((s) => [s.god, s.pos])
);

// Legacy reference point (portal-gate docs) — a position in the tower
// field, not a tower itself.
export const BABEL_POS = at(Math.sin((Math.PI * 7) / 10) * ORBIT_RADIUS, 10, Math.cos((Math.PI * 7) / 10) * ORBIT_RADIUS);

// Merlin's seat — above the field, apart from every cluster.
export const ARTEMIS_POS = [CC.x, CC.y + 65, CC.z];

/** Where the god-tower constellation lives (re-export for convenience). */
export { CONSTELLATION_CENTER };
