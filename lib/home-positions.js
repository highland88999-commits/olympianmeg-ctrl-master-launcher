// lib/home-positions.js
// The god-tower constellation (Zeus/Ares/Thoth/Argus/Medusa + Artemis) lives
// in its OWN distant field now — deliberately far from the central hub where
// users spawn, the 10 satellites orbit, and the bike parks (Merlin, 2026-09-30).
//
// From spawn the towers read small on the horizon: dramatic separation, but
// visible and travelable by flight or bike. Their relative ring layout is
// unchanged — only the field center moved.

import { CONSTELLATION_CENTER } from './hub-layout.js';

const CC = CONSTELLATION_CENTER;
const at = (dx, dy, dz) => [CC.x + dx, CC.y + dy, CC.z + dz];

export const ORBIT_RADIUS = 40;

export const ZEUS_POS = at(0, 0, ORBIT_RADIUS);
export const ARES_POS = at(Math.sin((Math.PI * 2) / 10) * ORBIT_RADIUS, 0, Math.cos((Math.PI * 2) / 10) * ORBIT_RADIUS);
export const THOTH_POS = at(Math.sin((Math.PI * 4) / 10) * ORBIT_RADIUS, 0, Math.cos((Math.PI * 4) / 10) * ORBIT_RADIUS);
export const ARGUS_POS = at(Math.sin((Math.PI * 6) / 10) * ORBIT_RADIUS, 0, Math.cos((Math.PI * 6) / 10) * ORBIT_RADIUS);
export const BABEL_POS = at(Math.sin((Math.PI * 7) / 10) * ORBIT_RADIUS, 10, Math.cos((Math.PI * 7) / 10) * ORBIT_RADIUS);
export const MEDUSA_POS = at(Math.sin((Math.PI * 8) / 10) * ORBIT_RADIUS, 15, Math.cos((Math.PI * 8) / 10) * ORBIT_RADIUS);
// Merlin's seat — above the distant field, apart from every cluster.
export const ARTEMIS_POS = [CC.x, CC.y + 65, CC.z];

/** Where the god-tower constellation lives now (re-export for convenience). */
export { CONSTELLATION_CENTER };
