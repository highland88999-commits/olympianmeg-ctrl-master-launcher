// Hockey NHL-rules engine tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHockey, stepHockey, faceoff, activeSkaters,
  RINK_W, RINK_L, GOAL_W, BLUE_LINE_Z, GOAL_LINE_Z, CREASE_R,
  PERIOD_SECONDS, PENALTY_SECONDS, MISCONDUCT_SECONDS, OT_SECONDS,
  SHOT_TIMING, slapPower, pickPassTarget, passLeadPoint,
} from '../lib/sports/hockey.js';

const calm = () => 0.9; // deterministic rng: no AI steals/passes/shots, no misconduct

function mk() {
  const s = createHockey('Tester');
  s.status = 'play';
  return s;
}
function byId(s, id) {
  return s.players.find((p) => p.id === id);
}
function hasEvent(s, type) {
  return s.events.some((e) => e.type === type);
}

test('penalties are 2:00 (NHL 26a)', () => {
  assert.equal(PENALTY_SECONDS, 120);
  assert.equal(MISCONDUCT_SECONDS, 600);
});

test('icing: shot from behind center, crosses far goal line, defender touches first', () => {
  const s = mk();
  byId(s, 'red-g').x = 6; // goalie out of the way
  s.puck.x = 3; s.puck.z = -25.9; s.puck.vx = 0; s.puck.vz = -10; s.puck.holder = null;
  s.lastShot = { team: 'blue', z: 5 }; // blue shot from their own half
  stepHockey(s, 0.1, { mx: 0, mz: 0 }, calm);
  assert(s.icing && s.icing.team === 'blue', 'icing pending against blue');
  assert.equal(s.status, 'play', 'play continues until first touch');
  // Defender touches first → icing, faceoff in the offending zone
  byId(s, 'red-w1').x = 3; byId(s, 'red-w1').z = -28.5;
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert(hasEvent(s, 'icing'), 'icing whistled');
  assert.equal(s.status, 'faceoff');
  assert.equal(s.nextFaceoffZ, 14, 'faceoff in blue’s zone');
});

test('icing waved off when an attacker touches first', () => {
  const s = mk();
  byId(s, 'red-g').x = 6;
  s.puck.x = 3; s.puck.z = -25.9; s.puck.vx = 0; s.puck.vz = -10; s.puck.holder = null;
  s.lastShot = { team: 'blue', z: 5 };
  stepHockey(s, 0.1, { mx: 0, mz: 0 }, calm);
  assert(s.icing, 'icing pending');
  byId(s, 'blue-w1').x = 3; byId(s, 'blue-w1').z = -28.5;
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert(!s.icing, 'icing waved off');
  assert(hasEvent(s, 'icingWaved'));
  assert.equal(s.status, 'play', 'play continues');
});

test('no icing on the penalty kill, or when shot from the neutral zone', () => {
  const s = mk();
  byId(s, 'red-g').x = 6;
  byId(s, 'blue-w1').penalty = 120; // blue shorthanded
  s.puck.x = 3; s.puck.z = -25.9; s.puck.vx = 0; s.puck.vz = -10; s.puck.holder = null;
  s.lastShot = { team: 'blue', z: 5 };
  stepHockey(s, 0.1, { mx: 0, mz: 0 }, calm);
  assert(!s.icing, 'no icing while shorthanded');

  const s2 = mk();
  byId(s2, 'red-g').x = 6;
  s2.puck.x = 3; s2.puck.z = -25.9; s2.puck.vx = 0; s2.puck.vz = -10; s2.puck.holder = null;
  s2.lastShot = { team: 'blue', z: -5 }; // not from behind center
  stepHockey(s2, 0.1, { mx: 0, mz: 0 }, calm);
  assert(!s2.icing, 'no icing when not shot from behind center');
});

