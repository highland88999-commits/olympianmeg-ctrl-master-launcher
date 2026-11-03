// lib/sports/run-it-straight.js — "Run It Straight" rules (pure, node-tested).
//
// The viral one-on-one collision sport: two runners sprint straight at
// each other down a narrow lane. No sidestepping. The carrier tries to
// run through the tackler; the tackler tries to stop them cold.
// Best of 5 rounds. Power + timing decide it.
//
// PHYSICS (Merlin, 2026-11-02 rebuild):
// - NO auto-run: speed = power * MAX_SPEED. Power starts at 0 and builds
//   ONLY from taps (mashing). Each tap adds a burst; power decays when idle.
//   No mash = no run. Holding does nothing.
// - KNOCKBACK: when the clash resolves, the loser is physically knocked
//   back (velocity away from contact) and falls over. The winner stumbles
//   through. This animates over CLASH_DURATION before the next round.

export const LANE_W = 4;
export const LANE_L = 40;
export const MAX_SPEED = 12; // m/s at full power
export const TAP_BURST = 0.22; // power added per tap
export const POWER_DECAY = 0.55; // power lost per second when idle
export const CLASH_DURATION = 1.25; // seconds of knockback animation
export const KNOCKBACK_SPEED = 7; // m/s initial loser velocity
export const KNOCKBACK_DIST = 2.8; // target knockback distance (m)

export function createRunItStraight(playerName = 'You') {
  return {
    status: 'ready', // ready -> run -> clash -> done
    round: 1,
    score: { you: 0, ai: 0 },
    youAttacking: true, // alternate who carries
    you: { z: LANE_L / 2 - 4, speed: 0, power: 0 },
    ai: { z: -LANE_L / 2 + 4, speed: 0, power: 0 },
    clash: null, // { winner, loser, t, loserZ, loserVel, loserFall, winnerZ } during clash
    events: [],
    winner: null,
  };
}

export function startRound(state, rng = Math.random) {
  state.you.z = LANE_L / 2 - 4;
  state.ai.z = -LANE_L / 2 + 4;
  state.you.speed = 0;
  state.ai.speed = 0;
  // BOTH start at zero power. AI "mashes" via effort variance (see stepRunIt).
  state.ai.power = 0;
  state.you.power = 0;
  state.clash = null;
  state.status = 'run';
  state.events.push({ type: 'round', round: state.round, youAttacking: state.youAttacking });
}

/** A tap on RUN (you) — adds a power burst. Holding does nothing. */
export function tapYou(state) {
  if (state.status !== 'run') return;
  state.you.power = Math.min(1, state.you.power + TAP_BURST);
}

export function stepRunIt(state, dt, rng = Math.random) {
  state.events.length = 0;
  if (state.status === 'clash') {
    stepClash(state, dt);
    return;
  }
  if (state.status !== 'run') return;

  // YOUR power decays when you're not tapping. No tap = no run.
  state.you.power = Math.max(0, state.you.power - POWER_DECAY * dt);

  // AI "mashes": effort pulses like a human tapping — bursts with variance,
  // not constant speed. Base effort 0.55–0.95, pulsing at ~3Hz with noise.
  const t = (state._aiT || 0) + dt;
  state._aiT = t;
  const pulse = 0.5 + 0.5 * Math.sin(t * 19 + Math.sin(t * 7) * 2);
  const aiTarget = 0.55 + pulse * 0.4;
  // AI power chases its target (simulates tap bursts + decay)
  state.ai.power += (aiTarget - state.ai.power) * Math.min(1, dt * 6);

  // Speed comes ONLY from power. Zero power = zero speed = standing still.
  state.you.speed = state.you.power * MAX_SPEED;
  state.ai.speed = state.ai.power * MAX_SPEED;

  state.you.z -= state.you.speed * dt;
  state.ai.z += state.ai.speed * dt;

  // Clash when they meet
  if (state.you.z <= state.ai.z + 1) {
    beginClash(state, rng);
  }
}

function beginClash(state, rng) {
  // Resolve: attacker power vs defender power + randomness.
  // Speed at impact matters: blend in current speed as a momentum factor.
  const attacker = state.youAttacking ? state.you : state.ai;
  const defender = state.youAttacking ? state.ai : state.you;
  const attackRoll = attacker.power * (0.85 + rng() * 0.3) * (0.7 + 0.3 * (attacker.speed / MAX_SPEED));
  const defendRoll = defender.power * (0.85 + rng() * 0.3) * (0.7 + 0.3 * (defender.speed / MAX_SPEED));
  const attackerWins = attackRoll > defendRoll;
  const winnerId = attackerWins
    ? (state.youAttacking ? 'you' : 'ai')
    : (state.youAttacking ? 'ai' : 'you');
  const loserId = winnerId === 'you' ? 'ai' : 'you';
  state.score[winnerId] += 1;

  // Knockback setup: loser flies AWAY from the clash point.
  // You run toward -z, AI runs toward +z.
  const clashZ = (state.you.z + state.ai.z) / 2;
  const loserDir = loserId === 'you' ? 1 : -1; // you get knocked toward +z, AI toward -z
  state.clash = {
    winner: winnerId,
    loser: loserId,
    attackerWins,
    t: 0,
    clashZ,
    loserZ: loserId === 'you' ? state.you.z : state.ai.z,
    loserVel: KNOCKBACK_SPEED * loserDir,
    loserFall: 0, // 0 = upright, 1 = flat on back
    winnerZ: winnerId === 'you' ? state.you.z : state.ai.z,
    winnerStumble: 0, // winner stumbles forward this far
  };
  state.status = 'clash';
  state.events.push({
    type: 'clash',
    winner: winnerId,
    attackerWins,
    youAttacking: state.youAttacking,
    score: { ...state.score },
  });
  if (state.score.you >= 3 || state.score.ai >= 3) {
    // Still finish the knockback animation, then declare the winner.
    state._pendingWin = state.score.you > state.score.ai ? 'you' : 'ai';
  }
}

function stepClash(state, dt) {
  const c = state.clash;
  if (!c) return;
  c.t += dt;
  const k = Math.min(1, c.t / CLASH_DURATION);

  // Loser: ballistic knockback with ease-out, falls over.
  // Velocity decays; position integrates; fall rotates to flat.
  const decay = Math.max(0, 1 - k * 1.6);
  c.loserZ += c.loserVel * decay * dt;
  c.loserFall = Math.min(1, k * 1.4);

  // Winner: stumbles forward through the contact (1.2m), then plants.
  c.winnerStumble = Math.min(1.2, k * 2.2);
  const wdir = c.winner === 'you' ? -1 : 1;
  c.winnerZ += wdir * 2.2 * Math.max(0, 1 - k * 2) * dt;

  if (k >= 1) {
    if (state._pendingWin) {
      state.status = 'done';
      state.winner = state._pendingWin;
      state._pendingWin = null;
      state.events.push({ type: 'win', winner: state.winner });
    } else {
      nextRound(state);
    }
  }
}

export function nextRound(state) {
  state.round += 1;
  state.youAttacking = !state.youAttacking;
  state._aiT = 0;
  startRound(state);
}
