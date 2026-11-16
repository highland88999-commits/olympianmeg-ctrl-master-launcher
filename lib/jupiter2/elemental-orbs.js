// lib/jupiter2/elemental-orbs.js — ELEMENTAL ORBS + SPEEDER BLASTER + SHIELDS
// (Merlin, Nov 16 ~01:16, Jupiter 2 round 2 workstream 7).
//
// Merlin's order: "Killing a monster makes it drop an element based
// on its power type... user walks over to collect the elemental
// orbs... trade these for stronger shields and blaster upgrades on
// user speeder. Speeders can now shoot."
//
// POWER TYPES — read from code, never invented:
//   * Every J2 lightning family carries element 'lightning' in the
//     Monsterverse tables (app/hollow-earth/families.js + spawns.js:
//     slot-17 Howler, slot-19 Volta, slot-20 Auric Storm, sky-dragon
//     Stormwing, aureline, eagle-talon are ALL element 'lightning').
//     The demobat has no families row — it is the Hawkins creature.
//   * What DIFFERS between them in code is the lightning kind and
//     its streak colour (lib/lightning-aura.js LIGHTNING_COLORS,
//     lib/jupiter2/operators.js lightningKindFor): lightning-monster
//     strikes white-yellow, dragon strikes red, demobat strikes
//     yellow. The orb type follows THAT split — three orb types:
//       storm   — lightning-monster kind, white-yellow
//       dragon  — dragon kind, red
//       demobat — demobat kind, yellow
//   * A monster killed by the USER drops one orb of its type.
//     Monster-vs-monster kills do NOT drop (worker's call —
//     trivially flippable: drop on any kill instead of only
//     killerId 'user'). Hollow Earth / MonsterVerse drops are NOT
//     built here (Jupiter 2 only, Merlin's call to extend).
//
// NUMBERS — all the worker's call, stated plainly (Merlin ordered
// the features, not the numbers):
//   * COLLECT — walk over the orb (Earth 2's shard pattern:
//     lib/earth2/shard-cycle.js, 2.5 m). Radius 3.0 m here, checked
//     against the walker's path SEGMENT between ticks (not just the
//     endpoint), so the 500 ms brain tick cannot step over an orb
//     at speeder speed (28 m/s = 14 m per tick).
//   * DESPAWN — an uncollected orb fades after 120 s; at most 32
//     live orbs (oldest despawns first).
//   * BLASTER — calibrated against monster HP 100 (the house
//     number, lib/lightning-aura.js MONSTER_PREY_HP): stock 34 dmg
//     = 3 shots a kill, 0.5 s cooldown, 60 m range (just outside
//     the 59 m aura, so you can shoot from the aura's edge),
//     auto-aims at the nearest live monster inside a 35° cone off
//     the speeder's nose. On foot the SHOOT action is inactive.
//   * SHIELD — the Hollow Earth pattern (app/hollow-earth/spawns.js
//     applyDamage: shield absorbs first, the rest hits HP; there a
//     50-absorb shield comes at 30 kills). Here the shield is
//     BOUGHT with orbs: a capacity you own, refilled to full on
//     purchase and on respawn, rechargeable for 2 orbs. It absorbs
//     strike hits AND burn ticks — every point of incoming damage
//     routes through it first.
//   * TRADE COSTS — mirror the in-world upgrade pattern already in
//     the repo (Medusa head upgrades: flat 20 orc shards/tier;
//     lib/nether-realm/medusa.js). Here the ladder is 5 / 10 / 15
//     orbs per track (30 orbs to max one track, 60 for both —
//     one orb per user kill). Orbs spend in fixed order
//     storm → dragon → demobat; any mix pays.
//   * PERSISTENCE — device-local localStorage (the Hollow Earth
//     campaign pattern, app/hollow-earth/data.js), key
//     'jupiter2-elemental-orbs-v1'. No server table, no SQL —
//     nothing here needs Merlin's green light.
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly; the scene only calls it.

import { lightningKindFor } from './operators.js';
import { BURN_HIT_DMG } from '../lightning-aura.js';

/** localStorage key for the J2 orb wallet + upgrades. */
export const ORB_STORAGE_KEY = 'jupiter2-elemental-orbs-v1';

/** Orb types, keyed by the lightning kind they drop from. */
export const ORB_ELEMENTS = Object.freeze({
  storm: Object.freeze({ element: 'storm', kind: 'lightning-monster', label: 'Storm', color: '#ffe14d', core: '#fffbe0' }),
  dragon: Object.freeze({ element: 'dragon', kind: 'dragon', label: 'Dragon', color: '#ff1e1e', core: '#ff6a5a' }),
  demobat: Object.freeze({ element: 'demobat', kind: 'demobat', label: 'Demobat', color: '#ffe14d', core: '#fff9c4' }),
});

