// Tests for the Statue of Liberty 3D conversion: 3D hotspot anchors,
// the liberty3d scene module's static contract, and page wiring.
// Run: node --test tests/statue-of-liberty.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HOTSPOTS,
  TIMELINE,
  hotspotById,
  HOTSPOT_ANCHORS_3D,
  anchor3DFor,
} from '../app/statue-of-liberty/liberty.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'statue-of-liberty');
const allCode = readdirSync(appDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.jsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'))
  .join('\n');
const sceneSrc = readFileSync(join(appDir, 'liberty3d.js'), 'utf8');
const pageSrc = readFileSync(join(appDir, 'page.jsx'), 'utf8');

// ---------- 3D hotspot anchors ----------

test('every hotspot has a 3D anchor', () => {
  assert.equal(HOTSPOTS.length, 5);
  for (const h of HOTSPOTS) {
    const a = anchor3DFor(h.id);
    assert.ok(a, `missing anchor for ${h.id}`);
    assert.equal(a.length, 3);
    assert.ok(a.every((v) => Number.isFinite(v)), `non-numeric anchor for ${h.id}`);
  }
});

test('anchors match the monument proportions', () => {
  const torch = HOTSPOT_ANCHORS_3D.torch;
  const crown = HOTSPOT_ANCHORS_3D.crown;
  const pedestal = HOTSPOT_ANCHORS_3D.pedestal;
  assert.ok(torch[1] > 12.5, 'torch anchor up at the flame');
  assert.ok(crown[1] > 10 && crown[1] < torch[1], 'crown below the torch');
  assert.ok(pedestal[1] < 3, 'pedestal anchor near the ground');
  assert.ok(HOTSPOT_ANCHORS_3D.robe[1] < crown[1], 'robe below the crown');
});

test('anchor3DFor returns null for unknown ids', () => {
  assert.equal(anchor3DFor('atlantis'), null);
});

test('hotspot content is untouched by the 3D move', () => {
  assert.equal(TIMELINE.length, 3);
  assert.ok(hotspotById('torch').title.length > 0);
});

// ---------- liberty3d.js scene contract ----------

test('scene imports the real three.js addons locally', () => {
  assert.ok(/from 'three'/.test(sceneSrc), 'three from local bundle');
  assert.ok(/controls\/OrbitControls\.js/.test(sceneSrc), 'OrbitControls imported');
  assert.ok(/loaders\/GLTFLoader\.js/.test(sceneSrc), 'GLTFLoader imported');
});

test('scene loads the procedural GLB from a blob URL (zero network)', () => {
  assert.ok(/buildStatueGlb\(\)/.test(sceneSrc), 'uses the module-local GLB builder');
  assert.ok(/createObjectURL/.test(sceneSrc), 'blob URL for the GLB');
  assert.ok(/revokeObjectURL/.test(sceneSrc), 'blob URL revoked on dispose');
});

test('scene exposes the full exhibit API', () => {
  for (const name of ['ready', 'setNight', 'zoomBy', 'project', 'render', 'resize', 'dispose']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(sceneSrc), `missing API: ${name}`);
  }
});

test('scene caps pixel ratio for mobile GPUs', () => {
  assert.ok(/MAX_DPR\s*=\s*2/.test(sceneSrc), 'DPR capped at 2');
});

test('scene honors prefers-reduced-motion (no auto-rotate)', () => {
  assert.ok(/reducedMotion/.test(sceneSrc), 'accepts reducedMotion');
  assert.ok(/autoRotate = !reducedMotion/.test(sceneSrc), 'auto-rotate off when reduced');
  assert.ok(/prefers-reduced-motion/.test(pageSrc), 'page reads the media query');
});

test('night mode keeps glow localized (lighting rule)', () => {
  assert.ok(/PointLight/.test(sceneSrc), 'torch is a localized point light');
  assert.ok(!/new\s+UnrealBloomPass\s*\(/.test(allCode), 'no bloom passes');
  assert.ok(!/new\s+EffectComposer\s*\(/.test(allCode), 'no effect composer');
});

test('project() hides markers on the far side of the monument', () => {
  assert.ok(/facing/.test(sceneSrc), 'facing check present');
  assert.ok(/visible/.test(sceneSrc), 'visibility flag returned');
});

// ---------- page wiring ----------

test('page drives the 3D scene: create, render, markers, dispose', () => {
  assert.ok(/createLibertyScene/.test(pageSrc), 'page creates the scene');
  assert.ok(/scene3d\.render\(/.test(pageSrc), 'page renders each frame');
  assert.ok(/scene3d\.resize\(/.test(pageSrc), 'page resizes the scene');
  assert.ok(/scene3d\.project\(/.test(pageSrc), 'page pins hotspot markers');
  assert.ok(/scene3d\.dispose\(\)/.test(pageSrc), 'page disposes the scene');
});

test('page keeps the exhibit UI: night toggle, zoom, timeline, GLB download', () => {
  assert.ok(/setNight\(/.test(pageSrc), 'night toggle kept');
  assert.ok(/zoomBy\(/.test(pageSrc), 'zoom controls kept');
  assert.ok(/TIMELINE\.map/.test(pageSrc), 'timeline kept');
  assert.ok(/downloadGlb/.test(pageSrc), 'GLB download kept');
});

test('old 2D paint path is gone', () => {
  assert.ok(!/paintStatue/.test(pageSrc), '2D paintStatue removed');
  assert.ok(!/paintSkyline/.test(pageSrc), '2D paintSkyline removed');
  assert.ok(!/toScreen\(/.test(pageSrc), '2D projection removed');
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

test('no CDN imports anywhere', () => {
  for (const s of ['unpkg', 'jsdelivr', 'cdnjs', 'vercel.app']) {
    assert.ok(!allCode.toLowerCase().includes(s), `banned CDN present: ${s}`);
  }
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});
