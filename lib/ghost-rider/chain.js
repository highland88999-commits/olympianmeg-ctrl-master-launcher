// lib/ghost-rider/chain.js
// THE FLAMING CHAIN — the law (Merlin, 2026-11-15 ~02:39).
//
// Win the Rider's battle and the chain is yours: a backpack item
// (kind 'flaming-chain', qty 1, never stacked). USE IT WISELY:
// 3 uses, then a ONE-HOUR cooldown — after the hour the 3 charges
// return. Charges + the cooldown timestamp live in the backpack
// record itself (item meta, client-side like ME loot); server
// persistence across devices is a follow-up, flagged, not built.
//
// THE EFFECT (CGI — Merlin, Nov 15 ~02:40): the chain extends and
// wraps around its target, bursts the target into flames, and
// incinerates them. No GLB anywhere in this — the chain and the
// fire are procedural CGI in the scene.
//
// UPGRADES (Merlin, Nov 15 ~02:52): the SAME upgrade feature and
// logic as Medusa's head — start with ONE chain, up to FIVE chains,
// same cost: FLAT 20 orc shards per upgrade, 4 upgrades, 80 shards
// total. Level persists in ghost_rider_chains (server-side, like
// medusa_heads). Interpretation (flagged for his correction): each
// upgrade adds one more chain to a throw — level 0 wraps 1 target
// per use, level 4 wraps 5 targets per use. The 3-use budget +
// 1-hour cooldown is UNCHANGED: one use = one throw, however many
// chains fly — the same shape as the head (level 0 = 1 victim per
// use, level 4 = 5 victims per use, 20 shards per tier).
//
// THE RESPAWN LAW: the incinerated target respawns in hell.
//   · NPCs respawn at the Lake of Fire and roam aimlessly around
//     it (the lake already has its roamers — lib/hell/world.js
//     shades wander the lake disc; an incinerated NPC joins them).
//   · Users respawn in the Lake of Fire and have to find their way
//     from there: the victim's client sees the incineration record,
//     sets the lake-landing flag, and travels to /hell — /hell
//     honours the flag on mount and lands them at the lake's rim.
//
// How a victim's client learns it was burned follows the Medusa
// self-petrify pattern (app/nether-realm/page.jsx): the
// incineration is a shared record (ghost_rider_incinerations,
// staged in supabase/ghost-rider.sql — NOT run), polled by the
// pages where the chain can be used; a fresh record naming you
// moves you. Until the SQL runs, incinerations land as interim
// records on the attacker's device only, clearly labelled —
// nobody is moved by a record the server never saw, and no fake
// respawn is ever shown.
//
// This module is pure except for the guarded localStorage helpers
// at the bottom: no DOM, no three.js, no Supabase — safe to import
// in node for headless testing and in the page/scene loops.

import { REGIONS } from '../hell/world.js';

// The Lake of Fire is the single source of truth in lib/hell/world.js
// (region 'lake-of-fire' at 160, -70, r 70) — re-exported here so the
// chain law is the one import the pages need.
export const LAKE_OF_FIRE = REGIONS.find((r) => r.key === 'lake-of-fire');

// Where an incinerated user lands: the lake's south rim, facing the
// fire (yaw 0 faces north, toward the lake centre at z = -70).
export const LAKE_RESPAWN = { x: 160, z: -5, yaw: 0 };

// The flag a victim's client sets before travelling to /hell, so
// /hell lands them at the lake instead of the Descent.
export const LAKE_LANDING_KEY = 'olympus:ghost-rider:lake-landing:v1';

// ── The item ───────────────────────────────────────────────────────
export const CHAIN_ITEM_ID = 'flaming-chain';
export const CHAIN_ITEM_NAME = 'Flaming Chain';
export const CHAIN_MAX_USES = 3;
export const CHAIN_COOLDOWN_MS = 60 * 60 * 1000; // one hour

// ── Upgrades ─────────────────────────────────────────────────────
// FLAT 20 orc shards per upgrade (Merlin, Nov 15 ~02:52) — the
// SAME cost as Medusa's head, +1 chain per throw each, up to 5
// chains max (4 upgrades, 80 shards total). Level persists in
// ghost_rider_chains (server-side, like medusa_heads).
export const CHAIN_UPGRADE_SHARD_COST = 20;
export const CHAIN_MAX_UPGRADE_LEVEL = 4;
export const CHAIN_MAX_CHAINS_PER_THROW = 5;

/** Chains one throw wraps at this upgrade level (level 0 = 1). */
export function chainsPerThrow(level) {
  const l = Math.max(0, Math.floor(Number(level) || 0));
  return Math.min(CHAIN_MAX_CHAINS_PER_THROW, 1 + l);
}

/** Shards the next upgrade costs — flat 20 at every tier. */
export function chainUpgradeCostFor(level) {
  if (Math.floor(Number(level) || 0) >= CHAIN_MAX_UPGRADE_LEVEL) return null;
  return CHAIN_UPGRADE_SHARD_COST;
}

