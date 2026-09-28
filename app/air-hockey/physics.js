// Air Hockey — pure game logic. Dependency-free: imported by both page.jsx and the node tests.
// Coordinate system: top-down table, y grows downward. Player defends the BOTTOM
// goal (y = TABLE_H), AI defends the TOP goal (y = 0).

export const TABLE_W = 400;
export const TABLE_H = 700;
export const PUCK_R = 13;
export const MALLET_R = 27;
export const GOAL_W = 150; // mouth width, centered on x = TABLE_W / 2
export const WIN_SCORE = 7;

export const RESTITUTION_WALL = 0.92; // puck keeps 92% of speed off walls
export const RESTITUTION_MALLET = 0.88; // bounce off a still mallet
export const MALLET_TRANSFER = 0.5; // fraction of mallet velocity added to puck
export const PUCK_DAMPING = 0.55; // speed retained per second (air-table glide)
export const PUCK_MAX_SPEED = 1500;

export const DIFFICULTIES = {
  easy:   { label: 'Easy',   maxSpeed: 330, error: 64, aggression: 0.45, strike: 0.7 },
  medium: { label: 'Medium', maxSpeed: 470, error: 32, aggression: 0.7,  strike: 0.9 },
  hard:   { label: 'Hard',   maxSpeed: 650, error: 12, aggression: 1.0,  strike: 1.15 },
};
export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// ---------------------------------------------------------------------------
// Mallet
// ---------------------------------------------------------------------------
export class Mallet {
  constructor(x, y, isPlayer) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.isPlayer = isPlayer;
    this.px = x; // previous position, for velocity tracking
    this.py = y;
  }

  // Clamp to this mallet's own half + table bounds (goal mouths don't matter
  // for mallets: they can't leave the table).
  clampToBounds() {
    this.x = clamp(this.x, MALLET_R, TABLE_W - MALLET_R);
    if (this.isPlayer) {
      this.y = clamp(this.y, TABLE_H / 2 + MALLET_R, TABLE_H - MALLET_R);
    } else {
      this.y = clamp(this.y, MALLET_R, TABLE_H / 2 - MALLET_R);
    }
  }

  trackVelocity(dt) {
    if (dt > 0) {
      this.vx = (this.x - this.px) / dt;
      this.vy = (this.y - this.py) / dt;
    }
    this.px = this.x;
    this.py = this.y;
  }
}

// ---------------------------------------------------------------------------
// Puck physics
// ---------------------------------------------------------------------------
export function stepPuck(puck, dt) {
  // Air-table glide: exponential damping.
  const damp = Math.pow(PUCK_DAMPING, dt);
  puck.vx *= damp;
  puck.vy *= damp;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  const sp = Math.hypot(puck.vx, puck.vy);
  if (sp > PUCK_MAX_SPEED) {
    puck.vx = (puck.vx / sp) * PUCK_MAX_SPEED;
    puck.vy = (puck.vy / sp) * PUCK_MAX_SPEED;
  }
}

// Walls. Returns 'none' | 'bounce'. Goal mouths are open on top/bottom edges.
export function collideWalls(puck) {
  let bounced = false;
  if (puck.x - PUCK_R < 0) {
    puck.x = PUCK_R;
    if (puck.vx < 0) puck.vx = -puck.vx * RESTITUTION_WALL;
    bounced = true;
  } else if (puck.x + PUCK_R > TABLE_W) {
    puck.x = TABLE_W - PUCK_R;
    if (puck.vx > 0) puck.vx = -puck.vx * RESTITUTION_WALL;
    bounced = true;
  }
  const goalHalf = GOAL_W / 2 - PUCK_R;
  const cx = TABLE_W / 2;
  // Top edge (AI goal mouth)
  if (puck.y - PUCK_R < 0) {
    if (Math.abs(puck.x - cx) > goalHalf) {
      puck.y = PUCK_R;
      if (puck.vy < 0) puck.vy = -puck.vy * RESTITUTION_WALL;
      bounced = true;
    }
  }
  // Bottom edge (player goal mouth)
  if (puck.y + PUCK_R > TABLE_H) {
    if (Math.abs(puck.x - cx) > goalHalf) {
      puck.y = TABLE_H - PUCK_R;
      if (puck.vy > 0) puck.vy = -puck.vy * RESTITUTION_WALL;
      bounced = true;
    }
  }
  return bounced;
}

// Mallet <-> puck collision with momentum transfer.
// Returns true when a hit happened (caller can play a sound).
export function collideMallet(puck, mallet, dt) {
  const dx = puck.x - mallet.x;
  const dy = puck.y - mallet.y;
  const d = Math.hypot(dx, dy);
  const minDist = PUCK_R + MALLET_R;
  if (d >= minDist || d === 0) return false;

  const nx = dx / d;
  const ny = dy / d;

  // 1. Separate: push puck exactly out of the mallet.
  const overlap = minDist - d;
  puck.x += nx * (overlap + 0.5);
  puck.y += ny * (overlap + 0.5);

  // 2. Reflect the puck's velocity relative to the mallet's velocity.
  const rvx = puck.vx - mallet.vx;
  const rvy = puck.vy - mallet.vy;
  const approaching = rvx * nx + rvy * ny;
  if (approaching < 0) {
    const j = -(1 + RESTITUTION_MALLET) * approaching;
    puck.vx += j * nx;
    puck.vy += j * ny;
    // 3. Add a share of the mallet's own motion (striking the puck).
    puck.vx += mallet.vx * MALLET_TRANSFER;
    puck.vy += mallet.vy * MALLET_TRANSFER;
  }

  const sp = Math.hypot(puck.vx, puck.vy);
  if (sp > PUCK_MAX_SPEED) {
    puck.vx = (puck.vx / sp) * PUCK_MAX_SPEED;
    puck.vy = (puck.vy / sp) * PUCK_MAX_SPEED;
  }
  return true;
}

