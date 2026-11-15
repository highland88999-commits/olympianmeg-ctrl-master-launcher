// tests/afterlife-spine.test.mjs
// AFTERLIFE SPINE, TRANCHE 1 (Merlin, Nov 15 ~02:15, green-lit
// purposes list): souls are the underworld currency, the Lake of
// Fire is the refinery, the ferry is the fast crossing.
//
//   1. LAKE OF FIRE SOUL FORGE — 1 soul -> 1 aether, sharing the
//      gold refinery's 40/day cap (one 'refinery' bucket, not 40+40).
//   2. FERRY — 1 gold a crossing, any river at any point, and Styx
//      fast travel to visited realms.
//   3. SOUL-GUIDING — a fading soul walked to the river bank banks
//      +1 soul (the server re-verifies the fade; the key is
//      generation-bound).
//   4. WHEEL OF REBIRTH — the rebirth gate (Naraka/Diyu); riding
//      returns you to the world above (the hub).
//
// Run: node --test tests/afterlife-spine.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ECONOMY } from '../lib/economy/config.js';
import { lifeFor, FOUNDING_MS, DAY_MS } from '../lib/afterlife/operators.js';
import { makeWorld as makeHell } from '../lib/hell/world.js';
import {
  FORGE_AETHER_CAP_GROUP,
  FORGE_AETHER_DAILY_CAP,
  FORGE_AETHER_REASON,
  LAKE_OF_FIRE,
  SOUL_FORGE_RATE_AETHER_PER_SOUL,
  aetherForSouls,
  forgeRateText,
  inForgeRange,
} from '../lib/afterlife/forge.js';
import {
  FERRY_BOARD_DIST_M,
  FERRY_FARE_GOLD,
  canAffordFerry,
  ferryDestinations,
  ferryFareText,
  ferryLanding,
  nearRiver,
} from '../lib/afterlife/ferry.js';
import {
  GUIDE_BANK_DIST_M,
  GUIDE_BREAK_M,
  GUIDE_FOLLOW_SPEED_MPS,
  GUIDE_RANGE_M,
  bankAt,
  fadingSoulsFor,
  followStep,
  guideBroken,
  guideIdemKey,
  nearestGuidable,
} from '../lib/afterlife/guide.js';
import {
  REBIRTH_DESTINATION,
  WHEEL,
  WHEEL_REALMS,
  hasWheel,
  inWheel,
  rebirthAttuneIdemKey,
} from '../lib/afterlife/rebirth.js';
import {
  deviceId,
  newNonce,
  readLocalDutchmanSouls,
  readPendingReconcile,
  readRebirthPoint,
  readVisitedRealms,
  visitedRealmRecords,
} from '../lib/afterlife/souls.js';
import {
  SoulInsufficientError,
  SoulUnavailableError,
  creditSoul,
  getSoulBalance,
  setRespawnRealm,
  soulForge,
} from '../lib/economy/souls.js';

const RIVER = { zMin: -18, zMax: 18, bridgeHalf: 9 };

// ── 1. THE FORGE ────────────────────────────────────────────────────

describe('forge: 1 soul -> 1 aether, one shared 40/day cap', () => {
  it('the rate is the approved starting point (1:1)', () => {
    assert.equal(SOUL_FORGE_RATE_AETHER_PER_SOUL, 1);
    assert.equal(aetherForSouls(1), 1);
    assert.equal(aetherForSouls(5), 5);
    assert.equal(aetherForSouls(0), 0);
    assert.equal(aetherForSouls(-3), 0);
    assert.equal(forgeRateText(), '1 soul -> 1 aether');
  });

  it('the forge shares the gold refinery cap bucket — not a second cap', () => {
    assert.equal(FORGE_AETHER_REASON, 'refinery:forge');
    assert.equal(FORGE_AETHER_CAP_GROUP, 'refinery');
    assert.equal(FORGE_AETHER_DAILY_CAP, 40);
    assert.equal(FORGE_AETHER_DAILY_CAP, ECONOMY.REFINERY_AETHER_DAILY_CAP);
  });

  it('the forge range is the lake surface itself (r55), not the whole disc', () => {
    assert.equal(inForgeRange(LAKE_OF_FIRE.x, LAKE_OF_FIRE.z), true);
    assert.equal(inForgeRange(160, -70 + 54), true);
    assert.equal(inForgeRange(160, -70 + 56), false);
    assert.equal(inForgeRange(0, 160), false); // the Descent spawn
    assert.equal(inForgeRange('x', -70), false);
  });
});

