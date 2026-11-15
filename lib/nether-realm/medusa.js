// lib/nether-realm/medusa.js
// MEDUSA'S LAIR — the law (Merlin, 2026-11-15 ~02:06).
//
// A 3D lair for Medusa inside Hades (route /nether-realm — there is
// no app/hades/). Enter, cut off her head, acquire it; use it on a
// foe to turn them to stone — the victim respawns a distance away,
// their statue remains PERMANENTLY where the head was used, a solid
// monument. One head per user, enforced by the medusa_heads table
// (one row per user); statues live in medusa_statues so every statue
// stands for everyone.
//
// MERLIN'S DECISIONS (baked in, not provisional):
//   · REUSABLE (Nov 15 ~02:08) — one head, use it as often as you like.
//   · UPGRADE (Nov 15 ~02:11) — starts at 1 victim per use; FLAT 20
//     orc shards per upgrade, +1 victim each, up to 5 victims max
//     (4 upgrades, 80 shards total). Level persists in medusa_heads.
//   · CGI (Nov 15 ~02:09) — the whole lair is procedural CGI, no
//     Tripo, no paid assets. The head is a HELD WEAPON (head +
//     snakes, in-hand), not just a carried item.
//   · MOVEMENT (Nov 15 ~02:10) — everyone moving in the lair uses
//     the Middle-earth avatar movement system (heroMotionPose step
//     rhythm, foot-in-front-of-the-other). Speeds are ME's own:
//     foot walk 10 m/s, foot sprint 18 m/s (app/middle-earth/
//     riding.js). The render side imports heroMotionPose /
//     heroPhaseRate from app/middle-earth/figure-motion.js; this
//     module only carries the numbers + the law.
//   · SNAKES (Nov 15 ~02:10) — EACH snake gets its OWN motion agent
//     (pure function of snake index + device clock + head state),
//     own phase/rhythm/behaviour, never in lockstep.
//
// PROVISIONAL (his call later): Hades-only use; foes = other users
// in Hades (presence sector 'hades', lib/presence.js — the shared
// DB-polling presence client; no new table for foes).
//
// This module is pure: no DOM, no three.js, no Supabase — safe to
// import in node for headless testing and in the page/scene loops.
// Boss mutation follows the Middle-earth orc style (damageOrc
// mutates the orc and returns the events); everything else returns
// new values.

import { clampPosition, MEDUSA_LAIR } from './world.js';

// ── The lair ─────────────────────────────────────────────────────
// The lair's place lives in world.js (the layout file, single
// source of truth) — re-exported here so the law module is the
// one import the page and scene need. Southwest of the map,
// clear of the spawn (0,160), Asphodel (-160,-70), the Gates
// (0,70) and the river band — a marked disc, not a walled room,
// so the walker can always step back out.
export { MEDUSA_LAIR };

export const MEDUSA_POS = { x: MEDUSA_LAIR.x, z: MEDUSA_LAIR.z };

// ME foot speeds (app/middle-earth/riding.js: foot walk 10 m/s,
// foot sprint 18 m/s) — the lair walks at ME pace, not Hades'
// 8/14. Outside the lair disc Hades keeps its own speeds.
export const LAIR_WALK_MPS = 10;
export const LAIR_RUN_MPS = 18;

// ── The boss ─────────────────────────────────────────────────────
// 60 HP: five hits with the default blade (12, the short sword's
// rating — equippedDamageForSlot's fallback in the page), two with
// a 34-damage ME blade. She MUST reform so every user can earn
// their one head: 45 s, the same number as the Middle-earth orc
// respawn (page.jsx respawnS || 45) and Hollow Earth's RESPAWN_S.
export const MEDUSA_MAX_HP = 60;
export const MEDUSA_REFORM_S = 45;
export const MEDUSA_DEFAULT_DMG = 12;

export function createMedusaBoss(nowMs = Date.now()) {
  return {
    state: 'alive', // 'alive' | 'dead'
    hp: MEDUSA_MAX_HP,
    maxHp: MEDUSA_MAX_HP,
    hits: 0,
    deadAtMs: null,
    reformAtMs: null,
    createdAtMs: nowMs,
  };
}

/**
 * One strike on Medusa. Mutates the boss (orc style) and returns
 * { damage, killed }. A dead boss takes no more damage; the kill
 * stamps the reform clock — she is back, whole, REFORM_S later.
 */
export function strikeMedusa(boss, dmg, nowMs = Date.now()) {
  if (!boss || boss.state !== 'alive') return { damage: 0, killed: false };
  const damage = Math.max(0, Math.floor(Number(dmg) || 0));
  boss.hp = Math.max(0, boss.hp - damage);
  boss.hits += 1;
  if (boss.hp > 0) return { damage, killed: false };
  boss.state = 'dead';
  boss.deadAtMs = nowMs;
  boss.reformAtMs = nowMs + MEDUSA_REFORM_S * 1000;
  return { damage, killed: true };
}

