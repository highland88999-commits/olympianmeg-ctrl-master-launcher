// Quidditch (Seeker Duel) engine tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, stepGame, resetGame, makeRng, dist3, forwardOf,
  COUNTDOWN_MS, SEEKER_SPEED, DIVE_MULT, DIVE_CD, SNITCH_CATCH_R,
  SNITCH_POINTS, QUAFFLE_POINTS, STUN_TIME, PITCH_HALF_W, PITCH_HALF_L,
} from '../app/quidditch/engine.js';

function pastCountdown(g) {
  stepGame(g, COUNTDOWN_MS / 1000 + 0.1, {});
  assert.equal(g.phase, 'playing');
}

test('createGame starts in countdown', () => {
  const g = createGame(123);
  assert.equal(g.phase, 'countdown');
  assert.equal(g.score.you, 0);
  assert.equal(g.score.rival, 0);
  assert.equal(g.bludgers.length, 2);
});

test('countdown ticks down into playing', () => {
  const g = createGame(123);
  stepGame(g, 1, {});
  assert.equal(g.phase, 'countdown');
  pastCountdown(g);
});

test('seeded RNG is deterministic', () => {
  const a = createGame(42);
  const b = createGame(42);
  assert.deepEqual(a.snitch.pos, b.snitch.pos);
  assert.deepEqual(a.player.pos, b.player.pos);
});

test('player steers with yaw input', () => {
  const g = createGame(7);
  pastCountdown(g);
  const yaw0 = g.player.yaw;
  stepGame(g, 0.5, { yaw: 1 });
  // Right input (yaw +1: drag right, ArrowRight, D) turns RIGHT:
  // the chase camera looks along (sin yaw, cos yaw), so a yaw
  // increase would swing the nose screen-left — the engine
  // therefore decreases yaw (Merlin, Nov 16, 2026 — joystick
  // inversion fix; see tests/joystick-sign.test.mjs).
  assert.ok(g.player.yaw < yaw0, 'yaw decreased with right input (turn right)');
});

test('player pitches with pitch input', () => {
  const g = createGame(7);
  pastCountdown(g);
  stepGame(g, 0.5, { pitch: 1 });
  assert.ok(g.player.pitch > 0, 'pitched up');
});

test('DIVE bursts speed then cools down', () => {
  const g = createGame(7);
  pastCountdown(g);
  // Settle to base speed first.
  for (let i = 0; i < 300; i++) stepGame(g, 1 / 60, {});
  const base = g.player.speed;
  assert.ok(Math.abs(base - SEEKER_SPEED) < 1.5, `base speed ~${SEEKER_SPEED}, got ${base}`);
  stepGame(g, 0.2, { dive: true });
  assert.ok(g.player.speed > base + 2, `dive faster: ${g.player.speed} > ${base}`);
  assert.ok(g.player.diveCd > 0, 'cooldown engaged');
  // Second dive during cooldown does nothing new.
  const cd = g.player.diveCd;
  stepGame(g, 0.2, { dive: true });
  assert.ok(g.player.diveT <= 0 || g.player.diveCd <= cd, 'no fresh burst on cooldown');
});

test('snitch catch wins the match (+150)', () => {
  const g = createGame(7);
  pastCountdown(g);
  g.snitch.pos = { ...g.player.pos };
  g.snitch.vel = { x: 0, y: 0, z: 0 };
  stepGame(g, 1 / 60, {});
  assert.equal(g.phase, 'won');
  assert.equal(g.winner, 'you');
  assert.equal(g.score.you, SNITCH_POINTS);
});

test('rival snitch catch loses the match', () => {
  const g = createGame(7);
  pastCountdown(g);
  // Park the player far away so only the rival can catch.
  g.player.pos = { x: 0, y: 40, z: 70 };
  g.snitch.pos = { ...g.rival.pos };
  g.snitch.vel = { x: 0, y: 0, z: 0 };
  stepGame(g, 1 / 60, {});
  assert.equal(g.phase, 'lost');
  assert.equal(g.winner, 'rival');
  assert.equal(g.score.rival, SNITCH_POINTS);
});

