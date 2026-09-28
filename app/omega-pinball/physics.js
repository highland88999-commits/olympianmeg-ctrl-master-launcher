// Omega Pinball — pure 2D pinball simulation. No DOM, no canvas, no network.
// All geometry uses canvas coordinates (y grows downward).
// Tested with `node --test` via tests/omega-pinball.test.mjs.

export const TABLE_W = 400;
export const TABLE_H = 800;
export const BALL_R = 8;
export const GRAVITY = 1500; // px / s^2
export const MAX_LEVEL = 99;
export const BALLS_PER_GAME = 3;
export const BALL_SAVE_SECONDS = 8;
export const COMBO_WINDOW = 2.5;
export const MAX_COMBO = 8;

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Seeded RNG (deterministic bumper/target layouts per level)
// ---------------------------------------------------------------------------
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
// Table geometry
// ---------------------------------------------------------------------------
// Playfield: left wall x=20, plunger lane divider x=340, right wall x=380.
// Rounded top: arc centered (180,260) radius 160 from PI to 2PI.
// Ball is served in the lane at (360, 742).

function buildWalls() {
  const segs = [];
  const wall = (ax, ay, bx, by, rest = 0.45) => segs.push({ ax, ay, bx, by, rest });

  // Left wall + inlane guide
  wall(20, 260, 20, 640);
  wall(20, 640, 100, 700);
  wall(100, 700, 128, 712); // funnel behind left flipper
  // Plunger lane divider + guide
  wall(340, 260, 340, 640);
  wall(340, 640, 300, 700);
  wall(300, 700, 272, 712); // funnel behind right flipper
  // Right wall + lane floor
  wall(380, 260, 380, 780);
  wall(340, 780, 380, 780, 0.3);
  // Slingshots (kickers above the inlanes)
  return segs;
}

export const TOP_ARC = { cx: 180, cy: 260, r: 160, a0: Math.PI, a1: Math.PI * 2 };

// One-way lane gate: arms when the ball climbs past it in the lane; if the
// ball then falls back it is deflected into the playfield instead of dropping
// back onto the plunger.
export const GATE = { x0: 340, x1: 380, y: 300, armY: 280 };

const FLIPPER_LEN = 55;
const FLIPPER_R = 9;
const FLIPPER_SWEEP_UP = 14; // rad/s
const FLIPPER_SWEEP_DOWN = 6; // rad/s

function makeFlipper(side) {
  // side: 'left' | 'right'. Angles in radians, canvas coords (y grows down),
  // so "tip down toward the drain" is a POSITIVE angle for the left flipper.
  const pivot = side === 'left' ? { x: 130, y: 710 } : { x: 270, y: 710 };
  const rest = side === 'left' ? 25 * DEG : Math.PI - 25 * DEG;
  const active = side === 'left' ? -30 * DEG : Math.PI + 30 * DEG;
  return { side, pivot, rest, active, angle: rest, omega: 0, pressed: false };
}

export function flipperTip(f) {
  return {
    x: f.pivot.x + Math.cos(f.angle) * FLIPPER_LEN,
    y: f.pivot.y + Math.sin(f.angle) * FLIPPER_LEN,
  };
}

