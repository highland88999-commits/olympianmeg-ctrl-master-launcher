// tests/ghost-rider.test.mjs — GHOST RIDER realm: layout math, the
// turn-based battle law, the flaming chain (3 uses + 1 h cooldown),
// the incineration/respawn law, and static audits of the page, the
// scene, the registries, and the API route.
// Run: node --test tests/ghost-rider.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  WORLD_RADIUS,
  SPAWN,
  RIDER,
  DAMNED_FIELD,
  DAMNED_COUNT,
  PORTALS,
  PORTAL_TRIGGER_RADIUS,
  TALK_RANGE_M,
  WALK_SPEED,
  RUN_SPEED,
  forward,
  right,
  stepPosition,
  regionAt,
  nearRider,
  nearestPortal,
  makeDamned,
  damnedWanderTarget,
  mulberry32,
} from '../lib/ghost-rider/world.js';
import {
  PLAYER_MAX_HP,
  RIDER_MAX_HP,
  PLAYER_MOVES,
  RIDER_MOVES,
  DIALOGUE,
  createBattle,
  takeTurn,
  battleOver,
  hpFraction,
} from '../lib/ghost-rider/battle.js';
import {
  LAKE_OF_FIRE,
  LAKE_RESPAWN,
  LAKE_LANDING_KEY,
  CHAIN_ITEM_ID,
  CHAIN_MAX_USES,
  CHAIN_COOLDOWN_MS,
  CHAIN_RANGE_M,
  CHAIN_CONE_DEG,
  CHAIN_UPGRADE_SHARD_COST,
  CHAIN_MAX_UPGRADE_LEVEL,
  CHAIN_MAX_CHAINS_PER_THROW,
  chainsPerThrow,
  chainUpgradeCostFor,
  canUpgradeChain,
  createChainItem,
  chainStateOf,
  refreshChain,
  chainUsable,
  useChain,
  chainStatus,
  formatCooldown,
  findChainTarget,
  findChainTargets,
  incinerationRecordFor,
  sanitizeIncineration,
  npcLakeWanderTarget,
  setLakeLanding,
  consumeLakeLanding,
} from '../lib/ghost-rider/chain.js';
import { REGIONS as HELL_REGIONS } from '../lib/hell/world.js';
import {
  BACKPACK_ITEM_KINDS,
  addFlamingChainItem,
  createItem,
} from '../lib/backpack/backpack.js';

const NOW = 1800000000000;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/** An rng that returns the given values in order, then repeats the last. */
function seq(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0.5;
}

const memStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};

// --- the realm layout ------------------------------------------------------

test('layout: spawn south, Rider north, one arch back to Hell', () => {
  assert.equal(WORLD_RADIUS, 260);
  assert.deepEqual({ x: SPAWN.x, z: SPAWN.z }, { x: 0, z: 140 });
  assert.deepEqual({ x: RIDER.x, z: RIDER.z }, { x: 0, z: -60 });
  assert.equal(PORTALS.length, 1);
  assert.equal(PORTALS[0].route, '/hell');
  assert.equal(PORTALS[0].key, 'hell');
  assert.ok(dist(PORTALS[0].x, PORTALS[0].z, SPAWN.x, SPAWN.z) < 60, 'the way back is beside the spawn');
  assert.ok(dist(RIDER.x, RIDER.z, SPAWN.x, SPAWN.z) > 150, 'a real walk to the Rider');
  assert.equal(WALK_SPEED, 8);
  assert.equal(RUN_SPEED, 14);
});

test('regionAt names the circle, the field, the approach', () => {
  assert.equal(regionAt(RIDER.x, RIDER.z), "The Rider's Circle");
  assert.equal(regionAt(DAMNED_FIELD.x, DAMNED_FIELD.z), 'The Damned Field');
  assert.equal(regionAt(SPAWN.x, SPAWN.z), 'The Approach');
});

