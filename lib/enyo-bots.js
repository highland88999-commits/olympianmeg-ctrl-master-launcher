// lib/enyo-bots.js — Pure bot AI + weapon ballistics for the ENYO arena shooter.
//
// No DOM, no network, no browser globals — fully testable in plain Node.
// The three.js front-end (app/enyo/page.jsx) consumes these helpers.
// (Nov 16 ~04:17: imports recordSoulArrival from the Land of the Dead
// souls module — a guarded localStorage write, still node-safe.)

import { recordSoulArrival } from './land-of-the-dead/souls.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Weapons — plain-English stat bars are derived from these in the UI.
// ---------------------------------------------------------------------------

export const WEAPONS = {
  rifle: {
    key: 'rifle',
    name: 'VK-7 Rifle',
    desc: 'Balanced assault rifle. Steady and reliable.',
    damage: 24,
    rpm: 600, // rounds per minute
    magSize: 30,
    reserveAmmo: 150,
    reloadTime: 1.9, // seconds
    spreadDeg: 1.6, // base cone of fire
    moveSpreadDeg: 2.2, // extra spread while moving
    recoilKick: 0.011, // radians of upward kick per shot
    falloffNear: 18, // full damage inside this range (meters)
    falloffFar: 55, // damage bottoms out past this range
    falloffMin: 0.55, // minimum damage multiplier at range
    auto: true,
  },
  smg: {
    key: 'smg',
    name: 'Hornet SMG',
    desc: 'Bullet hose. Melts up close, sprays at range.',
    damage: 13,
    rpm: 900,
    magSize: 40,
    reserveAmmo: 200,
    reloadTime: 1.6,
    spreadDeg: 3.2,
    moveSpreadDeg: 3.0,
    recoilKick: 0.007,
    falloffNear: 10,
    falloffFar: 35,
    falloffMin: 0.4,
    auto: true,
  },
  marksman: {
    key: 'marksman',
    name: 'Longeye Marksman',
    desc: 'Slow, heavy, precise. Two hits drop anyone.',
    damage: 85,
    rpm: 50,
    magSize: 5,
    reserveAmmo: 25,
    reloadTime: 2.6,
    spreadDeg: 0.25,
    moveSpreadDeg: 4.5, // terrible on the move — plant your feet
    recoilKick: 0.05,
    falloffNear: 30,
    falloffFar: 120,
    falloffMin: 0.8,
    auto: false,
  },
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

export function weaponByKey(key) {
  return WEAPONS[key] || WEAPONS.rifle;
}

export function fireInterval(w) {
  return 60 / w.rpm;
}

// Damage falloff: full inside falloffNear, linear down to falloffMin at
// falloffFar, clamped at the floor beyond that.
export function damageAt(weapon, distance) {
  const d = Math.max(0, distance);
  if (d <= weapon.falloffNear) return weapon.damage;
  if (d >= weapon.falloffFar) return weapon.damage * weapon.falloffMin;
  const k = (d - weapon.falloffNear) / (weapon.falloffFar - weapon.falloffNear);
  return weapon.damage * (1 - k * (1 - weapon.falloffMin));
}

// Perturb a normalized {x,y,z} direction by a random cone of spreadDeg.
export function applySpread(dir, spreadDeg, rng) {
  const s = (spreadDeg * Math.PI) / 180;
  // Random point in a disc, projected as angular offsets.
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * s;
  const ox = Math.cos(a) * r;
  const oy = Math.sin(a) * r;
  // Build a basis around dir.
  const up = Math.abs(dir.y) > 0.93 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  // right = dir x up
  let rx = dir.y * up.z - dir.z * up.y;
  let ry = dir.z * up.x - dir.x * up.z;
  let rz = dir.x * up.y - dir.y * up.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  // trueUp = right x dir
  const ux = ry * dir.z - rz * dir.y;
  const uy = rz * dir.x - rx * dir.z;
  const uz = rx * dir.y - ry * dir.x;
  let nx = dir.x + rx * ox + ux * oy;
  let ny = dir.y + ry * ox + uy * oy;
  let nz = dir.z + rz * ox + uz * oy;
  const nl = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / nl, y: ny / nl, z: nz / nl };
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

export const BOT_HP = 100;
export const BOT_RESPAWN_DELAY = 3; // seconds
export const BOT_SEEK_RANGE = 26; // beyond this, close the distance
export const BOT_TOO_CLOSE = 8; // inside this, back off
export const BOT_SIGHT_RANGE = 70;
// Return fire: when a bot is shot, it shoots back at its attacker.
// RETALIATE_WINDOW — how long the attacker stays the bot's priority
// target after the last hit. RETALIATE_RANGE — return fire reaches
// further than normal sight (a sniper at 80–120 m still draws fire),
// but hit chance and damage still fall off with distance exactly as
// resolveBotShot/damageAt already compute them — no balance numbers
// move. Line of sight still gates every shot: no firing through walls.
export const RETALIATE_WINDOW = 4; // seconds
export const RETALIATE_RANGE = 120; // meters

// ---------------------------------------------------------------------------
// Bot skill — selectable difficulty. Scales movement speed, reaction delay
// (how fast a bot opens fire after acquiring a target), and accuracy.
// ---------------------------------------------------------------------------

export const BOT_SKILLS = {
  recruit: {
    key: 'recruit',
    name: 'Recruit',
    desc: 'Slow to react, shaky aim. Good first fight.',
    speedMul: 0.85,
    reactionMul: 1.7, // longer delay before opening fire
    accuracyMul: 0.7,
  },
  regular: {
    key: 'regular',
    name: 'Regular',
    desc: 'Trained combatants. A fair fight.',
    speedMul: 1.0,
    reactionMul: 1.0,
    accuracyMul: 1.0,
  },
  veteran: {
    key: 'veteran',
    name: 'Veteran',
    desc: 'Fast, decisive, deadly. Bring your best.',
    speedMul: 1.12,
    reactionMul: 0.6,
    accuracyMul: 1.3,
  },
};

export const SKILL_KEYS = Object.keys(BOT_SKILLS);

export function skillByKey(key) {
  return BOT_SKILLS[key] || BOT_SKILLS.regular;
}

export function createBot(id, team, spawn, skill = 'regular') {
  const sk = skillByKey(skill);
  return {
    id,
    team, // 'blue' | 'red'
    name: botName(id),
    skillKey: sk.key,
    pos: { x: spawn.x, z: spawn.z },
    yaw: 0,
    hp: BOT_HP,
    alive: true,
    respawnT: 0,
    state: 'seek', // seek | strafe | fallback
    strafeDir: 1,
    strafeT: 0,
    fireT: 1 + Math.random() * 0.5,
    reactT: 0, // reaction delay before opening fire on a new target
    targetId: null,
    retaliateId: null, // combatant who last shot this bot (return-fire priority)
    retaliateT: 0, // seconds left on the return-fire window
    wp: 0, // current waypoint index when wandering
    weaponKey: ['rifle', 'smg', 'rifle', 'marksman'][id % 4],
    kills: 0,
    deaths: 0,
    speed: 4.2 * sk.speedMul,
  };
}

const BOT_NAMES = [
  'Ajax', 'Bia', 'Kratos', 'Nike', 'Zelos', 'Eris', 'Phobos', 'Deimos',
  'Ares Jr', 'Enyo-2', 'Hector', 'Sarpedon', 'Diomedes', 'Odysseus',
];

export function botName(id) {
  return BOT_NAMES[id % BOT_NAMES.length];
}

// All combatants a bot can see: the player plus other bots.
export function nearestEnemy(bot, combatants) {
  let best = null;
  let bestD = Infinity;
  for (const c of combatants) {
    if (c.team === bot.team || c.dead) continue;
    const d = Math.hypot(c.pos.x - bot.pos.x, c.pos.z - bot.pos.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? { target: best, dist: bestD } : null;
}

// True line of sight between two {x,z} points: no tall obstacle blocks the
// segment. Obstacles are {x, z, w, d, h} axis-aligned boxes; anything with
// h > 1.4 blocks vision (low crates and rubble do not).
export function hasLineOfSight(a, b, obstacles) {
  if (!obstacles || obstacles.length === 0) return true;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const o of obstacles) {
    if (o.h <= 1.4) continue;
    const hx = o.w / 2;
    const hz = o.d / 2;
    // Slab method: segment vs AABB.
    let tmin = 0;
    let tmax = 1;
    let blocked = true;
    const dims = [
      { p: a.x, d: dx, min: o.x - hx, max: o.x + hx },
      { p: a.z, d: dz, min: o.z - hz, max: o.z + hz },
    ];
    for (const dim of dims) {
      if (Math.abs(dim.d) < 1e-9) {
        if (dim.p < dim.min || dim.p > dim.max) {
          blocked = false;
          break;
        }
      } else {
        let t1 = (dim.min - dim.p) / dim.d;
        let t2 = (dim.max - dim.p) / dim.d;
        if (t1 > t2) {
          const tt = t1;
          t1 = t2;
          t2 = tt;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          blocked = false;
          break;
        }
      }
    }
    if (blocked) return false;
  }
  return true;
}

// Nearest enemy the bot can actually see: in sight range AND line of sight.
export function nearestVisibleEnemy(bot, combatants, obstacles) {
  let best = null;
  let bestD = Infinity;
  for (const c of combatants) {
    if (c.team === bot.team || c.dead) continue;
    const d = Math.hypot(c.pos.x - bot.pos.x, c.pos.z - bot.pos.z);
    if (d > BOT_SIGHT_RANGE || d >= bestD) continue;
    if (!hasLineOfSight(bot.pos, c.pos, obstacles)) continue;
    bestD = d;
    best = c;
  }
  return best ? { target: best, dist: bestD } : null;
}

// Mark that `attackerId` just shot `bot`. The bot's next ticks
// prioritize that attacker (see botThink). Only the FIRST return
// shot is hastened — when the attacker is not already the bot's
// target, reaction delay and burst timer are shortened, never
// lengthened — so sustained fire rate, accuracy and damage are
// untouched: a bot already shooting back keeps its normal cadence.
// No-ops on dead bots and on a missing attacker id; the enemy-team
// check lives in botThink, so a teammate's stray shot never turns
// an ally hostile.
export function markBotAttacked(bot, attackerId) {
  if (!bot || !bot.alive || attackerId == null) return;
  const alreadyTargeting = bot.targetId === attackerId;
  bot.retaliateId = attackerId;
  bot.retaliateT = RETALIATE_WINDOW;
  if (alreadyTargeting) return;
  const skill = skillByKey(bot.skillKey);
  bot.reactT = Math.min(bot.reactT, 0.15 * skill.reactionMul);
  const w = weaponByKey(bot.weaponKey);
  bot.fireT = Math.min(bot.fireT, fireInterval(w));
}

// One AI tick. Mutates the bot. Returns an array of intents:
//   { type: 'move', dx, dz }            — desired velocity (units/sec)
//   { type: 'fire', targetId, dist }    — wants to shoot this combatant
//   { type: 'face', yaw }               — desired facing
// opts (optional): { obstacles, waypoints }
//   obstacles  — [{x,z,w,d,h}] used for line-of-sight engagement. When
//                provided, bots only engage enemies they can actually see.
//   waypoints  — [{x,z}] patrol points. When no enemy is visible, the bot
//                walks its waypoint circuit instead of drifting to mid-map.
export function botThink(bot, combatants, dt, rng, opts) {
  const intents = [];
  const obstacles = opts?.obstacles ?? null;
  const waypoints = opts?.waypoints ?? null;
  const skill = skillByKey(bot.skillKey);
  if (!bot.alive) {
    bot.respawnT -= dt;
    if (bot.respawnT <= 0) {
      bot.alive = true;
      bot.hp = BOT_HP;
      bot.respawnT = 0;
      bot.targetId = null;
      bot.retaliateId = null;
      bot.retaliateT = 0;
      intents.push({ type: 'respawned' });
    }
    return intents;
  }
  if (bot.retaliateT > 0) bot.retaliateT -= dt;

  const found = obstacles
    ? nearestVisibleEnemy(bot, combatants, obstacles)
    : nearestEnemy(bot, combatants);

  // Return fire: a recent attacker outranks the nearest enemy — even
  // beyond normal sight range (up to RETALIATE_RANGE) — as long as
  // there is line of sight. Without line of sight the bot still turns
  // and hunts toward its attacker instead of patrolling, but fires
  // nothing: return fire never shoots through walls.
  let engaged = null;
  if (bot.retaliateT > 0 && bot.retaliateId != null) {
    const attacker = combatants.find(
      (c) => c.id === bot.retaliateId && c.team !== bot.team && !c.dead
    );
    if (attacker) {
      const distR = Math.hypot(attacker.pos.x - bot.pos.x, attacker.pos.z - bot.pos.z);
      if (distR <= RETALIATE_RANGE) {
        const seenR = !obstacles || hasLineOfSight(bot.pos, attacker.pos, obstacles);
        if (seenR) {
          engaged = { target: attacker, dist: distR, retaliation: true };
        } else {
          const yawR = Math.atan2(attacker.pos.x - bot.pos.x, attacker.pos.z - bot.pos.z);
          bot.targetId = attacker.id;
          bot.state = 'seek';
          intents.push({ type: 'face', yaw: yawR });
          intents.push({ type: 'move', dx: Math.sin(yawR) * bot.speed, dz: Math.cos(yawR) * bot.speed });
          return intents;
        }
      }
    }
  }
  if (!engaged && found && found.dist <= BOT_SIGHT_RANGE) {
    engaged = { target: found.target, dist: found.dist, retaliation: false };
  }
  if (!engaged) {
    // No one visible: clear target lock and patrol.
    bot.targetId = null;
    bot.reactT = 0;
    bot.state = 'seek';
    let dest;
    if (waypoints && waypoints.length > 0) {
      // Waypoint wander: walk the circuit, advance when a point is reached.
      let wpi = bot.wp % waypoints.length;
      let wp = waypoints[wpi];
      let guard = 0;
      while (Math.hypot(wp.x - bot.pos.x, wp.z - bot.pos.z) < 2 && guard < waypoints.length) {
        wpi = (wpi + 1) % waypoints.length;
        wp = waypoints[wpi];
        guard += 1;
      }
      bot.wp = wpi;
      dest = wp;
    } else {
      dest = { x: 0, z: 0 }; // fallback: drift toward mid-map so fights find each other
    }
    const yaw = Math.atan2(dest.x - bot.pos.x, dest.z - bot.pos.z);
    intents.push({ type: 'face', yaw });
    intents.push({ type: 'move', dx: Math.sin(yaw) * bot.speed, dz: Math.cos(yaw) * bot.speed });
    return intents;
  }

  const { target, dist, retaliation } = engaged;
  const yaw = Math.atan2(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
  bot.yaw = yaw;
  intents.push({ type: 'face', yaw });

  // Reaction delay: a beat before opening fire on a freshly acquired target.
  // Return fire answers faster than a cold acquire — a snap reaction to
  // being shot, not a faster gun: fire cadence after that first shot is
  // unchanged.
  if (bot.targetId !== target.id) {
    bot.targetId = target.id;
    bot.reactT = (retaliation ? 0.15 : 0.4) * skill.reactionMul;
    if (retaliation) {
      bot.fireT = Math.min(bot.fireT, fireInterval(weaponByKey(bot.weaponKey)));
    }
  }

  if (dist > BOT_SEEK_RANGE) {
    bot.state = 'seek';
    intents.push({
      type: 'move',
      dx: Math.sin(yaw) * bot.speed,
      dz: Math.cos(yaw) * bot.speed,
    });
  } else if (dist < BOT_TOO_CLOSE) {
    // Too close — back off while firing.
    bot.state = 'fallback';
    intents.push({
      type: 'move',
      dx: -Math.sin(yaw) * bot.speed * 0.8,
      dz: -Math.cos(yaw) * bot.speed * 0.8,
    });
  } else {
    // In the pocket: strafe and shoot.
    bot.state = 'strafe';
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) {
      bot.strafeDir = rng() < 0.5 ? -1 : 1;
      bot.strafeT = 1 + rng() * 1.5;
    }
    const sx = Math.cos(yaw) * bot.strafeDir;
    const sz = -Math.sin(yaw) * bot.strafeDir;
    intents.push({ type: 'move', dx: sx * bot.speed * 0.7, dz: sz * bot.speed * 0.7 });
  }

  // Fire control with distance-based inaccuracy baked into hit chance.
  // Return fire reaches its attacker out to RETALIATE_RANGE; ordinary
  // engagement still stops at sight range.
  bot.reactT -= dt;
  bot.fireT -= dt;
  if (bot.reactT <= 0 && bot.fireT <= 0 && dist <= (retaliation ? RETALIATE_RANGE : BOT_SIGHT_RANGE)) {
    const w = weaponByKey(bot.weaponKey);
    bot.fireT = fireInterval(w) * (2.2 + rng() * 1.5) * skill.reactionMul; // bots fire in loose bursts
    intents.push({ type: 'fire', targetId: target.id, dist, skill: skill.key });
  }
  return intents;
}

// Resolve a bot's shot: hit chance falls with distance and weapon spread,
// and scales with the bot's skill.
export function resolveBotShot(dist, weapon, rng, skill = 'regular') {
  const sk = skillByKey(skill);
  const spreadFactor = (weapon.spreadDeg + weapon.moveSpreadDeg * 0.5) / 3;
  const rangeFactor = Math.min(1, dist / BOT_SIGHT_RANGE);
  const pHit = Math.max(0.05, (0.62 - rangeFactor * 0.45 - spreadFactor * 0.12) * sk.accuracyMul);
  if (rng() > pHit) return { hit: false, damage: 0 };
  // Damage dropoff + a little jitter.
  const dmg = damageAt(weapon, dist) * (0.85 + rng() * 0.3);
  return { hit: true, damage: dmg };
}

export function damageBot(bot, dmg) {
  if (!bot.alive) return false;
  bot.hp -= dmg;
  if (bot.hp <= 0) {
    bot.hp = 0;
    bot.alive = false;
    bot.respawnT = BOT_RESPAWN_DELAY;
    bot.deaths += 1;
    // The Land of the Dead (Merlin, Nov 16 ~04:17): every bot kill
    // arrives there too — additive only, the respawn clock above
    // is untouched. damageBot is the single choke point (player
    // kills and bot-on-bot kills both route through it), so this
    // fires once per bot death.
    recordSoulArrival({ kind: 'creature', name: bot.name, origin: 'enyo', diedAt: Date.now() });
    return true; // killed
  }
  return false;
}