/** Can this level buy the next upgrade with this many shards? */
export function canUpgradeChain(level, shardsHeld) {
  const l = Math.floor(Number(level) || 0);
  if (l >= CHAIN_MAX_UPGRADE_LEVEL) return { ok: false, reason: 'max' };
  const shards = Math.max(0, Math.floor(Number(shardsHeld) || 0));
  if (shards < CHAIN_UPGRADE_SHARD_COST) return { ok: false, reason: 'need-shards' };
  return { ok: true, reason: null };
}

// The chain's reach: nearest target inside this range and cone
// (worker's choice — the Medusa gaze is 15 m ±24°; the chain
// reaches a little further, 20 m ±30°, because it extends).
export const CHAIN_RANGE_M = 20;
export const CHAIN_CONE_DEG = 30;

/** Fresh chain item input for the backpack (meta.chain carries the charges). */
export function createChainItem() {
  return {
    id: CHAIN_ITEM_ID,
    kind: 'flaming-chain',
    name: CHAIN_ITEM_NAME,
    meta: { chain: { charges: CHAIN_MAX_USES, cooldownUntilMs: 0 } },
  };
}

/** Defensive read of the chain state off a backpack item. */
export function chainStateOf(item) {
  const c = item && typeof item === 'object' && item.meta && typeof item.meta === 'object'
    ? item.meta.chain
    : null;
  const charges = c && Number.isFinite(Number(c.charges))
    ? Math.max(0, Math.min(CHAIN_MAX_USES, Math.floor(Number(c.charges))))
    : 0;
  const cooldownUntilMs = c && Number.isFinite(Number(c.cooldownUntilMs))
    ? Number(c.cooldownUntilMs)
    : 0;
  return { charges, cooldownUntilMs };
}

/**
 * Refresh the charges: when the hour has passed since the cooldown
 * started, the 3 charges return. Pure — returns a NEW item; the
 * input is never mutated. Call it whenever the pack is read.
 */
export function refreshChain(item, nowMs = Date.now()) {
  if (!item || typeof item !== 'object') return item;
  const s = chainStateOf(item);
  if (s.charges > 0) return item;
  if (s.cooldownUntilMs > 0 && Number(nowMs) >= s.cooldownUntilMs) {
    return {
      ...item,
      meta: { ...(item.meta || {}), chain: { charges: CHAIN_MAX_USES, cooldownUntilMs: 0 } },
    };
  }
  return item;
}

/** Can this chain be used right now? */
export function chainUsable(item, nowMs = Date.now()) {
  if (!item) return { ok: false, reason: 'no-chain' };
  const s = chainStateOf(item);
  if (s.charges > 0) return { ok: true, reason: 'ready', charges: s.charges };
  if (s.cooldownUntilMs > 0 && Number(nowMs) < s.cooldownUntilMs) {
    return {
      ok: false,
      reason: 'cooldown',
      charges: 0,
      cooldownRemainingMs: s.cooldownUntilMs - Number(nowMs),
    };
  }
  // Cooldown expired but the refresh never ran — the charges are back.
  return { ok: true, reason: 'ready', charges: CHAIN_MAX_USES };
}

/**
 * Spend one use. Returns a NEW item: charges - 1, and when the last
 * charge goes the one-hour cooldown starts. Returns the input
 * unchanged when the chain cannot be used.
 */
export function useChain(item, nowMs = Date.now()) {
  const check = chainUsable(item, nowMs);
  if (!check.ok) return item;
  const charges = check.charges - 1;
  const cooldownUntilMs = charges === 0 ? Number(nowMs) + CHAIN_COOLDOWN_MS : 0;
  return {
    ...item,
    meta: {
      ...(item.meta || {}),
      chain: { charges, cooldownUntilMs },
    },
  };
}

/** Plain-words status for the HUD / pack line. */
export function chainStatus(item, nowMs = Date.now()) {
  const check = chainUsable(item, nowMs);
  if (check.ok) {
    return {
      ready: true,
      charges: check.charges,
      cooldownRemainingMs: 0,
      label: `🔥 Flaming Chain — ${check.charges} use${check.charges === 1 ? '' : 's'} left`,
    };
  }
  if (check.reason === 'cooldown') {
    const mins = Math.ceil(check.cooldownRemainingMs / 60000);
    return {
      ready: false,
      charges: 0,
      cooldownRemainingMs: check.cooldownRemainingMs,
      label: `🔥 Flaming Chain — cooling down, ${mins} min left`,
    };
  }
  return { ready: false, charges: 0, cooldownRemainingMs: 0, label: '🔥 Flaming Chain — not held' };
}