// Goal check. Returns 'player' | 'ai' | null.
// Player scores by putting the puck in the TOP (AI) goal.
export function checkGoal(puck) {
  const cx = TABLE_W / 2;
  const goalHalf = GOAL_W / 2;
  if (puck.y + PUCK_R < 0 && Math.abs(puck.x - cx) < goalHalf) return 'player';
  if (puck.y - PUCK_R > TABLE_H && Math.abs(puck.x - cx) < goalHalf) return 'ai';
  return null;
}

// ---------------------------------------------------------------------------
// AI controller
// ---------------------------------------------------------------------------
// Returns a target point for the AI mallet this frame.
export function aiTarget(puck, diff) {
  const cx = TABLE_W / 2;
  const onAiSide = puck.y < TABLE_H / 2;
  const towardAi = puck.vy < -40;

  if (onAiSide && (towardAi || Math.hypot(puck.vx, puck.vy) < 120)) {
    // Attack: get behind the puck (on the AI-goal side) and drive it down.
    const behind = clamp(puck.y - MALLET_R - 6, MALLET_R, TABLE_H / 2 - MALLET_R);
    const aim = (puck.x - cx) * 0.15 * diff.aggression; // slight aim at player's goal
    return { x: clamp(puck.x + aim, MALLET_R, TABLE_W - MALLET_R), y: behind };
  }
  // Defend / shadow: hover between puck and own goal.
  const guardX = cx + (puck.x - cx) * 0.4;
  const guardY = 120;
  return { x: clamp(guardX, MALLET_R, TABLE_W - MALLET_R), y: guardY };
}

export function stepAi(ai, puck, diff, dt) {
  const t = aiTarget(puck, diff);
  // Difficulty error: wobble the target so easy AI misjudges.
  const ex = diff.error > 0 ? Math.sin(puck.y * 0.05 + puck.x * 0.03) * diff.error * 0.4 : 0;
  const tx = t.x + ex;
  const dx = tx - ai.x;
  const dy = t.y - ai.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    ai.vx = 0; ai.vy = 0;
    ai.trackVelocity(dt);
    return;
  }
  // Slow near the target so it doesn't jitter.
  const speed = Math.min(diff.maxSpeed, d * 8);
  ai.x += (dx / d) * speed * dt;
  ai.y += (dy / d) * speed * dt;
  ai.clampToBounds();
  ai.trackVelocity(dt);
}

// ---------------------------------------------------------------------------
// Game state machine
// ---------------------------------------------------------------------------
// states: 'menu' | 'countdown' | 'play' | 'scored' | 'end'
export class Game {
  constructor(difficulty = 'medium') {
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'medium';
    this.reset();
  }

  reset() {
    this.state = 'menu';
    this.playerScore = 0;
    this.aiScore = 0;
    this.winner = null;
    this.countdown = 0;
    this.scoredTimer = 0;
    this.serveDir = 1; // 1 = serve toward player (down), -1 = toward AI
    this.lastScorer = null;
    this.puck = { x: TABLE_W / 2, y: TABLE_H / 2, vx: 0, vy: 0 };
    this.player = new Mallet(TABLE_W / 2, TABLE_H - 130, true);
    this.ai = new Mallet(TABLE_W / 2, 130, false);
    this.events = []; // drained by the page each frame: 'hit' | 'wall' | 'goal' | 'win' | 'lose'
  }

  start() {
    this.playerScore = 0;
    this.aiScore = 0;
    this.winner = null;
    this.beginCountdown(1);
  }

  beginCountdown(serveDir) {
    this.state = 'countdown';
    this.countdown = 3.0;
    this.serveDir = serveDir;
    this.puck.x = TABLE_W / 2;
    this.puck.y = TABLE_H / 2;
    this.puck.vx = (Math.random() - 0.5) * 60;
    this.puck.vy = 0;
    this.player.x = TABLE_W / 2; this.player.y = TABLE_H - 130;
    this.ai.x = TABLE_W / 2; this.ai.y = 130;
  }

  update(dt) {
    dt = Math.min(dt, 1 / 20); // clamp huge frame gaps
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        // Kickoff nudge toward the player who was scored on.
        this.puck.vy = 220 * this.serveDir;
        this.puck.vx = (Math.random() - 0.5) * 120;
        this.state = 'play';
      }
      return;
    }
    if (this.state === 'scored') {
      this.scoredTimer -= dt;
      if (this.scoredTimer <= 0) this.beginCountdown(this.lastScorer === 'player' ? -1 : 1);
      return;
    }
    if (this.state !== 'play') return;

    // AI moves first so its velocity is fresh for collision.
    stepAi(this.ai, this.puck, DIFFICULTIES[this.difficulty], dt);

    stepPuck(this.puck, dt);
    const hitPlayer = collideMallet(this.puck, this.player, dt);
    const hitAi = collideMallet(this.puck, this.ai, dt);
    if (hitPlayer || hitAi) this.events.push('hit');
    if (collideWalls(this.puck)) this.events.push('wall');

    const goal = checkGoal(this.puck);
    if (goal) this.scoreGoal(goal);
  }

  scoreGoal(scorer) {
    this.lastScorer = scorer;
    if (scorer === 'player') this.playerScore++;
    else this.aiScore++;
    this.events.push('goal');
    if (this.playerScore >= WIN_SCORE || this.aiScore >= WIN_SCORE) {
      this.winner = this.playerScore >= WIN_SCORE ? 'player' : 'ai';
      this.events.push(this.winner === 'player' ? 'win' : 'lose');
      this.state = 'end';
    } else {
      this.state = 'scored';
      this.scoredTimer = 1.4;
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
