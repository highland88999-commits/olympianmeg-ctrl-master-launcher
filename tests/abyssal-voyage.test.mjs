// Tests for the Abyssal Voyage 3D conversion: engine logic untouched,
// dive3d mapping helpers, and static audits. Run:
// node --test tests/abyssal-voyage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createGame,
  stepGame,
  resetGame,
  DIFFICULTY,
  depthZone,
  circleRect,
  WORLD,
} from '../app/abyssal-voyage/engine.js';

import {
  SX,
  PLAYER_WY,
  GATE_BAR_LEN,
  sceneX,
  sceneZ,
  zonePalette,
  subRollFor,
  createDiveScene,
} from '../app/abyssal-voyage/dive3d.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'abyssal-voyage');
const allCode = readdirSync(appDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.jsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'))
  .join('\n');
const sceneSrc = readFileSync(join(appDir, 'dive3d.js'), 'utf8');
const pageSrc = readFileSync(join(appDir, 'page.jsx'), 'utf8');

// ---------- engine.js untouched ----------

test('createGame builds a playable abyssal game', () => {
  const g = createGame('abyssal', 7);
  assert.equal(g.phase, 'title');
  assert.equal(g.hull, 100);
  assert.equal(g.player.x, WORLD.width / 2);
  assert.deepEqual(Object.keys(DIFFICULTY), ['calm', 'abyssal', 'chaos']);
});

test('stepGame scrolls gates and accrues depth/score', () => {
  const g = createGame('calm', 7);
  g.phase = 'playing';
  stepGame(g, { targetX: null, keyboardAxis: 0 }, 1.0);
  assert.ok(g.depth > 0 && g.score > 0);
  assert.ok(g.obstacles.length > 0, 'a gate spawned');
  const y0 = g.obstacles[0].gapY;
  stepGame(g, { targetX: null, keyboardAxis: 0 }, 1.0);
  assert.ok(g.obstacles[0].gapY >= y0, 'gates fall');
});

test('collision with rock damages the hull', () => {
  const g = createGame('calm', 7);
  g.phase = 'playing';
  // park a rock column right on the player, gap far away
  g.obstacles.push({ x: g.player.x - 10, w: 20, gapY: 50, gapH: 60, passed: false });
  stepGame(g, { targetX: null, keyboardAxis: 0 }, 0.05);
  assert.ok(g.hull < 100, 'hull took damage');
  assert.ok(g.invuln > 0, 'invulnerability window opened');
});

test('pearls are collected for score and hull', () => {
  const g = createGame('calm', 7);
  g.phase = 'playing';
  g.hull = 80;
  g.bits.push({ x: g.player.x, y: g.player.y, vx: 0, vy: 0, kind: 'pearl', r: 9, life: 30 });
  stepGame(g, { targetX: null, keyboardAxis: 0 }, 0.05);
  assert.equal(g.pearls, 1);
  assert.ok(g.hull > 80, 'pearl patched the hull');
});

test('depthZone names the trench layers', () => {
  assert.equal(depthZone(0), 'TWILIGHT ZONE');
  assert.equal(depthZone(2000), 'MIDNIGHT ZONE');
  assert.equal(depthZone(6000), 'ABYSSAL ZONE');
  assert.equal(depthZone(12000), 'HADAL TRENCH');
});

test('circleRect detects circle/rect overlap', () => {
  assert.ok(circleRect(5, 5, 2, 0, 0, 10, 10));
  assert.ok(!circleRect(50, 50, 2, 0, 0, 10, 10));
});

test('resetGame restarts with a fresh seed', () => {
  const g = createGame('abyssal', 7);
  g.phase = 'playing';
  g.hull = 10;
  const r = resetGame(g, 99);
  assert.equal(r.phase, 'playing');
  assert.equal(r.hull, 100);
  assert.equal(r.seed, 99);
});

// ---------- dive3d.js mapping ----------

test('sceneX centers the world at x=0 spanning -20..20', () => {
  assert.equal(sceneX(0), -20);
  assert.equal(sceneX(WORLD.width), 20);
  assert.ok(Math.abs(sceneX(WORLD.width / 2)) < 1e-9);
  assert.ok(sceneX(100) < sceneX(600), 'monotonic');
});

test('sceneZ puts the player at 0 and spawns gates far ahead', () => {
  assert.ok(Math.abs(sceneZ(PLAYER_WY)) < 1e-9, 'player plane is z=0');
  assert.ok(sceneZ(-200) < -40, 'fresh gates spawn far ahead (-Z)');
  assert.ok(sceneZ(WORLD.height + 120) > 20, 'culled gates are past the camera (+Z)');
  assert.ok(sceneZ(100) < sceneZ(500), 'falling maps to +Z travel');
});

test('zonePalette darkens and thickens fog with depth', () => {
  const shallow = zonePalette(0);
  const deep = zonePalette(12000);
  assert.ok(deep.density > shallow.density, 'fog thickens');
  const lum = (c) => c[0] + c[1] + c[2];
  assert.ok(lum(deep.bg) < lum(shallow.bg), 'background darkens');
  const mid = zonePalette(3000);
  assert.ok(mid.density > shallow.density && mid.density < deep.density, 'smooth between stops');
});

test('subRollFor clamps like the 2D tilt', () => {
  assert.equal(subRollFor(0), 0);
  assert.equal(subRollFor(100000), 0.3);
  assert.equal(subRollFor(-100000), -0.3);
});

test('gate bar length is a sane positive constant', () => {
  assert.ok(GATE_BAR_LEN > 0 && GATE_BAR_LEN < 40);
  assert.ok(SX > 0);
});

test('createDiveScene is exported as a factory function', () => {
  assert.equal(typeof createDiveScene, 'function');
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

test('scene honors prefers-reduced-motion and exposes dispose', () => {
  assert.ok(/reducedMotion/.test(sceneSrc), 'scene accepts reducedMotion');
  assert.ok(/dispose/.test(sceneSrc), 'scene exposes dispose');
  assert.ok(/prefers-reduced-motion/.test(pageSrc), 'page reads the media query');
});

test('page wires the 3D dive: create, render, resize, dispose', () => {
  assert.ok(/createDiveScene/.test(pageSrc), 'page creates the scene');
  assert.ok(/dive\.render\(/.test(pageSrc), 'page renders each frame');
  assert.ok(/dive\.resize\(/.test(pageSrc), 'page resizes the scene');
  assert.ok(/dive\.dispose\(\)/.test(pageSrc), 'page disposes the scene');
});

test('game logic still drives the frame loop (engine untouched)', () => {
  assert.ok(/stepGame\(/.test(pageSrc), 'page still steps the game');
  assert.ok(/depthZone\(/.test(pageSrc), 'page still reads zones');
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});
