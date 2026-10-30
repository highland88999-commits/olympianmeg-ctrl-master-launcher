// app/quidditch/engine.js — pure Quidditch (Seeker Duel) game logic.
// No DOM, no three.js: stepped with dt seconds + input. Seeded RNG.
//
// You are the Seeker on a broom over a night stadium. Beat the rival
// Seeker to the Golden Snitch: catch it (+150) and you win instantly;
// the rival catching it first loses you the match. Two Bludgers
// periodically lock on and home in on YOU — a hit stuns you for 2s.
// Bot Chasers play an ambient Quaffle game (+10 per goal) for flavor;
// it never ends the match. Same flight model for both seekers (fair).

export const COUNTDOWN_MS = 3000;
export const PITCH_HALF_L = 75;  // z extent of the pitch
export const PITCH_HALF_W = 30;  // x extent of the pitch
export const MIN_Y = 2;
export const MAX_Y = 42;

export const SEEKER_SPEED = 24;  // base forward speed (m/s), both seekers
export const SEEKER_ACCEL = 46;
export const TURN_RATE = 2.6;    // rad/s steering
export const DIVE_MULT = 1.7;    // DIVE burst multiplier
export const DIVE_TIME = 1.4;    // burst lasts this long
export const DIVE_CD = 6;        // cooldown before the next burst

export const SNITCH_SPEED = 21;
export const SNITCH_ACCEL = 60;
export const SNITCH_CATCH_R = 2.5;
export const SNITCH_JINK_R = 12; // seeker closeness that triggers a jink

export const BLUDGER_SPEED = 27;
export const BLUDGER_HIT_R = 2.2;
export const STUN_TIME = 2;

export const SNITCH_POINTS = 150;
export const QUAFFLE_POINTS = 10;

export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Unit forward vector from yaw (around Y) and pitch (up positive).
export function forwardOf(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
}

function randPoint(r, yLo = 6, yHi = 36) {
  return {
    x: (r() * 2 - 1) * (PITCH_HALF_W - 4),
    y: yLo + r() * (yHi - yLo),
    z: (r() * 2 - 1) * (PITCH_HALF_L - 6),
  };
}

function makeSeeker(r, zSide) {
  return {
    pos: { x: (r() * 2 - 1) * 10, y: 16 + r() * 6, z: zSide * 40 },
    vel: { x: 0, y: 0, z: 0 },
    speed: 0,
    yaw: zSide > 0 ? Math.PI : 0, // face the middle
    pitch: 0,
    stunT: 0,
    diveT: 0,
    diveCd: 0,
  };
}

export function createGame(seed = (Math.random() * 0xffffffff) >>> 0) {
  const r = makeRng(seed);
  const snitchPos = randPoint(r);
  return {
    seed,
    rng: r,
    phase: 'countdown', // countdown | playing | won | lost
    countdownT: COUNTDOWN_MS / 1000,
    time: 0,
    winner: null,
    player: makeSeeker(r, 1),
    rival: {
      ...makeSeeker(r, -1),
      thinkT: 0,
      aim: { ...snitchPos },
    },
    snitch: {
      pos: snitchPos,
      vel: { x: 0, y: 0, z: 0 },
      target: randPoint(r),
      retargetT: 1,
    },
    bludgers: [0, 1].map(() => ({
      pos: randPoint(r, 8, 30),
      vel: { x: 0, y: 0, z: 0 },
      state: 'roam', // roam | telegraph | homing | cooldown
      t: 2 + r() * 3,
    })),
    quaffleT: 8 + r() * 8,
    score: { you: 0, rival: 0 },
  };
}

function clampBounds(p) {
  p.x = Math.max(-PITCH_HALF_W - 12, Math.min(PITCH_HALF_W + 12, p.x));
  p.y = Math.max(MIN_Y, Math.min(MAX_Y, p.y));
  p.z = Math.max(-PITCH_HALF_L - 12, Math.min(PITCH_HALF_L + 12, p.z));
}

// Steer a flyer toward a target point. Returns nothing; mutates flyer.
function steerToward(f, target, dt, turnRate) {
  const dx = target.x - f.pos.x;
  const dy = target.y - f.pos.y;
  const dz = target.z - f.pos.z;
  const wantYaw = Math.atan2(dx, dz);
  const horiz = Math.sqrt(dx * dx + dz * dz);
  const wantPitch = Math.atan2(dy, Math.max(0.001, horiz));
  let dYaw = wantYaw - f.yaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  const maxTurn = turnRate * dt;
  f.yaw += Math.max(-maxTurn, Math.min(maxTurn, dYaw));
  const dPitch = wantPitch - f.pitch;
  f.pitch += Math.max(-maxTurn, Math.min(maxTurn, dPitch));
  f.pitch = Math.max(-1.1, Math.min(1.1, f.pitch));
}