// ── 2. THE FERRY ────────────────────────────────────────────────────

describe('ferry: 1 gold, any river at any point', () => {
  it('the fare is the approved starting point', () => {
    assert.equal(FERRY_FARE_GOLD, 1);
    assert.equal(ferryFareText(), '1 gold a crossing');
    assert.equal(canAffordFerry(1), true);
    assert.equal(canAffordFerry(0), false);
    assert.equal(canAffordFerry(100), true);
  });

  it('the landing is the opposite bank, same x, clear of the band', () => {
    const south = ferryLanding(RIVER, 40, 60);
    assert.deepEqual(south, { x: 40, z: RIVER.zMin - 2 });
    const north = ferryLanding(RIVER, -25, -60);
    assert.deepEqual(north, { x: -25, z: RIVER.zMax + 2 });
    // The landing never falls inside the band itself.
    assert.ok(south.z < RIVER.zMin && north.z > RIVER.zMax);
    assert.equal(ferryLanding(null, 0, 0), null);
  });

  it('the ferry can be called near the river, not from the far bank', () => {
    assert.equal(nearRiver(0, 40, RIVER), true);
    assert.equal(nearRiver(0, -40, RIVER), true);
    assert.equal(nearRiver(0, 0, RIVER), true); // on the bridge
    assert.equal(nearRiver(0, 160, RIVER), false);
    assert.equal(nearRiver(0, -230, RIVER), false);
    assert.equal(nearRiver(0, RIVER.zMax + FERRY_BOARD_DIST_M + 1, RIVER), false);
  });

  it('fast travel lists visited realms, never the one you are in', () => {
    const list = ferryDestinations(['hell', 'naraka', 'hell', 'not-a-realm', 'diyu'], 'hell');
    assert.deepEqual(list.map((r) => r.key), ['naraka', 'diyu']);
    assert.equal(ferryDestinations([], 'hell').length, 0);
    assert.equal(ferryDestinations(['hell'], 'hell').length, 0);
    // Every destination carries a live route.
    for (const r of list) assert.ok(r.route.startsWith('/'));
  });
});

// ── 3. SOUL-GUIDING ─────────────────────────────────────────────────