test('delayed offside: no immediate whistle; tag-up clears it', () => {
  const s = mk();
  byId(s, 'blue-w1').x = 0; byId(s, 'blue-w1').z = -15; // over the line early
  byId(s, 'red-c').x = 0; byId(s, 'red-c').z = 0;
  s.puck.x = 0; s.puck.z = -9.5; s.puck.vx = 0; s.puck.vz = -10; s.puck.holder = null;
  s.lastShot = { team: 'blue', z: -5 };
  stepHockey(s, 0.1, { mx: 0, mz: 0 }, calm);
  assert(s.delayedOffside && s.delayedOffside.team === 'blue', 'delayed offside flagged');
  assert(hasEvent(s, 'delayedOffside'));
  assert.equal(s.status, 'play', 'no immediate whistle');
  // Tag up: everyone back onside → play on, no whistle
  byId(s, 'blue-w1').z = -5;
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert(!s.delayedOffside, 'tag-up clears delayed offside');
  assert.equal(s.status, 'play');
});

test('delayed offside: offender playing the puck draws the whistle, neutral-zone dot', () => {
  const s = mk();
  const you = byId(s, 'you');
  you.x = 0; you.z = -15; // human is the offender
  byId(s, 'red-c').x = 0; byId(s, 'red-c').z = 0;
  s.puck.x = 0; s.puck.z = -9.5; s.puck.vx = 0; s.puck.vz = -10; s.puck.holder = null;
  s.lastShot = { team: 'blue', z: -5 };
  stepHockey(s, 0.1, { mx: 0, mz: 0 }, calm);
  assert(s.delayedOffside, 'delayed offside flagged');
  // Offender touches the puck before tagging up → whistle
  s.puck.x = 0; s.puck.z = -15; s.puck.vx = 0; s.puck.vz = 0;
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert(hasEvent(s, 'offside'), 'offside whistled');
  assert.equal(s.status, 'faceoff');
  assert.equal(s.nextFaceoffZ, -BLUE_LINE_Z, 'neutral-zone dot');
});

test('interference: checking a non-carrier is a delayed minor (NHL 56)', () => {
  const s = mk();
  byId(s, 'you').x = 0; byId(s, 'you').z = 0;
  byId(s, 'red-w1').x = 0; byId(s, 'red-w1').z = 1.0;
  s.puck.x = 10; s.puck.z = 10; s.puck.vx = 0; s.puck.vz = 0; s.puck.holder = null;
  stepHockey(s, 0.05, { mx: 0, mz: 0, check: true }, calm);
  assert(s.delayedPenalty && s.delayedPenalty.reason === 'interference', 'delayed interference minor');
  assert.equal(s.status, 'play', 'play continues on a delayed penalty');
  // Offending team touches the puck → whistle, 2:00, draw in their zone
  byId(s, 'blue-w1').x = s.puck.x; byId(s, 'blue-w1').z = s.puck.z;
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(byId(s, 'you').penalty, 120, 'minor is 2:00');
  assert(hasEvent(s, 'penalty'));
  const pen = s.events.find((e) => e.type === 'penalty');
  assert.equal(pen.seconds, 120);
  assert.equal(s.status, 'faceoff');
  assert.equal(s.nextFaceoffZ, 14, 'penalized team’s zone');
});

test('delayed minor wiped out when the non-offending team scores (NHL 15.1)', () => {
  const s = mk();
  byId(s, 'you').x = 0; byId(s, 'you').z = 0;
  byId(s, 'red-w1').x = 0; byId(s, 'red-w1').z = 1.0;
  s.puck.x = 10; s.puck.z = 10; s.puck.vx = 0; s.puck.vz = 0; s.puck.holder = null;
  stepHockey(s, 0.05, { mx: 0, mz: 0, check: true }, calm);
  assert(s.delayedPenalty, 'delayed penalty pending');
  // Red scores → the minor is wiped, nobody sits
  byId(s, 'blue-g').x = 6;
  s.puck.x = 1.5; s.puck.z = 25.9; s.puck.vx = 0; s.puck.vz = 10; s.puck.holder = null;
  s.lastShot = { team: 'red', z: 20 }; // simulated shot (goals require a shot)
  stepHockey(s, 0.1, { mx: 0, mz: 0 }, calm);
  assert.equal(s.score.red, 1);
  assert(!s.delayedPenalty, 'delayed minor wiped');
  assert.equal(byId(s, 'you').penalty, 0, 'nobody serves it');
  assert(hasEvent(s, 'penaltyWiped'));
});

