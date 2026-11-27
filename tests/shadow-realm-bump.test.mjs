// tests/shadow-realm-bump.test.mjs
// Headless tests for the BUMP RACE battle math (lib/shadow-realm/bump.js):
// bumper impulse physics, flame-zone detection, lives/respawn/elimination,
// AI shove steering (never suicides), outer-wall-only barriers, standings,
// and the beacon lives field round-trip (lib/shadow-realm/net.js).
// Run: node tests/shadow-realm-bump.test.mjs (from the repo root).
import {
  BUMP_LIVES,
  BUMP_RADIUS,
  BUMP_RESTITUTION,
  BUMP_IMMUNITY_S,
  RESPAWN_INVULN_S,
  BUMP_BOOST_REWARD,
  KNOCK_DECAY,
  PLAYER_MASS,
  BOT_MASS,
  BOT_AGGRESSION,
  SHOVE_DEPTH,
  BUMP_ENGAGE_S,
  FLY_SECS,
  FLY_UP_SPEED,
  FLY_GRAVITY,
  FLY_SPIN_TURNS,
  resolveBump,
  inFlameZone,
  lateralOffset,
  inwardOffsetSign,
  botBumpTargetOffset,
  resolveOuterOnly,
  respawnPose,
  applyLifeLoss,
  isEliminated,
  sortBumpStandings,
  bumpVictim,
  startFly,
  flyPose,
} from '../lib/shadow-realm/bump.js';
import { beaconRow } from '../lib/shadow-realm/net.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// --- constants ---
t('3 lives per rider', BUMP_LIVES === 3);
t('bump radius 1.7', BUMP_RADIUS === 1.7);
t('restitution 0.85 (bumper-car bouncy)', BUMP_RESTITUTION === 0.85);
t('bump immunity 0.5s (no stunlock)', BUMP_IMMUNITY_S === 0.5);
t('respawn invuln 2.0s', RESPAWN_INVULN_S === 2.0);
t('bump boost reward 0.25', BUMP_BOOST_REWARD === 0.25);
t('knock decays (positive rate)', KNOCK_DECAY > 0);
t('bots heavier than the player', BOT_MASS > PLAYER_MASS);
t('bot aggression tuned (0..1)', BOT_AGGRESSION > 0 && BOT_AGGRESSION < 1);
t('shove depth 4', SHOVE_DEPTH === 4.0);
t('engage window 42', BUMP_ENGAGE_S === 42);
t('fly-off airtime 0.9s (2*up/g)', approx(FLY_SECS, (2 * FLY_UP_SPEED) / FLY_GRAVITY) && FLY_SECS === 0.9);
t('fly-off pop 9 m/s against 20 m/s^2', FLY_UP_SPEED === 9 && FLY_GRAVITY === 20);
t('fly-off tumbles 1.5 rolls', FLY_SPIN_TURNS === 1.5);

// --- bumpVictim: who got rammed ---
{
  // a drives into a stationary b -> b is the victim.
  t('rammer vs parked: the parked bike is the victim',
    bumpVictim({ x: 0, z: 0, vx: 20, vz: 0 }, { x: 3, z: 0, vx: 0, vz: 0 }) === 'b');
  // b drives into a stationary a -> a is the victim.
  t('parked vs rammer: the parked bike is the victim',
    bumpVictim({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 3, z: 0, vx: -20, vz: 0 }) === 'a');
  // Faster approach wins the bumper role: a closes at 20, b closes at 5.
  t('faster approach is the bumper',
    bumpVictim({ x: 0, z: 0, vx: 20, vz: 0 }, { x: 3, z: 0, vx: -5, vz: 0 }) === 'b');
  t('slower approach is the victim',
    bumpVictim({ x: 0, z: 0, vx: 5, vz: 0 }, { x: 3, z: 0, vx: -20, vz: 0 }) === 'a');
  // Head-on, equal speeds -> both fly.
  t('head-on equal speeds: both fly',
    bumpVictim({ x: 0, z: 0, vx: 20, vz: 0 }, { x: 3, z: 0, vx: -20, vz: 0 }) === 'both');
  // Sideswipe: the lateral approach still names the victim.
  t('sideswipe names the rammed bike',
    bumpVictim({ x: 0, z: 0, vx: 5, vz: 20 }, { x: 2.5, z: 0, vx: 0, vz: 20 }) === 'b');
  // Symmetric: swapping a/b swaps the answer.
  t('victim rule is symmetric',
    bumpVictim({ x: 3, z: 0, vx: 0, vz: 0 }, { x: 0, z: 0, vx: 20, vz: 0 }) === 'a');
}

