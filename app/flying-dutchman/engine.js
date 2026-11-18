// THE FLYING DUTCHMAN — game engine (pure logic, no three.js, no DOM).
//
// Headless-testable: ships, wind, sailing physics, cannon ballistics,
// damage, souls/crew, and the AI captains. The 3D layer (sea3d.js,
// ship3d.js) renders this state; the page feeds it input.

export const TAU = Math.PI * 2;

// Voyage systems (levels, kraken, mega souls, respawn) live in voyage.js
// and call back into this module; this import is runtime-only — neither
// module reads the other's bindings at evaluation time, so the cycle
// is safe in ESM.
import {
  levelFor, applyLevelStats, stepMegaSouls, stepKraken,
  respawnPlayer, syncCaptain, dressIslands, dressFarIsland,
} from './voyage.js';
import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';
// The shared wind law (lib/wind.js): the wind reads 10–80 km/h and
// ships sail at those speeds — Merlin, Nov 18 2026. The point of
// sail and the 10 km/h floor live there, not here.
import {
  windKmhFromStrength, shipSpeedKmh, kmhToMs,
} from '../../lib/wind.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

export const SHIP = {
  length: 22,
  beam: 6,
  deckY: 4.2,          // cannon muzzle height above water
  hullTopY: 8,         // top of the hittable hull band (deck + lower masts)
  maxHull: 100,
  maxCrew: 24,
  cannonsPerSide: 6,
  reloadBase: 5.0,     // seconds per battery
  reloadPerCrew: 0.15, // seconds shaved per crew soul
  reloadMin: 2.0,
  turnBase: 0.55,      // rad/s at full speed
  accel: 6.0,
  drag: 0.55,
  // No maxSpeed here any more: the top speed is the wind law's
  // 80 km/h ceiling (lib/wind.js), not a ship constant — Merlin,
  // Nov 18 2026. A ship running before an 80 wind reads 80.
  reverseMax: 4,       // m/s astern — the helm can back her, slowly
  ballSpeed: 64,       // fast enough that a shot reaches cannonRange
  ballGravity: 9.8,
  ballLife: 6,
  cannonRange: 130,
  hitRadius: 4.2,      // direct-hit distance to ship center line
  splashRadius: 12,    // near-miss water blast, measured to the center line
  dmgDirect: 5,
  dmgSplash: 4,
  crewPerHullLoss: 25, // every 25 hull damage kills 1 crew
  repairRate: 0.15,    // hull/s repaired per full 6-crew complement
  soulHeal: 4,
  soulPickupR: 18,     // same reach as a treasure chest (ISLAND.chestPickupR)
  soulLife: 180,       // seconds a floating soul lasts before fading
  maxFloatingSouls: 60, // cap — souls never accumulate without bound
  sinkTime: 6,
  sinkDrop: 23,        // m a wreck drops while she goes down — past the
                       // 20.4 m masthead, so a downed ship truly goes under
  mastheadY: 20.6,     // m — tallest point of the rig (main-mast pennant);
                       // the wreck is fully under once the drop passes this
  anchorTurn: 2.2,     // turn-rate multiplier while anchored (pivot)
  anchorStop: 12,      // m/s^2 — how fast the anchor kills her way
};

export const SAILS = { FULL: 'full', BATTLE: 'battle', FURLED: 'furled' };
const SAIL_FACTOR = { full: 1.0, battle: 0.62, furled: 0.25 };
const SAIL_TURN = { full: 0.8, battle: 1.0, furled: 1.35 };

/**
 * How far a wreck has dropped at sink progress k (0 fresh wreck → 1
 * slipped under). Accelerating: the hull goes under early, the
 * masthead slips under last. At k = 1 the drop clears the 20.4 m
 * masthead, so nothing of the ship is left above the water.
 */
