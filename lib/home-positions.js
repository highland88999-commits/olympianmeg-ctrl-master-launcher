// lib/home-positions.js
// Where the god towers + named anchors live in the hub scene — one tower
// per menu (was ten when this file was written, 2026-09-30; the count
// follows GOD_MENUS, so 12 after HADES and 24 after the nether-realms
// homes landed 2026-11-12).
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

// Inside the planet lanes (195–231) with real clearance — the tower
// band (TOWER_ORBIT_RADIUS + 22) must stay inside the innermost
// planet's flight surface (195 − (11.8 hull + 1.8 pad) = 181.4), per
// tests/hub-travel.test.js. History (Merlin, 2026-10-20): ring made
// bigger when the satellites grew 1.5×, then bigger again the same
// day — 94 → 110 — when the satellites grew once more; expansion pass
// later that day: satellites doubled to 11.8, lanes out to 84–164,
// tower ring 110 → 190 so the radial order satellites → towers →
// planets → system rings holds with real clearance).
// FINAL MODEL, later the same day (Merlin, vocabulary clarified): the
// towers are his SATELLITES — they move back IN to 110 and double in
// size (group scale 1.6 in components/GodTower.jsx, so the ad spaces,
// number badges and name plates grow with them), while the god orbs —
// his PLANETS — move OUT past them to lanes 195–231 (lib/god-orbits.js),
// in line with Mars. 2026-11-13 (Merlin: "move the god towers out
// further, enough space for them to get by"): the ring moves OUT to
// 150 — at 110 the 24 towers (30.3 wide on 28.7 centres) overlapped
// each other with no space between them at all. At 150 the chord is
// 39.1, leaving ~8.8 of clear space between adjacent tower boxes,
// and 150 is the largest radius that keeps the tower band
// (150 + 22 = 172) clear of the planet lanes. 2026-11-13 later the
// same night (Merlin: "move the billboards further out ... enough
// space for users to easily pass between them", "perfect the
// geometry"): the ring moves OUT to 159.11 and the towers stop
// spinning, holding a fixed yaw square to the ring with oriented
// box colliders (lib/tower-collider.js). At 159.11 the chord is
// 41.54 and the clear gap between adjacent tower boxes is an even
// 8.00 (5.60 spare for the flyer, 2.00 for the bike). The planet
// lanes stay at 195–231 — they cannot move out (planet 23 would
// hit Mars) — and the tower boxes' outer corner (176.68) stays
// 3.62 clear of the innermost planet lane's accent ring (180.30).
// Nothing but Earth (below, exempt) sits between the loading spot
// and the satellites' physical inner edge (159.11 − 16.77 face
// plane ≈ 142.34).
export const TOWER_ORBIT_RADIUS = 159.11;
// Half-step phase: no tower sits on the ±Z axes. The bike parks dead-ahead
// on -Z and must never spawn inside a tower collider.
const TOWER_PHASE = Math.PI / GOD_MENUS.length; // 18°

/** One god-tower satellite per menu: { god, pos }. */
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