// --- fly-off: startFly + flyPose ---
{
  const fly = startFly({ x: 10, z: 20, heading: 1.2, vx: 12, vz: -4 });
  t('startFly captures the pre-hit pose', fly.x0 === 10 && fly.z0 === 20 && fly.heading0 === 1.2);
  t('startFly carries the launch drift', fly.vx === 12 && fly.vz === -4);
  t('startFly starts at t=0 with FLY_SECS duration', fly.t === 0 && fly.dur === FLY_SECS);

  const p0 = flyPose(fly, 0);
  t('launch: on the ground, no roll yet', p0.y === 0 && p0.roll === 0);
  t('launch: at the pre-hit spot', p0.x === 10 && p0.z === 20);
  t('launch: heading is the pre-hit heading', p0.heading === 1.2);
  t('launch: not done', p0.done === false);

  const mid = flyPose(fly, FLY_SECS / 2);
  t('mid-flight: airborne (~2m apex)', mid.y > 1.5 && mid.y < 2.5);
  t('mid-flight: half a tumble in', approx(mid.roll, FLY_SPIN_TURNS * Math.PI * 2 * 0.5));
  t('mid-flight: drifting on the launch velocity',
    approx(mid.x, 10 + 12 * (FLY_SECS / 2)) && approx(mid.z, 20 - 4 * (FLY_SECS / 2)));
  t('mid-flight: not done', mid.done === false);

  const end = flyPose(fly, FLY_SECS);
  t('landing: back on the ground', end.y === 0);
  t('landing: full tumble complete', approx(end.roll, FLY_SPIN_TURNS * Math.PI * 2));
  t('landing: done', end.done === true);

  // The bike never sinks below the ground, even past the landing.
  let neverBelow = true;
  for (let tt = 0; tt <= FLY_SECS * 2; tt += 0.05) {
    if (flyPose(fly, tt).y < 0) neverBelow = false;
  }
  t('flight arc never goes below ground', neverBelow);
  // A stationary victim still pops straight up and lands on the spot.
  const still = flyPose(startFly({ x: 0, z: 0, heading: 0, vx: 0, vz: 0 }), FLY_SECS / 2);
  t('parked victim pops in place', still.x === 0 && still.z === 0 && still.y > 0);
}

// --- resolveBump: head-on (equal masses) ---
{
  const a = { x: 0, z: 0, vx: 20, vz: 0, mass: PLAYER_MASS };
  const b = { x: 3, z: 0, vx: 0, vz: 0, mass: PLAYER_MASS };
  const r = resolveBump(a, b);
  t('head-on: hit detected', r.hit === true);
  const j = ((1 + BUMP_RESTITUTION) * 20) / 2;
  t('head-on: impact magnitude matches impulse', approx(r.impact, j));
  t('head-on: a keeps a little (restitution < 1)', approx(r.avx, 20 - j));
  t('head-on: b takes the impulse', approx(r.bvx, j));
  t('head-on: momentum conserved', approx(r.avx + r.bvx, 20));
  t('head-on: no lateral velocity created', r.avz === 0 && r.bvz === 0);
  t('head-on: inputs untouched', a.vx === 20 && b.vx === 0);
}

// --- resolveBump: sideswipe (tangential motion preserved) ---
{
  const a = { x: 0, z: 0, vx: 5, vz: 20, mass: PLAYER_MASS };
  const b = { x: 2.5, z: 0, vx: 0, vz: 0, mass: BOT_MASS };
  const r = resolveBump(a, b);
  t('sideswipe: hit detected', r.hit === true && r.impact > 0);
  t('sideswipe: tangential velocity untouched', approx(r.avz, 20) && approx(r.bvz, 0));
  t('sideswipe: normal component bites', r.avx < 5 && r.bvx > 0);
}