test('nearRider: talk range is 6 m', () => {
  assert.equal(TALK_RANGE_M, 6);
  assert.equal(nearRider(0, -60), true);
  assert.equal(nearRider(0, -54), true);
  assert.equal(nearRider(0, -53), false);
});

test('movement: forward/right, no edge, no river to block (endless)', () => {
  assert.deepEqual(forward(0), { x: -0, z: -1 });
  assert.deepEqual(right(0), { x: 1, z: -0 });
  // ENDLESS (Merlin, Nov 18, 2026): a step past the old 260 m rim
  // lands where it lands — no clamp, no wall, no turn-back.
  const past = stepPosition(250, 0, 30, 0);
  assert.deepEqual({ x: past.x, z: past.z, blocked: past.blocked }, { x: 280, z: 0, blocked: false });
  const s = stepPosition(0, 0, 10, 0);
  assert.deepEqual({ x: s.x, z: s.z, blocked: s.blocked }, { x: 10, z: 0, blocked: false });
  assert.equal(nearestPortal(-40, 120, PORTAL_TRIGGER_RADIUS).key, 'hell');
  assert.equal(nearestPortal(0, 0), null);
});

test('the damned: 8 souls, seeded, inside the field disc', () => {
  const damned = makeDamned();
  assert.equal(damned.length, DAMNED_COUNT);
  const ids = new Set(damned.map((d) => d.id));
  assert.equal(ids.size, DAMNED_COUNT);
  for (const d of damned) {
    assert.ok(dist(d.x, d.z, DAMNED_FIELD.x, DAMNED_FIELD.z) <= DAMNED_FIELD.r,
      `${d.id} stands in the field`);
    assert.ok(d.slow > 0 && d.slow < 1, 'a slow wander speed');
  }
  assert.deepEqual(makeDamned(), damned, 'seeded — same souls every load');
  const t = damnedWanderTarget(mulberry32(7));
  assert.ok(dist(t.x, t.z, DAMNED_FIELD.x, DAMNED_FIELD.z) <= DAMNED_FIELD.r);
});

// --- the battle ------------------------------------------------------------

test('battle: fresh state — you move first, full HP both sides', () => {
  const b = createBattle(NOW);
  assert.equal(b.phase, 'player');
  assert.equal(b.playerHp, PLAYER_MAX_HP);
  assert.equal(b.riderHp, RIDER_MAX_HP);
  assert.equal(b.turn, 1);
  assert.equal(b.log.length, 0);
});

test('battle: a hit lands, the Rider answers, the turn advances', () => {
  // rng 0: your roll hits (0 < accuracy), his pick is move 0 (Chain Sweep, 14).
  const b = takeTurn(createBattle(NOW), 'chain-lash', seq([0, 0]));
  assert.equal(b.riderHp, RIDER_MAX_HP - PLAYER_MOVES['chain-lash'].damage);
  assert.equal(b.playerHp, PLAYER_MAX_HP - RIDER_MOVES[0].damage);
  assert.equal(b.turn, 2);
  assert.equal(b.phase, 'player');
  assert.equal(b.log.length, 2);
});

test('battle: a miss costs the turn — the Rider still answers', () => {
  // rng 0.9: hellfire (0.75) misses, his pick 0.9 -> move 2 (Skull Bash, 10).
  const b = takeTurn(createBattle(NOW), 'hellfire', seq([0.9, 0.9]));
  assert.equal(b.riderHp, RIDER_MAX_HP);
  assert.equal(b.playerHp, PLAYER_MAX_HP - RIDER_MOVES[2].damage);
  assert.equal(b.turn, 2);
});

test('battle: win — four Penance Stares end it, and the turn stops', () => {
  let b = createBattle(NOW);
  for (let i = 0; i < 4; i += 1) b = takeTurn(b, 'penance-stare', seq([0, 0]));
  assert.equal(b.phase, 'won');
  assert.equal(b.riderHp, 0);
  assert.ok(b.playerHp > 0, 'you survive the four turns');
  assert.equal(battleOver(b), true);
  const again = takeTurn(b, 'chain-lash', seq([0, 0]));
  assert.equal(again.phase, 'won', 'a finished battle takes no more turns');
  assert.equal(again.log.length, b.log.length + 1);
});

