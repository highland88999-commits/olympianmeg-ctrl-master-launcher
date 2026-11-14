// lib/tower-collider.js
// The god towers' solid body, as an oriented box — Merlin, 2026-11-13:
// "move the billboards further out ... enough space for users to easily
// pass between them", refined the same minute: "perfect the geometry"
// (exact, measured, even gaps).
//
// WHY A BOX (measured, not assumed): the old collider was 3 spheres r26
// per tower. On a 24-tower ring the chord between adjacent tower centres
// is 2·R·sin(7.5°) — at R=150 that is 39.16, so two r26 spheres overlap
// by 12.84 and form a continuous wall: NO gap at all, for any ring
// radius the hub can hold. A fly-through gap with r26 spheres needs
// R ≥ 208, which drives the towers through the planet lanes and into
// Mars (planet 23's Mars clearance falls to 41.67, through the planet;
// even +5.83 on the lanes drops it to 56.89, below the 58 gate —
// sampled over a full assembly rotation, 1440 steps). The lanes stay
// at 195–231, so no ring move and no sphere trim can open a gap.
//
// The tower's real body is a square box. Face plane 10.48 group units
// from the axis (mount 10.12 + face offset 0.24 × PANEL_SCALE 1.5),
// group scale 1.6 — so the box half-side is 16.768 world units and
// the box-to-box gap is chord − 2×16.768. With the towers holding a
// FIXED yaw square to the ring (panel 0 facing the hub centre, the
// inward face readable from spawn; the old 0.15 rad/s spin is gone),
// the gap is exactly the chord minus the box width — no swept circle,
// no overlap. Ring 159.11 gives chord 41.54 and an even 8.00 gap
// between every adjacent pair: 5.60 spare for the flyer (r1.2),
// 2.00 spare for the bike (r3.0).
//
// Vertical span (tower-local, group units × 1.6): pillar bottom −22.5
// (−36.00) to god-label top +25.3 (+40.48). Centre +2.25, half 38.75
// — the extra 0.50 covers the ±0.5 bob. In world units the box spans
// y −1.50 to +76.00 around the tower's mount height.

import { ORBIT_CENTER } from './god-orbits.js';

// Face plane distance from the tower axis, group units — read from
// GodTower.jsx: panel mount 10.12 + face offset 0.24 × PANEL_SCALE 1.5.
export const TOWER_FACE_PLANE_GROUP = 10.48;
// Tower group scale (GodTower.jsx satelliteRef group).
export const TOWER_GROUP_SCALE = 1.6;
// Box half-side, world units: the face plane is the box's face.
export const TOWER_BOX_HALF_SIDE = TOWER_FACE_PLANE_GROUP * TOWER_GROUP_SCALE; // 16.768

// Box vertical centre / half-height, tower-local world units (see header).
export const TOWER_BOX_Y_CENTER = 2.25;
export const TOWER_BOX_Y_HALF = 38.75;

// The design target: clear gap between adjacent tower boxes.
export const TOWER_GAP_TARGET = 8.0;

// Number of towers on the ring (GOD_MENUS.length, 24).
export const TOWER_COUNT = 24;

/** Chord between adjacent tower centres on a ring of the given radius. */
export function towerChord(radius) {
  return 2 * radius * Math.sin(Math.PI / TOWER_COUNT);
}

/** Clear gap between adjacent tower boxes on a ring of the given radius. */
export function towerGap(radius) {
  return towerChord(radius) - 2 * TOWER_BOX_HALF_SIDE;
}

/** Ring radius that gives exactly the given clear gap between boxes. */
export function ringRadiusForGap(gap) {
  return (2 * TOWER_BOX_HALF_SIDE + gap) / (2 * Math.sin(Math.PI / TOWER_COUNT));
}

/**
 * Fixed yaw (radians, about Y) that squares a tower to the ring: the
 * group's +Z — panel 0's face — points from the tower at the hub
 * centre, so the inward face reads from spawn and the faces stand
 * parallel/perpendicular to the radial direction. `position` is the
 * tower's [x, y, z]; `center` defaults to ORBIT_CENTER.
 */
export function towerFixedYaw(position, center = ORBIT_CENTER) {
  return Math.atan2(center.x - position[0], center.z - position[2]);
}

/**
 * Radius from the hub centre to a tower box's outer corner (the box's
 * closest approach to the planet lanes). The corner sits at
 * (radial R + half-side, tangential half-side) in the tower's frame.
 */
export function towerCornerRadius(radius) {
  return Math.hypot(radius + TOWER_BOX_HALF_SIDE, TOWER_BOX_HALF_SIDE);
}

/** Radius from the hub centre to a tower box's inner corner. */
export function towerInnerCornerRadius(radius) {
  return Math.hypot(radius - TOWER_BOX_HALF_SIDE, TOWER_BOX_HALF_SIDE);
}

/** Half-extents of one tower's box collider, world units. */
export function towerBoxHalfExtents() {
  return {
    x: TOWER_BOX_HALF_SIDE,
    y: TOWER_BOX_Y_HALF,
    z: TOWER_BOX_HALF_SIDE,
  };
}

/**
 * Distance from a point {x,y,z} to one tower's oriented box (0 when the
 * point is inside the box). `towerPos` is the tower's [x, y, z] mount
 * position; `yaw` is its fixed yaw from towerFixedYaw.
 */
export function pointToTowerBoxDistance(point, towerPos, yaw) {
  const cx = towerPos[0];
  const cy = towerPos[1] + TOWER_BOX_Y_CENTER;
  const cz = towerPos[2];
  const dx = point.x - cx;
  const dy = point.y - cy;
  const dz = point.z - cz;
  // Into the box's local frame (rotate by -yaw about Y).
  const c = Math.cos(-yaw);
  const s = Math.sin(-yaw);
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const qx = Math.max(Math.abs(lx) - TOWER_BOX_HALF_SIDE, 0);
  const qy = Math.max(Math.abs(dy) - TOWER_BOX_Y_HALF, 0);
  const qz = Math.max(Math.abs(lz) - TOWER_BOX_HALF_SIDE, 0);
  return Math.hypot(qx, qy, qz);
}