export function sinkDropK(k) {
  const c = clamp(k, 0, 1);
  return c * c * SHIP.sinkDrop;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

/** Mulberry-ish seeded RNG. */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Waves — single source of truth shared with the 3D ocean mesh.
// ---------------------------------------------------------------------------

/** Wave height at (x, z, t). Sum of three directional sines. */
export function waveHeight(x, z, t) {
  return (
    1.1 * Math.sin(x * 0.055 + t * 0.9 + z * 0.021) +
    0.7 * Math.sin(z * 0.083 - t * 1.25 + x * 0.012) +
    0.35 * Math.sin((x + z) * 0.16 + t * 2.1)
  );
}

// ---------------------------------------------------------------------------
// Wind
// ---------------------------------------------------------------------------

export function makeWind(seed) {
  const rng = makeRng(seed);
  return { dir: rng() * TAU, strength: 0.8 + rng() * 0.5, _t: 0 };
}

/** Wind veers slowly; strength breathes across the full gauge.
 * The breath is wide on purpose: strength 0–1.5 reads 0–80 km/h
 * on the shared law, so the wind dips becalmed (under 10) at the
 * bottom of the cycle and hits the 80 storm ceiling at the top —
 * a mean strength of 0.9 reads ~48 km/h, so the sailing feel is
 * the same as the old 0.5–1.5 breath, only the numbers are exact
 * now. Stamps wind.kmh so the HUD never recomputes the law. */
export function stepWind(wind, dt) {
  wind._t += dt;
  wind.dir += Math.sin(wind._t * 0.05) * 0.02 * dt;
  wind.strength = clamp(0.9 + 0.6 * Math.sin(wind._t * 0.11) + 0.2 * Math.sin(wind._t * 0.043), 0, 1.5);
  wind.kmh = windKmhFromStrength(wind.strength);
}

// ---------------------------------------------------------------------------
// Ships
// ---------------------------------------------------------------------------

let shipSeq = 0;

export function makeShip({ name = 'Ship', isPlayer = false, x = 0, z = 0, heading = 0, crew = 6 } = {}) {
  return {
    id: `ship-${++shipSeq}`,
    name,
    isPlayer,
    x, z, heading,
    speed: 0,
    vx: 0, vz: 0,
    hull: SHIP.maxHull,
    maxHull: SHIP.maxHull,
    crew,
    souls: 0,          // total souls claimed (score)
    sails: SAILS.FULL,
    rudder: 0,         // -1 = turn right (starboard), +1 = turn left (port):
                        // stepShip adds rudder to the heading, and a
                        // positive heading turns the bow toward +X,
                        // screen-left for the chase camera — see page.jsx
    throttle: 1,       // -1 full astern .. 0 stop .. 1 full ahead
    anchored: false,   // anchor down: way dies fast, she pivots in place
    reloadPort: 0,
    reloadStbd: 0,
    alive: true,
    sinking: false,
    burning: false,    // wreck fire — set when the hull hits 0
    sinkT: 0,
    _crewStart: crew,  // souls a wreck releases: one per crewman aboard
    _hullAtCrewLoss: SHIP.maxHull,
    // Voyage fields (voyage.js): level, shield and progression.
    level: 1,
    sinkings: 0,
    shield: 25,
    maxShield: 25,
    megaSouls: 0,
    skin: 'dutchman',
    shipDefId: 'dutchman',
    upgrades: {},      // cannons/hull/shieldCap/repair/krakenBane
    cannonsPerSide: SHIP.cannonsPerSide,
    sizeScale: 1,
    invulnT: 0,        // seconds of damage immunity (after respawn)
    krakenKills: 0,
    _wreckX: null,     // where she went down (respawn measures from here)
    _wreckZ: null,
  };
}

/**
 * Angle of the wind relative to the bow: 0 = dead astern (running),
 * PI = dead ahead (in irons).
 */
export function windAngle(ship, wind) {
  // wind.dir = direction the wind blows TOWARD.
  const toWind = wrapAngle(wind.dir + Math.PI - ship.heading);
  return Math.abs(toWind);
}

/**
 * Target speed for the ship's sail plan and point of sail — in m/s,
 * because the physics below (accel, drag, reverse) is metric; the
 * LAW is km/h (lib/wind.js): the ship's speed tracks the wind by
 * its point of sail, clamped 10–80 km/h, the floor holding even
 * beating into the wind. A running ship before an 80 wind reads
 * 80; a ship close-hauled in a 10 wind still reads 10.
 */
export function targetSpeed(ship, wind) {
  const wa = windAngle(ship, wind);
  const sailF = SAIL_FACTOR[ship.sails] || 1;
  const crewF = 1 + Math.min(ship.crew, SHIP.maxCrew) * 0.005; // +12% max
  const windKmh = windKmhFromStrength(wind.strength);
  return kmhToMs(shipSpeedKmh(windKmh, wa, sailF, crewF));
}

export function stepShip(ship, dt, wind) {
  if (!ship.alive) {
    if (ship.sinking) {
      ship.sinkT += dt;
      // A wreck keeps her way while she goes down — she glides to a
      // stop instead of freezing dead in the water the moment she dies.
      ship.speed += clamp(0 - ship.speed, -3 * dt, 3 * dt);
      ship.vx = Math.sin(ship.heading) * ship.speed;
      ship.vz = Math.cos(ship.heading) * ship.speed;
      ship.x += ship.vx * dt;
      ship.z += ship.vz * dt;
    }
    return;
  }
  // Throttle: 1 = full ahead (the old always-sail behaviour — AI ships
  // and callers that pass no throttle keep it), 0 = stop, -1 = full
  // astern at reverseMax. Absent throttle means full ahead.
  const th = ship.throttle == null ? 1 : clamp(ship.throttle, -1, 1);
  let tgt;
  if (ship.anchored) tgt = 0;
  else if (th >= 0) tgt = targetSpeed(ship, wind) * th;
  else tgt = th * SHIP.reverseMax;
  const stop = ship.anchored ? SHIP.anchorStop : SHIP.accel;
  ship.speed += clamp(tgt - ship.speed, -stop * dt, stop * dt);
  ship.speed *= (1 - SHIP.drag * 0.02 * dt);
  const turnF = (SAIL_TURN[ship.sails] || 1) * (ship.anchored ? SHIP.anchorTurn : 1);
  // Anchored she pivots even at zero way; under way she needs way to turn.
  const spdF = ship.anchored ? 1 : clamp(Math.abs(ship.speed) / 6, 0.25, 1);
  ship.heading = wrapAngle(ship.heading + ship.rudder * SHIP.turnBase * turnF * spdF * dt);
  ship.vx = Math.sin(ship.heading) * ship.speed;
  ship.vz = Math.cos(ship.heading) * ship.speed;
  ship.x += ship.vx * dt;
  ship.z += ship.vz * dt;
  ship.reloadPort = Math.max(0, ship.reloadPort - dt);
  ship.reloadStbd = Math.max(0, ship.reloadStbd - dt);
  if (ship.invulnT > 0) ship.invulnT = Math.max(0, ship.invulnT - dt);
  // Slow hull repair by a well-crewed ship — kept slow on purpose, so
  // damage taken in a fight sticks instead of washing straight out.
  // Master Carpenter upgrades multiply the rate: 1 + 0.5 per rank.
  // Repair heals hull only — the shield never regenerates passively.
  if (ship.crew >= 6 && ship.hull < ship.maxHull) {
    const repairMult = 1 + 0.5 * ((ship.upgrades && ship.upgrades.repair) || 0);
    ship.hull = Math.min(ship.maxHull, ship.hull + (ship.crew / 6) * SHIP.repairRate * repairMult * dt);
  }
}

export function reloadTime(ship) {
  return Math.max(SHIP.reloadMin, SHIP.reloadBase - ship.crew * SHIP.reloadPerCrew);
}

// ---------------------------------------------------------------------------
// Cannons
// ---------------------------------------------------------------------------

/**
 * Fire a broadside. Returns { balls, fired } — balls to append to the
 * world's ball list. `now` staggers the ripple visually (each ball gets
 * a delay).
 */
export function fireBroadside(ship, side, now = 0) {
  const key = side === 'port' ? 'reloadPort' : 'reloadStbd';
  if (!ship.alive || ship[key] > 0) return { balls: [], fired: false };
  ship[key] = reloadTime(ship);
  // Broadside size reads the SHIP, not the SHIP const — levels and
  // upgrades raise cannonsPerSide per ship.
  const n = Math.max(1, ship.cannonsPerSide || SHIP.cannonsPerSide);
  // Broadside direction: perpendicular to heading. Port = left of bow.
  const sideSign = side === 'port' ? -1 : 1;
  const dirA = ship.heading + sideSign * Math.PI / 2;
  const balls = [];
  for (let i = 0; i < n; i++) {
    // Cannons spaced along the hull (a single cannon sits amidships).
    const along = n > 1 ? (i / (n - 1) - 0.5) * SHIP.length * 0.7 : 0;
    const mx = ship.x + Math.sin(ship.heading) * along + Math.sin(dirA) * (SHIP.beam / 2);
    const mz = ship.z + Math.cos(ship.heading) * along + Math.cos(dirA) * (SHIP.beam / 2);
    const spread = (i % 2 === 0 ? 1 : -1) * 0.02 * (i + 1);
    const a = dirA + spread;
    const elev = 0.10 + 0.03 * ((i * 7) % 3); // slight arc variety
    balls.push({
      x: mx, y: SHIP.deckY, z: mz,
      vx: Math.sin(a) * SHIP.ballSpeed * Math.cos(elev),
      vy: Math.sin(elev) * SHIP.ballSpeed,
      vz: Math.cos(a) * SHIP.ballSpeed * Math.cos(elev),
      fromId: ship.id,
      delay: now + i * 0.12, // ripple
      life: SHIP.ballLife,
    });
  }
  return { balls, fired: true };
}

/**
 * Step cannonballs: gravity, hull hits, water hits, ship hits. Pushes
 * events: {type:'splash'|'hit'|'sunk', ...}. Mutates balls/ships/souls
 * lists.
 *
 * A ball counts a direct hit the moment it crosses a ship's hull band
 * (waterline to deck + lower masts) within hitRadius of the center
 * line — NOT only when it finally reaches the water past the ship.
 * The old water-only test let balls fly straight through a hull and
 * splash harmlessly beyond it, so a whole engagement could land
 * nothing (Merlin, 2026-11-14: 147 s of broadsides, zero damage).
 */
export function stepBalls(balls, ships, souls, dt, t, events, rng, kraken = null) {
  const range2 = SHIP.cannonRange * SHIP.cannonRange;
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (t < b.delay) continue;
    b.life -= dt;
    b.vy -= SHIP.ballGravity * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const wh = waveHeight(b.x, b.z, t);
    let dead = b.life <= 0;
    // Kraken hit: a ball within 10 m of the kraken centre while y < 15,
    // only while it is attacking. Each ball deals 5 damage, 10 with
    // kraken-bane (looked up from the firing ship's upgrades); the
    // kraken dies at hp <= 0 (stepKraken converts 'dying'). 60 hp means
    // 12 hits without the bane, 6 with it. `hits` still counts balls
    // landed, for the HUD's n/12 display.
    if (!dead && kraken && kraken.state === 'attack' && b.y < 15 &&
        dist2(b.x, b.z, kraken.x, kraken.z) < 10 * 10) {
      const firing = ships.find((s) => s.id === b.fromId);
      const bane = firing && firing.upgrades && firing.upgrades.krakenBane;
      kraken.hits += 1;
      kraken.hp -= 5 + (bane ? 5 : 0);
      events.push({ type: 'krakenHit', hits: kraken.hits, hp: kraken.hp, x: b.x, z: b.z });
      if (kraken.hp <= 0) {
        kraken.state = 'dying';
        // The Land of the Dead (Merlin, Nov 16 ~04:17): the kraken's
        // killing blow arrives there too — additive only, the 'dying'
        // conversion in stepKraken (mega-soul + krakenSlain) is
        // untouched. Guarded by `kraken.state === 'attack'`, so this
        // fires once per kraken.
        recordSoulArrival({ kind: 'boss', name: 'Kraken', origin: 'flying-dutchman', diedAt: Date.now() });
      }
      dead = true;
    }
    // Hull crossing: the ball is inside the hittable band — test the
    // center line now, while it is over the ship, not at the water.
    if (!dead && b.y > wh - 1.5 && b.y < SHIP.hullTopY) {
      for (const s of ships) {
        if (!s.alive || s.id === b.fromId) continue;
        if (distToCenterline2(b.x, b.z, s) < SHIP.hitRadius * SHIP.hitRadius) {
          damageShip(s, SHIP.dmgDirect, events, souls, rng, b.x, b.z);
          events.push({ type: 'hit', shipId: s.id, dmg: SHIP.dmgDirect, x: b.x, z: b.z });
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.y <= wh) {
      // Water impact — check ships first (near misses still splash).
      let hitShip = null;
      for (const s of ships) {
        if (!s.alive || s.id === b.fromId) continue;
        if (distToCenterline2(b.x, b.z, s) < SHIP.hitRadius * SHIP.hitRadius) { hitShip = s; break; }
      }
      if (hitShip) {
        damageShip(hitShip, SHIP.dmgDirect, events, souls, rng, b.x, b.z);
        events.push({ type: 'hit', shipId: hitShip.id, dmg: SHIP.dmgDirect, x: b.x, z: b.z });
      } else {
        // Near splash can still chip a close ship — a 22 m ship is a
        // line, not a point, so measure to the center line.
        for (const s of ships) {
          if (!s.alive || s.id === b.fromId) continue;
          if (distToCenterline2(b.x, b.z, s) < SHIP.splashRadius * SHIP.splashRadius) {
            damageShip(s, SHIP.dmgSplash, events, souls, rng, b.x, b.z);
            events.push({ type: 'hit', shipId: s.id, dmg: SHIP.dmgSplash, x: b.x, z: b.z });
            break;
          }
        }
        events.push({ type: 'splash', x: b.x, z: b.z });
      }
      dead = true;
    }
    // Out of range of every ship — drop it.
    if (!dead) {
      let near = false;
      for (const s of ships) {
        if (dist2(b.x, b.z, s.x, s.z) < range2 * 2.25) { near = true; break; }
      }
      if (!near) dead = true;
    }
    if (dead) balls.splice(i, 1);
  }
}

/** Squared distance from (x, z) to a ship's center-line segment. */
export function distToCenterline2(x, z, ship) {
  const dx = x - ship.x, dz = z - ship.z;
  const fx = Math.sin(ship.heading), fz = Math.cos(ship.heading);
  const along = clamp(dx * fx + dz * fz, -SHIP.length / 2, SHIP.length / 2);
  const px = ship.x + fx * along, pz = ship.z + fz * along;
  return dist2(x, z, px, pz);
}

export function damageShip(ship, dmg, events, souls, rng, x, z) {
  if (!ship.alive) return;
  // Invulnerability (after respawn): damage is a no-op, no events.
  if (ship.invulnT > 0) return;
  // The shield absorbs damage before the hull does. Crew loss tracks
  // HULL damage only, so a shielded hit costs no crew.
  const absorbed = Math.min(ship.shield || 0, dmg);
  ship.shield = (ship.shield || 0) - absorbed;
  ship.hull -= (dmg - absorbed);
  if (ship._hullAtCrewLoss - ship.hull >= SHIP.crewPerHullLoss) {
    ship._hullAtCrewLoss = ship.hull;
    if (ship.crew > 0) {
      ship.crew -= 1;
      // The Land of the Dead (Merlin, Nov 16 ~04:17): a crewman lost
      // to hull damage arrives there too — additive only. One
      // arrival per crewman lost in the fight; the crew still aboard
      // when the ship sinks is covered by the 'sunk' arrival below,
      // so nobody is counted twice.
      recordSoulArrival({ kind: 'creature', name: `Crewman of ${ship.name}`, origin: 'flying-dutchman', diedAt: Date.now() });
      events.push({ type: 'crewLost', shipId: ship.id, x, z });
    }
  }
  if (ship.hull <= 0) {
    ship.hull = 0;
    ship.alive = false;
    ship.sinking = true;
    ship.burning = true; // wreck fire — the 3D layer reads this
    ship.sinkT = 0;
    if (ship.isPlayer) { ship._wreckX = ship.x; ship._wreckZ = ship.z; }
    // The Land of the Dead (Merlin, Nov 16 ~04:17): a sinking arrives
    // there too — additive only, the wreck-soul release below is
    // untouched. A foe ship (and her remaining crew) arrives as one
    // creature; the player's own sinking is the user-death outcome
    // (voyage.js respawnPlayer). Guarded by `!ship.alive` at the top
    // of damageShip, so this fires once per sinking.
    recordSoulArrival({
      kind: ship.isPlayer ? 'user' : 'creature',
      name: ship.name,
      origin: 'flying-dutchman',
      diedAt: Date.now(),
    });
    events.push({ type: 'sunk', shipId: ship.id, x: ship.x, z: ship.z, name: ship.name });
    // The dead release their souls — one per crewman lost with the
    // ship (everyone aboard, including those already lost to damage
    // during the fight, surfaces with the wreck).
    const n = Math.max(1, ship._crewStart || ship.crew);
    spawnSouls(souls, ship.x, ship.z, n, rng);
  }
}

// ---------------------------------------------------------------------------
// Souls
// ---------------------------------------------------------------------------

export function spawnSouls(souls, x, z, n, rng) {
  const r = rng || Math.random;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = 4 + r() * 14;
    souls.push({
      x: x + Math.sin(a) * d,
      z: z + Math.cos(a) * d,
      vx: (r() - 0.5) * 1.5,
      vz: (r() - 0.5) * 1.5,
      life: SHIP.soulLife, // seconds before the soul fades back to the deep
      phase: r() * TAU,
    });
  }
  // Never accumulate without bound — oldest wisps fade first.
  while (souls.length > SHIP.maxFloatingSouls) souls.shift();
}

/** Souls drift; ships within pickup radius claim them. */
export function stepSouls(souls, ships, dt, t, events) {
  const pr2 = SHIP.soulPickupR * SHIP.soulPickupR;
  for (let i = souls.length - 1; i >= 0; i--) {
    const s = souls[i];
    s.life -= dt;
    s.x += s.vx * dt; s.z += s.vz * dt;
    s.vx *= (1 - 0.2 * dt); s.vz *= (1 - 0.2 * dt);
    let claimed = false;
    if (s.life > 0) {
      for (const sh of ships) {
        if (!sh.alive) continue;
        if (dist2(s.x, s.z, sh.x, sh.z) < pr2) {
          if (sh.crew < SHIP.maxCrew) sh.crew += 1;
          sh.souls += 1;
          // A soul feeds the shield first (+15, no hull heal) when the
          // shield is below its cap; otherwise it heals hull +4 as before.
          if ((sh.shield || 0) < (sh.maxShield || 0)) {
            sh.shield = Math.min(sh.maxShield, (sh.shield || 0) + 15);
          } else {
            sh.hull = Math.min(sh.maxHull, sh.hull + SHIP.soulHeal);
          }
          events.push({ type: 'soul', shipId: sh.id, x: s.x, z: s.z });
          claimed = true;
          break;
        }
      }
    }
    if (claimed || s.life <= 0) souls.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// AI captains
// ---------------------------------------------------------------------------

const AI_NAMES = ['The Morrow', 'Grinning Wraith', 'Sable Requiem', 'Drowned Choir', 'Hollow Lantern'];

export function makeAI(index, x, z, difficulty = 1) {
  const s = makeShip({
    name: AI_NAMES[index % AI_NAMES.length],
    x, z,
    heading: Math.atan2(-x, -z),
    crew: 4 + Math.floor(difficulty * 2),
  });
  s.hull = s.maxHull = 60 + difficulty * 20;
  s._hullAtCrewLoss = s.hull;
  s._ai = { state: 'close', tackT: 0, fireT: 2 + Math.random() * 3, difficulty };
  return s;
}

/**
 * AI helm: close the distance, turn to bring a broadside to bear, fire.
 * Returns 'port'/'stbd'/null when it wants to fire (page calls
 * fireBroadside and broadcasts).
 */
export function stepAI(ai, player, wind, dt) {
  if (!ai.alive || !player.alive) return null;
  const st = ai._ai;
  const dx = player.x - ai.x, dz = player.z - ai.z;
  const d = Math.hypot(dx, dz) || 1;
  const bearing = Math.atan2(dx, dz);
  const rel = wrapAngle(bearing - ai.heading);

  // Desired: keep the player abeam (broadside) at ~60m.
  let want;
  if (d > 90) {
    want = rel; // sail straight at them
    ai.sails = SAILS.FULL;
  } else if (d < 35) {
    want = wrapAngle(rel + Math.PI); // too close — turn away
    ai.sails = SAILS.BATTLE;
  } else {
    // Abeam: aim to keep bearing at ±90°.
    const side = rel > 0 ? 1 : -1;
    want = wrapAngle(rel - side * Math.PI / 2);
    ai.sails = SAILS.BATTLE;
  }
  ai.rudder = clamp(want * 2, -1, 1);
  stepShip(ai, dt, wind);

  // Fire when the player is roughly abeam and in range.
  st.fireT -= dt;
  if (st.fireT <= 0 && d < SHIP.cannonRange * 0.85) {
    const abeam = Math.abs(Math.abs(rel) - Math.PI / 2);
    if (abeam < 0.35) {
      st.fireT = reloadTime(ai) + 1.5 / st.difficulty;
      return rel > 0 ? 'stbd' : 'port';
    }
    st.fireT = 0.5;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Islands & treasure chests — the open world.
// ---------------------------------------------------------------------------

export const ISLAND = {
  count: 8,
  minR: 45, maxR: 95,       // island radius (m)
  minH: 18, maxH: 42,       // peak height (m)
  minDist: 320, maxDist: 1400, // from the spawn, in a ring
  chestPickupR: 18,         // sail this close to claim a chest
  chestSouls: 4,            // souls a chest pays
  chestHull: 12,            // hull a chest repairs
  shipClearance: 9,         // extra margin around an island for a hull
};

/** Deterministic island ring, seeded by the world. */
export function makeIslands(rng) {
  const islands = [];
  for (let i = 0; i < ISLAND.count; i++) {
    const a = (i / ISLAND.count) * TAU + rng() * 0.5;
    const d = ISLAND.minDist + rng() * (ISLAND.maxDist - ISLAND.minDist);
    islands.push({
      id: `isle-${i}`,
      x: Math.sin(a) * d,
      z: Math.cos(a) * d,
      r: ISLAND.minR + rng() * (ISLAND.maxR - ISLAND.minR),
      h: ISLAND.minH + rng() * (ISLAND.maxH - ISLAND.minH),
      seed: Math.floor(rng() * 1e9),
    });
  }
  return islands;
}

/** 1–2 chests per island, on sandbars just off the beach. */
export function makeChests(rng, islands) {
  const chests = [];
  let n = 0;
  for (const isl of islands) {
    const count = 1 + (rng() < 0.5 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const a = rng() * TAU;
      const d = isl.r + 8 + rng() * 6;
      chests.push({
        id: `chest-${n++}`,
        x: isl.x + Math.sin(a) * d,
        z: isl.z + Math.cos(a) * d,
        opened: false,
        openT: 0,
        islandId: isl.id,
      });
    }
  }
  return chests;
}

// ---------------------------------------------------------------------------
// Far islands — the endless sea (Merlin, Nov 18, 2026). The ocean mesh
// already follows the camera, so the sea never ends; the boundary was
// the 8-island home ring. Past it, the sea grows new isles in 1600 m
// sectors, seeded by the voyage seed + sector coords — the same isle
// in the same place on every voyage, and no two sectors repeat the
// same layout. Ports, the Caleuche Rock slot machine and the merchant
// stay in the home ring: far isles are wild (dressFarIsland gives
// them a name and beach torches, no dock, no merchant, no slot).
// ---------------------------------------------------------------------------

export const FAR_SECTOR_M = 1600;
// Sectors within this many of the player's sector get generated.
export const FAR_SECTOR_RADIUS = 2;

/** Deterministic 0..1 hash of integer coords + salt. */
function hash01(ix, iz, salt) {
  let h = (Math.imul(ix + 0x9e37, 374761393) ^ Math.imul(iz + 0x9e37, 668265263) ^ Math.imul(salt | 0, 974634211)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

export function farSectorFor(x, z) {
  return { sx: Math.floor(x / FAR_SECTOR_M), sz: Math.floor(z / FAR_SECTOR_M) };
}

export function farSectorKey(sx, sz) {
  return `${sx},${sz}`;
}

// True when a sector overlaps the home archipelago: the 8-island ring
// reaches 1400 m + 95 m island radius, so anything whose nearest
// point is under 1600 m from the origin stays home-only.
export function farSectorIsHome(sx, sz) {
  const x0 = sx * FAR_SECTOR_M;
  const z0 = sz * FAR_SECTOR_M;
  const x1 = x0 + FAR_SECTOR_M;
  const z1 = z0 + FAR_SECTOR_M;
  const nx = x0 <= 0 && 0 <= x1 ? 0 : Math.min(Math.abs(x0), Math.abs(x1));
  const nz = z0 <= 0 && 0 <= z1 ? 0 : Math.min(Math.abs(z0), Math.abs(z1));
  return Math.hypot(nx, nz) < 1600;
}

/** The seeded far islands of one sector: 0, 1 or 2 isles. */
export function farIslandsForSector(seed, sx, sz) {
  if (farSectorIsHome(sx, sz)) return [];
  const s = (Number(seed) >>> 0) || 1;
  const countRoll = hash01(sx, sz, s);
  const count = countRoll < 0.25 ? 0 : countRoll < 0.8 ? 1 : 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const salt = (s ^ Math.imul(sx + 11, 7919) ^ Math.imul(sz + 13, 104729) ^ Math.imul(i + 1, 1299709)) >>> 0;
    const span = FAR_SECTOR_M - 400; // 200 m margin inside the sector
    let x = sx * FAR_SECTOR_M + 200 + hash01(sx, sz, salt + 1) * span;
    const z = sz * FAR_SECTOR_M + 200 + hash01(sx, sz, salt + 2) * span;
    const r = ISLAND.minR + hash01(sx, sz, salt + 3) * (ISLAND.maxR - ISLAND.minR);
    const h = ISLAND.minH + hash01(sx, sz, salt + 4) * (ISLAND.maxH - ISLAND.minH);
    // Two isles in one sector never overlap: nudge the second along
    // x (wrapping inside the sector) until clear.
    for (let nudge = 0; nudge < 4 && out.length > 0; nudge++) {
      const other = out[0];
      if (Math.hypot(x - other.x, z - other.z) >= r + other.r + 60) break;
      x = sx * FAR_SECTOR_M + 200 + (((x - (sx * FAR_SECTOR_M + 200) + 300) % span + span) % span);
    }
    out.push({
      id: `far-${sx}-${sz}-${i}`,
      x,
      z,
      r,
      h,
      seed: Math.floor(hash01(sx, sz, salt + 5) * 1e9),
    });
  }
  return out;
}

/** 1–2 chests per far island, deterministic from the island seed. */
export function farChestsForIsland(isl) {
  const rng = makeRng((isl.seed >>> 0) || 1);
  const count = 1 + (rng() < 0.5 ? 1 : 0);
  const chests = [];
  for (let k = 0; k < count; k++) {
    const a = rng() * TAU;
    const d = isl.r + 8 + rng() * 6;
    chests.push({
      id: `chest-${isl.id}-${k}`,
      x: isl.x + Math.sin(a) * d,
      z: isl.z + Math.cos(a) * d,
      opened: false,
      openT: 0,
      islandId: isl.id,
    });
  }
  return chests;
}

/** Generate the far islands (and their chests) for the sectors around
 *  (x, z). Called every stepWorld tick; generation is a hash per
 *  sector, and sectors are never pruned — a sailed-past isle stays
 *  where it was, with its chest state kept. */
export function ensureFarIslands(world, x, z) {
  if (!world.farIslandSectors) {
    world.farIslandSectors = new Set();
    world.farIslands = world.farIslands || [];
  }
  const { sx, sz } = farSectorFor(x, z);
  for (let dz = -FAR_SECTOR_RADIUS; dz <= FAR_SECTOR_RADIUS; dz++) {
    for (let dx = -FAR_SECTOR_RADIUS; dx <= FAR_SECTOR_RADIUS; dx++) {
      const key = farSectorKey(sx + dx, sz + dz);
      if (world.farIslandSectors.has(key)) continue;
      world.farIslandSectors.add(key);
      const isles = farIslandsForSector(world.seed, sx + dx, sz + dz);
      for (const isl of isles) {
        dressFarIsland(isl);
        world.farIslands.push(isl);
        for (const c of farChestsForIsland(isl)) world.chests.push(c);
      }
    }
  }
  return world.farIslands;
}

/** Home islands + generated far islands — everything solid. */
export function allIslands(world) {
  return world.islands.concat(world.farIslands || []);
}

/** Push a ship out of island circles (simple radial collision). */
export function collideIslands(ship, islands) {
  if (!ship.alive) return;
  for (const isl of islands) {
    const dx = ship.x - isl.x, dz = ship.z - isl.z;
    const d = Math.hypot(dx, dz);
    const minD = isl.r + ISLAND.shipClearance;
    if (d < minD && d > 0.001) {
      const push = minD - d;
      ship.x += (dx / d) * push;
      ship.z += (dz / d) * push;
      ship.speed *= 0.45; // grounding kills your way
    }
  }
}

/** The player claims unopened chests within pickup range. */
export function stepChests(world, events) {
  const p = world.player;
  if (!p.alive) return;
  for (const c of world.chests) {
    if (c.opened) continue;
    if (dist2(c.x, c.z, p.x, p.z) < ISLAND.chestPickupR * ISLAND.chestPickupR) {
      c.opened = true;
      c.openT = world.t;
      p.souls += ISLAND.chestSouls;
      p.hull = Math.min(p.maxHull, p.hull + ISLAND.chestHull);
      if (p.crew < SHIP.maxCrew) p.crew += 1;
      events.push({ type: 'chest', chestId: c.id, x: c.x, z: c.z, souls: ISLAND.chestSouls });
    }
  }
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export function makeWorld(seed = 1234) {
  const rng = makeRng(seed ^ 0x9e37);
  const islands = dressIslands(makeIslands(rng));
  const chests = makeChests(rng, islands);
  return {
    t: 0,
    seed,
    wind: makeWind(seed),
    player: makeShip({ name: 'Flying Dutchman', isPlayer: true, crew: 8 }),
    enemies: [],
    balls: [],
    souls: [],
    events: [],
    rng,
    islands,
    // Endless sea: far islands stream in as the ship sails past the
    // home ring (ensureFarIslands, called every stepWorld tick).
    farIslands: [],
    farIslandSectors: new Set(),
    chests,
    wave: 0, // difficulty wave
    // Voyage state (voyage.js): the per-voyage captain, the fleet,
    // mega souls, the kraken and the solo/duel mode.
    mode: 'solo', // the page sets world.mode = 'duel' for duels
    captain: {
      sinkings: 0, level: 1, souls: 0, megaSouls: 0, krakenKills: 0,
      skinsOwned: ['dutchman'], shipsOwned: ['dutchman'],
    },
    fleet: [],
    megaSouls: [],
    kraken: null,
    krakenTimer: 0,
    krakenThreshold: 360 + rng() * 240, // 6–10 min until the first kraken
  };
}

/** Spawn the next wave of ghost ships around the player. */
export function spawnWave(world, count) {
  world.wave += 1;
  for (let i = 0; i < count; i++) {
    const a = world.rng() * TAU;
    const d = 220 + world.rng() * 160;
    world.enemies.push(makeAI(
      world.wave * 3 + i,
      world.player.x + Math.sin(a) * d,
      world.player.z + Math.cos(a) * d,
      1 + world.wave * 0.35
    ));
  }
}

/** One fixed-step tick. Input: { rudder, sails, fire, throttle, anchored }. */
export function stepWorld(world, input, dt) {
  world.t += dt;
  const ev = world.events;
  stepWind(world.wind, dt);
  const p = world.player;
  const soulsBefore = p.souls;
  p.rudder = clamp(input.rudder || 0, -1, 1);
  if (input.sails) p.sails = input.sails;
  // No throttle in the input means full ahead (the old behaviour).
  p.throttle = input.throttle == null ? 1 : clamp(input.throttle, -1, 1);
  p.anchored = !!input.anchored;
  stepShip(p, dt, world.wind);
  // Endless sea: grow the far islands around the ship, then collide
  // against home + far isles alike — the ship never sails through one.
  ensureFarIslands(world, p.x, p.z);
  collideIslands(p, allIslands(world));

  if (input.fire && p.alive) {
    const { balls, fired } = fireBroadside(p, input.fire, world.t);
    if (fired) {
      for (const b of balls) world.balls.push(b);
      ev.push({ type: 'fire', shipId: p.id, side: input.fire });
    }
  }

  // Balls can hit fleet escorts too (they are no longer invulnerable);
  // souls stay the captain's currency — followers never collect them.
  const ships = [p, ...world.enemies];
  const ballShips = [p, ...(world.fleet || []), ...world.enemies];
  for (const e of world.enemies) {
    const side = stepAI(e, p, world.wind, dt);
    collideIslands(e, allIslands(world));
    if (side) {
      const { balls, fired } = fireBroadside(e, side, world.t);
      if (fired) {
        for (const b of balls) world.balls.push(b);
        ev.push({ type: 'fire', shipId: e.id, side });
      }
    }
  }

  stepBalls(world.balls, ballShips, world.souls, dt, world.t, ev, world.rng, world.kraken || null);
  stepSouls(world.souls, ships, dt, world.t, ev);
  stepKraken(world, dt, ev, world.rng);
  stepMegaSouls(world, dt, ev);
  stepChests(world, ev);

  // Level-ups: only sunk ENEMY SHIPS count (not the kraken, not the player).
  // Scan the whole tick's event list — stepWorld drains it every tick, so
  // everything in it was generated by this tick (including a wreck
  // finished by a kraken strike or a direct damageShip call).
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.type !== 'sunk') continue;
    if (!world.enemies.some((en) => en.id === e.shipId)) continue;
    const cap = world.captain;
    cap.sinkings += 1;
    const level = levelFor(cap.sinkings);
    if (level > cap.level) {
      const prevLevel = cap.level;
      cap.level = level;
      applyLevelStats(p, prevLevel, level);
      ev.push({ type: 'levelUp', level, prevLevel, shipId: p.id });
    }
  }

  // Solo respawn: after the sinking cinematic, the Dutchman rises again.
  // Duels keep the existing game-over (the page ends the duel).
  if (world.mode !== 'duel' && !p.alive && p.sinkT > SHIP.sinkTime + 1) {
    // respawnPlayer pushes the {type:'respawn'} event itself.
    respawnPlayer(world, world.rng);
  }

  // Remove fully-sunk enemies after their sinking cinematic.
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (!e.alive && e.sinkT > SHIP.sinkTime + 2) world.enemies.splice(i, 1);
  }

  // A sunk escort is gone for the voyage (the player still owns her —
  // she sails again next voyage from the fleet menu), and her group
  // leaves the scene once the engine drops her from world.fleet.
  for (let i = (world.fleet || []).length - 1; i >= 0; i--) {
    const f = world.fleet[i];
    if (!f.alive && f.sinkT > SHIP.sinkTime + 2) {
      world.fleet.splice(i, 1);
      ev.push({ type: 'fleetSunk', shipId: f.id, name: f.name });
    }
  }

  // Next wave when the sea is clear.
  if (p.alive && world.enemies.length === 0 && world.wave > 0) {
    spawnWave(world, Math.min(1 + Math.floor(world.wave / 2), 3));
  }

  // Mirror the captain onto the player ship for the HUD.
  syncCaptain(world, soulsBefore);

  const out = ev.slice();
  ev.length = 0;
  return out;
}
