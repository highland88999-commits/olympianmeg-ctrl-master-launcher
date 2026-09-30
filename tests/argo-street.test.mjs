// tests/argo-street.test.mjs — Headless tests for street-level ARGO.
// Run: node tests/argo-street.test.mjs (from the repo root).
// No browser, no network — asserts on lib/argo-street.js math plus
// source-level checks (route behavior, no key leaks, honest fallback).
import { readFileSync } from 'fs';
import assert from 'node:assert/strict';
import {
  WGS84_A,
  wgs84ToEcef,
  ecefToStreetMatrix,
  applyMatrix4,
  hashStr,
  mulberry32,
  streetLayout,
  STREET_HOVER_M,
  STREET_GOLD_PER_BAR,
} from '../lib/argo-street.js';

let pass = 0;
function ok(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

// --- WGS84 math ---

ok('ecef: equator prime meridian lands on the semi-major axis', () => {
  const p = wgs84ToEcef(0, 0, 0);
  assert.ok(Math.abs(p.x - WGS84_A) < 0.01, `x=${p.x}`);
  assert.ok(Math.abs(p.y) < 0.01, `y=${p.y}`);
  assert.ok(Math.abs(p.z) < 0.01, `z=${p.z}`);
});

ok('ecef: north pole z ≈ a(1−e²)', () => {
  const p = wgs84ToEcef(90, 0, 0);
  assert.ok(Math.abs(p.z - 6356752.31) < 1, `z=${p.z}`);
  assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1);
});

ok('street matrix: origin maps to (0,0,0)', () => {
  const lat = 53.5461, lon = -113.4938;
  const m = ecefToStreetMatrix(lat, lon, 0);
  const out = applyMatrix4(m, wgs84ToEcef(lat, lon, 0));
  assert.ok(Math.abs(out.x) < 0.01 && Math.abs(out.y) < 0.01 && Math.abs(out.z) < 0.01,
    JSON.stringify(out));
});

ok('street matrix: +1° north lands on -z (south is +z)', () => {
  const lat = 53.5461, lon = -113.4938;
  const m = ecefToStreetMatrix(lat, lon, 0);
  const out = applyMatrix4(m, wgs84ToEcef(lat + 1, lon, 0));
  // ~111km north => z strongly negative, x ~ 0, y ~ 0 (ellipsoid curvature small)
  assert.ok(out.z < -100000, `z=${out.z}`);
  assert.ok(Math.abs(out.x) < 2000, `x=${out.x}`);
});

ok('street matrix: +1° east lands on +x', () => {
  const lat = 53.5461, lon = -113.4938;
  const m = ecefToStreetMatrix(lat, lon, 0);
  const out = applyMatrix4(m, wgs84ToEcef(lat, lon + 1, 0));
  assert.ok(out.x > 60000, `x=${out.x}`);
  assert.ok(Math.abs(out.z) < 2000, `z=${out.z}`);
});

ok('street matrix: +100m altitude lands on +y', () => {
  const lat = 53.5461, lon = -113.4938;
  const m = ecefToStreetMatrix(lat, lon, 0);
  const out = applyMatrix4(m, wgs84ToEcef(lat, lon, 100));
  assert.ok(Math.abs(out.y - 100) < 0.5, `y=${out.y}`);
  assert.ok(Math.abs(out.x) < 0.5 && Math.abs(out.z) < 0.5);
});

// --- deterministic layout ---

ok('layout is deterministic for a destination key', () => {
  const a = streetLayout('edmonton');
  const b = streetLayout('edmonton');
  assert.deepEqual(a, b);
});

ok('layout differs between destinations', () => {
  const a = streetLayout('edmonton');
  const b = streetLayout('tokyo');
  assert.notDeepEqual(a.billboards, b.billboards);
});

ok('layout has 12 billboards, 3 portals, 8 gold bars', () => {
  const l = streetLayout('paris');
  assert.equal(l.billboards.length, 12);
  assert.equal(l.portals.length, 3);
  assert.equal(l.goldBars.length, 8);
});

ok('billboards ring 60–170m and face the center', () => {
  const l = streetLayout('giza');
  for (const b of l.billboards) {
    const r = Math.hypot(b.x, b.z);
    assert.ok(r >= 55 && r <= 175, `r=${r}`);
    // faceAngle should point back at origin: direction (x,z) -> angle
    const toCenter = Math.atan2(-b.x, -b.z);
    let d = Math.abs(toCenter - b.faceAngle) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    assert.ok(d < 0.35, `facing off by ${d}`);
  }
});

