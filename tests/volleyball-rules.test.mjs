// tests/volleyball-rules.test.mjs — headless tests for FIVB beach volleyball rules.
// Run: node --test tests/volleyball-rules.test.mjs
// Covers (lib/sports/volleyball.js):
// - court 16m x 8m (FIVB beach 1.1)
// - out-of-bounds landing faults the last toucher (FIVB 8.4)
// - 3-contact limit, block counts (4th consecutive touch faults)
// - serve alternation between partners on side-out
// - server behind the end line (FIVB 12.4) + 8-second serve window
// - best of 3 sets: 21/21/15, win by 2, no cap
// - net cords that cross stay live (no instant fault)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createVolleyball, stepVolleyball, serveBall, stepServe, beginServe, hitBall, scorePoint,
  COURT_W, COURT_L, SERVE_WINDOW, setTarget,
} from '../lib/sports/volleyball.js';

const HALF = () => 0.5; // deterministic rng

function land(state, x, z, lastTouch) {
  const b = state.ball;
  b.x = x;
  b.y = 0.2;
  b.z = z;
  b.vx = 0;
  b.vy = -5; // falling fast enough to bounce on the first step
  b.vz = 0;
  b.lastTouch = lastTouch;
  stepVolleyball(state, 0.016, null, () => 0.99);
}

describe('court dimensions (FIVB beach 1.1)', () => {
  it('court is 16m x 8m', () => {
    assert.equal(COURT_W, 16);
    assert.equal(COURT_L, 16);
  });
});

describe('out of bounds (FIVB 8.4)', () => {
  it('ball landing 30m past the baseline is out — last toucher loses', () => {
    const s = createVolleyball();
    serveBall(s, HALF);
    land(s, 0, 30, 'blue'); // 30m past red's baseline
    assert.equal(s.score.red, 1);
    assert.equal(s.score.blue, 0);
  });

  it('ball landing wide of the sideline is out — last toucher loses', () => {
    const s = createVolleyball();
    serveBall(s, HALF);
    land(s, 25, -4, 'red');
    assert.equal(s.score.blue, 1);
  });

  it('in-bounds landing still scores against the side it landed on', () => {
    const s = createVolleyball();
    serveBall(s, HALF);
    land(s, 0, 5, 'red'); // blue's side
    assert.equal(s.score.red, 1);
  });
});

describe('three-hit limit, block counts (FIVB beach)', () => {
  it('faults on the 4th consecutive team touch', () => {
    const s = createVolleyball();
    const you = s.players[0];
    s.ball.lastTouch = 'blue';
    s.ball.touches = 3;
    s.status = 'rally';
    hitBall(s, you, HALF);
    assert.equal(s.score.red, 1);
    assert.equal(s.status, 'serve');
  });

  it('allows the 3rd consecutive touch', () => {
    const s = createVolleyball();
    const you = s.players[0];
    s.ball.lastTouch = 'blue';
    s.ball.touches = 2;
    s.status = 'rally';
    hitBall(s, you, HALF);
    assert.equal(s.ball.touches, 3);
    assert.equal(s.score.blue, 0);
    assert.equal(s.score.red, 0);
    assert.equal(s.status, 'rally');
  });

  it('resets the count when the other team touches', () => {
    const s = createVolleyball();
    const you = s.players[0];
    s.ball.lastTouch = 'red';
    s.ball.touches = 3;
    s.status = 'rally';
    hitBall(s, you, HALF);
    assert.equal(s.ball.touches, 1);
    assert.equal(s.ball.lastTouch, 'blue');
    assert.equal(s.score.red, 0);
  });
});

describe('serve alternation on side-out', () => {
  it('side-out hands the serve to the partner', () => {
    const s = createVolleyball();
    assert.equal(s.lastServer.blue, 'you');
    serveBall(s, HALF); // blue serves
    land(s, 0, 5, 'red'); // lands on blue's side: red scores, side-out
    assert.equal(s.serving, 'red');
    assert.equal(s.lastServer.red, 'red-2'); // alternated from initial red-1
    // consecutive points keep the same server
    serveBall(s, HALF);
    land(s, 0, 5, 'red');
    assert.equal(s.lastServer.red, 'red-2');
  });

  it('serveBall uses the tracked server, positioned behind the end line', () => {
    const s = createVolleyball();
    s.lastServer.red = 'red-2';
    s.serving = 'red';
    serveBall(s, HALF);
    assert.equal(s.ball.z, -(COURT_L / 2 + 1));
    const server = s.players.find((p) => p.id === 'red-2');
    assert.equal(server.z, -(COURT_L / 2 + 1));
  });
});

