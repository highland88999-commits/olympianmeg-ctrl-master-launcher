// app/shadow-realm/ai.js — VS AI for SHADOW REALM races.
//
// Pure JavaScript (no JSX, no Three.js) so the headless test suite can
// import it directly.
//
// DESIGN: bots ride the centerline PARAMETRICALLY (state = arclength s).
// Track-boundary respect is structural, not behavioral: lateral offset is
// clamped to ±halfW*0.7 at pose time, so a bot can NEVER leave the
// corridor, on any track, no matter its skill roll.
//
// GHOST BY DESIGN: bikes never collide with each other — no bot-vs-player
// and no bot-vs-bot collision. The player always rides a clean line; AI
// is a duel, not a demolition derby.

import { centerline } from './tracks.js';

export const WOBBLE_K = (Math.PI * 2) / 100; // ~100 world-unit wobble wavelength
export const RUBBER_GAIN = 0.5;
export const RUBBER_MIN = 0.92; // 1 - 0.08
export const RUBBER_MAX = 1.12; // 1 + 0.12

const BOT_COLORS = [
  '#ff2fb3', // rival pink
  '#00ff88', // rival green
  '#ffea00', // rival yellow
  '#ff6a00', // rival orange
  '#c44dff', // rival violet
  '#00d5ff', // rival cyan
  '#ff4444', // rival red
  '#7cff00', // rival lime
];

// mulberry32 — seeded PRNG. Same seed -> identical bot rosters (deterministic;
// drop-2 PvP will reuse makeBots for AI autofill).
export function mulberry32(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// makeBots({ count, track, seed }) -> bot roster. Each bot:
//   { name, color, skill: { topSpeedFrac 0.85-1.0, cornerFrac 0.55-0.85,
//     wobbleAmp, wobblePhase }, s, speed, lap, time, finished, finishTime,
//     progress, offset }
export function makeBots({ count, track, seed }) {
  const rng = mulberry32(seed);
  // Deterministic shuffle of the neon palette, then take the first `count`.
  const colors = [...BOT_COLORS];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  const stagger = track ? (trackLengthOf(track) * 0.004) : 6;
  const bots = [];
  for (let i = 0; i < count; i++) {
    bots.push({
      name: `RIVAL-${i + 1}`,
      color: colors[i % colors.length],
      skill: {
        topSpeedFrac: 0.85 + rng() * 0.15,
        cornerFrac: 0.55 + rng() * 0.3,
        wobbleAmp: 0.6 + rng() * 1.6,
        wobblePhase: rng() * Math.PI * 2,
      },
      s: -(i + 1) * stagger, // staggered grid slots behind the start line
      speed: 0,
      lap: 0,
      time: 0,
      finished: false,
      finishTime: null,
      progress: 0, // lap units: 2.5 = lap 3, halfway around
      offset: 0, // lateral, clamped to ±halfW*0.7 at pose time
    });
  }
  return bots;
}

function trackLengthOf(track) {
  const pts = centerline(track, 128);
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    len += Math.hypot(q.x - p.x, q.z - p.z);
  }
  return len;
}

// buildTrackData(track, { maxSpeed, raceLaps, accel, brake, n }) —
// precomputed centerline samples for fast parametric queries.
export function buildTrackData(track, opts = {}) {
  const n = opts.n || 256;
  const pts = centerline(track, n);
  const cum = new Float64Array(n); // cum[i] = arclength at pts[i]
  const tx = new Float64Array(n); // unit tangent at pts[i]
  const tz = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    cum[i] = total;
    const q = pts[(i + 1) % n];
    total += Math.hypot(q.x - pts[i].x, q.z - pts[i].z);
  }
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n];
    const q = pts[(i + 1) % n];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
  }
  return {
    pts,
    cum,
    tx,
    tz,
    n,
    lapLen: total,
    halfW: (track.width || 14) / 2,
    maxSpeed: opts.maxSpeed || 45,
    raceLaps: opts.raceLaps || 3,
    accel: opts.accel || 30,
    brake: opts.brake || 60,
  };
}

function wrapS(s, lapLen) {
  let w = s % lapLen;
  if (w < 0) w += lapLen;
  return w;
}