test('battle: lose — five missed hellfires and his fire takes you', () => {
  let b = createBattle(NOW);
  // rng 0.9 misses hellfire every time; his pick 0.5 -> move 1 (Hellfire, 20).
  for (let i = 0; i < 5; i += 1) b = takeTurn(b, 'hellfire', seq([0.9, 0.5]));
  assert.equal(b.phase, 'lost');
  assert.equal(b.playerHp, 0);
  assert.equal(battleOver(b), true);
});

test('battle: a move that is not yours does nothing', () => {
  const b = takeTurn(createBattle(NOW), 'skull-bash', seq([0, 0]));
  assert.equal(b.phase, 'player');
  assert.equal(b.riderHp, RIDER_MAX_HP);
  assert.equal(b.playerHp, PLAYER_MAX_HP);
  assert.equal(b.turn, 1);
});

test('battle: the conversation is three exchanges, then the fight', () => {
  assert.equal(DIALOGUE.length, 3);
  for (const step of DIALOGUE) {
    assert.ok(step.rider.length > 0, 'he speaks');
    assert.equal(step.choices.length, 2, 'you answer');
  }
});

test('battle: hpFraction is 0–1 for the bars', () => {
  assert.equal(hpFraction(50, 100), 0.5);
  assert.equal(hpFraction(0, 100), 0);
  assert.equal(hpFraction(150, 100), 1);
  assert.equal(hpFraction(-5, 100), 0);
});

// --- the chain -------------------------------------------------------------

test('chain: the item — one chain, 3 charges, no cooldown', () => {
  assert.ok(BACKPACK_ITEM_KINDS.includes('flaming-chain'));
  const item = createItem(createChainItem());
  assert.equal(item.id, CHAIN_ITEM_ID);
  assert.equal(item.kind, 'flaming-chain');
  assert.equal(item.qty, 1);
  assert.deepEqual(chainStateOf(item), { charges: CHAIN_MAX_USES, cooldownUntilMs: 0 });
  assert.equal(CHAIN_MAX_USES, 3);
  assert.equal(CHAIN_COOLDOWN_MS, 60 * 60 * 1000);
});

test('chain: one per user — a second chain is refused', () => {
  let rec = addFlamingChainItem(null, createChainItem());
  assert.equal(rec.items.length, 1);
  rec = addFlamingChainItem(rec, createChainItem());
  assert.equal(rec.items.length, 1, 'the pack holds at most one chain');
});

test('chain: 3 uses, then a one-hour cooldown — use it wisely', () => {
  let item = createItem(createChainItem());
  for (let i = 0; i < 3; i += 1) {
    assert.equal(chainUsable(item, NOW + i * 1000).ok, true);
    item = useChain(item, NOW + i * 1000);
  }
  assert.deepEqual(chainStateOf(item), { charges: 0, cooldownUntilMs: NOW + 2000 + CHAIN_COOLDOWN_MS });
  const cold = chainUsable(item, NOW + 3000);
  assert.equal(cold.ok, false);
  assert.equal(cold.reason, 'cooldown');
  assert.ok(cold.cooldownRemainingMs > 0 && cold.cooldownRemainingMs <= CHAIN_COOLDOWN_MS);
  const label = chainStatus(item, NOW + 3000).label;
  assert.ok(label.includes('cooling down'), 'the pill says cooling down');
  // A spent chain cannot be spent again.
  assert.equal(useChain(item, NOW + 3000).meta.chain.charges, 0);
});

test('chain: after the hour the 3 charges return', () => {
  let item = createItem(createChainItem());
  for (let i = 0; i < 3; i += 1) item = useChain(item, NOW + i * 1000);
  const after = NOW + 2000 + CHAIN_COOLDOWN_MS;
  assert.equal(chainUsable(item, after).ok, true, 'the hour has passed');
  const refreshed = refreshChain(item, after);
  assert.deepEqual(chainStateOf(refreshed), { charges: 3, cooldownUntilMs: 0 });
  assert.equal(chainStatus(refreshed, after).label, '🔥 Flaming Chain — 3 uses left');
  assert.equal(formatCooldown(59999), '1:00');
  assert.equal(formatCooldown(3600000), '60:00');
});

