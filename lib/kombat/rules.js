// KOMBAT ARENA — shared combat rules.
// Pure logic only (no three.js, no DOM): safe to import in Node for headless tests.

export const MAX_HEALTH = 100;
export const ROUND_TIME = 60; // seconds
export const ROUNDS_TO_WIN = 2; // best of 3
export const FINISH_HIM_SECONDS = 4;
export const COMBO_WINDOW = 1.2; // seconds to chain light->light->heavy
export const BLOCK_REDUCTION = 0.75; // blocked hits lose 75% damage (chip remains)
export const ARENA_HALF_WIDTH = 4.2; // fighters clamp to [-4.2, 4.2] on the X axis
export const MIN_SEPARATION = 0.9; // bodies never overlap closer than this

// Difficulty tuning — reaction speed, aggression, block probability, think rate.
// The AI never reads inputs: it reacts to visible attack animations after a
// difficulty-scaled delay, and decides on distance + its own plan only.
export const DIFFICULTY = {
  easy: {
    reactionMs: 380, // delay before the AI may notice your attack started
    blockChance: 0.15, // chance to raise block when it notices an attack in range
    aggression: 0.35, // chance to attack (vs reposition) when in range
    specialChance: 0.25, // chance a chosen attack is a special (when one is ready)
    heavyChance: 0.25, // chance a chosen normal is heavy instead of light
    dashChance: 0.05, // chance to dash in from far
    retreatChance: 0.15, // chance to back off after attacking
    thinkMs: 520, // decision interval
    speedMul: 0.85,
    fatalityChance: 0.15, // CPU fatality after winning: rare but possible
  },
  normal: {
    reactionMs: 240,
    blockChance: 0.35,
    aggression: 0.55,
    specialChance: 0.45,
    heavyChance: 0.35,
    dashChance: 0.12,
    retreatChance: 0.25,
    thinkMs: 320,
    speedMul: 1.0,
    fatalityChance: 0.40,
  },
  hard: {
    reactionMs: 130,
    blockChance: 0.55,
    aggression: 0.75,
    specialChance: 0.65,
    heavyChance: 0.45,
    dashChance: 0.2,
    retreatChance: 0.35,
    thinkMs: 180,
    speedMul: 1.1,
    fatalityChance: 0.75,
  },
};

// Normal attacks. base = unscaled damage before power/toughness.
export const ATTACKS = {
  light: {
    base: 6, range: 1.7, startup: 0.14, active: 0.12, recovery: 0.28,
    knockback: 0.55, hitstun: 0.35, pose: 'punch', label: 'PUNCH',
  },
  heavy: {
    base: 11, range: 2.0, startup: 0.3, active: 0.14, recovery: 0.5,
    knockback: 1.05, hitstun: 0.55, pose: 'kick', label: 'KICK',
  },
};

// Specials reuse the roster's own damage/cooldown values, scaled by the same
// formula. A damage-0 special grants a defensive ward instead of dealing damage.
export const SPECIAL_STARTUP = 0.35;
export const SPECIAL_ACTIVE = 0.16;
export const SPECIAL_RECOVERY = 0.55;
export const SPECIAL_RANGE_BONUS = 0.5; // specials reach a little further
export const WARD_SECONDS = 4; // damage-0 special: halves the next hits taken

// PLAYER INPUT BUFFER (player/AI parity): a press that lands while the
// player's fighter is briefly non-actionable (in hitstun, mid-attack,
// dashing) is held for this long and executes at the first legal frame
// instead of being silently discarded. The AI never needs the buffer —
// it only ever decides from actionable states and re-decides every
// think tick — so the buffer is what puts the human's inputs under the
// same effective rules as the AI's. Presses denied for a REAL reason
// (special on cooldown, fire-condition gate) are never buffered: those
// denials are honest and final, and the pad says so. The window is
// sized against the game itself: a heavy hit stuns for 0.55s and a
// human reflex tap lands ~0.25s after the hit lands, leaving ~0.30s
// of stun the buffer must outlast — 0.40s covers that with margin
// while staying well inside one attack cycle, so it can hold ONE
// intent across a stun or a recovery, never queue a combo.
export const INPUT_BUFFER_SECONDS = 0.4;

// Combo multipliers by chain length (light -> light -> heavy within COMBO_WINDOW).
export const COMBO_MULT = { 1: 1.0, 2: 1.15, 3: 1.5 };

/**
 * Fair damage: attacker power (1-10) vs defender toughness (1-10).
 * Identical formula for player and CPU — no pay-to-win, no fake AI scaling.
 * power 1 -> x0.76, power 10 -> x1.30
 * toughness 1 -> x1.10, toughness 10 -> x0.65
 */