/**
 * Advance the boss clock: a dead Medusa whose reform time has
 * passed comes back alive at full HP. Returns 'reformed' or null.
 */
export function tickMedusa(boss, nowMs = Date.now()) {
  if (!boss || boss.state !== 'dead') return null;
  if (nowMs < (boss.reformAtMs || 0)) return null;
  boss.state = 'alive';
  boss.hp = boss.maxHp;
  boss.hits = 0;
  boss.deadAtMs = null;
  boss.reformAtMs = null;
  return 'reformed';
}

/** Seconds until she reforms (0 when alive). */
export function reformInS(boss, nowMs = Date.now()) {
  if (!boss || boss.state !== 'dead') return 0;
  return Math.max(0, Math.ceil(((boss.reformAtMs || 0) - nowMs) / 1000));
}

// ── The head (backpack item + held weapon) ───────────────────────
export const HEAD_ITEM_ID = 'medusa-head';
export const HEAD_ITEM_NAME = "Medusa's Head";

/** The backpack item entry for an earned head (kind 'medusa-head',
 *  qty 1, never stacked — the dino law, lib/backpack/backpack.js). */
export function medusaHeadItem(earnedAtIso) {
  return {
    id: HEAD_ITEM_ID,
    kind: 'medusa-head',
    name: HEAD_ITEM_NAME,
    qty: 1,
    meta: {
      source: 'medusa-lair',
      reusable: true,
      earnedAt: earnedAtIso || new Date().toISOString(),
    },
  };
}

/** Plain-English display name for a signed-in user object. */
export function displayNameFor(user) {
  if (!user) return 'Traveller';
  const meta = user.user_metadata || {};
  const named = meta.full_name || meta.name || '';
  if (typeof named === 'string' && named.trim()) return named.trim().slice(0, 24);
  const email = typeof user.email === 'string' ? user.email : '';
  if (email.includes('@')) return email.split('@')[0].slice(0, 24) || 'Traveller';
  return 'Traveller';
}

// ── Petrify ──────────────────────────────────────────────────────
// RANGE (Merlin, Nov 15 ~04:19 — "Expand the radius to 50 meters
// for medusas gaze"): the gaze is a ranged stare, not a blade and
// not an arrow — 50 m, past the ME bow's 30 m reach. The cone
// stays ±0.42 rad (~24°): wider than the bow's ±12° (0.21),
// narrower than the blade's ±70° (1.22). A foe must be in front
// of the holder, inside the cone, inside the range.
export const PETRIFY_RANGE_M = 50;
export const PETRIFY_ARC_HALF_RAD = 0.42;
export const PETRIFY_ARC_COS = Math.cos(PETRIFY_ARC_HALF_RAD);

// The victim respawns exactly 100 m from the statue — the
// Flying Dutchman law ("The Dutchman rises again, 100 m from
// the wreck"), same distance, same rule.
export const PETRIFY_RESPAWN_M = 100;

// A statue is solid: the walker cannot step within this radius
// of one. Statues are monuments, not scenery to walk through.
export const STATUE_SOLID_RADIUS_M = 1.4;

/**
 * Foes inside the petrify cone, nearest first, capped at `limit`
 * (the holder's victims-per-use). Foes are { id, x, z } — the
 * holder's yaw follows the HADES walker convention
 * (forward = (-sin yaw, -cos yaw), lib/nether-realm/world.js),
 * NOT the Middle-earth aim convention.
 */
export function foesInPetrifyCone(px, pz, yaw, foes, limit = 1) {
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  if (max === 0) return [];
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const out = [];
  for (const f of foes || []) {
    if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.z)) continue;
    const dx = f.x - px;
    const dz = f.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > PETRIFY_RANGE_M || dist < 1e-6) continue;
    const dot = (fx * dx + fz * dz) / dist;
    if (dot < PETRIFY_ARC_COS) continue;
    out.push({ foe: f, dist });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, max).map((o) => o.foe);
}

/**
 * Where a petrified victim wakes: exactly PETRIFY_RESPAWN_M from
 * the statue, on the given bearing (radians — the caller rolls
 * it), clamped to the walkable world disc. A statue at the world
 * edge still wakes its victim inside the world.
 */
export function petrifyRespawnSpot(x, z, bearingRad = 0) {
  const nx = x + Math.cos(bearingRad) * PETRIFY_RESPAWN_M;
  const nz = z + Math.sin(bearingRad) * PETRIFY_RESPAWN_M;
  return clampPosition(nx, nz);
}

