// lib/ghost-rider/battle.js
// THE GHOST RIDER BATTLE — the law (Merlin, 2026-11-15 ~02:39).
//
// Walk up to the Rider and he speaks (the conversation), then a
// POKÉMON-STYLE BATTLE occurs: turn-based, you pick a move, the
// Rider answers, HP bars on both sides. Win and the flaming chain
// is yours.
//
// NUMBERS ARE THE WORKER'S CHOICE (flagged, not Merlin's): the
// Rider is a boss, so he carries more HP than you (120 vs 100)
// and his moves hit every time — your edge is the Penance Stare,
// the hardest hitter in the fight. A battle lasts 4–7 turns.
//
// LOSE (his call later): no penalty — the Rider shakes his flaming
// skull, tells you to come back when you are ready, and you can
// talk to him again at once. Nothing is taken from you.
//
// This module is pure: no DOM, no three.js, no Supabase — safe to
// import in node for headless testing and in the page/battle UI.
// Randomness comes through a passed rng (default Math.random) so
// tests can pin every roll.

// ── The fighters ───────────────────────────────────────────────────
export const PLAYER_MAX_HP = 100;
export const RIDER_MAX_HP = 120;

// ── The moves ──────────────────────────────────────────────────────
// Player moves: damage + accuracy (a miss costs the turn, Pokémon
// style). The Rider's moves always hit — he is the boss.
export const PLAYER_MOVES = {
  'chain-lash': { id: 'chain-lash', name: 'Chain Lash', damage: 18, accuracy: 1.0,
    line: 'You lash out with a borrowed chain.' },
  hellfire: { id: 'hellfire', name: 'Hellfire', damage: 26, accuracy: 0.75,
    line: 'You hurl a fistful of hellfire.' },
  'penance-stare': { id: 'penance-stare', name: 'Penance Stare', damage: 34, accuracy: 0.5,
    line: 'You meet his burning eyes — and stare back.' },
};

export const RIDER_MOVES = [
  { id: 'chain-sweep', name: 'Chain Sweep', damage: 14,
    line: 'His chain sweeps low, catching your legs.' },
  { id: 'hellfire', name: 'Hellfire', damage: 20,
    line: 'Hellfire rolls off him in a wave.' },
  { id: 'skull-bash', name: 'Skull Bash', damage: 10,
    line: 'He bashes you with his flaming skull.' },
];

// ── The conversation ───────────────────────────────────────────────
// He speaks, you answer, then the battle. The choices are flavour —
// whichever you pick, the talk always runs to the fight (flagged,
// not hidden): the Rider came here to be fought.
export const DIALOGUE = [
  {
    rider: 'You walk into my fire, little soul. Most turn back at the smell of it.',
    choices: [
      'I came to meet the Ghost Rider.',
      'The fire does not scare me.',
    ],
  },
  {
    rider: 'Meet me? I am the reckoning — the chain that binds the damned. What do you want from me?',
    choices: [
      'Your chain. I want to carry it.',
      'A fight. Nothing less.',
    ],
  },
  {
    rider: 'Then take it from me. If you can stand in my fire and still be standing — the chain is yours.',
    choices: [
      'Then let us fight.',
      'I am ready.',
    ],
  },
];

export const RIDER_WIN_LINE = 'The Rider shakes his flaming skull. "Come back when you are ready, little soul."';
export const RIDER_LOSE_LINE = '"You stood in my fire — and you are still standing." The chain uncoils from his fist and comes to you.';

// ── The battle ─────────────────────────────────────────────────────

/** Fresh battle: phase 'player' — you move first. */
export function createBattle(nowMs = Date.now()) {
  return {
    phase: 'player', // 'player' | 'won' | 'lost'
    playerHp: PLAYER_MAX_HP,
    riderHp: RIDER_MAX_HP,
    turn: 1,
    log: [],
    startedAtMs: nowMs,
    endedAtMs: null,
  };
}

function clone(b) {
  return { ...b, log: b.log.slice() };
}

/**
 * One full turn: you pick a move, the Rider answers. Returns a NEW
 * battle — the input is never mutated. rng is () => [0, 1); pass a
 * seeded one in tests to pin every roll.
 *
 * A turn does nothing when the battle is already over, or when the
 * move id is not one of yours — the log says so, plainly.
 */
export function takeTurn(battle, moveId, rng = Math.random) {
  const b = clone(battle);
  if (b.phase !== 'player') {
    b.log.push('The battle is already over.');
    return b;
  }
  const move = PLAYER_MOVES[moveId];
  if (!move) {
    b.log.push('That is not one of your moves.');
    return b;
  }
  // Your move.
  const roll = typeof rng === 'function' ? rng() : Math.random();
  if (roll < move.accuracy) {
    b.riderHp = Math.max(0, b.riderHp - move.damage);
    b.log.push(`${move.line} It lands — ${move.damage} damage.`);
  } else {
    b.log.push(`${move.line} It misses — the fire swallows it.`);
  }
  if (b.riderHp <= 0) {
    b.phase = 'won';
    b.endedAtMs = Date.now();
    b.log.push(RIDER_LOSE_LINE);
    return b;
  }
  // The Rider answers: a move picked at random from his three.
  const pick = typeof rng === 'function' ? rng() : Math.random();
  const riderMove = RIDER_MOVES[Math.floor(pick * RIDER_MOVES.length) % RIDER_MOVES.length];
  b.playerHp = Math.max(0, b.playerHp - riderMove.damage);
  b.log.push(`${riderMove.line} ${riderMove.damage} damage.`);
  if (b.playerHp <= 0) {
    b.phase = 'lost';
    b.endedAtMs = Date.now();
    b.log.push(RIDER_WIN_LINE);
    return b;
  }
  b.turn += 1;
  return b;
}

/** Is the battle over? */
export function battleOver(battle) {
  return battle && (battle.phase === 'won' || battle.phase === 'lost');
}

/** HP as a 0–1 fraction, for the bars. */
export function hpFraction(hp, maxHp) {
  const m = Number(maxHp) || 1;
  return Math.max(0, Math.min(1, Number(hp) / m));
}