export function calcDamage(base, power, toughness) {
  const p = Math.min(10, Math.max(1, Number(power) || 1));
  const t = Math.min(10, Math.max(1, Number(toughness) || 1));
  const atk = 0.7 + p * 0.06;
  const def = 1.15 - t * 0.05;
  return Math.max(1, Math.round(base * atk * def));
}

/** Blocked damage (chip). */
export function calcBlockedDamage(dmg) {
  return Math.max(1, Math.round(dmg * (1 - BLOCK_REDUCTION)));
}

/** Walk speed derived from the speed stat (1-10): 2.6 .. 3.9 units/s. */
export function walkSpeed(speedStat, diffMul = 1) {
  const s = Math.min(10, Math.max(1, Number(speedStat) || 5));
  return (2.4 + s * 0.15) * diffMul;
}

/** Headless-friendly round state machine (mirrors the engine's flow). */
export function createMatchState() {
  return {
    phase: 'intro', // intro -> fight -> roundEnd -> intro ... -> finishHim -> fatality|ko -> done
    round: 1,
    p1Rounds: 0,
    p2Rounds: 0,
    p1Health: MAX_HEALTH,
    p2Health: MAX_HEALTH,
    timeLeft: ROUND_TIME,
  };
}

/** Apply a round result to a match state; returns the next phase. */
export function applyRoundWin(state, winner /* 'p1' | 'p2' | 'timeout-p1' | 'timeout-p2' | 'draw' */) {
  if (winner === 'p1' || winner === 'timeout-p1') state.p1Rounds += 1;
  else if (winner === 'p2' || winner === 'timeout-p2') state.p2Rounds += 1;
  else {
    // draw: replay the round, no one scores
    state.p1Health = MAX_HEALTH;
    state.p2Health = MAX_HEALTH;
    state.timeLeft = ROUND_TIME;
    state.phase = 'intro';
    return state.phase;
  }
  const decided = state.p1Rounds >= ROUNDS_TO_WIN || state.p2Rounds >= ROUNDS_TO_WIN;
  if (decided) {
    state.phase = 'finishHim';
  } else {
    state.round += 1;
    state.p1Health = MAX_HEALTH;
    state.p2Health = MAX_HEALTH;
    state.timeLeft = ROUND_TIME;
    state.phase = 'intro';
  }
  return state.phase;
}

/** Timeout winner: higher health takes the round; equal health = draw. */
export function timeoutWinner(p1Health, p2Health) {
  if (p1Health > p2Health) return 'timeout-p1';
  if (p2Health > p1Health) return 'timeout-p2';
  return 'draw';
}

// ------------------------------------------------------------------
// Step 5 — ALL SPECIALS LIVE. The equip-2 ritual is retired: every
// fighter fields their FULL special kit (5 for most, 6 for Bugs
// Bunny and Deadpool), driven from the Powers pad (hexagon/heptagon:
// specials + the Fatality wedge). These helpers are shared verbatim
// by the player path and the AI path in BOTH engines — one kit, one
// picker, no asymmetry (fairness law).
// ------------------------------------------------------------------

/** Press actions the engines accept for specials: sp1..sp6. */
export const SPECIAL_ACTIONS = ['sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'sp6'];

/** 'sp3' -> 2 · anything else -> -1. */
export function specialIndexForAction(action) {
  return SPECIAL_ACTIONS.indexOf(action);
}

/**
 * Build a fighter's live kit from their roster record: ALL specials
 * in roster order, one cooldown slot each. Any legacy equip selection
 * (specialIdxs — the old pick-2 config value) is accepted and
 * ignored for restriction: an old config simply fields the full kit,
 * so saved flows migrate with no breakage.
 */
export function buildSpecialKit(fighterData) {
  const specials = (fighterData?.specials || []).slice();
  return { specials, cooldowns: specials.map(() => 0) };
}

/** Indexes of specials off cooldown; damaging ones by default. */
export function readySpecialIndexes(specials, cooldowns, { damaging = true } = {}) {
  const out = [];
  for (let i = 0; i < specials.length; i++) {
    if ((cooldowns[i] || 0) > 0) continue;
    if (damaging && !(specials[i].damage > 0)) continue;
    if (!damaging && specials[i].damage > 0) continue;
    out.push(i);
  }
  return out;
}

/**
 * The AI's special picker — random among ready damaging specials,
 * from the same kit the player holds. rng is injectable for tests.
 * Returns -1 when nothing damaging is ready.
 */
export function pickReadySpecial(specials, cooldowns, rng = Math.random) {
  const ready = readySpecialIndexes(specials, cooldowns, { damaging: true });
  if (!ready.length) return -1;
  return ready[Math.min(ready.length - 1, Math.floor(rng() * ready.length))];
}

/** Cooldown fraction remaining (0 = ready, 1 = just fired). */
export function cooldownFraction(spec, remaining) {
  if (!spec || !(remaining > 0)) return 0;
  return Math.min(1, Math.max(0, remaining / Math.max(0.01, spec.cooldown)));
}
