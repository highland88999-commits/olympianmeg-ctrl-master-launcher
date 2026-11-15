// lib/luge/obstacles.js
// Graphic-wrapped obstacles on the Luge track + the hit-penalty rules.
//
// Pure, no THREE, no DOM — fully headless-testable. The page component
// (app/luge/page.tsx) owns all rendering and applies these.
//
// OBSTACLES
//   "Graphic wrapped" = illustrated/procedural-wrapped, menu-dressing
//   style: drawn art wrapped on the obstacle, never a plain grey shape.
//   Three types, one per third of the track, rotated per course so each
//   course reads differently:
//     - barrel    striped warning barrel (amber/black hazard chevrons)
//     - boulder   ice boulder with a painted cyan rune face
//     - branches  pine-branch barrier, snow-dusted green needles
//   The wrap textures are procedural CanvasTextures built in
//   lib/luge/cgi.js (same CGI method as the Earth 4 v2 pass: seeded
//   PRNG + procedural colour/bump/roughness, no Tripo, no paid assets).
//
// PLACEMENT (fairness is the whole point)
//   - Seeded per course (seededRandom from lib/luge/track.js): the same
//     course lays out the same obstacles every run, so runs are fair and
//     a rider can learn the line.
//   - Count scales with length: 4 on the shortest course, 9 on the
//     longest (4 + round((length - 900) / 1200), clamped 4..9).
//   - Obstacles sit in evenly spaced slots across progress 0.08..0.92
//     (never on the start gate or the finish line), jittered ±0.02 by
//     seed, so neighbours stay >= ~0.05 progress apart (~45 m even on
//     the shortest course) — always time to steer between them.
//   - A CLEAN LINE ALWAYS EXISTS: each obstacle blocks an angular arc
//     of at most 2 * 0.85 rad around the tube, so >= ~262° of the tube
//     circumference is always free at every obstacle. Nothing ever
//     forms an unavoidable wall; a rider who steers always gets through.
//
// COLLISION = LOSS OF TIME, never a crash, never a run end.
//   - +2 s added to the run time per hit (HIT_TIME_PENALTY_MS).
//   - Speed cut on impact: ~1 s at 45% of top speed (HIT_SLOW_FACTOR
//     for HIT_SLOW_DURATION_S).
//   - Per-obstacle immunity (HIT_IMMUNITY_S = 1.5 s): one obstacle
//     cannot multi-hit while the sled passes through it.
//   - Per-run hit cap (MAX_HITS_PER_RUN = 10): hits past the cap are
//     not counted and carry no penalty — a bad run stays recoverable
//     instead of spiralling. The cap is high enough that no clean-ish
//     run ever touches it (longest course has 9 obstacles).
//   - The penalty is added to the run time BEFORE recording, so the
//     leaderboard time and the course-completion time both carry it.
//     It only ever makes a run slower, so the server anti-cheat floor
//     (lib/luge/logic.js minRunMs) stays valid.
import { seededRandom, wrapAngle } from './track.js';

/** The three graphic-wrapped obstacle types. */
export const OBSTACLE_TYPES = ['barrel', 'boulder', 'branches'];

/** Seconds added to the run time per hit (my call). */
export const HIT_TIME_PENALTY_S = 2;
/** Milliseconds added to the run time per hit. */
export const HIT_TIME_PENALTY_MS = HIT_TIME_PENALTY_S * 1000;
/** Speed multiplier while the impact slow is active (my call: 45%). */
export const HIT_SLOW_FACTOR = 0.45;
/** How long the impact speed cut lasts, in seconds (my call: ~1 s). */
export const HIT_SLOW_DURATION_S = 1.0;
/** Per-obstacle immunity after a hit, in seconds (my call: 1.5 s). */
export const HIT_IMMUNITY_S = 1.5;
/** Per-run cap on counted/penalised hits (my call: 10). */
export const MAX_HITS_PER_RUN = 10;
/** Along-track half-depth of an obstacle's hit volume, in metres. */
export const OBSTACLE_HALF_DEPTH_M = 3;

/** Angular half-width (radians) each type blocks around the tube. */
export const OBSTACLE_HALF_WIDTH = {
  barrel: 0.55,
  boulder: 0.85,
  branches: 0.7,
};

/** Visual radius (metres) each type renders at. */
export const OBSTACLE_RADIUS = {
  barrel: 1.6,
  boulder: 2.2,
  branches: 1.9,
};

