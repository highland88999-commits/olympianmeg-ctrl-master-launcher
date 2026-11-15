// THE FLYING DUTCHMAN — voyage systems (pure logic, no three.js, no DOM).
//
// Levels, shield, mega souls, respawn, kraken, slot machine, merchants,
// skins, ashore duels, island docks, legendary ships and the fleet.
// The engine (engine.js) owns ships/wind/combat/souls; this module owns
// everything layered on top of a voyage. Headless-testable: node can
// import this module (and engine.js) with no DOM.

import {
  makeShip, makeRng, SHIP, clamp, wrapAngle, dist2, TAU,
  damageShip, stepAI, stepShip,
} from './engine.js';

// ---------------------------------------------------------------------------
// 1. LEVELS
// ---------------------------------------------------------------------------

export const SINKS_PER_LEVEL = 5;
export const MAX_LEVEL = 10;
export const SIZE_PER_LEVEL = 0.08;
export const CANNONS_PER_LEVEL = 1;
export const HULL_PER_LEVEL = 20;
export const SHIELD_PER_LEVEL = 25;

/** Level from total enemy ships sunk: 1 + floor(sinkings / 5), capped at 10. */
export function levelFor(sinkings) {
  return Math.min(MAX_LEVEL, 1 + Math.floor(Math.max(0, sinkings) / SINKS_PER_LEVEL));
}

/** Base stats for a level. sizeScale is visual only — the hitbox never changes. */
export function levelStats(level) {
  const lv = clamp(Math.floor(level) || 1, 1, MAX_LEVEL);
  return {
    sizeScale: 1 + SIZE_PER_LEVEL * (lv - 1),
    cannonsPerSide: SHIP.cannonsPerSide + CANNONS_PER_LEVEL * (lv - 1),
    maxHull: SHIP.maxHull + HULL_PER_LEVEL * (lv - 1),
    maxShield: SHIELD_PER_LEVEL * lv,
  };
}

/**
 * Apply a level change to a ship as a DELTA from its previous level, so
 * merchant/slot bonuses already bought are never overwritten.
 */
export function applyLevelStats(ship, prevLevel, level) {
  const prev = levelStats(prevLevel);
  const next = levelStats(level);
  const dHull = next.maxHull - prev.maxHull;
  const dShield = next.maxShield - prev.maxShield;
  ship.maxHull = (ship.maxHull || prev.maxHull) + dHull;
  ship.hull = Math.min(ship.maxHull, (ship.hull || 0) + dHull);
  ship.maxShield = (ship.maxShield || prev.maxShield) + dShield;
  ship.shield = Math.min(ship.maxShield, (ship.shield || 0) + dShield);
  ship.cannonsPerSide = (ship.cannonsPerSide || prev.cannonsPerSide) +
    (next.cannonsPerSide - prev.cannonsPerSide);
  ship.sizeScale = next.sizeScale;
  ship.level = level;
  return ship;
}

/**
 * Sync the live per-voyage captain with the player ship at the end of a
 * world tick. `soulsBefore` is the ship's soul count at the start of the
 * tick: souls gained during the tick flow into the captain, while souls
 * the captain spent (merchant/skins) stay spent — the ship mirrors the
 * captain afterwards. Level, sinkings, mega souls and kraken kills are
 * captain-authoritative; the ship mirrors them for the HUD.
 */
export function syncCaptain(world, soulsBefore) {
  const p = world.player;
  const c = world.captain;
  if (!p || !c) return;
  if (typeof soulsBefore === 'number') c.souls += p.souls - soulsBefore;
  p.souls = c.souls;
  p.megaSouls = c.megaSouls;
  p.level = c.level;
  p.sinkings = c.sinkings;
  p.krakenKills = c.krakenKills;
}

// ---------------------------------------------------------------------------
// 3. MEGA SOULS
// ---------------------------------------------------------------------------

export const MEGA_SOUL_LIFE = 300;
export const MEGA_SOUL_PICKUP_R = 18;
export const MAX_FLOATING_MEGA_SOULS = 5;

export function spawnMegaSoul(world, x, z) {
  const r = world.rng || Math.random;
  world.megaSouls.push({
    x, z,
    vx: (r() - 0.5) * 1.5,
    vz: (r() - 0.5) * 1.5,
    life: MEGA_SOUL_LIFE,
    phase: r() * TAU,
  });
  while (world.megaSouls.length > MAX_FLOATING_MEGA_SOULS) world.megaSouls.shift();
  return world.megaSouls[world.megaSouls.length - 1];
}

