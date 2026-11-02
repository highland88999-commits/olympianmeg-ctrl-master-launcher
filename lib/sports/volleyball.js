// lib/sports/volleyball.js — Volleyball rules (pure, node-tested).
//
// 2v2 beach volleyball, FIVB beach rules (simplified for a tap game):
// - Court 16m x 8m (FIVB 1.1). Rally scoring.
// - Best of 3 sets: sets 1-2 to 21, deciding set to 15; win by 2, no cap.
// - 3 contacts per team max — beach rule: the block COUNTS as one of the 3.
// - Out of bounds on landing (FIVB 8.4): the team that last touched it loses.
// - Server must be behind the end line (FIVB 12.4); 8 seconds to serve (12.5.4).
// - Net cords that cross stay live (FIVB).
// - Server alternates between partners on side-out.
// Not modeled: side switches every 7/5 points, timeouts, coin toss,
// technique faults (carries, double contacts, open-hand digs).

export const COURT_W = 16; // metres, sideline to sideline (FIVB beach 1.1)
export const COURT_L = 16; // metres, baseline to baseline (FIVB beach 1.1)
export const NET_H = 2.43;
export const SERVE_WINDOW = 8; // seconds to serve (FIVB 12.5.4)
export const SET_PAUSE = 2.5; // seconds of breather between sets
export const MAX_TOUCHES = 3; // contacts per team, block counts (FIVB beach)

export function setTarget(set) {
  return set >= 3 ? 15 : 21;
}

export function createVolleyball(playerName = 'You') {
  const state = {
    status: 'serve', // serve -> rally -> serve ... -> setbreak -> serve ... -> done
    set: 1,
    sets: { blue: 0, red: 0 },
    score: { blue: 0, red: 0 },
    serving: 'blue',
    lastServer: { blue: 'you', red: 'red-1' },
    serveTimer: 0,
    ball: { x: 0, y: 3, z: 8, vx: 0, vy: 0, vz: 0, lastTouch: null, touches: 0, netTouched: false },
    players: [
      { id: 'you', name: playerName, team: 'blue', isHuman: true, x: -3, z: 6, targetX: -3, targetZ: 6 },
      { id: 'blue-ai', name: 'AI Teammate', team: 'blue', isHuman: false, x: 3, z: 6, targetX: 3, targetZ: 6 },
      { id: 'red-1', name: 'AI Opponent', team: 'red', isHuman: false, x: -3, z: -6, targetX: -3, targetZ: -6 },
      { id: 'red-2', name: 'AI Opponent', team: 'red', isHuman: false, x: 3, z: -6, targetX: 3, targetZ: -6 },
    ],
    events: [],
    winner: null,
  };
  beginServe(state, 'blue');
  return state;
}

export function beginServe(state, team) {
  state.serving = team;
  state.status = 'serve';
  state.serveTimer = 0;
  const mates = state.players.filter((p) => p.team === team);
  const server = mates.find((p) => p.id === state.lastServer[team]) || mates[0];
  state.lastServer[team] = server.id;
  // Server must be behind the end line (FIVB 12.4)
  const side = team === 'blue' ? 1 : -1;
  server.x = Math.max(-COURT_W / 2 + 1, Math.min(COURT_W / 2 - 1, server.x));
  server.z = side * (COURT_L / 2 + 1);
  server.targetX = server.x;
  server.targetZ = server.z;
  const b = state.ball;
  b.x = server.x;
  b.y = 2.5;
  b.z = server.z;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.lastTouch = null;
  b.touches = 0;
  b.netTouched = false;
  state.events.push({ type: 'serve-ready', team, serverId: server.id });
}

export function serveBall(state, rng = Math.random) {
  const mates = state.players.filter((p) => p.team === state.serving);
  const server = mates.find((p) => p.id === state.lastServer[state.serving]) || mates[0];
  // Server strikes from behind the end line (FIVB 12.4)
  const side = state.serving === 'blue' ? 1 : -1;
  server.z = side * (COURT_L / 2 + 1);
  state.ball.x = server.x;
  state.ball.y = 2.5;
  state.ball.z = server.z;
  // Serve over the net toward the other side (tuned to clear the net and land in)
  const dirZ = state.serving === 'blue' ? -1 : 1;
  state.ball.vx = (rng() - 0.5) * 2;
  state.ball.vy = 7 + rng() * 1.5;
  state.ball.vz = dirZ * (9 + rng() * 2.5);
  state.ball.lastTouch = state.serving;
  state.ball.touches = 1; // the serve counts as the first team contact
  state.ball.netTouched = false;
  state.status = 'rally';
  state.events.push({ type: 'served', team: state.serving, serverId: server.id });
}

