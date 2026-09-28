/**
 * Zeus engine — pure game logic for the /zeus-protocol module
 * ("ZEUS PROTOCOL // Deep-Space Defence", rebuilt from the
 * Zeus-Protocol---Deep-Space-Defence repo's "Earth Defense" shooter).
 *
 * DOM-free and dependency-free so it can be unit-tested headlessly.
 * All distances are in canvas pixels.
 */

// ---------------------------------------------------------------------------
// Collision + math helpers
// ---------------------------------------------------------------------------

/** True when two circles overlap. */
export function circleHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Exponential approach of x toward target by factor k (0..1). */
export function approach(x, target, k) {
  return x + (target - x) * k;
}

// ---------------------------------------------------------------------------
// Hit radii (tuned from the source's world-unit distances)
// ---------------------------------------------------------------------------

export const HIT = {
  player: 22,
  enemy: 26,
  enemyLaserVsPlayer: 30,
  asteroid: 34,
  mineTrigger: 46,
  powerup: 30,
  laser: 6,
};

// ---------------------------------------------------------------------------
// Difficulty scaling (mirrors the source's formulas)
// ---------------------------------------------------------------------------

export const laserDamage = 50;

export function enemyHP(level) {
  return 100 + level * 10;
}

export function killsToAdvance(level) {
  return 10 + level * 2;
}

export function enemySpawnChance(level) {
  return 0.02 + level * 0.002;
}

export function asteroidSpawnChance(level) {
  return 0.01 + level * 0.001;
}

export function enemyFireChance(level) {
  return 0.005 + level * 0.001;
}

export function enemyFallSpeed(level) {
  return 0.9 + level * 0.12;
}

export function asteroidFallSpeed(level) {
  return 1.1 + level * 0.06;
}

/** Bonus hearts granted on high-level resets (source: +5 at 50, +10 at 75). */
export function bonusLives(level) {
  if (level >= 75) return 10;
  if (level >= 50) return 5;
  return 0;
}

/** Powerup duration in frames: 10–40 seconds at 60fps. */
export function powerupDurationFrames(rng) {
  return Math.floor((10 + rng() * 30) * 60);
}

// ---------------------------------------------------------------------------
// Powerups
// ---------------------------------------------------------------------------

export const POWERUPS = [
  { type: 'shield', color: '#00ffff', label: 'SHIELD' },
  { type: 'missile', color: '#ff4444', label: 'HOMING MISSILES' },
  { type: 'burst', color: '#ff00ff', label: 'TRI-BURST' },
  { type: 'mine', color: '#ffff00', label: 'MINE LAYER' },
];

export function powerupDef(type) {
  return POWERUPS.find((p) => p.type === type) || null;
}

export function randomPowerupType(rng) {
  return POWERUPS[Math.floor(rng() * POWERUPS.length) % POWERUPS.length].type;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export function initialState() {
  return {
    score: 0,
    level: 1,
    lives: 5,
    kills: 0,
    activePowerup: null,
    powerupTimer: 0,
    immunityTimer: 0,
    highScore: 0,
  };
}

/**
 * Resolve a damaging hit on the player. Returns a result descriptor so the
 * renderer can react: 'absorbed' (shield consumed), 'hit' (lost a life),
 * 'immune' (nothing happened), or 'gameover'.
 */
export function resolvePlayerHit(state) {
  if (state.immunityTimer > 0) return 'immune';
  if (state.activePowerup === 'shield') {
    return 'absorbed';
  }
  state.lives -= 1;
  if (state.lives <= 0) return 'gameover';
  state.immunityTimer = 300; // 5 seconds at 60fps
  state.activePowerup = null;
  state.powerupTimer = 0;
  return 'hit';
}

/** Apply a shield-absorb: clear the shield, grant brief immunity. */
export function absorbHit(state) {
  state.activePowerup = null;
  state.powerupTimer = 0;
  state.immunityTimer = 120;
}

/** Reset per-level entity state and top up lives. Mutates and returns state. */
export function advanceLevel(state) {
  state.level += 1;
  state.kills = 0;
  state.lives = 5 + bonusLives(state.level);
  state.activePowerup = null;
  state.powerupTimer = 0;
  return state;
}

/** Score value of one enemy kill. */
export const KILL_SCORE = 100;

/** Playfield bounds for a canvas of w×h. Player stays inside horizontally. */
export function playfieldBounds(w, h) {
  const margin = 34;
  return {
    minX: margin,
    maxX: Math.max(margin + 1, w - margin),
    spawnY: -50,
    killY: h + 60,
    playerY: h - 140,
  };
}
