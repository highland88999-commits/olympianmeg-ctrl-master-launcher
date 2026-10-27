// tests/dodgeball.test.mjs — Dodgeball rules: classic outcomes, fair bots.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, step, act, decideBot, autoAim, eliminate,
  COURT_HALF_W, COURT_HALF_D, PLAYER_RADIUS,
} from '../lib/dodgeball/rules.js';

const noLuck = () => 1; // every bot roll fails: no catches, no dodges
const fullLuck = () => 0; // every bot roll succeeds

function human(state) {
  return state.players.find((p) => p.isHuman);
}

describe('match setup', () => {
  it('starts 3v3 with 3 loose balls on the center line', () => {
    const s = createMatch();
    assert.equal(s.players.length, 6);
    assert.equal(s.players.filter((p) => p.team === 'blue').length, 3);
    assert.equal(s.players.filter((p) => p.team === 'red').length, 3);
    assert.equal(s.status, 'playing');
    assert.equal(s.winner, null);
    assert.equal(s.balls.length, 3);
    for (const b of s.balls) {
      assert.equal(b.mode, 'loose');
      assert.equal(b.z, 0);
    }
  });
});

describe('pickup and throw', () => {
  it('walking over a loose ball picks it up (one ball max)', () => {
    const s = createMatch();
    const you = human(s);
    you.x = 0;
    you.z = 0.5; // ball 1 sits at (0, 0)
    step(s, 0.016, { mx: 0, mz: 0, act: false, aimX: 0, aimZ: -1 }, noLuck);
    assert.equal(you.hasBall, 1);
    assert.equal(s.balls[1].mode, 'carried');
  });

  it('throwing sends the ball at aim, sets cooldown, frees the hands', () => {
    const s = createMatch();
    const you = human(s);
    you.hasBall = 1;
    s.balls[1].mode = 'carried';
    s.balls[1].carrierId = 'you';
    assert.equal(act(s, you, 0, -1), 'threw');
    assert.equal(s.balls[1].mode, 'flying');
    assert.equal(s.balls[1].throwerId, 'you');
    assert.equal(s.balls[1].vz, -22);
    assert.equal(you.hasBall, null);
    assert.ok(you.cooldown > 0);
    // Cooldown blocks a second throw.
    you.hasBall = 0;
    s.balls[0].mode = 'carried';
    assert.equal(act(s, you, 0, -1), 'none');
  });
});

describe('hits, catches, and winning', () => {
  it('a thrown ball hitting an enemy puts them out and drops loose', () => {
    const s = createMatch();
    const you = human(s);
    you.x = 0;
    you.z = 5;
    you.facing = Math.PI;
    you.hasBall = 1;
    s.balls[1].mode = 'carried';
    s.balls[1].carrierId = 'you';
    const foe = s.players.find((p) => p.id === 'red-1');
    foe.x = 0;
    foe.z = 3;
    act(s, you, 0, -1);
    for (let i = 0; i < 10 && foe.alive; i++) {
      step(s, 0.05, { mx: 0, mz: 0, act: false, aimX: 0, aimZ: -1 }, noLuck);
    }
    assert.equal(foe.alive, false);
    assert.equal(s.balls[1].mode, 'loose');
  });

  it('a timed catch puts the THROWER out and the catcher keeps the ball', () => {
    const s = createMatch();
    const you = human(s);
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.x = 0;
    ball.z = 8; // 2 m short of you at (0, 10), flying at you
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'red-1';
    assert.equal(act(s, you, 0, -1), 'caught');
    assert.equal(s.players.find((p) => p.id === 'red-1').alive, false);
    assert.equal(you.hasBall, 0);
    assert.equal(ball.mode, 'carried');
  });

  it('a ball never eliminates its thrower’s own teammate', () => {
    const s = createMatch();
    const mate = s.players.find((p) => p.id === 'red-2');
    mate.x = 0;
    mate.z = -3;
    mate.hasBall = 1; // carrying keeps it in place (it throws, not dodges)
    s.balls[1].mode = 'carried';
    s.balls[1].carrierId = 'red-2';
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.x = 0;
    ball.z = -4;
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'red-1';
    step(s, 0.05, { mx: 0, mz: 0, act: false, aimX: 0, aimZ: -1 }, noLuck);
    assert.equal(mate.alive, true);
  });

  it('eliminating a whole team ends the match for the other side', () => {
    const s = createMatch();
    for (const id of ['red-1', 'red-2', 'red-3']) {
      eliminate(s, s.players.find((p) => p.id === id));
    }
    assert.equal(s.status, 'over');
    assert.equal(s.winner, 'blue');
    const s2 = createMatch();
    for (const id of ['you', 'blue-1', 'blue-2']) {
      eliminate(s2, s2.players.find((p) => p.id === id));
    }
    assert.equal(s2.winner, 'red');
  });
});

