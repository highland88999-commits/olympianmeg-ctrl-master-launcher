// lib/sports/soccer.js — Soccer rules (pure, node-tested).
//
// 5v5: you + 4 AI vs 5 AI. Two 4-minute halves. Most goals wins.
// FIFA arcade style.

export const PITCH_W = 44;
export const PITCH_L = 68;
export const GOAL_W = 8;
export const HALF_SECONDS = 240;

export function createSoccer(playerName = 'You') {
  const mkTeam = (team, isBlue) => {
    const base = isBlue ? 1 : -1;
    return [
      { id: `${team}-gk`, name: 'AI Keeper', team, isHuman: false, x: 0, z: base * (PITCH_L / 2 - 3), role: 'gk' },
      { id: `${team}-d1`, name: team === 'blue' ? 'AI Defender' : 'AI Opponent', team, isHuman: false, x: -8, z: base * 18, role: 'df' },
      { id: `${team}-d2`, name: team === 'blue' ? 'AI Defender' : 'AI Opponent', team, isHuman: false, x: 8, z: base * 18, role: 'df' },
      { id: `${team}-m1`, name: team === 'blue' ? 'AI Midfielder' : 'AI Opponent', team, isHuman: false, x: -6, z: base * 4, role: 'mf' },
      { id: `${team}-m2`, name: team === 'blue' ? 'AI Midfielder' : 'AI Opponent', team, isHuman: false, x: 6, z: base * 4, role: 'mf' },
    ];
  };
  const players = [
    { id: 'you', name: playerName, team: 'blue', isHuman: true, x: 0, z: -8, role: 'fw' },
    ...mkTeam('blue', true),
    ...mkTeam('red', false),
  ];
  // Move one blue midfielder out — you take the striker spot
  players.find((p) => p.id === 'blue-m1').x = -10;
  return {
    status: 'kickoff',
    half: 1,
    clock: HALF_SECONDS,
    score: { blue: 0, red: 0 },
    ball: { x: 0, z: 0, vx: 0, vz: 0, holder: null },
    players,
    events: [],
    winner: null,
  };
}

export function kickoff(state) {
  state.ball.x = 0; state.ball.z = 0;
  state.ball.vx = 0; state.ball.vz = 0;
  state.ball.holder = null;
  for (const p of state.players) {
    const base = p.team === 'blue' ? 1 : -1;
    if (p.role === 'gk') { p.x = 0; p.z = base * (PITCH_L / 2 - 3); }
    else if (p.role === 'df') { p.x = p.id.endsWith('d1') ? -8 : 8; p.z = base * 18; }
    else if (p.role === 'mf') { p.x = p.id.endsWith('m1') ? -10 : 6; p.z = base * 4; }
    else { p.x = 0; p.z = p.isHuman ? -8 : 8; }
  }
  state.status = 'play';
}

function scoreGoal(state, team) {
  state.score[team] += 1;
  state.events.push({ type: 'goal', team, score: { ...state.score } });
  state.status = 'kickoff';
}

