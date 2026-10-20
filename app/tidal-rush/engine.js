// app/tidal-rush/engine.js
// TIDAL RUSH — pure, headless race engine. No DOM, no React, no three.js.
//
// You race a jet ski around a buoy-marked ocean course: pass every gate
// in order, three laps, up to 10 racers (you + up to 9 AI rivals). The AI
// rubber-bands so the pack stays honest, waves shove your handling
// around, boost orbs beg to be grabbed, and a missed gate costs time.
//
// State lives in one mutable object the page steps at a fixed 120 Hz and
// the 3D scene reads imperatively. Everything funnels through events
// (drainEvents) so sound / haptics / HUD stay decoupled.

// ------------------------------------------------------------------ tuning
export const LAPS = 3;
export const RACER_COUNTS = [4, 6, 8, 10];
export const MAX_RACERS = 10;
export const GATE_COUNT = 14; // gates per lap
export const TRACK_HALF = 23; // half-width of the racing corridor (m)
export const GATE_HALF = TRACK_HALF + 2; // buoys sit on the corridor edge
export const MISS_PENALTY_MS = 3000; // +3 s per missed gate
export const BOOST_MAX = 100;
export const BOOST_DRAIN = 34; // per second while boosting
export const BOOST_REGEN = 7; // per second, always trickling back
export const BOOST_ORB_GAIN = 35;
export const BASE_SPEED = 40; // m/s cruise
export const BOOST_MULT = 1.35;

const TURN_RATE = 1.55; // rad/s at full lock
const RESPAWN_AFTER = 1.6; // seconds hopelessly off course before a reset
const GRAVITY = 22;

// ------------------------------------------------------------- the course
// A closed loop built from a few cosine harmonics — smooth, interesting,
// deterministic. Sampled once into an arclength table so every lookup is
// cheap and the tests can reason about it.
const TRACK_R = 260;
const SAMPLES = 720;

function rawPoint(s) {
  const a = s * Math.PI * 2;
  return {
    x: TRACK_R * (Math.cos(a) + 0.24 * Math.cos(2 * a + 0.7) + 0.08 * Math.cos(3 * a + 2.1)),
    z: TRACK_R * (Math.sin(a) + 0.24 * Math.sin(2 * a + 1.3) + 0.08 * Math.sin(4 * a + 0.4)),
  };
}