test('shorthanded goal ends the minor (NHL 26c); coincidental minors survive', () => {
  const s = mk();
  byId(s, 'blue-w1').penalty = 120;
  byId(s, 'blue-w1').penaltyType = 'minor';
  byId(s, 'blue-g').x = 6;
  // Red scores on shorthanded blue → blue's minor ends
  s.puck.x = 1.5; s.puck.z = 25.9; s.puck.vx = 0; s.puck.vz = 10; s.puck.holder = null;
  s.lastShot = { team: 'red', z: 20 }; // simulated shot (goals require a shot)
  stepHockey(s, 0.1, { mx: 0, mz: 0 }, calm);
  assert.equal(s.score.red, 1);
  assert.equal(byId(s, 'blue-w1').penalty, 0, 'minor terminated by shorthanded goal');
  assert(hasEvent(s, 'penaltyEnded'));

  const s2 = mk();
  byId(s2, 'blue-w1').penalty = 120;
  byId(s2, 'blue-w1').penaltyType = 'minor';
  byId(s2, 'red-c').penalty = 120; // coincidental — even strength
  byId(s2, 'red-c').penaltyType = 'minor';
  byId(s2, 'blue-g').x = 6;
  s2.puck.x = 1.5; s2.puck.z = 25.9; s2.puck.vx = 0; s2.puck.vz = 10; s2.puck.holder = null;
  s2.lastShot = { team: 'red', z: 20 }; // simulated shot (goals require a shot)
  stepHockey(s2, 0.1, { mx: 0, mz: 0 }, calm);
  assert.equal(s2.score.red, 1);
  assert(byId(s2, 'blue-w1').penalty > 0, 'coincidental minor survives');
});

test('checking from behind is an automatic minor; severe → misconduct (NHL 43)', () => {
  const s = mk();
  const rc = byId(s, 'red-c'); rc.x = 0; rc.z = -5;
  const you = byId(s, 'you'); you.x = 0; you.z = -5.8; // behind the carrier
  byId(s, 'blue-w1').x = 0; byId(s, 'blue-w1').z = 5; // a defender back — not a breakaway
  byId(s, 'blue-w2').x = 7; byId(s, 'blue-w2').z = -18;
  s.puck.holder = 'red-c'; s.puck.x = 0; s.puck.z = -5;
  stepHockey(s, 0.05, { mx: 0, mz: 0, check: true }, calm);
  assert(s.delayedPenalty && s.delayedPenalty.reason === 'boarding', 'automatic boarding minor');
  assert.equal(s.delayedPenalty.type, 'minor');

  const s2 = mk();
  const rc2 = byId(s2, 'red-c'); rc2.x = 0; rc2.z = -5;
  const you2 = byId(s2, 'you'); you2.x = 0; you2.z = -5.8;
  byId(s2, 'blue-w1').x = 0; byId(s2, 'blue-w1').z = 5;
  s2.puck.holder = 'red-c'; s2.puck.x = 0; s2.puck.z = -5;
  stepHockey(s2, 0.05, { mx: 0, mz: 0, check: true }, () => 0.05); // severe roll
  assert(s2.delayedPenalty && s2.delayedPenalty.type === 'misconduct', 'severe → misconduct');
});

test('from-behind foul on a breakaway is a penalty shot, not a minor (NHL 24)', () => {
  const s = mk();
  const rc = byId(s, 'red-c'); rc.x = 0; rc.z = 5; // past center, in on goal
  const you = byId(s, 'you'); you.x = 0; you.z = 4.2; // behind him
  byId(s, 'blue-w1').x = -7; byId(s, 'blue-w1').z = -15; // nobody back
  byId(s, 'blue-w2').x = 7; byId(s, 'blue-w2').z = -18;
  byId(s, 'red-w1').z = -12; byId(s, 'red-w2').z = -12;
  s.puck.holder = 'red-c'; s.puck.x = 0; s.puck.z = 5;
  stepHockey(s, 0.05, { mx: 0, mz: 0, check: true }, calm);
  assert.equal(s.status, 'penaltyshot', 'penalty shot awarded');
  assert(s.penaltyShot && s.penaltyShot.shooterId === 'red-c');
  assert(!s.delayedPenalty, 'no minor on top of the shot');
  assert(hasEvent(s, 'penaltyShot'));
  // Setup places the shooter and the goalie
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(s.penaltyShot.phase, 'attempt');
  assert.equal(s.puck.holder, 'red-c');
  // Run the attempt to completion (AI shooter near the net, always shoots)
  byId(s, 'red-c').z = 20;
  for (let i = 0; i < 80 && s.status === 'penaltyshot'; i++) {
    stepHockey(s, 0.05, { mx: 0, mz: 0 }, () => 0.01);
  }
  assert(!s.penaltyShot, 'shot resolved');
  assert.equal(s.status, 'faceoff', 'miss/save → faceoff where the foul happened');
});

