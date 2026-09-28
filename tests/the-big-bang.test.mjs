// Tests for The Big Bang 3D conversion: cosmos logic, universe3d pure
// helpers, module load, and static audits (no network, no telemetry,
// no postprocessing). Run: node --test tests/the-big-bang.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  yearsAfterBang,
  formatYears,
  stageFor,
  expansionFactor,
  makeParticles,
  starColor,
  starBrightness,
} from '../app/the-big-bang/cosmos.js';

import {
  WORLD_R,
  PARTICLE_HIGH,
  PARTICLE_LOW,
  pickParticleCount,
  smoothstep,
  cameraDistanceFor,
  solarBlendFor,
  flashFor,
  swirlWeightFor,
  createUniverseScene,
} from '../app/the-big-bang/universe3d.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'the-big-bang');
const allCode = readdirSync(appDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.jsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'))
  .join('\n');
const sceneSrc = readFileSync(join(appDir, 'universe3d.js'), 'utf8');
const pageSrc = readFileSync(join(appDir, 'page.jsx'), 'utf8');

// ---------- cosmos.js logic ----------

test('yearsAfterBang maps 0->0 and 1->13.8e9 (cubic feel)', () => {
  assert.equal(yearsAfterBang(0), 0);
  assert.equal(yearsAfterBang(1), 13.8e9);
  assert.ok(yearsAfterBang(0.5) < 13.8e9 / 2); // cubic: slow start
});

test('formatYears covers instant/thousands/millions/billions', () => {
  assert.equal(formatYears(0.5), 'the first instant');
  assert.ok(formatYears(500).includes('years'));
  assert.ok(formatYears(5e4).includes('thousand'));
  assert.ok(formatYears(5e7).includes('million'));
  assert.ok(formatYears(5e9).includes('billion'));
});

test('stageFor walks flash -> present across the timeline', () => {
  assert.equal(stageFor(0).id, 'flash');
  assert.equal(stageFor(1).id, 'present');
  const ids = [0.001, 0.05, 0.3, 0.6, 0.9, 1].map((t) => stageFor(t).id);
  assert.deepEqual(ids, ['flash', 'dark', 'stars', 'galaxies', 'solar', 'present']);
});

test('expansionFactor is 0->1 and monotonic', () => {
  assert.equal(expansionFactor(0), 0);
  assert.equal(expansionFactor(1), 1);
  assert.ok(expansionFactor(0.2) < expansionFactor(0.8));
});

test('makeParticles is deterministic per seed', () => {
  const a = makeParticles(42, 50);
  const b = makeParticles(42, 50);
  const c = makeParticles(43, 50);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.length, 50);
  for (const p of a) {
    assert.ok(Math.hypot(p.dx, p.dy, p.dz) <= 1.0001, 'direction is unit-ish');
  }
});

test('starBrightness is dark before ignition, flashes at birth', () => {
  const p = { ignite: 0.5, speed: 1, temp: 0 };
  assert.equal(starBrightness(p, 0.4), 0);
  assert.ok(starBrightness(p, 0.505) > 0);
  assert.ok(starBrightness(p, 0.9) >= 0.25);
});

test('starColor returns young blue-white -> old red rgb ints', () => {
  const young = { ignite: 0.5, temp: 0 };
  const [r1, g1, b1] = starColor(young, 0.51);
  assert.ok(b1 > r1, 'young stars are blue');
  const [r2, g2, b2] = starColor(young, 1.0);
  assert.ok(r2 > b2, 'old stars are red');
  for (const v of [r1, g1, b1, r2, g2, b2]) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
});

// ---------- universe3d.js pure helpers ----------

test('smoothstep clamps and eases', () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});

test('cameraDistanceFor pulls back with expansion, frames solar at the end', () => {
  const d0 = cameraDistanceFor(0);
  const dMid = cameraDistanceFor(0.5);
  const dEnd = cameraDistanceFor(1);
  assert.ok(d0 < dMid, 'camera pulls back as the universe expands');
  assert.ok(Math.abs(dEnd - 105) < 1, 'solar stage framed at ~105 units');
  assert.ok(d0 > 10 && dMid < 200, 'sane range');
});