const centerline = (() => {
  const pts = [];
  for (let i = 0; i < SAMPLES; i++) pts.push(rawPoint(i / SAMPLES));
  const cum = [0];
  for (let i = 1; i <= SAMPLES; i++) {
    const a = pts[i - 1];
    const b = pts[i % SAMPLES];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { pts, cum, length: cum[SAMPLES] };
})();

export const TRACK_LENGTH = centerline.length;
export const GATE_SPACING = TRACK_LENGTH / GATE_COUNT;

/** Point + unit tangent at arclength fraction s ∈ [0, 1). */
export function trackPoint(s) {
  const wrapped = ((s % 1) + 1) % 1;
  const f = wrapped * SAMPLES;
  const i = Math.floor(f) % SAMPLES;
  const j = (i + 1) % SAMPLES;
  const t = f - Math.floor(f);
  const a = centerline.pts[i];
  const b = centerline.pts[j];
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  let tx = b.x - a.x;
  let tz = b.z - a.z;
  const len = Math.hypot(tx, tz) || 1;
  return { x, z, tx: tx / len, tz: tz / len };
}

/** Nearest centerline sample to (x, z): { s, lateral, dist }. */
export function nearestOnTrack(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    const p = centerline.pts[i];
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const p = trackPoint(best / SAMPLES);
  // Signed lateral: positive = left of travel direction.
  const rx = x - p.x;
  const rz = z - p.z;
  const lateral = rx * -p.tz + rz * p.tx;
  return { s: best / SAMPLES, lateral, dist: Math.sqrt(bestD), tx: p.tx, tz: p.tz };
}

/** Gate k (0-based, global across laps) sits at this arclength. */
export function gateArclength(k) {
  return k * GATE_SPACING;
}

/** Which gate index a progress value has most recently reached. */
export function gateIndexForProgress(progress) {
  return Math.floor(progress / GATE_SPACING);
}

/** 1-based lap for a progress value (can exceed LAPS once finished). */
export function lapForProgress(progress) {
  return Math.floor(progress / TRACK_LENGTH) + 1;
}

/** Gate buoy world positions for rendering: [{ x, z, left:{x,z}, right:{x,z}, s }]. */
export function gatePositions() {
  const gates = [];
  for (let i = 0; i < GATE_COUNT; i++) {
    const s = i / GATE_COUNT;
    const p = trackPoint(s);
    const nx = -p.tz;
    const nz = p.tx;
    gates.push({
      s,
      x: p.x,
      z: p.z,
      tx: p.tx,
      tz: p.tz,
      left: { x: p.x + nx * GATE_HALF, z: p.z + nz * GATE_HALF },
      right: { x: p.x - nx * GATE_HALF, z: p.z - nz * GATE_HALF },
    });
  }
  return gates;
}

// ------------------------------------------------------------------ waves
// Three traveling sine swells. The exact same math is baked into the
// ocean shader in TidalRushScene.jsx — keep the constants in sync.
export const WAVE = [
  { amp: 0.85, kx: 0.055, kz: 0.021, speed: 1.15 },
  { amp: 0.5, kx: -0.034, kz: 0.072, speed: 1.6 },
  { amp: 0.26, kx: 0.11, kz: -0.093, speed: 2.3 },
];

export function waveHeight(x, z, t) {
  let h = 0;
  for (const w of WAVE) h += w.amp * Math.sin(x * w.kx + z * w.kz + t * w.speed);
  return h;
}

/** Wave slope along a heading — used to push/pull handling. */
export function waveSlope(x, z, t, hx, hz) {
  const e = 1.5;
  const ahead = waveHeight(x + hx * e, z + hz * e, t);
  const behind = waveHeight(x - hx * e, z - hz * e, t);
  return (ahead - behind) / (2 * e);
}

// ----------------------------------------------------------------- racers
const RIVALS = [
  { name: 'Reef', color: '#ff5964' },
  { name: 'Coral', color: '#ff9f1c' },
  { name: 'Marina', color: '#c77dff' },
  { name: 'Breaker', color: '#4cc9f0' },
  { name: 'Surge', color: '#80ed99' },
  { name: 'Lagoon', color: '#f72585' },
  { name: 'Pelican', color: '#ffd166' },
  { name: 'Anchor', color: '#a8dadc' },
  { name: 'Tide', color: '#e0aaff' },
];

const ORB_SPOTS = [0.06, 0.16, 0.27, 0.38, 0.49, 0.6, 0.71, 0.82, 0.9, 0.97];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Rubber-band factor for an AI racer relative to the player. */
export function rubberBandFactor(aiProgress, playerProgress) {
  if (!Number.isFinite(playerProgress) || !Number.isFinite(aiProgress)) return 1;
  const diff = playerProgress - aiProgress; // + = AI behind the player
  return clamp(1 + diff / 2200, 0.9, 1.14);
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function createRace({ racerCount = 6, laps = LAPS, seed = 7 } = {}) {
  const count = RACER_COUNTS.includes(racerCount) ? racerCount : 6;
  const racers = [];
  const mkRacer = (i, def, isPlayer) => {
    // Start grid: two staggered columns just behind the start line.
    const back = 8 + Math.floor(i / 2) * 8;
    const lat = i % 2 === 0 ? -8 : 8;
    const arc = -back;
    const s = (((arc / TRACK_LENGTH) % 1) + 1) % 1;
    const p = trackPoint(s);
    const nx = -p.tz;
    const nz = p.tx;
    return {
      id: i,
      name: def.name,
      color: def.color,
      isPlayer,
      x: p.x + nx * lat,
      z: p.z + nz * lat,
      y: 0,
      vy: 0,
      heading: Math.atan2(p.tx, p.tz),
      speed: 0,
      steer: 0,
      boost: 50,
      boosting: false,
      lapFloat: arc / TRACK_LENGTH,
      prevS: s,
      progress: arc,
      lateral: lat,
      lap: 1,
      lapStart: 0,
      bestLapMs: null,
      penaltiesMs: 0,
      gatesPassed: 0,
      nextLine: 1, // next gate line to cross (line k sits at k * GATE_SPACING)
      nextGate: 1 % GATE_COUNT, // same line as a gate index, for the scene/HUD
      hitCooldown: 0,
      offCourseTime: 0,
      airborne: false,
      airTime: 0,
      prevWaveH: 0,
      style: 0,
      skill: isPlayer ? 1 : 0.95 + ((seed * 31 + i * 17) % 10) / 100, // 0.95–1.04
      wobblePhase: (seed * 13 + i * 41) % 628 / 100,
      finished: false,
      finishTimeMs: null,
    };
  };
  racers.push(mkRacer(0, { name: 'You', color: '#ffd60a' }, true));
  for (let i = 1; i < count; i++) racers.push(mkRacer(i, RIVALS[(i - 1) % RIVALS.length], false));

  const orbs = ORB_SPOTS.map((s, i) => {
    const p = trackPoint(s);
    const lat = i % 2 === 0 ? -9 : 9;
    const nx = -p.tz;
    const nz = p.tx;
    return { s, x: p.x + nx * lat, z: p.z + nz * lat, active: true, respawn: 0 };
  });

  return {
    phase: 'countdown', // countdown -> racing -> finished
    countdown: 3.4,
    lastBeep: 4,
    timeMs: 0,
    laps,
    totalDistance: TRACK_LENGTH * laps,
    racers,
    orbs,
    events: [],
    results: null,
  };
}

export function drainEvents(state) {
  const ev = state.events;
  state.events = [];
  return ev;
}

function emit(state, type, extra = {}) {
  state.events.push({ type, ...extra });
}

/** Rank racers: finishers by time, then everyone else by progress. */
export function computePositions(state) {
  const list = [...state.racers];
  list.sort((a, b) => {
    if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  return list.map((r, i) => ({ racer: r, position: i + 1 }));
}

function placeAtGate(state, racer, lineIdx) {
  const gateArc = lineIdx * GATE_SPACING;
  const s = (((gateArc / TRACK_LENGTH) % 1) + 1) % 1;
  const p = trackPoint(s);
  racer.x = p.x;
  racer.z = p.z;
  racer.heading = Math.atan2(p.tx, p.tz);
  racer.speed = Math.min(racer.speed, 14);
  racer.lapFloat = gateArc / TRACK_LENGTH;
  racer.prevS = s;
  racer.progress = gateArc;
  racer.offCourseTime = 0;
  emit(state, 'respawn', { racerId: racer.id });
}

function stepRacer(state, racer, dt, input) {
  const t = state.timeMs / 1000;
  const near = nearestOnTrack(racer.x, racer.z);
  // Unwrap the centerline fraction so progress is monotonic across the line.
  let dS = near.s - racer.prevS;
  if (dS > 0.5) dS -= 1;
  if (dS < -0.5) dS += 1;
  racer.prevS = near.s;
  racer.lapFloat += dS;
  racer.progress = racer.lapFloat * TRACK_LENGTH;
  racer.lateral = near.lateral;

  // --- gates & laps ------------------------------------------------------
  // Gate lines repeat every lap: line k is gate (k mod GATE_COUNT) at
  // arclength k * GATE_SPACING. Crossing inside the buoys scores a pass;
  // crossing wide is a miss and costs time. (Line 0 is the start line
  // itself — you launch from the grid behind it.)
  racer.hitCooldown = Math.max(0, racer.hitCooldown - dt);
  while (racer.progress >= racer.nextLine * GATE_SPACING) {
    const k = racer.nextLine;
    racer.nextLine += 1;
    racer.nextGate = racer.nextLine % GATE_COUNT;
    racer.gatesPassed += 1;
    if (Math.abs(racer.lateral) <= GATE_HALF + 2) {
      emit(state, 'buoyPass', { racerId: racer.id, gate: k % GATE_COUNT });
    } else {
      racer.penaltiesMs += MISS_PENALTY_MS;
      emit(state, 'missedGate', { racerId: racer.id, gate: k % GATE_COUNT });
    }
  }
  const newLap = Math.min(state.laps, lapForProgress(Math.max(0, racer.progress)));
  if (newLap > racer.lap && racer.progress > 0) {
    const lapMs = state.timeMs - racer.lapStart;
    if (racer.bestLapMs === null || lapMs < racer.bestLapMs) racer.bestLapMs = lapMs;
    racer.lapStart = state.timeMs;
    racer.lap = newLap;
    emit(state, 'lap', { racerId: racer.id, lap: newLap });
  }

  if (!racer.finished && racer.progress >= state.totalDistance) {
    racer.finished = true;
    racer.finishTimeMs = state.timeMs + racer.penaltiesMs;
    const lastLapMs = state.timeMs - racer.lapStart;
    if (racer.bestLapMs === null || lastLapMs < racer.bestLapMs) racer.bestLapMs = lastLapMs;
    emit(state, 'finish', { racerId: racer.id });
    return;
  }
  if (racer.finished) return;

  // --- steering ----------------------------------------------------------
  let steer = 0;
  if (racer.isPlayer) {
    steer = clamp(input.steer || 0, -1, 1);
  } else {
    // Steer toward a point ahead on the centerline, pulled back to center.
    const look = ((racer.lapFloat + 55 / TRACK_LENGTH) % 1 + 1) % 1;
    const target = trackPoint(look);
    const pullLat = clamp(-racer.lateral * 0.6, -10, 10);
    const tx = target.x + -target.tz * pullLat;
    const tz = target.z + target.tx * pullLat;
    const desired = Math.atan2(tx - racer.x, tz - racer.z);
    let err = desired - racer.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    steer = clamp(err * 1.6, -1, 1) + Math.sin(t * 0.7 + racer.wobblePhase) * 0.05;
  }
  racer.steer = steer;
  const speedRatio = clamp(racer.speed / BASE_SPEED, 0.25, 1.3);
  racer.heading += steer * TURN_RATE * speedRatio * dt;

  // --- boost ---------------------------------------------------------------
  const wantBoost = racer.isPlayer ? !!input.boost : racer.boost > 55 && Math.abs(steer) < 0.35;
  racer.boosting = wantBoost && racer.boost > 1;
  if (racer.boosting) {
    racer.boost = Math.max(0, racer.boost - BOOST_DRAIN * dt);
    if (racer.isPlayer) emit(state, 'boostTick', { racerId: racer.id });
  } else {
    racer.boost = Math.min(BOOST_MAX, racer.boost + BOOST_REGEN * dt);
  }

  // --- target speed --------------------------------------------------------
  const hx = Math.sin(racer.heading);
  const hz = Math.cos(racer.heading);
  const slope = waveSlope(racer.x, racer.z, t, hx, hz);
  let target = BASE_SPEED * racer.skill;
  if (!racer.isPlayer) {
    const player = state.racers[0];
    target *= rubberBandFactor(racer.progress, player.progress);
  }
  const off = Math.max(0, Math.abs(racer.lateral) - TRACK_HALF);
  target *= 1 - 0.35 * Math.min(1, off / 45); // the open sea is slow going
  target *= 1 - clamp(slope, -0.6, 0.6) * 0.18; // climbing a swell costs speed
  if (racer.boosting) target *= BOOST_MULT;
  if (racer.airborne) target = Math.max(target, racer.speed); // no drag mid-air

  const accel = racer.boosting ? 1.6 : 0.85;
  racer.speed += (target - racer.speed) * Math.min(1, accel * dt);

  // --- move ------------------------------------------------------------------
  racer.x += hx * racer.speed * dt;
  racer.z += hz * racer.speed * dt;

  // --- waves: ride, launch, land --------------------------------------------
  const h = waveHeight(racer.x, racer.z, t);
  if (!racer.airborne) {
    racer.y = h;
    const vyWave = dt > 0 ? (h - racer.prevWaveH) / dt : 0;
    if (racer.speed > 32 && vyWave > 5.2) {
      racer.airborne = true;
      racer.vy = vyWave * 0.5;
      racer.airTime = 0;
    }
  } else {
    racer.vy -= GRAVITY * dt;
    racer.y += racer.vy * dt;
    racer.airTime += dt;
    if (racer.y <= h) {
      racer.y = h;
      racer.airborne = false;
      if (racer.airTime > 0.3) {
        racer.style += Math.round(racer.airTime * 150);
        emit(state, 'air', { racerId: racer.id, airTime: racer.airTime });
      }
      emit(state, 'splash', { racerId: racer.id });
    }
  }
  racer.prevWaveH = h;

  // --- hopelessly lost? reset to the last gate -------------------------------
  if (Math.abs(racer.lateral) > TRACK_HALF + 70) {
    racer.offCourseTime += dt;
    if (racer.offCourseTime > RESPAWN_AFTER) {
      placeAtGate(state, racer, Math.max(0, racer.nextLine - 1));
    }
  } else {
    racer.offCourseTime = 0;
  }

  // --- boost orbs --------------------------------------------------------------
  for (const orb of state.orbs) {
    if (!orb.active) continue;
    const dx = racer.x - orb.x;
    const dz = racer.z - orb.z;
    if (dx * dx + dz * dz < 20) {
      orb.active = false;
      orb.respawn = 9;
      racer.boost = Math.min(BOOST_MAX, racer.boost + BOOST_ORB_GAIN);
      emit(state, 'orb', { racerId: racer.id });
      break;
    }
  }
}

function collide(state) {
  const rs = state.racers;
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i];
      const b = rs[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.4;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / 2) * 0.9;
        const ux = dx / d;
        const uz = dz / d;
        // Positional separation every step — hulls may never overlap.
        a.x -= ux * push;
        a.z -= uz * push;
        b.x += ux * push;
        b.z += uz * push;
        // The speed penalty (and the thump) only lands on a real closing
        // impact, rate-limited per racer — a rubbing pack must not grind
        // everyone's speed to zero at 120 Hz.
        const closing =
          (Math.sin(a.heading) * a.speed - Math.sin(b.heading) * b.speed) * ux +
          (Math.cos(a.heading) * a.speed - Math.cos(b.heading) * b.speed) * uz;
        if (closing > 2 && a.hitCooldown <= 0 && b.hitCooldown <= 0) {
          a.speed *= 0.9;
          b.speed *= 0.9;
          a.hitCooldown = 0.3;
          b.hitCooldown = 0.3;
          if (a.isPlayer || b.isPlayer) emit(state, 'collision', { racerId: a.isPlayer ? a.id : b.id });
        }
      }
    }
  }
}