/** Format a cooldown remainder as "59:32" for the pill. */
export function formatCooldown(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Finding targets ──────────────────────────────────────────────
// The chain takes the NEAREST targets inside its range and cone,
// nearest first, capped at the throw's chain count (1 at level 0,
// 5 at level 4 — one chain wraps one target). Foes are presence
// peers ({ x, z, id, label }); damned are the realm's NPCs
// ({ x, z, id, label }). Both lists may be empty.

function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

/** Smallest absolute angle between two headings, in radians. */
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/**
 * The nearest targets in front of you inside the chain's reach,
 * nearest first, capped at `limit` (the throw's chain count).
 * Facing is the walker yaw (0 = -Z). Returns an array of
 * { target, kind: 'user' | 'npc', distanceM } — empty when no
 * soul is in reach.
 */
export function findChainTargets(player, foes, damned, limit = 1) {
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  if (max === 0) return [];
  if (!player || typeof player.x !== 'number' || typeof player.z !== 'number') return [];
  const facing = Math.atan2(-Math.sin(player.yaw || 0), -Math.cos(player.yaw || 0));
  const halfCone = (CHAIN_CONE_DEG * Math.PI) / 180;
  const found = [];
  const consider = (t, kind) => {
    if (!t || typeof t.x !== 'number' || typeof t.z !== 'number') return;
    const d = Math.hypot(t.x - player.x, t.z - player.z);
    if (d > CHAIN_RANGE_M) return;
    const bearing = angleTo(player.x, player.z, t.x, t.z);
    if (angleDiff(bearing, facing) > halfCone) return;
    found.push({ target: t, kind, distanceM: d });
  };
  for (const f of Array.isArray(foes) ? foes : []) consider(f, 'user');
  for (const d of Array.isArray(damned) ? damned : []) consider(d, 'npc');
  found.sort((a, b) => a.distanceM - b.distanceM);
  return found.slice(0, max);
}

/**
 * The nearest target in front of you inside the chain's reach —
 * the single-target case (level 0). Facing is the walker yaw
 * (0 = -Z). Returns { target, kind: 'user' | 'npc', distanceM }
 * or null.
 */
export function findChainTarget(player, foes, damned) {
  const hits = findChainTargets(player, foes, damned, 1);
  return hits.length > 0 ? hits[0] : null;
}

// ── Incineration records ───────────────────────────────────────────
// The shared record of one use: who burned, who held the chain,
// where it happened. The server verifies the caller holds the
// chain (the client never self-grants a wider reach) — the API
// route enforces that from the stored chain state.

export function incinerationRecordFor({ victim, chainer, realm, x, z, kind }) {
  return {
    victim_user_id: victim && victim.id ? String(victim.id) : null,
    victim_name: victim && victim.name ? String(victim.name).slice(0, 80) : 'Traveller',
    victim_kind: kind === 'npc' ? 'npc' : 'user',
    chainer_user_id: chainer && chainer.id ? String(chainer.id) : null,
    chainer_name: chainer && chainer.name ? String(chainer.name).slice(0, 80) : 'Traveller',
    realm: typeof realm === 'string' ? realm : 'hades',
    x: Number(x) || 0,
    y: 0,
    z: Number(z) || 0,
  };
}

/** Defensive parse of a row from the incinerations table. */
export function sanitizeIncineration(row) {
  if (!row || typeof row !== 'object') return null;
  if (!row.id || typeof row.id !== 'string') return null;
  const created = row.created_at ? new Date(row.created_at).getTime() : NaN;
  return {
    id: row.id,
    victim_user_id: typeof row.victim_user_id === 'string' ? row.victim_user_id : null,
    victim_name: typeof row.victim_name === 'string' ? row.victim_name : 'Traveller',
    victim_kind: row.victim_kind === 'npc' ? 'npc' : 'user',
    chainer_user_id: typeof row.chainer_user_id === 'string' ? row.chainer_user_id : null,
    chainer_name: typeof row.chainer_name === 'string' ? row.chainer_name : 'Traveller',
    realm: typeof row.realm === 'string' ? row.realm : 'hades',
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    z: Number(row.z) || 0,
    created_at: Number.isFinite(created) ? new Date(created).toISOString() : null,
  };
}

/**
 * A wander target for an incinerated NPC, inside the Lake of Fire
 * disc: the damned roam aimlessly around the lake, never leaving
 * it. rand is () => [0, 1).
 */
export function npcLakeWanderTarget(rand = Math.random) {
  const a = (typeof rand === 'function' ? rand() : Math.random()) * Math.PI * 2;
  const rr = Math.sqrt(typeof rand === 'function' ? rand() : Math.random()) * (LAKE_OF_FIRE.r - 8);
  return { x: LAKE_OF_FIRE.x + Math.cos(a) * rr, z: LAKE_OF_FIRE.z + Math.sin(a) * rr };
}

// ── The lake-landing flag ───────────────────────────────────────────
// A victim's client sets this before travelling to /hell; /hell
// reads it on mount, lands the walker at the lake's rim, and
// clears it. Guarded: safe in Node, safe before mount.

export function setLakeLanding(store) {
  try {
    if (store && typeof store.setItem === 'function') {
      store.setItem(LAKE_LANDING_KEY, JSON.stringify({ at: Date.now() }));
      return true;
    }
  } catch { /* storage unavailable — the travel still happens */ }
  return false;
}

export function consumeLakeLanding(store) {
  try {
    if (!store || typeof store.getItem !== 'function') return false;
    const raw = store.getItem(LAKE_LANDING_KEY);
    if (!raw) return false;
    try {
      if (store.removeItem) store.removeItem(LAKE_LANDING_KEY);
    } catch { /* noop */ }
    return true;
  } catch {
    return false;
  }
}