test('chain: the reach — nearest in front, inside 20 m and the 30° cone', () => {
  assert.equal(CHAIN_RANGE_M, 20);
  assert.equal(CHAIN_CONE_DEG, 30);
  const player = { x: 0, z: 0, yaw: 0 }; // facing north (-Z)
  const ahead = { id: 'u1', label: 'Foe', x: 0, z: -10 };
  const behind = { id: 'u2', label: 'Back', x: 0, z: 10 };
  const far = { id: 'u3', label: 'Far', x: 0, z: -25 };
  const aside = { id: 'u4', label: 'Aside', x: 10, z: -10 }; // 45° off — outside the cone
  assert.equal(findChainTarget(player, [behind, far, aside, ahead], []).target.id, 'u1');
  assert.equal(findChainTarget(player, [behind], []), null);
  assert.equal(findChainTarget(player, [behind, far, aside], []), null);
  assert.equal(findChainTarget(player, [], []), null);
  // The nearest wins, and NPCs count the same as users.
  const near = { id: 'n1', label: 'Damned', x: 2, z: -5 };
  const hit = findChainTarget(player, [ahead], [near]);
  assert.equal(hit.kind, 'npc');
  assert.equal(hit.target.id, 'n1');
});

// --- the chain upgrades (Merlin, Nov 15 ~02:52: SAME as the head) --------

test('chain upgrades: level 0 = 1 chain, +1 per tier to 5 max, flat 20 shards', () => {
  assert.equal(CHAIN_UPGRADE_SHARD_COST, 20, 'the same cost as the head');
  assert.equal(CHAIN_MAX_UPGRADE_LEVEL, 4, '4 upgrades');
  assert.equal(CHAIN_MAX_CHAINS_PER_THROW, 5, '5 chains max');
  assert.equal(chainsPerThrow(0), 1, 'start with one chain');
  assert.equal(chainsPerThrow(1), 2);
  assert.equal(chainsPerThrow(2), 3);
  assert.equal(chainsPerThrow(3), 4);
  assert.equal(chainsPerThrow(4), 5);
  assert.equal(chainsPerThrow(9), 5, 'the cap holds past level 4');
  assert.equal(chainsPerThrow(-1), 1, 'a bad level reads as 0');
  assert.equal(chainUpgradeCostFor(0), 20);
  assert.equal(chainUpgradeCostFor(3), 20, 'flat — no ladder pricing');
  assert.equal(chainUpgradeCostFor(4), null, 'nothing to buy at max');
  assert.equal(chainUpgradeCostFor(9), null);
  // 80 shards total for the full ladder, like the head.
  assert.equal(CHAIN_UPGRADE_SHARD_COST * CHAIN_MAX_UPGRADE_LEVEL, 80);
});

test('chain upgrades: canUpgradeChain — shards, then the cap', () => {
  assert.deepEqual(canUpgradeChain(0, 20), { ok: true, reason: null });
  assert.deepEqual(canUpgradeChain(0, 19), { ok: false, reason: 'need-shards' });
  assert.deepEqual(canUpgradeChain(0, 0), { ok: false, reason: 'need-shards' });
  assert.deepEqual(canUpgradeChain(3, 20), { ok: true, reason: null });
  assert.deepEqual(canUpgradeChain(4, 999), { ok: false, reason: 'max' }, 'shards cannot buy past 4');
  assert.deepEqual(canUpgradeChain(9, 999), { ok: false, reason: 'max' });
});

