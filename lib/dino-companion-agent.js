// lib/dino-companion-agent.js
// THE COMPANION DINO AGENT (Merlin, 2026-11-26): agents operate
// companion dinos AND their body parts. The dino's hunt is an
// agent decision — PERCEIVE → DECIDE → ACT on the shared
// character-agent runner (lib/world/character-agent.js), the
// same brain as the Swamp Run alligators. The agent never kills
// and never writes damage itself: it reports a dinoHit event
// and the realm engine applies it (damageOrc / damageBoss) and
// awards the XP. The dino's mode/timers live on its entity, as
// the house rule demands.
//
// ROLLOUT PLACE: companion dinos sit right after the land-dino
// graze step in the shared rollout (see AGENT_ROLLOUT in
// lib/world/character-agent.js) — they ARE raised land dinos,
// tamed, hunting beside their owner instead of grazing.
//
// MODES: heel (at the owner's heel) | chase (closing on the
// target) | attack (in range, throwing the agent's pick of
// bite / tail / stomp / charge) | return (past the 30 m leash,
// hurrying back — the hunt never strands the dino).
//
// BODY PARTS — the honest rig facts (read off the GLBs):
// the Tripo rigs carry NO jaw bone and NO tail bone, in either
// the Mixamo baby rig (mixamorig:Head/Neck, no jaw, no tail)
// or the adult rigs (Head/NeckTwist, Spine, Pelvis — no jaw,
// no tail). The tail mesh is skinned to the hips/spine, the
// head IS the jaw on these rigs. So the agent drives:
//   bite       -> head + neck pitch (the whole head lunges —
//                 the jaw on this rig) + a spine dip.
//   tail swipe -> hips/pelvis + spine yaw (the tail hangs off
//                 those bones, so swinging them swings it).
//   stomp      -> leg bones (upleg/thigh down to foot/toe),
//                 alternating sides.
//   charge     -> legs in a run cycle + spine pitched forward.
// If a future rig ships a real jaw/tail bone (a name holding
// 'jaw', 'mandible', 'chin', 'tail'), classifyDinoBones picks
// it up and the bite/tail poses drive it directly — the pose
// code already prefers the real bone when one exists.

import {
  createCharacterAgent,
  headingTo,
  turnToward,
  moveForward,
} from './world/character-agent.js';
import {
  ALLY_FOLLOW_RANGE_M,
  ALLY_IDLE_RANGE_M,
  ALLY_MAX_RANGE_M,
} from './earth2/breeding.js';
import { statsForLevel, pickAttack, ATTACK_RANGE } from './dino-xp.js';

/** How long one attack pose plays (seconds). */
export const ATTACK_ANIM_S = 0.5;

/** Charge speed: a flat burst, faster than any chase. */
export const CHARGE_SPEED = 9;