/** Mega souls drift; only the living PLAYER ship may claim one. AI ignores them. */
export function stepMegaSouls(world, dt, events) {
  const p = world.player;
  const pr2 = MEGA_SOUL_PICKUP_R * MEGA_SOUL_PICKUP_R;
  for (let i = world.megaSouls.length - 1; i >= 0; i--) {
    const s = world.megaSouls[i];
    s.life -= dt;
    s.x += s.vx * dt; s.z += s.vz * dt;
    s.vx *= (1 - 0.2 * dt); s.vz *= (1 - 0.2 * dt);
    let claimed = false;
    if (s.life > 0 && p && p.alive && dist2(s.x, s.z, p.x, p.z) < pr2) {
      if (world.captain) world.captain.megaSouls += 1;
      p.megaSouls = world.captain ? world.captain.megaSouls : (p.megaSouls || 0) + 1;
      events.push({ type: 'megaSoul', shipId: p.id, x: s.x, z: s.z });
      claimed = true;
    }
    if (claimed || s.life <= 0) world.megaSouls.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// 4. RESPAWN (solo only)
// ---------------------------------------------------------------------------

/**
 * Bring the player back 100 m from her wreck point on the safest bearing:
 * sample 8 bearings and take the one maximising clearance from islands
 * and enemies. Must be >= island.r + 30 from every island centre when a
 * bearing achieves it; otherwise the best bearing available is taken.
 */
export function respawnPlayer(world, rng) {
  const p = world.player;
  const r = typeof rng === 'function' ? rng : Math.random;
  const wx = p._wreckX != null ? p._wreckX : p.x;
  const wz = p._wreckZ != null ? p._wreckZ : p.z;
  const base = r() * TAU;
  let best = null;
  for (let i = 0; i < 8; i++) {
    const bearing = base + (i / 8) * TAU;
    const x = wx + Math.sin(bearing) * 100;
    const z = wz + Math.cos(bearing) * 100;
    let islandClear = Infinity;
    for (const isl of world.islands) {
      islandClear = Math.min(islandClear, Math.hypot(x - isl.x, z - isl.z) - (isl.r + 30));
    }
    let enemyClear = Infinity;
    for (const e of world.enemies || []) {
      if (e.alive) enemyClear = Math.min(enemyClear, Math.hypot(x - e.x, z - e.z));
    }
    const score = Math.min(islandClear, enemyClear);
    if (!best || score > best.score) best = { bearing, x, z, score, islandClear };
  }
  p.x = best.x;
  p.z = best.z;
  p.heading = best.bearing;
  p.hull = p.maxHull;
  p.shield = p.maxShield;
  p.speed = 0;
  p.vx = 0; p.vz = 0;
  p.alive = true;
  p.sinking = false;
  p.burning = false;
  p.sinkT = 0;
  p.invulnT = 5;
  p.reloadPort = 0;
  p.reloadStbd = 0;
  p._hullAtCrewLoss = p.maxHull;
  // Level, upgrades, souls, mega souls and crew are all kept.
  // A kraken that downed her is gone for this voyage leg.
  world.kraken = null;
  world.krakenTimer = 0;
  world.krakenThreshold = 360 + r() * 240;
  if (world.events) world.events.push({ type: 'respawn', x: p.x, z: p.z });
  return { x: p.x, z: p.z, bearing: best.bearing, islandClear: best.islandClear };
}

// ---------------------------------------------------------------------------
// 5. KRAKEN (solo only)
// ---------------------------------------------------------------------------

export const KRAKEN_HP = 60;
export const KRAKEN_SPAWN_DIST = 120;
export const KRAKEN_SPEED = 6;
export const KRAKEN_STRIKE_RANGE = 35;
export const KRAKEN_STRIKE_DMG = 8;
export const KRAKEN_WARNING_S = 8;
export const KRAKEN_STRIKE_PERIOD_S = 4;
export const KRAKEN_TELEGRAPH_S = 1;

export function rollKrakenThreshold(rng) {
  const r = typeof rng === 'function' ? rng : Math.random;
  return 360 + r() * 240; // 6–10 minutes
}

function spawnKraken(world, rng) {
  const p = world.player;
  const r = typeof rng === 'function' ? rng : Math.random;
  const a = r() * TAU;
  const tentacles = [];
  for (let i = 0; i < 6; i++) tentacles.push({ angle: (i / 6) * TAU, phase: r() * TAU });
  world.kraken = {
    state: 'warning',
    x: p.x + Math.sin(a) * KRAKEN_SPAWN_DIST,
    z: p.z + Math.cos(a) * KRAKEN_SPAWN_DIST,
    t: 0,
    hits: 0,
    hp: KRAKEN_HP,
    tentacles,
    strikeT: KRAKEN_STRIKE_PERIOD_S,
    strikeWarn: false,
    warnT: 0,
  };
  return world.kraken;
}

/**
 * Kraken state machine. Timer counts while the player is alive and
 * sailing (solo only); on expiry the kraken spawns 120 m off and warns
 * for 8 s, then attacks at 6 m/s, telegraphing 1 s before each strike
 * (8 damage) when within 35 m. Cannonballs within 10 m of the kraken
 * centre while y < 15 count hits (stepBalls); each ball deals 5 damage
 * (10 with kraken-bane), so 60 hp takes 12 hits without bane and 6 with
 * it — the bane halves the fight instead of ending it in 2 hits.
 * kraken only ever targets the player, never AI ships. If it downs the
 * player it despawns and the timer resets.
 */
export function stepKraken(world, dt, events, rng) {
  if (world.mode === 'duel') return;
  const p = world.player;
  const r = typeof rng === 'function' ? rng : Math.random;
  if (!p || !p.alive) {
    if (world.kraken) {
      world.kraken = null;
      world.krakenTimer = 0;
      world.krakenThreshold = rollKrakenThreshold(r);
    }
    return;
  }
  if (!world.kraken) {
    world.krakenTimer = (world.krakenTimer || 0) + dt;
    const threshold = world.krakenThreshold != null ? world.krakenThreshold : 480;
    if (world.krakenTimer >= threshold) {
      const k = spawnKraken(world, r);
      events.push({ type: 'krakenWarning', x: k.x, z: k.z });
    }
    return;
  }
  const k = world.kraken;
  k.t += dt;
  if (k.state === 'warning') {
    if (k.t >= KRAKEN_WARNING_S) { k.state = 'attack'; k.t = 0; k.strikeT = KRAKEN_STRIKE_PERIOD_S; }
    return;
  }
  if (k.state === 'dying') {
    spawnMegaSoul(world, k.x, k.z);
    events.push({ type: 'krakenSlain', x: k.x, z: k.z });
    if (world.captain) {
      world.captain.krakenKills = (world.captain.krakenKills || 0) + 1;
      p.krakenKills = world.captain.krakenKills;
    } else {
      p.krakenKills = (p.krakenKills || 0) + 1;
    }
    world.kraken = null;
    world.krakenTimer = 0;
    world.krakenThreshold = rollKrakenThreshold(r);
    return;
  }
  if (k.state !== 'attack') return;
  // Close on the player at 6 m/s.
  const dx = p.x - k.x, dz = p.z - k.z;
  const d = Math.hypot(dx, dz) || 1;
  const step = Math.min(KRAKEN_SPEED * dt, d);
  k.x += (dx / d) * step;
  k.z += (dz / d) * step;
  k.strikeT -= dt;
  if (k.strikeWarn) {
    k.warnT -= dt;
    if (k.warnT <= 0) {
      k.strikeWarn = false;
      k.strikeT = KRAKEN_STRIKE_PERIOD_S;
      damageShip(p, KRAKEN_STRIKE_DMG, events, world.souls, r, p.x, p.z);
      events.push({ type: 'krakenStrike', x: k.x, z: k.z, dmg: KRAKEN_STRIKE_DMG });
    }
  } else if (k.strikeT <= 0) {
    if (d <= KRAKEN_STRIKE_RANGE) {
      k.strikeWarn = true;
      k.warnT = KRAKEN_TELEGRAPH_S;
      events.push({ type: 'krakenStrikeWarn', x: k.x, z: k.z });
    } else {
      k.strikeT = KRAKEN_STRIKE_PERIOD_S;
    }
  }
}

// ---------------------------------------------------------------------------
// 6. SLOT MACHINE (pure logic; the page handles the confirm dialog)
// ---------------------------------------------------------------------------

export const SLOT_PRIZES = [
  { id: 'mega-cannons', name: 'Twin Doom Cannons', desc: '+2 cannons per broadside', weight: 30 },
  { id: 'mega-hull', name: 'Leviathan Hull', desc: '+50 max hull', weight: 30 },
  { id: 'mega-shield', name: 'Aegis of the Deep', desc: '+25 max shield', weight: 25 },
  { id: 'mega-krakenbane', name: 'Kraken-Bane Shot', desc: 'cannonballs deal +5 damage to the kraken', weight: 15 },
];

/** One mega soul buys one spin. */
export function slotCanSpin(captain) {
  return (captain.megaSouls || 0) >= 1;
}

/** Weighted pick. Pure — does NOT deduct a mega soul (the page deducts on spin). */
export function rollSlotPrize(rng) {
  const r = typeof rng === 'function' ? rng : Math.random;
  const total = SLOT_PRIZES.reduce((s, p) => s + p.weight, 0);
  let roll = r() * total;
  for (const p of SLOT_PRIZES) {
    roll -= p.weight;
    if (roll < 0) return p;
  }
  return SLOT_PRIZES[SLOT_PRIZES.length - 1];
}

/**
 * Roll, re-rolling kraken-bane while the player already owns it
 * (max 10 tries, then fall back to mega-hull). `ownedIds` is a list of
 * prize ids already owned (e.g. ['mega-krakenbane']).
 */
export function rollSlotPrizeOwned(rng, ownedIds) {
  const owned = ownedIds || [];
  let pick = null;
  for (let i = 0; i < 10; i++) {
    pick = rollSlotPrize(rng);
    if (pick.id !== 'mega-krakenbane' || !owned.includes('mega-krakenbane')) return pick;
  }
  return SLOT_PRIZES.find((p) => p.id === 'mega-hull');
}

/**
 * Apply a won prize. Pure application — does NOT deduct a mega soul
 * (the page deducts one on the spin; a stored prize was already paid
 * for when it was won). Returns true on a known prize, false otherwise.
 */
export function applySlotPrize(ship, captain, prizeId) {
  ship.upgrades = ship.upgrades || {};
  if (prizeId === 'mega-cannons') {
    ship.upgrades.cannons = (ship.upgrades.cannons || 0) + 2;
    ship.cannonsPerSide = (ship.cannonsPerSide || SHIP.cannonsPerSide) + 2;
    return true;
  }
  if (prizeId === 'mega-hull') {
    ship.maxHull = (ship.maxHull || SHIP.maxHull) + 50;
    ship.hull = Math.min(ship.maxHull, (ship.hull || 0) + 50);
    return true;
  }
  if (prizeId === 'mega-shield') {
    ship.maxShield = (ship.maxShield || 0) + 25;
    ship.shield = Math.min(ship.maxShield, (ship.shield || 0) + 25);
    return true;
  }
  if (prizeId === 'mega-krakenbane') {
    ship.upgrades.krakenBane = true;
    return true;
  }
  return false;
}

/** A prize as a storable backpack item. */
export function prizeToItem(prize) {
  return {
    id: `item-${prize.id}-${Date.now() % 1e6}`,
    kind: 'mega-upgrade',
    prizeId: prize.id,
    name: prize.name,
    desc: prize.desc,
  };
}

/** Equip a stored prize item onto the ship. Returns true when applied. */
export function equipStoredPrize(ship, captain, item) {
  if (!item || item.kind !== 'mega-upgrade' || !item.prizeId) return false;
  return applySlotPrize(ship, captain, item.prizeId);
}

// ---------------------------------------------------------------------------
// 7. MERCHANTS + SKINS
// ---------------------------------------------------------------------------

export const MERCHANT_CATALOGUE = [
  { id: 'cannon', name: 'Extra Cannon', desc: '+1 cannon per broadside', cost: 12, max: 4 },
  { id: 'hull', name: 'Reinforced Hull', desc: '+20 max hull', cost: 10, max: 5 },
  { id: 'shieldcap', name: 'Shield Capacitor', desc: '+25 max shield', cost: 10, max: 5 },
  { id: 'repair', name: 'Master Carpenter', desc: 'faster hull repair', cost: 8, max: 3 },
];

/**
 * Buy a merchant upgrade with souls. Deducts from the captain AND the
 * ship (they mirror each other via syncCaptain). Returns
 * {ok:true} or {ok:false, reason}.
 */
export function buyUpgrade(ship, captain, itemId) {
  const item = MERCHANT_CATALOGUE.find((m) => m.id === itemId);
  if (!item) return { ok: false, reason: 'unknown' };
  ship.upgrades = ship.upgrades || {};
  const owned =
    itemId === 'cannon' ? (ship.upgrades.cannons || 0) :
    itemId === 'hull' ? (ship.upgrades.hull || 0) :
    itemId === 'shieldcap' ? (ship.upgrades.shieldcap || 0) :
    (ship.upgrades.repair || 0);
  if (owned >= item.max) return { ok: false, reason: 'maxed' };
  if ((captain.souls || 0) < item.cost) return { ok: false, reason: 'not enough souls' };
  captain.souls -= item.cost;
  if (ship.souls != null) ship.souls = Math.max(0, ship.souls - item.cost);
  if (itemId === 'cannon') {
    ship.upgrades.cannons = (ship.upgrades.cannons || 0) + 1;
    ship.cannonsPerSide = (ship.cannonsPerSide || SHIP.cannonsPerSide) + 1;
  } else if (itemId === 'hull') {
    ship.upgrades.hull = (ship.upgrades.hull || 0) + 1;
    ship.maxHull = (ship.maxHull || SHIP.maxHull) + 20;
    ship.hull = Math.min(ship.maxHull, (ship.hull || 0) + 20);
  } else if (itemId === 'shieldcap') {
    ship.upgrades.shieldcap = (ship.upgrades.shieldcap || 0) + 1;
    ship.maxShield = (ship.maxShield || 0) + 25;
    ship.shield = Math.min(ship.maxShield, (ship.shield || 0) + 25);
  } else if (itemId === 'repair') {
    // Repair rate multiplier 1 + 0.5 * repair, threaded into stepShip.
    ship.upgrades.repair = (ship.upgrades.repair || 0) + 1;
  }
  return { ok: true };
}

export const SKINS = [
  { id: 'ghost', name: 'Ghost', unlockLevel: 2, cost: 0 },
  { id: 'crimson', name: 'Crimson', unlockLevel: 4, cost: 15 },
  { id: 'midnight', name: 'Midnight', unlockLevel: 6, cost: 20 },
  { id: 'gilded', name: 'Gilded', unlockLevel: 8, cost: 30 },
];

export const BASE_SKIN = { id: 'dutchman', name: 'Flying Dutchman', unlockLevel: 1, cost: 0 };

function findSkin(skinId) {
  if (skinId === 'dutchman') return BASE_SKIN;
  return SKINS.find((s) => s.id === skinId) || null;
}

function captainLevel(captain, ship) {
  if (captain && captain.level != null) return captain.level;
  if (ship && ship.level != null) return ship.level;
  return 1;
}

/**
 * Can this skin be worn right now? ok only when the level is met AND
 * the skin is owned (buySkin first for unowned skins).
 */
export function skinAvailable(captain, ship, skinId) {
  const skin = findSkin(skinId);
  if (!skin) return { ok: false, reason: 'unknown skin' };
  const level = captainLevel(captain, ship);
  if (level < skin.unlockLevel) return { ok: false, reason: `requires level ${skin.unlockLevel}` };
  const owned = (captain && captain.skinsOwned) || (ship && ship.skinsOwned) || ['dutchman'];
  if (!owned.includes(skinId)) return { ok: false, reason: 'not owned' };
  return { ok: true };
}

/** Buy a skin with souls. Adds it to captain.skinsOwned. */
export function buySkin(captain, skinId) {
  const skin = findSkin(skinId);
  if (!skin) return { ok: false, reason: 'unknown skin' };
  captain.skinsOwned = captain.skinsOwned || ['dutchman'];
  if (captain.skinsOwned.includes(skinId)) return { ok: true, alreadyOwned: true };
  const level = captainLevel(captain, null);
  if (level < skin.unlockLevel) return { ok: false, reason: `requires level ${skin.unlockLevel}` };
  if ((captain.souls || 0) < skin.cost) return { ok: false, reason: 'not enough souls' };
  captain.souls -= skin.cost;
  captain.skinsOwned.push(skinId);
  return { ok: true };
}

/** Set the ship's skin. The caller checks ownership via skinAvailable first. */
export function setSkin(ship, skinId) {
  if (!findSkin(skinId)) return false;
  ship.skin = skinId;
  return true;
}

// ---------------------------------------------------------------------------
// 8. DUELS (ashore — pure state machines, all time via an explicit `now`)
// ---------------------------------------------------------------------------

// --- Sword ---

export function makeSwordDuel(seed) {
  const rng = makeRng(seed == null ? 1 : seed);
  return {
    phase: 'fight',
    foeHp: 3,
    playerHp: 3,
    foeState: 'idle',
    foeT: 1.2 + rng() * 0.8, // time of the foe's first telegraph
    log: [],
    reward: 0,
    _rng: rng,
  };
}

function swordResult(duel) {
  return {
    phase: duel.phase,
    foeHp: duel.foeHp,
    playerHp: duel.playerHp,
    reward: duel.phase === 'won' ? 3 : 0,
  };
}

/** Advance the foe's cycle: idle (1.2–2.0 s) → telegraph (0.6 s) → strike → open (0.8 s) → idle. */
export function swordDuelTick(duel, now, rng) {
  if (duel.phase !== 'fight') return swordResult(duel);
  const r = rng || duel._rng || Math.random;
  let guard = 0;
  while (now >= duel.foeT && duel.phase === 'fight' && guard++ < 10) {
    if (duel.foeState === 'idle') {
      duel.foeState = 'telegraph';
      duel.foeT = now + 0.6;
      duel.log.push('foe telegraphs a strike');
    } else if (duel.foeState === 'telegraph') {
      duel.foeState = 'open';
      duel.foeT = now + 0.8;
      duel.playerHp -= 1;
      duel.log.push('foe strikes — player hit');
      if (duel.playerHp <= 0) {
        duel.phase = 'lost';
        duel.reward = 0;
        duel.log.push('player falls');
      }
    } else if (duel.foeState === 'open') {
      duel.foeState = 'idle';
      duel.foeT = now + 1.2 + r() * 0.8;
      duel.log.push('foe recovers');
    } else {
      break;
    }
  }
  return swordResult(duel);
}

/**
 * 'attack' during foe 'open' → foeHp -= 1 (win at 0, reward 3 souls);
 * 'attack' otherwise → whiff. 'parry' during 'telegraph' blocks the
 * incoming strike and the foe goes 'open' immediately.
 * Reward souls are returned in the result, NOT applied.
 */
export function swordDuelAction(duel, action, now) {
  if (duel.phase !== 'fight') return swordResult(duel);
  if (action === 'attack') {
    if (duel.foeState === 'open') {
      duel.foeHp -= 1;
      duel.log.push('player strikes the open foe');
      if (duel.foeHp <= 0) {
        duel.phase = 'won';
        duel.reward = 3;
        duel.log.push('foe falls — player wins');
      }
    } else {
      duel.log.push('player attacks — whiff');
    }
  } else if (action === 'parry') {
    if (duel.foeState === 'telegraph') {
      duel.foeState = 'open';
      duel.foeT = now + 0.8;
      duel.log.push('player parries — foe left open');
    } else {
      duel.log.push('player parries — nothing to block');
    }
  }
  return swordResult(duel);
}

// --- Pistol ---

export function makePistolDuel(seed) {
  const rng = makeRng(seed == null ? 1 : seed);
  return {
    phase: 'wait',
    signalAt: 1.5 + rng() * 2.0, // times are relative to now = 0
    result: null,
    reward: 0,
    reaction: null,
  };
}

/**
 * Tap to shoot. Before the signal: 'lost' / 'early' (the foe shoots
 * first). After: reaction < 0.4 s → won, 3 souls; 0.4–0.7 s → won,
 * 2 souls; > 0.7 s → lost / 'slow'. Reward souls are returned, NOT applied.
 */
export function pistolDuelTap(duel, now) {
  if (duel.phase !== 'wait') {
    return { phase: duel.phase, result: duel.result, reward: duel.reward, reaction: duel.reaction };
  }
  duel.reaction = now - duel.signalAt;
  if (now < duel.signalAt) {
    duel.phase = 'lost';
    duel.result = 'early';
    duel.reward = 0;
  } else if (duel.reaction < 0.4) {
    duel.phase = 'won';
    duel.result = 'won';
    duel.reward = 3;
  } else if (duel.reaction <= 0.7) {
    duel.phase = 'won';
    duel.result = 'won';
    duel.reward = 2;
  } else {
    duel.phase = 'lost';
    duel.result = 'slow';
    duel.reward = 0;
  }
  return { phase: duel.phase, result: duel.result, reward: duel.reward, reaction: duel.reaction };
}

// ---------------------------------------------------------------------------
// 9. ISLANDS
// ---------------------------------------------------------------------------

export const DOCK_RANGE = 25;

export const ISLAND_NAMES = [
  'Skull Anchorage',
  "Widow's Rest",
  'Gallows Cay',
  "Dead Man's Reef",
  'Sable Shore',
  "The Widow's Wake",
  'Hollow Point',
  'Caleuche Rock',
];

/**
 * Dress an island list (as built by engine.makeIslands) with names,
 * a seaward dock, torches and merchant/slot flags. The slot machine
 * lives only on the LARGEST island. Pure — no extra RNG consumed, so
 * the engine's island/chest placement is unchanged.
 */
export function dressIslands(islands) {
  let largest = null;
  for (const isl of islands) {
    if (!largest || isl.r > largest.r) largest = isl;
  }
  islands.forEach((isl, i) => {
    isl.name = ISLAND_NAMES[i % ISLAND_NAMES.length];
    // Seaward = radially outward from the spawn (the origin).
    const radial = Math.atan2(isl.x, isl.z);
    const ux = Math.sin(radial), uz = Math.cos(radial);
    const px = Math.cos(radial), pz = -Math.sin(radial); // perpendicular
    const dockD = isl.r + 14;
    isl.dock = { x: isl.x + ux * dockD, z: isl.z + uz * dockD, angle: radial };
    isl.torches = [
      { x: isl.dock.x + px * 7, z: isl.dock.z + pz * 7 },
      { x: isl.dock.x - px * 7, z: isl.dock.z - pz * 7 },
      { x: isl.x + ux * (isl.r + 7), z: isl.z + uz * (isl.r + 7) },
      { x: isl.x + ux * (isl.r * 0.5), z: isl.z + uz * (isl.r * 0.5) },
    ];
    isl.hasMerchant = true;
    isl.hasSlotMachine = isl === largest;
  });
  return islands;
}

// ---------------------------------------------------------------------------
// 11. LEGENDARY SHIPS + FLEET
// ---------------------------------------------------------------------------
//
// LEGENDARY SHIPS ARE EARNED THROUGH LEVELLING UP ONLY (Merlin's
// refinement): level thresholds only — no souls, no mega souls, no
// kraken kills gating them, and unlockShip deducts NOTHING. Souls and
// mega souls stay the currency for merchant upgrades, skins and the
// slot machine; kraken kills stay the source of mega souls.

export const LEGENDARY_SHIPS = [
  { id: 'queen-anne', name: "Queen Anne's Revenge", unlock: { level: 5 }, mods: { maxHull: 40, cannons: 2, speed: 0, shield: 25 } },
  { id: 'mary-celeste', name: 'Mary Celeste', unlock: { level: 2 }, mods: { maxHull: 0, cannons: 0, speed: 1.5, shield: 0 } },
  { id: 'caleuche', name: 'Caleuche', unlock: { level: 7 }, mods: { maxHull: 20, cannons: 1, speed: 0, shield: 50 } },
  { id: 'palatine', name: 'Palatine', unlock: { level: 4 }, mods: { maxHull: 60, cannons: 0, speed: 0, shield: 0 } },
  { id: 'lady-lovibond', name: 'Lady Lovibond', unlock: { level: 9 }, mods: { maxHull: 20, cannons: 2, speed: 1, shield: 25 } },
  { id: 'widows-wake', name: "The Widow's Wake", unlock: { level: 10 }, mods: { maxHull: 80, cannons: 2, speed: 0, shield: 50 } },
];

/** Unlock table (level only): Mary Celeste 2, Palatine 4, Queen Anne's Revenge 5, Caleuche 7, Lady Lovibond 9, The Widow's Wake 10. */
export function findLegendaryShip(shipId) {
  return LEGENDARY_SHIPS.find((s) => s.id === shipId) || null;
}

/** Level-only unlock: deducts NOTHING. */
export function unlockShip(captain, bp, shipId) {
  const def = findLegendaryShip(shipId);
  if (!def) return { ok: false, reason: 'unknown ship' };
  if (bp) bp.shipsOwned = bp.shipsOwned || ['dutchman'];
  if (captain) captain.shipsOwned = captain.shipsOwned || ['dutchman'];
  if ((bp && bp.shipsOwned.includes(shipId)) || (captain && captain.shipsOwned.includes(shipId))) {
    return { ok: true, alreadyOwned: true };
  }
  const level = captainLevel(captain, null);
  if (level < def.unlock.level) return { ok: false, reason: `requires level ${def.unlock.level}` };
  if (bp) bp.shipsOwned.push(shipId);
  if (captain && !captain.shipsOwned.includes(shipId)) captain.shipsOwned.push(shipId);
  return { ok: true };
}

/**
 * Build a fleet ship from a legendary def (def object or id). Mods apply
 * on top of levelStats at the ship's unlock level.
 */
export function makeFleetShip(shipDef, x, z) {
  const def = typeof shipDef === 'string' ? findLegendaryShip(shipDef) : shipDef;
  if (!def) return null;
  const stats = levelStats(def.unlock.level);
  const s = makeShip({ name: def.name, x, z, heading: 0, crew: 8 });
  s.level = def.unlock.level;
  s.shipDefId = def.id;
  s.skin = def.id;
  s.maxHull = stats.maxHull + def.mods.maxHull;
  s.hull = s.maxHull;
  s._hullAtCrewLoss = s.maxHull;
  s.maxShield = stats.maxShield + def.mods.shield;
  s.shield = s.maxShield;
  s.cannonsPerSide = stats.cannonsPerSide + def.mods.cannons;
  s.sizeScale = stats.sizeScale;
  s.speedMod = def.mods.speed || 0;
  s._ai = { state: 'follow' };
  return s;
}

/**
 * Step one follower. A living enemy within 130 m → fight it like stepAI
 * against the NEAREST enemy (returns 'port'/'stbd'/null like stepAI).
 * Otherwise follow the commanded ship: steer to a point 60 m off her
 * stern quarter and match speed. Returns 'port'/'stbd'/null.
 */
export function stepFleetShip(follower, player, enemies, wind, dt, rng) {
  if (!follower) return null;
  // A dead escort still rides her sinking cinematic down (sinkT only
  // advances inside stepShip) — otherwise the wreck would hang forever
  // and the engine could never prune her from the fleet.
  if (!follower.alive) { stepShip(follower, dt, wind); return null; }
  follower._ai = follower._ai || { state: 'follow' };
  let nearest = null;
  let nearestD = Infinity;
  for (const e of enemies || []) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - follower.x, e.z - follower.z);
    if (d < nearestD) { nearestD = d; nearest = e; }
  }
  if (nearest && nearestD <= 130) {
    follower._ai.state = 'fight';
    return stepAI(follower, nearest, wind, dt);
  }
  follower._ai.state = 'follow';
  if (!player) return null;
  // Stern quarter: 60 m astern of the commanded ship, 25 m to starboard.
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  const tx = player.x - fx * 60 + fz * 25;
  const tz = player.z - fz * 60 - fx * 25;
  const dx = tx - follower.x, dz = tz - follower.z;
  const d = Math.hypot(dx, dz) || 1;
  const bearing = Math.atan2(dx, dz);
  const rel = wrapAngle(bearing - follower.heading);
  follower.rudder = clamp(rel * 2, -1, 1);
  follower.sails = 'full';
  follower.throttle = d > 70 ? 1 : d > 40 ? 0.5 : 0;
  follower.anchored = false;
  stepShip(follower, dt, wind);
  return null;
}

/**
 * Switch command to a fleet ship. The previously commanded ship becomes
 * a follower (kept x/z/hull/shield/crew/skin/upgrades); the new
 * commanded ship keeps ITS x/z/hull/shield/crew/skin/upgrades. The
 * captain (level/sinkings/souls/megaSouls/krakenKills), enemies and wave
 * are untouched. Fleet only in solo.
 */
export function switchCommand(world, shipId) {
  if (!world.fleet || !Array.isArray(world.fleet)) return { ok: false, reason: 'no fleet' };
  if (world.player && world.player.id === shipId) return { ok: true, alreadyCommanded: true };
  const i = world.fleet.findIndex((s) => s.id === shipId);
  if (i < 0) return { ok: false, reason: 'unknown ship' };
  const next = world.fleet.splice(i, 1)[0];
  const prev = world.player;
  if (prev) {
    prev.isPlayer = false;
    prev._ai = { state: 'follow' };
    world.fleet.push(prev);
  }
  next.isPlayer = true;
  delete next._ai;
  world.player = next;
  return { ok: true, shipId: next.id };
}
