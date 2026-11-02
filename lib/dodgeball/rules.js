// lib/dodgeball/rules.js — Dodgeball, pure game logic (no DOM, no three).
//
// Official WDBF rules (foam format), plus a 3v3 arcade alternative:
//   · Modes: '6v6' (WDBF official, Rule 4.2) or '3v3' (arcade).
//   · FORMAT: 'foam' (6 balls, Rule 2.1) — flip the constant for cloth.
//   · Court 18 m x 9 m (Rule 1.1). Touch the center line and you're out (26.3).
//   · Foam match = 2 x 15 min halves of timed sets (3 min); points per set.
//   · Opening rush (Rule 13): back-line start, whistle, center-line balls,
//     a retrieved ball must cross the attack line before it goes live,
//     false starts are out.
//   · Blocking with a carried ball is legal (Rule 21).
//   · A catch puts the thrower out and returns the catcher's first-out
//     teammate (Rule 23.4).
//   · A hit only counts once the ball touches a dead object (Rule 19.1) —
//     until then it stays live and can still be caught, which saves the
//     hit player.
//   · Throws must pass within 1 m of an opponent (valid attempt, 16.1).
//   · Shot clock (Rule 17): the team holding the majority of balls
//     (4+ of 6) has 10 s (foam) to throw; violations turn the balls over.
//   · Fairness is structural: bots and the player share the same speed,
//     the same throw speed, the same cooldown, and the same hit rules.
//     Bots differ only in that their catches/blocks are chance-based
//     while the player's are timed button presses — skill vs chance,
//     never a rigged outcome.
//   · Facing convention: a direction is (sin(facing), cos(facing)) in
//     (x, z). Blue attacks toward -Z (facing PI), red toward +Z (0).

export const FORMAT = 'foam'; // 'foam' | 'cloth' — official WDBF format switch
export const FORMATS = {
  foam: { balls: 6, shotClockSecs: 10, halves: 2, halfSecs: 15 * 60, setSecs: 3 * 60, setWinPoints: 2, setDrawPoints: 1 },
  cloth: { balls: 6, shotClockSecs: 5, halves: 2, halfSecs: 20 * 60, setSecs: 3 * 60, setWinPoints: 2, setDrawPoints: 1 },
};
export const MODES = ['3v3', '6v6'];
export const DEFAULT_MODE = '6v6'; // WDBF official (Rule 4.2); '3v3' is the arcade alternative
export const TEAM_SIZES = { '3v3': 3, '6v6': 6 };

export const COURT_HALF_W = 4.5; // court is 9 m wide (x) — WDBF 1.1
export const COURT_HALF_D = 9; // court is 18 m deep (z) — WDBF 1.1
export const ATTACK_LINE_DIST = 3; // m from center; rush balls go live behind this (13.4)
export const RUSH_COUNTDOWN = 3; // s on the back line before the whistle (Rule 13)
export const PLAYER_SPEED = 6; // m/s — same for player and bots
export const THROW_SPEED = 22; // m/s — same for player and bots
export const THROW_COOLDOWN = 0.8; // s — same for player and bots
export const BALL_RADIUS = 0.35;
export const PLAYER_RADIUS = 0.6;
export const PICKUP_DIST = 1.1;
export const CATCH_DIST = 2.4; // press ACT inside this to catch
export const CATCH_PROMPT_DIST = 4.5; // HUD "CATCH!" prompt range
export const BLOCK_DIST = 2.0; // press ACT inside this, while carrying, to block (Rule 21)
export const BOT_CATCH_PROB = 0.3;
export const BOT_BLOCK_PROB = 0.4;
export const BOT_DODGE_PROB = 0.5;
export const BOT_AIM_SPREAD = 0.12; // radians of aim noise, bots only
export const BOT_THREAT_DIST = 6; // bots react to balls inside this
export const CATCH_FACE_COS = Math.cos(Math.PI / 3); // bots must face within 60 deg
export const AUTO_AIM_CONE_COS = Math.cos((35 * Math.PI) / 180); // player auto-aim cone
export const BALL_COUNT = FORMATS[FORMAT].balls; // 6, foam (WDBF 2.1)
export const VALID_ATTEMPT_DIST = 1; // a throw must pass within 1 m of an opponent (16.1)
export const HIT_CONFIRM_DELAY = 0.8; // s a hit ball stays live before the floor kills it (19.1)
export const LINE_SAFE_Z = PLAYER_RADIUS + 0.4; // closest bots approach the line (26.3) — still in pickup reach