/** The orb element a creature drops, from its kind + deck index (read from operators.js — never invented). Unknown kinds drop nothing. */
export function elementForKind(kind, index = 0) {
  if (kind !== 'lightning-monster' && kind !== 'dragon' && kind !== 'demobat') return null;
  const lKind = lightningKindFor(kind, index);
  if (lKind === 'dragon') return 'dragon';
  if (lKind === 'demobat') return 'demobat';
  if (lKind === 'lightning-monster') return 'storm';
  return null;
}

/** The orb definition for an element, or null. */
export function orbFor(element) {
  return ORB_ELEMENTS[element] || null;
}

// ── Drops + collection ──────────────────────────────────────────

/** Walk-over collect radius (m) — Earth 2 shards use 2.5 m; 3.0 m here so the 500 ms tick cannot step over an orb. */
export const ORB_COLLECT_RADIUS_M = 3.0;
/** An uncollected orb fades after this long (ms). */
export const ORB_DESPAWN_MS = 120000;
/** At most this many live orbs — the oldest despawns first. */
export const ORB_MAX_LIVE = 32;

/**
 * One dropped orb: the creature's element, its death point, and
 * when it dropped. `id` is unique per drop (kind + index +
 * diedAtMs); `element` is null when the kind drops nothing.
 */
export function createOrbDrop({ kind, index = 0, position, nowMs = Date.now() }) {
  const element = elementForKind(kind, index);
  if (!element || !position) return null;
  return {
    id: `orb-${kind}-${index}-${nowMs}`,
    element,
    x: position.x || 0,
    y: position.y || 0,
    z: position.z || 0,
    droppedAtMs: nowMs,
  };
}

/** True when the orb has outlived its despawn window. */
export function orbExpired(orb, nowMs = Date.now()) {
  if (!orb) return true;
  return nowMs - (orb.droppedAtMs || 0) > ORB_DESPAWN_MS;
}

/** Drop the expired orbs and enforce the live cap (oldest first out). Returns a new array. */
export function pruneOrbs(orbs, nowMs = Date.now()) {
  const live = (Array.isArray(orbs) ? orbs : []).filter((o) => !orbExpired(o, nowMs));
  if (live.length <= ORB_MAX_LIVE) return live;
  return live.slice(live.length - ORB_MAX_LIVE);
}

function distPointToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lenSq > 0) {
    t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz);
}

/**
 * The orbs the walker collects on this tick: within the collect
 * radius of the path segment from `prevPos` to `pos` (3D — the
 * walker rides a sphere, so y matters). `prevPos` may equal `pos`
 * (standing still); pass null for either and the check uses the
 * other as a point. Returns { collected, remaining } — new arrays.
 */
export function collectOrbs(orbs, prevPos, pos, radiusM = ORB_COLLECT_RADIUS_M) {
  const list = Array.isArray(orbs) ? orbs : [];
  const a = prevPos || pos;
  const b = pos || prevPos;
  if (!a || !b) return { collected: [], remaining: list.slice() };
  const collected = [];
  const remaining = [];
  for (const orb of list) {
    if (distPointToSegment(orb, a, b) <= radiusM) collected.push(orb);
    else remaining.push(orb);
  }
  return { collected, remaining };
}

// ── Wallet ──────────────────────────────────────────────────────

/** Fresh empty wallet: one count per orb element. */
export function createWallet() {
  return { storm: 0, dragon: 0, demobat: 0 };
}

/** Total orbs in a wallet, any mix. */
export function totalOrbs(wallet) {
  if (!wallet) return 0;
  return (Math.max(0, Math.floor(wallet.storm) || 0))
    + (Math.max(0, Math.floor(wallet.dragon) || 0))
    + (Math.max(0, Math.floor(wallet.demobat) || 0));
}

/** A wallet with one more orb of `element` (unknown elements are ignored). Returns a new wallet. */
export function addOrb(wallet, element) {
  const next = { ...createWallet(), ...(wallet || {}) };
  if (ORB_ELEMENTS[element]) next[element] = Math.max(0, Math.floor(next[element]) || 0) + 1;
  return next;
}

/**
 * Spend `cost` orbs from a wallet, draining in fixed order
 * storm → dragon → demobat (any mix pays). Returns the new wallet,
 * or null when the wallet cannot cover the cost.
 */
export function spendOrbs(wallet, cost) {
  const n = Math.max(0, Math.floor(Number(cost) || 0));
  if (n === 0) return { ...createWallet(), ...(wallet || {}) };
  if (totalOrbs(wallet) < n) return null;
  const next = { ...createWallet(), ...(wallet || {}) };
  let left = n;
  for (const el of ['storm', 'dragon', 'demobat']) {
    const take = Math.min(next[el] || 0, left);
    next[el] -= take;
    left -= take;
    if (left <= 0) break;
  }
  return next;
}

