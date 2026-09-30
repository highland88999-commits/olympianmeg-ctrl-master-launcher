// lib/terrain.js — pure procedural-terrain math for the fallback Earth globe.
// No DOM, no JSX: headless-testable in node. The React component
// (components/ProceduralEarthGlobe.jsx) imports these builders.
import * as THREE from 'three';

export const TERRAIN_RADIUS = 55; // hub units — matches the tile globe and the ESRI lens
export const TERRAIN_SEA_LEVEL = 12 / 255; // topology values at/below this are ocean
export const TERRAIN_ELEVATION_SCALE = 2.6; // visual exaggeration of real relief
export const TERRAIN_TEXTURES = Object.freeze({
  height: '/textures/earth/earth-topology.png',
  day: '/textures/earth/earth-day.jpg',
  night: '/textures/earth/earth-night.jpg',
});

// Bilinear sample of a grayscale heightmap, returned 0..1.
// data is a row-major Uint8Array, row 0 = north edge (matches flipY
// texture sampling in GLSL: uv.y = 1 at the north pole).
export function sampleHeight(data, w, h, u, v) {
  const x = Math.min(Math.max(u, 0), 1) * (w - 1);
  const y = Math.min(Math.max(1 - v, 0), 1) * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = data[y0 * w + x0] / 255;
  const i10 = data[y0 * w + x1] / 255;
  const i01 = data[y1 * w + x0] / 255;
  const i11 = data[y1 * w + x1] / 255;
  return (i00 * (1 - fx) + i10 * fx) * (1 - fy) + (i01 * (1 - fx) + i11 * fx) * fy;
}

// Elevation displacement for one height sample: ocean floor dips slightly
// below the sphere, land rises with exaggeration.
export function displacementForHeight(h) {
  return (h - TERRAIN_SEA_LEVEL) * TERRAIN_ELEVATION_SCALE;
}

// Build the displaced sphere once. Equirectangular UVs line up exactly with
// the day/night/height textures sampled in the fragment shader.
export function buildTerrainGeometry(heightData, imgW, imgH, mobile) {
  const geo = new THREE.SphereGeometry(
    TERRAIN_RADIUS,
    mobile ? 96 : 160,
    mobile ? 72 : 120
  );
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const hh = sampleHeight(heightData, imgW, imgH, uv.getX(i), uv.getY(i));
    const r = TERRAIN_RADIUS + displacementForHeight(hh);
    dir.fromBufferAttribute(pos, i).normalize();
    pos.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