describe('guide: fading souls, walked to the bank', () => {
  // Find a real fading moment for one Hell shade, from the
  // operators' own deterministic law (sojourn 90d, fade 7d).
  function findFading() {
    for (let t = FOUNDING_MS; t < FOUNDING_MS + 200 * DAY_MS; t += 6 * 3600000) {
      const life = lifeFor('hell', 'Shade', 'e0', t, { x: 160, z: -70 });
      if (life && life.state === 'fading') return { t, life };
    }
    return null;
  }

  it('a fading soul exists in the operators law (and is guidable)', () => {
    const found = findFading();
    assert.ok(found, 'no fading window found in 200 days');
    assert.equal(found.life.state, 'fading');
    assert.ok(Number.isInteger(found.life.generation));
    assert.ok(found.life.decompFraction >= 0 && found.life.decompFraction <= 1);
  });

  it('fadingSoulsFor finds the fading shade among the spawner output', () => {
    const found = findFading();
    const world = makeHell(1338);
    const fading = fadingSoulsFor('hell', world.shades, found.t);
    assert.ok(fading.length >= 1);
    const e0 = fading.find((s) => s.id === 'e0');
    assert.ok(e0, 'e0 should be fading at the found moment');
    assert.equal(e0.generation, found.life.generation);
    assert.equal(fadingSoulsFor('no-such-realm', world.shades, found.t).length, 0);
    assert.equal(fadingSoulsFor('hell', [], found.t).length, 0);
  });

  it('nearestGuidable only answers within 6 m', () => {
    const found = findFading();
    const world = makeHell(1338);
    const e0 = world.shades.find((s) => s.id === 'e0');
    const near = nearestGuidable('hell', world.shades, e0.x, e0.z + 3, found.t);
    assert.ok(near && near.id === 'e0');
    const far = nearestGuidable('hell', world.shades, e0.x, e0.z + GUIDE_RANGE_M + 1, found.t);
    assert.ok(!far || far.id !== 'e0');
  });

  it('the bank is either edge of the band — not mid-river, not far away', () => {
    assert.equal(bankAt(RIVER, 0, 18), true);
    assert.equal(bankAt(RIVER, 0, -18), true);
    assert.equal(bankAt(RIVER, 5, 18 + GUIDE_BANK_DIST_M), true);
    assert.equal(bankAt(RIVER, 0, 0), false); // mid-bridge is not the bank
    assert.equal(bankAt(RIVER, 0, 60), false);
    assert.equal(bankAt(null, 0, 18), false);
  });

  it('a guide breaks past 15 m and the follow step walks the soul', () => {
    assert.equal(guideBroken(0, 0, 0, GUIDE_BREAK_M + 1), true);
    assert.equal(guideBroken(0, 0, 0, GUIDE_BREAK_M - 1), false);
    const step = followStep(0, 0, 10, 0, GUIDE_FOLLOW_SPEED_MPS, 1);
    assert.equal(step.x, GUIDE_FOLLOW_SPEED_MPS);
    assert.equal(step.arrived, false);
    const last = followStep(9.5, 0, 10, 0, GUIDE_FOLLOW_SPEED_MPS, 1);
    assert.equal(last.arrived, true);
    assert.equal(last.x, 10);
  });

  it('the bank key is generation-bound (same soul twice, next soul fresh)', () => {
    const k1 = guideIdemKey('hell', 'e0', 0);
    const k2 = guideIdemKey('hell', 'e0', 0);
    const k3 = guideIdemKey('hell', 'e0', 1);
    assert.equal(k1, k2);
    assert.notEqual(k1, k3);
    assert.ok(k1.startsWith('guide:hell:e0:g0'));
  });
});

// ── 4. THE WHEEL OF REBIRTH ────────────────────────────────────────

describe('rebirth: the Wheel of Rebirth', () => {
  it('only Naraka and Diyu have a wheel', () => {
    assert.deepEqual(WHEEL_REALMS, ['naraka', 'diyu']);
    assert.equal(hasWheel('naraka'), true);
    assert.equal(hasWheel('diyu'), true);
    assert.equal(hasWheel('hell'), false);
    assert.equal(hasWheel('nether-realm'), false);
  });

  it('the wheel disc is the far-north region (0,-230 r80)', () => {
    assert.deepEqual(WHEEL, { x: 0, z: -230, r: 80 });
    assert.equal(inWheel(0, -230), true);
    assert.equal(inWheel(0, -230 + 79), true);
    assert.equal(inWheel(0, -230 + 81), false);
    assert.equal(inWheel(0, 160), false);
  });

  it('riding returns you to the world above (the hub)', () => {
    assert.deepEqual(REBIRTH_DESTINATION, { route: '/', label: 'the world above' });
    assert.ok(rebirthAttuneIdemKey('user-1', 'naraka').startsWith('rebirth:attune:user-1:naraka'));
  });
});

// ── 5. SOUL STORE (device-local) ────────────────────────────────────