// ── Shields (bought capacity — the Hollow Earth shield-first law) ──

/** Shield tiers: bought max absorb + cost in orbs. Tier 0 is no shield. */
export const SHIELD_TIERS = Object.freeze([
  Object.freeze({ tier: 0, max: 0, cost: 0, label: 'No shield' }),
  Object.freeze({ tier: 1, max: 25, cost: 5, label: 'Stormguard 25' }),
  Object.freeze({ tier: 2, max: 50, cost: 10, label: 'Stormguard 50' }),
  Object.freeze({ tier: 3, max: 100, cost: 15, label: 'Stormguard 100' }),
]);

/** Orbs to recharge a part-broken shield back to full (any tier above 0). */
export const SHIELD_RECHARGE_COST = 2;

/** The shield tier definition for a tier number (clamped 0..3). */
export function shieldTierFor(tier) {
  const t = Math.max(0, Math.min(SHIELD_TIERS.length - 1, Math.floor(Number(tier) || 0)));
  return SHIELD_TIERS[t];
}

/**
 * Buy a shield tier with a wallet. Returns { ok, wallet, tier }
 * — ok false with reason 'already-owned' (tier not above the
 * current one) or 'need-orbs'. Buying refills the shield to the
 * new tier's max (the caller applies that).
 */
export function buyShieldTier(wallet, currentTier, tier) {
  const target = shieldTierFor(tier);
  if (target.tier <= Math.max(0, Math.floor(Number(currentTier) || 0))) {
    return { ok: false, reason: 'already-owned', wallet, tier: Math.max(0, Math.floor(Number(currentTier) || 0)) };
  }
  const next = spendOrbs(wallet, target.cost);
  if (!next) return { ok: false, reason: 'need-orbs', wallet, tier: Math.max(0, Math.floor(Number(currentTier) || 0)) };
  return { ok: true, wallet: next, tier: target.tier };
}

/**
 * Route incoming damage through a shield first (Hollow Earth
 * applyDamage, app/hollow-earth/spawns.js): the shield absorbs
 * what it can, the rest is the damage that reaches HP.
 */
export function absorbDamage(shield, dmg) {
  const s = Math.max(0, Number(shield) || 0);
  const d = Math.max(0, Number(dmg) || 0);
  const absorbed = Math.min(s, d);
  return {
    absorbed,
    remaining: d - absorbed,
    shield: s - absorbed,
    shieldBroken: absorbed > 0 && s - absorbed === 0,
  };
}

// ── Blaster ─────────────────────────────────────────────────────

/**
 * Blaster tiers: damage per shot, cooldown, range, cost in orbs.
 * Calibrated against monster HP 100: stock 34 dmg = 3 shots a
 * kill; tier 2 (60 dmg) = 2 shots. Stock range 60 m sits just
 * outside the 59 m aura, so you can shoot from the aura's edge.
 */
export const BLASTER_TIERS = Object.freeze([
  Object.freeze({ tier: 0, dmg: 34, cooldownMs: 500, rangeM: 60, cost: 0, label: 'Stock blaster' }),
  Object.freeze({ tier: 1, dmg: 45, cooldownMs: 450, rangeM: 70, cost: 5, label: 'Blaster Mk II' }),
  Object.freeze({ tier: 2, dmg: 60, cooldownMs: 400, rangeM: 80, cost: 10, label: 'Blaster Mk III' }),
  Object.freeze({ tier: 3, dmg: 80, cooldownMs: 350, rangeM: 90, cost: 15, label: 'Blaster Mk IV' }),
]);

/** Auto-aim cone half-angle (degrees) off the speeder's nose. */
export const BLASTER_CONE_DEG = 35;

/** The blaster tier definition for a tier number (clamped 0..3). */
export function blasterTierFor(tier) {
  const t = Math.max(0, Math.min(BLASTER_TIERS.length - 1, Math.floor(Number(tier) || 0)));
  return BLASTER_TIERS[t];
}

/** True when the blaster may fire now (cooldown open). */
export function blasterReady(lastShotMs, nowMs, tier = 0) {
  if (lastShotMs == null) return true;
  return nowMs - lastShotMs >= blasterTierFor(tier).cooldownMs;
}

/**
 * Buy a blaster tier with a wallet. Returns { ok, wallet, tier }
 * — ok false with reason 'already-owned' or 'need-orbs'.
 */
export function buyBlasterTier(wallet, currentTier, tier) {
  const target = blasterTierFor(tier);
  if (target.tier <= Math.max(0, Math.floor(Number(currentTier) || 0))) {
    return { ok: false, reason: 'already-owned', wallet, tier: Math.max(0, Math.floor(Number(currentTier) || 0)) };
  }
  const next = spendOrbs(wallet, target.cost);
  if (!next) return { ok: false, reason: 'need-orbs', wallet, tier: Math.max(0, Math.floor(Number(currentTier) || 0)) };
  return { ok: true, wallet: next, tier: target.tier };
}

