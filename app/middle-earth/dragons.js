// MIDDLE-EARTH — DRAGONS: hunt, killable, loot.
//
// Merlin, Nov 26: "Make the dragons hunt and be billable. They
// drop dragon scales or fire orbs." "Billable" reads as
// killable — hunt them, kill them, they drop loot.
//
// Video proof (Nov 26, video 2, f_68–98): the Dragon of the
// Wastes stood planted on the plain the whole encounter —
// player walked up, struck at f_87 and f_89–90, sword arc
// crossing its body, NO reaction: no flinch, no damage, no HP
// bar, no roar, no wing movement. HP stayed 95, hunt meter
// "Cold · 0" — it did not register as a hunt target and did
// not aggro. "Effectively a static display model in this
// footage." This module is the fix: the dragon (and the Fell
// Beast, the same pod's second dragon-class creature) now hunts,
// takes damage, dies, and drops loot. The model is untouched —
// the watcher called it "the best creature model in the
// footage" (dark green, detailed wings/horns/tail); only the
// behaviour changes.
//
// BRAIN: the SHARED agent system (lib/world/character-agent.js:
// perceive → decide → act), not the hand-rolled orc stepper.
// Why: the agent is the house brain for creature movement
// (Merlin, Nov 18: agents run ALL character movement), its
// steering primitives (headingTo / turnToward / moveForward)
// are the one shared implementation, and a dragon's senses are
// different from an orc's (wide sight, no facing cone, two
// attacks at two ranges) — a new agent brain expresses that
// without forking stepOrc. State still lives on the dragon
// record, exactly as the old steppers kept it, so the zone and
// the page treat a dragon like any other strike target.
// The agent never kills anything itself — damageDragon is the
// single choke point, like damageOrc.
//
// NUMBERS (fit to the world's scale — orc warrior 60 HP,
// captain 150 HP, Saruman 600 HP; the watcher notes the dragon's
// threat must sit a step ABOVE the Orc Captain, not below it):
//   dragon:     400 HP — ~12 blade hits (34) / ~16 bow shots (26)
//   fell-beast: 300 HP — ~9 blade hits / ~12 bow shots
// Attacks (player has 100 HP):
//   fire breath: 22 dmg (dragon) / 18 (fell-beast), range 14/12 m,
//     wind-up 1.2/1.0 s (telegraphed — the player SEES it coming),
//     cooldown 3.5/3.0 s
//   bite/claw:   12 dmg / 10, range 4.5/4.0 m, wind-up 0.6/0.5 s,
//     cooldown 1.6/1.4 s
// Hunt: sight 60/55 m (no facing cone — a dragon sees wide),
// alert 30/28 m, chase speed 6.5/7.2 m/s (faster than any orc),
// roam speed 2.2/2.6 m/s around a 60 m home radius. Loses the
// trail past alert × 2.2 or when the player dies, and drifts home.
// Prey is the PLAYER ONLY — dragons do not hunt orcs: an orc kill
// feeds the campaign gate (30 kills open Saruman) and the hunt
// meter, so a dragon farming orcs would corrupt both counts.
//
// DEATH + RESPAWN: a dead dragon refills on its pod's respawn
// clock (Mordor 40 s, def.orcs.respawnS) once the player is
// > 65 m away — the orc rule (zone.js RESPAWN_MIN_DIST),
// mirrored, so the wastes never empty permanently and a
// farmed dragon cannot be re-killed underfoot. Loot rolls in
// orcs.js rollDragonLoot (same backpack path as orc loot).

import { createCharacterAgent, turnToward, moveForward } from '../../lib/world/character-agent.js';
import { rollDragonLoot } from './orcs.js';
import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';

