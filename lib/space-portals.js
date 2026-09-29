// lib/space-portals.js
// Pure layout + naming helpers for the vertical space-portal gate field that
// rings the BABEL position in the launcher hub scene. Every gate leads to one
// pocket universe; this module does the math and the name/color resolution so
// it stays headless-testable (no three.js imports here).
//
// Layout: concentric rings (a polar grid) on the XZ plane around a center
// point, all gates at the center's height. Gates face the center so the field
// reads as a ring of doorways from the spawn view.

import { godMenuFor } from './god-menus.js';
import { GOD_HEX } from './god-orbits.js';

/** Physical size of one gate, in scene units. */
export const GATE_SIZE = {
  width: 5, // frame outer width
  height: 8, // frame outer height
  labelLift: 5.4, // label sprite height above gate center
  hitWidth: 10, // generous invisible tap target
  hitHeight: 12,
  hitDepth: 7,
};

/** Distance (scene units) from a gate center that counts as flying through it.
 *  Kept under half the minimum gate spacing so crossing zones never overlap. */
export const GATE_CROSSING_RADIUS = 4.5;

/**
 * Lay `count` gate positions out on concentric rings around `center`.
 * Ring capacity grows with circumference so spacing stays even.
 *
 * @param {number} count
 * @param {{ center?: [number,number,number], innerRadius?: number,
 *   ringGap?: number, spacing?: number }} opts
 * @returns {Array<{ x:number, y:number, z:number, ring:number, angle:number }>}
 */
export function portalRingLayout(count, opts = {}) {
  const {
    center = [0, 35, -80],
    innerRadius = 24,
    ringGap = 12,
    spacing = 10,
  } = opts;
  const [cx, cy, cz] = center;
  const spots = [];
  let ring = 0;
  while (spots.length < count) {
    const r = innerRadius + ring * ringGap;
    // Keep at least 6 gates per ring; capacity scales with circumference.
    const capacity = Math.max(6, Math.floor((2 * Math.PI * r) / spacing));
    for (let i = 0; i < capacity && spots.length < count; i++) {
      // Offset alternate rings by half a step so gates stagger, grid-like.
      const angle = ((i + (ring % 2) * 0.5) / capacity) * Math.PI * 2;
      spots.push({
        x: cx + Math.cos(angle) * r,
        y: cy,
        z: cz + Math.sin(angle) * r,
        ring,
        angle,
      });
    }
    ring += 1;
    if (ring > 40) break; // sanity cap; never hit in practice
  }
  return spots;
}

/**
 * Yaw (radians) so a gate at `spot` faces the layout `center`.
 * three.js planes face +Z by default; yaw = atan2(dx, dz) orients +Z at center.
 */
export function gateYawToCenter(spot, center) {
  return Math.atan2(center[0] - spot.x, center[2] - spot.z);
}

/** God menu owning a satellite key, or null. */
export function menuForSatellite(satKey) {
  return godMenuFor(satKey);
}

/** Accent hex for a satellite's gate frame + label. Falls back to sky. */
export function accentForSatellite(satKey) {
  const menu = menuForSatellite(satKey);
  return (menu && GOD_HEX[menu.accent]) || GOD_HEX.sky;
}

/**
 * Plain-English gate label. Prefers the i18n title; falls back to a
 * title-cased key ('browsers-castle' -> 'Browsers Castle').
 */
export function displayNameFor(key, title) {
  if (title && title !== key && !title.startsWith('sat.')) return title;
  return key
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Minimum pairwise distance between layout spots (for the uniqueness test). */
export function minSpotDistance(spots) {
  let min = Infinity;
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const dx = spots[i].x - spots[j].x;
      const dz = spots[i].z - spots[j].z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < min) min = d;
    }
  }
  return min;
}