describe('serve from behind the end line + 8s window', () => {
  it('server starts each serve behind the baseline (FIVB 12.4)', () => {
    const s = createVolleyball();
    const server = s.players.find((p) => p.id === 'you');
    assert.equal(s.status, 'serve');
    assert.equal(server.z, COURT_L / 2 + 1);
    assert.equal(s.ball.z, COURT_L / 2 + 1);
  });

  it('8-second window expires and returns true', () => {
    const s = createVolleyball();
    assert.equal(stepServe(s, 1, null), false);
    assert.equal(stepServe(s, SERVE_WINDOW, null), true);
  });

  it('a serve from behind the line clears the net and lands in', () => {
    const s = createVolleyball();
    // keep AI out of reach so the serve flight is deterministic
    for (const p of s.players) {
      if (p.team === 'red') { p.x = p.x > 0 ? 7.9 : -7.9; p.z = -7.5; }
    }
    serveBall(s, HALF);
    let guard = 0;
    while (s.status === 'rally' && guard++ < 500) {
      stepVolleyball(s, 0.02, null, () => 0.99);
    }
    assert.equal(s.status, 'serve');
    assert.equal(s.score.blue, 1);
  });
});

describe('best of 3 sets (21/21/15, win by 2, no cap)', () => {
  it('setTarget is 21 for sets 1-2, 15 for set 3', () => {
    assert.equal(setTarget(1), 21);
    assert.equal(setTarget(2), 21);
    assert.equal(setTarget(3), 15);
  });

  it('winning a set moves to setbreak, resets score, set winner serves next', () => {
    const s = createVolleyball();
    s.score = { blue: 20, red: 5 };
    serveBall(s, HALF);
    land(s, 0, -5, 'blue');
    assert.equal(s.sets.blue, 1);
    assert.equal(s.set, 2);
    assert.deepEqual(s.score, { blue: 0, red: 0 });
    assert.equal(s.status, 'setbreak');
    assert.equal(s.serving, 'blue');
    beginServe(s, s.serving);
    assert.equal(s.status, 'serve');
  });

  it('21-20 does not win the set (win by 2)', () => {
    const s = createVolleyball();
    s.score = { blue: 20, red: 20 };
    serveBall(s, HALF);
    land(s, 0, -5, 'blue');
    assert.equal(s.score.blue, 21);
    assert.equal(s.status, 'serve');
    assert.equal(s.set, 1);
  });

  it('no cap: 31-29 wins set 1', () => {
    const s = createVolleyball();
    s.score = { blue: 30, red: 29 };
    serveBall(s, HALF);
    land(s, 0, -5, 'blue');
    assert.equal(s.sets.blue, 1);
    assert.equal(s.set, 2);
  });

  it('deciding set to 15, match ends at 2 sets', () => {
    const s = createVolleyball();
    s.set = 3;
    s.sets = { blue: 1, red: 1 };
    s.score = { blue: 14, red: 8 };
    s.status = 'rally';
    scorePoint(s, 'blue');
    assert.equal(s.status, 'done');
    assert.equal(s.winner, 'blue');
    assert.equal(s.sets.blue, 2);
  });
});

describe('net cords stay live (FIVB)', () => {
  it('a ball clipping the net is not an instant fault', () => {
    const s = createVolleyball();
    serveBall(s, HALF);
    const b = s.ball;
    b.x = 0; b.y = 2.0; b.z = 0.3;
    b.vx = 0; b.vy = 0; b.vz = -6;
    b.lastTouch = 'blue';
    b.netTouched = false;
    stepVolleyball(s, 0.02, null, () => 0.99);
    assert.equal(b.netTouched, true);
    assert.equal(s.status, 'rally');
    assert.equal(s.score.blue, 0);
    assert.equal(s.score.red, 0);
  });

  it('a net cord that fails to cross loses on the hitter’s own side', () => {
    const s = createVolleyball();
    serveBall(s, HALF);
    const b = s.ball;
    b.x = 0; b.y = 1.2; b.z = 0.3;
    b.vx = 0; b.vy = -1; b.vz = -0.8;
    b.lastTouch = 'blue';
    b.netTouched = false;
    let guard = 0;
    while (s.status === 'rally' && guard++ < 500) {
      stepVolleyball(s, 0.02, null, () => 0.99);
    }
    assert.equal(s.score.red, 1); // dribbled back onto blue's side
  });
});