export const DRAGON_KINDS = {
  dragon: {
    hp: 400, speed: 6.5, roamSpeed: 2.2, scale: 2.4, height: 4.2,
    sightR: 60, alertR: 30, homeRadius: 60,
    breath: { dmg: 22, range: 14, windup: 1.2, cooldown: 3.5 },
    bite: { dmg: 12, range: 4.5, windup: 0.6, cooldown: 1.6 },
  },
  'fell-beast': {
    hp: 300, speed: 7.2, roamSpeed: 2.6, scale: 1.9, height: 3.4,
    sightR: 55, alertR: 28, homeRadius: 60,
    breath: { dmg: 18, range: 12, windup: 1.0, cooldown: 3.0 },
    bite: { dmg: 10, range: 4.0, windup: 0.5, cooldown: 1.4 },
  },
};

/** Dragon-class models (data.js Mordor characters, creature: true). */
export const DRAGON_MODELS = new Set(['dragon', 'fell-beast']);

export function isDragonModel(model) {
  return DRAGON_MODELS.has(model);
}

export function isDragonKind(kind) {
  return kind === 'dragon' || kind === 'fell-beast';
}

export function createDragon(spec) {
  const kind = spec.kind === 'fell-beast' ? 'fell-beast' : 'dragon';
  const stats = DRAGON_KINDS[kind];
  return {
    kind,
    isDragon: true,
    id: spec.id != null ? spec.id : kind,
    x: spec.x, z: spec.z,
    home: { x: spec.x, z: spec.z },
    homeRadius: stats.homeRadius,
    heading: spec.faceYaw != null ? spec.faceYaw : 0,
    yaw: spec.faceYaw != null ? spec.faceYaw : 0,
    hp: stats.hp, maxHp: stats.hp,
    state: 'roam', // roam | chase | windup | dead
    windupKind: null, // 'breath' | 'bite' while winding up
    windupT: 0,
    attackT: 0,
    wanderT: 0, wanderYaw: 0,
    deathT: 0, flashT: 0,
    deadAt: -1,
    stats,
  };
}

/* ---------------- the shared-agent brain ----------------
 * perceive → decide → act. The brain reads the player and the
 * dragon's own timers; it never writes hp/state directly except
 * through the act step's movement and the wind-up timers the
 * record already owns. A brain failure falls back to standing
 * still (the game never freezes). */