const BACK_LINE_Z = COURT_HALF_D - PLAYER_RADIUS;
const SPAWN_SPREAD = COURT_HALF_W - 1.5;

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

function spawnX(slotIdx, teamSize) {
  if (teamSize <= 1) return 0;
  return -SPAWN_SPREAD + (2 * SPAWN_SPREAD * slotIdx) / (teamSize - 1);
}

function makePlayer(id, name, team, isHuman, slotIdx, teamSize) {
  const isBlue = team === 'blue';
  return {
    id,
    name,
    team,
    isHuman: !!isHuman,
    alive: true,
    x: spawnX(slotIdx, teamSize),
    z: isBlue ? BACK_LINE_Z : -BACK_LINE_Z,
    facing: isBlue ? Math.PI : 0,
    hasBall: null,
    cooldown: 0,
  };
}

function makeCenterBalls() {
  // WDBF 13: balls start on the center line, not yet live — each must be
  // carried behind the attack line before it can be thrown (13.4).
  const balls = [];
  for (let i = 0; i < BALL_COUNT; i++) {
    balls.push({
      id: i,
      mode: 'loose',
      x: -3.75 + i * 1.5,
      z: 0,
      vx: 0,
      vz: 0,
      carrierId: null,
      throwerId: null,
      lastThrowerId: null,
      live: true,
      activated: false,
      validAttempt: false,
      wasThrown: false,
      hitIds: [],
      pendingTimer: HIT_CONFIRM_DELAY,
    });
  }
  return balls;
}

