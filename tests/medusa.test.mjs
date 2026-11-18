// tests/medusa.test.mjs
// MEDUSA'S LAIR (Merlin, 2026-11-15): the lair in Hades, the
// beheading fight, the reusable head, the petrify gaze, the
// permanent statues, the flat-20-shard upgrades, the orc-shard
// drop, and one motion agent per snake (never in lockstep).
// Run: node --test tests/medusa.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MEDUSA_LAIR,
  MEDUSA_MAX_HP,
  MEDUSA_REFORM_S,
  MEDUSA_SNAKE_COUNT,
  ORC_SHARD_ITEM_ID,
  PETRIFY_RANGE_M,
  PETRIFY_RESPAWN_M,
  UPGRADE_SHARD_COST,
  MAX_UPGRADE_LEVEL,
  MAX_VICTIMS_PER_USE,
  createMedusaBoss,
  strikeMedusa,
  tickMedusa,
  reformInS,
  medusaHeadItem,
  foesInPetrifyCone,
  petrifyRespawnSpot,
  statueRecordFor,
  sanitizeStatue,
  blockedByStatue,
  victimsPerUse,
  upgradeCostFor,
  canUpgrade,
  shardDropFor,
  snakePoseFor,
  headSnakesPose,
} from '../lib/nether-realm/medusa.js';
import { MEDUSA_LAIR as WORLD_LAIR, regionAt, makeWorld } from '../lib/nether-realm/world.js';
import {
  BACKPACK_ITEM_KINDS,
  addMedusaHeadItem,
  countItem,
  createItem,
  emptyBackpackRecord,
  itemsStack,
} from '../lib/backpack/backpack.js';
import { rollLoot, mulberry32 } from '../app/middle-earth/orcs.js';

describe('the lair', () => {
  it('lives in the southwest, clear of the spawn, Asphodel, the Gates and the river', () => {
    assert.equal(MEDUSA_LAIR.x, -260);
    assert.equal(MEDUSA_LAIR.z, 120);
    assert.equal(MEDUSA_LAIR.r, 40);
    // world.js is the single source of truth — the law re-exports it.
    assert.equal(WORLD_LAIR, MEDUSA_LAIR);
    assert.equal(regionAt(-260, 120), "Medusa's Lair");
    assert.equal(regionAt(0, 160), 'The Descent');
    // The lair is NOT a fourth drift disc in the afterlife operators:
    // those stay exactly three (the population law pins it) — the
    // lair is a boss chamber, and its area entry lives here, in the
    // Hades world data.
  });

  it('keeps lava pools out of the chamber', () => {
    const world = makeWorld(1337);
    for (const p of world.lavaPools) {
      const d = Math.hypot(p.x - MEDUSA_LAIR.x, p.z - MEDUSA_LAIR.z);
      assert.ok(d > MEDUSA_LAIR.r + 15, `pool ${p.id} is ${d.toFixed(1)} m from the lair centre`);
    }
  });
});

describe('the boss', () => {
  it('takes hits and dies, then reforms after 45 s', () => {
    const boss = createMedusaBoss(1000);
    assert.equal(boss.state, 'alive');
    assert.equal(boss.hp, MEDUSA_MAX_HP);
    assert.equal(MEDUSA_MAX_HP, 60);
    assert.equal(MEDUSA_REFORM_S, 45);
    let res = strikeMedusa(boss, 12, 2000);
    assert.equal(res.killed, false);
    assert.equal(boss.hp, 48);
    res = strikeMedusa(boss, 48, 3000);
    assert.equal(res.killed, true);
    assert.equal(boss.state, 'dead');
    assert.equal(boss.reformAtMs, 3000 + 45 * 1000);
    // A dead boss takes no more damage.
    assert.deepEqual(strikeMedusa(boss, 99, 4000), { damage: 0, killed: false });
    assert.equal(tickMedusa(boss, 3000 + 44 * 1000), null);
    assert.equal(reformInS(boss, 3000 + 44 * 1000), 1);
    assert.equal(tickMedusa(boss, 3000 + 45 * 1000), 'reformed');
    assert.equal(boss.state, 'alive');
    assert.equal(boss.hp, MEDUSA_MAX_HP);
    assert.equal(reformInS(boss), 0);
  });
});

