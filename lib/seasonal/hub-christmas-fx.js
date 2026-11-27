// lib/seasonal/hub-christmas-fx.js
//
// Pure helpers for the Christmas hub glow + decor round (Merlin, Nov 27, 2026).
// No imports — nothing to cycle, everything unit-testable in plain node:
//   node --test tests/hub-christmas-fx.test.mjs
//
//   1. FLIGHT AXIS pill glow — one 30 s pulse, wall-clock aligned so the
//      pill and the hub icon (Concourse Orb) swell and fade together.
//   2. Meteor shower — top of every hour, minutes 00-04 (5 minutes),
//      INSTEAD of the snowfall.
//   3. Angled garland — the backdrop-planet rings tilt diagonally
//      (f_03 reference: ~35-45 deg), with blinking Christmas lights.
//   4. Tree lights — alternating bands (f_11 reference), not the old
//      per-light random twinkle.
//   5. Christmas presents — 20 claimable presents (1 aether each),
//      laid out in world coordinates outside the tree's hit-proxy sphere.
//   6. Interceptor match — the Dart's green (#00ff88) is the accent for
//      the glow/lights; red/gold Christmas language stays where it lives.

// ---- 30 s glow pulse -------------------------------------------------------
export const PULSE_PERIOD_MS = 30000;

// The Dart — "Interceptor — fastest thing in the sky"
// (components/argo/VehicleArchetypes.jsx). The glow/lights accent for
// this round. The other Interceptor in code is the Storm Interceptor
// (lib/world-engine/datasheets/vehicles.js, #c084fc purple).
export const INTERCEPTOR_GREEN = '#00ff88';

// Negative animation-delay (seconds) that aligns a PULSE_PERIOD_MS CSS
// keyframes animation to the wall clock: two elements mounted at
// different times, given this delay, run in phase with each other.
export function pulseDelaySeconds(date = new Date()) {
  return (date.getTime() % PULSE_PERIOD_MS) / 1000;
}

// ---- Meteor shower window --------------------------------------------------
// Top of every hour, 5 minutes: minute 0, 1, 2, 3, 4. At :05 it is off.
export function meteorShowerActive(date = new Date()) {
  return date.getMinutes() < 5;
}

// ---- Christmas season key --------------------------------------------------
// One season runs Nov 27 - Jan 7 (treeVisible), keyed by the year it
// starts in — so Jan 1-7 claims land in the SAME season as December.
export function christmasSeasonKey(date = new Date()) {
  const year = date.getMonth() === 0 ? date.getFullYear() - 1 : date.getFullYear();
  return `christmas-${year}`;
}

// ---- Alternating blink -----------------------------------------------------
// Two groups swap brightness on a ~1.9 s cycle: when group 0 is bright,
// group 1 is dim, and vice versa. Returns 0..1 (0 = fully dim).
// Tree lights use BAND grouping (one spiral turn per band); garland
// lights use even/odd grouping. Same helper, same feel.
export function alternateBlinkFactor(t, groupIndex) {
  const on = 0.5 + 0.5 * Math.sin((Math.PI * t) / 0.94);
  return groupIndex % 2 === 0 ? on : 1 - on;
}

// ---- Angled garland --------------------------------------------------------
// f_03 reference: the garland band crosses the planet diagonally,
// ~35-45 deg from horizontal. One uniform tilt for every planet so the
// look is a consistent style, not a per-planet accident.
export const GARLAND_TILT_Z_RAD = (38 * Math.PI) / 180;
export const GARLAND_TILT_X_RAD = (10 * Math.PI) / 180;
export const GARLAND_RING_FACTOR = 1.15;
export const GARLAND_BAUBLE_COUNT = 14;
export const GARLAND_LIGHT_COUNT = 28;

