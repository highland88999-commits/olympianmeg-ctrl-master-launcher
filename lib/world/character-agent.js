// lib/world/character-agent.js
// CHARACTER AGENTS — the shared movement brain every world's creatures plug into.
// (Merlin, Nov 18 ~23:23: agents run all character movement. Pilot: Swamp Run alligators.)
//
// Shape: PERCEIVE → DECIDE → ACT. The agent owns perception + decisions; the
// calling engine owns integration, collisions and kills — an agent never
// writes state.status or kills anything itself, it reports events and the
// engine applies them. Pure, headless-testable, no DOM, no three.js.
//
//   createCharacterAgent({ id, kind, perceive, decide, act, fallback })
//     perceive(ctx) -> observations (read-only snapshot; must not mutate ctx)
//     decide(obs, dt) -> action (plain object — the tick plan)
//     act(ctx, action, dt) -> events[] (the caller applies them)
//     fallback -> action used when perceive/decide throws (the game never freezes)
//   agent.step(ctx, dt) -> events[] — one guarded tick.
// The entity record IS the agent's memory (its mode/timers live on the
// entity, exactly as the old hand-rolled steppers kept them) — so existing
// state shapes and tests do not change when a creature converts.
//
// Steering primitives (ONE implementation, shared by every world):
//   headingTo(x1, z1, x2, z2) — bearing from A to B
//   turnToward(entity, targetHeading, rate, dt) — rate-capped turn
//   moveForward(entity, dt) — x += sin(heading) * speed * dt

export function headingTo(x1, z1, x2, z2) {
  return Math.atan2(x2 - x1, z2 - z1);
}

export function turnToward(entity, targetHeading, rate, dt) {
  let diff = targetHeading - entity.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = rate * dt;
  entity.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
}

export function moveForward(entity, dt) {
  entity.x = entity.x + Math.sin(entity.heading) * entity.speed * dt;
  entity.z = entity.z + Math.cos(entity.heading) * entity.speed * dt;
}

export function createCharacterAgent({ id, kind, perceive, decide, act, fallback = { move: false } }) {
  return {
    id,
    kind,
    step(ctx, dt) {
      let action;
      try {
        const obs = perceive(ctx);
        action = decide(obs, dt);
      } catch (err) {
        // The brain failed — fall back, never freeze the game.
        action = fallback;
      }
      try {
        return act(ctx, action, dt) || [];
      } catch (err) {
        return [];
      }
    },
  };
}

// ── The agent rollout (Merlin, Nov 18) ─────────────────────────
// The order creatures convert onto this shared brain. Companion
// dinos sit right after the land-dino graze step — they ARE
// raised land dinos, tamed, hunting beside their owner instead
// of grazing (lib/dino-companion-agent.js, live Nov 26).
export const AGENT_ROLLOUT = [
  'swamp-run-alligators', // pilot — LIVE Nov 19
  'hollow-earth-monsters',
  'earth2-predators-guardian',
  'land-dino-graze',
  'companion-dinos', // raised dinos hunt beside the owner — LIVE Nov 26
  'marine-circuits',
  'jupiter2-steering',
  'vecna-and-swarms',
  'earth1-rivals',
  'middle-earth-npcs',
  'afterlife-humanoids',
];