function dragonAgent(dragon) {
  const stats = dragon.stats;
  return createCharacterAgent({
    id: dragon.id,
    kind: dragon.kind,
    perceive(ctx) {
      const { player } = ctx;
      const dx = player.x - dragon.x, dz = player.z - dragon.z;
      const dist = Math.hypot(dx, dz);
      const los = !ctx.senses || !ctx.senses.losClear
        || ctx.senses.losClear(dragon.x, dragon.z, player.x, player.z);
      return {
        dist, dx, dz,
        playerAlive: !!player.alive,
        canSee: !!player.alive && dist <= stats.sightR && los,
        inBite: dist <= stats.bite.range,
        inBreath: dist <= stats.breath.range,
      };
    },
    decide(obs) {
      if (dragon.state === 'dead') return { move: false };
      if (dragon.windupT > 0) return { move: false, attack: 'windup' };
      if (!obs.playerAlive || obs.dist > stats.alertR * 2.2) {
        return { move: 'roam' };
      }
      if (dragon.state === 'roam' && (obs.canSee || obs.dist <= stats.alertR)) {
        return { move: 'chase', sighted: true };
      }
      if (dragon.state === 'chase') {
        if (dragon.attackT <= 0 && obs.inBite) return { move: false, attack: 'bite' };
        if (dragon.attackT <= 0 && obs.inBreath) return { move: false, attack: 'breath' };
        return { move: 'chase' };
      }
      return { move: dragon.state === 'chase' ? 'chase' : 'roam' };
    },
    act(ctx, action, dt) {
      const events = [];
      const { player, rng } = ctx;
      if (dragon.state === 'dead') { dragon.deathT += dt; return events; }
      if (dragon.flashT > 0) dragon.flashT -= dt;
      if (dragon.attackT > 0) dragon.attackT -= dt;
      // A wind-up only lives while the player is still alive and
      // still in reach of the wound-up attack — step out of range
      // mid-wind-up and the breath/bite is cancelled, not banked
      // (the orc wind-up law, stepOrc).
      if (dragon.windupT > 0) {
        const atk = stats[dragon.windupKind] || stats.bite;
        const dx = player.x - dragon.x, dz = player.z - dragon.z;
        const dist = Math.hypot(dx, dz);
        if (!player.alive || dist > atk.range) {
          dragon.windupT = 0;
          dragon.windupKind = null;
          dragon.state = 'chase';
          return events;
        }
        dragon.windupT -= dt;
        if (dragon.windupT <= 0) {
          dragon.windupT = 0;
          dragon.attackT = atk.cooldown;
          dragon.state = 'chase';
          events.push({ type: 'hitPlayer', dmg: atk.dmg, attack: dragon.windupKind });
          dragon.windupKind = null;
        }
        return events;
      }
      if (action.sighted) {
        dragon.state = 'chase';
        events.push({ type: 'sighted' });
      }
      if (action.attack === 'bite' || action.attack === 'breath') {
        const atk = stats[action.attack];
        dragon.state = 'windup';
        dragon.windupKind = action.attack;
        dragon.windupT = atk.windup;
        events.push({ type: 'windup', attack: action.attack });
        return events;
      }
      if (action.move === 'chase') {
        dragon.state = 'chase';
        const dx = player.x - dragon.x, dz = player.z - dragon.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-6) {
          const target = Math.atan2(dx, dz);
          turnToward(dragon, target, 2.4, dt);
          dragon.speed = stats.speed;
          moveForward(dragon, dt);
          dragon.yaw = dragon.heading;
        }
        return events;
      }
      // Roam: a slow patrol shuffle around home, like an idle orc.
      dragon.state = 'roam';
      dragon.wanderT -= dt;
      if (dragon.wanderT <= 0) {
        dragon.wanderT = 1.6 + rng() * 2.6;
        dragon.wanderYaw = rng() * Math.PI * 2;
      }
      const hx = dragon.home.x - dragon.x, hz = dragon.home.z - dragon.z;
      if (Math.hypot(hx, hz) > (dragon.homeRadius || 60)) dragon.wanderYaw = Math.atan2(hx, hz);
      turnToward(dragon, dragon.wanderYaw, 1.2, dt);
      dragon.speed = stats.roamSpeed;
      moveForward(dragon, dt);
      dragon.yaw = dragon.heading;
      return events;
    },
    fallback: { move: false },
  });
}

/**
 * Advance one dragon one tick. player = { x, z, alive };
 * senses = { losClear } (optional — the zone's terrain check).
 * Returns events: [{ type: 'hitPlayer', dmg, attack }] |
 * [{ type: 'sighted' }] | [{ type: 'windup', attack }].
 */
export function stepDragon(dragon, dt, player, rng, senses) {
  const agent = dragonAgent(dragon);
  return agent.step({ dragon, player, rng: rng || Math.random, senses }, dt);
}

/**
 * Apply damage to a dragon. Returns the loot array when this
 * blow kills (possibly empty), or null when it stands. A struck
 * dragon that lives turns and hunts its attacker.
 */
export function damageDragon(dragon, dmg, rng) {
  if (!dragon || dragon.state === 'dead') return null;
  dragon.hp -= dmg;
  dragon.flashT = 0.18;
  if (dragon.state === 'roam' || dragon.state === 'windup') dragon.state = 'chase';
  if (dragon.hp > 0) return null;
  dragon.hp = 0;
  dragon.state = 'dead';
  dragon.deathT = 0;
  dragon.windupT = 0;
  dragon.windupKind = null;
  recordSoulArrival({
    kind: 'monster',
    name: dragon.kind === 'fell-beast' ? 'Fell beast' : 'Dragon of the Wastes',
    origin: 'middle-earth',
    diedAt: Date.now(),
  });
  return rollDragonLoot(dragon.kind, rng);
}