function flyForward(f, dt) {
  const fw = forwardOf(f.yaw, f.pitch);
  f.pos.x += fw.x * f.speed * dt;
  f.pos.y += fw.y * f.speed * dt;
  f.pos.z += fw.z * f.speed * dt;
  clampBounds(f.pos);
}

function stepPlayer(g, dt, input) {
  const p = g.player;
  if (p.stunT > 0) {
    p.stunT -= dt;
    // Stunned: controls locked, broom wallows.
    p.speed += (6 - p.speed) * Math.min(1, dt * 3);
    flyForward(p, dt);
    return;
  }
  const diving = !!input.dive && p.diveCd <= 0 && p.diveT <= 0;
  if (diving) {
    p.diveT = DIVE_TIME;
    p.diveCd = DIVE_CD;
  }
  if (p.diveT > 0) p.diveT -= dt;
  if (p.diveCd > 0) p.diveCd -= dt;

  const yawIn = Math.max(-1, Math.min(1, input.yaw || 0));
  const pitchIn = Math.max(-1, Math.min(1, input.pitch || 0));
  p.yaw += yawIn * TURN_RATE * dt;
  p.pitch = Math.max(-1.1, Math.min(1.1, p.pitch + pitchIn * TURN_RATE * 0.8 * dt));

  const target = SEEKER_SPEED * (p.diveT > 0 ? DIVE_MULT : 1);
  p.speed += (target - p.speed) * Math.min(1, dt * (SEEKER_ACCEL / SEEKER_SPEED));
  flyForward(p, dt);
}

function stepRival(g, dt) {
  const r = g.rival;
  const s = g.snitch;
  // Human-like imperfection: the rival re-aims on a reaction delay and
  // sometimes picks a wrong line.
  r.thinkT -= dt;
  if (r.thinkT <= 0) {
    r.thinkT = 0.35;
    r.aim = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
    if (g.rng() < 0.18) {
      // Wrong turn: offset the aim sideways.
      const off = 6 + g.rng() * 5;
      const side = g.rng() < 0.5 ? -1 : 1;
      r.aim.x += side * off;
      r.aim.y += (g.rng() - 0.5) * 6;
    }
  }
  // Slightly worse turning than the player — beatable, never rubber-banded.
  steerToward(r, r.aim, dt, TURN_RATE * 0.85);
  r.speed += (SEEKER_SPEED - r.speed) * Math.min(1, dt * (SEEKER_ACCEL / SEEKER_SPEED));
  flyForward(r, dt);
}

function stepSnitch(g, dt) {
  const s = g.snitch;
  const r = g.rng;
  s.retargetT -= dt;
  const dPlayer = dist3(s.pos, g.player.pos);
  const dRival = dist3(s.pos, g.rival.pos);
  const nearest = Math.min(dPlayer, dRival);
  if (s.retargetT <= 0 || nearest < SNITCH_JINK_R * 0.6) {
    s.retargetT = 0.8 + r() * 0.8;
    if (nearest < SNITCH_JINK_R) {
      // Jink AWAY from the nearer seeker.
      const threat = dPlayer < dRival ? g.player.pos : g.rival.pos;
      s.target = {
        x: Math.max(-PITCH_HALF_W + 4, Math.min(PITCH_HALF_W - 4, s.pos.x + (s.pos.x - threat.x) * 1.6)),
        y: Math.max(4, Math.min(38, s.pos.y + (r() - 0.35) * 18)),
        z: Math.max(-PITCH_HALF_L + 6, Math.min(PITCH_HALF_L - 6, s.pos.z + (s.pos.z - threat.z) * 1.6)),
      };
    } else if (r() < 0.12) {
      // Occasional dive toward the pitch.
      s.target = randPoint(r, 3, 8);
    } else {
      s.target = randPoint(r);
    }
  }
  // Accelerate toward the target, capped at snitch speed.
  const dx = s.target.x - s.pos.x;
  const dy = s.target.y - s.pos.y;
  const dz = s.target.z - s.pos.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  s.vel.x += (dx / d) * SNITCH_ACCEL * dt;
  s.vel.y += (dy / d) * SNITCH_ACCEL * dt;
  s.vel.z += (dz / d) * SNITCH_ACCEL * dt;
  const sp = Math.sqrt(s.vel.x ** 2 + s.vel.y ** 2 + s.vel.z ** 2);
  if (sp > SNITCH_SPEED) {
    s.vel.x *= SNITCH_SPEED / sp;
    s.vel.y *= SNITCH_SPEED / sp;
    s.vel.z *= SNITCH_SPEED / sp;
  }
  s.pos.x += s.vel.x * dt;
  s.pos.y += s.vel.y * dt;
  s.pos.z += s.vel.z * dt;
  clampBounds(s.pos);
}

