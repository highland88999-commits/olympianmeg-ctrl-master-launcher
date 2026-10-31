// lib/sports/volleyball.js — Volleyball rules (pure, node-tested).
//
// 2v2 beach volleyball: you + AI teammate vs 2 AI. First to 21,
// win by 2. Rally scoring. Three hits per side max.

export const COURT_W = 16; // metres, sideline to sideline
export const COURT_L = 18; // baseline to baseline
export const NET_H = 2.43;
export const WIN_SCORE = 21;

export function createVolleyball(playerName = 'You') {
  return {
    status: 'serve', // serve -> rally -> point -> serve ... -> done
    score: { blue: 0, red: 0 },
    serving: 'blue',
    ball: { x: 0, y: 3, z: 8, vx: 0, vy: 0, vz: 0, lastTouch: null, touches: 0 },
    players: [
      { id: 'you', name: playerName, team: 'blue', isHuman: true, x: -3, z: 6, targetX: -3, targetZ: 6 },
      { id: 'blue-ai', name: 'AI Teammate', team: 'blue', isHuman: false, x: 3, z: 6, targetX: 3, targetZ: 6 },
      { id: 'red-1', name: 'AI Opponent', team: 'red', isHuman: false, x: -3, z: -6, targetX: -3, targetZ: -6 },
      { id: 'red-2', name: 'AI Opponent', team: 'red', isHuman: false, x: 3, z: -6, targetX: 3, targetZ: -6 },
    ],
    events: [],
    winner: null,
  };
}

export function serveBall(state) {
  const server = state.players.find((p) => p.team === state.serving && (p.isHuman || p.id.endsWith('-ai') || p.id.startsWith('red')));
  const s = state.players.find((p) => p.team === state.serving);
  state.ball.x = s.x;
  state.ball.y = 2.5;
  state.ball.z = s.z;
  // Serve over the net toward the other side
  const dirZ = state.serving === 'blue' ? -1 : 1;
  state.ball.vx = (Math.random() - 0.5) * 4;
  state.ball.vy = 6;
  state.ball.vz = dirZ * (10 + Math.random() * 3);
  state.ball.lastTouch = state.serving;
  state.ball.touches = 1;
  state.status = 'rally';
  state.events.push({ type: 'served', team: state.serving });
}

function scorePoint(state, team) {
  state.score[team] += 1;
  state.events.push({ type: 'point', team, score: { ...state.score } });
  if (state.score[team] >= WIN_SCORE && state.score[team] - state.score[team === 'blue' ? 'red' : 'blue'] >= 2) {
    state.status = 'done';
    state.winner = team;
    state.events.push({ type: 'win', winner: team });
  } else {
    state.status = 'serve';
    state.serving = team;
  }
}

export function stepVolleyball(state, dt, human, rng = Math.random) {
  state.events.length = 0;
  if (state.status !== 'rally') return;

  const b = state.ball;
  // Gravity
  b.vy -= 14 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Ground bounce = point over. Team whose side it landed on loses the rally.
  if (b.y <= 0.25) {
    const landingSide = b.z > 0 ? 'blue' : 'red';
    scorePoint(state, landingSide === 'blue' ? 'red' : 'blue');
    return;
  }

  // Net collision
  if (Math.abs(b.z) < 0.4 && b.y < NET_H + 0.3 && Math.abs(b.x) < COURT_W / 2) {
    if (b.y < NET_H) {
      // Hit the net — fault, other team scores
      scorePoint(state, b.lastTouch === 'blue' ? 'red' : 'blue');
      return;
    }
  }

  // Out of bounds in the air is fine; only landing matters.

  // Human movement
  const you = state.players.find((p) => p.isHuman);
  if (you && human) {
    you.x = Math.max(-COURT_W / 2, Math.min(COURT_W / 2, you.x + human.mx * 7 * dt));
    // Blue stays on blue side (z > 0)
    you.z = Math.max(0.5, Math.min(COURT_L / 2, you.z + human.mz * 7 * dt));
    // Hit the ball
    if (human.act) {
      const dx = b.x - you.x;
      const dy = b.y - 1.5;
      const dz = b.z - you.z;
      if (Math.hypot(dx, dy, dz) < 2.2 && b.lastTouch !== 'blue') {
        hitBall(state, you, rng);
      } else if (Math.hypot(dx, dy, dz) < 2.2) {
        hitBall(state, you, rng);
      }
    }
  }

  // AI: move toward ball if it's on their side and coming
  for (const p of state.players) {
    if (p.isHuman) continue;
    const sideZ = p.team === 'blue' ? 1 : -1;
    const ballOnSide = (b.z * sideZ) > 0;
    if (ballOnSide && b.vy < 2 && b.y < 5) {
      // Chase the ball's landing spot
      p.targetX = Math.max(-COURT_W / 2 + 1, Math.min(COURT_W / 2 - 1, b.x));
      p.targetZ = p.team === 'blue'
        ? Math.max(0.5, Math.min(COURT_L / 2 - 1, b.z))
        : Math.max(-COURT_L / 2 + 1, Math.min(-0.5, b.z));
    } else {
      // Return to base
      p.targetX = p.id.includes('1') || p.id === 'blue-ai' ? (p.team === 'blue' ? 3 : -3) : (p.team === 'blue' ? -3 : 3);
      p.targetZ = p.team === 'blue' ? 6 : -6;
    }
    const dx = p.targetX - p.x;
    const dz = p.targetZ - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.2) {
      const sp = 5.5 * dt;
      p.x += (dx / dist) * Math.min(sp, dist);
      p.z += (dz / dist) * Math.min(sp, dist);
    }
    // AI hits the ball
    const bdx = b.x - p.x;
    const bdz = b.z - p.z;
    if (Math.hypot(bdx, b.y - 1.5, bdz) < 1.8 && b.lastTouch !== p.team && rng() < 0.9) {
      hitBall(state, p, rng);
    }
  }
}

function hitBall(state, player, rng) {
  const b = state.ball;
  const targetZ = player.team === 'blue' ? -(4 + rng() * 4) : 4 + rng() * 4;
  const targetX = (rng() - 0.5) * (COURT_W - 4);
  // Arc the ball to the target
  const dz = targetZ - b.z;
  const dx = targetX - b.x;
  const airTime = 0.9;
  b.vx = dx / airTime;
  b.vz = dz / airTime;
  b.vy = (0 - b.y + 0.5 * 14 * airTime * airTime) / airTime + 2;
  b.lastTouch = player.team;
  b.touches = 0;
  state.events.push({ type: 'hit', playerId: player.id, team: player.team });
}
