// Tests for the Convergence 3D conversion: engine 2D + 3D logic,
// field3d pure helpers, and static audits. Run:
// node --test tests/convergence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bandLevels,
  demoSignal,
  makeParticle,
  stepConvergence,
  FIELD_R,
  makeParticle3D,
  stepConvergence3D,
  meanRadius,
} from '../app/convergence/engine.js';

import {
  hslToRgb,
  coreRadiusFor,
  createFieldScene,
} from '../app/convergence/field3d.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'convergence');
const allCode = readdirSync(appDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.jsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'))
  .join('\n');
const sceneSrc = readFileSync(join(appDir, 'field3d.js'), 'utf8');
const pageSrc = readFileSync(join(appDir, 'page.jsx'), 'utf8');

function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 2D engine still intact ----------

test('bandLevels splits bass/mid/treble', () => {
  const data = new Array(128).fill(0);
  for (let i = 0; i < 15; i++) data[i] = 255;
  const lv = bandLevels(data);
  assert.ok(lv.bass > 0.9 && lv.mid < 0.1 && lv.treble < 0.1);
});

test('demoSignal is deterministic and bounded', () => {
  const a = demoSignal(1.5, 128);
  const b = demoSignal(1.5, 128);
  assert.deepEqual(a, b);
  assert.ok(a.every((v) => v >= 0 && v <= 255));
});

test('stepConvergence 2D still pulls toward center', () => {
  const rng = seededRng(9);
  const p = makeParticle(800, 600, rng);
  const d0 = Math.hypot(p.x - 400, p.y - 300);
  stepConvergence(p, { bass: 1, mid: 0, treble: 0 }, 800, 600, 0.05, 1);
  const d1 = Math.hypot(p.x - 400, p.y - 300);
  assert.ok(d1 < d0);
});

// ---------- 3D engine ----------

test('makeParticle3D spawns inside the field sphere', () => {
  const rng = seededRng(21);
  for (let i = 0; i < 100; i++) {
    const p = makeParticle3D(rng);
    assert.ok(Math.hypot(p.x, p.y, p.z) <= FIELD_R + 1e-9);
    assert.ok(p.orbit >= 0.3 && p.orbit <= 1.2);
  }
});

test('stepConvergence3D: bass pulls toward the core', () => {
  const rng = seededRng(22);
  const ps = Array.from({ length: 200 }, () => makeParticle3D(rng));
  const r0 = meanRadius(ps);
  for (const p of ps) stepConvergence3D(p, { bass: 1, mid: 0, treble: 0 }, 0.016, 1);
  assert.ok(meanRadius(ps) < r0, 'mean radius shrinks under full bass');
});

test('stepConvergence3D: mid swirls around the Y axis', () => {
  const rng = seededRng(23);
  const ps = Array.from({ length: 200 }, () => makeParticle3D(rng));
  const before = ps.map((p) => Math.atan2(p.z, p.x));
  for (const p of ps) stepConvergence3D(p, { bass: 0, mid: 1, treble: 0 }, 0.05, 1);
  const moved = ps.filter((p, i) => Math.abs(Math.atan2(p.z, p.x) - before[i]) > 1e-4).length;
  assert.ok(moved > 150, `swirl moved ${moved}/200 particles`);
});

test('stepConvergence3D: treble scatters outward', () => {
  const rng = seededRng(24);
  const ps = Array.from({ length: 200 }, () => makeParticle3D(rng));
  const r0 = meanRadius(ps);
  for (const p of ps) stepConvergence3D(p, { bass: 0, mid: 0, treble: 1 }, 0.05, 1);
  assert.ok(meanRadius(ps) > r0, 'mean radius grows under full treble');
});

test('stepConvergence3D: particles stay contained, zero levels are calm', () => {
  const rng = seededRng(25);
  const ps = Array.from({ length: 300 }, () => makeParticle3D(rng));
  for (let s = 0; s < 120; s++) {
    for (const p of ps) stepConvergence3D(p, { bass: 0.8, mid: 0.7, treble: 0.6 }, 0.016, 2.5);
  }
  assert.ok(ps.every((p) => Math.hypot(p.x, p.y, p.z) <= FIELD_R + 1e-6), 'contained at max strength');
  const q = makeParticle3D(rng);
  const snap = { ...q };
  stepConvergence3D(q, { bass: 0, mid: 0, treble: 0 }, 0.016, 1);
  assert.ok(Math.abs(q.x - snap.x) < 1e-6 && Math.abs(q.vx) < 1e-9, 'no force at zero levels');
});

// ---------- field3d pure helpers ----------

test('hslToRgb hits the primaries', () => {
  const eq = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  assert.ok(eq(hslToRgb(0, 1, 0.5), [1, 0, 0]), 'red');
  assert.ok(eq(hslToRgb(120, 1, 0.5), [0, 1, 0]), 'green');
  assert.ok(eq(hslToRgb(240, 1, 0.5), [0, 0, 1]), 'blue');
  assert.ok(eq(hslToRgb(0, 0, 1), [1, 1, 1]), 'white');
  assert.ok(eq(hslToRgb(0, 0, 0), [0, 0, 0]), 'black');
});

test('coreRadiusFor grows with bass like the 2D core', () => {
  assert.equal(coreRadiusFor(0), 26);
  assert.equal(coreRadiusFor(1), 116);
  assert.ok(coreRadiusFor(0.5) < coreRadiusFor(1));
});

test('createFieldScene is exported as a factory function', () => {
  assert.equal(typeof createFieldScene, 'function');
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

test('no heavy postprocessing (lighting rule)', () => {
  assert.ok(!/new\s+UnrealBloomPass\s*\(/.test(allCode), 'no UnrealBloomPass instances');
  assert.ok(!/new\s+EffectComposer\s*\(/.test(allCode), 'no EffectComposer instances');
  assert.ok(!/postprocessing\//.test(allCode), 'no postprocessing addon imports');
});

test('mic audio stays local: no MediaRecorder, no uploads', () => {
  assert.ok(!/MediaRecorder|fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(allCode),
    'no audio capture exfiltration paths');
  assert.ok(/getUserMedia/.test(allCode), 'mic path still present');
});

test('scene honors prefers-reduced-motion and exposes dispose', () => {
  assert.ok(/reducedMotion/.test(sceneSrc), 'scene accepts reducedMotion');
  assert.ok(/dispose/.test(sceneSrc), 'scene exposes dispose');
  assert.ok(/prefers-reduced-motion/.test(pageSrc), 'page reads the media query');
});

test('page wires the 3D field: create, setParams, setState, render, dispose', () => {
  assert.ok(/createFieldScene/.test(pageSrc), 'page creates the scene');
  assert.ok(/\.setState\(/.test(pageSrc), 'page pushes levels');
  assert.ok(/\.setParams\(/.test(pageSrc), 'page pushes control params');
  assert.ok(/\.render\(\)/.test(pageSrc), 'page renders the scene');
  assert.ok(/\.dispose\(\)/.test(pageSrc), 'page disposes the scene');
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});

test('reduced motion: field holds one fixed sample (fully static fallback)', () => {
  assert.ok(/stillLevels/.test(pageSrc), 'fixed demo sample defined');
  assert.ok(/reduced \? stillLevels : currentLevels\(now\)/.test(pageSrc), 'live levels replaced when reduced');
});