function buildLevelFeatures(level) {
  const rand = mulberry32((0x9e3779b9 ^ (level * 2654435761)) >>> 0);
  const cycle = (level - 1) % 3;
  const jx = () => (rand() - 0.5) * 36;
  const jy = () => (rand() - 0.5) * 30;

  const bumperSets = [
    [
      { x: 110, y: 380 },
      { x: 200, y: 330 },
      { x: 285, y: 390 },
    ],
    [
      { x: 150, y: 350 },
      { x: 240, y: 350 },
      { x: 195, y: 460 },
    ],
    [
      { x: 95, y: 440 },
      { x: 195, y: 380 },
      { x: 295, y: 440 },
    ],
  ];
  const targetSets = [
    [
      { x: 110, y: 500 },
      { x: 200, y: 540 },
      { x: 290, y: 500 },
    ],
    [
      { x: 140, y: 520 },
      { x: 260, y: 520 },
      { x: 200, y: 440 },
    ],
    [
      { x: 90, y: 520 },
      { x: 200, y: 470 },
      { x: 310, y: 520 },
    ],
  ];
  const bumpers = bumperSets[cycle].map((p) => ({
    x: p.x + jx(),
    y: p.y + jy(),
    r: 22,
    flash: 0,
  }));
  const targets = targetSets[cycle].map((p) => ({
    x: p.x + jx(),
    y: p.y + jy(),
    r: 13,
    lit: false,
  }));
  return { bumpers, targets };
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
export function createGame() {
  const game = {
    mode: 'attract', // attract | serve | play | gameover | victory
    score: 0,
    level: 1,
    ballsLeft: BALLS_PER_GAME,
    combo: 1,
    comboTimer: 0,
    ball: { x: 360, y: 742, vx: 0, vy: 0, r: BALL_R },
    plunger: { charge: 0, charging: false },
    flippers: { left: makeFlipper('left'), right: makeFlipper('right') },
    walls: buildWalls(),
    slings: [
      { ax: 75, ay: 585, bx: 125, by: 645, flash: 0 },
      { ax: 325, ay: 585, bx: 275, by: 645, flash: 0 },
    ],
    bumpers: [],
    targets: [],
    ballSaveTimer: 0,
    gateArmed: false,
    stuckTimer: 0,
    time: 0,
    events: [], // drained each frame by the renderer: {type,x,y,value,text}
    speedMul: 1,
  };
  applyLevel(game, 1);
  return game;
}

export function applyLevel(game, level) {
  game.level = level;
  const { bumpers, targets } = buildLevelFeatures(level);
  game.bumpers = bumpers;
  game.targets = targets;
  game.speedMul = 1 + Math.min(level - 1, 60) * 0.015;
}

export function startGame(game) {
  game.score = 0;
  game.ballsLeft = BALLS_PER_GAME;
  game.combo = 1;
  game.comboTimer = 0;
  applyLevel(game, 1);
  serveBall(game);
}

export function serveBall(game) {
  game.ball.x = 360;
  game.ball.y = 742;
  game.ball.vx = 0;
  game.ball.vy = 0;
  game.plunger.charge = 0;
  game.plunger.charging = false;
  game.flippers.left.pressed = false;
  game.flippers.right.pressed = false;
  game.flippers.left.angle = game.flippers.left.rest;
  game.flippers.right.angle = game.flippers.right.rest;
  game.ballSaveTimer = BALL_SAVE_SECONDS;
  game.gateArmed = false;
  game.stuckTimer = 0;
  game.mode = 'serve';
  game.events.push({ type: 'serve' });
}

export function setFlipper(game, side, pressed) {
  game.flippers[side].pressed = pressed;
}

export function setPlungerCharging(game, charging) {
  if (game.mode === 'serve') game.plunger.charging = charging;
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------
function collideSegment(ball, ax, ay, bx, by, rest, surfVx = 0, surfVy = 0) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((ball.x - ax) * dx + (ball.y - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  let nx = ball.x - cx;
  let ny = ball.y - cy;
  const dist = Math.hypot(nx, ny);
  const minDist = ball.r; // walls have no extra radius
  if (dist < minDist && dist > 1e-6) {
    nx /= dist;
    ny /= dist;
    const overlap = minDist - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    const rvx = ball.vx - surfVx;
    const rvy = ball.vy - surfVy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      ball.vx -= (1 + rest) * vn * nx;
      ball.vy -= (1 + rest) * vn * ny;
      return true;
    }
  }
  return false;
}

function collideArc(ball, arc, rest) {
  const dx = ball.x - arc.cx;
  const dy = ball.y - arc.cy;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return false;
  let ang = Math.atan2(dy, dx);
  if (ang < 0) ang += Math.PI * 2;
  const inArc = ang >= arc.a0 - 1e-6 && ang <= arc.a1 + 1e-6;
  // Ball is inside the arc; collides when its edge crosses the arc radius.
  if (inArc && dist + ball.r > arc.r && dist < arc.r + ball.r + 40) {
    const nx = -dx / dist; // inward normal
    const ny = -dy / dist;
    const overlap = dist + ball.r - arc.r;
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + rest) * vn * nx;
      ball.vy -= (1 + rest) * vn * ny;
      return true;
    }
  }
  return false;
}

