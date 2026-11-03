// tests/run-it-straight.test.mjs — Run It Straight physics (Merlin 2026-11-02 rebuild).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRunItStraight, startRound, stepRunIt, tapYou, nextRound,
  MAX_SPEED, TAP_BURST, POWER_DECAY, CLASH_DURATION, LANE_L,
} from '../lib/sports/run-it-straight.js';

describe('run-it-straight physics', () => {
  it('no auto-run: speed is 0 with no taps', () => {
    const s = createRunItStraight();
    startRound(s);
    // Step for 2 seconds with zero taps
    for (let i = 0; i < 120; i++) stepRunIt(s, 1 / 60);
    assert.equal(s.you.power, 0);
    assert.equal(s.you.speed, 0);
    assert.equal(s.you.z, LANE_L / 2 - 4, 'player should not have moved');
  });

  it('taps build power and speed; holding does nothing extra', () => {
    const s = createRunItStraight();
    startRound(s);
    tapYou(s);
    tapYou(s);
    tapYou(s);
    assert.ok(Math.abs(s.you.power - TAP_BURST * 3) < 1e-9, `power=${s.you.power}`);
    stepRunIt(s, 1 / 60);
    assert.ok(Math.abs(s.you.speed - s.you.power * MAX_SPEED) < 1e-9);
    assert.ok(s.you.speed > 0, 'taps should produce movement');
    const zAfterTap = s.you.z;
    // Power caps at 1
    for (let i = 0; i < 10; i++) tapYou(s);
    assert.equal(s.you.power, 1);
  });

  it('power decays when idle', () => {
    const s = createRunItStraight();
    startRound(s);
    tapYou(s); tapYou(s);
    const p0 = s.you.power;
    stepRunIt(s, 1.0); // 1 second idle
    assert.ok(s.you.power < p0, `decayed ${p0} -> ${s.you.power}`);
    assert.ok(Math.abs(s.you.power - Math.max(0, p0 - POWER_DECAY)) < 1e-9);
  });

  it('AI moves with effort variance (not constant)', () => {
    const s = createRunItStraight();
    startRound(s, () => 0.5);
    const speeds = new Set();
    for (let i = 0; i < 180; i++) {
      stepRunIt(s, 1 / 60, () => 0.5);
      if (s.status !== 'run') break;
      speeds.add(Math.round(s.ai.speed * 100));
    }
    assert.ok(speeds.size > 3, `AI speed should vary, got ${speeds.size} distinct values`);
    assert.ok(s.ai.z > -LANE_L / 2 + 4, 'AI should advance');
  });

  it('clash produces knockback: loser moves away, falls over', () => {
    const s = createRunItStraight();
    startRound(s, () => 0.99); // deterministic rng
    // Mash to force a clash quickly
    let guard = 0;
    while (s.status === 'run' && guard++ < 600) {
      tapYou(s); tapYou(s);
      stepRunIt(s, 1 / 60, () => 0.99);
    }
    assert.equal(s.status, 'clash', 'should reach clash');
    const c = s.clash;
    assert.ok(c, 'clash state exists');
    assert.ok(c.winner === 'you' || c.winner === 'ai');
    assert.ok(c.loser === 'you' || c.loser === 'ai');
    const loserZ0 = c.loserZ;
    // Step through the knockback animation
    for (let i = 0; i < Math.ceil(CLASH_DURATION * 60) + 5; i++) stepRunIt(s, 1 / 60, () => 0.99);
    // Loser should have been knocked back away from clash point
    const loserDir = c.loser === 'you' ? 1 : -1;
    assert.ok((c.loserZ - loserZ0) * loserDir > 0.5, `loser knocked back: ${loserZ0} -> ${c.loserZ}`);
    assert.ok(c.loserFall > 0.9, `loser fell over: fall=${c.loserFall}`);
    // After animation, advanced to next round or done
    assert.ok(s.status === 'run' || s.status === 'done', `status=${s.status}`);
  });

  it('best of 5: first to 3 wins, alternating attack', () => {
    const s = createRunItStraight();
    startRound(s, () => 0.999);
    const attackers = [];
    let guard = 0;
    while (s.status !== 'done' && guard++ < 3000) {
      if (s.status === 'run') {
        tapYou(s); tapYou(s); tapYou(s);
      }
      stepRunIt(s, 1 / 60, () => 0.999);
      for (const ev of s.events) {
        if (ev.type === 'round') attackers.push(ev.youAttacking);
      }
    }
    assert.equal(s.status, 'done');
    assert.ok(s.winner === 'you' || s.winner === 'ai');
    assert.ok(s.score.you >= 3 || s.score.ai >= 3);
    // Attack alternates each round
    for (let i = 1; i < attackers.length; i++) {
      assert.notEqual(attackers[i], attackers[i - 1], 'attack should alternate');
    }
  });

  it('tapYou is a no-op outside run phase', () => {
    const s = createRunItStraight();
    tapYou(s); // status is 'ready'
    assert.equal(s.you.power, 0);
  });
});