/** How many obstacles a course gets. Scales with length, clamped 4..9. */
export function obstacleCount(course) {
  const n = 4 + Math.round(((course.length || 900) - 900) / 1200);
  return Math.max(4, Math.min(9, n));
}

/**
 * Deterministic obstacle layout for a course. Returns an array of
 * { id, progress, angle, type, halfWidth, radius } sorted by progress.
 * Same course => same layout every run (seededRandom on course.id).
 */
export function generateObstacles(course) {
  const count = obstacleCount(course);
  const rand = seededRandom(course.id * 524287 + 101);
  const obstacles = [];
  for (let i = 0; i < count; i++) {
    // Even slot across 0.08..0.92, jittered inside the slot so neighbours
    // can never collide (slot width >= 0.093 progress, jitter ±0.02).
    const slotCenter = 0.08 + ((i + 0.5) / count) * 0.84;
    const progress = Math.min(0.92, Math.max(0.08, slotCenter + (rand() - 0.5) * 0.04));
    // One type per third of the track, rotated by course so each course
    // wears its looks in a different order.
    const section = progress < 0.38 ? 0 : progress < 0.7 ? 1 : 2;
    const type = OBSTACLE_TYPES[(section + course.id) % OBSTACLE_TYPES.length];
    obstacles.push({
      id: `ob-${course.id}-${i}`,
      progress,
      angle: (rand() * 2 - 1) * Math.PI,
      type,
      halfWidth: OBSTACLE_HALF_WIDTH[type],
      radius: OBSTACLE_RADIUS[type],
    });
  }
  obstacles.sort((a, b) => a.progress - b.progress);
  return obstacles;
}

/**
 * Free arc (radians) left open at an obstacle — the clean line. Always
 * >= 2*PI - 2*0.85 ≈ 4.58 rad (~262°) by construction.
 */
export function freeArcAt(obstacle) {
  return Math.PI * 2 - 2 * (obstacle.halfWidth || 0);
}

/** True when the sled's tube angle is inside the obstacle's blocked arc. */
export function angularOverlap(obstacle, tubeAngle) {
  return Math.abs(wrapAngle(obstacle.angle - tubeAngle)) < obstacle.halfWidth;
}

/**
 * Obstacles the sled passed through between prevProgress and progress
 * (segment test, so a fast frame can never tunnel through an obstacle).
 * Returns the overlapping obstacles in track order. Angular position is
 * the sled's current tube angle.
 */
export function obstaclesHitBetween(obstacles, prevProgress, progress, tubeAngle, courseLength) {
  const half = OBSTACLE_HALF_DEPTH_M / (courseLength || 900);
  const lo = Math.min(prevProgress, progress);
  const hi = Math.max(prevProgress, progress);
  return (obstacles || []).filter(
    (o) =>
      o.progress + half >= lo &&
      o.progress - half <= hi &&
      angularOverlap(o, tubeAngle)
  );
}

/** Milliseconds of time penalty for a hit count (capped at the run cap). */
export function hitPenaltyMs(count) {
  const n = Math.floor(Number(count) || 0);
  return Math.min(Math.max(0, n), MAX_HITS_PER_RUN) * HIT_TIME_PENALTY_MS;
}

/**
 * Per-run hit state. Created fresh per race (the track component
 * remounts on every race start, so a new tracker is a new run).
 */
export function createHitTracker() {
  return { count: 0, lastHitAtById: new Map(), slowUntilS: -Infinity };
}

/**
 * Register a collision. Returns the hit record
 * { obstacleId, hitNumber, penaltyMs } or null when the hit carries no
 * penalty (per-obstacle immunity still active, or the run cap reached).
 * Never throws, never ends a run.
 */
export function registerObstacleHit(tracker, obstacle, nowS) {
  if (!tracker || !obstacle) return null;
  if (tracker.count >= MAX_HITS_PER_RUN) return null;
  const last = tracker.lastHitAtById.get(obstacle.id);
  if (last !== undefined && nowS - last < HIT_IMMUNITY_S) return null;
  tracker.lastHitAtById.set(obstacle.id, nowS);
  tracker.count += 1;
  tracker.slowUntilS = nowS + HIT_SLOW_DURATION_S;
  return { obstacleId: obstacle.id, hitNumber: tracker.count, penaltyMs: HIT_TIME_PENALTY_MS };
}

/** True while the impact speed cut is still active. */
export function isSlowed(tracker, nowS) {
  return !!tracker && nowS < tracker.slowUntilS;
}