test('solarBlendFor is 0 early, 1 at the end, monotonic', () => {
  assert.equal(solarBlendFor(0), 0);
  assert.equal(solarBlendFor(1), 1);
  assert.ok(solarBlendFor(0.9) < solarBlendFor(0.95));
});

test('flashFor is 1 at t=0 and 0 past 3%', () => {
  assert.equal(flashFor(0), 1);
  assert.ok(flashFor(0.015) > 0 && flashFor(0.015) < 1);
  assert.equal(flashFor(0.03), 0);
  assert.equal(flashFor(0.5), 0);
});

test('swirlWeightFor peaks in the galaxies stage', () => {
  const w = [0.001, 0.05, 0.3, 0.6, 0.9].map(swirlWeightFor);
  assert.deepEqual(w, [0, 0, 0.3, 1, 0.15]);
});

test('pickParticleCount drops for low-power devices', () => {
  assert.equal(pickParticleCount(true), PARTICLE_LOW);
  assert.equal(pickParticleCount(false), PARTICLE_HIGH);
  assert.ok(PARTICLE_LOW < PARTICLE_HIGH && WORLD_R > 0);
});

test('createUniverseScene is exported as a factory function', () => {
  assert.equal(typeof createUniverseScene, 'function');
});

// ---------- static audits ----------

test('no telemetry, credentials, or external calls in built files', () => {
  const banned = [
    'supabase', 'ipify', 'central_telemetry', 'track_ping', 'nexus_visitor_id',
    'logBrainAction', 'brain-uplink', 'OMEGA MIND', 'api.ipify', 'catbox',
  ];
  for (const s of banned) assert.ok(!allCode.includes(s), `banned string present: ${s}`);
});

test('no external URLs, iframes, video, or mailto', () => {
  assert.ok(!allCode.includes('https://'), 'no https URLs allowed');
  assert.ok(!allCode.includes('http://'), 'no http URLs allowed');
  assert.ok(!/<iframe/i.test(allCode), 'no iframes allowed');
  assert.ok(!/<video/i.test(allCode), 'no video tags allowed');
  assert.ok(!allCode.includes('mailto:'), 'no mailto links allowed');
});

test('no CDN imports; three.js comes from the local bundle only', () => {
  for (const s of ['unpkg', 'jsdelivr', 'cdnjs', 'vercel.app']) {
    assert.ok(!allCode.toLowerCase().includes(s), `banned CDN present: ${s}`);
  }
  assert.ok(/from 'three'/.test(sceneSrc), 'three imported from the local package');
});

test('no heavy postprocessing (lighting rule); glow stays localized', () => {
  assert.ok(!/new\s+UnrealBloomPass\s*\(/.test(allCode), 'no UnrealBloomPass instances allowed');
  assert.ok(!/new\s+EffectComposer\s*\(/.test(allCode), 'no EffectComposer instances allowed');
  assert.ok(!/postprocessing\//.test(allCode), 'no postprocessing addon imports allowed');
});

test('scene honors prefers-reduced-motion and exposes dispose', () => {
  assert.ok(/reducedMotion/.test(sceneSrc), 'scene accepts reducedMotion');
  assert.ok(/dispose/.test(sceneSrc), 'scene exposes dispose');
  assert.ok(/prefers-reduced-motion/.test(pageSrc), 'page reads the media query');
});

test('page wires the 3D scene: create, setTime, render, dispose', () => {
  assert.ok(/createUniverseScene/.test(pageSrc), 'page creates the scene');
  assert.ok(/\.setTime\(/.test(pageSrc), 'page drives scene time');
  assert.ok(/\.render\(\)/.test(pageSrc), 'page renders the scene');
  assert.ok(/\.dispose\(\)/.test(pageSrc), 'page disposes the scene');
  assert.ok(/\.resize\(/.test(pageSrc), 'page resizes the scene');
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});

test('reduced motion: timeline never auto-plays (scrub-only fallback)', () => {
  assert.ok(/if \(U\.playing && !reduced\)/.test(pageSrc), 'auto-play gated on reduced flag');
  assert.ok(/disabled=\{reduced\}/.test(pageSrc), 'Play/Replay buttons disabled when reduced');
  assert.ok(/scrub-only/i.test(pageSrc), 'fallback documented in code');
});
