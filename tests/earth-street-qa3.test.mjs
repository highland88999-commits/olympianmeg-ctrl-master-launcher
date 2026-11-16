// tests/earth-street-qa3.test.mjs — Earth street QA round 3
// (2026-10-26): street tiles, hub leak, rings REMOVED (Merlin
// 2026-10-26 — the metre rings at vehicle feet are gone),
// console copy, first-person car camera, orbit water,
// Oblivion prompt REMOVED in round 3 (Merlin, 2026-11-15).
// Run: node tests/earth-street-qa3.test.mjs (from the repo root).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStreetPatchGeometryData,
  registerStreetPatch,
  clearStreetPatch,
  patchFacetRadiusAt,
  STREET_PATCH_RADIUS,
  PATCH_RINGS,
  PATCH_SECTORS,
} from '../lib/earth/street-patch.js';
import { surfaceRadiusAt } from '../lib/earth/placements.js';

let checks = 0;
let failures = 0;
function check(name, ok, extra = '') {
  checks += 1;
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name} ${extra}`);
  } else {
    console.log(`ok: ${name}`);
  }
}

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- Facet sampler: structural round-trips on a flat field ---
const W = 512;
const H = 512;
const flat = new Uint8Array(W * H).fill(160);
const CENTER = { lat: 20, lon: 30 };
const flatPatch = buildStreetPatchGeometryData(flat, W, H, CENTER.lat, CENTER.lon, STREET_PATCH_RADIUS);
registerStreetPatch({
  positions: flatPatch.positions,
  indices: flatPatch.indices,
  centerLat: CENTER.lat,
  centerLon: CENTER.lon,
  rings: PATCH_RINGS,
  sectors: PATCH_SECTORS,
  radiusUnits: STREET_PATCH_RADIUS,
});

// Sampler at the centre vertex returns the centre vertex radius.
const c0 = Math.hypot(flatPatch.positions[0], flatPatch.positions[1], flatPatch.positions[2]);
const sCenter = patchFacetRadiusAt(CENTER.lat, CENTER.lon);
check('sampler: centre returns vertex-0 radius', sCenter != null && Math.abs(sCenter - c0) < 1e-4, `got ${sCenter} want ${c0}`);

// Sampler at every ring-1 vertex returns that vertex's radius
// (validates the polar-grid inversion end to end).
let worstVertexErr = 0;
for (let j = 0; j < PATCH_SECTORS; j++) {
  const k = 1 + j;
  const vx = flatPatch.positions[3 * k];
  const vy = flatPatch.positions[3 * k + 1];
  const vz = flatPatch.positions[3 * k + 2];
  const vr = Math.hypot(vx, vy, vz);
  // Recover the vertex lat/lon from its direction.
  const r = vr || 1;
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, vy / r))) * 180) / Math.PI;
  let theta = Math.atan2(vz, -vx);
  let lon = (theta * 180) / Math.PI - 180;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  const got = patchFacetRadiusAt(lat, lon);
  if (got == null) worstVertexErr = Infinity;
  else worstVertexErr = Math.max(worstVertexErr, Math.abs(got - vr));
}
check('sampler: ring-1 vertices round-trip', worstVertexErr < 1e-3, `worst err ${worstVertexErr}`);

// Outside the patch disc: null. No patch: null.
check('sampler: outside patch returns null', patchFacetRadiusAt(CENTER.lat + 30, CENTER.lon) == null);
clearStreetPatch();
check('sampler: no patch returns null', patchFacetRadiusAt(CENTER.lat, CENTER.lon) == null);

// --- Facet sampler: the burial mechanism, demonstrated ---
// Sharp narrow valley across the patch: high plateau (220) with a
// 3-row-deep cut (30). The smooth heightmap sample follows the
// kinked bilinear field; the drawn facet cuts chords across the
// kinks and stands ABOVE the smooth surface near the walls —
// exactly the gap that buried the car and the camera.
const W2 = 512;
const H2 = 512;
const valley = new Uint8Array(W2 * H2).fill(220);
for (let y = 254; y <= 256; y++) {
  for (let x = 0; x < W2; x++) valley[y * W2 + x] = 30;
}
// Valley rows: y = (1 - v) * (H - 1), v = (lat + 90) / 180.
// y = 255  =>  v = 1 - 255/511 = 0.501  =>  lat ≈ 0.18°.
const valleyPatch = buildStreetPatchGeometryData(valley, W2, H2, 0.18, 0, STREET_PATCH_RADIUS);
registerStreetPatch({
  positions: valleyPatch.positions,
  indices: valleyPatch.indices,
  centerLat: 0.18,
  centerLon: 0,
  rings: PATCH_RINGS,
  sectors: PATCH_SECTORS,
  radiusUnits: STREET_PATCH_RADIUS,
});
let maxGap = -Infinity;
for (let lat = -2; lat <= 2.0001; lat += 0.05) {
  const facet = patchFacetRadiusAt(lat, 0);
  if (facet == null) continue;
  const smooth = surfaceRadiusAt(valley, W2, H2, lat, 0);
  maxGap = Math.max(maxGap, facet - smooth);
}
check('sampler: facet stands above smooth surface at a valley wall', maxGap > 0.001, `max gap ${maxGap}`);
clearStreetPatch();

// --- Source contracts ---
const nexus = read('../components/NexusEarth.jsx');
check('lens: no build manager remains — the ground is prerendered', !nexus.includes('pumpLensQueue') && !nexus.includes('onGroundVideoReady') && !nexus.includes('startLensBuild'));
check('lens: abandonment guard gone (old onload kill-switch)', !nexus.includes('if (!alive) return'));
check('lens: no pending queue on recenter — nothing recenters', !nexus.includes('mgr.pending = job'));
check('globe: orbit water passed from NexusEarth', nexus.includes('waterInOrbit={!roaming}'));

const globe = read('../components/ProceduralEarthGlobe.jsx');
check('globe: orbitWater uniform + bright blue', globe.includes('orbitWater') && globe.includes('0.05, 0.45, 0.95'));
check('globe: street behavior unchanged at orbitWater 0', globe.includes('(1.0 - orbitWater)'));

const home = read('../components/HomeScene.jsx');
const homeLines = home.split('\n');
for (const comp of ['TextureProvider', 'GodOrbitRings', 'SystemRings', 'BackdropPlanets', 'MarsBackground', 'SunBackground', 'AsteroidField', 'HubTieFlight']) {
  // A mount is gated when 'diving_to_street' appears on its own
  // line or on the gate opener just above it (multi-line mounts
  // like SunBackground carry the gate on the `{!... && (` line
  // above the `<Comp` line — the old single-line check missed
  // those and failed a correctly gated mount).
  const gated = homeLines.some((line, i) => line.includes(`<${comp}`)
    && (line.includes('diving_to_street')
      || homeLines.slice(Math.max(0, i - 2), i).some((prev) => prev.includes('diving_to_street'))));
  check(`hub vista gated at street: ${comp}`, gated);
}

const car = read('../components/EarthSupercar.jsx');
check('rings: car ring REMOVED (Merlin 2026-10-26 — visual only, no logic rode on it)', !car.includes('ringGeometry'));
check('rings: no raw 1.6–1.9 hub-unit rings left', !car.includes('[1.6, 1.9'));
check('vehicles: facet grounding present', car.includes('patchFacetRadiusAt'));
// The TRON bike and the walker are gone (vehicles only,
// 2026-11-15) — the facet-grounding law now rides on the car
// alone, and the walker file is gone with the walker.
check('walker file is gone', !existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'EarthWalker.jsx')));
check('bike file is gone', !existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'EarthBike.jsx')));
check('camera: facet clamp present', read('../components/EarthFlightController.jsx').includes('patchFacetRadiusAt'));
check('camera: first-person snaps to head', read('../components/EarthFlightController.jsx').includes('camera.position.copy(camPos)'));
check('car: hidden when mounted in first person', car.includes("effectiveEarthViewMode() === 'first'") && car.includes('carState.mounted'));

const consoleSrc = read('../components/EarthConsole.jsx');
check('console: ladder/monument hint gone', !consoleSrc.includes('Double-click ladders'));
check('console: aether-in-buildings line gone', !consoleSrc.includes('hidden inside Earth'));
check('console: aether poll gone', !consoleSrc.includes('aetherState'));

// Round 3 (Merlin, 2026-11-15 — crossed out in his screenshot):
// the "Map this world" notice is gone ENTIRELY — component
// deleted, mount + import gone, the text nowhere in a live path.
// The Oblivion rule itself is untouched (Jupiter lever only,
// pinned in earth1-entry).
check('notice: component deleted', !existsSync('../components/EarthOblivionPrompt.jsx'));
const page = read('../app/page.jsx');
check('notice: text gone from the page', !page.includes('Map this world'));
check('notice: no mount in the page', !page.includes('EarthOblivionPrompt'));

const fintrac = read('../lib/fintrac-explanation.js');
check('fintrac: skip semantics untouched (per-load auto-show)', fintrac.includes("pathname === '/'") && fintrac.includes('!dismissed'));

const staged = read('../lib/earth/staged-objects.js');
check('staged-objects gate preserved', staged.length > 0);
check('car lazy-load preserved', read('../lib/earth/car-model.js').includes('ensureCarModel'));
check('dpr cap preserved', home.includes('1.75'));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