describe('the head', () => {
  it('is a backpack kind, qty 1, never stacked, one per pack', () => {
    assert.ok(BACKPACK_ITEM_KINDS.includes('medusa-head'));
    const item = medusaHeadItem('2026-11-15T00:00:00.000Z');
    assert.equal(item.id, 'medusa-head');
    assert.equal(item.kind, 'medusa-head');
    assert.equal(item.qty, 1);
    assert.equal(item.meta.reusable, true);
    const entry = createItem(item);
    assert.equal(entry.qty, 1);
    const other = createItem(medusaHeadItem());
    assert.equal(itemsStack(entry, other), false);
    let rec = emptyBackpackRecord();
    rec = addMedusaHeadItem(rec, item);
    assert.equal(countItem(rec, 'medusa-head'), 1);
    // A second head is refused by the pack itself.
    const again = addMedusaHeadItem(rec, medusaHeadItem());
    assert.equal(again.items.length, rec.items.length);
    assert.equal(countItem(again, 'medusa-head'), 1);
  });
});

describe('the petrify gaze', () => {
  // Hades walker yaw: forward = (-sin yaw, -cos yaw). Yaw 0 faces
  // -Z, so a foe at (0, -10) from (0, 0) is dead ahead.
  const foes = [
    { id: 'near', x: 0, z: -5 },
    { id: 'far', x: 0, z: -12 },
    { id: 'far-edge', x: 0, z: -49 },
    { id: 'behind', x: 0, z: 8 },
    { id: 'edge', x: 14, z: -5 },
  ];

  it('takes foes in the cone, nearest first, capped at the limit', () => {
    assert.equal(PETRIFY_RANGE_M, 50);
    const one = foesInPetrifyCone(0, 0, 0, foes, 1);
    assert.deepEqual(one.map((f) => f.id), ['near']);
    const two = foesInPetrifyCone(0, 0, 0, foes, 2);
    assert.deepEqual(two.map((f) => f.id), ['near', 'far']);
    const five = foesInPetrifyCone(0, 0, 0, foes, 5);
    assert.deepEqual(five.map((f) => f.id), ['near', 'far', 'far-edge']);
  });

  it('refuses foes out of range, behind, or past the cone edge', () => {
    const out = foesInPetrifyCone(0, 0, 0, [{ id: 'too-far', x: 0, z: -51 }], 1);
    assert.deepEqual(out, []);
    const back = foesInPetrifyCone(0, 0, 0, [{ id: 'back', x: 0, z: 10 }], 1);
    assert.deepEqual(back, []);
    // 45° off-axis is past the ±24° cone.
    const wide = foesInPetrifyCone(0, 0, 0, [{ id: 'wide', x: 10, z: -10 }], 1);
    assert.deepEqual(wide, []);
    assert.deepEqual(foesInPetrifyCone(0, 0, 0, foes, 0), []);
  });

  it('respawns the victim exactly 100 m away — no edge to clamp to any more', () => {
    assert.equal(PETRIFY_RESPAWN_M, 100);
    const spot = petrifyRespawnSpot(0, 0, 0);
    assert.deepEqual(spot, { x: 100, z: 0 });
    const d = Math.hypot(petrifyRespawnSpot(10, 10, Math.PI).x - 10, petrifyRespawnSpot(10, 10, Math.PI).z - 10);
    assert.ok(Math.abs(d - 100) < 1e-9);
    // ENDLESS (Merlin, Nov 18, 2026): a statue anywhere wakes its
    // victim 100 m away — the raw offset, no world-edge clamp.
    const edge = petrifyRespawnSpot(370, 0, 0);
    assert.deepEqual(edge, { x: 470, z: 0 });
  });
});