// sampleTrack(trackData, s) -> { x, z, tx, tz } at arclength s (wraps).
export function sampleTrack(td, s) {
  const w = wrapS(s, td.lapLen);
  // binary search the segment
  let lo = 0;
  let hi = td.n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (td.cum[mid] <= w) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const j = (i + 1) % td.n;
  const segStart = td.cum[i];
  const segLen = (j === 0 ? td.lapLen : td.cum[j]) - segStart || 1e-9;
  const t = clamp((w - segStart) / segLen, 0, 1);
  const p = td.pts[i];
  const q = td.pts[j];
  let vx = td.tx[i] + (td.tx[j] - td.tx[i]) * t;
  let vz = td.tz[i] + (td.tz[j] - td.tz[i]) * t;
  const vl = Math.hypot(vx, vz) || 1;
  vx /= vl;
  vz /= vl;
  return {
    x: p.x + (q.x - p.x) * t,
    z: p.z + (q.z - p.z) * t,
    tx: vx,
    tz: vz,
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// cornerSharpness(trackData, s) -> 0..1. Samples tangent-angle change over
// a lookahead window; 0 = straight, 1 = hairpin.
export function cornerSharpness(td, s) {
  const a0 = Math.atan2(sampleTrack(td, s).tx, sampleTrack(td, s).tz);
  const a1 = Math.atan2(sampleTrack(td, s + 18).tx, sampleTrack(td, s + 18).tz);
  const a2 = Math.atan2(sampleTrack(td, s + 42).tx, sampleTrack(td, s + 42).tz);
  const turn = Math.max(Math.abs(angleDiff(a1, a0)), Math.abs(angleDiff(a2, a1)));
  // Normalized so the sharpest corners on the 20-track roster (sweeping
  // hairpins ~0.43 rad/window) read ~0.85: real slowdown where it matters,
  // mild variance on ovals, and constant-radius rings stay drivable.
  return clamp(turn / 0.6, 0, 1);
}

// rubberBandFactor(progressDelta) -> 1 + clamp(delta * gain, -0.08, +0.12).
// progressDelta = playerProgress - botProgress (lap units). Bot goes a touch
// faster when behind the player, a touch slower when ahead.
export function rubberBandFactor(progressDelta) {
  return 1 + clamp(progressDelta * RUBBER_GAIN, RUBBER_MIN - 1, RUBBER_MAX - 1);
}

// advanceBot(bot, dt, trackData, playerProgress) — pure parametric step.
// Mutates and returns the bot.
export function advanceBot(bot, dt, trackData, playerProgress) {
  if (bot.finished) return bot;
  const { maxSpeed, raceLaps, lapLen, halfW } = trackData;
  const skill = bot.skill;

  // Target speed: skill top speed, bled off through corners, rubber-banded
  // against the player.
  const top = skill.topSpeedFrac * maxSpeed;
  const sharp = cornerSharpness(trackData, bot.s);
  const cornerTarget = top * (1 - (1 - skill.cornerFrac) * sharp);
  const target = cornerTarget * rubberBandFactor((playerProgress || 0) - bot.progress);

  // Ease toward target (bots accelerate/brake like the trim bikes do).
  const rate = target > bot.speed ? trackData.accel : trackData.brake;
  bot.speed += clamp(target - bot.speed, -rate * dt, rate * dt);

  bot.s += bot.speed * dt;
  bot.time += dt;
  bot.lap = Math.max(0, Math.floor(bot.s / lapLen));
  bot.progress = bot.s / lapLen;

  if (bot.s >= raceLaps * lapLen) {
    bot.finished = true;
    bot.finishTime = bot.time;
    bot.s = raceLaps * lapLen; // park on the line
    bot.speed = 0;
    bot.progress = raceLaps;
    bot.lap = raceLaps;
  }

  // Lateral wobble — structurally clamped so bots respect boundaries by
  // construction.
  const maxOff = halfW * 0.7;
  bot.offset = clamp(
    skill.wobbleAmp * Math.sin(bot.s * WOBBLE_K + skill.wobblePhase),
    -maxOff,
    maxOff
  );
  return bot;
}

// botPose(bot, trackData) -> { x, z, heading } for the renderer.
// heading follows the scene's nose-+Z yaw convention (atan2(dx, dz)).
export function botPose(bot, trackData) {
  const p = sampleTrack(trackData, bot.s);
  // Unit normal of the tangent: (tz, -tx).
  return {
    x: p.x + p.tz * bot.offset,
    z: p.z - p.tx * bot.offset,
    heading: Math.atan2(p.tx, p.tz),
  };
}

// placements(playerResult, bots) -> sorted standings:
//   finished first by finishTime asc, then unfinished by progress desc.
// playerResult: { name?, color?, finishTime, progress? }.
export function placements(playerResult, bots) {
  const rows = [
    {
      name: playerResult.name || 'YOU',
      color: playerResult.color || '#19d3ff',
      isPlayer: true,
      finishTime: playerResult.finishTime != null ? playerResult.finishTime : null,
      progress: playerResult.progress || 0,
    },
    ...(bots || []).map((b) => ({
      name: b.name,
      color: b.color,
      isPlayer: false,
      finishTime: b.finished ? b.finishTime : null,
      progress: b.progress || 0,
    })),
  ];
  rows.sort((a, b) => {
    const af = a.finishTime != null;
    const bf = b.finishTime != null;
    if (af && bf) return a.finishTime - b.finishTime;
    if (af) return -1;
    if (bf) return 1;
    return b.progress - a.progress;
  });
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
