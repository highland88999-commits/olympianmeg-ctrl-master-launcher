// tests/mars2-outposts.test.mjs
// PER-USER MARS 2 OUTPOSTS (Merlin, Nov 25, 2026 — "every user who
// enters mars 2 has their own outpost, placed randomly on the map,
// never let one users placement overlap with another users area").
//
// The allocation runs server-side (supabase/mars2-outposts.sql —
// STAGED, NOT RUN without Merlin's green light). This file pins the
// shared math, the staged SQL, and the API routes' fallback: before
// the SQL runs, the routes 503 and Mars 2 uses the shared seeded
// outpost exactly as today.
// Run: node --test tests/mars2-outposts.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OUTPOST_ALLOC_MIN_R_M, OUTPOST_ALLOC_MAX_R_M,
  OUTPOST_AREA_RADIUS_M, OUTPOST_MIN_SEPARATION_M,
  randomOutpostSpot, spotClear, findOutpostSpot,
} from '../lib/mars2/outposts.js';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

// Deterministic rng for tests: mulberry32.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('outpost placement region', () => {
  it('spots land in the annulus outside the shared home region', () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const s = randomOutpostSpot(r);
      const d = Math.hypot(s.x, s.z);
      assert.ok(d >= OUTPOST_ALLOC_MIN_R_M, `spot ${d} inside the home region`);
      assert.ok(d <= OUTPOST_ALLOC_MAX_R_M, `spot ${d} past the reach`);
    }
  });

  it('the annulus clears the home region with margin', () => {
    // Home region is 88 m; the annulus starts at 120 m.
    assert.ok(OUTPOST_ALLOC_MIN_R_M > 88, 'outside the home region');
  });
});

describe('no two outpost areas ever overlap', () => {
  it('the separation is twice the area radius', () => {
    assert.equal(OUTPOST_MIN_SEPARATION_M, OUTPOST_AREA_RADIUS_M * 2);
  });

  it('spotClear refuses anything inside the separation', () => {
    const existing = [{ x: 200, z: 0 }];
    assert.equal(spotClear(200 + OUTPOST_MIN_SEPARATION_M - 1, 0, existing), false);
    assert.equal(spotClear(200 + OUTPOST_MIN_SEPARATION_M, 0, existing), true);
    assert.equal(spotClear(200, 100, existing), true);
  });

  it('a hundred sequential allocations never overlap', () => {
    const r = rng(99);
    const placed = [];
    for (let i = 0; i < 100; i++) {
      const spot = findOutpostSpot(placed, r);
      assert.ok(spot, `allocation ${i} found no spot`);
      assert.ok(spotClear(spot.x, spot.z, placed), `allocation ${i} overlaps`);
      placed.push(spot);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const d = Math.hypot(placed[i].x - placed[j].x, placed[i].z - placed[j].z);
        assert.ok(d >= OUTPOST_MIN_SEPARATION_M, `pair ${i}/${j} only ${d} apart`);
      }
    }
  });
});

describe('migration (GREEN-LIT Nov 25 — "Use supabase")', () => {
  const sql = read('supabase/mars2-outposts.sql');

  it('is green-lit, and states the cost', () => {
    assert.ok(sql.includes('GREEN-LIT Nov 25, 2026'), 'green-light note');
    assert.ok(sql.includes('Cost: $0'), 'cost stated');
  });

  it('one row per user, RLS on, reads for self + accepted friends only', () => {
    assert.ok(sql.includes('create table if not exists public.mars2_outposts'), 'table');
    assert.ok(sql.includes('user_id uuid primary key'), 'one row per user');
    assert.ok(sql.includes('enable row level security'), 'RLS on');
    assert.ok(sql.includes('"own outpost readable"'), 'own-row read policy');
    assert.ok(sql.includes('"friends outposts readable"'), 'friends read policy');
    assert.ok(sql.includes("f.status = 'accepted'"), 'friends only when accepted');
    assert.ok(sql.includes('No INSERT / UPDATE / DELETE policies'), 'no writes through RLS');
  });

  it('allocation is atomic and reuses the same site', () => {
    assert.ok(sql.includes('allocate_mars2_outpost'), 'allocation function');
    assert.ok(sql.includes('security definer'), 'definer');
    assert.ok(sql.includes('pg_advisory_xact_lock'), 'serialised');
    assert.ok(sql.includes('80 * 80'), '80 m separation in SQL');
    assert.ok(sql.includes('120 * 120'), 'annulus inner bound in SQL');
    assert.ok(sql.includes('1200 * 1200'), 'annulus outer bound in SQL');
  });
});

describe('API routes fall back honestly before the SQL runs', () => {
  it('my-outpost route allocates via the server function, 503s when the table is missing', () => {
    const route = read('app/api/mars2/outpost/route.js');
    assert.ok(route.includes("rpc('allocate_mars2_outpost'"), 'allocates server-side');
    assert.ok(route.includes("e.code === '42P01'"), 'table-missing code');
    assert.ok(route.includes('503'), '503 fallback');
  });

  it('friends-outposts route only ever returns accepted friends', () => {
    const route = read('app/api/mars2/outposts/friends/route.js');
    assert.ok(route.includes('listFriends'), 'accepted friends only');
    assert.ok(route.includes("e.code === '42P01'"), 'table-missing code');
    assert.ok(route.includes('503'), '503 fallback');
  });

  it('the page falls back to the shared site when outposts are unavailable', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('fetchMyOutpost'), 'page fetches my outpost');
    assert.ok(page.includes('outpostSiteOverride'), 'override reaches the scene');
  });

  it('the scene renders the assigned site instead of the shared one', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('outpostSiteOverride'), 'scene accepts the override');
  });
});
