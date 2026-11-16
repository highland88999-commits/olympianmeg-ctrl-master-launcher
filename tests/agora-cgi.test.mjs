// tests/agora-cgi.test.mjs
// AGORA CGI — the market city gets the planet-cgi treatment
// (Merlin, Nov 15, 2026): Agora was a 2D feed with NO 3D scene
// at all, so the market city is built fresh — procedural Greek
// materials, a cobbled square with stoa + temple + stalls,
// lit windows after dark, the Meltemi breeze with drifting
// pollen, and a market crowd as pure functions of the device
// clock. The feed mechanics (posts, people, profiles, likes,
// comments) are pinned still-wired. Run:
// node --test tests/agora-cgi.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';

import {
  AGORA_KINDS, agoraMaps, materialForAgora, agoraTextureStats,
} from '../lib/agora/textures.js';
import {
  AGORA_SEED, AGORA_WORLD_NAME, WORLD_RADIUS, WALKER_SPAWN,
  FOUNTAIN_RADIUS, agoraDayFactor, stallSites, STALL_COUNT,
  STALL_TRADES, oliveTreeSites, clampToWorld,
} from '../lib/agora/world.js';
import {
  MELTEMI_WIND_NAME, meltemiWindAt, pollenIntensity,
  awningSwayRad, makePollenField, updatePollenField,
  windCompass,
} from '../lib/agora/weather.js';
import {
  MIN_COPIES, DEATH_LAW, VENDOR_COUNT, SHOPPER_COUNT,
  GULL_COUNT, CROWD_PROFILES, crowdCount, marketOpen,
  lifeFor, crowdFor,
} from '../lib/agora/operators.js';
import { CATEGORIES, isValidCategory } from '../lib/agora/categories.js';
import { validatePost, validateProfile, LIMITS } from '../lib/agora/validation.js';
import { pageOffset, PAGE_SIZE } from '../lib/agora/format.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const meanRgb = (tex) => {
  const d = tex.image.data;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  return [r / n, g / n, b / n];
};

const countWhere = (tex, fn) => {
  const d = tex.image.data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (fn(d[i], d[i + 1], d[i + 2])) n++;
  return n;
};