test('chain upgrades: a level-4 throw wraps 5 targets, nearest first', () => {
  const player = { x: 0, z: 0, yaw: 0 }; // facing north (-Z)
  const foes = [
    { id: 'u7', x: 0, z: -18 },
    { id: 'u1', x: 0, z: -4 },
    { id: 'u5', x: 0, z: -14 },
    { id: 'u3', x: 0, z: -9 },
    { id: 'u2', x: 0, z: -6 },
    { id: 'u6', x: 0, z: -16 },
    { id: 'u4', x: 0, z: -11 },
  ];
  const five = findChainTargets(player, foes, [], chainsPerThrow(4));
  assert.equal(five.length, 5, 'five chains, five souls');
  assert.deepEqual(five.map((h) => h.target.id), ['u1', 'u2', 'u3', 'u4', 'u5'], 'nearest first');
  const one = findChainTargets(player, foes, [], chainsPerThrow(0));
  assert.equal(one.length, 1, 'level 0 wraps one');
  assert.equal(one[0].target.id, 'u1');
  // The single-target finder is the level-0 case.
  assert.equal(findChainTarget(player, foes, []).target.id, 'u1');
  assert.deepEqual(findChainTargets(player, foes, [], 0), [], 'a zero limit wraps nothing');
  assert.deepEqual(findChainTargets(null, foes, [], 5), [], 'no walker, no throw');
});

test('chain upgrades: the 3-use budget + 1-hour cooldown is unchanged by level', () => {
  // One use = one throw, however many chains fly: the level changes
  // the throw's width, never the budget.
  let item = createItem(createChainItem());
  for (let i = 0; i < 3; i += 1) item = useChain(item, NOW + i * 1000);
  assert.deepEqual(chainStateOf(item), { charges: 0, cooldownUntilMs: NOW + 2000 + CHAIN_COOLDOWN_MS });
  assert.equal(chainUsable(item, NOW + 3000).reason, 'cooldown');
});

// --- the incineration / respawn law ----------------------------------------

test('respawn: the Lake of Fire is Hell’s own region, single source of truth', () => {
  const hellLake = HELL_REGIONS.find((r) => r.key === 'lake-of-fire');
  assert.deepEqual(
    { x: LAKE_OF_FIRE.x, z: LAKE_OF_FIRE.z, r: LAKE_OF_FIRE.r },
    { x: hellLake.x, z: hellLake.z, r: hellLake.r },
  );
  assert.equal(LAKE_OF_FIRE.x, 160);
  assert.equal(LAKE_OF_FIRE.z, -70);
});

test('respawn: the lake landing sits on the lake’s south rim, facing the fire', () => {
  assert.ok(dist(LAKE_RESPAWN.x, LAKE_RESPAWN.z, LAKE_OF_FIRE.x, LAKE_OF_FIRE.z) < LAKE_OF_FIRE.r,
    'inside the lake disc');
  assert.equal(LAKE_RESPAWN.z, -5);
  assert.equal(LAKE_RESPAWN.yaw, 0);
});

test('respawn: the lake-landing flag is set once and consumed once', () => {
  const store = memStore();
  assert.equal(consumeLakeLanding(store), false);
  assert.equal(setLakeLanding(store), true);
  assert.equal(consumeLakeLanding(store), true);
  assert.equal(consumeLakeLanding(store), false, 'a plain visit is untouched');
  assert.equal(LAKE_LANDING_KEY, 'olympus:ghost-rider:lake-landing:v1');
});

test('respawn: an incinerated NPC wanders inside the lake disc', () => {
  const rand = mulberry32(99);
  for (let i = 0; i < 10; i += 1) {
    const t = npcLakeWanderTarget(rand);
    assert.ok(dist(t.x, t.z, LAKE_OF_FIRE.x, LAKE_OF_FIRE.z) <= LAKE_OF_FIRE.r - 8,
      'the damned roam around the lake, never leaving it');
  }
});