/**
 * One blaster hit on a monster brain entry ({ hp }). Returns
 * { hp, killed } — killed means the entry is at 0 HP. The caller
 * (the brain tick) records the kill itself, with cause
 * 'user-kill' and killerId 'user', so the drop spawns in exactly
 * one place. Does not mutate.
 */
export function applyBlasterHit(entry, dmg) {
  if (!entry || typeof entry.hp !== 'number') return { hp: 0, killed: false };
  const hp = Math.max(0, entry.hp - Math.max(0, Number(dmg) || 0));
  return { hp, killed: hp <= 0 };
}

// ── Shield-first walker damage (the tick routes strikes + burns here) ──

/**
 * A lightning strike (8 on the hit, BURN_HIT_DMG) lands on the
 * walker with a shield up: the shield eats the hit first, the
 * rest hits HP, and the burn still lights (the burn ticks route
 * through the shield too, below). Returns { walker, shield,
 * absorbed, shieldBroken } — walker is a new victim state.
 */
export function strikeWalkerWithShield(walker, shield, nowMs = Date.now()) {
  if (!walker || walker.dead) return { walker, shield: Math.max(0, Number(shield) || 0), absorbed: 0, shieldBroken: false };
  const routed = absorbDamage(shield, BURN_HIT_DMG);
  const hp = Math.max(0, walker.hp - routed.remaining);
  return {
    walker: {
      ...walker,
      hp,
      burnDps: 6,
      burnRemainingS: 3,
      lastStrikeMs: nowMs,
      dead: hp <= 0,
    },
    shield: routed.shield,
    absorbed: routed.absorbed,
    shieldBroken: routed.shieldBroken,
  };
}

/**
 * One burn tick (dt seconds at the victim's burnDps) with a shield
 * up: the burn's damage routes through the shield first. Returns
 * { walker, shield, absorbed, shieldBroken } — walker is a new
 * victim state. A victim with no burn running passes through
 * untouched.
 */
export function burnTickWithShield(walker, shield, dt) {
  if (!walker || walker.dead || !(walker.burnRemainingS > 0)) {
    return { walker, shield: Math.max(0, Number(shield) || 0), absorbed: 0, shieldBroken: false };
  }
  const s = Math.min(Math.max(dt || 0, 0), walker.burnRemainingS);
  const routed = absorbDamage(shield, walker.burnDps * s);
  const hp = Math.max(0, walker.hp - routed.remaining);
  const burnRemainingS = Math.max(0, walker.burnRemainingS - s);
  return {
    walker: {
      ...walker,
      hp,
      burnRemainingS,
      burnDps: burnRemainingS <= 0 ? 0 : walker.burnDps,
      dead: hp <= 0,
    },
    shield: routed.shield,
    absorbed: routed.absorbed,
    shieldBroken: routed.shieldBroken,
  };
}

// ── Persistence (device-local localStorage — the Hollow Earth campaign pattern) ──

/** Fresh progress: empty wallet, no upgrades, no shield charge. */
export function createProgress() {
  return { orbs: createWallet(), shieldTier: 0, blasterTier: 0, shield: 0 };
}

/**
 * Load saved progress from a storage (defaults to global
 * localStorage when present). Corrupt or partial saves fall back
 * to the sane parts, never throw.
 */
export function loadProgress(storage) {
  const fallback = createProgress();
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return fallback;
    const raw = store.getItem(ORB_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const orbs = { ...createWallet(), ...((parsed.orbs && typeof parsed.orbs === 'object') ? parsed.orbs : {}) };
    for (const el of ['storm', 'dragon', 'demobat']) orbs[el] = Math.max(0, Math.floor(Number(orbs[el]) || 0));
    const shieldTier = shieldTierFor(parsed.shieldTier).tier;
    const blasterTier = blasterTierFor(parsed.blasterTier).tier;
    const shield = Math.max(0, Math.min(shieldTierFor(shieldTier).max, Math.floor(Number(parsed.shield) || 0)));
    return { orbs, shieldTier, blasterTier, shield };
  } catch {
    return fallback;
  }
}

/** Save progress to a storage (defaults to global localStorage when present). Never throws. */
export function saveProgress(progress, storage) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    const p = progress || createProgress();
    store.setItem(ORB_STORAGE_KEY, JSON.stringify({
      orbs: { ...createWallet(), ...(p.orbs || {}) },
      shieldTier: shieldTierFor(p.shieldTier).tier,
      blasterTier: blasterTierFor(p.blasterTier).tier,
      shield: Math.max(0, Math.floor(Number(p.shield) || 0)),
    }));
    return true;
  } catch {
    return false;
  }
}
