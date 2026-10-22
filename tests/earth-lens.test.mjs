// tests/earth-lens.test.mjs — the satellite detail lens rebuild
// (demo flaw E2): registered tile plans that cover the disc, and
// geometry draped over the real terrain so relief can never poke
// through. Synthetic heightmaps keep it dependency-free.
// Run: node tests/earth-lens.test.mjs (from the repo root).
import assert from 'node:assert';
import {
  LENS_PRESETS,
  LENS_LIFT,
  tileFloat,
  lensTilePlan,
  uvForLatLon,
  latLonFromDir,
  buildLensGeometryData,
} from '../lib/earth/lens.js';
import { surfaceRadiusAt } from '../lib/earth/placements.js';
import { latLonToVec3, EARTH_RADIUS } from '../lib/geo.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

const OW = 256, OH = 128;
const sea = new Uint8Array(OW * OH).fill(12);
// A rugged synthetic world: a sharp peak near (48.85, 2.29).
const rugged = new Uint8Array(OW * OH).fill(30);
{
  const px = Math.floor(((2.29 + 180) / 360) * OW);
  const py = Math.floor(((90 - 48.85) / 180) * OH);
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      rugged[(py + y) * OW + (px + x)] = 255 - (Math.abs(x) + Math.abs(y)) * 30;
    }
  }
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

check('presets: the tile grid covers the disc at both ranges', () => {
  for (const [name, p] of Object.entries(LENS_PRESETS)) {
    const tileDeg = 360 / 2 ** p.zoom;
    const coverDeg = tileDeg * p.grid;
    const discDeg = (2 * p.radiusUnits / EARTH_RADIUS) * (180 / Math.PI);
    // The feathered rim hides the last sliver; coverage must reach
    // at least 90% of the disc diameter.
    assert.ok(coverDeg >= discDeg * 0.9, `${name}: covers ${coverDeg} vs disc ${discDeg}`);
    assert.equal(p.canvasPx % p.grid, 0);
  }
});

check('street range tripled around the player (Merlin, 2026-10-22: render range ×3)', () => {
  const s = LENS_PRESETS.street;
  // 0.48 → 1.44 hub units (≈30 m → ≈90 m photographic radius).
  assert.ok(near(s.radiusUnits, 0.48 * 3), `street radius ${s.radiusUnits}`);
  // The wider disc keeps FULL grid coverage (not just the 90%
  // floor): 36 × 0.088° (z12) = 3.16° ≥ the 3.0° disc diameter.
  const tileDeg = 360 / 2 ** s.zoom;
  const discDeg = (2 * s.radiusUnits / EARTH_RADIUS) * (180 / Math.PI);
  assert.ok(tileDeg * s.grid >= discDeg, `street covers ${tileDeg * s.grid} vs disc ${discDeg}`);
  // The overlook sheet is the orbital focus, not a per-player
  // range: deliberately NOT tripled.
  assert.ok(near(LENS_PRESETS.overlook.radiusUnits, 5.2), 'overlook radius must stay 5.2');
});

check('tile plan: row-major tiles that exactly tile the canvas', () => {
  const plan = lensTilePlan(48.8584, 2.2945, 8, 8, 2048);
  assert.equal(plan.tiles.length, 64);
  assert.equal(plan.tilePx, 256);
  const seen = new Set();
  for (const t of plan.tiles) {
    assert.ok(t.url && t.url.includes(`/tile/8/${t.y}/${t.x}`), t.url);
    seen.add(`${t.px},${t.py}`);
  }
  assert.equal(seen.size, 64);
  assert.ok(seen.has('0,0') && seen.has('1792,1792'));
  // Grid brackets the focus tile.
  const c = tileFloat(48.8584, 2.2945, 8);
  assert.ok(plan.gridLeft <= Math.floor(c.fx) && Math.floor(c.fx) < plan.gridLeft + 8);
  assert.ok(plan.gridTop <= Math.floor(c.fy) && Math.floor(c.fy) < plan.gridTop + 8);
});

check('uv mapping: the focus sits mid-texture; east/north increase u/v', () => {
  const plan = lensTilePlan(0, 0, 8, 8, 2048);
  const c = uvForLatLon(0, 0, plan);
  assert.ok(c.u > 0.35 && c.u < 0.65 && c.v > 0.35 && c.v < 0.65, JSON.stringify(c));
  const e = uvForLatLon(0, 1, plan);
  const n = uvForLatLon(1, 0, plan);
  assert.ok(e.u > c.u, 'east must move u up');
  assert.ok(n.v > c.v, 'north must move v up (v=1 is canvas top)');
});

check('latLonFromDir inverts latLonToVec3', () => {
  for (const [lat, lon] of [[0, 0], [48.85, 2.29], [-33.96, 18.41], [35.36, 138.73], [-25.34, 131.04]]) {
    const d = latLonToVec3(lat, lon, 1);
    const back = latLonFromDir(d);
    assert.ok(near(back.lat, lat, 1e-9), `${lat} -> ${back.lat}`);
    assert.ok(near(back.lon, lon, 1e-9), `${lon} -> ${back.lon}`);
  }
});

check('draped geometry: every vertex rides the terrain + lift, never under it', () => {
  const plan = lensTilePlan(48.85, 2.29, LENS_PRESETS.overlook.zoom, LENS_PRESETS.overlook.grid, 2048);
  const g = buildLensGeometryData(rugged, OW, OH, 48.85, 2.29, 1.2, plan, { rings: 10, sectors: 24 });
  assert.equal(g.vertexCount, 1 + 10 * 24);
  for (let i = 0; i < g.vertexCount; i++) {
    const x = g.positions[i * 3], y = g.positions[i * 3 + 1], z = g.positions[i * 3 + 2];
    const r = Math.hypot(x, y, z);
    const ll = latLonFromDir({ x: x / r, y: y / r, z: z / r });
    const surf = surfaceRadiusAt(rugged, OW, OH, ll.lat, ll.lon);
    // Bilinear resampling at the round-tripped lat/lon jitters by
    // ~1e-6..1e-5 on cliff faces; the drape guarantee is the lift.
    assert.ok(r >= surf + LENS_LIFT - 2e-4, `vertex ${i} at ${r} under surface ${surf}`);
    assert.ok(r <= surf + LENS_LIFT + 2e-4, `vertex ${i} floats at ${r} over surface ${surf}`);
    const uv = { u: g.uvs[i * 2], v: g.uvs[i * 2 + 1] };
    assert.ok(uv.u >= -0.05 && uv.u <= 1.05 && uv.v >= -0.05 && uv.v <= 1.05,
      `vertex ${i} uv ${uv.u},${uv.v} far outside the sheet`);
  }
});

check('draped geometry: winding faces away from the planet', () => {
  const plan = lensTilePlan(0, 0, 8, 8, 2048);
  const g = buildLensGeometryData(sea, OW, OH, 0, 0, 2.0, plan, { rings: 6, sectors: 16 });
  const P = (i) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
  for (let t = 0; t < g.indices.length; t += 3) {
    const [a, b, c] = [P(g.indices[t]), P(g.indices[t + 1]), P(g.indices[t + 2])];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const d = n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2];
    assert.ok(d > 0, `triangle ${t / 3} faces inward (dot ${d})`);
  }
});

console.log(`earth-lens: ${passed} checks passed`);
