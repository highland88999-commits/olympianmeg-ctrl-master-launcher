// Streetball — custom ball physics. Plain JS, no dependencies, so it can be
// unit-tested in node. Positions/velocities are {x, y, z} objects.
//
// Ball object shape:
//   {
//     p: {x,y,z}, v: {x,y,z},       // position / velocity (m, m/s)
//     state: 'held'|'flying'|'scored'|'dead',
//     flightTime, netTime, restTime, // timers
//     touchedRim, touchedBoard,      // for swish detection
//     scored,                       // already counted this flight
//     prevY, prevZ,                 // previous substep position (plane-crossing tests)
//   }

import {
  BALL_R,
  GRAVITY,
  RIM_R,
  RIM_TUBE,
  RIM_Y,
  BOARD_Z,
  BOARD_W,
  BOARD_BOTTOM,
  BOARD_TOP,
  GAME,
} from './constants.js';

const SUBSTEP = 1 / 240;
const FLOOR_RESTITUTION = 0.62;
const RIM_RESTITUTION = 0.45;
const BOARD_RESTITUTION = 0.55;

export function makeBall() {
  return {
    p: { x: 0, y: 1.7, z: 0 },
    v: { x: 0, y: 0, z: 0 },
    state: 'held',
    flightTime: 0,
    netTime: 0,
    restTime: 0,
    touchedRim: false,
    touchedBoard: false,
    scored: false,
    prevY: 1.7,
    prevZ: 0,
  };
}

export function placeBall(ball, x, y, z) {
  ball.p.x = x; ball.p.y = y; ball.p.z = z;
  ball.v.x = 0; ball.v.y = 0; ball.v.z = 0;
  ball.state = 'held';
  ball.flightTime = 0; ball.netTime = 0; ball.restTime = 0;
  ball.touchedRim = false; ball.touchedBoard = false; ball.scored = false;
  ball.prevY = y; ball.prevZ = z;
}

export function shootBall(ball, velocity) {
  ball.v.x = velocity.x; ball.v.y = velocity.y; ball.v.z = velocity.z;
  ball.state = 'flying';
  ball.flightTime = 0;
  ball.touchedRim = false; ball.touchedBoard = false; ball.scored = false;
}

// Build a shot velocity from a release point toward a rim.
// elevDeg: launch elevation angle. azimOffset: radians to steer left/right.
// speed: m/s.
export function shotVelocity(from, rim, { elevDeg, azimOffset, speed }) {
  const dx = rim.x - from.x;
  const dz = rim.z - from.z;
  const baseAzim = Math.atan2(dx, dz);
  const azim = baseAzim + azimOffset;
  const elev = (elevDeg * Math.PI) / 180;
  const cosE = Math.cos(elev);
  return {
    x: Math.sin(azim) * cosE * speed,
    y: Math.sin(elev) * speed,
    z: Math.cos(azim) * cosE * speed,
  };
}

// Rough speed estimate so the default aim arc lands near the rim.
// Solves the projectile equation for a target d meters away and h meters
// above the release point, at the given elevation angle.
export function defaultShotSpeed(from, rim, elevDeg = 52) {
  const dx = rim.x - from.x;
  const dz = rim.z - from.z;
  const d = Math.hypot(dx, dz);
  const h = rim.y - from.y;
  const elev = (elevDeg * Math.PI) / 180;
  const tan = Math.tan(elev);
  const cos2 = Math.cos(elev) ** 2;
  const denom = 2 * cos2 * Math.max(d * tan - h, 0.5);
  const v = Math.sqrt((GRAVITY * d * d) / denom);
  return Math.min(Math.max(v, 6.5), 15.5);
}

function collideRim(ball, rim, events) {
  const dx = ball.p.x - rim.x;
  const dz = ball.p.z - rim.z;
  const hlen = Math.hypot(dx, dz);
  let cx, cz;
  if (hlen > 1e-6) {
    cx = rim.x + (dx / hlen) * RIM_R;
    cz = rim.z + (dz / hlen) * RIM_R;
  } else {
    cx = rim.x + RIM_R;
    cz = rim.z;
  }
  const nx = ball.p.x - cx;
  const ny = ball.p.y - RIM_Y;
  const nz = ball.p.z - cz;
  const dist = Math.sqrt(nx * nx + ny * ny + nz * nz);
  const minDist = BALL_R + RIM_TUBE;
  if (dist < minDist && dist > 1e-9) {
    const inv = 1 / dist;
    const ux = nx * inv, uy = ny * inv, uz = nz * inv;
    ball.p.x = cx + ux * minDist;
    ball.p.y = RIM_Y + uy * minDist;
    ball.p.z = cz + uz * minDist;
    const vn = ball.v.x * ux + ball.v.y * uy + ball.v.z * uz;
    if (vn < 0) {
      const e = RIM_RESTITUTION;
      ball.v.x -= (1 + e) * vn * ux;
      ball.v.y -= (1 + e) * vn * uy;
      ball.v.z -= (1 + e) * vn * uz;
      if (!ball.touchedRim) {
        ball.touchedRim = true;
        events.push({ type: 'rim', intensity: Math.min(1, Math.abs(vn) / 8) });
      }
    }
  }
}

