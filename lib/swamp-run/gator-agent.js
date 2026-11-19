// lib/swamp-run/gator-agent.js
// THE SWAMP RUN ALLIGATOR AGENT (Merlin, Nov 18 ~23:23 — agents run character
// movement; the alligators are the pilot).
//
// The alligator is an AMBUSH predator — the crocodile's opposite. It lurks
// motionless near the banks, all but invisible. Drift within burst range and
// it EXPLODES: a short sprint faster than your paddle. Survive 6 seconds and
// it tires, sinks back, and resettles to lurk again somewhere new.
//
// Same numbers, same feel as the old hand-rolled stepGator — the agent just
// owns the decisions now. TUNING is passed in (the engine owns TUNING), and
// the mode machine still lives on state.gator (mode / burstTimer / restTimer
// / growlTimer), so the state shape and the existing tests do not change.
// The agent never kills: a catch is reported as an event and the engine's
// killPlayer stays the single death path.

import { dist, isWater } from './world.js';
import { createCharacterAgent, headingTo, turnToward, moveForward } from '../world/character-agent.js';

/**
 * The gator's mode machine, as a pure function: observations + dt in,
 * tick plan out. Unit-testable without a game state.
 *
 * obs: { dead, grace, d, mode, growlTimer, burstTimer, restTimer,
 *        gx, gz, px, pz } — the perceive() snapshot (distances in metres,
 *        timers in seconds, positions in world metres).
 * Returns: { move, speed, turnTo, turnRate, mode, growlTimer, burstTimer,
 *            restTimer, resettle, events[] } — events are 'gatorGrowl' /
 *            'gatorBurst' / 'gatorTired' / 'catch'.
 */
export function decideGatorAction(obs, dt, tuning) {
  if (obs.dead) return { move: false, events: [] };

  if (obs.mode === 'lurk') {
    // Barely drifts. If you're close enough to see it, you're too close.
    const growlTimer = obs.growlTimer - dt;
    const action = {
      move: true,
      speed: tuning.gatorLurkSpeed,
      mode: 'lurk',
      growlTimer,
      events: [],
    };
    if (obs.d < 18 && growlTimer <= 0) {
      action.growlTimer = 9;
      action.events.push('gatorGrowl');
    }
    if (obs.d < tuning.gatorBurstRange && !obs.grace) {
      action.mode = 'burst';
      action.burstTimer = tuning.gatorGiveUpSeconds;
      action.events.push('gatorBurst');
    }
    return action;
  }

  if (obs.mode === 'burst') {
    // Straight at you, no turning finesse — pure lunge.
    const burstTimer = obs.burstTimer - dt;
    const action = {
      move: true,
      speed: tuning.gatorBurstSpeed,
      mode: 'burst',
      turnTo: headingTo(obs.gx, obs.gz, obs.px, obs.pz),
      turnRate: 2.6,
      burstTimer,
      events: [],
    };
    if (obs.d < tuning.gatorCatchBody && !obs.grace) {
      action.events.push('catch');
    } else if (burstTimer <= 0) {
      action.mode = 'rest';
      action.restTimer = 5;
      action.events.push('gatorTired');
    }
    return action;
  }

  if (obs.mode === 'rest') {
    // Blown its burst. Sinks low, drifts, then picks a new lurk spot
    // near a bank — never far from where the player might wander.
    const restTimer = obs.restTimer - dt;
    const action = {
      move: true,
      speed: 0.6,
      mode: 'rest',
      restTimer,
      events: [],
    };
    if (restTimer <= 0) {
      action.mode = 'lurk';
      action.growlTimer = 6;
      action.resettle = true;
    }
    return action;
  }

  // Unknown mode: hold still, do no harm.
  return { move: false, events: [] };
}

/** A new ambush spot: shallow water near a bank, safely away from the player. */
export function pickLurkSpot(state) {
  const p = state.player;
  const g = state.gator;
  // Try spots ringing the player at 40–90m; take the first in water
  // AND at least 30m from the player — never resettle on top of them.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + state.seed;
    const r = 40 + ((i * 37) % 50);
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    if (dist(x, z, p.x, p.z) < 30) continue;
    if (isWater(state.seed, x, z)) return { x, z };
  }
  // No good water found: stay where you are, don't teleport onto the player.
  return { x: g.x, z: g.z };
}

export function createGatorAgent(tuning) {
  return createCharacterAgent({
    id: 'swamp-gator',
    kind: 'ambush-predator',
    // Fallback when the brain fails: drift at lurk speed, never freeze.
    fallback: { move: true, speed: tuning.gatorLurkSpeed, mode: 'lurk', events: [] },
    perceive(state) {
      const g = state.gator;
      const p = state.player;
      return {
        dead: state.status === 'dead',
        grace: state.graceTimer !== null,
        d: dist(g.x, g.z, p.x, p.z),
        mode: g.mode,
        growlTimer: g.growlTimer,
        burstTimer: g.burstTimer,
        restTimer: g.restTimer,
        gx: g.x,
        gz: g.z,
        px: p.x,
        pz: p.z,
      };
    },
    decide: (obs, dt) => decideGatorAction(obs, dt, tuning),
    act(state, action, dt) {
      const g = state.gator;
      if (!action.move) return [];
      // Pick the new lurk spot BEFORE mutating anything, so a failure
      // here cannot leave the gator half-moved.
      const spot = action.resettle ? pickLurkSpot(state) : null;
      if (action.turnTo != null) turnToward(g, action.turnTo, action.turnRate ?? 2.6, dt);
      g.speed = action.speed;
      moveForward(g, dt);
      if (action.mode != null) g.mode = action.mode;
      if (action.growlTimer != null) g.growlTimer = action.growlTimer;
      if (action.burstTimer != null) g.burstTimer = action.burstTimer;
      if (action.restTimer != null) g.restTimer = action.restTimer;
      if (spot) {
        g.x = spot.x;
        g.z = spot.z;
      }
      return (action.events || []).map((type) => ({ type }));
    },
  });
}
