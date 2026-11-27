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
import {
  BUMP_LIVES,
  KNOCK_DECAY,
  inFlameZone,
  inwardOffsetSign,
  botBumpTargetOffset,
  applyLifeLoss,
  isEliminated,
} from '../../lib/shadow-realm/bump.js';
import {
  Trail,
  TRAIL_KILL_RADIUS,
  checkRivalTrails,
  nearestTrailDist,
  findSafeSpot,
} from '../../lib/shadow-realm/trails.js';

/** Bot post-trail-death immunity (shorter than the player's 10s — bots stay
 *  trappable, they just don't insta-die on respawn). */
export const BOT_TRAIL_IMMUNITY_S = 5;
/** Bot trail-death pause before respawn (the pixelated dissolve). */
export const BOT_DEATH_PAUSE_S = 1.2;
/** AI lookahead for trail avoidance (seconds of travel). */
export const BOT_TRAIL_LOOKAHEAD_S = 1.5;
/** AI trail-avoidance sensor radius. */
export const BOT_TRAIL_SENSE_R = 14;

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

// makeBots({ count, track, seed, aggression }) -> bot roster. Each bot:
//   { name, color, skill: { topSpeedFrac 0.85-1.0, cornerFrac 0.55-0.85,
//     wobbleAmp, wobblePhase }, s, speed, lap, time, finished, finishTime,
//     progress, offset, aggression, lives, shoveX, shoveZ, invulnT, eliminated,
//     fly, preHitS, preHitOffset }
//
// FLY-OFF (race + bump modes): a bump victim launches (fly: startFly state,
// deadT = FLY_SECS pauses the advance), tumbles, then respawns AT THE
// PRE-HIT POSE (preHitS/preHitOffset captured at impact) — not the nearest
// safe point (that respawn belongs to trail deaths).
//
// BUMP MODE (Merlin 2026-10-03): aggression 0..1 makes the bot steer to
// shove the player toward the flame when alongside. Bots also carry 3
// lives: a player bump can shove them (shoveX/shoveZ, decaying world-space
// impulse) into the flame — they lose a life and reset. 0 lives =
// eliminated. Their STEERING never suicides: the wobble/aggression target
// stays clamped inside the corridor; only an external shove can push them
// into the flame.
export function makeBots({ count, track, seed, aggression = 0 }) {
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
      offset: 0, // lateral, steered inside ±halfW*0.7 (never self-flames)
      aggression: Math.min(1, Math.max(0, Number(aggression) || 0)),
      lives: BUMP_LIVES,
      shoveX: 0, // world-space knock impulse from player bumps (decays)
      shoveZ: 0,
      invulnT: 0, // post-flame-respawn grace
      eliminated: false,
      // LETHAL TRAILS (Merlin 2026-10-03): each bot lays its own trail;
      // riding a rival's trail destroys the bot (fair and square).
      trail: new Trail(),
      trailImmuneT: 0, // post-trail-death immunity
      deadT: 0, // trail-death dissolve timer (bot is paused)
      deaths: 0,
      // FLY-OFF: null unless launched by a bump — then { t, dur, x0, z0,
      // heading0, vx, vz } (see lib/shadow-realm/bump.js startFly) with
      // deadT = FLY_SECS pausing the advance; preHitS/preHitOffset are the
      // arclength + lateral offset at impact (the respawn point).
      fly: null,
      preHitS: null,
      preHitOffset: null,
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

// buildTrackData(track, { maxSpeed, raceLaps, accel, brake, n, flame }) —
// precomputed centerline samples for fast parametric queries. flame (when
// present) anchors bump-mode geometry: inwardSign tells which offset sign
// points at the flame.
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
  const td = {
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
  if (opts.flame) {
    td.flame = opts.flame;
    td.inwardSign = inwardOffsetSign(td, opts.flame);
  }
  return td;
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

// trailAvoidance(bot, trackData, rivalTrails, now) -> offset adjustment.
// The bot looks ahead along its line; when a rival trail segment is close
// to the lookahead point, it steers the lateral offset AWAY from the trail.
// Returns 0 when clear. Moderate skill: the sense radius and lookahead are
// tuned so bots dodge the obvious traps but can still be herded into a
// wall of light — they die fair and square.
export function trailAvoidance(bot, trackData, rivalTrails, now) {
  if (!rivalTrails || rivalTrails.length === 0) return 0;
  const lookS = bot.s + Math.max(10, (bot.speed || 0) * BOT_TRAIL_LOOKAHEAD_S);
  const look = sampleTrack(trackData, lookS);
  // Lateral offset of the lookahead point (same convention as botPose).
  const lx = look.x + look.tz * bot.offset;
  const lz = look.z - look.tx * bot.offset;
  const near = nearestTrailDist(rivalTrails, lx, lz, now, BOT_TRAIL_SENSE_R);
  if (!near) return 0;
  // Which side is the trail on? Right normal of the tangent is (-tz, tx).
  const rx = -look.tz;
  const rz = look.tx;
  let side = (near.nx - lx) * rx + (near.nz - lz) * rz;
  // Dead ahead (|side| ~ 0): the bot is about to ride straight into it —
  // swerve left by default (positive offset = left).
  if (Math.abs(side) < 0.5) side = 1;
  // Steer away: a trail on the right (side > 0) means steer left, and
  // positive offset IS left (botPose: +offset shifts toward -right).
  const urgency = 1 - near.dist / BOT_TRAIL_SENSE_R; // 0..1
  const maxOff = trackData.halfW * 0.7;
  return Math.sign(side) * urgency * maxOff * 0.8;
}

// respawnBot(bot, trackData, rivalTrails, now): after the dissolve pause,
// drop the bot at the nearest arclength clear of rival trails, with brief
// immunity and a cleared trail.
// FLY-OFF: a launched bot (preHitS set) respawns AT THE PRE-HIT POSE
// instead — the arclength + offset captured at impact — with the same
// brief immunity. No safe-search: the impact point is the respawn point.
export function respawnBot(bot, trackData, rivalTrails, now) {
  if (bot.preHitS != null && Number.isFinite(bot.preHitS)) {
    bot.s = bot.preHitS;
    bot.offset = Number.isFinite(bot.preHitOffset) ? bot.preHitOffset : 0;
    bot.preHitS = null;
    bot.preHitOffset = null;
    bot.fly = null;
    bot.speed = 0;
    bot.shoveX = 0;
    bot.shoveZ = 0;
    bot.invulnT = 2.0;
    bot.trailImmuneT = BOT_TRAIL_IMMUNITY_S;
    if (bot.trail) bot.trail.clear();
    return bot;
  }
  const pts = trackData.pts;
  // Search arclengths near the death spot for a safe one.
  const step = trackData.lapLen / 64;
  let bestS = bot.s;
  let bestD = Infinity;
  for (let k = 0; k < 64; k++) {
    const s = bot.s + k * step;
    const p = sampleTrack(trackData, s);
    let safe = true;
    for (const r of rivalTrails || []) {
      if (!r || !r.trail) continue;
      if (checkRivalTrails([r], p.x, p.z, now, { radius: TRAIL_KILL_RADIUS * 2 })) {
        safe = false;
        break;
      }
    }
    const d = Math.abs(k * step);
    if (safe && d < bestD) {
      bestD = d;
      bestS = s;
    }
  }
  bot.s = bestS;
  bot.offset = 0;
  bot.speed = 0;
  bot.shoveX = 0;
  bot.shoveZ = 0;
  bot.trailImmuneT = BOT_TRAIL_IMMUNITY_S;
  if (bot.trail) bot.trail.clear();
  return bot;
}

// advanceBot(bot, dt, trackData, playerProgress, bump, rivalTrails, now) —
// pure parametric step. Mutates and returns the bot. bump is null in race
// mode, or { playerS, playerOffset, flame } in bump mode: the bot steers to
// shove the player flame-ward when alongside (aggression), takes decaying
// shove impulses from player bumps, and loses lives in the flame like the
// player.
// LETHAL TRAILS: pass rivalTrails [{ trail, name }] (player + other bots)
// and now (seconds). The bot avoids trails (moderate skill) and dies when
// it touches one — respawning at a safe arclength after a dissolve pause.
export function advanceBot(bot, dt, trackData, playerProgress, bump = null, rivalTrails = null, now = 0) {
  if (bot.finished || bot.eliminated) return bot;
  const { maxSpeed, raceLaps, lapLen, halfW } = trackData;
  const skill = bot.skill;

  if (bot.invulnT > 0) bot.invulnT = Math.max(0, bot.invulnT - dt);
  if (bot.trailImmuneT > 0) bot.trailImmuneT = Math.max(0, bot.trailImmuneT - dt);

  // Trail-death dissolve: the bot is paused, then respawns safe.
  // FLY-OFF: the same pause carries the flight — the fly timer advances
  // here, and the respawn lands at the pre-hit pose (respawnBot).
  if (bot.deadT > 0) {
    bot.deadT = Math.max(0, bot.deadT - dt);
    if (bot.fly) bot.fly.t += dt;
    bot.speed = 0;
    if (bot.deadT <= 0) {
      respawnBot(bot, trackData, rivalTrails, now);
    }
    return bot;
  }

  // LETHAL TRAILS collision (not while immune; never in roam — the caller
  // only passes rivalTrails when trails are lethal).
  if (rivalTrails && rivalTrails.length > 0 && (bot.trailImmuneT || 0) <= 0) {
    const pose = botPose(bot, trackData);
    const hit = checkRivalTrails(rivalTrails, pose.x, pose.z, now, { radius: TRAIL_KILL_RADIUS });
    if (hit) {
      bot.deadT = BOT_DEATH_PAUSE_S;
      bot.deaths = (bot.deaths || 0) + 1;
      bot.speed = 0;
      return bot;
    }
  }

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

  // Lateral steering: wobble baseline, structurally clamped so bots respect
  // boundaries by construction. In bump mode an aggressive bot blends toward
  // a shove line just inside the player's line when alongside — but the
  // blend target is ALSO clamped, so the steering never suicides into the
  // flame; only a player's shove impulse (unclamped, decaying) can.
  const maxOff = halfW * 0.7;
  const wobbleTarget = clamp(
    skill.wobbleAmp * Math.sin(bot.s * WOBBLE_K + skill.wobblePhase),
    -maxOff,
    maxOff
  );
  let steerTarget = wobbleTarget;
  if (bump && bump.flame && (bot.aggression || 0) > 0 && Number.isFinite(bump.playerS)) {
    // Wrapped arclength delta (bot - player) along the loop.
    let sDelta = (bot.s - bump.playerS) % lapLen;
    if (sDelta > lapLen / 2) sDelta -= lapLen;
    if (sDelta < -lapLen / 2) sDelta += lapLen;
    const shoveTarget = botBumpTargetOffset({
      botOffset: bot.offset,
      playerOffset: bump.playerOffset,
      sDelta,
      aggression: bot.aggression,
      inwardSign: trackData.inwardSign ?? -1,
      halfW,
    });
    if (shoveTarget != null) {
      // Blend: mostly the shove line, some wobble so it stays beatable.
      const blend = 0.35 + 0.65 * bot.aggression;
      steerTarget = clamp(
        wobbleTarget * (1 - blend) + shoveTarget * blend,
        -maxOff,
        maxOff
      );
    }
  }
  // LETHAL TRAILS avoidance: bias the line away from nearby rival trails.
  // Moderate skill — the bias is capped so a well-laid trap still catches
  // them (they die fair and square).
  if (rivalTrails && rivalTrails.length > 0) {
    const avoid = trailAvoidance(bot, trackData, rivalTrails, now);
    if (avoid !== 0) {
      steerTarget = clamp(steerTarget + avoid * 0.6, -maxOff, maxOff);
    }
  }
  // Ease toward the target (bots don't teleport sideways).
  const latRate = halfW * 1.2;
  bot.offset += clamp(steerTarget - bot.offset, -latRate * dt, latRate * dt);

  // Shove impulses from player bumps decay back to the steered line.
  const shoveDecay = Math.exp(-KNOCK_DECAY * dt);
  bot.shoveX = (bot.shoveX || 0) * shoveDecay;
  bot.shoveZ = (bot.shoveZ || 0) * shoveDecay;

  // Flame check on the RENDERED pose (steered offset + shove): a hard
  // player shove can dump a bot in the flame — life lost, shove cleared,
  // brief grace. Steering alone can never get here (clamped above).
  if (bump && bump.flame && bot.invulnT <= 0) {
    const pose = botPose(bot, trackData);
    const rx = pose.x + (bot.shoveX || 0);
    const rz = pose.z + (bot.shoveZ || 0);
    if (inFlameZone({ x: rx, z: rz }, bump.flame)) {
      bot.lives = applyLifeLoss(bot.lives);
      bot.shoveX = 0;
      bot.shoveZ = 0;
      bot.invulnT = 2.0;
      if (isEliminated(bot.lives)) bot.eliminated = true;
    }
  }
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