function collideBackboard(ball, events) {
  // One board per end; the ball can only reach the board behind the rim it attacks.
  for (const s of [1, -1]) {
    const planeZ = s * BOARD_Z;
    const crossed =
      (ball.prevZ - planeZ) * (ball.p.z - planeZ) <= 0 &&
      Math.abs(ball.p.z - planeZ) < BALL_R + 0.05;
    if (!crossed) continue;
    if (Math.abs(ball.p.x) > BOARD_W / 2 + BALL_R) continue;
    if (ball.p.y < BOARD_BOTTOM - BALL_R || ball.p.y > BOARD_TOP + BALL_R) continue;
    const approaching = s === 1 ? ball.v.z > 0 : ball.v.z < 0;
    if (!approaching) continue;
    ball.p.z = planeZ - s * BALL_R;
    ball.v.z = -ball.v.z * BOARD_RESTITUTION;
    ball.v.x *= 0.92;
    ball.v.y *= 0.96;
    if (!ball.touchedBoard) {
      ball.touchedBoard = true;
      events.push({ type: 'board', intensity: 0.7 });
    }
    return;
  }
}

function checkScore(ball, rim, events) {
  if (ball.scored || ball.state !== 'flying') return;
  if (ball.prevY > RIM_Y && ball.p.y <= RIM_Y && ball.v.y < 0) {
    const hlen = Math.hypot(ball.p.x - rim.x, ball.p.z - rim.z);
    if (hlen < RIM_R * 0.72) {
      ball.scored = true;
      ball.state = 'scored';
      ball.netTime = 0;
      const swish = !ball.touchedRim && !ball.touchedBoard;
      events.push({ type: 'score', swish });
      if (swish) events.push({ type: 'swish' });
    }
  }
}

function netDrag(ball, rim, h) {
  // Funnel the ball down through the net after a make.
  const drag = 1 - Math.min(0.9, 5 * h);
  ball.v.x *= drag;
  ball.v.z *= drag;
  ball.v.x += (rim.x - ball.p.x) * 10 * h;
  ball.v.z += (rim.z - ball.p.z) * 10 * h;
  if (ball.v.y > -3.5) ball.v.y -= 6 * h;
}

function floorBounce(ball, events) {
  if (ball.p.y >= BALL_R) return;
  ball.p.y = BALL_R;
  if (ball.v.y < 0) {
    const impact = Math.abs(ball.v.y);
    if (impact > 1.0) {
      ball.v.y = -ball.v.y * FLOOR_RESTITUTION;
      events.push({ type: 'bounce', intensity: Math.min(1, impact / 9) });
    } else {
      ball.v.y = 0;
    }
    ball.v.x *= 0.86;
    ball.v.z *= 0.86;
  }
}

function substep(ball, rim, h, events) {
  ball.prevY = ball.p.y;
  ball.prevZ = ball.p.z;

  ball.v.y -= GRAVITY * h;
  if (ball.state === 'scored') {
    netDrag(ball, rim, h);
    ball.netTime += h;
  }
  ball.p.x += ball.v.x * h;
  ball.p.y += ball.v.y * h;
  ball.p.z += ball.v.z * h;

  collideRim(ball, rim, events);
  collideBackboard(ball, events);
  checkScore(ball, rim, events);
  floorBounce(ball, events);

  if (ball.state === 'flying') ball.flightTime += h;

  // Dead-ball conditions
  const speed = Math.hypot(ball.v.x, ball.v.y, ball.v.z);
  const outOfBounds =
    Math.abs(ball.p.x) > 18 || Math.abs(ball.p.z) > 22 || ball.p.y < -1;
  const timedOut = ball.flightTime > GAME.maxFlightSeconds;
  const atRest = ball.p.y <= BALL_R + 0.01 && speed < 0.5;
  if (outOfBounds || timedOut) {
    ball.restTime += h;
    if (ball.restTime > 0.15 && ball.state !== 'dead') {
      ball.state = 'dead';
      events.push({ type: 'dead', reason: outOfBounds ? 'out' : 'timeout' });
    }
  } else if (atRest) {
    ball.restTime += h;
    if (ball.restTime > 0.7 && ball.state !== 'dead') {
      ball.state = 'dead';
      events.push({ type: 'dead', reason: 'rest' });
    }
  } else {
    ball.restTime = 0;
  }

  if (ball.state === 'scored' && ball.netTime > 0.85) {
    ball.state = 'dead';
    events.push({ type: 'dead', reason: 'scored' });
  }
}

// Advance the ball by dt seconds (dt is clamped internally via substeps).
// rim: {x, z} of the attacked rim. Returns an array of event objects.
export function stepBall(ball, rim, dt) {
  const events = [];
  if (ball.state !== 'flying' && ball.state !== 'scored') return events;
  const clamped = Math.min(Math.max(dt, 0), 1 / 20);
  const n = Math.max(1, Math.ceil(clamped / SUBSTEP));
  const h = clamped / n;
  for (let i = 0; i < n; i++) {
    substep(ball, rim, h, events);
    if (ball.state === 'dead') break;
  }
  return events;
}

// Simulate a shot for the aim-arc preview. Returns an array of {x,y,z} points.
export function simulateArc(from, velocity, rim, maxPoints = 46) {
  const ball = makeBall();
  placeBall(ball, from.x, from.y, from.z);
  shootBall(ball, velocity);
  const points = [{ x: from.x, y: from.y, z: from.z }];
  const h = 1 / 60;
  for (let i = 0; i < 240 && points.length < maxPoints; i++) {
    const ev = stepBall(ball, rim, h);
    if (i % 5 === 0) points.push({ x: ball.p.x, y: ball.p.y, z: ball.p.z });
    if (ball.state === 'dead' || ev.some((e) => e.type === 'score')) {
      points.push({ x: ball.p.x, y: ball.p.y, z: ball.p.z });
      break;
    }
  }
  return points;
}