function normBone(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Sort a skeleton's bone names into the parts the agent drives.
 * Returns { jaw, head, neck, spine, hips, legs, arms } — arrays
 * of bone names as given. Works on both rigs in the repo: the
 * Mixamo baby rig (mixamorig:LeftUpLeg…) and the adult Tripo
 * rigs (L_Thigh…, tripo::0_Left_Limb_…).
 */
export function classifyDinoBones(boneNames) {
  const out = { jaw: [], head: [], neck: [], spine: [], hips: [], legs: [], arms: [] };
  for (const raw of boneNames || []) {
    const n = normBone(raw);
    if (!n) continue;
    if (n.includes('jaw') || n.includes('mandible') || n.includes('chin')) { out.jaw.push(raw); continue; }
    if (n.includes('tail')) { out.spine.push(raw); continue; }
    if (n.includes('head') || n.includes('skull') || n.includes('facialbone') || n.includes('eye')) {
      if (n.includes('eye')) continue;
      out.head.push(raw); continue;
    }
    if (n.includes('neck')) { out.neck.push(raw); continue; }
    if (n.includes('spine') || n.includes('waist')) { out.spine.push(raw); continue; }
    if (n.includes('hips') || n.includes('pelvis') || n.includes('hip')) { out.hips.push(raw); continue; }
    if (n.includes('thigh') || n.includes('calf') || n.includes('upleg') || n.includes('leg')
      || n.includes('foot') || n.includes('toe') || n.includes('knee') || n.includes('limb')
      || n.includes('shin') || n.includes('ankle')) { out.legs.push(raw); continue; }
    if (n.includes('shoulder') || n.includes('upperarm') || n.includes('forearm')
      || n.includes('arm') || n.includes('hand') || n.includes('clavicle') || n.includes('elbow')) {
      out.arms.push(raw); continue;
    }
  }
  return out;
}

/**
 * Rotation deltas (radians) for one attack at a phase 0..1 —
 * wind-up, strike, settle. Keys are the bone groups from
 * classifyDinoBones; the scene adds them to each bone's base
 * rotation, so the bind pose is never overwritten.
 *   bite: head pitches down hard (jaw), neck follows, spine dips.
 *   tail: hips + spine yaw in a sweep (the tail rides them).
 *   stomp: legs lift then slam (alternating sides by phase).
 *   charge: legs run, spine leans into it.
 */
export function attackPoseFor(kind, phase) {
  const p = Math.max(0, Math.min(1, Number(phase) || 0));
  const strike = Math.sin(p * Math.PI); // 0 -> 1 -> 0 across the pose
  const windup = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
  if (kind === 'bite') {
    return {
      jaw: { x: -0.55 * strike || 0, y: 0, z: 0 },
      head: { x: 0.5 * strike, y: 0, z: 0 },
      neck: { x: 0.3 * strike, y: 0, z: 0 },
      spine: { x: 0.12 * strike, y: 0, z: 0 },
      hips: { x: 0, y: 0, z: 0 },
      legs: { x: 0, y: 0, z: 0 },
    };
  }
  if (kind === 'tail') {
    // One sweep across the pose: hips and spine yaw together,
    // carrying the tail (skinned to them) through the crowd.
    const sweep = 0.7 * Math.sin(p * Math.PI);
    return {
      jaw: { x: 0, y: 0, z: 0 },
      head: { x: 0, y: 0.2 * strike, z: 0 },
      neck: { x: 0, y: 0.15 * strike, z: 0 },
      spine: { x: 0, y: sweep, z: 0 },
      hips: { x: 0, y: sweep * 0.8, z: 0 },
      legs: { x: 0, y: 0, z: 0 },
    };
  }
  if (kind === 'stomp') {
    const lift = windup * 0.5;
    return {
      jaw: { x: 0, y: 0, z: 0 },
      head: { x: 0.1 * strike, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      spine: { x: 0.08 * strike, y: 0, z: 0 },
      hips: { x: 0, y: 0, z: 0 },
      legs: { x: -lift + 0.15 * strike, y: 0, z: 0 },
    };
  }
  if (kind === 'charge') {
    const run = Math.sin(p * Math.PI * 2) * 0.55;
    return {
      jaw: { x: 0, y: 0, z: 0 },
      head: { x: -0.08 * strike || 0, y: 0, z: 0 },
      neck: { x: -0.05 * strike || 0, y: 0, z: 0 },
      spine: { x: 0.22 * strike, y: 0, z: 0 },
      hips: { x: 0, y: 0, z: 0 },
      legs: { x: run, y: 0, z: 0 },
    };
  }
  return {
    jaw: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0, z: 0 },
    neck: { x: 0, y: 0, z: 0 }, spine: { x: 0, y: 0, z: 0 },
    hips: { x: 0, y: 0, z: 0 }, legs: { x: 0, y: 0, z: 0 },
  };
}

// ── Target picking (pure) ──────────────────────────────────────

/** A hostile the agent may engage: alive, not an ally, not the owner. */
export function isEngageable(h, ownerId, dinoId) {
  if (!h) return false;
  if (h.alive === false || h.state === 'dead') return false;
  if (h.id === ownerId || h.id === dinoId) return false;
  if (h.isAlly) return false;
  return typeof h.x === 'number' && typeof h.z === 'number';
}

/**
 * The dino's target, in priority order (the breeding law's
 * allyAttackTarget, widened by savagery): the owner's target,
 * then whatever just hurt the owner, then — for opportunistic
 * and savage dinos — the nearest hostile inside chase range.
 * Defensive dinos never pick the third. Returns the hostile
 * record or null.
 */
export function pickCompanionTarget({ ownerTarget, attacker, hostiles, ownerId, dinoId, aggression, chaseRange, dx, dz }) {
  if (isEngageable(ownerTarget, ownerId, dinoId)) return ownerTarget;
  if (isEngageable(attacker, ownerId, dinoId)) return attacker;
  if (aggression === 'defensive') return null;
  let best = null;
  let bestD = Infinity;
  for (const h of hostiles || []) {
    if (!isEngageable(h, ownerId, dinoId)) continue;
    const d = Math.hypot(h.x - dx, h.z - dz);
    if (d <= chaseRange && d < bestD) { best = h; bestD = d; }
  }
  return best;
}

// ── The mode machine (pure: observations + dt in, plan out) ────

/**
 * obs: { mode, x, z, heading, ownerX, ownerZ, ownerDist,
 *        target, targetDist, nearby, attackT, level, stage,
 *        diet, posture } — the perceive() snapshot.
 * Returns { move, speed, turnTo, turnRate, mode, attack,
 *           attackT, events[] } — attack is the kind thrown
 * this tick (or null); events carry 'dinoHit' for the engine.
 */
export function decideCompanionAction(obs, dt) {
  const stats = statsForLevel(obs.level, obs.stage);
  const attackT = Math.max(0, (obs.attackT || 0) - dt);
  const base = { move: false, speed: stats.moveSpeed, mode: obs.mode || 'heel', attack: null, attackT, events: [] };

  // Past the leash: the hunt is over, hurry home to the owner.
  if (obs.ownerDist > ALLY_MAX_RANGE_M) {
    return {
      ...base, move: true, speed: CHARGE_SPEED, mode: 'return',
      turnTo: headingTo(obs.x, obs.z, obs.ownerX, obs.ownerZ), turnRate: 3.5,
    };
  }
  if (obs.mode === 'return') {
    if (obs.ownerDist <= ALLY_FOLLOW_RANGE_M) return { ...base, mode: 'heel' };
    return {
      ...base, move: true, speed: CHARGE_SPEED, mode: 'return',
      turnTo: headingTo(obs.x, obs.z, obs.ownerX, obs.ownerZ), turnRate: 3.5,
    };
  }

  const target = obs.target || null;
  if (!target) {
    // No fight: heel — trot to the owner past 8 m, idle within 3 m.
    if (obs.ownerDist > ALLY_FOLLOW_RANGE_M) {
      return {
        ...base, move: true, speed: 5, mode: 'heel',
        turnTo: headingTo(obs.x, obs.z, obs.ownerX, obs.ownerZ), turnRate: 3.5,
      };
    }
    if (obs.ownerDist < ALLY_IDLE_RANGE_M) return { ...base, mode: 'heel' };
    return {
      ...base, move: true, speed: 5, mode: 'heel',
      turnTo: headingTo(obs.x, obs.z, obs.ownerX, obs.ownerZ), turnRate: 3.5,
    };
  }

  // A target: close, then throw the agent's pick of attack.
  // The target may sit as far as chaseRange out — the dino
  // closes at hunt speed, charges the last 8 m, then strikes.
  const d = obs.targetDist;
  if (d > stats.chaseRange) return { ...base, mode: 'heel' };
  if (d > ATTACK_RANGE.charge) {
    return {
      ...base, move: true, speed: stats.moveSpeed, mode: 'chase',
      turnTo: headingTo(obs.x, obs.z, target.x, target.z), turnRate: 3.5,
    };
  }
  const attack = pickAttack({ diet: obs.diet, posture: obs.posture, dist: d, nearby: obs.nearby });
  if (!attack) return { ...base, mode: 'heel' }; // no attack fits — hold heel
  if (attack === 'charge') {
    return {
      ...base, move: true, speed: CHARGE_SPEED, mode: 'chase', attack: 'charge',
      turnTo: headingTo(obs.x, obs.z, target.x, target.z), turnRate: 3.5,
    };
  }
  // In range: face the target; strike when the cooldown is spent.
  // (pickAttack only returns a melee attack inside its range —
  // anything further out already came back as 'charge' above.)
  const facing = {
    ...base, move: false, mode: 'attack',
    turnTo: headingTo(obs.x, obs.z, target.x, target.z), turnRate: 6,
  };
  if (attackT > 0) return facing;
  return {
    ...facing,
    attack,
    attackT: stats.cooldown,
    events: [{
      type: 'dinoHit', target, attack, dmg: stats.damage,
    }],
  };
}

// ── The agent (shared runner) ──────────────────────────────────

/**
 * Build the companion's agent. ctx shape the realm passes per tick:
 *   { dino, owner: { x, z }, ownerId, ownerTarget, attacker,
 *     hostiles: [{ id, x, z, alive/state, kind, isAlly }] }
 * dino is the entity (its mode/timers live on it): { x, z,
 * heading, speed, mode, attackT, targetId, level, stage,
 * diet, posture }. The agent moves the entity with the shared
 * steering and reports dinoHit events; the realm applies them.
 */
export function createCompanionAgent({ dinoId, species }) {
  return createCharacterAgent({
    id: dinoId || 'companion-dino',
    kind: `companion-dino:${species || 'dinosaur'}`,
    fallback: { move: true, mode: 'heel', events: [] },
    perceive(ctx) {
      const d = ctx.dino;
      const stats = statsForLevel(d.level, d.stage);
      const ownerDist = Math.hypot(d.x - ctx.owner.x, d.z - ctx.owner.z);
      const target = pickCompanionTarget({
        ownerTarget: ctx.ownerTarget,
        attacker: ctx.attacker,
        hostiles: ctx.hostiles || [],
        ownerId: ctx.ownerId,
        dinoId,
        aggression: stats.aggression,
        chaseRange: stats.chaseRange,
        dx: d.x, dz: d.z,
      });
      let nearby = 0;
      for (const h of ctx.hostiles || []) {
        if (isEngageable(h, ctx.ownerId, dinoId)
          && Math.hypot(h.x - d.x, h.z - d.z) <= ATTACK_RANGE.tail) nearby += 1;
      }
      return {
        mode: d.mode || 'heel',
        x: d.x, z: d.z, heading: d.heading || 0,
        ownerX: ctx.owner.x, ownerZ: ctx.owner.z, ownerDist,
        target,
        targetDist: target ? Math.hypot(target.x - d.x, target.z - d.z) : Infinity,
        nearby,
        attackT: d.attackT || 0,
        level: d.level || 1,
        stage: d.stage || 'adult',
        diet: d.diet || 'carnivore',
        posture: d.posture || 'biped',
      };
    },
    decide: (obs, dt) => decideCompanionAction(obs, dt),
    act(ctx, action, dt) {
      const d = ctx.dino;
      if (action.turnTo != null) turnToward(d, action.turnTo, action.turnRate || 3.5, dt);
      if (action.move) {
        d.speed = action.speed || 5;
        moveForward(d, dt);
      }
      if (action.mode != null) d.mode = action.mode;
      if (action.attackT != null) d.attackT = action.attackT;
      if (action.attack) {
        d.attackKind = action.attack;
        d.attackAnimT = ATTACK_ANIM_S;
      }
      return (action.events || []).map((ev) => ({ ...ev, dinoId }));
    },
  });
}