export function scorePoint(state, team) {
  const other = team === 'blue' ? 'red' : 'blue';
  state.score[team] += 1;
  state.events.push({ type: 'point', team, score: { ...state.score }, set: state.set });
  // Side-out: service changes hands, so the partner serves next (FIVB beach).
  if (team !== state.serving) {
    const mates = state.players.filter((p) => p.team === team);
    const prev = mates.find((p) => p.id === state.lastServer[team]);
    const next = mates.find((p) => !prev || p.id !== prev.id) || mates[0];
    state.lastServer[team] = next.id;
  }
  const target = setTarget(state.set);
  if (state.score[team] >= target && state.score[team] - state.score[other] >= 2) {
    state.sets[team] += 1;
    state.events.push({ type: 'set', winner: team, sets: { ...state.sets }, set: state.set });
    if (state.sets[team] >= 2) {
      state.status = 'done';
      state.winner = team;
      state.events.push({ type: 'win', winner: team });
    } else {
      state.set += 1;
      state.score = { blue: 0, red: 0 };
      state.status = 'setbreak';
      state.serving = team; // set winner serves first in the next set
      state.events.push({ type: 'setbreak', set: state.set });
    }
  } else {
    beginServe(state, team);
  }
}

// Serve window: lets the human server move in the service zone and counts
// down the 8-second window. Returns true when the window expires (caller
// auto-serves — the playable call; FIVB strictly calls a fault).
export function stepServe(state, dt, human) {
  state.serveTimer += dt;
  const server = state.players.find((p) => p.id === state.lastServer[state.serving]);
  if (server && server.isHuman && human) {
    const side = state.serving === 'blue' ? 1 : -1;
    server.x = Math.max(-COURT_W / 2, Math.min(COURT_W / 2, server.x + human.mx * 7 * dt));
    if (side > 0) {
      server.z = Math.max(0.5, Math.min(COURT_L / 2 + 1.5, server.z + human.mz * 7 * dt));
    } else {
      server.z = Math.max(-COURT_L / 2 - 1.5, Math.min(-0.5, server.z + human.mz * 7 * dt));
    }
  }
  return state.serveTimer >= SERVE_WINDOW;
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

  // Ground bounce = point over.
  if (b.y <= 0.25) {
    const inCourt = Math.abs(b.x) <= COURT_W / 2 && Math.abs(b.z) <= COURT_L / 2;
    if (!inCourt && b.lastTouch) {
      // FIVB 8.4: ball out — the team that last touched it loses the rally.
      scorePoint(state, b.lastTouch === 'blue' ? 'red' : 'blue');
    } else {
      // In bounds: the team whose side it landed on loses the rally.
      const landingSide = b.z > 0 ? 'blue' : 'red';
      scorePoint(state, landingSide === 'blue' ? 'red' : 'blue');
    }
    return;
  }

  // Net cord: the ball may touch the net and dribble over or fall back —
  // it stays live as long as it crosses (FIVB). A ball that fails to cross
  // loses via the normal landing rule on the hitter's own side.
  if (!b.netTouched && Math.abs(b.z) < 0.45 && b.y < NET_H && Math.abs(b.x) < COURT_W / 2 + 0.5) {
    b.netTouched = true;
    b.vz *= -0.12;
    b.vx *= 0.4;
    b.vy = Math.min(b.vy, 0.5);
    state.events.push({ type: 'net', team: b.lastTouch });
  }
  if (Math.abs(b.z) > 1.2) b.netTouched = false;

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
      if (Math.hypot(dx, dy, dz) < 2.2) {
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

export function hitBall(state, player, rng) {
  const b = state.ball;
  // FIVB beach: the block counts as a team contact. Every consecutive team
  // contact increments the count; a 4th consecutive contact is a fault.
  if (b.lastTouch === player.team) {
    b.touches += 1;
    if (b.touches > MAX_TOUCHES) {
      state.events.push({ type: 'fault', fault: 'four-hits', team: player.team });
      scorePoint(state, player.team === 'blue' ? 'red' : 'blue');
      return;
    }
  } else {
    b.touches = 1;
  }
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
  b.netTouched = false;
  state.events.push({ type: 'hit', playerId: player.id, team: player.team });
}