/** The statue record the API stores (one row per petrify). */
export function statueRecordFor({ victim, petrifier, x, z, nowMs = Date.now() }) {
  return {
    victim_user_id: victim && victim.id ? String(victim.id) : null,
    victim_name: victim && victim.name ? String(victim.name).slice(0, 24) : 'Traveller',
    victim_appearance: (victim && victim.appearance && typeof victim.appearance === 'object')
      ? victim.appearance
      : {},
    petrifier_user_id: petrifier && petrifier.id ? String(petrifier.id) : null,
    petrifier_name: petrifier && petrifier.name ? String(petrifier.name).slice(0, 24) : 'Traveller',
    realm: 'hades',
    x: Number(x) || 0,
    y: 0,
    z: Number(z) || 0,
    created_at: new Date(nowMs).toISOString(),
  };
}

/** Coerce a server statue row into a renderable statue, or null. */
export function sanitizeStatue(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = Number(raw.x);
  const z = Number(raw.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : `${raw.victim_user_id || 'statue'}-${raw.created_at || ''}`,
    victim_user_id: raw.victim_user_id != null ? String(raw.victim_user_id) : null,
    victim_name: typeof raw.victim_name === 'string' && raw.victim_name ? raw.victim_name.slice(0, 24) : 'Traveller',
    victim_appearance: raw.victim_appearance && typeof raw.victim_appearance === 'object' ? raw.victim_appearance : {},
    petrifier_user_id: raw.petrifier_user_id != null ? String(raw.petrifier_user_id) : null,
    petrifier_name: typeof raw.petrifier_name === 'string' && raw.petrifier_name ? raw.petrifier_name.slice(0, 24) : 'Traveller',
    realm: typeof raw.realm === 'string' ? raw.realm : 'hades',
    x,
    y: Number(raw.y) || 0,
    z,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : null,
    interim: raw.interim === true,
  };
}

/** True when (x, z) would step inside a statue's solid radius. */
export function blockedByStatue(x, z, statues) {
  for (const s of statues || []) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    if (Math.hypot(x - s.x, z - s.z) < STATUE_SOLID_RADIUS_M) return true;
  }
  return false;
}

// ── Upgrades ─────────────────────────────────────────────────────
// FLAT 20 orc shards per upgrade (Merlin, Nov 15 ~02:11) — +1
// victim each, up to 5 victims max (4 upgrades, 80 shards total).
export const UPGRADE_SHARD_COST = 20;
export const MAX_UPGRADE_LEVEL = 4;
export const MAX_VICTIMS_PER_USE = 5;

/** Victims one use petrifies at this upgrade level (level 0 = 1). */
export function victimsPerUse(level) {
  const l = Math.max(0, Math.floor(Number(level) || 0));
  return Math.min(MAX_VICTIMS_PER_USE, 1 + l);
}

/** Shards the next upgrade costs — flat 20 at every tier. */
export function upgradeCostFor(level) {
  if (Math.floor(Number(level) || 0) >= MAX_UPGRADE_LEVEL) return null;
  return UPGRADE_SHARD_COST;
}

/** Can this level buy the next upgrade with this many shards? */
export function canUpgrade(level, shardsHeld) {
  const l = Math.floor(Number(level) || 0);
  if (l >= MAX_UPGRADE_LEVEL) return { ok: false, reason: 'max' };
  const shards = Math.max(0, Math.floor(Number(shardsHeld) || 0));
  if (shards < UPGRADE_SHARD_COST) return { ok: false, reason: 'need-shards' };
  return { ok: true, reason: null };
}

// ── Orc shards (the minimal shard economy) ───────────────────────
// VERIFIED (Nov 15 ~02:09): orc shards did NOT exist — Middle-earth
// orc loot was weapons, crude iron and orcish scrap only
// (app/middle-earth/orcs.js rollLoot). So the drop is built here,
// as part of this work: every orc kill drops shards — a warrior
// 1–2, a captain 3–5 — into the backpack as a stacking material
// ('orc-shard', via the generic loot path, lootItemInputs). At
// ~1.5 shards per warrior kill, the full 80-shard ladder is about
// fifty warrior kills, or a dozen captains' worth.
export const ORC_SHARD_ITEM_ID = 'orc-shard';
export const ORC_SHARD_ITEM_NAME = 'Orc Shard';

/** Shards one orc kill drops (rng: the hunt's seeded stream). */
export function shardDropFor(kind, rng) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  if (kind === 'captain') return 3 + Math.floor(roll() * 3);
  return 1 + Math.floor(roll() * 2);
}