export function createMatch(playerConfigs = null, opts = {}) {
  // playerConfigs: array of { id, team, isHuman, name } — when null,
  // defaults to you + AI teammates vs AI opponents. For PvP
  // matchmaking, the lobby builds this list: humans first, AI fills
  // the gaps after the 60s timer.
  // opts: { mode: '6v6' | '3v3', format: 'foam' | 'cloth' }
  const mode = MODES.includes(opts.mode) ? opts.mode : DEFAULT_MODE;
  const format = FORMATS[opts.format] ? opts.format : FORMAT;
  const fmt = FORMATS[format];
  const teamSize = TEAM_SIZES[mode];
  let players;
  if (playerConfigs) {
    players = playerConfigs.map((cfg, i) => {
      const slotIdx = playerConfigs.filter((c, j) => j < i && c.team === cfg.team).length;
      return makePlayer(cfg.id, cfg.name || cfg.id, cfg.team, cfg.isHuman, slotIdx, teamSize);
    });
  } else {
    players = [makePlayer('you', 'You', 'blue', true, 0, teamSize)];
    for (let i = 1; i < teamSize; i++) {
      players.push(makePlayer(`blue-${i}`, 'AI Teammate', 'blue', false, i, teamSize));
    }
    for (let i = 0; i < teamSize; i++) {
      players.push(makePlayer(`red-${i + 1}`, 'AI Opponent', 'red', false, i, teamSize));
    }
  }
  return {
    status: 'rush', // rush -> playing -> over (a new rush opens every set)
    rushTimer: RUSH_COUNTDOWN,
    winner: null,
    mode,
    format,
    half: 1,
    set: 1,
    halfTimeLeft: fmt.halfSecs,
    setTimeLeft: fmt.setSecs,
    points: { blue: 0, red: 0 },
    shotClock: { team: null, timeLeft: fmt.shotClockSecs },
    outQueue: { blue: [], red: [] }, // elimination order per team (23.4)
    pendingSetEnd: null,
    players,
    balls: makeCenterBalls(),
    events: [],
  };
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

/** A ball becomes loose at (x, z): shared by violations, turnovers, deaths. */
function looseBallAt(state, ball, x, z) {
  if (ball.mode === 'carried' && ball.carrierId !== null) {
    const carrier = state.players.find((p) => p.id === ball.carrierId);
    if (carrier) carrier.hasBall = null;
  }
  ball.mode = 'loose';
  ball.x = x;
  ball.z = z;
  ball.vx = 0;
  ball.vz = 0;
  ball.carrierId = null;
  ball.throwerId = null;
  ball.live = true;
  ball.wasThrown = false;
  ball.hitIds = [];
  ball.pendingTimer = HIT_CONFIRM_DELAY;
}

function checkSetEnd(state) {
  if (state.status !== 'playing' || state.pendingSetEnd) return;
  if (teamAlive(state, 'blue').length === 0) state.pendingSetEnd = 'red';
  else if (teamAlive(state, 'red').length === 0) state.pendingSetEnd = 'blue';
}

/** cause: 'out' | 'false-start' | 'center-line' */
export function eliminate(state, player, cause = 'out') {
  if (!player.alive) return;
  player.alive = false;
  dropCarriedBall(state, player);
  state.outQueue[player.team].push(player.id);
  state.events.push({ type: cause, victimId: player.id, victimTeam: player.team });
  checkSetEnd(state);
}

function setResultByCount(state) {
  const blue = teamAlive(state, 'blue').length;
  const red = teamAlive(state, 'red').length;
  if (blue > red) return 'blue';
  if (red > blue) return 'red';
  return 'draw';
}

function startNextSet(state) {
  const fmt = FORMATS[state.format];
  const teamSize = TEAM_SIZES[state.mode];
  state.set += 1;
  state.setTimeLeft = fmt.setSecs;
  state.shotClock = { team: null, timeLeft: fmt.shotClockSecs };
  state.outQueue = { blue: [], red: [] };
  state.pendingSetEnd = null;
  const slot = { blue: 0, red: 0 };
  for (const p of state.players) {
    const i = slot[p.team];
    slot[p.team] += 1;
    p.alive = true;
    p.x = spawnX(i, teamSize);
    p.z = p.team === 'blue' ? BACK_LINE_Z : -BACK_LINE_Z;
    p.facing = p.team === 'blue' ? Math.PI : 0;
    p.hasBall = null;
    p.cooldown = 0;
  }
  state.balls = makeCenterBalls();
  state.status = 'rush';
  state.rushTimer = RUSH_COUNTDOWN;
  state.events.push({ type: 'set-start', set: state.set, half: state.half });
}

function endSet(state, result) {
  const fmt = FORMATS[state.format];
  if (result === 'blue') state.points.blue += fmt.setWinPoints;
  else if (result === 'red') state.points.red += fmt.setWinPoints;
  else {
    state.points.blue += fmt.setDrawPoints;
    state.points.red += fmt.setDrawPoints;
  }
  state.events.push({ type: 'set-end', result, set: state.set, half: state.half, points: { ...state.points } });
  if (state.halfTimeLeft <= 0) endHalf(state);
  else startNextSet(state);
}

function endHalf(state) {
  const fmt = FORMATS[state.format];
  state.events.push({ type: 'half-end', half: state.half, points: { ...state.points } });
  if (state.half >= fmt.halves) {
    state.status = 'over';
    const { blue, red } = state.points;
    state.winner = blue > red ? 'blue' : red > blue ? 'red' : 'draw';
    state.events.push({ type: 'win', winner: state.winner, points: { ...state.points } });
  } else {
    state.half += 1;
    state.halfTimeLeft = fmt.halfSecs;
    startNextSet(state);
  }
}

/**
 * A flying ball dies: it touched a dead object (wall, floor, blocked —
 * WDBF 19.1). Any pending hits it caused now count.
 */
function deadBall(state, ball) {
  for (const id of ball.hitIds) {
    const p = state.players.find((pl) => pl.id === id);
    if (p && p.alive) eliminate(state, p);
  }
  if (ball.wasThrown && !ball.validAttempt) {
    state.events.push({ type: 'invalid-attempt', throwerId: ball.lastThrowerId });
  }
  looseBallAt(
    state,
    ball,
    clamp(ball.x, -COURT_HALF_W, COURT_HALF_W),
    clamp(ball.z, -COURT_HALF_D, COURT_HALF_D),
  );
}

function doCatch(state, catcher, ball) {
  const thrower = state.players.find((p) => p.id === ball.throwerId);
  const saved = ball.hitIds.length; // hit players the catch saves (19.1)
  ball.hitIds = [];
  ball.pendingTimer = HIT_CONFIRM_DELAY;
  ball.mode = 'carried';
  ball.carrierId = catcher.id;
  ball.throwerId = null;
  ball.live = true;
  ball.activated = true; // a caught ball was thrown live; it stays live
  ball.wasThrown = false;
  ball.vx = 0;
  ball.vz = 0;
  catcher.hasBall = ball.id;
  state.events.push({ type: 'caught', catcherId: catcher.id, throwerId: thrower ? thrower.id : null, saved });
  if (thrower && thrower.alive) eliminate(state, thrower);
  // WDBF 23.4: the catch returns the catcher's first-out teammate.
  const queue = state.outQueue[catcher.team];
  if (queue.length > 0) {
    const mateId = queue.shift();
    const mate = state.players.find((p) => p.id === mateId);
    if (mate && !mate.alive) {
      mate.alive = true;
      mate.hasBall = null;
      mate.cooldown = 0;
      mate.x = 0;
      mate.z = catcher.team === 'blue' ? BACK_LINE_Z : -BACK_LINE_Z;
      mate.facing = catcher.team === 'blue' ? Math.PI : 0;
      state.events.push({ type: 'returned', playerId: mate.id, team: mate.team });
    }
  }
}

/** WDBF 21: block a live ball with the carried ball. The blocked ball dies. */
function doBlock(state, blocker, ball) {
  const thrower = state.players.find((p) => p.id === ball.throwerId);
  for (const id of ball.hitIds) {
    const p = state.players.find((pl) => pl.id === id);
    if (p && p.alive) eliminate(state, p);
  }
  ball.hitIds = [];
  ball.pendingTimer = HIT_CONFIRM_DELAY;
  ball.mode = 'loose';
  ball.x = blocker.x;
  ball.z = blocker.z;
  ball.vx = 0;
  ball.vz = 0;
  ball.live = false; // a blocked ball is dead
  ball.wasThrown = false;
  ball.throwerId = null;
  ball.carrierId = null;
  state.events.push({ type: 'blocked', blockerId: blocker.id, throwerId: thrower ? thrower.id : null });
}

/**
 * An enemy ball flying toward this player and close enough to
 * catch (dist defaults to CATCH_DIST; pass BLOCK_DIST for blocks).
 */
export function incomingBallFor(state, player, dist = CATCH_DIST) {
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
    if (d >= dist) continue;
    // Approaching: the ball's velocity points toward the player.
    if (ball.vx * dx + ball.vz * dz <= 0) continue;
    if (d < bestD) {
      bestD = d;
      best = ball;
    }
  }
  return best;
}

