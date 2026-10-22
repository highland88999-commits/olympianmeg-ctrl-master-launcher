// lib/earth2/creatures.js
// EARTH 2 — CREATURE SYSTEMS: the compy swarm, the giant mosquitos,
// Dracula and his bats (Merlin, 2026-10-22).
//
// Pure configuration + the two small state machines the Bay driver
// runs on: the mosquito feeding cycle (only a mosquito that has
// drunk drops a blood sac when shot) and Dracula's transformation
// (count → smoke → bat → circuit → return → smoke → count — his
// at-will signature). Positions and rendering live in
// components/earth2/DinosaurBay.jsx; everything here is arithmetic,
// so the rules are unit-testable without a scene.

// ── The compy swarm ─────────────────────────────────────────────
// "Copies" — compies: little tiny meat eaters (Compsognathus) that
// swarm. No new model: clones of the foundry compsognathus at tiny
// scale, driven at higher tempo than the Bay's lone compy.
export const COMPY_SWARM = {
  count: 12,
  bodyLengthM: 0.4,
  sourceSlug: 'compsognathus',
  center: [4, 21], // the west-meadow edge, near the lone compy's spot
  radius: 9, // waypoints scatter within this of the center
  baseSpeed: 2.6, // m/s scurry
  tempo: 1.9, // breath/look/tail rate multiplier vs the big animals
  scatterRadius: 8, // a walker dinosaur this close startles them
  scatterSeconds: 1.4,
  scatterSpeedMultiplier: 2.2,
};

// ── Giant mosquitos & blood sacs ────────────────────────────────
// They feed on the dinosaurs: one picks a dinosaur, latches on and
// drinks for FEED_SECONDS while its abdomen swells and reddens —
// the tell. Shoot a mosquito that is feeding or full and it drops
// a blood sac; shoot one that hasn't drunk and it drops nothing.
export const MOSQUITO_CONFIG = {
  count: 6,
  bodyLengthM: 1.2,
  feedSeconds: 8,
  cruiseHeight: 7.5,
  cruiseSpeed: 1.05, // rad/s around its circuit — stately for its size
  seekSpeed: 6, // m/s when it dives for a dinosaur
  fullSpeedFactor: 0.55, // a full mosquito drifts, heavy with blood
  respawnSeconds: 6,
  firstFeedDelay: [5, 14], // seconds after spawn before the first dive
  refuelDelay: [16, 30], // a fed mosquito cruises a while before diving again
};

export const MOSQUITO_PHASES = ['cruising', 'seeking', 'feeding', 'full', 'falling', 'gone'];

/** The blood-sac rule: only a mosquito carrying dinosaur blood —
 *  latched and feeding, or full — drops a sac when shot. */
export function mosquitoDropsSac(phase) {
  return phase === 'feeding' || phase === 'full';
}

/** Abdomen swell/redden progress for a phase: 0 (empty) to 1 (full). */
export function mosquitoFullness(phase, feedElapsed, feedSeconds = MOSQUITO_CONFIG.feedSeconds) {
  if (phase === 'feeding') {
    const f = Number(feedElapsed) / Math.max(0.001, feedSeconds);
    return Math.max(0, Math.min(1, f));
  }
  if (phase === 'full' || phase === 'falling') return 1;
  return 0;
}

// ── The bat swarm at the castle ────────────────────────────────
// The orbits ring the castle OUTSIDE its walls: the real castle
// stands 40 m tall on a ~38×39 m footprint (half-diagonal ≈ 27 m),
// and nothing in the Bay passes through a large structure — so
// the circuits sit beyond the corners, at tower height.
export const BAT_SWARM = {
  count: 18,
  sourceSlug: 'vampire-bat',
  radius: [29, 39], // lazy circuit radii around the castle, clear of its corners
  height: [14, 30],
  speed: [0.25, 0.5], // rad/s
};

// ── Dracula's transformation ───────────────────────────────────
// His signature, at will: count → smoke → bat → circuit → return →
// smoke → count. He transforms on a slow idle cycle, and instantly
// when greeted (a visitor clicks him or opens his exchange — he
// greets visitors by transforming). While he is transformed, the
// bat swarm scatters; it regroups as he returns.
export const DRACULA_TIMINGS = {
  idleSeconds: 45, // in count form this long before he takes the air unprompted
  smokeSeconds: 0.9,
  batSeconds: 7, // the fast circuit around the castle rim
  returnSeconds: 1.4,
};

export const DRACULA_PHASES = ['count', 'smoke-out', 'bat', 'return', 'smoke-in'];

export function createDraculaMachine() {
  return { phase: 'count', t: 0, idle: 0, scatter: 0 };
}

/**
 * Advance the transformation. Pure: (machine, dtSeconds, event) →
 * new machine. event is 'greet' (a visitor summons him) or null.
 * `t` is time in the current phase; `scatter` is the bat swarm's
 * alarm, 1 at the moment of transformation, decaying back to 0.
 */
export function stepDracula(machine, dt, event) {
  const m = machine && typeof machine === 'object' ? machine : createDraculaMachine();
  const step = Math.max(0, Number(dt) || 0);
  const next = {
    phase: DRACULA_PHASES.includes(m.phase) ? m.phase : 'count',
    t: (Number(m.t) || 0) + step,
    idle: Number(m.idle) || 0,
    scatter: Math.max(0, (Number(m.scatter) || 0) - step * 0.3),
  };
  switch (next.phase) {
    case 'count': {
      next.idle += step;
      if (event === 'greet' || next.idle >= DRACULA_TIMINGS.idleSeconds) {
        next.phase = 'smoke-out';
        next.t = 0;
        next.idle = 0;
        next.scatter = 1;
      }
      break;
    }
    case 'smoke-out':
      if (next.t >= DRACULA_TIMINGS.smokeSeconds) { next.phase = 'bat'; next.t = 0; }
      break;
    case 'bat':
      if (next.t >= DRACULA_TIMINGS.batSeconds) { next.phase = 'return'; next.t = 0; }
      break;
    case 'return':
      if (next.t >= DRACULA_TIMINGS.returnSeconds) {
        next.phase = 'smoke-in';
        next.t = 0;
        next.scatter = 1;
      }
      break;
    case 'smoke-in':
      if (next.t >= DRACULA_TIMINGS.smokeSeconds) {
        next.phase = 'count';
        next.t = 0;
        next.idle = 0;
      }
      break;
    default:
      break;
  }
  return next;
}

/** Is Dracula in count form (visible as the Count) in this phase? */
export function draculaIsCount(phase) {
  return phase === 'count' || phase === 'smoke-in';
}

/** Is Dracula in bat form (visible as the bat) in this phase? */
export function draculaIsBat(phase) {
  return phase === 'bat' || phase === 'return';
}
