// app/hollow-earth/sanctuary-ring.js — THE SANCTUARY RING GRAPHIC.
//
// Phase 2c (Merlin, Nov 24 ~10:06): "create a graphic to wrap
// the borders in — the ring that acts as the boundary for a
// safe zone". ONE shared design, worn by every safe zone and
// by every structure's footprint ring, sized to each.
//
// THE DESIGN — the ward-line (worker's call, stated plainly):
//   - a ground band, 1.2 m wide, hugging the shell along the
//     boundary (auraRingPoints, the J2/Hollow Earth aura-ring
//     pattern — the points follow the real terrain, so the ring
//     never floats or buries on the inner sphere), in the
//     zone's own element colour, additive, breathing gently;
//   - two edge lines in sanctuary gold (the Haven's ward
//     colour — landmarks.js 'haven': pale pillars + a gold
//     dome standing ON the r 28 boundary), so the line reads
//     as a ward at a glance from either side;
//   - a low shimmer veil, 2.5 m tall, the same element colour
//     fading to nothing at the top (additive, so black is
//     invisible) — the boundary you can see through and walk
//     straight through. It is a marker, never a wall: no
//     collider is ever built for a ring (the no-barriers law
//     wins — the ring marks where safety starts, it does not
//     fence the world in).
// "Safe inside, danger outside" reads from both sides because
// the band + veil are visible from either side (DoubleSide,
// fog: false so the gold still reads at distance) and the
// gold edge lines are the same on both faces.
//
// THEME SOURCE (Merlin: "follow the theme for guidance on
// graphic creations"): the Hollow Earth / MonsterVerse theme
// itself — the seven element colours (ELEMENT_AURA /
// PROJECTILE_STYLE, the one look per element already in code),
// the biome accent colours, and the Haven's own ward language
// (gold dome + pillar ring on its boundary). The TRON
// shadow-realm graphics (public/images/shadow-realm/ui/) were
// checked and do NOT fit here: they are 2D control icons
// (orb buttons, vehicle cards), not ground geometry, and a
// boundary ring built from a button icon would read as UI,
// not as the world. No new binary: the ring is procedural
// geometry in code (the contents-API push ships code only),
// so it lands with the push instead of waiting on an asset.
// Mountain bands wear lightning's colour — biomes.js already
// says the mountain element IS lightning.
//
// Pure geometry: this module computes vertex arrays from the
// shell (planet.js) and the element table; zone.js turns them
// into THREE meshes. The tests pin the geometry (band radii,
// veil height + fade, gold edges, element colours) without a
// scene, and the builders test pins that buildWorld actually
// hangs one on every zone and every structure.

import {
  deckToDir, dirToDeck, sphereUpAt, auraRingPoints,
} from '../../lib/hollow-earth/planet.js';
import { ELEMENT_AURA } from './elemental-aura.js';
import { biomeAt, BIOMES } from './biomes.js';
import { SANCTUARY_GOLD } from './sanctuary.js';

export { SANCTUARY_GOLD };

/* The ring's dimensions (worker's call, stated plainly). */
export const RING_BAND_WIDTH_M = 1.2; // ground band, edge to edge
export const RING_VEIL_HEIGHT_M = 2.5; // shimmer curtain height
export const RING_SEGMENTS = 64; // safe zones — a smooth circle at r 24–28
export const RING_STRUCTURE_SEGMENTS = 32; // structure rings — smaller radii, fewer segments
export const STRUCTURE_RING_MARGIN_M = 3; // ring stands 3 m clear of the footprint

/* The mountain bands carry no element of their own — biomes.js
 * already says the mountain element IS lightning, so the ring
 * wears lightning's colour there. */
const ELEMENT_FOR_BAND = { mountain: 'lightning' };

/** The band colour for a zone/structure element: its ELEMENT_AURA colour; 'gold' (The Haven) and unknown elements wear sanctuary gold. */
export function ringElementColor(element) {
  if (!element || element === 'gold') return SANCTUARY_GOLD;
  const mapped = ELEMENT_FOR_BAND[element] || element;
  const row = ELEMENT_AURA[mapped];
  return (row && row.color) || SANCTUARY_GOLD;
}

/** The element a structure ring wears at (x, z): its band's element, straight off the biome field. */
export function structureRingElement(x, z) {
  const band = biomeAt(x, z).dominant;
  return (BIOMES[band] && BIOMES[band].element) || 'sand';
}

/** A structure ring's radius: the footprint (colliderR × scale) plus the 3 m margin. */
export function structureRingRadius(colliderR, scale = 1) {
  return (colliderR || 0) * (scale || 1) + STRUCTURE_RING_MARGIN_M;
}

/**
 * The ring's pure geometry at deck centre (cx, cz), radius
 * radiusM, on the real height field. Returns plain arrays:
 *   band: { positions, indices } — a triangle strip between
 *     the r − 0.6 and r + 0.6 rings (2 × segments vertices);
 *   veil: { positions, colors, indices } — a quad strip from
 *     the ring up RING_VEIL_HEIGHT_M along the local up, the
 *     colour fading to black at the top (additive: black is
 *     invisible), so the curtain dissolves overhead;
 *   edgeInner / edgeOuter: the two gold edge polylines
 *     (r − 0.6 / r + 0.6), one point per segment.
 * `element` only feeds the veil's base colour; the band's
 * material colour comes from ringElementColor(element).
 */
export function sanctuaryRingGeometry(cx, cz, radiusM, heightAt = () => 0, element = 'gold', segments = RING_SEGMENTS) {
  const half = RING_BAND_WIDTH_M / 2;
  const centerDir = deckToDir(cx, cz);
  const inner = auraRingPoints(centerDir, Math.max(radiusM - half, 0.5), segments, heightAt);
  const outer = auraRingPoints(centerDir, radiusM + half, segments, heightAt);
  const ring = auraRingPoints(centerDir, radiusM, segments, heightAt);
  const bandPositions = [];
  const bandIndices = [];
  for (let i = 0; i < segments; i++) {
    bandPositions.push(inner[i], outer[i]);
    const a = i * 2;
    const b = ((i + 1) % segments) * 2;
    bandIndices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const color = ringElementColor(element);
  const base = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
  const veilPositions = [];
  const veilColors = [];
  const veilIndices = [];
  for (let i = 0; i < segments; i++) {
    const p = ring[i];
    // The local up at this ring point is toward the core — the
    // veil rises off the ground the same way everywhere on
    // the shell, never along world Y (which points down on
    // the far side). sphereUpAt reads it straight off the 3D
    // feet, no deck conversion needed.
    const up = sphereUpAt(p);
    const top = {
      x: p.x + up.x * RING_VEIL_HEIGHT_M,
      y: p.y + up.y * RING_VEIL_HEIGHT_M,
      z: p.z + up.z * RING_VEIL_HEIGHT_M,
    };
    veilPositions.push(p, top);
    veilColors.push(base, [0, 0, 0]);
    const a = i * 2;
    const b = ((i + 1) % segments) * 2;
    veilIndices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return {
    band: { positions: bandPositions, indices: bandIndices },
    veil: { positions: veilPositions, colors: veilColors, indices: veilIndices },
    edgeInner: inner,
    edgeOuter: outer,
    segments,
    radiusM,
    element,
  };
}

/* dirToDeck is the deck read for a ring point's 3D feet — kept
 * exported for the zone's veil orientation checks and the
 * tests that pin the ring to the shell. */
export { dirToDeck };
