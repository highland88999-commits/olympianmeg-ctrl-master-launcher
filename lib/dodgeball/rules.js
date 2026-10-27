// lib/dodgeball/rules.js — Dodgeball, pure game logic (no DOM, no three).
//
// Classic rules, kept small on purpose:
//   · 3v3: you + 2 ally bots (blue) vs 3 bots (red).
//   · Throw a ball to hit an opponent out. A caught ball puts the
//     THROWER out. Last team standing wins.
//   · One ball carried at a time; walk over a loose ball to pick it up.
//   · Fairness is structural: bots and the player share the same speed,
//     the same throw speed, the same cooldown, and the same hit rules.
//     Bots differ only in that their catches are chance-based (30%)
//     while the player's catch is a timed button press — skill vs
//     chance, never a rigged outcome.
//   · Facing convention: a direction is (sin(facing), cos(facing)) in
//     (x, z). Blue attacks toward -Z (facing PI), red toward +Z (0).

export const COURT_HALF_W = 8; // court is 16 m wide (x)
export const COURT_HALF_D = 14; // court is 28 m deep (z)
export const PLAYER_SPEED = 6; // m/s — same for player and bots
export const THROW_SPEED = 22; // m/s — same for player and bots
export const THROW_COOLDOWN = 0.8; // s — same for player and bots
export const BALL_RADIUS = 0.35;
export const PLAYER_RADIUS = 0.6;
export const PICKUP_DIST = 1.1;
export const CATCH_DIST = 2.4; // press ACT inside this to catch
export const CATCH_PROMPT_DIST = 4.5; // HUD "CATCH!" prompt range
export const BOT_CATCH_PROB = 0.3;
export const BOT_DODGE_PROB = 0.5;
export const BOT_AIM_SPREAD = 0.12; // radians of aim noise, bots only
export const BOT_THREAT_DIST = 6; // bots react to balls inside this
export const CATCH_FACE_COS = Math.cos(Math.PI / 3); // bots must face within 60 deg
export const AUTO_AIM_CONE_COS = Math.cos((35 * Math.PI) / 180); // player auto-aim cone
export const BALL_COUNT = 3;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hypot = (x, z) => Math.sqrt(x * x + z * z);

export function dirFromFacing(facing) {
  return { x: Math.sin(facing), z: Math.cos(facing) };
}

export function teamOf(player) {
  return player.team;
}

export function teamAlive(state, team) {
  return state.players.filter((p) => p.team === team && p.alive);
}

export function otherTeam(team) {
  return team === 'blue' ? 'red' : 'blue';
}

export function createMatch() {
  const players = [
    { id: 'you', team: 'blue', isHuman: true, alive: true, x: 0, z: 10, facing: Math.PI, hasBall: null, cooldown: 0 },
    { id: 'blue-1', team: 'blue', isHuman: false, alive: true, x: -3, z: 11, facing: Math.PI, hasBall: null, cooldown: 0 },
    { id: 'blue-2', team: 'blue', isHuman: false, alive: true, x: 3, z: 11, facing: Math.PI, hasBall: null, cooldown: 0 },
    { id: 'red-1', team: 'red', isHuman: false, alive: true, x: 0, z: -10, facing: 0, hasBall: null, cooldown: 0 },
    { id: 'red-2', team: 'red', isHuman: false, alive: true, x: -3, z: -11, facing: 0, hasBall: null, cooldown: 0 },
    { id: 'red-3', team: 'red', isHuman: false, alive: true, x: 3, z: -11, facing: 0, hasBall: null, cooldown: 0 },
  ];
  const balls = [
    { id: 0, mode: 'loose', x: -4, z: 0, vx: 0, vz: 0, carrierId: null, throwerId: null },
    { id: 1, mode: 'loose', x: 0, z: 0, vx: 0, vz: 0, carrierId: null, throwerId: null },
    { id: 2, mode: 'loose', x: 4, z: 0, vx: 0, vz: 0, carrierId: null, throwerId: null },
  ];
  return { status: 'playing', winner: null, players, balls, events: [] };
}