describe('statues', () => {
  it('records carry victim, petrifier, place and time', () => {
    const rec = statueRecordFor({
      victim: { id: 'v1', name: 'Autumn', appearance: { color: '#ff0000' } },
      petrifier: { id: 'p1', name: 'Merlin' },
      x: 12,
      z: -34,
      nowMs: 1000,
    });
    assert.equal(rec.victim_user_id, 'v1');
    assert.equal(rec.victim_name, 'Autumn');
    assert.equal(rec.petrifier_name, 'Merlin');
    assert.equal(rec.realm, 'hades');
    assert.equal(rec.x, 12);
    assert.equal(rec.z, -34);
    assert.equal(rec.created_at, new Date(1000).toISOString());
  });

  it('sanitizes server rows and rejects junk', () => {
    assert.equal(sanitizeStatue(null), null);
    assert.equal(sanitizeStatue({ x: 'nope', z: 0 }), null);
    const s = sanitizeStatue({ id: 's1', victim_name: 'A', petrifier_name: 'B', x: 1, z: 2, created_at: '2026-11-15T00:00:00.000Z' });
    assert.equal(s.id, 's1');
    assert.equal(s.interim, false);
  });

  it('are solid: the walker cannot step within 1.4 m', () => {
    const statues = [{ x: 0, z: 0 }];
    assert.equal(blockedByStatue(0, 0, statues), true);
    assert.equal(blockedByStatue(1, 0, statues), true);
    assert.equal(blockedByStatue(2, 0, statues), false);
    assert.equal(blockedByStatue(0, 0, []), false);
  });
});

describe('upgrades', () => {
  it('start at 1 victim, flat 20 shards a tier, max 5', () => {
    assert.equal(UPGRADE_SHARD_COST, 20);
    assert.equal(MAX_UPGRADE_LEVEL, 4);
    assert.equal(MAX_VICTIMS_PER_USE, 5);
    assert.deepEqual([0, 1, 2, 3, 4].map(victimsPerUse), [1, 2, 3, 4, 5]);
    assert.equal(victimsPerUse(99), 5);
    assert.deepEqual([0, 1, 2, 3].map(upgradeCostFor), [20, 20, 20, 20]);
    assert.equal(upgradeCostFor(4), null);
    assert.deepEqual(canUpgrade(0, 19), { ok: false, reason: 'need-shards' });
    assert.deepEqual(canUpgrade(0, 20), { ok: true, reason: null });
    assert.deepEqual(canUpgrade(4, 999), { ok: false, reason: 'max' });
  });
});

describe('orc shards', () => {
  it('drop 1–2 from a warrior, 3–5 from a captain', () => {
    assert.equal(shardDropFor('warrior', () => 0), 1);
    assert.equal(shardDropFor('warrior', () => 0.99), 2);
    assert.equal(shardDropFor('captain', () => 0), 3);
    assert.equal(shardDropFor('captain', () => 0.99), 5);
  });

  it('ride the orc loot roll into the pack as a material', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = mulberry32(seed);
      const loot = rollLoot('warrior', rng);
      const shards = loot.find((l) => l.id === ORC_SHARD_ITEM_ID);
      assert.ok(shards, `seed ${seed}: no shard entry in ${JSON.stringify(loot)}`);
      assert.ok(shards.qty >= 1 && shards.qty <= 2, `warrior shards ${shards.qty}`);
    }
    const rng = mulberry32(7);
    const cap = rollLoot('captain', rng);
    const shards = cap.find((l) => l.id === ORC_SHARD_ITEM_ID);
    assert.ok(shards.qty >= 3 && shards.qty <= 5, `captain shards ${shards.qty}`);
  });
});

