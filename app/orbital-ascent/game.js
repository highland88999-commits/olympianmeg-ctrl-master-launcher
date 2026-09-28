/**
 * Orbital Ascent — pure game logic (no DOM, no canvas).
 *
 * Rebuilt from the "99-Level Ascent" source: a ball auto-bounces on a tower
 * of 99 platforms. Steering moves it sideways; pressing JUMP exactly as it
 * lands converts the bounce into a boosted ascent. Falling more than two
 * levels below your highest platform ends the run.
 */

export const LEVEL_COUNT = 99;
export const LEVEL_SPACING = 170; // px between platform tops
export const GRAVITY = 2600; // px / s^2
export const BOUNCE_V = 1050; // normal bounce velocity (px/s upward)
export const JUMP_GOOD_V = 1500; // good-timed jump: clears ~2 levels
export const JUMP_PERFECT_V = 1850; // perfect-timed jump: clears ~4 levels
export const BALL_R = 16;
export const STEER_ACCEL = 2600;
export const STEER_MAX = 460;
export const AIR_DRAG = 1.6;

// Timing windows (seconds) between JUMP press and landing.
export const PERFECT_WINDOW = 0.12;
export const GOOD_WINDOW = 0.28;

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

/** Y of a platform top for a 1-based level. Level 1 sits at y = 0. */
export function levelY(level) {
  return -(level - 1) * LEVEL_SPACING;
}

/**
 * Deterministic tower layout: 99 platforms, drifting sideways with level,
 * narrowing as you climb.
 */
export function buildLevels(seed) {
  const rand = mulberry32(seed);
  const jitter = [];
  for (let i = 0; i < LEVEL_COUNT; i++) jitter.push((rand() - 0.5) * 60);
  const levels = [];
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const t = level / LEVEL_COUNT;
    const x = Math.sin(level * 0.55) * (70 + t * 220) + jitter[level - 1];
    const width = Math.max(96, 200 - t * 110);
    levels.push({ level, x, width, y: levelY(level) });
  }
  return levels;
}

export function createGame(seed = 1337) {
  const levels = buildLevels(seed);
  return {
    seed,
    levels,
    ball: { x: 0, y: levelY(1) - BALL_R - 1, vx: 0, vy: 0 },
    steer: 0, // -1 | 0 | 1
    jumpPressedAt: -Infinity, // game-time of last JUMP press
    time: 0,
    highest: 1,
    status: "ready", // ready | playing | won | lost
    lastEvent: null,
  };
}

export function pressJump(state) {
  if (state.status !== "playing") return;
  state.jumpPressedAt = state.time;
}

/** Quality of a jump press relative to a landing happening now. */
export function jumpQuality(state) {
  const dt = state.time - state.jumpPressedAt;
  if (dt < 0) return "none";
  if (dt <= PERFECT_WINDOW) return "perfect";
  if (dt <= GOOD_WINDOW) return "good";
  return "stale";
}

/** Rough seconds until the ball next reaches a platform top below it. */
export function timeToLanding(state) {
  const { ball } = state;
  if (ball.vy <= 0) return Infinity;
  // next platform top at or below the ball
  const lvl = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(-ball.y / LEVEL_SPACING) + 1));
  const targetY = levelY(lvl) - BALL_R;
  const dy = targetY - ball.y;
  if (dy <= 0) return 0;
  // solve 0.5*g*t^2 + vy*t - dy = 0
  const disc = ball.vy * ball.vy + 2 * GRAVITY * dy;
  return (-ball.vy + Math.sqrt(disc)) / GRAVITY;
}

function landOn(state, platform) {
  const quality = jumpQuality(state);
  state.ball.y = platform.y - BALL_R;
  if (quality === "perfect") {
    state.ball.vy = -JUMP_PERFECT_V;
  } else if (quality === "good") {
    state.ball.vy = -JUMP_GOOD_V;
  } else {
    state.ball.vy = -BOUNCE_V;
  }
  state.jumpPressedAt = -Infinity; // consume the press
  if (platform.level > state.highest) {
    state.highest = platform.level;
    if (platform.level >= LEVEL_COUNT) state.status = "won";
  }
  state.lastEvent = { type: "land", level: platform.level, quality };
  return state.lastEvent;
}

/**
 * Advance the simulation by dt seconds. Returns an array of events
 * ({type:'land'|'won'|'lost', ...}) that happened this step.
 */
export function step(state, dt) {
  const events = [];
  if (state.status !== "playing") return events;
  dt = Math.min(dt, 1 / 20);
  state.time += dt;
  const { ball } = state;

  // horizontal steering with drag
  ball.vx += state.steer * STEER_ACCEL * dt;
  ball.vx -= ball.vx * Math.min(1, AIR_DRAG * dt);
  ball.vx = Math.max(-STEER_MAX, Math.min(STEER_MAX, ball.vx));

  const prevBottom = ball.y + BALL_R;
  ball.vy += GRAVITY * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const newBottom = ball.y + BALL_R;

  // landing: crossed a platform top while falling
  if (ball.vy > 0) {
    for (const p of state.levels) {
      if (p.y < prevBottom - 1 || p.y > newBottom + 1) continue;
      if (Math.abs(ball.x - p.x) <= p.width / 2 + BALL_R * 0.6) {
        events.push(landOn(state, p));
        break;
      }
    }
  }

  // fell too far below the highest reached platform
  const floorY = levelY(Math.max(1, state.highest - 2)) + LEVEL_SPACING * 1.5;
  if (ball.y > floorY) {
    state.status = "lost";
    events.push({ type: "lost", highest: state.highest });
  }
  if (state.status === "won") events.push({ type: "won" });
  return events;
}

export function resetGame(state) {
  const fresh = createGame(state.seed);
  Object.assign(state, fresh, { status: "playing" });
}