export function movePlayer(state, player, mx, mz, dt) {
  if (!player.alive) return;
  const len = hypot(mx, mz);
  if (len <= 0) return;
  const nx = mx / len;
  const nz = mz / len;
  player.x = clamp(player.x + nx * PLAYER_SPEED * dt, -COURT_HALF_W + PLAYER_RADIUS, COURT_HALF_W - PLAYER_RADIUS);
  player.z = clamp(player.z + nz * PLAYER_SPEED * dt, -COURT_HALF_D + PLAYER_RADIUS, COURT_HALF_D - PLAYER_RADIUS);
  player.facing = Math.atan2(nx, nz);
}

function dropCarriedBall(state, player) {
  if (player.hasBall === null) return;
  const ball = state.balls[player.hasBall];
  if (ball) {
    ball.mode = 'loose';
    ball.x = player.x;
    ball.z = player.z;
    ball.vx = 0;
    ball.vz = 0;
    ball.carrierId = null;
    ball.throwerId = null;
  }
  player.hasBall = null;
}

function checkWin(state) {
  if (state.status !== 'playing') return;
  if (teamAlive(state, 'blue').length === 0) {
    state.status = 'over';
    state.winner = 'red';
    state.events.push({ type: 'win', winner: 'red' });
  } else if (teamAlive(state, 'red').length === 0) {
    state.status = 'over';
    state.winner = 'blue';
    state.events.push({ type: 'win', winner: 'blue' });
  }
}

export function eliminate(state, player) {
  if (!player.alive) return;
  player.alive = false;
  dropCarriedBall(state, player);
  state.events.push({ type: 'out', victimId: player.id, victimTeam: player.team });
  checkWin(state);
}

function doCatch(state, catcher, ball) {
  const thrower = state.players.find((p) => p.id === ball.throwerId);
  ball.mode = 'carried';
  ball.carrierId = catcher.id;
  ball.throwerId = null;
  ball.vx = 0;
  ball.vz = 0;
  catcher.hasBall = ball.id;
  state.events.push({ type: 'caught', catcherId: catcher.id, throwerId: thrower ? thrower.id : null });
  if (thrower && thrower.alive) eliminate(state, thrower);
}

/** An enemy ball flying toward this player and close enough to catch. */
export function incomingBallFor(state, player) {
  if (!player.alive) return null;
  let best = null;
  let bestD = Infinity;
  for (const ball of state.balls) {
    if (ball.mode !== 'flying' || !ball.throwerId) continue;
    const thrower = state.players.find((p) => p.id === ball.throwerId);
    if (!thrower || thrower.team === player.team) continue;
    const dx = player.x - ball.x;
    const dz = player.z - ball.z;
    const d = hypot(dx, dz);
    if (d >= CATCH_DIST) continue;
    // Approaching: the ball's velocity points toward the player.
    if (ball.vx * dx + ball.vz * dz <= 0) continue;
    if (d < bestD) {
      bestD = d;
      best = ball;
    }
  }
  return best;
}

/** ACT button: throw if carrying, catch if an enemy ball is in range. */
export function act(state, player, aimX, aimZ) {
  if (!player.alive || state.status !== 'playing') return 'none';
  if (player.hasBall !== null) {
    if (player.cooldown > 0) return 'none';
    const ball = state.balls[player.hasBall];
    const len = hypot(aimX, aimZ);
    if (!ball || len <= 0) return 'none';
    const nx = aimX / len;
    const nz = aimZ / len;
    const dir = dirFromFacing(player.facing);
    ball.mode = 'flying';
    ball.x = player.x + dir.x * 0.9;
    ball.z = player.z + dir.z * 0.9;
    ball.vx = nx * THROW_SPEED;
    ball.vz = nz * THROW_SPEED;
    ball.carrierId = null;
    ball.throwerId = player.id;
    player.hasBall = null;
    player.cooldown = THROW_COOLDOWN;
    state.events.push({ type: 'threw', throwerId: player.id });
    return 'threw';
  }
  const ball = incomingBallFor(state, player);
  if (ball) {
    doCatch(state, player, ball);
    return 'caught';
  }
  return 'none';
}

