// lib/sports/tennis.js — Tennis / table tennis rules (pure, node-tested).
//
// Singles: you vs AI. First to 6 games, win by 2 (no tiebreak —
// sudden-death game at 6-6). Table tennis: first to 11 points, win by 2.
//
// variant: 'tennis' | 'table' — scales court, speed, scoring.

export function courtDims(variant) {
  return variant === 'table'
    ? { W: 1.525, L: 2.74, NET_H: 0.1525, BALL_R: 0.02 }
    : { W: 10.97, L: 23.77, NET_H: 0.914, BALL_R: 0.033 };
}

export function createRacket(variant = 'tennis', playerName = 'You') {
  const target = variant === 'table' ? 11 : 6;
  return {
    variant,
    target,
    status: 'serve',
    score: { you: 0, ai: 0 },
    serving: 'you',
    ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, lastHit: null },
    you: { x: 0, z: variant === 'table' ? 1.2 : 10 },
    ai: { x: 0, z: variant === 'table' ? -1.2 : -10 },
    events: [],
    winner: null,
  };
}

export function serveRacket(state, rng = Math.random) {
  const d = courtDims(state.variant);
  const server = state.serving === 'you' ? state.you : state.ai;
  const dirZ = state.serving === 'you' ? -1 : 1;
  state.ball.x = server.x;
  state.ball.y = d.NET_H + 0.5;
  state.ball.z = server.z;
  const speed = state.variant === 'table' ? 4 : 18;
  state.ball.vx = (rng() - 0.5) * speed * 0.3;
  state.ball.vy = speed * 0.25;
  state.ball.vz = dirZ * speed;
  state.ball.lastHit = state.serving;
  state.status = 'rally';
}

function scoreRacketPoint(state, winner) {
  state.score[winner] += 1;
  state.events.push({ type: 'point', winner, score: { ...state.score } });
  const target = state.target;
  const diff = state.score[winner] - state.score[winner === 'you' ? 'ai' : 'you'];
  if (state.score[winner] >= target && diff >= 2) {
    state.status = 'done';
    state.winner = winner;
    state.events.push({ type: 'win', winner });
  } else {
    state.status = 'serve';
    state.serving = winner; // winner serves next
  }
}

export function stepRacket(state, dt, human, rng = Math.random) {
  state.events.length = 0;
  if (state.status !== 'rally') return;
  const d = courtDims(state.variant);
  const b = state.ball;
  const gravity = state.variant === 'table' ? 9.8 : 12;

  b.vy -= gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Table/floor bounce — one bounce allowed, second = point over
  const floorY = state.variant === 'table' ? 0.76 : 0;
  if (b.y <= floorY + d.BALL_R && b.vy < 0) {
    if (b.bounces === undefined) b.bounces = 0;
    b.bounces += 1;
    b.y = floorY + d.BALL_R;
    b.vy *= -0.75;
    if (b.bounces >= 2) {
      // Double bounce — point to the other player
      scoreRacketPoint(state, b.lastHit === 'you' ? 'ai' : 'you');
      return;
    }
  }

  // Out past the baseline = point over
  if (Math.abs(b.z) > d.L / 2 + (state.variant === 'table' ? 0.5 : 3)) {
    // Who hit it last? If you hit it and it went long, AI scores.
    scoreRacketPoint(state, b.lastHit === 'you' ? 'ai' : 'you');
    return;
  }
  // Wide
  if (Math.abs(b.x) > d.W / 2 + (state.variant === 'table' ? 0.5 : 3) && b.y < 1) {
    scoreRacketPoint(state, b.lastHit === 'you' ? 'ai' : 'you');
    return;
  }

  // Net
  if (Math.abs(b.z) < 0.15 && b.y < d.NET_H + 0.1 && Math.abs(b.x) < d.W / 2) {
    if (b.y < d.NET_H) {
      scoreRacketPoint(state, b.lastHit === 'you' ? 'ai' : 'you');
      return;
    }
  }

  // Human hit
  if (human && human.act) {
    const dx = b.x - state.you.x;
    const dz = b.z - state.you.z;
    const reach = state.variant === 'table' ? 0.6 : 2.5;
    if (Math.hypot(dx, b.y - 1, dz) < reach && b.z > 0 !== false) {
      returnBall(state, 'you', rng);
    }
  }
  // Human movement
  if (human) {
    const speed = state.variant === 'table' ? 2.5 : 9;
    state.you.x = Math.max(-d.W / 2 - 1, Math.min(d.W / 2 + 1, state.you.x + human.mx * speed * dt));
    const baseZ = state.variant === 'table' ? 1.2 : 10;
    state.you.z = Math.max(baseZ - 2, Math.min(baseZ + 3, state.you.z + human.mz * speed * dt));
  }

  // AI: track the ball, hit it back
  const ai = state.ai;
  const aiBaseZ = state.variant === 'table' ? -1.2 : -10;
  if (b.vz < 0 || b.z < 0) {
    // Ball coming to AI side — move to intercept
    const tHit = b.vz !== 0 ? (aiBaseZ - b.z) / b.vz : 0;
    const predictX = b.x + b.vx * Math.max(0, tHit);
    ai.x += (Math.max(-d.W / 2, Math.min(d.W / 2, predictX)) - ai.x) * Math.min(1, 6 * dt);
    ai.z += ((aiBaseZ + Math.max(-1, Math.min(1, b.z - aiBaseZ))) - ai.z) * Math.min(1, 4 * dt);
  } else {
    ai.x += (0 - ai.x) * Math.min(1, 3 * dt);
    ai.z += (aiBaseZ - ai.z) * Math.min(1, 3 * dt);
  }
  const adx = b.x - ai.x;
  const adz = b.z - ai.z;
  const aiReach = state.variant === 'table' ? 0.5 : 2.2;
  if (Math.hypot(adx, b.y - 1, adz) < aiReach && b.vz < 0 && rng() < 0.95) {
    returnBall(state, 'ai', rng);
  }
}

function returnBall(state, hitter, rng) {
  const d = courtDims(state.variant);
  const b = state.ball;
  const dirZ = hitter === 'you' ? -1 : 1;
  // Aim for the other side with some randomness
  const targetX = (rng() - 0.5) * d.W * 0.8;
  const targetZ = dirZ * (d.L / 4 + rng() * d.L / 4);
  const speed = state.variant === 'table' ? 3.5 + rng() * 2 : 14 + rng() * 8;
  const dx = targetX - b.x;
  const dz = targetZ - b.z;
  const dist = Math.hypot(dx, dz) || 1;
  b.vx = (dx / dist) * speed;
  b.vz = (dz / dist) * speed;
  b.vy = (state.variant === 'table' ? 1.5 : 3) + rng() * 2;
  b.bounces = 0;
  b.lastHit = hitter;
  state.events.push({ type: 'hit', hitter });
}
