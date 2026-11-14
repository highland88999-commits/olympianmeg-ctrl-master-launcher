// THE FLYING DUTCHMAN — game engine (pure logic, no three.js, no DOM).
//
// Headless-testable: ships, wind, sailing physics, cannon ballistics,
// damage, souls/crew, and the AI captains. The 3D layer (sea3d.js,
// ship3d.js) renders this state; the page feeds it input.

export const TAU = Math.PI * 2;

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
  maxSpeed: 15,        // m/s running before the wind, full sails
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
};

export const SAILS = { FULL: 'full', BATTLE: 'battle', FURLED: 'furled' };
const SAIL_FACTOR = { full: 1.0, battle: 0.62, furled: 0.25 };
const SAIL_TURN = { full: 0.8, battle: 1.0, furled: 1.35 };

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

/** Wind veers slowly; strength breathes. */
export function stepWind(wind, dt) {
  wind._t += dt;
  wind.dir += Math.sin(wind._t * 0.05) * 0.02 * dt;
  wind.strength = clamp(0.9 + 0.4 * Math.sin(wind._t * 0.11) + 0.15 * Math.sin(wind._t * 0.043), 0.5, 1.5);
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
    rudder: 0,         // -1 port .. 1 starboard
    reloadPort: 0,
    reloadStbd: 0,
    alive: true,
    sinking: false,
    burning: false,    // wreck fire — set when the hull hits 0
    sinkT: 0,
    _crewStart: crew,  // souls a wreck releases: one per crewman aboard
    _hullAtCrewLoss: SHIP.maxHull,
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

/** Target speed for the ship's sail plan and point of sail. */
export function targetSpeed(ship, wind) {
  const wa = windAngle(ship, wind);
  const sailF = SAIL_FACTOR[ship.sails] || 1;
  let pointF;
  if (wa < 0.5) pointF = 0.22;              // in irons
  else if (wa < 1.1) pointF = 0.55 + 0.2 * (wa - 0.5);
  else if (wa < 2.2) pointF = 0.72 + 0.18 * (wa - 1.1);
  else pointF = 1.0;                          // running
  const crewF = 1 + Math.min(ship.crew, SHIP.maxCrew) * 0.005; // +12% max
  return SHIP.maxSpeed * pointF * sailF * wind.strength * crewF;
}

export function stepShip(ship, dt, wind) {
  if (!ship.alive) {
    if (ship.sinking) ship.sinkT += dt;
    return;
  }
  const tgt = targetSpeed(ship, wind);
  ship.speed += clamp(tgt - ship.speed, -SHIP.accel * dt, SHIP.accel * dt);
  ship.speed *= (1 - SHIP.drag * 0.02 * dt);
  const turnF = SAIL_TURN[ship.sails] || 1;
  const spdF = clamp(Math.abs(ship.speed) / 6, 0.25, 1);
  ship.heading = wrapAngle(ship.heading + ship.rudder * SHIP.turnBase * turnF * spdF * dt);
  ship.vx = Math.sin(ship.heading) * ship.speed;
  ship.vz = Math.cos(ship.heading) * ship.speed;
  ship.x += ship.vx * dt;
  ship.z += ship.vz * dt;
  ship.reloadPort = Math.max(0, ship.reloadPort - dt);
  ship.reloadStbd = Math.max(0, ship.reloadStbd - dt);
  // Slow hull repair by a well-crewed ship — kept slow on purpose, so
  // damage taken in a fight sticks instead of washing straight out.
  if (ship.crew >= 6 && ship.hull < ship.maxHull) {
    ship.hull = Math.min(ship.maxHull, ship.hull + (ship.crew / 6) * SHIP.repairRate * dt);
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
  const n = SHIP.cannonsPerSide;
  // Broadside direction: perpendicular to heading. Port = left of bow.
  const sideSign = side === 'port' ? -1 : 1;
  const dirA = ship.heading + sideSign * Math.PI / 2;
  const balls = [];
  for (let i = 0; i < n; i++) {
    // Cannons spaced along the hull.
    const along = (i / (n - 1) - 0.5) * SHIP.length * 0.7;
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
export function stepBalls(balls, ships, souls, dt, t, events, rng) {
  const range2 = SHIP.cannonRange * SHIP.cannonRange;
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (t < b.delay) continue;
    b.life -= dt;
    b.vy -= SHIP.ballGravity * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const wh = waveHeight(b.x, b.z, t);
    let dead = b.life <= 0;
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
  ship.hull -= dmg;
  // Crew loss every 25 hull damage.
  if (ship._hullAtCrewLoss - ship.hull >= SHIP.crewPerHullLoss) {
    ship._hullAtCrewLoss = ship.hull;
    if (ship.crew > 0) {
      ship.crew -= 1;
      events.push({ type: 'crewLost', shipId: ship.id, x, z });
    }
  }
  if (ship.hull <= 0) {
    ship.hull = 0;
    ship.alive = false;
    ship.sinking = true;
    ship.burning = true; // wreck fire — the 3D layer reads this
    ship.sinkT = 0;
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
          sh.hull = Math.min(sh.maxHull, sh.hull + SHIP.soulHeal);
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
  const islands = makeIslands(rng);
  const chests = makeChests(rng, islands);
  return {
    t: 0,
    wind: makeWind(seed),
    player: makeShip({ name: 'Flying Dutchman', isPlayer: true, crew: 8 }),
    enemies: [],
    balls: [],
    souls: [],
    events: [],
    rng,
    islands,
    chests,
    wave: 0, // difficulty wave
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

/** One fixed-step tick. Input: { rudder, sails, fire }. */
export function stepWorld(world, input, dt) {
  world.t += dt;
  const ev = world.events;
  stepWind(world.wind, dt);
  const p = world.player;
  p.rudder = clamp(input.rudder || 0, -1, 1);
  if (input.sails) p.sails = input.sails;
  stepShip(p, dt, world.wind);
  collideIslands(p, world.islands);

  if (input.fire && p.alive) {
    const { balls, fired } = fireBroadside(p, input.fire, world.t);
    if (fired) {
      for (const b of balls) world.balls.push(b);
      ev.push({ type: 'fire', shipId: p.id, side: input.fire });
    }
  }

  const ships = [p, ...world.enemies];
  for (const e of world.enemies) {
    const side = stepAI(e, p, world.wind, dt);
    collideIslands(e, world.islands);
    if (side) {
      const { balls, fired } = fireBroadside(e, side, world.t);
      if (fired) {
        for (const b of balls) world.balls.push(b);
        ev.push({ type: 'fire', shipId: e.id, side });
      }
    }
  }

  stepBalls(world.balls, ships, world.souls, dt, world.t, ev, world.rng);
  stepSouls(world.souls, ships, dt, world.t, ev);
  stepChests(world, ev);

  // Remove fully-sunk enemies after their sinking cinematic.
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (!e.alive && e.sinkT > SHIP.sinkTime + 2) world.enemies.splice(i, 1);
  }

  // Next wave when the sea is clear.
  if (p.alive && world.enemies.length === 0 && world.wave > 0) {
    spawnWave(world, Math.min(1 + Math.floor(world.wave / 2), 3));
  }

  const out = ev.slice();
  ev.length = 0;
  return out;
}