function stepBludgers(g, dt) {
  const p = g.player;
  for (const b of g.bludgers) {
    b.t -= dt;
    if (b.state === 'roam') {
      // Lazy drift.
      b.vel.x += (g.rng() - 0.5) * 20 * dt;
      b.vel.y += (g.rng() - 0.5) * 12 * dt;
      b.vel.z += (g.rng() - 0.5) * 20 * dt;
      const sp = Math.sqrt(b.vel.x ** 2 + b.vel.y ** 2 + b.vel.z ** 2);
      const cap = 8;
      if (sp > cap) { b.vel.x *= cap / sp; b.vel.y *= cap / sp; b.vel.z *= cap / sp; }
      if (b.t <= 0) { b.state = 'telegraph'; b.t = 1.0; }
    } else if (b.state === 'telegraph') {
      // Hover and glare: the warning beat before the charge.
      b.vel.x *= 1 - Math.min(1, dt * 4);
      b.vel.y *= 1 - Math.min(1, dt * 4);
      b.vel.z *= 1 - Math.min(1, dt * 4);
      if (b.t <= 0) { b.state = 'homing'; b.t = 3.5; }
    } else if (b.state === 'homing') {
      // Home in on the player's current position.
      const dx = p.pos.x - b.pos.x;
      const dy = p.pos.y - b.pos.y;
      const dz = p.pos.z - b.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      b.vel.x += (dx / d) * 60 * dt;
      b.vel.y += (dy / d) * 60 * dt;
      b.vel.z += (dz / d) * 60 * dt;
      const sp = Math.sqrt(b.vel.x ** 2 + b.vel.y ** 2 + b.vel.z ** 2);
      if (sp > BLUDGER_SPEED) { b.vel.x *= BLUDGER_SPEED / sp; b.vel.y *= BLUDGER_SPEED / sp; b.vel.z *= BLUDGER_SPEED / sp; }
      if (b.t <= 0) { b.state = 'cooldown'; b.t = 2.0; }
    } else {
      // cooldown: bleed speed, then back to roaming.
      b.vel.x *= 1 - Math.min(1, dt * 2);
      b.vel.y *= 1 - Math.min(1, dt * 2);
      b.vel.z *= 1 - Math.min(1, dt * 2);
      if (b.t <= 0) { b.state = 'roam'; b.t = 3 + g.rng() * 3; }
    }
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.pos.z += b.vel.z * dt;
    clampBounds(b.pos);

    // Hit: stun the player, bludger backs off to cooldown.
    if ((b.state === 'homing' || b.state === 'telegraph') && p.stunT <= 0) {
      if (dist3(b.pos, p.pos) < BLUDGER_HIT_R) {
        p.stunT = STUN_TIME;
        b.state = 'cooldown';
        b.t = 2.5;
        // Knock the bludger away so it doesn't multi-hit.
        b.vel.x = (b.pos.x - p.pos.x) * 4;
        b.vel.y = 6;
        b.vel.z = (b.pos.z - p.pos.z) * 4;
      }
    }
  }
}

// input: { yaw: -1..1, pitch: -1..1, dive: bool }
export function stepGame(g, dt, input = {}) {
  g.time += dt;

  if (g.phase === 'countdown') {
    g.countdownT -= dt;
    if (g.countdownT <= 0) {
      g.phase = 'playing';
      g.player.speed = SEEKER_SPEED * 0.5;
      g.rival.speed = SEEKER_SPEED * 0.5;
    }
    return g;
  }
  if (g.phase !== 'playing') return g;

  stepPlayer(g, dt, input);
  stepRival(g, dt);
  stepSnitch(g, dt);
  stepBludgers(g, dt);

  // Ambient Quaffle game: bot Chasers score now and then. Flavor only.
  g.quaffleT -= dt;
  if (g.quaffleT <= 0) {
    g.quaffleT = 8 + g.rng() * 8;
    if (g.rng() < 0.5) g.score.you += QUAFFLE_POINTS;
    else g.score.rival += QUAFFLE_POINTS;
  }

  // The Snitch decides the match.
  if (dist3(g.player.pos, g.snitch.pos) < SNITCH_CATCH_R) {
    g.phase = 'won';
    g.winner = 'you';
    g.score.you += SNITCH_POINTS;
    return g;
  }
  if (dist3(g.rival.pos, g.snitch.pos) < SNITCH_CATCH_R) {
    g.phase = 'lost';
    g.winner = 'rival';
    g.score.rival += SNITCH_POINTS;
    return g;
  }
  return g;
}

export function resetGame(g) {
  const fresh = createGame((Math.random() * 0xffffffff) >>> 0);
  for (const k of Object.keys(fresh)) g[k] = fresh[k];
  return g;
}
