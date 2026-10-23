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

// ── The lake (round 2 — the aquatic wing) ────────────────────
// One water body, in the south-west of the grounds: the Bay's
// terrain stays flat out to r≈62 (the rim lift starts there) and
// the south-west quadrant is the emptiest ground on the map —
// the tar pit holds the north-east, the walkers circuit the
// centre-north, Castle Transylvania and Dracula hold the far
// south rim. The bowl is CARVED by the ground builder (a smooth
// smoothstep dish, deepest at the centre) rather than found,
// and the swim drivers clamp against the same pure function,
// so bed and animals can never disagree. The water line sits
// BELOW grade (−0.55): the surface reads as a true shoreline
// against the pale shore band the ground paints, and a surfaced
// swimmer's back breaks it without ever beaching the body.
export const LAKE = Object.freeze({
  center: [-20, -42],
  radius: 18,
  depth: 4.6,
  waterY: -0.55,
});

// How deep the lake bed lies below grade at (x, z): 0 outside
// the radius, easing to the full depth across the inner 40% —
// a dish, not a cliff, so the shoreline is a walkable beach.
export function lakeBedDepthAt(x, z) {
  const d = Math.hypot(x - LAKE.center[0], z - LAKE.center[1]);
  if (d >= LAKE.radius) return 0;
  const s = Math.min(1, (LAKE.radius - d) / (LAKE.radius * 0.6));
  return LAKE.depth * (s * s * (3 - 2 * s));
}

// The bed's world height at (x, z) — grade is 0 inside the rim,
// so the bed height is simply the negated carve depth.
export function lakeBedYAt(x, z) {
  return -lakeBedDepthAt(x, z);
}

// Surfacing profile: 0 = cruising deep, 1 = fully surfaced.
// ph is the circuit phase in [0, 1); the animal spends `duty`
// of each period at the surface, easing up over the first
// quarter of that window and back down over the last quarter.
export function surfacePhase(ph, duty) {
  const p = ((ph % 1) + 1) % 1;
  if (p >= duty) return 0;
  const u = p / duty;
  const ease = (v) => v * v * v * (v * (v * 6 - 15) + 10);
  if (u < 0.25) return ease(u / 0.25);
  if (u > 0.75) return 1 - ease((u - 0.75) / 0.25);
  return 1;
}

// Per-species swim behaviour for the eight sea creatures. The
// circuit is a seeded ellipse around the lake centre (rx/rz in
// metres, speed in rad/s, dir = circuit direction); deep /
// shallow are the body's centre heights at the two ends of the
// surfacing profile; period/duty drive surfacePhase. drive
// 'undulate' = spine-wave swimmer (flippers steer, small);
// 'paddle' = the four-flippered plesiosaurs, whose flippers do
// the work and whose spine wave stays gentle.
export const SWIMMERS = Object.freeze({
  mosasaurus:    { rx: 10.5, rz: 8,   speed: 0.050, dir: 1,  deep: -2.6, shallow: -1.05, period: 40, duty: 0.45, drive: 'undulate', waveHz: 0.55, ampTail: 0.20, waveSpan: 2.6, paddleHz: 0.30, paddleAmp: 0.16 },
  tylosaurus:    { rx: 10,   rz: 7.5, speed: 0.055, dir: -1, deep: -2.5, shallow: -1.00, period: 44, duty: 0.42, drive: 'undulate', waveHz: 0.60, ampTail: 0.21, waveSpan: 2.8, paddleHz: 0.32, paddleAmp: 0.15 },
  megalodon:     { rx: 11,   rz: 8.5, speed: 0.038, dir: 1,  deep: -2.7, shallow: -1.15, period: 70, duty: 0.50, drive: 'undulate', waveHz: 0.40, ampTail: 0.18, waveSpan: 2.2, paddleHz: 0.22, paddleAmp: 0.12 },
  kronosaurus:   { rx: 9.5,  rz: 7.5, speed: 0.060, dir: -1, deep: -2.3, shallow: -1.20, period: 48, duty: 0.40, drive: 'paddle',   waveHz: 0.50, ampTail: 0.13, waveSpan: 2.2, paddleHz: 0.55, paddleAmp: 0.45 },
  liopleurodon:  { rx: 9,    rz: 7,   speed: 0.065, dir: 1,  deep: -2.0, shallow: -1.10, period: 50, duty: 0.38, drive: 'paddle',   waveHz: 0.55, ampTail: 0.13, waveSpan: 2.2, paddleHz: 0.60, paddleAmp: 0.45 },
  elasmosaurus:  { rx: 10,   rz: 8,   speed: 0.045, dir: -1, deep: -1.9, shallow: -0.95, period: 55, duty: 0.60, drive: 'undulate', waveHz: 0.45, ampTail: 0.12, waveSpan: 2.4, paddleHz: 0.40, paddleAmp: 0.35 },
  plesiosaurus:  { rx: 8.5,  rz: 6.5, speed: 0.050, dir: 1,  deep: -1.8, shallow: -0.95, period: 60, duty: 0.55, drive: 'paddle',   waveHz: 0.45, ampTail: 0.11, waveSpan: 2.0, paddleHz: 0.60, paddleAmp: 0.55 },
  ichthyosaurus: { rx: 8,    rz: 6,   speed: 0.090, dir: -1, deep: -2.4, shallow: -1.20, period: 26, duty: 0.30, drive: 'undulate', waveHz: 0.80, ampTail: 0.16, waveSpan: 2.6, paddleHz: 0.50, paddleAmp: 0.14 },
});

