// tests/keepsake.test.mjs
// KEEPSAKE (Nov 17, 2026) — a treasured photo, kept in a snow globe.
// - registry: 'keepsake' in SATELLITES (SANCTUM, ARTEMIS) + the ARTEMIS
//   god menu; title/subtitle in en and all 34 locale JSONs
// - the roster grows 213 -> 214 and the portal-video queue gains one
//   waiting portal (147 wired of 214; the runner generates the video)
// - the Supabase SQL stages the table, the public bucket and the RLS
//   policies (it is NOT run here — Merlin green-lights the run)
// - camera math: a swipe leaves the camera exactly where it stops
//   (no recoil); the joystick walks the camera around the globe
// - palette math: region averages, most-saturated accent, brightest warm
//
// Run: node --test tests/keepsake.test.mjs   (from the repo root)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SATELLITES } from '../lib/i18n/satellites.ts';
import { GOD_MENUS } from '../lib/god-menus.js';
import { buildPortalRoster } from '../lib/portal-roster.js';
import { PORTAL_VIDEO_KEYS } from '../lib/portal-videos.js';
import { averageRegion, mostSaturated, brightestWarm } from '../lib/keepsake/palette.js';
import { initialCamera, applySwipe, applyJoystick, cameraPosition, clampPolar, clampRadius } from '../lib/keepsake/camera.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const en = JSON.parse(read('lib/i18n/locales/en.json'));

describe('keepsake registry (dual-registry rule)', () => {
  it('sits in SATELLITES as SANCTUM / ARTEMIS at /keepsake', () => {
    const seat = SATELLITES.find((s) => s.key === 'keepsake');
    assert.ok(seat, 'keepsake has a registry seat');
    assert.equal(seat.route, '/keepsake');
    assert.equal(seat.section, 'SANCTUM');
    assert.equal(seat.pos, 'ARTEMIS');
    assert.equal(seat.constellation, 'ARTEMIS');
  });

  it('sits in exactly one god menu: ARTEMIS', () => {
    const holders = GOD_MENUS.filter((m) => m.satellites.includes('keepsake'));
    assert.equal(holders.length, 1);
    assert.equal(holders[0].god, 'ARTEMIS');
  });

  it('has an en title + subtitle, and the same keys in all 34 locales', () => {
    assert.equal(en['sat.keepsake.title'], 'Keepsake');
    assert.ok(en['sat.keepsake.subtitle'] && en['sat.keepsake.subtitle'].length > 0);
    const files = readdirSync(join(repo, 'lib/i18n/locales')).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 34);
    for (const f of files) {
      const dict = JSON.parse(read(`lib/i18n/locales/${f}`));
      assert.equal(dict['sat.keepsake.title'], 'Keepsake', `${f} title`);
      assert.ok(dict['sat.keepsake.subtitle'] && dict['sat.keepsake.subtitle'].trim(), `${f} subtitle`);
    }
  });

  it('joins the roster (213 -> 214) with its title and subtitle', () => {
    const roster = buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);
    assert.equal(roster.length, 214);
    const seat = roster.find((p) => p.key === 'keepsake');
    assert.ok(seat);
    assert.equal(seat.title, 'Keepsake');
    assert.ok(seat.subtitle.length > 0);
    assert.equal(seat.section, 'SANCTUM');
  });

  it('is one more portal awaiting its video (147 wired of 214)', () => {
    const roster = buildPortalRoster(SATELLITES, (k) => en[`sat.${k}.title`], (k) => en[`sat.${k}.subtitle`]);
    const waiting = roster.filter((p) => !PORTAL_VIDEO_KEYS.includes(p.key));
    assert.equal(waiting.length, 67);
    assert.ok(waiting.some((p) => p.key === 'keepsake'), 'keepsake awaits its portal video');
  });
});

describe('keepsake files are all in place', () => {
  it('route, public viewer, API routes and samples exist', () => {
    assert.ok(existsSync(join(repo, 'app/keepsake/page.jsx')), '/keepsake page');
    assert.ok(existsSync(join(repo, 'app/keepsake/view/[id]/page.jsx')), 'public viewer');
    assert.ok(existsSync(join(repo, 'app/api/keepsake/route.js')), 'save route');
    assert.ok(existsSync(join(repo, 'app/api/keepsake/upload-url/route.js')), 'upload-url route');
    assert.ok(existsSync(join(repo, 'app/api/keepsake/[id]/route.js')), 'public read route');
    assert.ok(existsSync(join(repo, 'components/keepsake/KeepsakeGlobe.jsx')), 'globe component');
    assert.ok(existsSync(join(repo, 'lib/keepsake/scene.js')), 'scene');
    for (const s of ['cabin', 'lake', 'garden']) {
      assert.ok(existsSync(join(repo, `public/images/keepsake/${s}.jpg`)), `sample ${s}`);
    }
  });

  it('the globe honours the control laws in source', () => {
    const globe = read('components/keepsake/KeepsakeGlobe.jsx');
    assert.ok(/bottom: 76/.test(globe), 'joystick and orb sit 76px up from the bottom');
    assert.ok(/The world beyond your photo/.test(globe), 'honest reconstruction footer');
    assert.ok(!/OrbitControls/.test(read('lib/keepsake/scene.js')), 'custom orbit, no OrbitControls');
    assert.ok(/createKeepsakeScene/.test(read('lib/keepsake/scene.js')));
  });
});