describe('snake motion agents', () => {
  it('are pure functions of index + clock + state', () => {
    const a = snakePoseFor({ index: 2, nowMs: 123456, state: 'idle' });
    const b = snakePoseFor({ index: 2, nowMs: 123456, state: 'idle' });
    assert.deepEqual(a, b);
    const c = snakePoseFor({ index: 2, nowMs: 123457, state: 'idle' });
    assert.notDeepEqual(a, c);
  });

  it('never move in lockstep: phases and behaviours differ per snake', () => {
    assert.equal(MEDUSA_SNAKE_COUNT, 7);
    const poses = headSnakesPose({ nowMs: 5000, state: 'idle' }).snakes;
    assert.equal(poses.length, 7);
    assert.deepEqual(poses.map((p) => p.behaviour), ['coil', 'sway', 'strike', 'rest', 'coil', 'sway', 'strike']);
    const swayXs = new Set(poses.map((p) => p.swayX.toFixed(4)));
    assert.ok(swayXs.size >= 4, `snakes share too few sway values: ${[...swayXs]}`);
    // Strike is a pulse, often 0 at any one instant — so sample
    // across time and require the snakes' strike envelopes to
    // differ somewhere in the window, not at a single frame.
    const strikeSeen = new Set();
    for (let t = 5000; t < 12000; t += 250) {
      for (const p of headSnakesPose({ nowMs: t, state: 'idle' }).snakes) {
        strikeSeen.add(p.strike.toFixed(3));
      }
    }
    assert.ok(strikeSeen.size >= 4, `snakes share too few strike values over time: ${[...strikeSeen]}`);
  });

  it('obey the head state: firing strikes, sheathed rests', () => {
    const firing = headSnakesPose({ nowMs: 5000, state: 'firing' });
    assert.ok(firing.snakes.every((p) => p.strike === 1));
    assert.ok(firing.meanStrike === 1);
    const sheathed = headSnakesPose({ nowMs: 5000, state: 'sheathed' });
    assert.ok(sheathed.snakes.every((p) => p.strike === 0));
    assert.ok(sheathed.snakes.every((p) => Math.abs(p.swayX) <= 0.1));
    assert.ok(Number.isFinite(firing.headTilt) && Number.isFinite(firing.headBob));
  });
});

describe('the scene and the law agree on paper', () => {
  it('world3d renders the lair, Medusa, foes, statues and the held head', () => {
    const scene = readFileSync(new URL('../app/nether-realm/world3d.js', import.meta.url), 'utf8');
    for (const name of ['MedusaLair', 'MedusaFigure', 'SnakeHair', 'HeadViewModel', 'FoeFigures', 'Statues']) {
      assert.ok(scene.includes(`function ${name}`), `world3d.js is missing ${name}`);
    }
    assert.ok(scene.includes('heroMotionPose'), 'lair walk does not use the ME step rhythm');
    assert.ok(scene.includes('heroPhaseRate'), 'lair walk does not advance the ME phase');
    assert.ok(scene.includes('blockedByStatue'), 'statues are not solid in the scene');
  });

  it('the page wires strike, claim, use, upgrade and presence', () => {
    const page = readFileSync(new URL('../app/nether-realm/page.jsx', import.meta.url), 'utf8');
    for (const token of ['onStrikeMedusa', 'claimHead', 'onUseHead', 'onUpgradeHead', "sector: 'hades'", 'BackpackHud']) {
      assert.ok(page.includes(token), `page.jsx is missing ${token}`);
    }
  });

  it('the SQL stages both tables with the level check and RLS', () => {
    const sql = readFileSync(new URL('../supabase/medusa.sql', import.meta.url), 'utf8');
    assert.ok(sql.includes('create table if not exists public.medusa_heads'));
    assert.ok(sql.includes('create table if not exists public.medusa_statues'));
    assert.ok(sql.includes('upgrade_level <= 4'));
    assert.ok(sql.includes('enable row level security'));
    assert.ok(sql.includes('DO NOT RUN'));
  });
});