/** ACT button: throw if carrying, block/catch if an enemy ball is in range. */
export function act(state, player, aimX, aimZ) {
  if (!player.alive || state.status !== 'playing') return 'none';
  if (player.hasBall !== null) {
    if (player.cooldown > 0) return 'none';
    // WDBF 21: a carried ball may block a live ball.
    const threat = incomingBallFor(state, player, BLOCK_DIST);
    if (threat && threat.live) {
      doBlock(state, player, threat);
      return 'blocked';
    }
    const ball = state.balls[player.hasBall];
    const len = hypot(aimX, aimZ);
    if (!ball || len <= 0) return 'none';
    // WDBF 13.4: a ball from the opening rush must be carried behind the
    // attack line before it goes live.
    if (!ball.activated) {
      state.events.push({ type: 'not-activated', playerId: player.id, ballId: ball.id });
      return 'none';
    }
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
    ball.lastThrowerId = player.id;
    ball.live = true;
    ball.validAttempt = false;
    ball.wasThrown = true;
    ball.hitIds = [];
    ball.pendingTimer = HIT_CONFIRM_DELAY;
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

function homeAnchor(state, bot) {
  const mates = state.players.filter((p) => p.team === bot.team);
  const idx = mates.indexOf(bot);
  return { x: spawnX(idx, mates.length), z: bot.team === 'blue' ? BACK_LINE_Z : -BACK_LINE_Z };
}

/**
 * WDBF 26.3: bots have the same spatial awareness a player does — never
 * volunteer a step onto the center line (teammate separation jostles
 * them, but the line itself is always respected). The guard engages a
 * full step (0.3 m) before the line, so a bot can still close to pickup
 * reach (1.1 m) of a center-line ball without ever touching the line.
 */
function guardLine(bot, mx, mz) {
  if (Math.abs(bot.z) < PLAYER_RADIUS + 0.4) {
    const towardLine = bot.z > 0 ? mz < 0 : mz > 0; // the line is at z=0
    if (towardLine) mz = 0;
  }
  return { mx, mz };
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
    if (facingDot > CATCH_FACE_COS) {
      // WDBF 23: bare-handed catch when empty-handed and lucky.
      if (bot.hasBall === null && threatD < CATCH_DIST && rand() < BOT_CATCH_PROB) {
        return { mx: 0, mz: 0, act: true, aimX: 0, aimZ: 0 };
      }
      // WDBF 21: block with the carried ball.
      if (bot.hasBall !== null && threatD < BLOCK_DIST && rand() < BOT_BLOCK_PROB) {
        return { mx: 0, mz: 0, act: true, aimX: 0, aimZ: 0 };
      }
    }
    if (rand() < BOT_DODGE_PROB) {
      // Strafe perpendicular to the ball's flight; side is a coin flip.
      const speed = hypot(threat.vx, threat.vz) || 1;
      const side = rand() < 0.5 ? -1 : 1;
      const g = guardLine(bot, (-threat.vz / speed) * side, (threat.vx / speed) * side);
      return { mx: g.mx, mz: g.mz, act: false, aimX: 0, aimZ: 0 };
    }
  }

  // 2. Carrying: the ball goes live behind the attack line first (13.4).
  if (bot.hasBall !== null) {
    const carried = state.balls[bot.hasBall];
    if (carried && !carried.activated) {
      const targetZ = bot.team === 'blue' ? ATTACK_LINE_DIST + 1.5 : -(ATTACK_LINE_DIST + 1.5);
      const g = guardLine(bot, 0, targetZ - bot.z);
      return { mx: g.mx, mz: g.mz, act: false, aimX: 0, aimZ: 0 };
    }
    const { target, dist } = nearestAliveEnemy(state, bot);
    if (!target) return idle;
    if (bot.cooldown <= 0 && dist < 22) {
      const base = Math.atan2(target.x - bot.x, target.z - bot.z);
      const aim = base + (rand() - 0.5) * 2 * BOT_AIM_SPREAD;
      return { mx: 0, mz: 0, act: true, aimX: Math.sin(aim), aimZ: Math.cos(aim) };
    }
    if (dist > 12) {
      // Close in, but hold short of the center line (26.3).
      const holdZ = bot.team === 'blue' ? LINE_SAFE_Z : -LINE_SAFE_Z;
      const tz = bot.team === 'blue' ? Math.max(target.z, holdZ) : Math.min(target.z, holdZ);
      const g = guardLine(bot, target.x - bot.x, tz - bot.z);
      return { mx: g.mx, mz: g.mz, act: false, aimX: 0, aimZ: 0 };
    }
    // In range but on cooldown: circle, drifting back from the line.
    const linePush = bot.team === 'blue' ? Math.max(0, LINE_SAFE_Z - bot.z) : -Math.max(0, LINE_SAFE_Z + bot.z);
    const g = guardLine(bot, -(target.z - bot.z), target.x - bot.x + linePush);
    return { mx: g.mx, mz: g.mz, act: false, aimX: 0, aimZ: 0 };
  }

  // 3. Not carrying: chase the nearest loose ball, closing to the
  //    nearest legal point off the center line (26.3), else hold the
  //    back-line anchor.
  const { ball } = nearestLooseBall(state, bot);
  let mx = 0;
  let mz = 0;
  if (ball) {
    const edgeZ = PLAYER_RADIUS + 0.1; // nearest legal approach to the line
    const safeZ = bot.team === 'blue' ? Math.max(ball.z, edgeZ) : Math.min(ball.z, -edgeZ);
    mx = ball.x - bot.x;
    mz = safeZ - bot.z;
  } else {
    const anchor = homeAnchor(state, bot);
    const d = hypot(anchor.x - bot.x, anchor.z - bot.z);
    if (d > 1.5) {
      mx = anchor.x - bot.x;
      mz = anchor.z - bot.z;
    }
  }
  // Cheap separation: don't stack on a teammate — but never let the
  // jostle push anyone onto the center line (26.3).
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
  const g = guardLine(bot, mx, mz);
  return { mx: g.mx, mz: g.mz, act: false, aimX: 0, aimZ: 0 };
}

/** WDBF 13: the opening rush — back line, whistle, false starts are out. */
function stepRush(state, dt, human) {
  state.rushTimer -= dt;
  const you = state.players.find((p) => p.isHuman);
  if (you && you.alive && (human.mx !== 0 || human.mz !== 0)) {
    const prevZ = you.z;
    movePlayer(state, you, human.mx, human.mz, dt);
    // False start (13.5): crossing the back line before the whistle.
    const crossed = you.team === 'blue' ? you.z < prevZ : you.z > prevZ;
    if (crossed) eliminate(state, you, 'false-start');
  }
  // Bots hold the line; everyone sprints once the whistle blows.
  if (state.rushTimer <= 0) {
    state.status = 'playing';
    state.events.push({ type: 'whistle' });
    checkSetEnd(state); // in case false starts wiped a side
  }
}

/** WDBF 17: the team holding the majority of balls has 10 s (foam) to throw. */
function stepShotClock(state, dt) {
  const counts = { blue: 0, red: 0 };
  for (const b of state.balls) {
    if (b.mode === 'carried') {
      const carrier = state.players.find((p) => p.id === b.carrierId);
      if (carrier && carrier.alive) counts[carrier.team] += 1;
    } else if (b.mode === 'loose') {
      counts[b.z >= 0 ? 'blue' : 'red'] += 1;
    }
  }
  const majority = Math.floor(BALL_COUNT / 2) + 1; // 4 of 6
  const holding = counts.blue >= majority ? 'blue' : counts.red >= majority ? 'red' : null;
  const clockSecs = FORMATS[state.format].shotClockSecs;
  if (!holding) {
    state.shotClock = { team: null, timeLeft: clockSecs };
  } else if (state.shotClock.team !== holding) {
    state.shotClock = { team: holding, timeLeft: clockSecs };
  } else {
    state.shotClock.timeLeft -= dt;
    if (state.shotClock.timeLeft <= 0) {
      // Violation: every ball they hold is turned over to the center line.
      for (const b of state.balls) {
        const mine =
          b.mode === 'carried'
            ? state.players.find((p) => p.id === b.carrierId)?.team === holding
            : b.mode === 'loose' && (b.z >= 0 ? 'blue' : 'red') === holding;
        if (mine) looseBallAt(state, b, b.x, 0);
      }
      state.events.push({ type: 'shot-clock-violation', team: holding });
      state.shotClock = { team: null, timeLeft: clockSecs };
    }
  }
}

/** One simulation tick. human = { mx, mz, act, aimX, aimZ } (act is an edge). */
export function step(state, dt, human, rng) {
  if (state.status === 'over') return;
  state.events = [];
  if (state.status === 'rush') {
    stepRush(state, dt, human);
    return;
  }
  const rand = rng || Math.random;
  const you = state.players.find((p) => p.isHuman);

  if (you && you.alive) {
    movePlayer(state, you, human.mx, human.mz, dt);
    if (human.act) act(state, you, human.aimX, human.aimZ);
  }
  // Fair turn order: every bot decides from the same pre-tick snapshot,
  // so no bot ever reacts to another bot's same-tick throw — whoever
  // sits first in the roster can't dodge what hasn't been thrown yet.
  // (The human player moves first; that's their game.)
  const bots = state.players.filter((p) => !p.isHuman && p.alive);
  const intents = bots.map((bot) => [bot, decideBot(state, bot, rand)]);
  for (const [bot, intent] of intents) movePlayer(state, bot, intent.mx, intent.mz, dt);
  for (const [bot, intent] of intents) {
    if (bot.alive && intent.act) act(state, bot, intent.aimX, intent.aimZ);
  }
  for (const p of state.players) {
    if (p.alive && p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);
  }

  // WDBF 26.3: touching the center line is out.
  for (const p of state.players) {
    if (p.alive && Math.abs(p.z) <= PLAYER_RADIUS) eliminate(state, p, 'center-line');
  }

  // Flying balls move, die at walls, and resolve hits. A hit only counts
  // once the ball touches a dead object (WDBF 19.1) — until then the ball
  // stays live and can still be caught, which saves the hit player.
  for (const ball of state.balls) {
    if (ball.mode !== 'flying') continue;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    const thrower = state.players.find((p) => p.id === ball.throwerId);
    if (ball.live) {
      // Valid attempt (WDBF 16.1): the flight must pass within 1 m of an opponent.
      for (const p of state.players) {
        if (!p.alive || (thrower && p.team === thrower.team)) continue;
        if (hypot(p.x - ball.x, p.z - ball.z) < VALID_ATTEMPT_DIST) ball.validAttempt = true;
      }
      // Contact marks the hit pending; the ball keeps flying. The
      // closest player takes the hit (not whoever sits first in the
      // roster — fairness is structural).
      let hitBest = null;
      let hitBestD = PLAYER_RADIUS + BALL_RADIUS;
      for (const p of state.players) {
        if (!p.alive || (thrower && p.team === thrower.team) || ball.hitIds.includes(p.id)) continue;
        const d = hypot(p.x - ball.x, p.z - ball.z);
        if (d < hitBestD) {
          hitBestD = d;
          hitBest = p;
        }
      }
      if (hitBest) {
        ball.hitIds.push(hitBest.id);
        state.events.push({ type: 'hit-pending', playerId: hitBest.id, ballId: ball.id });
      }
    }
    if (Math.abs(ball.x) > COURT_HALF_W || Math.abs(ball.z) > COURT_HALF_D) {
      deadBall(state, ball); // wall = dead object: pending hits count
      continue;
    }
    if (ball.hitIds.length > 0) {
      ball.pendingTimer -= dt;
      if (ball.pendingTimer <= 0) deadBall(state, ball); // floor = dead object
    }
  }

  // Pickups: walk over a loose ball to carry it (one ball max). The
  // closest player takes a contested ball — not whoever sits first in
  // the roster (fairness is structural). An exact tie between teams
  // (the opening-rush mirror) breaks on the ball's own parity — even
  // balls favor blue, odd favor red — so neither side sweeps a
  // symmetric scramble.
  for (const ball of state.balls) {
    if (ball.mode !== 'loose') continue;
    let best = null;
    let bestD = PICKUP_DIST;
    for (const p of state.players) {
      if (!p.alive || p.hasBall !== null) continue;
      const d = hypot(p.x - ball.x, p.z - ball.z);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = p;
      } else if (best && p.team !== best.team && Math.abs(d - bestD) <= 1e-9) {
        if ((p.team === 'blue') === (ball.id % 2 === 0)) best = p;
      }
    }
    if (best) {
      ball.mode = 'carried';
      ball.carrierId = best.id;
      ball.throwerId = null;
      best.hasBall = ball.id;
      state.events.push({ type: 'picked', playerId: best.id });
    }
  }

  // WDBF 13.4: a carried rush ball goes live once behind the attack line.
  for (const ball of state.balls) {
    if (ball.mode !== 'carried' || ball.activated || ball.carrierId === null) continue;
    const carrier = state.players.find((p) => p.id === ball.carrierId);
    if (!carrier || !carrier.alive) continue;
    if (carrier.team === 'blue' ? carrier.z > ATTACK_LINE_DIST : carrier.z < -ATTACK_LINE_DIST) {
      ball.activated = true;
      state.events.push({ type: 'activated', playerId: carrier.id, ballId: ball.id });
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

  stepShotClock(state, dt);

  // Sets, halves, and the match clock.
  if (state.status === 'playing') {
    state.setTimeLeft -= dt;
    state.halfTimeLeft -= dt;
    if (state.setTimeLeft <= 0 || state.halfTimeLeft <= 0) {
      state.pendingSetEnd = setResultByCount(state);
    }
  }
  if (state.pendingSetEnd) {
    const result = state.pendingSetEnd;
    state.pendingSetEnd = null;
    endSet(state, result);
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