export function stepSoccer(state, dt, human, rng = Math.random) {
  state.events.length = 0;
  if (state.status !== 'play') return;

  state.clock -= dt;
  if (state.clock <= 0) {
    if (state.half === 1) {
      state.half = 2;
      state.clock = HALF_SECONDS;
      state.status = 'kickoff';
      state.events.push({ type: 'half', half: 2 });
    } else {
      state.status = 'done';
      state.winner = state.score.blue > state.score.red ? 'blue' : state.score.red > state.score.blue ? 'red' : 'tie';
      state.events.push({ type: 'win', winner: state.winner });
    }
    return;
  }

  const ball = state.ball;
  const you = state.players.find((p) => p.isHuman);

  if (you && human) {
    const speed = 11;
    you.x = Math.max(-PITCH_W / 2 + 1, Math.min(PITCH_W / 2 - 1, you.x + human.mx * speed * dt));
    you.z = Math.max(-PITCH_L / 2 + 1, Math.min(PITCH_L / 2 - 1, you.z + human.mz * speed * dt));
    if (!ball.holder && Math.hypot(ball.x - you.x, ball.z - you.z) < 1.6) ball.holder = you.id;
    if (human.act && ball.holder === you.id) {
      ball.holder = null;
      const targetZ = -PITCH_L / 2;
      const dx = (rng() - 0.5) * GOAL_W - ball.x;
      const dz = targetZ - ball.z;
      const dist = Math.hypot(dx, dz);
      const power = 30;
      ball.vx = (dx / dist) * power;
      ball.vz = (dz / dist) * power;
      state.events.push({ type: 'shot', playerId: you.id });
    }
  }

  for (const p of state.players) {
    if (p.isHuman) continue;
    const targetGoalZ = p.team === 'blue' ? -PITCH_L / 2 : PITCH_L / 2;

    if (ball.holder === p.id) {
      const dx = -p.x * 0.3;
      const dz = targetGoalZ - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      const sp = p.role === 'gk' ? 6 : 9;
      p.x += (dx / dist) * sp * dt;
      p.z += (dz / dist) * sp * dt;
      ball.x = p.x; ball.z = p.z;
      if (Math.abs(p.z - targetGoalZ) < 16 && rng() < 0.025) {
        ball.holder = null;
        const sdx = (rng() - 0.5) * GOAL_W - ball.x;
        const sdz = targetGoalZ - ball.z;
        const sdist = Math.hypot(sdx, sdz) || 1;
        ball.vx = (sdx / sdist) * 28;
        ball.vz = (sdz / sdist) * 28;
      }
    } else if (!ball.holder) {
      // Chase or hold shape
      const shouldChase = p.role !== 'gk' && Math.hypot(ball.x - p.x, ball.z - p.z) < 18;
      if (shouldChase) {
        const dx = ball.x - p.x;
        const dz = ball.z - p.z;
        const dist = Math.hypot(dx, dz) || 1;
        p.x += (dx / dist) * 8.5 * dt;
        p.z += (dz / dist) * 8.5 * dt;
        if (dist < 1.6) ball.holder = p.id;
      }
      // Keeper stays near goal
      if (p.role === 'gk') {
        const gz = p.team === 'blue' ? PITCH_L / 2 - 3 : -PITCH_L / 2 + 3;
        p.x += (Math.max(-4, Math.min(4, ball.x)) - p.x) * 2 * dt;
        p.z += (gz - p.z) * 2 * dt;
        if (Math.hypot(ball.x - p.x, ball.z - p.z) < 1.8) {
          ball.holder = p.id;
          // Keeper clears it
          ball.holder = null;
          ball.vx = (rng() - 0.5) * 10;
          ball.vz = (p.team === 'blue' ? -1 : 1) * 22;
        }
      }
    } else {
      // Defend: move toward ball carrier
      const dx = ball.x - p.x;
      const dz = ball.z - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > 2 && p.role !== 'gk') {
        p.x += (dx / dist) * 8 * dt;
        p.z += (dz / dist) * 8 * dt;
      }
      if (dist < 1.4 && rng() < 0.012) {
        ball.holder = p.id;
        state.events.push({ type: 'steal', playerId: p.id });
      }
    }
    p.x = Math.max(-PITCH_W / 2 + 1, Math.min(PITCH_W / 2 - 1, p.x));
    p.z = Math.max(-PITCH_L / 2 + 1, Math.min(PITCH_L / 2 - 1, p.z));
  }

  if (!ball.holder) {
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    ball.vx *= (1 - 0.8 * dt);
    ball.vz *= (1 - 0.8 * dt);
    if (Math.abs(ball.x) > PITCH_W / 2 - 0.5) {
      ball.x = Math.sign(ball.x) * (PITCH_W / 2 - 0.5);
      ball.vx *= -0.6;
    }
    if (Math.abs(ball.z) > PITCH_L / 2 - 0.5) {
      if (Math.abs(ball.x) < GOAL_W / 2) {
        scoreGoal(state, ball.z < 0 ? 'blue' : 'red');
        return;
      }
      ball.z = Math.sign(ball.z) * (PITCH_L / 2 - 0.5);
      ball.vz *= -0.6;
    }
  }
}
