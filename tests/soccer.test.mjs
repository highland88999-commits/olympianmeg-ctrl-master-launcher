// tests/soccer.test.mjs — Soccer rules: FIFA Laws compliance (7v7, kickoffs,
// restarts, offside, fouls/cards).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSoccer, stepSoccer, kickoff,
  PITCH_W, PITCH_L, GOAL_W, HALF_SECONDS,
} from '../lib/sports/soccer.js';

const STEP = 0.016;
const idle = { mx: 0, mz: 0, act: false };

function stepUntil(state, pred, max = 4000) {
  for (let i = 0; i < max; i++) {
    stepSoccer(state, STEP, idle, () => 0.5);
    if (pred(state)) return true;
  }
  return false;
}

describe('Law 3: 7-a-side minimum', () => {
  it('fields 7 players per team', () => {
    const s = createSoccer();
    assert.equal(s.players.length, 14);
    assert.equal(s.players.filter((p) => p.team === 'blue').length, 7);
    assert.equal(s.players.filter((p) => p.team === 'red').length, 7);
    assert.equal(s.status, 'kickoff');
  });
});

describe('Law 7: competition format declared', () => {
  it('plays two 10-minute halves', () => {
    assert.equal(HALF_SECONDS, 600);
    const s = createSoccer();
    assert.equal(s.clock, 600);
    assert.equal(s.half, 1);
  });
});

describe('Law 8: kickoff positions', () => {
  it('everyone except the kicker starts in their own half', () => {
    const s = createSoccer();
    kickoff(s, 'blue');
    assert.equal(s.status, 'play');
    assert.equal(s.ball.holder, 'blue-f1');
    for (const p of s.players) {
      const side = s.sides[p.team];
      if (p.id === 'blue-f1') {
        assert.equal(p.x, 0);
        assert.equal(p.z, 0);
      } else {
        assert.ok(p.z * side > 0, `${p.id} not in own half (z=${p.z})`);
      }
    }
  });

  it('red kickoff puts the red striker on the ball', () => {
    const s = createSoccer();
    kickoff(s, 'red');
    assert.equal(s.ball.holder, 'red-f1');
  });

  it('after a goal, the conceding team gets the kickoff', () => {
    const s = createSoccer();
    kickoff(s, 'blue');
    // Blue scores at the -z goal.
    s.ball.holder = null;
    s.ball.x = 0; s.ball.z = -PITCH_L / 2 + 1;
    s.ball.vx = 0; s.ball.vz = -30;
    s.lastTouch = 'blue';
    assert.ok(stepUntil(s, (st) => st.events.some((e) => e.type === 'goal')));
    assert.equal(s.score.blue, 1);
    assert.equal(s.deadball.kind, 'kickoff');
    assert.equal(s.deadball.team, 'red'); // conceders kick off
    assert.ok(stepUntil(s, (st) => !st.deadball));
    assert.equal(s.ball.holder, 'red-f1');
  });

  it('half-time swaps ends and the other team kicks off', () => {
    const s = createSoccer();
    kickoff(s, 'blue');
    s.clock = 0.01;
    stepSoccer(s, STEP, idle, () => 0.5);
    assert.equal(s.half, 2);
    assert.equal(s.sides.blue, -1); // blue now defends -z, attacks +z
    assert.equal(s.sides.red, 1);
    assert.equal(s.deadball.kind, 'kickoff');
    assert.equal(s.deadball.team, 'red'); // blue kicked off first
    assert.ok(stepUntil(s, (st) => !st.deadball));
    assert.equal(s.ball.holder, 'red-f1');
  });
});

describe('Law 9/15: throw-ins', () => {
  it('ball over the touchline goes to the opponents of the last toucher', () => {
    const s = createSoccer();
    kickoff(s, 'blue');
    s.ball.holder = null;
    s.ball.x = PITCH_W / 2 - 0.2; s.ball.z = 10;
    s.ball.vx = 30; s.ball.vz = 0;
    s.lastTouch = 'red';
    assert.ok(stepUntil(s, (st) => st.deadball && st.deadball.kind === 'throwin'));
    assert.equal(s.deadball.team, 'blue');
    assert.ok(stepUntil(s, (st) => !st.deadball));
    const holder = s.players.find((p) => p.id === s.ball.holder);
    assert.equal(holder.team, 'blue');
    assert.ok(!holder.isHuman); // an AI takes it, the human is never teleported
  });
});

describe('Law 9/16/17: goal kicks and corners', () => {
  it("attacker's touch over the goal line = goal kick to the defenders", () => {
    const s = createSoccer();
    kickoff(s, 'blue'); // blue attacks -z
    s.ball.holder = null;
    s.ball.x = 10; s.ball.z = -PITCH_L / 2 + 0.2; // wide of the goal
    s.ball.vx = 0; s.ball.vz = -30;
    s.lastTouch = 'blue';
    assert.ok(stepUntil(s, (st) => st.deadball && st.deadball.kind === 'goalkick'));
    assert.equal(s.deadball.team, 'red');
    assert.ok(stepUntil(s, (st) => !st.deadball));
    const holder = s.players.find((p) => p.id === s.ball.holder);
    assert.equal(holder.team, 'red');
  });

  it("defender's touch over the goal line = corner to the attackers", () => {
    const s = createSoccer();
    kickoff(s, 'blue');
    s.ball.holder = null;
    s.ball.x = -10; s.ball.z = -PITCH_L / 2 + 0.2;
    s.ball.vx = 0; s.ball.vz = -30;
    s.lastTouch = 'red';
    assert.ok(stepUntil(s, (st) => st.deadball && st.deadball.kind === 'corner'));
    assert.equal(s.deadball.team, 'blue');
    assert.ok(stepUntil(s, (st) => !st.deadball));
    const holder = s.players.find((p) => p.id === s.ball.holder);
    assert.equal(holder.team, 'blue');
  });
});