function collideCircle(ball, cx, cy, r, rest) {
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const dist = Math.hypot(dx, dy);
  const minDist = ball.r + r;
  if (dist < minDist && dist > 1e-6) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + rest) * vn * nx;
      ball.vy -= (1 + rest) * vn * ny;
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------
const SUBSTEP = 1 / 240;

export function stepGame(game, dt) {
  dt = Math.min(dt, 1 / 30);
  game.time += dt;
  game.events.length = 0;

  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) game.combo = 1;
  }
  if (game.ballSaveTimer > 0 && game.mode === 'play') game.ballSaveTimer -= dt;
  for (const b of game.bumpers) if (b.flash > 0) b.flash -= dt;
  for (const s of game.slings) if (s.flash > 0) s.flash -= dt;

  if (game.mode === 'serve' && game.plunger.charging) {
    game.plunger.charge = Math.min(1, game.plunger.charge + dt / 1.4);
  }
  if (game.mode !== 'play') return;

  let remaining = dt;
  while (remaining > 1e-9) {
    const h = Math.min(SUBSTEP, remaining);
    substep(game, h);
    remaining -= h;
    if (game.mode !== 'play') break; // drained mid-frame
  }

  // Stuck-ball rescue: a gentle nudge so the game can never soft-lock.
  const sp = Math.hypot(game.ball.vx, game.ball.vy);
  const inLane = game.ball.x > 340;
  if (game.mode === 'play' && !inLane && sp < 8) {
    game.stuckTimer += dt;
    if (game.stuckTimer > 2.5) {
      game.ball.vx += (Math.random() - 0.5) * 200;
      game.ball.vy -= 260;
      game.stuckTimer = 0;
      game.events.push({ type: 'nudge', x: game.ball.x, y: game.ball.y });
    }
  } else {
    game.stuckTimer = 0;
  }
}

export function releasePlunger(game) {
  if (game.mode !== 'serve') return;
  const power = Math.max(0.05, game.plunger.charge);
  game.ball.vy = -(950 + 850 * power) * game.speedMul;
  game.ball.vx = 0;
  game.plunger.charging = false;
  game.plunger.charge = 0;
  game.mode = 'play';
  game.events.push({ type: 'launch', x: game.ball.x, y: game.ball.y, value: power });
}

