// lib/jupiter2/profile.js — Jupiter 2 world constants (Merlin, Nov 15 ~01:11).
//
// Jupiter 2 follows the Earth 1 → Earth 2 successor pattern: a full
// walkable surface world, not a hub sphere. The user stands ON the
// cloud deck, INSIDE the storm at street level — wind, driving rain,
// lightning, reduced visibility — not looking at it from orbit.
// Procedural CGI only (the shared planet-cgi kit); no Tripo.
//
// Ground: a gently rolling cloud deck (seeded fbm, ±1.2 m), so the
// walker and the speeder both ride groundHeight(x, z). The sky is
// Jupiter's own bands (gasGiant family, same hues as the hub sphere
// in lib/planets/profiles.js: cream / tan / rust / brown + the Great
// Red Spot), darkened by the storm and by the day/night law.

import { valueNoise, hashString } from '../earth4/creature-textures.js';

export const JUPITER2_ROUTE = '/jupiter-2';
export const JUPITER2_ROUTE_KEY = 'jupiter-2';
export const JUPITER2_SEED = 'JUPITER-2-PRIME';
export const JUPITER2_FOUNDING_MS = Date.UTC(2026, 10, 15);

// Movement: walk 6 m/s on foot; the speeder rides at 28 m/s, so
// riding is unmistakably faster than walking (the speeder test
// pins ride > walk). The world is a disc of radius MOVE_R.
export const WALK_SPEED = 6;
export const SPEEDER_SPEED = 28;
export const MOVE_R = 88;
export const EYE_HEIGHT = 1.7;

// The planet is a SPHERE now (lib/jupiter2/planet.js, Merlin
// Nov 16 ~00:02: "I want a full planet here"): radius 88 — the
// same number as the old disc, so the deck cap keeps its scale.
// The oblivion lever no longer stands on the deck: it moved
// INSIDE the cave in the mountain past the drop (planet.js
// leverCavePoint — the warning + confirm gate is untouched).
export const JUPITER2_SPHERE_R = 88;

// Creature counts (seeded, fixed per world — the scene spawns
// exactly these; the test pins the numbers).
export const LIGHTNING_MONSTER_COUNT = 7;
export const DEMOBAT_COUNT = 9;

const GROUND_SEED = hashString('jupiter-2:ground');

function fbm(x, z) {
  return valueNoise(x * 0.03 + 7, z * 0.03 + 3, GROUND_SEED) * 0.6
    + valueNoise(x * 0.09 + 13, z * 0.09 + 9, GROUND_SEED) * 0.4;
}

/** Cloud-deck height at (x, z): gentle rolling swells, ±1.2 m. */
export function groundHeight(x, z) {
  return (fbm(x, z) - 0.5) * 2.4;
}

// ── day/night sky (the shared law: timeOfDay 0..1, real clock by
// default — the page drives it exactly the way Mars does). Jupiter
// 2's day is a dim amber storm-light, never a blue sky; night is
// near-black and the lightning does the lighting. ───────────────
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function smoothstep(a, b, x) {
  const s = clamp01((x - a) / (b - a));
  return s * s * (3 - 2 * s);
}

export function jupiter2Sky(timeOfDay) {
  const elev = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
  const dayF = smoothstep(-0.06, 0.28, elev);
  // Storm visibility: short fog even by day, shorter at night —
  // the storm must still read on a phone, so fog never closes
  // below ~26 m and the lever beacon punches through it.
  return {
    dayF,
    bg: dayF > 0.5 ? '#2a1a0e' : '#0b0705',
    fogColor: dayF > 0.5 ? '#4a2f1a' : '#120a06',
    fogNear: 14 + dayF * 12,
    fogFar: 34 + dayF * 30,
    sunIntensity: 0.1 + dayF * 0.9,
    sunColor: '#e8a35c',
    ambient: 0.22 + dayF * 0.3,
    hemiSky: '#6b4a2a',
    hemiGround: '#3a2412',
    sunPos: [
      Math.cos((timeOfDay - 0.25) * Math.PI * 2) * 70,
      Math.max(elev, -0.4) * 80 + 12,
      -40,
    ],
  };
}
