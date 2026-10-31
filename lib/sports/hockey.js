// lib/sports/hockey.js — Ice hockey rules (pure, node-tested).
//
// 3v3: you + 2 AI vs 3 AI. Two 3-minute periods. Most goals wins.

export const RINK_W = 30;
export const RINK_L = 60;
export const GOAL_W = 4;
export const PERIOD_SECONDS = 180;

export function createHockey(playerName = 'You') {
  return {
    status: 'faceoff', // faceoff -> play -> goal -> faceoff ... -> done
    period: 1,
    clock: PERIOD_SECONDS,
    score: { blue: 0, red: 0 },
    puck: { x: 0, z: 0, vx: 0, vz: 0, holder: null },
    players: [
      { id: 'you', name: playerName, team: 'blue', isHuman: true, x: -4, z: 10, vx: 0, vz: 0 },
      { id: 'blue-1', name: 'AI Teammate', team: 'blue', isHuman: false, x: 4, z: 10, vx: 0, vz: 0 },
      { id: 'blue-2', name: 'AI Teammate', team: 'blue', isHuman: false, x: 0, z: 18, vx: 0, vz: 0 },
      { id: 'red-1', name: 'AI Opponent', team: 'red', isHuman: false, x: -4, z: -10, vx: 0, vz: 0 },
      { id: 'red-2', name: 'AI Opponent', team: 'red', isHuman: false, x: 4, z: -10, vx: 0, vz: 0 },
      { id: 'red-3', name: 'AI Opponent', team: 'red', isHuman: false, x: 0, z: -18, vx: 0, vz: 0 },
    ],
    events: [],
    winner: null,
  };
}

export function faceoff(state) {
  state.puck.x = 0; state.puck.z = 0;
  state.puck.vx = 0; state.puck.vz = 0;
  state.puck.holder = null;
  // Reset positions
  const spots = {
    you: [-4, 10], 'blue-1': [4, 10], 'blue-2': [0, 18],
    'red-1': [-4, -10], 'red-2': [4, -10], 'red-3': [0, -18],
  };
  for (const p of state.players) {
    const [x, z] = spots[p.id] || [0, 0];
    p.x = x; p.z = z; p.vx = 0; p.vz = 0;
  }
  state.status = 'play';
}

function scoreGoal(state, team) {
  state.score[team] += 1;
  state.events.push({ type: 'goal', team, score: { ...state.score } });
  state.status = 'faceoff';
}

export function stepHockey(state, dt, human, rng = Math.random) {
  state.events.length = 0;
  if (state.status !== 'play') return;

  // Clock
  state.clock -= dt;
  if (state.clock <= 0) {
    if (state.period === 1) {
      state.period = 2;
      state.clock = PERIOD_SECONDS;
      state.status = 'faceoff';
      state.events.push({ type: 'period', period: 2 });
    } else {
      state.status = 'done';
      state.winner = state.score.blue > state.score.red ? 'blue' : state.score.red > state.score.blue ? 'red' : 'tie';
      state.events.push({ type: 'win', winner: state.winner });
    }
    return;
  }

  const puck = state.puck;

  // Human movement
  const you = state.players.find((p) => p.isHuman);
  if (you && human) {
    const speed = 12;
    you.vx = human.mx * speed;
    you.vz = human.mz * speed;
    you.x = Math.max(-RINK_W / 2 + 1, Math.min(RINK_W / 2 - 1, you.x + you.vx * dt));
    you.z = Math.max(-RINK_L / 2 + 1, Math.min(RINK_L / 2 - 1, you.z + you.vz * dt));
    // Pick up puck
    if (!puck.holder && Math.hypot(puck.x - you.x, puck.z - you.z) < 1.5) {
      puck.holder = you.id;
    }
    // Shoot / pass
    if (human.act && puck.holder === you.id) {
      puck.holder = null;
      // Shoot toward opponent goal (red defends z=-30, blue defends z=+30)
      const targetZ = -RINK_L / 2;
      const dx = (rng() - 0.5) * GOAL_W - puck.x;
      const dz = targetZ - puck.z;
      const dist = Math.hypot(dx, dz);
      const power = 28;
      puck.vx = (dx / dist) * power;
      puck.vz = (dz / dist) * power;
      state.events.push({ type: 'shot', playerId: you.id });
    }
  }

  // AI movement and puck logic
  for (const p of state.players) {
    if (p.isHuman) continue;
    const targetGoalZ = p.team === 'blue' ? -RINK_L / 2 : RINK_L / 2;
    const ownGoalZ = p.team === 'blue' ? RINK_L / 2 : -RINK_L / 2;

    if (puck.holder === p.id) {
      // Carry toward opponent goal
      const dx = 0 - p.x;
      const dz = targetGoalZ - p.z;
      const dist = Math.hypot(dx, dz);
      p.x += (dx / dist) * 10 * dt;
      p.z += (dz / dist) * 10 * dt;
      puck.x = p.x; puck.z = p.z;
      // Shoot when close
      if (Math.abs(p.z - targetGoalZ) < 12 && rng() < 0.02) {
        puck.holder = null;
        const sdx = (rng() - 0.5) * GOAL_W - puck.x;
        const sdz = targetGoalZ - puck.z;
        const sdist = Math.hypot(sdx, sdz);
        puck.vx = (sdx / sdist) * 26;
        puck.vz = (sdz / sdist) * 26;
      }
    } else if (!puck.holder) {
      // Chase loose puck
      const dx = puck.x - p.x;
      const dz = puck.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.5) {
        p.x += (dx / dist) * 9 * dt;
        p.z += (dz / dist) * 9 * dt;
      }
      if (dist < 1.5) puck.holder = p.id;
    } else {
      // Opponent has puck — defend
      const dx = puck.x - p.x;
      const dz = puck.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1) {
        p.x += (dx / dist) * 8 * dt;
        p.z += (dz / dist) * 8 * dt;
      }
      // Steal
      if (dist < 1.2 && rng() < 0.01) {
        puck.holder = p.id;
        state.events.push({ type: 'steal', playerId: p.id });
      }
    }
    // Keep in rink
    p.x = Math.max(-RINK_W / 2 + 1, Math.min(RINK_W / 2 - 1, p.x));
    p.z = Math.max(-RINK_L / 2 + 1, Math.min(RINK_L / 2 - 1, p.z));
  }

  // Puck physics (when not held)
  if (!puck.holder) {
    puck.x += puck.vx * dt;
    puck.z += puck.vz * dt;
    puck.vx *= (1 - 0.6 * dt);
    puck.vz *= (1 - 0.6 * dt);
    // Boards bounce
    if (Math.abs(puck.x) > RINK_W / 2 - 0.5) {
      puck.x = Math.sign(puck.x) * (RINK_W / 2 - 0.5);
      puck.vx *= -0.7;
    }
    if (Math.abs(puck.z) > RINK_L / 2 - 0.5) {
      // Goal check: within goal width?
      if (Math.abs(puck.x) < GOAL_W / 2) {
        scoreGoal(state, puck.z < 0 ? 'blue' : 'red');
        return;
      }
      puck.z = Math.sign(puck.z) * (RINK_L / 2 - 0.5);
      puck.vz *= -0.7;
    }
  }
}