describe('bots', () => {
  it('a bot facing an incoming ball catches it when its roll succeeds', () => {
    const s = createMatch();
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.x = 0;
    bot.z = 5;
    bot.facing = Math.PI; // faces -Z, where the ball sits
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.x = 0;
    ball.z = 4.5; // 0.5 m away, flying toward the bot (+Z)
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'you';
    const intent = decideBot(s, bot, fullLuck);
    assert.equal(intent.act, true);
  });

  it('the same bot does not catch when its roll fails', () => {
    const s = createMatch();
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.x = 0;
    bot.z = 5;
    bot.facing = Math.PI;
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.x = 0;
    ball.z = 4.5;
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'you';
    const intent = decideBot(s, bot, noLuck);
    assert.equal(intent.act, false);
  });

  it('a bot strafes perpendicular to a ball it cannot catch', () => {
    const s = createMatch();
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.x = 0;
    bot.z = 5;
    bot.facing = 0; // faces away: no catch possible
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.x = 0;
    ball.z = 0; // 5 m away, flying toward the bot
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'you';
    const intent = decideBot(s, bot, fullLuck);
    assert.ok(intent.mx !== 0 || intent.mz !== 0, 'bot moves to dodge');
    assert.equal(intent.act, false);
  });

  it('a carrying bot throws at its nearest enemy with bounded aim noise', () => {
    const s = createMatch();
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.hasBall = 0;
    s.balls[0].mode = 'carried';
    s.balls[0].carrierId = 'red-1';
    const intent = decideBot(s, bot, fullLuck);
    assert.equal(intent.act, true);
    const aimAngle = Math.atan2(intent.aimX, intent.aimZ);
    const baseAngle = Math.atan2(0 - bot.x, 10 - bot.z); // straight at you
    assert.ok(Math.abs(aimAngle - baseAngle) <= 0.12 + 1e-9, 'aim noise within spread');
  });
});

describe('portal seating', () => {
  it('the registry seats dodgeball at ARES/GAMES with a unique route', async () => {
    const { SATELLITES } = await import('../lib/i18n/satellites.ts');
    const seat = SATELLITES.find((s) => s.key === 'dodgeball');
    assert.ok(seat);
    assert.equal(seat.route, '/dodgeball');
    assert.equal(seat.pos, 'ARES');
    assert.equal(seat.section, 'GAMES');
    assert.equal(SATELLITES.filter((s) => s.route === '/dodgeball').length, 1);
    assert.equal(SATELLITES.length, 179); // Request a Billboard seat: 178→179
  });

  it('the ARES god menu claims dodgeball and the en locale titles it', async () => {
    const { GOD_MENUS } = await import('../lib/god-menus.js');
    const ares = GOD_MENUS.find((m) => m.god === 'ARES');
    assert.ok(ares.satellites.includes('dodgeball'));
    assert.ok(ares.satellites.length <= 24, 'within the per-god cap');
    const { readFileSync } = await import('node:fs');
    const en = JSON.parse(readFileSync(new URL('../lib/i18n/locales/en.json', import.meta.url), 'utf8'));
    assert.equal(en['sat.dodgeball.title'], 'Dodgeball');
    assert.ok(en['sat.dodgeball.subtitle']);
  });
});

describe('court physics and aim', () => {
  it('players and flying balls stay inside the court', () => {
    const s = createMatch();
    const you = human(s);
    you.x = COURT_HALF_W - PLAYER_RADIUS;
    you.z = COURT_HALF_D - PLAYER_RADIUS;
    step(s, 1, { mx: 1, mz: 1, act: false, aimX: 0, aimZ: -1 }, noLuck);
    assert.ok(Math.abs(you.x) <= COURT_HALF_W - PLAYER_RADIUS);
    assert.ok(Math.abs(you.z) <= COURT_HALF_D - PLAYER_RADIUS);
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.x = COURT_HALF_W - 0.1;
    ball.z = 0;
    ball.vx = 22;
    ball.vz = 0;
    ball.throwerId = 'red-1';
    step(s, 0.1, { mx: 0, mz: 0, act: false, aimX: 0, aimZ: -1 }, noLuck);
    assert.equal(ball.mode, 'loose');
    assert.equal(ball.vx, 0);
    assert.ok(Math.abs(ball.x) <= COURT_HALF_W);
  });

  it('a carried ball rides at the carrier’s hand', () => {
    const s = createMatch();
    const you = human(s);
    you.x = 0;
    you.z = 10;
    you.facing = Math.PI;
    you.hasBall = 1;
    s.balls[1].mode = 'carried';
    s.balls[1].carrierId = 'you';
    step(s, 0.016, { mx: 0, mz: 0, act: false, aimX: 0, aimZ: -1 }, noLuck);
    assert.ok(Math.abs(s.balls[1].x - 0) < 1e-9);
    assert.ok(Math.abs(s.balls[1].z - 9.3) < 1e-9);
  });

  it('auto-aim snaps to an enemy in the front cone, else keeps facing', () => {
    const s = createMatch();
    const you = human(s);
    you.facing = Math.PI; // looking toward -Z
    const foe = s.players.find((p) => p.id === 'red-1');
    foe.x = 0;
    foe.z = -10;
    const aimed = autoAim(s, you);
    assert.ok(Math.abs(aimed.x - 0) < 1e-9 && Math.abs(aimed.z - -1) < 1e-9);
    foe.x = 10;
    foe.z = 10; // behind you now
    for (const p of s.players) {
      if (p.team === 'red' && p.id !== 'red-1') {
        p.x = 12;
        p.z = 12; // everyone else behind too
      }
    }
    const kept = autoAim(s, you);
    assert.ok(Math.abs(kept.x - 0) < 1e-9 && Math.abs(kept.z - -1) < 1e-9);
  });
});