test('rival chases the snitch (closes distance)', () => {
  const g = createGame(99);
  pastCountdown(g);
  const d0 = dist3(g.rival.pos, g.snitch.pos);
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, {});
  if (g.phase === 'playing') {
    const d1 = dist3(g.rival.pos, g.snitch.pos);
    assert.ok(d1 < d0, `rival closed in: ${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
  }
});

test('rival uses the same flight model (no rubber-banding)', () => {
  const g = createGame(5);
  pastCountdown(g);
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, {});
  assert.ok(g.rival.speed <= SEEKER_SPEED + 0.01, `rival never exceeds base speed: ${g.rival.speed}`);
});

test('snitch moves erratically over time', () => {
  const g = createGame(11);
  pastCountdown(g);
  const p0 = { ...g.snitch.pos };
  for (let i = 0; i < 120; i++) stepGame(g, 1 / 60, {});
  const moved = dist3(p0, g.snitch.pos);
  assert.ok(moved > 5, `snitch roams: moved ${moved.toFixed(1)}m in 2s`);
});

test('snitch stays inside the arena', () => {
  const g = createGame(13);
  pastCountdown(g);
  for (let i = 0; i < 600; i++) stepGame(g, 1 / 60, {});
  const s = g.snitch.pos;
  assert.ok(Math.abs(s.x) <= PITCH_HALF_W + 12 + 0.01);
  assert.ok(Math.abs(s.z) <= PITCH_HALF_L + 12 + 0.01);
  assert.ok(s.y >= 2 - 0.01 && s.y <= 42 + 0.01);
});

test('snitch jinks away from a close seeker', () => {
  const g = createGame(21);
  pastCountdown(g);
  // Put the player right on the snitch's tail and freeze the snitch's retarget.
  g.player.pos = { x: g.snitch.pos.x + 3, y: g.snitch.pos.y, z: g.snitch.pos.z };
  g.snitch.retargetT = 0;
  const before = { ...g.snitch.target };
  stepGame(g, 1 / 60, {});
  const after = g.snitch.target;
  const changed = dist3(before, after) > 0.01;
  assert.ok(changed, 'snitch picked a new evasive target');
});

test('bludger cycles roam -> telegraph -> homing', () => {
  const g = createGame(31);
  pastCountdown(g);
  const b = g.bludgers[0];
  b.t = 0.01; // force the transition on next step
  stepGame(g, 1 / 60, {});
  assert.equal(b.state, 'telegraph');
  b.t = 0.01;
  stepGame(g, 1 / 60, {});
  assert.equal(b.state, 'homing');
});

test('bludger hit stuns the player and locks controls', () => {
  const g = createGame(33);
  pastCountdown(g);
  const b = g.bludgers[0];
  b.state = 'homing';
  b.t = 3;
  b.pos = { ...g.player.pos };
  b.vel = { x: 0, y: 0, z: 0 };
  const yaw0 = g.player.yaw;
  stepGame(g, 1 / 60, {});
  assert.ok(g.player.stunT > 0, 'player stunned');
  assert.ok(Math.abs(g.player.stunT - STUN_TIME) < 0.1);
  // Controls locked while stunned.
  stepGame(g, 0.3, { yaw: 1, pitch: 1, dive: true });
  assert.ok(Math.abs(g.player.yaw - yaw0) < 0.01, 'steering ignored while stunned');
  assert.equal(b.state, 'cooldown');
});

test('stun wears off and control returns', () => {
  const g = createGame(33);
  pastCountdown(g);
  g.player.stunT = 0.05;
  const yaw0 = g.player.yaw;
  stepGame(g, 0.1, { yaw: 1 });
  stepGame(g, 0.1, { yaw: 1 });
  assert.ok(g.player.stunT <= 0, 'stun expired');
  assert.ok(g.player.yaw < yaw0, 'steering works again (right input turns right)');
});

test('ambient quaffle goals score +10 for a side', () => {
  const g = createGame(41);
  pastCountdown(g);
  g.quaffleT = 0.01;
  const y0 = g.score.you, r0 = g.score.rival;
  stepGame(g, 1 / 60, {});
  assert.equal(g.score.you + g.score.rival, y0 + r0 + QUAFFLE_POINTS);
});

test('match ends only via the snitch (quaffle never ends it)', () => {
  const g = createGame(43);
  pastCountdown(g);
  for (let i = 0; i < 10; i++) {
    g.quaffleT = 0.01;
    stepGame(g, 1 / 60, {});
  }
  assert.equal(g.phase, 'playing', 'still playing after many quaffle goals');
});

test('forwardOf points the right way', () => {
  const f = forwardOf(0, 0);
  assert.ok(Math.abs(f.z - 1) < 1e-9 && Math.abs(f.x) < 1e-9 && Math.abs(f.y) < 1e-9);
  const up = forwardOf(0, Math.PI / 2);
  assert.ok(Math.abs(up.y - 1) < 1e-9);
});

test('dist3 measures correctly', () => {
  assert.equal(dist3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
});

test('resetGame restarts the match', () => {
  const g = createGame(51);
  pastCountdown(g);
  g.phase = 'won';
  resetGame(g);
  assert.equal(g.phase, 'countdown');
  assert.equal(g.winner, null);
  assert.equal(g.score.you, 0);
});

test('catch radius respected (no catch at 3m)', () => {
  const g = createGame(7);
  pastCountdown(g);
  g.snitch.pos = { x: g.player.pos.x + 3, y: g.player.pos.y, z: g.player.pos.z };
  g.snitch.vel = { x: 0, y: 0, z: 0 };
  g.snitch.retargetT = 99; // don't let it wander into the player
  g.snitch.target = { ...g.snitch.pos };
  // Rival far away too.
  g.rival.pos = { x: 0, y: 40, z: -70 };
  stepGame(g, 1 / 60, {});
  assert.equal(g.phase, 'playing');
  assert.ok(SNITCH_CATCH_R < 3, 'sanity: catch radius is under 3m');
});
