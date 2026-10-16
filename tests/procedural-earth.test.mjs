// tests/procedural-earth.test.mjs
// Headless tests for the hybrid 3D Earth: Google's photorealistic tiles stay
// primary; the fallback is a REAL procedural 3D terrain globe (never flat).
// Run: node tests/procedural-earth.test.mjs (from the repo root).
// No browser, no network — pure math + source wiring + texture files.
import { readFileSync, existsSync } from 'fs';
import * as THREE from 'three';
import {
  sampleHeight,
  displacementForHeight,
  buildTerrainGeometry,
  TERRAIN_RADIUS,
  TERRAIN_SEA_LEVEL,
  TERRAIN_ELEVATION_SCALE,
  TERRAIN_TEXTURES,
} from '../lib/terrain.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// --- self-hosted textures exist and are image bytes ---
const texDir = 'public/textures/earth';
for (const [key, url] of Object.entries(TERRAIN_TEXTURES)) {
  t(`terrain texture url is self-hosted (${key})`, url.startsWith('/textures/earth/'));
  const file = `${texDir}/${url.split('/').pop()}`;
  t(`terrain texture file exists (${key})`, existsSync(file));
}
const png = readFileSync(`${texDir}/earth-topology.png`);
t('topology is a real PNG (magic bytes)', png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47);
const day = readFileSync(`${texDir}/earth-day.jpg`);
t('day texture is a real JPEG (magic bytes)', day[0] === 0xff && day[1] === 0xd8 && day[2] === 0xff);
const night = readFileSync(`${texDir}/earth-night.jpg`);
t('night texture is a real JPEG (magic bytes)', night[0] === 0xff && night[1] === 0xd8 && night[2] === 0xff);
t('textures are modest in size (<2MB total)', png.length + day.length + night.length < 2 * 1024 * 1024);

// --- heightmap sampling ---
const w = 4, h = 2;
const grad = new Uint8Array([0, 85, 170, 255, 0, 85, 170, 255]);
t('sampleHeight: NW corner = 0', approx(sampleHeight(grad, w, h, 0, 1), 0));
t('sampleHeight: SE corner = 1', approx(sampleHeight(grad, w, h, 1, 0), 1));
t('sampleHeight: bilinear midpoint', approx(sampleHeight(grad, w, h, 0.5, 0.5), 0.5, 0.02));
t('sampleHeight: clamps out-of-range uv', Number.isFinite(sampleHeight(grad, w, h, -1, 2)));

// --- displacement ---
t('ocean floor dips below the sphere', displacementForHeight(0) < 0);
t('sea level displaces to ~0', approx(displacementForHeight(TERRAIN_SEA_LEVEL), 0));
t('highest land rises visibly', displacementForHeight(1) > 1.5);
t('elevation constants sane', TERRAIN_RADIUS === 55 && TERRAIN_ELEVATION_SCALE > 0 && TERRAIN_SEA_LEVEL > 0 && TERRAIN_SEA_LEVEL < 0.2);

// --- geometry build (headless three.js) ---
const mob = buildTerrainGeometry(grad, w, h, true);
const desk = buildTerrainGeometry(grad, w, h, false);
t('mobile geometry is lighter than desktop',
  mob.attributes.position.count < desk.attributes.position.count);
t('mobile geometry is still a real mesh', mob.attributes.position.count > 1000);
t('geometry has recomputed normals', !!desk.attributes.normal);
{
  const pos = desk.attributes.position;
  const v = new THREE.Vector3();
  let minR = Infinity, maxR = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = v.length();
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  t('displacement moves vertices both ways', minR < TERRAIN_RADIUS && maxR > TERRAIN_RADIUS);
  t('relief is exaggerated but sane', maxR - TERRAIN_RADIUS < 4 && TERRAIN_RADIUS - minR < 1);
}

// --- component structure: ProceduralEarthGlobe ---
const globe = readFileSync('components/ProceduralEarthGlobe.jsx', 'utf8');
t('globe is client-only', /^'use client';/m.test(globe));
t('globe has a default export', /export default function ProceduralEarthGlobe/.test(globe));
t('globe imports the pure terrain builders', /from '@\/lib\/terrain'/.test(globe));
t('globe uses only self-hosted textures', /TERRAIN_TEXTURES/.test(globe) && !/unpkg\.com|raw\.githubusercontent/.test(globe));
t('globe precomputes displacement at load (not per-frame)', /buildTerrainGeometry/.test(globe));
t('globe adapts density for mobile', /innerWidth < 768|ontouchstart/.test(globe));
t('globe colors by elevation (hypsometric)', /hypsometric/.test(globe));
t('globe renders polar ice caps', /ice/.test(globe));
t('globe blends day + night imagery', /dayTexture/.test(globe) && /nightTexture/.test(globe));
t('globe lighting is gentle (no washout)', /0\.72, 1\.0/.test(globe));
t('globe is clickable like the old globe', /onSelect/.test(globe) && /onClick=/.test(globe));
t('globe disposes geometry/textures on unmount', /\.dispose\(\)/.test(globe));
t('globe renders nothing (not a crash) if textures fail', /failed: true/.test(globe));
// SSR safety: no top-level document/window/THREE-geometry at module scope.
const topLevel = globe.split('export default function')[0];
t('globe module top-level is SSR-safe', !/document\.|window\./.test(topLevel));

// --- wiring: NexusEarth ---
const nexus = readFileSync('components/NexusEarth.jsx', 'utf8');
t('earth imports the procedural globe', /import ProceduralEarthGlobe/.test(nexus));
t('earth renders the procedural globe on the fallback layer', /<ProceduralEarthGlobe/.test(nexus));
t('earth keeps Google tiles primary', /<GoogleEarthTiles/.test(nexus) && /onActive=\{[^}]*'photorealistic'/.test(nexus));
t('earth falls back to the terrain globe on tile failure', /onInactive=\{[^}]*'terrain'/.test(nexus));
t('earth badge is honest about the fallback', /Terrain · 3D/.test(nexus));
t('flat stylized globe is gone', !/earth_atmos_2048|stylized globe/.test(nexus));
t('no hotlinked earth textures remain', !/unpkg\.com\/three-globe|raw\.githubusercontent\.com\/mrdoob/.test(nexus));
t('earth keeps the ESRI detail lens', /lensTilePlan/.test(nexus) && /CanvasTexture/.test(nexus));
t('earth keeps the atmosphere shell', /AdditiveBlending/.test(nexus));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