// ── Snake motion agents ──────────────────────────────────────────
// One agent per snake: a pure function of (snake index, device
// clock, head state) — the operator-agent pattern (pure functions
// of place/kind/device clock, lib/afterlife/operators.js). Each
// snake carries its own phase, rhythm and behaviour, so the snakes
// NEVER move in lockstep: one coils, one sways, one strikes
// forward, one rests, each on its own clock. The conductor
// (headSnakesPose) composes them into the head's overall pose.
// The same agents drive Medusa's own head-snakes in the lair.
//
// Phase offsets use the golden angle (2.399963 rad): an
// irrational step, so no two snakes' phases ever re-align.
// Frequencies differ per snake (0.7–1.6 Hz band); behaviours
// cycle coil/sway/strike/rest down the head.
export const MEDUSA_SNAKE_COUNT = 7;
export const SNAKE_BEHAVIOURS = ['coil', 'sway', 'strike', 'rest'];
export const SNAKE_HEAD_STATES = ['idle', 'aiming', 'firing', 'sheathed'];
const GOLDEN_ANGLE = 2.399963;

function snakeFrequencyHz(index) {
  return 0.7 + ((index * 0.37) % 0.9);
}

function snakePhaseOffset(index) {
  return index * GOLDEN_ANGLE;
}

function snakeBehaviour(index) {
  return SNAKE_BEHAVIOURS[index % SNAKE_BEHAVIOURS.length];
}

/**
 * One snake's pose for one frame.
 *   index: which snake on the head (0..count-1)
 *   nowMs: the device clock (ms) — the only clock
 *   state: 'idle' | 'aiming' | 'firing' | 'sheathed'
 * Returns { behaviour, swayX, swayY, coil, strike, yaw, pitch } —
 * all radians / 0..1 envelopes, ready for the render loop to
 * apply to that snake's pivot. Pure: same inputs, same pose.
 *
 * State law: idle = each snake its own behaviour at full life;
 * aiming = snakes lean forward, strike bias rises; firing = every
 * snake strikes at once (the gaze leaves the head); sheathed =
 * nearly still, slow breathing only.
 */
export function snakePoseFor({ index = 0, nowMs = Date.now(), state = 'idle' } = {}) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const t = Number(nowMs) / 1000;
  const behaviour = snakeBehaviour(i);
  const freq = snakeFrequencyHz(i);
  const phase = t * freq * Math.PI * 2 + snakePhaseOffset(i);
  const s = Math.sin(phase);
  const s2 = Math.sin(phase * 0.5 + 1.3);

  let swayX = 0;
  let swayY = 0;
  let coil = 0;
  let strike = 0;
  if (behaviour === 'coil') {
    coil = 0.5 + 0.5 * s;
    swayX = s * 0.35;
    swayY = s2 * 0.12;
  } else if (behaviour === 'sway') {
    swayX = s * 0.6;
    swayY = s2 * 0.25;
    coil = 0.15 + 0.1 * s;
  } else if (behaviour === 'strike') {
    // A strike is a pulse, not a wave: forward only, then settle.
    strike = Math.pow(Math.max(0, s), 3);
    swayX = s * 0.2;
    coil = 0.1;
  } else {
    // 'rest': nearly still — slow breathing, nothing more.
    swayX = Math.sin(t * 0.5 + snakePhaseOffset(i)) * 0.05;
    swayY = Math.sin(t * 0.4 + snakePhaseOffset(i)) * 0.03;
    coil = 0.05;
  }

  // State envelopes.
  if (state === 'aiming') {
    strike = Math.min(1, strike + 0.45);
    swayX *= 0.7;
  } else if (state === 'firing') {
    strike = 1;
    coil = Math.min(1, coil + 0.3);
  } else if (state === 'sheathed') {
    swayX *= 0.15;
    swayY *= 0.15;
    coil *= 0.3;
    strike = 0;
  }

  return {
    behaviour,
    swayX,
    swayY,
    coil,
    strike,
    yaw: swayX * 0.5,
    pitch: -strike * 0.5 + swayY * 0.3,
  };
}

/**
 * The conductor: every snake's pose at this clock + state, plus
 * the head's own pose (the mean of the snakes, damped — the head
 * follows its snakes, it does not lead them). Returns
 * { snakes: [...], headTilt, headBob, meanStrike }.
 */
export function headSnakesPose({ count = MEDUSA_SNAKE_COUNT, nowMs = Date.now(), state = 'idle' } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const snakes = [];
  for (let i = 0; i < n; i += 1) {
    snakes.push(snakePoseFor({ index: i, nowMs, state }));
  }
  let meanSwayX = 0;
  let meanStrike = 0;
  for (const p of snakes) {
    meanSwayX += p.swayX;
    meanStrike += p.strike;
  }
  meanSwayX /= n;
  meanStrike /= n;
  const t = Number(nowMs) / 1000;
  return {
    snakes,
    headTilt: meanSwayX * 0.3,
    headBob: Math.sin(t * 1.1) * 0.02 + meanStrike * 0.05,
    meanStrike,
  };
}