// ── The sky (round 3 — the aerial wing) ──────────────────────
// Per-species flight profiles for the Bay's nine flyers (the
// Pteranodon plus round 3's eight). The circuit is a circle —
// cx/cz centre, r radius, h cruise height, speed in rad/s, dir
// the circuit direction (the banking follows it); bob is the
// gentle height swell on the circuit. flapHz / flapAmp are the
// wingbeat while flapping; cycle / glideDuty shape the rhythm —
// every `cycle` seconds the flyer spends glideDuty of the time
// in a flat-winged glide, the Bay easing between the two on the
// same surfacePhase window the swimmers surface on. The giants
// ride high and slow with long glides; the little ones stay low
// and quick, barely gliding at all. Castle law: Castle
// Transylvania stands 40 m tall at the south rim (−24, −100) on
// a ~39 m footprint (half-diagonal ≈ 27 m) — every circuit here
// keeps its closest approach to the castle's centre beyond the
// walls, and the two skimmers circle the lake itself, far north
// of the castle. The Pteranodon's row is its round-1 circuit
// verbatim — same centre, radius, height and pace.
export const FLYERS = Object.freeze({
  pteranodon:      { cx: 0,   cz: -8,  r: 58,   h: 30,   speed: 0.055, dir: 1,  flapHz: 0.38, flapAmp: 0.22, cycle: 14,  glideDuty: 0.30, bob: 1.6 },
  quetzalcoatlus:  { cx: 10,  cz: -6,  r: 30,   h: 46,   speed: 0.070, dir: 1,  flapHz: 0.55, flapAmp: 0.30, cycle: 16,  glideDuty: 0.45, bob: 2.2 },
  hatzegopteryx:   { cx: -6,  cz: -2,  r: 34,   h: 42,   speed: 0.065, dir: -1, flapHz: 0.60, flapAmp: 0.30, cycle: 15,  glideDuty: 0.45, bob: 2.0 },
  tapejara:        { cx: 4,   cz: -14, r: 22,   h: 26,   speed: 0.110, dir: 1,  flapHz: 0.90, flapAmp: 0.34, cycle: 10,  glideDuty: 0.35, bob: 1.4 },
  nyctosaurus:     { cx: -14, cz: -10, r: 20,   h: 24,   speed: 0.130, dir: -1, flapHz: 1.00, flapAmp: 0.34, cycle: 9,   glideDuty: 0.35, bob: 1.3 },
  pterodactylus:   { cx: 2,   cz: -20, r: 15,   h: 17,   speed: 0.170, dir: 1,  flapHz: 1.30, flapAmp: 0.38, cycle: 7,   glideDuty: 0.30, bob: 1.1 },
  dimorphodon:     { cx: -20, cz: -42, r: 13,   h: 3.5,  speed: 0.220, dir: 1,  flapHz: 1.60, flapAmp: 0.42, cycle: 6,   glideDuty: 0.25, bob: 0.7 },
  rhamphorhynchus: { cx: -20, cz: -42, r: 15.5, h: 5,    speed: 0.190, dir: -1, flapHz: 1.50, flapAmp: 0.40, cycle: 6.5, glideDuty: 0.25, bob: 0.8 },
  archaeopteryx:   { cx: -6,  cz: 4,   r: 16,   h: 9,    speed: 0.160, dir: 1,  flapHz: 3.00, flapAmp: 0.50, cycle: 3.5, glideDuty: 0.12, bob: 0.9 },
});

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