// --- resolveBump: separating bikes (overlap but moving apart) ---
{
  const a = { x: 0, z: 0, vx: -5, vz: 0, mass: 1 };
  const b = { x: 3, z: 0, vx: 5, vz: 0, mass: 1 };
  const r = resolveBump(a, b);
  t('separating: hit flagged', r.hit === true);
  t('separating: no impulse', r.impact === 0);
  t('separating: velocities unchanged', r.avx === -5 && r.bvx === 5);
  t('separating: still pushed apart', Math.hypot(r.bx - r.ax, r.bz - r.az) > 3);
}

// --- resolveBump: no overlap, no hit ---
{
  const r = resolveBump(
    { x: 0, z: 0, vx: 20, vz: 0, mass: 1 },
    { x: 10, z: 0, vx: 0, vz: 0, mass: 1 }
  );
  t('far apart: no hit', r.hit === false && r.impact === 0);
}

// --- resolveBump: positional correction splits by inverse mass ---
{
  const a = { x: 0, z: 0, vx: 0, vz: 0, mass: 1 };
  const b = { x: 2.4, z: 0, vx: 0, vz: 0, mass: 4 }; // overlap 1.0
  const r = resolveBump(a, b);
  const aMove = Math.hypot(r.ax - a.x, r.az - a.z);
  const bMove = Math.hypot(r.bx - b.x, r.bz - b.z);
  t('light bike moves more', approx(aMove, 0.8) && approx(bMove, 0.2));
  t('overlap fully resolved', approx(Math.hypot(r.bx - r.ax, r.bz - r.az), BUMP_RADIUS * 2));
}

// --- inFlameZone ---
{
  const flame = { x: 0, z: 0, radius: 62 };
  t('flame: inside detected', inFlameZone({ x: 10, z: 10 }, flame) === true);
  t('flame: outside clear', inFlameZone({ x: 100, z: 0 }, flame) === false);
  t('flame: rim edge exits cleanly', inFlameZone({ x: 62.5, z: 0 }, flame) === false);
  t('flame: just inside enters', inFlameZone({ x: 61.5, z: 0 }, flame) === true);
  t('flame: null-safe', inFlameZone(null, flame) === false && inFlameZone({ x: 0, z: 0 }, null) === false);
}

// --- lateralOffset sign on a ring around the flame ---
{
  // 8-point ring, radius 96, flame at the center.
  const center = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    center.push({ x: Math.cos(a) * 96, z: Math.sin(a) * 96 });
  }
  const flame = { x: 0, z: 0, radius: 62 };
  t('offset: outward is positive', lateralOffset({ x: 108, z: 0 }, center, flame) > 0);
  t('offset: flame-ward is negative', lateralOffset({ x: 84, z: 0 }, center, flame) < 0);
  t('offset: magnitude matches radial distance', approx(Math.abs(lateralOffset({ x: 108, z: 0 }, center, flame)), 12, 0.5));
}

// --- inwardOffsetSign (empirical, winding-robust) ---
{
  // tangent +z at (96,0): normal (+tz, -tx) = (+1, 0) = outward.
  const trackData = { pts: [{ x: 96, z: 0 }], tx: [0], tz: [1] };
  const flame = { x: 0, z: 0, radius: 62 };
  t('inward sign: -1 when +offset is outward', inwardOffsetSign(trackData, flame) === -1);
  t('inward sign: null-safe', inwardOffsetSign(null, flame) === -1);
}

// --- botBumpTargetOffset: shove the player flame-ward, never suicide ---
{
  const halfW = 12;
  const tgt = botBumpTargetOffset({
    botOffset: 5, playerOffset: 5, sDelta: 10,
    aggression: BOT_AGGRESSION, inwardSign: -1, halfW,
  });
  t('aggressive bot aims inside the player line', tgt !== null && tgt < 5);
  t('shove depth scales with aggression', approx(tgt, 5 - BOT_AGGRESSION * SHOVE_DEPTH));
  t('far rival: no engagement', botBumpTargetOffset({
    botOffset: 0, playerOffset: 0, sDelta: 100,
    aggression: BOT_AGGRESSION, inwardSign: -1, halfW,
  }) === null);
  t('aggression 0: no engagement', botBumpTargetOffset({
    botOffset: 0, playerOffset: 0, sDelta: 10,
    aggression: 0, inwardSign: -1, halfW,
  }) === null);
  // The player is already hugging the inner edge — the bot must NOT follow
  // them into the flame. The clamp keeps the target on the track.
  const deep = botBumpTargetOffset({
    botOffset: -8, playerOffset: -8.4, sDelta: 5,
    aggression: 1, inwardSign: -1, halfW,
  });
  t('steering clamped to the track edge', deep !== null && deep >= -halfW * 0.7);
  t('bot target never crosses the inner barrier', deep !== null && Math.abs(deep) <= halfW * 0.7);
}