test('crease: no voluntary entry; no goal with an attacker in the crease (NHL 69)', () => {
  const s = mk();
  const you = byId(s, 'you');
  you.x = 0; you.z = -24;
  s.puck.x = 0; s.puck.z = 0; s.puck.holder = null; s.puck.vx = 0; s.puck.vz = 0;
  stepHockey(s, 0.1, { mx: 0, mz: -1 }, calm); // skate at the net
  assert.equal(you.z, -24, 'voluntary crease entry blocked');

  const s2 = mk();
  const you2 = byId(s2, 'you');
  you2.x = 0; you2.z = -24;
  s2.puck.holder = 'you'; s2.puck.x = 0; s2.puck.z = -24; // carrying it in is legal
  stepHockey(s2, 0.1, { mx: 0, mz: -1 }, calm);
  assert(you2.z < -24, 'puck carrier may skate it in');

  const s3 = mk();
  byId(s3, 'blue-w1').x = 0; byId(s3, 'blue-w1').z = -25.5; // camped in the crease
  byId(s3, 'red-g').x = 6;
  s3.puck.x = 1.5; s3.puck.z = -25.9; s3.puck.vx = 0; s3.puck.vz = -10; s3.puck.holder = null;
  stepHockey(s3, 0.1, { mx: 0, mz: 0 }, calm);
  assert.equal(s3.score.blue, 0, 'goal disallowed');
  assert(hasEvent(s3, 'creaseViolation'));
  assert.equal(s3.status, 'faceoff');
  assert.equal(s3.nextFaceoffZ, -BLUE_LINE_Z, 'nearest neutral-zone dot');
});

test('faceoff goes to the requested dot (NHL 76.2)', () => {
  const s = mk();
  faceoff(s, 14);
  assert.equal(s.puck.z, 14);
  assert.equal(s.puck.x, 8 * s.faceoffSide);
  assert.equal(s.status, 'play');
  const c = byId(s, 'you');
  assert(Math.abs(c.z - (14 + 1.5)) < 0.01, 'centers line up on the dot');
  faceoff(s, -10);
  assert.equal(s.puck.z, -10);
});

test('shootout: no shooter repeats until all eligible have shot (NHL 84.4)', () => {
  const s = mk();
  s.period = 'shootout';
  s.status = 'shootout';
  const so = { round: 0, blueMade: 0, redMade: 0, turn: 'blue', attempts: [], shotBy: [], phase: 'setup' };
  s.shootout = so;
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(so.shooterId, 'you', 'human shoots first for blue');
  so.turn = 'blue'; so.phase = 'setup';
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(so.shooterId, 'blue-w1', 'no repeat while skaters remain');
  // Penalized skaters are ineligible
  byId(s, 'blue-w2').penalty = 120;
  so.turn = 'blue'; so.phase = 'setup'; so.shotBy = ['you'];
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(so.shooterId, 'blue-w1', 'penalized skater skipped');
  // Full rotation → order resets
  so.turn = 'blue'; so.phase = 'setup'; so.shotBy = ['you', 'blue-w1'];
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(so.shooterId, 'you', 'rotation resets after everyone shot');
  // Red (no human) rotates through its centers/wingers
  so.turn = 'red'; so.phase = 'setup'; so.shotBy = [];
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(so.shooterId, 'red-c');
  so.turn = 'red'; so.phase = 'setup';
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(so.shooterId, 'red-w1', 'red does not repeat either');
});