describe('keepsake SQL (staged, not run here)', () => {
  const sql = read('supabase/keepsake.sql');

  it('creates the table, the public bucket and the RLS policies', () => {
    assert.ok(/create table if not exists public\.keepsake_globes/.test(sql), 'table');
    assert.ok(/insert into storage\.buckets \(id, name, public\)\s*values \('keepsake-globes', 'keepsake-globes', true\)/.test(sql), 'public bucket');
    assert.ok(/alter table public\.keepsake_globes enable row level security/.test(sql), 'RLS on');
    assert.ok(/"keepsake_globes: public read"/.test(sql), 'public read policy');
    assert.ok(/"keepsake_globes: owner insert"/.test(sql), 'owner insert policy');
    assert.ok(/"keepsake_globes: owner update"/.test(sql), 'owner update policy');
    assert.ok(/"keepsake_globes: owner delete"/.test(sql), 'owner delete policy');
    assert.ok(/"keepsake-globes: public read"/.test(sql), 'bucket public read');
    assert.ok(/"keepsake-globes: no client writes"/.test(sql), 'no direct client writes');
  });
});

describe('keepsake camera (no recoil)', () => {
  it('a swipe moves the camera and a second identical swipe moves it further — never back', () => {
    const start = initialCamera();
    const once = applySwipe(start, 100, 0);
    assert.ok(once.theta < start.theta, 'drag right orbits');
    const twice = applySwipe(once, 100, 0);
    assert.ok(twice.theta < once.theta, 'no return toward the start');
    assert.equal(twice.phi, once.phi, 'a level drag leaves the pitch alone');
  });

  it('letting go is the identity: zero delta changes nothing', () => {
    const state = { theta: 0.7, phi: 1.1, radius: 4.2 };
    assert.deepEqual(applySwipe(state, 0, 0), state);
    assert.deepEqual(applyJoystick(state, 0, 0, 1), state);
  });

  it('the joystick walks the camera: up closes in, sideways orbits, clamps hold', () => {
    const state = initialCamera();
    const closer = applyJoystick(state, 0, 1, 1);
    assert.ok(closer.radius < state.radius, 'stick up walks in');
    const farther = applyJoystick(state, 0, -1, 1);
    assert.ok(farther.radius > state.radius, 'stick down backs out');
    const orbited = applyJoystick(state, 1, 0, 1);
    assert.notEqual(orbited.theta, state.theta);
    assert.ok(clampRadius(0) >= 2.6 && clampRadius(99) <= 7.0, 'radius clamped');
    assert.ok(clampPolar(-1) >= 0.35 && clampPolar(99) <= 1.45, 'pitch clamped');
  });

  it('cameraPosition orbits the target at the state radius', () => {
    const p = cameraPosition({ theta: 0, phi: Math.PI / 2, radius: 5 }, { x: 0, y: 0, z: 0 });
    assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9 && Math.abs(p.z - 5) < 1e-9);
  });
});

describe('keepsake palette math', () => {
  function buf(pixels, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    pixels.forEach((px, i) => {
      out[i * 4] = px[0];
      out[i * 4 + 1] = px[1];
      out[i * 4 + 2] = px[2];
      out[i * 4 + 3] = 255;
    });
    return out;
  }

  it('averageRegion averages the rows it is given', () => {
    const px = buf([[200, 50, 50], [200, 50, 50], [0, 0, 0], [0, 0, 0]], 2, 2);
    assert.deepEqual(averageRegion(px, 2, 2, 0, 0.5), { r: 200, g: 50, b: 50 });
    assert.deepEqual(averageRegion(px, 2, 2, 0.5, 1), { r: 0, g: 0, b: 0 });
  });

  it('mostSaturated finds the vivid pixels, brightestWarm finds the warm light', () => {
    const grey = [128, 128, 128];
    const red = [255, 0, 0];
    const warm = [255, 220, 180];
    const dark = [10, 10, 12];
    const px = buf([grey, grey, grey, red, grey, grey, grey, grey, warm, dark, dark, dark, dark, dark, dark, dark], 4, 4);
    const accent = mostSaturated(px, 4, 4, 1);
    assert.ok(accent.r > 200 && accent.g < 60, 'accent is the red');
    const glow = brightestWarm(px, 4, 4, 1);
    assert.ok(glow.r > 200 && glow.g > 150, 'glow is the warm light');
  });
});