describe('Law 11: offside', () => {
  function offsideSetup() {
    const s = createSoccer();
    kickoff(s, 'blue'); // blue attacks -z
    // Park red's outfield deep: second-last opponent near z=-5.
    for (const p of s.players) {
      if (p.team === 'red' && p.role !== 'gk') { p.x = p.hx; p.z = -5; }
    }
    // Blue striker lurks beyond them and beyond the ball.
    const f2 = s.players.find((p) => p.id === 'blue-f2');
    f2.x = 4; f2.z = -20;
    // Human (blue-f1) has the ball at z=-10 and shoots.
    const you = s.players.find((p) => p.isHuman);
    you.x = 0; you.z = -10;
    s.ball.holder = you.id;
    s.ball.x = 0; s.ball.z = -10;
    return s;
  }

  it('flags an attacker ahead of the ball and the second-last opponent', () => {
    const s = offsideSetup();
    stepSoccer(s, STEP, { mx: 0, mz: 0, act: true }, () => 0.5);
    assert.ok(s.offside, 'expected an offside snapshot');
    assert.equal(s.offside.team, 'blue');
    assert.ok(s.offside.ids.has('blue-f2'), 'blue-f2 should be flagged');
  });

  it('a flagged player touching the ball concedes an indirect free kick', () => {
    const s = offsideSetup();
    stepSoccer(s, STEP, { mx: 0, mz: 0, act: true }, () => 0.5);
    assert.ok(s.offside && s.offside.ids.has('blue-f2'));
    // Freeze the shot, drop the ball at the flagged striker's feet.
    const f2 = s.players.find((p) => p.id === 'blue-f2');
    s.ball.holder = null;
    s.ball.vx = 0; s.ball.vz = 0;
    s.ball.x = f2.x; s.ball.z = f2.z;
    stepSoccer(s, STEP, idle, () => 0.5);
    assert.ok(s.events.some((e) => e.type === 'offside'), 'expected offside offence');
    assert.equal(s.deadball.kind, 'freekick');
    assert.equal(s.deadball.team, 'red');
  });
});

describe('Laws 12-14: fouls, free kicks, penalties, cards', () => {
  // Deterministic tackle rig: [tackle gate, foul roll, card severity, ...].
  const tackleRng = () => {
    const seq = [0, 0, 0.5];
    let i = 0;
    return () => seq[Math.min(i++, seq.length - 1)];
  };

  it('a reckless tackle from behind is a foul: free kick to the victim', () => {
    const s = createSoccer();
    kickoff(s, 'blue'); // blue attacks -z
    const carrier = s.players.find((p) => p.id === 'blue-m1');
    carrier.x = 0; carrier.z = 0;
    s.ball.holder = carrier.id;
    s.ball.x = 0; s.ball.z = 0;
    const tackler = s.players.find((p) => p.id === 'red-d1');
    tackler.x = 0; tackler.z = 1; // behind the carrier
    stepSoccer(s, STEP, idle, tackleRng());
    assert.ok(s.events.some((e) => e.type === 'foul'), 'expected a foul');
    assert.equal(s.deadball.kind, 'freekick');
    assert.equal(s.deadball.team, 'blue');
  });

  it('a foul inside the offender\'s box is a penalty', () => {
    const s = createSoccer();
    kickoff(s, 'blue'); // red defends -z
    const carrier = s.players.find((p) => p.id === 'blue-m1');
    carrier.x = 0; carrier.z = -30;
    s.ball.holder = carrier.id;
    s.ball.x = 0; s.ball.z = -30;
    const tackler = s.players.find((p) => p.id === 'red-d1');
    tackler.x = 0; tackler.z = -29.5;
    // Carrier is in shooting range, so the AI's shot gate consumes the first
    // roll: [shot gate (no shot), tackle gate, foul roll, card severity].
    const seq = [0.5, 0, 0, 0.5];
    let i = 0;
    stepSoccer(s, STEP, idle, () => seq[Math.min(i++, seq.length - 1)]);
    assert.ok(s.events.some((e) => e.type === 'foul'), 'expected a foul');
    assert.equal(s.deadball.kind, 'penalty');
    assert.equal(s.deadball.team, 'blue');
  });

  it('a second yellow (or serious foul) sends the player off; below 7 abandons the match', () => {
    const s = createSoccer();
    kickoff(s, 'blue');
    const carrier = s.players.find((p) => p.id === 'blue-m1');
    carrier.x = 0; carrier.z = 0;
    s.ball.holder = carrier.id;
    s.ball.x = 0; s.ball.z = 0;
    const tackler = s.players.find((p) => p.id === 'red-d1');
    tackler.x = 0; tackler.z = 0.5;
    tackler.yellow = true;
    tackler.fouls = 2; // persistent infringement -> second yellow -> red
    stepSoccer(s, STEP, idle, () => 0);
    assert.ok(tackler.off, 'expected the tackler to be sent off');
    assert.ok(s.events.some((e) => e.type === 'card' && e.color === 'red'));
    // 7-a-side minus one = 6 < Law 3 minimum: match abandoned, blue win.
    assert.equal(s.status, 'done');
    assert.equal(s.winner, 'blue');
    assert.ok(s.events.some((e) => e.type === 'abandoned'));
  });
});