test('skating the puck through the net is NO GOAL — whistle, faceoff (Merlin 2026-11-02)', () => {
  const s = mk();
  const you = byId(s, 'you');
  // Carrier skates into the net with the puck held
  you.x = 0; you.z = -27;
  s.puck.holder = 'you';
  s.puck.x = 0; s.puck.z = -27;
  stepHockey(s, 0.05, { mx: 0, mz: 0 }, calm);
  assert.equal(s.score.blue, 0, 'no goal for skating it in');
  assert(hasEvent(s, 'creaseViolation'), 'crease violation whistled');
  assert.equal(s.status, 'faceoff', 'play stopped for a faceoff');
});

test('a shot from inside the net does not count (Merlin 2026-11-02)', () => {
  const s = mk();
  byId(s, 'red-g').x = 6; // goalie out of the way
  // Puck loose past the goal line with velocity but no valid shot
  s.puck.x = 1; s.puck.z = -26.5; s.puck.vx = 0; s.puck.vz = -8; s.puck.holder = null;
  s.lastShot = null; // carried across, never shot
  stepHockey(s, 0.1, { mx: 0, mz: 0 }, calm);
  assert.equal(s.score.blue, 0, 'no goal without a shot');
  assert(hasEvent(s, 'creaseViolation'), 'whistled');
  assert.equal(s.status, 'faceoff');
});

test('a real shot from outside the line still scores (Merlin 2026-11-02)', () => {
  const s = mk();
  byId(s, 'red-g').x = 6;
  const you = byId(s, 'you');
  you.x = 1; you.z = -20;
  s.puck.holder = 'you';
  s.puck.x = 1; s.puck.z = -20;
  // Shoot via the engine (sets lastShot); centered rng so it aims at the net mouth
  stepHockey(s, 0.05, { mx: 0, mz: 0, shoot: true, shotType: 'wrist', shotPower: 24 }, () => 0.5);
  assert(!s.puck.holder, 'puck left the stick');
  assert(s.lastShot && s.lastShot.team === 'blue', 'shot recorded');
  // Let it fly into the net
  for (let i = 0; i < 30 && s.status === 'play'; i++) {
    stepHockey(s, 0.05, { mx: 0, mz: 0 }, () => 0.5);
  }
  assert.equal(s.score.blue, 1, 'the shot scores');
});

test('the shooter cannot re-catch their own shot (Merlin 2026-11-02)', () => {
  const s = mk();
  const you = byId(s, 'you');
  you.x = 0; you.z = 0;
  s.puck.holder = 'you';
  s.puck.x = 0; s.puck.z = 0;
  stepHockey(s, 0.05, { mx: 0, mz: 0, shoot: true, shotType: 'wrist', shotPower: 24 }, calm);
  assert(!s.puck.holder, 'puck detached');
  // Next frame: shooter is still within the old 1.5m pickup radius
  stepHockey(s, 0.016, { mx: 0, mz: 0 }, calm);
  assert.notEqual(s.puck.holder, 'you', 'shooter does not instantly re-catch');
});

test('slap power scales with hold duration (Merlin 2026-11-02)', () => {
  assert(slapPower(0.6) < slapPower(0.9), 'power grows with hold');
  assert(slapPower(0.9) < slapPower(1.2), 'power grows with hold');
  assert.equal(slapPower(1.2), slapPower(5), 'caps at full power');
  assert(slapPower(0.6) >= 26 && slapPower(1.2) <= 38, 'within the 26–38 band');
});

test('pass targeting picks the best-aligned teammate, never dumps it (Merlin 2026-11-02)', () => {
  const s = mk();
  const you = byId(s, 'you');
  you.x = 0; you.z = 10;
  // w1 is ahead-left, w2 is behind — aiming forward should pick w1
  byId(s, 'blue-w1').x = -5; byId(s, 'blue-w1').z = 0;
  byId(s, 'blue-w2').x = 5; byId(s, 'blue-w2').z = 20;
  const pick = pickPassTarget(s, you, 0, -1); // aiming toward the red net
  assert(pick, 'a teammate is always picked');
  assert.equal(pick.id, 'blue-w1', 'best-aligned teammate wins over nearest-behind');
  // No aim → defaults toward the goal, still picks someone
  const pick2 = pickPassTarget(s, you, 0, 0);
  assert(pick2, 'falls back instead of dumping');
});
