// lib/mars2/zone-geometry.js
// MARS 2 mining-zone visuals that HUG THE GROUND (Merlin, Nov 25, 2026).
//
// The old zone disc + ring were flat planes at the area centre's
// height, so the boundary line floated over dips and sank into
// rises. These builders drape the visuals over the terrain: every
// vertex samples the Mars 2 ground height (lib/mars2/terrain.js —
// flat inside the zone, blended at the rim), so the tint and the
// line sit flush with the dirt all the way round.
//
// The vertex math is pure numbers (no THREE) so tests can assert
// the drape directly; the *Geometry wrappers turn the arrays into
// BufferGeometry for the scene. Ring segments and disc rings are
// fixed counts, so a zone costs the same geometry every time.

import * as THREE from 'three';

/** Segments around the zone circle. */
export const ZONE_SEGMENTS = 48;
/** Radial rings of the tinted disc (centre + rings out to the rim). */
export const ZONE_DISC_RINGS = [0, 3, 6, 8, 10, 12];
/** The boundary line is a strip this wide, hugging the rim. */
export const ZONE_RING_WIDTH_M = 0.4;
/** The tint + line ride this far above the dirt (no z-fighting). */
export const ZONE_LIFT_M = 0.08;

/**
 * Vertices for the tinted disc: a radial fan in WORLD coordinates,
 * centred on the area, every vertex at ground height + lift.
 * Returns { positions, uvs, indices } (flat arrays).
 */
export function zoneDiscVertices(area, heightAt) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rings = ZONE_DISC_RINGS;
  // Centre vertex.
  positions.push(area.x, heightAt(area.x, area.z) + ZONE_LIFT_M, area.z);
  uvs.push(0.5, 0.5);
  for (let r = 1; r < rings.length; r++) {
    for (let i = 0; i < ZONE_SEGMENTS; i++) {
      const a = (i / ZONE_SEGMENTS) * Math.PI * 2;
      const wx = area.x + Math.cos(a) * rings[r];
      const wz = area.z + Math.sin(a) * rings[r];
      positions.push(wx, heightAt(wx, wz) + ZONE_LIFT_M, wz);
      uvs.push(0.5 + (Math.cos(a) * rings[r]) / (area.radius * 2), 0.5 + (Math.sin(a) * rings[r]) / (area.radius * 2));
    }
  }
  // Centre fan.
  for (let i = 0; i < ZONE_SEGMENTS; i++) {
    indices.push(0, 1 + ((i + 1) % ZONE_SEGMENTS), 1 + i);
  }
  // Ring quads.
  for (let r = 1; r < rings.length - 1; r++) {
    const base = 1 + (r - 1) * ZONE_SEGMENTS;
    const next = base + ZONE_SEGMENTS;
    for (let i = 0; i < ZONE_SEGMENTS; i++) {
      const a = base + i;
      const b = base + ((i + 1) % ZONE_SEGMENTS);
      const c = next + i;
      const d = next + ((i + 1) % ZONE_SEGMENTS);
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, uvs, indices };
}

/**
 * Vertices for the boundary line: a strip around the rim, inner
 * edge at radius - width, outer at radius, every vertex at ground
 * height + lift. Returns { positions, uvs, indices } (flat arrays).
 */
export function zoneRingVertices(area, heightAt) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rOuter = area.radius;
  const rInner = area.radius - ZONE_RING_WIDTH_M;
  for (let i = 0; i <= ZONE_SEGMENTS; i++) {
    const a = (i % ZONE_SEGMENTS) / ZONE_SEGMENTS * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const xi = area.x + ca * rInner;
    const zi = area.z + sa * rInner;
    const xo = area.x + ca * rOuter;
    const zo = area.z + sa * rOuter;
    positions.push(xi, heightAt(xi, zi) + ZONE_LIFT_M, zi);
    positions.push(xo, heightAt(xo, zo) + ZONE_LIFT_M, zo);
    uvs.push(i / ZONE_SEGMENTS, 0, i / ZONE_SEGMENTS, 1);
  }
  for (let i = 0; i < ZONE_SEGMENTS; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  return { positions, uvs, indices };
}

function toGeometry(v) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(v.uvs, 2));
  g.setIndex(v.indices);
  g.computeVertexNormals();
  return g;
}

/** The tinted disc as a terrain-draped BufferGeometry. */
export function zoneDiscGeometry(area, heightAt) {
  return toGeometry(zoneDiscVertices(area, heightAt));
}

/** The boundary line as a terrain-draped BufferGeometry. */
export function zoneRingGeometry(area, heightAt) {
  return toGeometry(zoneRingVertices(area, heightAt));
}