test('incineration: records carry victim, chainer, realm, place', () => {
  const rec = incinerationRecordFor({
    victim: { id: 'v1', name: 'Foe' },
    chainer: { id: 'c1', name: 'Me' },
    realm: 'hades',
    x: 10,
    z: -20,
    kind: 'user',
  });
  assert.equal(rec.victim_user_id, 'v1');
  assert.equal(rec.chainer_user_id, 'c1');
  assert.equal(rec.realm, 'hades');
  assert.equal(rec.victim_kind, 'user');
  const npc = incinerationRecordFor({
    victim: { id: 'damned-3', name: 'Damned' },
    chainer: { id: 'c1', name: 'Me' },
    realm: 'ghost-rider',
    x: 0,
    z: 40,
    kind: 'npc',
  });
  assert.equal(npc.victim_kind, 'npc');
  assert.equal(sanitizeIncineration({ ...rec, id: 'r1', created_at: new Date(NOW).toISOString() }).id, 'r1');
  assert.equal(sanitizeIncineration({}), null);
  assert.equal(sanitizeIncineration({ id: 'r1' }).victim_kind, 'user');
});

// --- static audits: page, scene, registries, API, SQL ---------------------

test('files exist: realm page + scene, API routes, staged SQL', () => {
  assert.ok(existsSync('app/ghost-rider/page.jsx'), 'the realm page');
  assert.ok(existsSync('app/ghost-rider/world3d.js'), 'the realm scene');
  assert.ok(existsSync('app/api/ghost-rider/incinerations/route.js'), 'the incinerations API');
  assert.ok(existsSync('app/api/ghost-rider/chains/route.js'), 'the chains claim/status API');
  assert.ok(existsSync('app/api/ghost-rider/chains/upgrade/route.js'), 'the chains upgrade API');
  assert.ok(existsSync('supabase/ghost-rider.sql'), 'the staged SQL');
  assert.ok(!existsSync('app/ghost-rider/page.tsx'), 'no duplicate page');
});

test('page wires the talk, the battle, the chain, and its upgrade', () => {
  const src = readFileSync('app/ghost-rider/page.jsx', 'utf8');
  assert.ok(src.includes('Talk to the Ghost Rider'), 'the talk prompt');
  assert.ok(src.includes('createBattle'), 'the battle law');
  assert.ok(src.includes('takeTurn'), 'turns are taken');
  assert.ok(src.includes('DIALOGUE'), 'the conversation');
  assert.ok(src.includes('addFlamingChainItem'), 'winning grants the chain');
  assert.ok(src.includes('claimChain'), 'the win claims the server row');
  assert.ok(src.includes('Use the Chain'), 'the chain button');
  assert.ok(src.includes('findChainTargets'), 'the throw finds its targets');
  assert.ok(src.includes('onUpgradeChain'), 'the upgrade handler');
  assert.ok(src.includes('Chain level'), 'the upgrade button');
  assert.ok(src.includes('/api/ghost-rider/chains/upgrade'), 'the upgrade route');
  assert.ok(src.includes('ghost-rider'), 'presence sector');
});

test('scene is procedural CGI — no GLB, no Tripo', () => {
  const src = readFileSync('app/ghost-rider/world3d.js', 'utf8');
  assert.ok(!/\.glb/i.test(src), 'no GLB in the scene');
  assert.ok(!/tripo/i.test(src), 'no Tripo in the scene');
  assert.ok(src.includes('ChainFx') || src.includes('chain'), 'the chain effect renders');
  assert.ok(src.includes('Rider') || src.includes('RIDER'), 'the Rider renders');
});

test('registries: ghost-rider in BOTH, plus all 34 locales', () => {
  const sats = readFileSync('lib/i18n/satellites.ts', 'utf8');
  assert.ok(sats.includes('key: "ghost-rider"'), 'satellites.ts carries it');
  assert.ok(sats.includes('route: "/ghost-rider"'), 'the route is /ghost-rider');
  const menus = readFileSync('lib/god-menus.js', 'utf8');
  assert.ok(menus.includes("'ghost-rider'"), 'god-menus.js carries it');
  assert.ok(menus.includes("'hell', 'ghost-rider'"), 'it rides under the HELL menu home — a realm in Christian hell, not a new god');
  const locales = readdirSync('lib/i18n/locales').filter((f) => f.endsWith('.json'));
  assert.equal(locales.length, 34);
  for (const f of locales) {
    const data = JSON.parse(readFileSync(`lib/i18n/locales/${f}`, 'utf8'));
    assert.equal(data['sat.ghost-rider.title'], 'Ghost Rider', `${f} titles it`);
    assert.ok(typeof data['sat.ghost-rider.subtitle'] === 'string' && data['sat.ghost-rider.subtitle'].length > 0, `${f} subtitles it`);
  }
});