// --- resolveOuterOnly: outer wall solid, inner edge open ---
{
  const center = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    center.push({ x: Math.cos(a) * 96, z: Math.sin(a) * 96 });
  }
  const flame = { x: 0, z: 0, radius: 62 };
  const halfW = 12;
  const out = resolveOuterOnly({ x: 112, z: 0 }, { x: 10, z: 0 }, center, halfW, flame);
  t('outer wall: bounces', out.bounced === true);
  t('outer wall: pushed back inside', Math.hypot(out.pos.x, out.pos.z) <= 96 + halfW + 0.5);
  t('outer wall: outward velocity killed', out.vel.x < 10);
  const inner = resolveOuterOnly({ x: 80, z: 0 }, { x: -10, z: 0 }, center, halfW, flame);
  t('inner edge: OPEN (no bounce)', inner.bounced === false);
  t('inner edge: velocity untouched', inner.vel.x === -10);
}

// --- respawnPose: nearest track point + forward heading ---
{
  const center = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    center.push({ x: Math.cos(a) * 96, z: Math.sin(a) * 96 });
  }
  const rp = respawnPose(center, { x: 10, z: 5 });
  t('respawn: lands near the track', Math.abs(Math.hypot(rp.x, rp.z) - 96) < 8);
  t('respawn: heading is finite', Number.isFinite(rp.heading));
}

// --- lives: loss -> respawn -> elimination ---
{
  let lives = BUMP_LIVES;
  t('race starts with 3 lives', lives === 3 && !isEliminated(lives));
  lives = applyLifeLoss(lives);
  t('flame hit: 3 -> 2', lives === 2 && !isEliminated(lives));
  lives = applyLifeLoss(lives);
  t('flame hit: 2 -> 1', lives === 1 && !isEliminated(lives));
  lives = applyLifeLoss(lives);
  t('flame hit: 1 -> 0', lives === 0 && isEliminated(lives));
  t('floors at 0', applyLifeLoss(0) === 0);
}

// --- sortBumpStandings ---
{
  const rows = sortBumpStandings([
    { name: 'dead', lives: 0, laps: 5, progress: 5, finishTime: 100 },
    { name: 'leader', lives: 2, laps: 3, progress: 3.5, finishTime: null },
    { name: 'chaser', lives: 3, laps: 3, progress: 3.2, finishTime: null },
    { name: 'slow', lives: 1, laps: 2, progress: 2.9, finishTime: null },
  ]);
  t('alive outranks eliminated (even with more laps)', rows[0].name === 'chaser' || rows[0].name === 'leader');
  t('eliminated rider sinks to the bottom', rows[3].name === 'dead');
  t('laps beat lives among the living', rows.findIndex((r) => r.name === 'leader') < rows.findIndex((r) => r.name === 'slow'));
  t('ranks assigned 1..n', rows.every((r, i) => r.rank === i + 1));
  const timed = sortBumpStandings([
    { name: 'a', lives: 1, laps: 3, progress: 3, finishTime: 200 },
    { name: 'b', lives: 1, laps: 3, progress: 3, finishTime: 180 },
  ]);
  t('faster finish wins ties', timed[0].name === 'b');
}

// --- beacon lives field round-trip ---
{
  t('beacon lives default 3', beaconRow({ roomCode: 'A', userId: 'u' }).lives === 3);
  t('beacon lives carried', beaconRow({ roomCode: 'A', userId: 'u', lives: 2 }).lives === 2);
  t('beacon lives 0 = eliminated', beaconRow({ roomCode: 'A', userId: 'u', lives: 0 }).lives === 0);
  t('beacon lives clamps high', beaconRow({ roomCode: 'A', userId: 'u', lives: 9 }).lives === 3);
  t('beacon lives clamps low', beaconRow({ roomCode: 'A', userId: 'u', lives: -4 }).lives === 0);
  t('beacon lives rounds', beaconRow({ roomCode: 'A', userId: 'u', lives: 2.6 }).lives === 3);
}

console.log(`\nshadow-realm-bump: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
