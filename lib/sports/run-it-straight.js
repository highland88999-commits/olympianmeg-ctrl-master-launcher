// lib/sports/run-it-straight.js — "Run It Straight" rules (pure, node-tested).
//
// The viral one-on-one collision sport: two runners sprint straight at
// each other down a narrow lane. No sidestepping. The carrier tries to
// run through the tackler; the tackler tries to stop them cold.
// Best of 5 rounds. Power + timing decide it.

export const LANE_W = 4;
export const LANE_L = 40;

export function createRunItStraight(playerName = 'You') {
  return {
    status: 'ready', // ready -> run -> clash -> done
    round: 1,
    score: { you: 0, ai: 0 },
    youAttacking: true, // alternate who carries
    you: { z: LANE_L / 2 - 4, speed: 0, power: 0 },
    ai: { z: -LANE_L / 2 + 4, speed: 0, power: 0 },
    clashAt: 0,
    events: [],
    winner: null,
  };
}

export function startRound(state, rng = Math.random) {
  state.you.z = LANE_L / 2 - 4;
  state.ai.z = -LANE_L / 2 + 4;
  state.you.speed = 0;
  state.ai.speed = 0;
  // AI power: random 0.7–1.0. Yours builds as you mash.
  state.ai.power = 0.7 + rng() * 0.3;
  state.you.power = 0.5;
  state.clashAt = 0;
  state.status = 'run';
  state.events.push({ type: 'round', round: state.round, youAttacking: state.youAttacking });
}

export function stepRunIt(state, dt, mashing, rng = Math.random) {
  state.events.length = 0;
  if (state.status !== 'run') return;

  // Build speed: mashing pumps your legs; AI auto-runs.
  if (mashing) state.you.power = Math.min(1, state.you.power + dt * 0.8);
  else state.you.power = Math.max(0.4, state.you.power - dt * 0.3);

  state.you.speed = 6 + state.you.power * 6;
  state.ai.speed = 6 + state.ai.power * 6;

  state.you.z -= state.you.speed * dt;
  state.ai.z += state.ai.speed * dt;

  // Clash when they meet
  if (state.you.z <= state.ai.z + 1) {
    state.status = 'clash';
    state.clashAt = 0;
    // Resolve: attacker power vs defender power + randomness
    const attacker = state.youAttacking ? state.you : state.ai;
    const defender = state.youAttacking ? state.ai : state.you;
    const attackRoll = attacker.power * (0.85 + rng() * 0.3);
    const defendRoll = defender.power * (0.85 + rng() * 0.3);
    const attackerWins = attackRoll > defendRoll;
    const winnerId = attackerWins
      ? (state.youAttacking ? 'you' : 'ai')
      : (state.youAttacking ? 'ai' : 'you');
    state.score[winnerId] += 1;
    state.events.push({
      type: 'clash',
      winner: winnerId,
      attackerWins,
      youAttacking: state.youAttacking,
      score: { ...state.score },
    });
    if (state.score.you >= 3 || state.score.ai >= 3) {
      state.status = 'done';
      state.winner = state.score.you > state.score.ai ? 'you' : 'ai';
      state.events.push({ type: 'win', winner: state.winner });
    }
    return;
  }
}

export function nextRound(state) {
  state.round += 1;
  state.youAttacking = !state.youAttacking;
  startRound(state);
}