function buildResults(state) {
  const player = state.racers[0];
  const rows = state.racers.map((r) => {
    let totalMs;
    let projected = false;
    if (r.finished) {
      totalMs = r.finishTimeMs;
    } else {
      // Project the stragglers home at their race-long average pace so the
      // results table can show the whole field the moment you finish.
      const elapsed = Math.max(1, state.timeMs);
      const pace = r.progress / elapsed; // m per ms
      const remaining = Math.max(0, state.totalDistance - r.progress);
      totalMs = pace > 0.0001 ? state.timeMs + r.penaltiesMs + remaining / pace : Number.MAX_SAFE_INTEGER;
      projected = true;
    }
    return {
      racerId: r.id,
      name: r.name,
      color: r.color,
      isPlayer: r.isPlayer,
      totalMs: Math.round(totalMs),
      bestLapMs: r.bestLapMs,
      style: r.style,
      penaltiesMs: r.penaltiesMs,
      projected,
    };
  });
  rows.sort((a, b) => a.totalMs - b.totalMs);
  rows.forEach((row, i) => {
    row.position = i + 1;
  });
  state.results = rows;
  void player;
}

/**
 * Step the race. input = { steer: -1..1, boost: bool } for the player.
 * Fixed-step friendly: call with small dt (the page uses 1/120).
 */
export function stepRace(state, dt, input = {}) {
  if (state.phase === 'finished') return state;
  if (state.phase === 'countdown') {
    state.countdown -= dt;
    const c = Math.ceil(state.countdown);
    if (c < state.lastBeep && c >= 0) {
      state.lastBeep = c;
      emit(state, c === 0 ? 'go' : 'beep', { count: c });
    }
    // Racers idle-bob on the start line.
    const t = state.timeMs / 1000;
    for (const r of state.racers) r.y = waveHeight(r.x, r.z, t);
    if (state.countdown <= 0) {
      state.phase = 'racing';
      for (const r of state.racers) r.lapStart = 0;
    }
    return state;
  }

  state.timeMs += dt * 1000;
  for (const r of state.racers) stepRacer(state, r, dt, input);
  collide(state);

  for (const orb of state.orbs) {
    if (!orb.active) {
      orb.respawn -= dt;
      if (orb.respawn <= 0) orb.active = true;
    }
  }

  const player = state.racers[0];
  if (player.finished) {
    state.phase = 'finished';
    buildResults(state);
    emit(state, 'raceOver', {});
  }
  return state;
}