describe('souls store: device-local helpers never throw in node', () => {
  it('nonces are fresh and non-empty', () => {
    const a = newNonce();
    const b = newNonce();
    assert.ok(typeof a === 'string' && a.length > 0);
    assert.notEqual(a, b);
  });

  it('no localStorage in node means safe defaults', () => {
    assert.equal(readLocalDutchmanSouls(), 0);
    assert.equal(readPendingReconcile(), null);
    assert.deepEqual(readVisitedRealms(), []);
    assert.equal(readRebirthPoint(), null);
    assert.equal(deviceId(), 'unknown-device');
  });

  it('visited records drop unknown keys and keep order', () => {
    const recs = visitedRealmRecords(['hell', 'not-a-realm', 'naraka']);
    assert.deepEqual(recs.map((r) => r.key), ['hell', 'naraka']);
    assert.ok(recs.every((r) => r.route.startsWith('/')));
  });
});

// ── 6. SERVER CLIENT (fake service client) ──────────────────────────

function fakeClient({ rpcImpl, fromImpl } = {}) {
  return {
    rpc: async (name, params) => {
      if (rpcImpl) return rpcImpl(name, params);
      throw new Error(`unexpected rpc ${name}`);
    },
    from: (table) => {
      if (fromImpl) return fromImpl(table);
      throw new Error(`unexpected from ${table}`);
    },
  };
}

describe('souls server client: the aether.js contract, for souls', () => {
  it('creditSoul returns the new balance', async () => {
    const client = fakeClient({
      rpcImpl: async (name, params) => {
        assert.equal(name, 'soul_apply');
        assert.equal(params.p_delta, 1);
        assert.equal(params.p_reason, 'guide:rest');
        return { data: [{ entry_id: 'e1', balance_after: 5, was_duplicate: false, insufficient: false }], error: null };
      },
    });
    const res = await creditSoul({ userId: 'u1', amount: 1, reason: 'guide:rest', idemKey: 'k1' }, client);
    assert.equal(res.balanceAfter, 5);
    assert.equal(res.wasDuplicate, false);
  });

  it('an insufficient debit throws with the balance attached', async () => {
    const client = fakeClient({
      rpcImpl: async () => ({ data: [{ entry_id: null, balance_after: 0, was_duplicate: false, insufficient: true }], error: null }),
    });
    await assert.rejects(
      () => creditSoul({ userId: 'u1', amount: -1, reason: 'forge:cast', idemKey: 'k2' }, client),
      (err) => err instanceof SoulInsufficientError && err.balance === 0,
    );
  });

  it('a missing souls table answers setupRequired, never a crash', async () => {
    const client = fakeClient({
      rpcImpl: async () => ({ data: null, error: { code: '42P01', message: 'relation "public.soul_ledger" does not exist' } }),
    });
    await assert.rejects(
      () => creditSoul({ userId: 'u1', amount: 1, reason: 'guide:rest', idemKey: 'k3' }, client),
      (err) => err instanceof SoulUnavailableError && err.setupRequired === true,
    );
    // A missing aether function (soul_forge calling aether_apply
    // before aether.sql runs) is the same honest answer.
    const client2 = fakeClient({
      rpcImpl: async () => ({ data: null, error: { code: '42883', message: 'function aether_apply(uuid, integer, text, text, jsonb, text, integer) does not exist' } }),
    });
    await assert.rejects(
      () => soulForge({ userId: 'u1', idemKey: 'k4' }, client2),
      (err) => err instanceof SoulUnavailableError,
    );
  });

  it('soulForge maps the capped + insufficient flags, not exceptions', async () => {
    const capped = fakeClient({
      rpcImpl: async (name) => {
        assert.equal(name, 'soul_forge');
        return { data: [{ soul_balance_after: 3, aether_balance_after: 40, was_duplicate: false, capped: true, insufficient: false }], error: null };
      },
    });
    const c = await soulForge({ userId: 'u1', idemKey: 'k5' }, capped);
    assert.equal(c.capped, true);
    assert.equal(c.soulsAfter, 3); // the soul was NOT consumed

    const poor = fakeClient({
      rpcImpl: async () => ({ data: [{ soul_balance_after: 0, aether_balance_after: 0, was_duplicate: false, capped: false, insufficient: true }], error: null }),
    });
    const p = await soulForge({ userId: 'u1', idemKey: 'k6' }, poor);
    assert.equal(p.insufficient, true);
  });

  it('setRespawnRealm tolerates a missing table (best-effort mirror)', async () => {
    const client = fakeClient({
      rpcImpl: async () => ({ data: null, error: { code: '42P01', message: 'relation "public.soul_balances" does not exist' } }),
    });
    const res = await setRespawnRealm({ userId: 'u1', realm: 'naraka' }, client);
    assert.deepEqual(res, { stored: false });
  });

  it('getSoulBalance reads the profile row (balance + rebirth point)', async () => {
    const client = fakeClient({
      fromImpl: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { balance: 7, respawn_realm: 'diyu', respawn_attuned_at: '2026-11-15T00:00:00Z' }, error: null }),
          }),
        }),
      }),
    });
    const res = await getSoulBalance('u1', client);
    assert.equal(res.balance, 7);
    assert.equal(res.respawnRealm, 'diyu');
  });
});

