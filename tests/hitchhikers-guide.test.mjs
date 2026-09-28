// Tests for the Hitchhiker's Guide module: logic unit tests + static scans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TIERS,
  GRAVITY,
  HOLD_THRESHOLD_MS,
  CYCLE_MS,
  createWorld,
  spawnBody,
  stepWorld,
  tierForHoldTime,
  chargeFill,
  mulberry32,
  makeStars,
} from '../app/hitchhikers-guide/singularity.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'hitchhikers-guide');
const allCode = readdirSync(appDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.jsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'))
  .join('\n');

// ---------- Static scans: no telemetry, credentials, or external calls ----------

test('no telemetry or tracking strings in built files', () => {
  const banned = [
    'supabase', 'ipify', 'central_telemetry', 'track_ping', 'nexus_visitor_id',
    'logBrainAction', 'brain-uplink', 'OMEGA MIND', 'omni-dependency',
    'connected_repos', 'api.ipify', 'ezfwzqxwafvdjtwnmyrx', 'amulgdbdvxpikpmldyoq',
  ];
  for (const s of banned) {
    assert.ok(!allCode.includes(s), `banned string present: ${s}`);
  }
});

test('no external URLs, iframes, video tags, or mailto links', () => {
  assert.ok(!allCode.includes('https://'), 'no https URLs allowed');
  assert.ok(!allCode.includes('http://'), 'no http URLs allowed');
  assert.ok(!/<iframe/i.test(allCode), 'no iframes allowed');
  assert.ok(!/<video/i.test(allCode), 'no video tags allowed');
  assert.ok(!allCode.includes('mailto:'), 'no mailto links allowed');
});

test('no CDN imports in built files (three.js comes from the local bundle)', () => {
  const banned = ['unpkg', 'jsdelivr', 'cdnjs', 'catbox', 'tone', 'quill', 'mammoth', 'vercel.app'];
  for (const s of banned) {
    assert.ok(!allCode.toLowerCase().includes(s), `banned dependency present: ${s}`);
  }
  // three.js is allowed only as a local package import, never a CDN script
  assert.ok(!/from\s+['"]https?:/.test(allCode), 'no remote module imports');
  assert.ok(!/src\s*=\s*["']https?:[^"']*three/i.test(allCode), 'no three.js CDN script tags');
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});

// ---------- Logic tests ----------

test('tier ladder has 17 tiers from Marble to Data Slab', () => {
  assert.equal(TIERS.length, 17);
  assert.equal(TIERS[0].name, 'Marble');
  assert.equal(TIERS[TIERS.length - 1].name, 'Data Slab');
  for (const t of TIERS) {
    assert.ok(t.name && t.color && t.glyph && t.radius > 0);
    assert.match(t.color, /^#[0-9a-f]{6}$/i);
  }
});

test('tiers grow in radius as they escalate', () => {
  const radii = TIERS.slice(0, -1).map((t) => t.radius);
  for (let i = 1; i < radii.length; i += 1) {
    assert.ok(radii[i] >= radii[i - 1], `radius shrank at tier ${i}`);
  }
});

test('createWorld centers the hole', () => {
  const w = createWorld(800, 600);
  assert.equal(w.hole.x, 400);
  assert.equal(w.hole.y, 300);
  assert.ok(w.hole.r > 0);
  assert.deepEqual(w.bodies, []);
  assert.equal(w.consumed, 0);
});

test('spawnBody places a body away from the hole with tangential velocity', () => {
  const rng = mulberry32(7);
  const w = createWorld(800, 600);
  const b = spawnBody(w, 3, rng);
  assert.equal(w.bodies.length, 1);
  assert.equal(b.name, 'Meteor');
  const d = Math.hypot(b.x - w.hole.x, b.y - w.hole.y);
  assert.ok(d > w.hole.r + b.radius, 'body spawned inside the hole');
  assert.ok(Math.hypot(b.vx, b.vy) > 0, 'body has no velocity');
});

test('spawnBody wraps tier index', () => {
  const w = createWorld(800, 600);
  const b = spawnBody(w, TIERS.length + 1, mulberry32(1));
  assert.equal(b.name, TIERS[1].name);
});

test('stepWorld pulls bodies toward the hole', () => {
  const w = createWorld(800, 600);
  const b = spawnBody(w, 0, mulberry32(3));
  b.vx = 0;
  b.vy = 0;
  const d0 = Math.hypot(b.x - w.hole.x, b.y - w.hole.y);
  stepWorld(w, 0.5);
  const d1 = Math.hypot(b.x - w.hole.x, b.y - w.hole.y);
  assert.ok(d1 < d0, 'gravity did not pull the body inward');
});

test('stepWorld consumes bodies at the event horizon and records a flash', () => {
  const w = createWorld(800, 600);
  const b = spawnBody(w, 0, mulberry32(9));
  b.x = w.hole.x + 1;
  b.y = w.hole.y;
  b.vx = 0;
  b.vy = 0;
  const consumed = stepWorld(w, 0.05);
  assert.equal(consumed, 1);
  assert.equal(w.bodies.length, 0);
  assert.equal(w.consumed, 1);
  assert.equal(w.flashes.length, 1);
  assert.equal(w.flashes[0].color, b.color);
});

test('stepWorld ignores non-positive dt', () => {
  const w = createWorld(800, 600);
  spawnBody(w, 0, mulberry32(2));
  const before = { ...w.bodies[0] };
  stepWorld(w, 0);
  stepWorld(w, -1);
  assert.deepEqual(w.bodies[0], before);
});

test('flashes expire after 0.6 seconds', () => {
  const w = createWorld(800, 600);
  w.flashes.push({ x: 10, y: 10, age: 0, color: '#fff' });
  // stepWorld clamps each step to 0.05s (background-tab protection), so
  // advance the clock in several steps.
  for (let i = 0; i < 14; i += 1) stepWorld(w, 0.05);
  assert.equal(w.flashes.length, 0);
});

test('tierForHoldTime: tap keeps current tier, hold cycles and wraps', () => {
  assert.equal(tierForHoldTime(HOLD_THRESHOLD_MS - 1), null);
  assert.equal(tierForHoldTime(HOLD_THRESHOLD_MS), 0);
  assert.equal(tierForHoldTime(HOLD_THRESHOLD_MS + CYCLE_MS), 1);
  assert.equal(tierForHoldTime(HOLD_THRESHOLD_MS + CYCLE_MS * 17), 0);
});

test('chargeFill runs 0..1 across one cycle', () => {
  assert.equal(chargeFill(0), 0);
  const mid = chargeFill(HOLD_THRESHOLD_MS + CYCLE_MS / 2);
  assert.ok(mid > 0.49 && mid < 0.51, `expected ~0.5, got ${mid}`);
  assert.ok(chargeFill(HOLD_THRESHOLD_MS + CYCLE_MS - 1) < 1);
});

test('mulberry32 is deterministic', () => {
  const a = mulberry32(123);
  const b = mulberry32(123);
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
});

test('makeStars returns bounded points', () => {
  const stars = makeStars(50, 800, 600, mulberry32(5));
  assert.equal(stars.length, 50);
  for (const s of stars) {
    assert.ok(s.x >= 0 && s.x <= 800);
    assert.ok(s.y >= 0 && s.y <= 600);
  }
});

test('GRAVITY is a sane positive constant', () => {
  assert.ok(GRAVITY > 0 && GRAVITY < 10000);
});

// ---------- 3D view layer (hole3d.js) ----------

import {
  bodyScenePos,
  createHoleScene,
  WORLD_SCALE,
  PLANE_TILT,
  ACCRETION_COUNT,
} from '../app/hitchhikers-guide/hole3d.js';

const sceneSrc = readFileSync(join(appDir, 'hole3d.js'), 'utf8');
const pageSrc = readFileSync(join(appDir, 'page.jsx'), 'utf8');

test('bodyScenePos centers the world at the origin', () => {
  const [x, y, z] = bodyScenePos(400, 300, 800, 600);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(z) < 1e-9, 'center maps to origin');
  assert.equal(y, 0, 'bodies live in the orbital plane');
  const [x2] = bodyScenePos(0, 300, 800, 600);
  const [x3] = bodyScenePos(800, 300, 800, 600);
  assert.ok(x2 < 0 && x3 > 0, 'x spans negative to positive');
  assert.ok(x2 === -x3, 'symmetric');
});

test('world scale and tilt are sane constants', () => {
  assert.ok(WORLD_SCALE > 0 && WORLD_SCALE < 0.2);
  assert.ok(PLANE_TILT < 0 && PLANE_TILT > -Math.PI / 2, 'plane visibly tilted, not edge-on');
  assert.ok(ACCRETION_COUNT >= 24, 'enough flow particles for a readable disk');
});

test('createHoleScene is exported as a factory function', () => {
  assert.equal(typeof createHoleScene, 'function');
});

test('scene is unlit by construction (mobile-friendly)', () => {
  assert.ok(!/AmbientLight|DirectionalLight|PointLight|SpotLight/.test(sceneSrc), 'no lights: all MeshBasicMaterial');
  assert.ok(!/MeshStandardMaterial/.test(sceneSrc), 'no lit materials');
  assert.ok(!/shadow/.test(sceneSrc.toLowerCase()) || !/\.shadow/.test(sceneSrc), 'no shadow maps');
});

test('no heavy postprocessing in the 3D view', () => {
  assert.ok(!/EffectComposer/.test(sceneSrc), 'no effect composer');
  assert.ok(!/UnrealBloomPass/.test(sceneSrc), 'no bloom pass');
});

test('scene honors prefers-reduced-motion (static fallback)', () => {
  assert.ok(/reducedMotion/.test(sceneSrc), 'accepts reducedMotion');
  assert.ok(/if \(!reducedMotion\)/.test(sceneSrc), 'motion gated on the flag');
  assert.ok(/prefers-reduced-motion/.test(pageSrc), 'page reads the media query');
});

test('scene caps pixel ratio and exposes dispose', () => {
  assert.ok(/setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, 2\)\)/.test(sceneSrc), 'DPR capped at 2');
  assert.ok(/dispose\(\)/.test(sceneSrc), 'exposes dispose');
});

test('page drives the 3D view: create, sync, render, resize, dispose', () => {
  assert.ok(/createHoleScene/.test(pageSrc), 'page creates the scene');
  assert.ok(/hole3d\.sync\(/.test(pageSrc), 'page syncs physics to the scene');
  assert.ok(/hole3d\.render\(/.test(pageSrc), 'page renders each frame');
  assert.ok(/hole3d\.resize\(/.test(pageSrc), 'page resizes the scene');
  assert.ok(/hole3d\.dispose\(\)/.test(pageSrc), 'page disposes the scene');
});

test('old 2D paint path is gone', () => {
  assert.ok(!/getContext\('2d'\)/.test(pageSrc), 'no 2D context in the page');
  assert.ok(!/starsRef/.test(pageSrc), '2D starfield refs removed');
});

test('game logic still drives the frame loop (singularity.js untouched)', () => {
  assert.ok(/stepWorld\(/.test(pageSrc), 'page still steps the physics');
  assert.ok(/spawnBody\(/.test(pageSrc), 'launch path kept');
});