// Local noon / deep night on the device clock — the crowd keeps
// market hours in local time, so the test builds its instants
// from the local clock, not UTC.
function localAt(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

describe('agora textures', () => {
  it('all seven Greek material kinds exist with colour + bump maps', () => {
    for (const kind of Object.keys(AGORA_KINDS)) {
      const { map, bumpMap, roughness, bumpScale } = agoraMaps(kind, AGORA_SEED);
      assert.ok(map instanceof THREE.DataTexture, `${kind} map`);
      assert.ok(bumpMap instanceof THREE.DataTexture, `${kind} bump`);
      assert.equal(map.image.width, 256);
      assert.ok(roughness > 0 && roughness <= 1, `${kind} roughness`);
      assert.ok(bumpScale > 0, `${kind} bumpScale`);
    }
  });

  it('cobble is warm sandstone (r > g > b), marble and plaster near-white', () => {
    const [cr, cg, cb] = meanRgb(agoraMaps('cobble', AGORA_SEED).map);
    assert.ok(cr > cg && cg > cb, `cobble warm: ${cr},${cg},${cb}`);
    assert.ok(cr > 150, 'cobble is pale sand, not dark');
    const [mr, mg, mb] = meanRgb(agoraMaps('marble', AGORA_SEED).map);
    assert.ok(mr > 200 && mg > 200 && mb > 190, `marble pale: ${mr},${mg},${mb}`);
    const [pr, pg, pb] = meanRgb(agoraMaps('plaster', AGORA_SEED).map);
    assert.ok(pr > 210 && pg > 210, `plaster whitewash: ${pr},${pg},${pb}`);
  });

  it('terracotta is red-dominant, olive wood is brown, mosaic carries Aegean blue', () => {
    const [tr, tg, tb] = meanRgb(agoraMaps('terracotta', AGORA_SEED).map);
    assert.ok(tr > tg && tg > tb && tr > 140, `terracotta: ${tr},${tg},${tb}`);
    const [wr, wg, wb] = meanRgb(agoraMaps('oliveWood', AGORA_SEED).map);
    assert.ok(wr > wg && wg > wb, `olive wood brown: ${wr},${wg},${wb}`);
    const bluePx = countWhere(agoraMaps('mosaic', AGORA_SEED).map, (r, g, b) => b > r + 30);
    assert.ok(bluePx > 1000, `mosaic key ring is blue (${bluePx} blue px)`);
  });

  it('awning is striped — both a bright and a dark population', () => {
    const map = agoraMaps('awning', AGORA_SEED).map;
    const bright = countWhere(map, (r, g, b) => r > 200 && g > 200);
    const dark = countWhere(map, (r, g, b) => r < 200 && g < 160);
    assert.ok(bright > 5000, `awning white stripes (${bright})`);
    assert.ok(dark > 5000, `awning colour stripes (${dark})`);
  });

  it('textures are deterministic per kind+seed and cached', () => {
    const a = agoraMaps('cobble', AGORA_SEED);
    const b = agoraMaps('cobble', AGORA_SEED);
    assert.equal(a, b, 'same kind+seed returns the cached maps');
    const c = agoraMaps('cobble', 'OTHER-SEED');
    assert.notEqual(a.map, c.map, 'a different seed paints a different street');
    const d = agoraMaps('cobble', AGORA_SEED).map.image.data;
    const e = agoraMaps('cobble', AGORA_SEED).map.image.data;
    assert.deepEqual([...d.slice(0, 64)], [...e.slice(0, 64)]);
  });

  it('unknown kinds fall back to plaster; materials are shared per kind+seed+tint', () => {
    const fallback = agoraMaps('not-a-kind', AGORA_SEED);
    const plaster = agoraMaps('plaster', AGORA_SEED);
    assert.equal(fallback, plaster);
    const m1 = materialForAgora('awning', AGORA_SEED, '#2f6db3');
    const m2 = materialForAgora('awning', AGORA_SEED, '#2f6db3');
    assert.equal(m1, m2, 'awning material cached');
    const m3 = materialForAgora('awning', AGORA_SEED, '#e07840');
    assert.notEqual(m1, m3, 'a different stall tint is a different material');
    assert.ok(agoraTextureStats().textures >= 7, 'texture cache holds the kinds');
  });
});

describe('agora world layout', () => {
  it('world identity is the Agora market city', () => {
    assert.equal(AGORA_SEED, 'AGORA');
    assert.match(AGORA_WORLD_NAME, /Agora/);
    assert.ok(WORLD_RADIUS >= 50, 'room for the square, stoa and houses');
    assert.deepEqual(WALKER_SPAWN, { x: 0, z: 34 });
  });

  it('eight stalls, one per trade, ringing the square clear of the fountain and the lanes', () => {
    const sites = stallSites();
    assert.equal(sites.length, STALL_COUNT);
    assert.equal(STALL_COUNT, STALL_TRADES.length);
    const trades = sites.map((s) => s.trade);
    assert.equal(new Set(trades).size, STALL_COUNT, 'no trade repeats');
    for (const s of sites) {
      const r = Math.hypot(s.x, s.z);
      assert.ok(r > FOUNTAIN_RADIUS + 6, `${s.trade} clear of the fountain`);
      assert.ok(r < WORLD_RADIUS, `${s.trade} inside the world rim`);
      assert.ok(!(s.z > 24 && Math.abs(s.x) < 9), `${s.trade} clear of the south gate lane`);
      assert.ok(!(s.z < -28 && Math.abs(s.x) < 9), `${s.trade} clear of the temple approach`);
      assert.ok(s.awning && s.produce && s.label, `${s.trade} carries its colours`);
    }
    assert.deepEqual(stallSites(), sites, 'stall layout is deterministic per seed');
  });

  it('olive trees ring the city clear of the lanes', () => {
    const trees = oliveTreeSites();
    assert.ok(trees.length >= 10, 'a proper olive ring');
    for (const t of trees) {
      assert.ok(Math.hypot(t.x, t.z) > 34, 'trees stand outside the square');
      assert.ok(!(Math.abs(t.x) < 9 && t.z > 24), 'no tree in the south gate lane');
    }
  });

  it('day factor is 1 at noon, 0 at night, between at dawn', () => {
    assert.equal(agoraDayFactor(0.5), 1);
    assert.equal(agoraDayFactor(0), 0);
    assert.ok(agoraDayFactor(0.95) < 0.05, 'night is dark');
    const dawn = agoraDayFactor(0.26);
    assert.ok(dawn > 0 && dawn < 1, `dawn is partial (${dawn})`);
  });

  it('clampToWorld holds the rim', () => {
    assert.deepEqual(clampToWorld(10, 10), { x: 10, z: 10, clamped: false });
    const out = clampToWorld(100, 0);
    assert.equal(out.clamped, true);
    assert.ok(Math.abs(out.x - WORLD_RADIUS) < 0.001);
  });
});

describe('agora weather — the Meltemi', () => {
  it('the Meltemi is a northerly Aegean breeze, deterministic on the clock', () => {
    assert.equal(MELTEMI_WIND_NAME, 'Meltemi breeze');
    const now = localAt(12);
    const a = meltemiWindAt(now);
    const b = meltemiWindAt(now);
    assert.deepEqual(a, b, 'same instant, same wind');
    assert.ok(a.speed >= 2 && a.speed <= 11, `speed in range: ${a.speed}`);
    // Bearing veers ±20° around 0° (north), modulo 360.
    const wrapped = ((a.bearingDeg + 180) % 360) - 180;
    assert.ok(Math.abs(wrapped) <= 20, `bearing near north: ${a.bearingDeg}`);
    assert.ok(a.gust >= 0 && a.gust <= 1, 'gust is 0..1');
    assert.equal(windCompass(0), 'N');
  });

  it('pollen intensity and awning sway stay in range', () => {
    assert.equal(pollenIntensity({ gust: 0 }), 0);
    assert.equal(pollenIntensity({ gust: 1 }), 1);
    assert.equal(pollenIntensity(null), 0);
    assert.ok(awningSwayRad({ gust: 1 }) <= 0.06 + 1e-9, 'awnings lean at most ~0.06 rad');
    assert.equal(awningSwayRad({ gust: 0 }), 0);
  });

  it('the pollen field is seeded, in its box, and advects downwind', () => {
    const field = makePollenField({ seed: AGORA_SEED + '-meltemi' });
    assert.equal(field.geometry.getAttribute('position').count, 260);
    const before = Float32Array.from(field.geometry.getAttribute('position').array);
    const wind = meltemiWindAt(localAt(12));
    updatePollenField(field, wind, 1, localAt(12), 1);
    const after = field.geometry.getAttribute('position').array;
    let moved = 0;
    for (let i = 0; i < before.length; i += 3) {
      if (Math.abs(after[i] - before[i]) > 1e-6 || Math.abs(after[i + 2] - before[i + 2]) > 1e-6) moved++;
    }
    assert.ok(moved > 100, `most motes advect (${moved}/260)`);
    for (let i = 0; i < after.length; i += 3) {
      assert.ok(Math.abs(after[i]) <= 55 + 1e-6, 'pollen stays in its box (x)');
      assert.ok(Math.abs(after[i + 2]) <= 55 + 1e-6, 'pollen stays in its box (z)');
    }
  });
});

describe('agora operators — the market crowd', () => {
  it('death law is null: the market has no combat, nobody dies', () => {
    assert.equal(DEATH_LAW.exists, false);
    assert.deepEqual(DEATH_LAW.causes, []);
    for (const kind of ['vendor', 'shopper', 'gull']) {
      assert.equal(lifeFor(kind, 0, localAt(12)).death, null);
      assert.equal(CROWD_PROFILES[kind].dietBasis, 'default', `${kind} diet is a labelled default`);
    }
  });

  it('population rule: every kind meets the minimum, no singletons', () => {
    for (const kind of ['vendor', 'shopper', 'gull']) {
      assert.ok(crowdCount(kind) >= MIN_COPIES, `${kind} meets the minimum`);
    }
    assert.equal(VENDOR_COUNT, STALL_COUNT, 'one vendor per stall');
    assert.equal(SHOPPER_COUNT, 10);
    assert.equal(GULL_COUNT, 5);
    assert.equal(crowdFor(localAt(12)).length, 23, 'the whole square, one call');
  });

  it('lifeFor is deterministic — same kind, index and instant, same life', () => {
    const now = localAt(12);
    assert.deepEqual(lifeFor('shopper', 3, now), lifeFor('shopper', 3, now));
    assert.deepEqual(lifeFor('vendor', 0, now), lifeFor('vendor', 0, now));
  });

  it('vendors stand at their stall all day — stationary, facing the square', () => {
    const t1 = localAt(12);
    const t2 = t1 + 120000;
    const a = lifeFor('vendor', 0, t1);
    const b = lifeFor('vendor', 0, t2);
    assert.equal(a.x, b.x, 'vendor does not walk away');
    assert.equal(a.z, b.z);
    assert.equal(a.activity, 'tending');
    assert.equal(a.trade, 'olives', 'vendor 0 keeps the olive stall');
    // Facing the centre: the forward vector (-sin h, -cos h)
    // points from the stall back to the square centre.
    const fx = -Math.sin(a.heading);
    const fz = -Math.cos(a.heading);
    assert.ok(fx * a.x + fz * a.z < 0, 'vendor faces the square centre');
    assert.equal(lifeFor('vendor', 0, localAt(2)).activity, 'closing', 'stalls close at night');
  });

  it('shoppers stroll the square by day and gather at the fountain at night', () => {
    assert.equal(marketOpen(localAt(12)), true);
    assert.equal(marketOpen(localAt(2)), false);
    const t1 = localAt(12);
    const a = lifeFor('shopper', 2, t1);
    const b = lifeFor('shopper', 2, t1 + 120000);
    const moved = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(moved > 1, `shoppers move (${moved.toFixed(1)} m in 2 min)`);
    assert.ok(['strolling', 'browsing'].includes(a.activity), `day activity: ${a.activity}`);
    const night = lifeFor('shopper', 2, localAt(2));
    assert.equal(night.activity, 'chatting');
    assert.ok(Math.hypot(night.x, night.z) < 6, 'night shoppers gather at the fountain');
  });

  it('gulls circle overhead by day and roost on the temple at night', () => {
    const day = lifeFor('gull', 1, localAt(12));
    assert.equal(day.activity, 'circling');
    assert.ok(day.y > 10, `gulls fly high (${day.y.toFixed(1)} m)`);
    const night = lifeFor('gull', 1, localAt(2));
    assert.equal(night.activity, 'roosting');
    assert.ok(night.z < -40, 'gulls roost on the temple roof');
  });
});

describe('agora mechanics still wired', () => {
  it('categories, validation and paging are unchanged', () => {
    assert.equal(CATEGORIES.length, 7, 'seven categories, marketplace still dropped');
    assert.ok(isValidCategory('civic'));
    assert.ok(!isValidCategory('marketplace'));
    assert.equal(validatePost({ title: 'Hi', body: 'x', category: 'civic' }), 'Title is too short (minimum 4 characters).');
    assert.equal(validatePost({ title: 'Hello there', body: 'A real post.', category: 'civic' }), null);
    assert.equal(validateProfile({ displayName: 'A', bio: '' }), 'Display name is too short (minimum 2 characters).');
    assert.equal(LIMITS.titleMax, 120);
    assert.equal(PAGE_SIZE, 20);
    assert.equal(pageOffset(2), 20);
    assert.equal(pageOffset(1), 0);
  });

  it('the feed page still wires the feed AND now mounts the market stage', () => {
    const feed = read('app/agora/page.jsx');
    for (const needle of [
      "from('agora_posts')",
      "from('agora_profiles')",
      'PostCard', 'CategoryTabs', 'AphroVideoBg', 'Starfield',
      '/agora/new', '/agora/people', 'Show more',
    ]) assert.ok(feed.includes(needle), `feed still wires: ${needle}`);
    for (const needle of [
      "import('@/components/agora/AgoraScene')",
      'AgoraScene', 'AGORA_SEED', 'marketTime', 'marketMode',
      'REAL TIME', 'WALK', 'ORBIT',
    ]) assert.ok(feed.includes(needle), `market stage wired: ${needle}`);
  });

  it('the other Agora routes still exist and still talk to Supabase', () => {
    for (const p of [
      'app/agora/new/page.jsx',
      'app/agora/post/[id]/page.jsx',
      'app/agora/profile/[id]/page.jsx',
      'app/agora/people/page.jsx',
    ]) {
      assert.ok(existsSync(join(repo, p)), `${p} exists`);
      assert.ok(read(p).includes('supabase'), `${p} still uses Supabase`);
    }
    assert.ok(read('app/agora/new/page.jsx').includes("from('agora_posts')\n      .insert"), 'posting still inserts');
    assert.ok(read('app/agora/post/[id]/page.jsx').includes('CommentSection'), 'comments still wired');
    assert.ok(read('app/agora/profile/[id]/page.jsx').includes("from('agora_profiles').upsert"), 'profile saving still wired');
  });

  it('the scene adds no new real lights — glow is emissive only, light comes from the shared rig', () => {
    const scene = read('components/agora/AgoraScene.jsx');
    assert.ok(!scene.includes('PointLight'), 'no point lights');
    assert.ok(!scene.includes('SpotLight'), 'no spot lights');
    assert.ok(!scene.includes('DirectionalLight'), 'no directional lights');
    assert.ok(!scene.includes('new THREE') || !scene.match(/new THREE\.(Point|Spot|Directional|Hemisphere)Light/), 'no THREE light constructors');
    for (const needle of [
      'DayNightRig', 'materialForAgora', 'lifeFor', 'meltemiWindAt',
      'makePollenField', 'OrbitControls', 'TouchControls',
      'agoraDayFactor', 'stallSites', 'oliveTreeSites',
    ]) assert.ok(scene.includes(needle), `scene wires the house kit: ${needle}`);
    assert.ok(scene.includes('MeshBasicMaterial'), 'glow is unlit (emissive) material');
  });
});