// ── 7. THE STAGED SQL ───────────────────────────────────────────────

describe('supabase/souls.sql: staged, never run', () => {
  const sql = readFileSync(new URL('../supabase/souls.sql', import.meta.url), 'utf8');

  it('defines the ledger, the balances, and the three functions', () => {
    for (const name of ['soul_ledger', 'soul_balances', 'soul_apply', 'soul_forge', 'soul_set_respawn']) {
      assert.ok(sql.includes(name), `missing ${name}`);
    }
    assert.ok(sql.includes('respawn_realm'));
    assert.ok(sql.includes('enable row level security'));
    assert.ok(sql.includes('*** NOT RUN ***'));
  });

  it('the forge shares the refinery cap and calls aether_apply', () => {
    assert.ok(sql.includes("'refinery:forge'"));
    assert.ok(sql.includes("reason like 'refinery:%'"));
    assert.ok(sql.includes('aether_apply('));
    assert.ok(sql.includes('>= 40'), 'the 40/day cap must appear in the forge');
  });
});

// ── 8. THE WIRING (source assertions) ──────────────────────────────

describe('wiring: the spine is mounted where it lives', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('Hell carries the forge, the ferry, and the guide', () => {
    const page = read('../app/hell/page.jsx');
    assert.ok(page.includes('Cast a soul into the fire'));
    assert.ok(page.includes('Call Charon'));
    assert.ok(page.includes('Guide this soul to rest'));
    assert.ok(page.includes('Souls carried'));
    const scene = read('../app/hell/world3d.js');
    assert.ok(scene.includes('GuidedShade'));
    assert.ok(scene.includes('burstRef'));
    assert.ok(scene.includes('nearestGuidable'));
    assert.ok(scene.includes('nearRiver'));
  });

  it('the Styx carries the ferry to visited realms', () => {
    const page = read('../app/styx/page.jsx');
    assert.ok(page.includes('Or ride the ferry'));
    assert.ok(page.includes('ferryDestinations'));
    assert.ok(page.includes("kind: 'travel'"));
  });

  it('Naraka and Diyu carry the Wheel', () => {
    for (const realm of ['naraka', 'diyu']) {
      const page = read(`../app/${realm}/page.jsx`);
      assert.ok(page.includes('Ride the Wheel of Rebirth'));
      assert.ok(page.includes('Your rebirth point'));
      assert.ok(page.includes("action: 'ride'"));
    }
  });

  it('the five routes exist and call the right write paths', () => {
    assert.ok(read('../app/api/afterlife/souls/route.js').includes('creditSoul'));
    assert.ok(read('../app/api/afterlife/forge/route.js').includes('soulForge'));
    assert.ok(read('../app/api/afterlife/ferry/route.js').includes('debitGold'));
    assert.ok(read('../app/api/afterlife/guide/route.js').includes('lifeFor'));
    assert.ok(read('../app/api/afterlife/rebirth/route.js').includes('setRespawnRealm'));
  });
});