function substep(game, h) {
  const ball = game.ball;

  // Flippers: sweep toward target, track angular velocity for impulse.
  for (const side of ['left', 'right']) {
    const f = game.flippers[side];
    const target = f.pressed ? f.active : f.rest;
    // Signed shortest-path direction matters for mirrored right flipper.
    let diff = target - f.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const speed = f.pressed ? FLIPPER_SWEEP_UP : FLIPPER_SWEEP_DOWN;
    const maxStep = speed * h;
    const prev = f.angle;
    if (Math.abs(diff) <= maxStep) f.angle = target;
    else f.angle = prev + Math.sign(diff) * maxStep;
    f.omega = (f.angle - prev) / h;
  }

  // Gravity + integrate
  ball.vy += GRAVITY * game.speedMul * h;
  const maxV = 2600 * game.speedMul;
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > maxV) {
    ball.vx = (ball.vx / sp) * maxV;
    ball.vy = (ball.vy / sp) * maxV;
  }
  ball.x += ball.vx * h;
  ball.y += ball.vy * h;

  // Lane gate arming
  if (ball.x > 340 && ball.y < GATE.armY && ball.vy < 0) game.gateArmed = true;
  if (ball.x < 340) game.gateArmed = false;
  // Gate deflection: falling back down the lane gets tossed into play.
  if (
    game.gateArmed &&
    ball.vy > 0 &&
    ball.x > GATE.x0 + 4 &&
    ball.y > GATE.y - 14 &&
    ball.y < GATE.y + 14
  ) {
    ball.vx = -420 * game.speedMul;
    ball.vy *= 0.3;
    ball.x = GATE.x0 - ball.r - 1;
    game.gateArmed = false;
    game.events.push({ type: 'gate', x: ball.x, y: ball.y });
  }

  // Walls
  for (const w of game.walls) collideSegment(ball, w.ax, w.ay, w.bx, w.by, w.rest);
  // Top arc
  collideArc(ball, TOP_ARC, 0.5);

  // Slingshots
  for (const s of game.slings) {
    const ux = s.bx - s.ax;
    const uy = s.by - s.ay;
    const len = Math.hypot(ux, uy) || 1;
    // Kick direction: perpendicular, pointing toward table center (x=200).
    let kx = -uy / len;
    let ky = ux / len;
    const midx = (s.ax + s.bx) / 2;
    if ((midx < 200 && kx < 0) || (midx > 200 && kx > 0)) {
      kx = -kx;
      ky = -ky;
    }
    const before = { x: ball.x, y: ball.y };
    if (collideSegment(ball, s.ax, s.ay, s.bx, s.by, 1.35)) {
      ball.vx += kx * 160 * game.speedMul;
      ball.vy += ky * 160 * game.speedMul;
      s.flash = 0.2;
      game.score += 250;
      game.events.push({ type: 'sling', x: before.x, y: before.y, value: 250 });
    }
  }

  // Bumpers (pop)
  for (const b of game.bumpers) {
    if (collideCircle(ball, b.x, b.y, b.r, 1.12)) {
      if (game.comboTimer > 0) game.combo = Math.min(game.combo + 1, MAX_COMBO);
      else game.combo = 1;
      game.comboTimer = COMBO_WINDOW;
      const pts = 1000 * game.combo;
      game.score += pts;
      b.flash = 0.25;
      game.events.push({ type: 'bumper', x: b.x, y: b.y, value: pts, combo: game.combo });
    }
  }

  // Rollover targets
  for (const t of game.targets) {
    if (!t.lit) {
      const dx = ball.x - t.x;
      const dy = ball.y - t.y;
      if (Math.hypot(dx, dy) < ball.r + t.r) {
        t.lit = true;
        game.score += 1500;
        game.events.push({ type: 'target', x: t.x, y: t.y, value: 1500 });
        if (game.targets.every((o) => o.lit)) levelUp(game);
      }
    }
  }

  // Flippers (capsules with moving-surface impulse)
  for (const side of ['left', 'right']) {
    const f = game.flippers[side];
    const tip = flipperTip(f);
    const ux = Math.cos(f.angle);
    const uy = Math.sin(f.angle);
    const dx = tip.x - f.pivot.x;
    const dy = tip.y - f.pivot.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((ball.x - f.pivot.x) * dx + (ball.y - f.pivot.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = f.pivot.x + dx * t;
    const cy = f.pivot.y + dy * t;
    let nx = ball.x - cx;
    let ny = ball.y - cy;
    const dist = Math.hypot(nx, ny);
    const minDist = ball.r + FLIPPER_R;
    if (dist < minDist && dist > 1e-6) {
      nx /= dist;
      ny /= dist;
      const d = t * FLIPPER_LEN; // distance from pivot to contact
      const svx = f.omega * d * -uy;
      const svy = f.omega * d * ux;
      const overlap = minDist - dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
      const rvx = ball.vx - svx;
      const rvy = ball.vy - svy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        ball.vx -= 1.3 * vn * nx;
        ball.vy -= 1.3 * vn * ny;
        if (Math.abs(f.omega) > 2) {
          game.events.push({ type: 'flip', x: cx, y: cy });
        }
      }
    }
  }

  // Drain
  if (ball.y > TABLE_H + 20) {
    drainBall(game);
  }
}

function levelUp(game) {
  const bonus = 25000 * (game.level + 1);
  game.score += bonus;
  if (game.level + 1 > MAX_LEVEL) {
    game.mode = 'victory';
    game.events.push({ type: 'victory', value: game.score });
    return;
  }
  applyLevel(game, game.level + 1);
  game.events.push({ type: 'levelup', value: game.level, bonus });
}

function drainBall(game) {
  if (game.ballSaveTimer > 0) {
    game.events.push({ type: 'ballsave' });
    serveBall(game);
    return;
  }
  game.ballsLeft -= 1;
  game.events.push({ type: 'drain', value: game.ballsLeft });
  if (game.ballsLeft <= 0) {
    game.mode = 'gameover';
  } else {
    serveBall(game);
  }
}

// Score formatting helper for the HUD.
export function formatScore(n) {
  return n.toLocaleString('en-US');
}