ok('last gold bar is tucked behind billboard 0', () => {
  const l = streetLayout('rio');
  const tucked = l.goldBars[7];
  const b0 = l.billboards[0];
  assert.ok(tucked.tucked);
  const dirB = Math.atan2(b0.z, b0.x);
  const dirG = Math.atan2(tucked.z, tucked.x);
  let d = Math.abs(dirB - dirG) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  assert.ok(d < 0.05, `angular offset ${d}`);
  assert.ok(Math.hypot(tucked.x, tucked.z) > Math.hypot(b0.x, b0.z));
});

ok('gold economy constant: 1000 liquid gold per bar', () => {
  assert.equal(STREET_GOLD_PER_BAR, 1000);
});

ok('street hover height sane', () => {
  assert.ok(STREET_HOVER_M >= 1 && STREET_HOVER_M <= 5);
});

ok('hash + prng stable', () => {
  assert.equal(hashStr('argo-street:edmonton'), hashStr('argo-street:edmonton'));
  const r1 = mulberry32(42), r2 = mulberry32(42);
  assert.equal(r1(), r2());
});

// --- source-level checks ---

const SRC = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

ok('page: descent skips when reduced motion is on', () => {
  const src = SRC('../app/argo/page.jsx');
  assert.ok(src.includes('reduced') && src.includes('street'), 'must honor reduced motion');
});

ok('page: street mode renders the real tile renderer, not a fake', () => {
  const src = SRC('../app/argo/page.jsx');
  assert.ok(src.includes('StreetEarth'), 'street must use the Google tile renderer');
  assert.ok(!src.match(/fake (tiles|earth|globe)|mock (tiles|earth)|placeholder (tiles|earth)|procedural earth/i), 'no fake tiles');
});

ok('API key never enters the browser bundle', () => {
  for (const p of ['../lib/maptiles-session.js', '../components/argo/StreetEarth.jsx', '../app/argo/page.jsx']) {
    const src = SRC(p);
    // The env var NAME may appear in comments documenting the trust
    // boundary; the actual secret must never be read client-side.
    assert.ok(!src.match(/process\.env\.GOOGLE_MAP_TILES_API_KEY/), `${p} reads the key client-side`);
    assert.ok(!src.match(/NEXT_PUBLIC.*MAP.*TILES|MAP_TILES.*['"`][A-Za-z0-9_-]{20,}/), `${p} embeds a key`);
  }
});

ok('partners: 7 partners + stake + betty + YOUR AD HERE', () => {
  const src = SRC('../lib/partners.js');
  for (const url of [
    'margovil.pxf.io/PzNOEj',
    'globaloneclicktechnologycolimited.pxf.io/k4GOEV',
    'openartai.pxf.io/B5onaJ',
    'gearup.sjv.io/L03KL0',
    'petscosset.pxf.io/QY3j96',
    'missacccom.pxf.io/oNq1Po',
    'helloprenupinc.sjv.io/AgXPOa',
    'stake.com/?c=1FofAXWx',
    'betty.ca/join/richardnsky8g',
  ]) {
    assert.ok(src.includes(url), `missing ${url}`);
  }
  assert.ok(src.includes('YOUR AD HERE'));
});

ok('billboard monuments: tower-panel design at 1.5x', () => {
  const src = SRC('../components/argo/BillboardMonument.jsx');
  // Tower-panel dims x1.5: frame [6.3,10.8,0.3], face [5.7,6.75],
  // magenta [6.0,7.05], CTA [5.7,1.2,0.15], email strip [5.7,0.9].
  for (const d of ['FRAME_W = 6.3', 'FRAME_H = 10.8', 'FRAME_D = 0.3',
    'FACE_W = 5.7', 'FACE_H = 6.75', 'MAG_W = 6.0', 'MAG_H = 7.05',
    'CTA_W = 5.7', 'CTA_H = 1.2', 'CTA_D = 0.15', 'MAIL_W = 5.7', 'MAIL_H = 0.9']) {
    assert.ok(src.includes(d), `missing ${d}`);
  }
  // Old obelisk + gold-edge monument look is gone.
  assert.ok(!src.includes('11.6') && !src.includes('[13, 1, 3.4]'), 'old monument dims remain');
  assert.ok(!src.match(/name="edge"|gold edge/i), 'old gold-edge look remains');
  // Portrait canvas matched to the face aspect; creatives drawn cover-fit
  // (aspect preserved) so partner logos never stretch.
  assert.ok(src.includes('CANVAS_W = 1140') && src.includes('CANVAS_H = 1350'), 'portrait canvas');
  assert.ok(src.includes('drawCover'), 'cover-fit creative draw missing');
  // Tower ad panels themselves are untouched (still original size).
  const ares = SRC('../components/Ares.jsx');
  assert.ok(ares.includes('[4.2, 7.2, 0.2]'), 'Ares tower panel changed');
});

console.log(`\n${pass} street-level checks passed.`);