function nearestAliveEnemy(state, bot) {
  let best = null;
  let bestD = Infinity;
  for (const p of state.players) {
    if (!p.alive || p.team === bot.team) continue;
    const d = hypot(p.x - bot.x, p.z - bot.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { target: best, dist: bestD };
}

function nearestLooseBall(state, bot) {
  let best = null;
  let bestD = Infinity;
  for (const b of state.balls) {
    if (b.mode !== 'loose') continue;
    const d = hypot(b.x - bot.x, b.z - bot.z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return { ball: best, dist: bestD };
}

function homeAnchor(bot) {
  const idx = bot.team === 'blue' ? ['blue-1', 'blue-2'].indexOf(bot.id) : ['red-1', 'red-2', 'red-3'].indexOf(bot.id);
  const z = bot.team === 'blue' ? 10 : -10;
  const x = bot.team === 'blue' ? (idx === 0 ? -3 : 3) : (idx === 0 ? 0 : idx === 1 ? -3 : 3);
  return { x, z };
}

/**
 * One bot's intent for this tick. Pure apart from the rng it is handed
 * (tests pass () => 0 / () => 1 to force branches deterministically).
 */
export function decideBot(state, bot, rng) {
  const idle = { mx: 0, mz: 0, act: false, aimX: 0, aimZ: 0 };
  if (!bot.alive || state.status !== 'playing') return idle;
  const rand = rng || Math.random;

  // 1. React to an incoming enemy ball.
  let threat = null;
  let threatD = Infinity;
  for (const ball of state.balls) {
    if (ball.mode !== 'flying' || !ball.throwerId) continue;
    const thrower = state.players.find((p) => p.id === ball.throwerId);
    if (!thrower || thrower.team === bot.team) continue;
    const dx = bot.x - ball.x;
    const dz = bot.z - ball.z;
    const d = hypot(dx, dz);
    if (d < BOT_THREAT_DIST && ball.vx * dx + ball.vz * dz > 0 && d < threatD) {
      threatD = d;
      threat = ball;
    }
  }
  if (threat) {
    const toBallX = threat.x - bot.x;
    const toBallZ = threat.z - bot.z;
    const toBallD = hypot(toBallX, toBallZ) || 1;
    const facing = dirFromFacing(bot.facing);
    const facingDot = facing.x * (toBallX / toBallD) + facing.z * (toBallZ / toBallD);
    // A bot holding a ball cannot catch: its ACT would throw instead, so
    // carrying bots dodge rather than attempting a catch.
    if (bot.hasBall === null && threatD < CATCH_DIST && facingDot > CATCH_FACE_COS && rand() < BOT_CATCH_PROB) {
      return { mx: 0, mz: 0, act: true, aimX: 0, aimZ: 0 };
    }
    if (rand() < BOT_DODGE_PROB) {
      // Strafe perpendicular to the ball's flight; side is a coin flip.
      const speed = hypot(threat.vx, threat.vz) || 1;
      const side = rand() < 0.5 ? -1 : 1;
      return { mx: (-threat.vz / speed) * side, mz: (threat.vx / speed) * side, act: false, aimX: 0, aimZ: 0 };
    }
  }

  // 2. Carrying: throw at the nearest enemy when in range, else close in.
  if (bot.hasBall !== null) {
    const { target, dist } = nearestAliveEnemy(state, bot);
    if (!target) return idle;
    if (bot.cooldown <= 0 && dist < 22) {
      const base = Math.atan2(target.x - bot.x, target.z - bot.z);
      const aim = base + (rand() - 0.5) * 2 * BOT_AIM_SPREAD;
      return { mx: 0, mz: 0, act: true, aimX: Math.sin(aim), aimZ: Math.cos(aim) };
    }
    if (dist > 12) {
      return { mx: target.x - bot.x, mz: target.z - bot.z, act: false, aimX: 0, aimZ: 0 };
    }
    // In range but on cooldown: circle the enemy instead of crowding.
    return { mx: -(target.z - bot.z), mz: target.x - bot.x, act: false, aimX: 0, aimZ: 0 };
  }

  // 3. Not carrying: chase the nearest loose ball, else hold position.
  const { ball } = nearestLooseBall(state, bot);
  let mx = 0;
  let mz = 0;
  if (ball) {
    mx = ball.x - bot.x;
    mz = ball.z - bot.z;
  } else {
    const anchor = homeAnchor(bot);
    const d = hypot(anchor.x - bot.x, anchor.z - bot.z);
    if (d > 1.5) {
      mx = anchor.x - bot.x;
      mz = anchor.z - bot.z;
    }
  }
  // Cheap separation: don't stack on a teammate.
  for (const p of state.players) {
    if (p === bot || !p.alive || p.team !== bot.team) continue;
    const dx = bot.x - p.x;
    const dz = bot.z - p.z;
    const d = hypot(dx, dz);
    if (d > 0 && d < 1.5) {
      mx += (dx / d) * 1.5;
      mz += (dz / d) * 1.5;
    }
  }
  return { mx, mz, act: false, aimX: 0, aimZ: 0 };
}

/** One simulation tick. human = { mx, mz, act, aimX, aimZ } (act is an edge). */
export function step(state, dt, human, rng) {
  if (state.status !== 'playing') return;
  state.events = [];
  const rand = rng || Math.random;
  const you = state.players.find((p) => p.isHuman);

  if (you && you.alive) {
    movePlayer(state, you, human.mx, human.mz, dt);
    if (human.act) act(state, you, human.aimX, human.aimZ);
  }
  for (const bot of state.players) {
    if (bot.isHuman || !bot.alive) continue;
    const intent = decideBot(state, bot, rand);
    movePlayer(state, bot, intent.mx, intent.mz, dt);
    if (intent.act) act(state, bot, intent.aimX, intent.aimZ);
  }
  for (const p of state.players) {
    if (p.alive && p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);
  }

  // Flying balls move, stop at walls, and hit enemies.
  for (const ball of state.balls) {
    if (ball.mode !== 'flying') continue;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    if (Math.abs(ball.x) > COURT_HALF_W || Math.abs(ball.z) > COURT_HALF_D) {
      ball.x = clamp(ball.x, -COURT_HALF_W, COURT_HALF_W);
      ball.z = clamp(ball.z, -COURT_HALF_D, COURT_HALF_D);
      ball.mode = 'loose';
      ball.vx = 0;
      ball.vz = 0;
      ball.throwerId = null;
      continue;
    }
    const thrower = state.players.find((p) => p.id === ball.throwerId);
    for (const p of state.players) {
      if (!p.alive || (thrower && p.team === thrower.team)) continue;
      if (hypot(p.x - ball.x, p.z - ball.z) < PLAYER_RADIUS + BALL_RADIUS) {
        ball.mode = 'loose';
        ball.x = p.x;
        ball.z = p.z;
        ball.vx = 0;
        ball.vz = 0;
        ball.throwerId = null;
        eliminate(state, p);
        break;
      }
    }
  }

  // Pickups: walk over a loose ball to carry it (one ball max).
  for (const ball of state.balls) {
    if (ball.mode !== 'loose') continue;
    for (const p of state.players) {
      if (!p.alive || p.hasBall !== null) continue;
      if (hypot(p.x - ball.x, p.z - ball.z) < PICKUP_DIST) {
        ball.mode = 'carried';
        ball.carrierId = p.id;
        ball.throwerId = null;
        p.hasBall = ball.id;
        state.events.push({ type: 'picked', playerId: p.id });
        break;
      }
    }
  }

  // Carried balls ride at the carrier's hand.
  for (const ball of state.balls) {
    if (ball.mode !== 'carried' || ball.carrierId === null) continue;
    const carrier = state.players.find((p) => p.id === ball.carrierId);
    if (!carrier || !carrier.alive) continue;
    const dir = dirFromFacing(carrier.facing);
    ball.x = carrier.x + dir.x * 0.7;
    ball.z = carrier.z + dir.z * 0.7;
  }
}

/** Player auto-aim: nearest alive enemy inside the front cone, else facing. */
export function autoAim(state, player) {
  const facing = dirFromFacing(player.facing);
  let best = null;
  let bestD = Infinity;
  for (const p of state.players) {
    if (!p.alive || p.team === player.team) continue;
    const dx = p.x - player.x;
    const dz = p.z - player.z;
    const d = hypot(dx, dz);
    if (d <= 0) continue;
    const dot = facing.x * (dx / d) + facing.z * (dz / d);
    if (dot > AUTO_AIM_CONE_COS && d < bestD) {
      bestD = d;
      best = { x: dx / d, z: dz / d };
    }
  }
  return best || facing;
}