// Tilt + ring radius for a planet of the given radius. Bauble/light
// positions live on the ring circle in the garland group's local
// XZ plane; the group rotation tilts them all together.
export function angledGarlandTransform(planetRadius) {
  return {
    tiltX: GARLAND_TILT_X_RAD,
    tiltZ: GARLAND_TILT_Z_RAD,
    ringRadius: planetRadius * GARLAND_RING_FACTOR,
    baubleCount: GARLAND_BAUBLE_COUNT,
    lightCount: GARLAND_LIGHT_COUNT,
  };
}

// Position of the i-th item of n evenly spaced items on the ring circle
// (local XZ plane, y = 0), before the group tilt is applied.
export function garlandRingPosition(planetRadius, index, count) {
  const a = (index / count) * Math.PI * 2;
  const r = planetRadius * GARLAND_RING_FACTOR;
  return [Math.cos(a) * r, 0, Math.sin(a) * r];
}

// ---- Christmas presents ----------------------------------------------------
export const PRESENT_AETHER_VALUE = 1;
export const PRESENT_COUNT = 20;
export const PRESENT_IDS = Array.from({ length: PRESENT_COUNT }, (_, i) => `present-${String(i).padStart(2, '0')}`);

// Same present colours as the tree's own decorative presents
// (lib/seasonal/tree.js buildPresents).
export const PRESENT_COLORS = ['#c0272d', '#1d5fa8', '#2d8a4e', '#7a2dc0', '#d4af37', '#e8e8f0'];
export const PRESENT_RIBBON_COLOR = '#e8c33c';

// Two rings around the tree base, in the tree's LOCAL units (the tree
// group scales them by `scale`). Ring radii are chosen so every
// present sits OUTSIDE the tree's hit-proxy sphere (hitRadius, world
// units, centred on the Earth centre): the proxy raycast-blocks
// anything inside it, so a claimable present inside the sphere would
// be untappable. Inner ring 12 at local r=17, outer ring 8 at local
// r=20; sizes 1.6-2.4 local. See the clearance test.
const PRESENT_RINGS = [
  { count: 12, radiusLocal: 17 },
  { count: 8, radiusLocal: 20 },
];

// World-space layout for the 20 claimable presents.
//   earthCenter: { x, y, z } — the Earth centre (tree swap centre)
//   earthRadius: the Earth radius (tree base sits earthRadius below centre)
//   scale: the tree swap scale (tree local units -> world units)
//   hitRadius: the tree hit-proxy radius (world units)
// Returns [{ id, position: [x, y, z] (world), size (local), color,
//            rotationY, clearance }] — clearance is the world-space gap
// between the present's nearest corner and the proxy sphere (> 0 means
// outside it and tappable).
export function christmasPresentLayout({ earthCenter, earthRadius, scale, hitRadius }) {
  const out = [];
  let n = 0;
  for (const ring of PRESENT_RINGS) {
    for (let i = 0; i < ring.count; i++) {
      const id = PRESENT_IDS[n];
      const a = (i / ring.count) * Math.PI * 2 + (ring.radiusLocal === 20 ? Math.PI / ring.count : 0);
      const size = 1.6 + (n % 5) * 0.2;
      const horizontal = ring.radiusLocal * scale;
      // Box centre height: base sits on y=0 local, centre half a box up.
      const yLocal = (size * 0.8) / 2;
      const position = [
        earthCenter.x + Math.cos(a) * horizontal,
        earthCenter.y - earthRadius + yLocal * scale,
        earthCenter.z + Math.sin(a) * horizontal,
      ];
      // Nearest corner of the box to the Earth centre, world units.
      const halfDiag = (Math.sqrt(size * size + (size * 0.8) * (size * 0.8) + size * size) / 2) * scale;
      const centreDist = Math.hypot(
        position[0] - earthCenter.x,
        position[1] - earthCenter.y,
        position[2] - earthCenter.z
      );
      const clearance = centreDist - halfDiag - hitRadius;
      out.push({
        id,
        position,
        size,
        color: PRESENT_COLORS[n % PRESENT_COLORS.length],
        rotationY: (n * 0.7) % Math.PI,
        clearance,
      });
      n += 1;
    }
  }
  return out;
}