test('Hades wires the chain: button, effect, victim poll, upgrade', () => {
  const page = readFileSync('app/nether-realm/page.jsx', 'utf8');
  assert.ok(page.includes('onUseChain'), 'the use handler');
  assert.ok(page.includes('chainFx'), 'the effect prop');
  assert.ok(page.includes('fetchIncinerations'), 'the victim poll');
  assert.ok(page.includes('setLakeLanding'), 'a burned victim is sent to the lake');
  assert.ok(page.includes('findChainTargets'), 'the throw finds its targets');
  assert.ok(page.includes('onUpgradeChain'), 'the upgrade handler');
  assert.ok(page.includes('Chain level'), 'the upgrade button');
  assert.ok(page.includes('/api/ghost-rider/chains/upgrade'), 'the upgrade route');
  assert.ok(page.includes('fetchChainStatus'), 'the level is read from the server');
  const scene = readFileSync('app/nether-realm/world3d.js', 'utf8');
  assert.ok(scene.includes('ChainFx'), 'the scene renders the chain effect');
  assert.ok(scene.includes('targets'), 'the scene renders one chain per target');
  const grScene = readFileSync('app/ghost-rider/world3d.js', 'utf8');
  assert.ok(grScene.includes('targets'), 'the Rider scene renders one chain per target');
});

test('Hell honours the lake landing', () => {
  const src = readFileSync('app/hell/page.jsx', 'utf8');
  assert.ok(src.includes('consumeLakeLanding'), 'the flag is read on mount');
  assert.ok(src.includes('LAKE_RESPAWN'), 'the landing is the lake rim');
  assert.ok(src.includes('The Lake of Fire'), 'the region reads as the lake');
});

test('API + SQL: the incinerations table, the chains table, public read, service-only write', () => {
  const route = readFileSync('app/api/ghost-rider/incinerations/route.js', 'utf8');
  assert.ok(route.includes('ghost_rider_incinerations'), 'the table');
  assert.ok(route.includes("status: 503"), 'honest 503 while the SQL is staged');
  const chains = readFileSync('app/api/ghost-rider/chains/route.js', 'utf8');
  assert.ok(chains.includes('ghost_rider_chains'), 'the chains table');
  assert.ok(chains.includes('chainsPerThrow'), 'the status carries the throw width');
  const upgrade = readFileSync('app/api/ghost-rider/chains/upgrade/route.js', 'utf8');
  assert.ok(upgrade.includes('ghost_rider_chains'), 'the upgrade reads the chain row');
  assert.ok(upgrade.includes('CHAIN_MAX_UPGRADE_LEVEL'), 'the cap is enforced');
  assert.ok(upgrade.includes("status: 400"), 'past the cap is refused');
  assert.ok(upgrade.includes("status: 503"), 'honest 503 while the SQL is staged');
  const sql = readFileSync('supabase/ghost-rider.sql', 'utf8');
  assert.ok(sql.includes('create table if not exists public.ghost_rider_incinerations'), 'the table');
  assert.ok(sql.includes('create table if not exists public.ghost_rider_chains'), 'the chains table');
  assert.ok(sql.includes('check (upgrade_level >= 0 and upgrade_level <= 4)'), 'the level cap is in the schema');
  assert.ok(sql.includes('ghost_rider_chains owner read'), 'owner-only chain read');
  assert.ok(sql.includes('ghost_rider_incinerations public read'), 'public read');
  assert.ok(sql.includes('STAGED, DO NOT RUN YET'), 'staged, not run');
});
