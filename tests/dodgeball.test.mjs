// tests/dodgeball.test.mjs — Dodgeball rules: WDBF official, fair bots.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, step, act, decideBot, autoAim, eliminate,
  COURT_HALF_W, COURT_HALF_D, PLAYER_RADIUS, BALL_COUNT,
  FORMATS, DEFAULT_MODE, TEAM_SIZES, ATTACK_LINE_DIST,
} from '../lib/dodgeball/rules.js';
import {
  createLobby, addPlayer, buildRoster,
} from '../lib/dodgeball/matchmaking.js';

const noLuck = () => 1; // every bot roll fails: no catches, no dodges
const fullLuck = () => 0; // every bot roll succeeds
const idleHuman = { mx: 0, mz: 0, act: false, aimX: 0, aimZ: -1 };

function human(state) {
  return state.players.find((p) => p.isHuman);
}

/** Skip the opening rush: the whistle has blown. */
function whistled(state) {
  state.status = 'playing';
  return state;
}

function giveBall(state, player, ballId, activated = true) {
  player.hasBall = ballId;
  const ball = state.balls[ballId];
  ball.mode = 'carried';
  ball.carrierId = player.id;
  ball.activated = activated;
}

describe('match setup (WDBF)', () => {
  it('defaults to 6v6 foam: 12 players, 6 balls, back-line rush start', () => {
    const s = createMatch();
    assert.equal(s.mode, '6v6');
    assert.equal(s.mode, DEFAULT_MODE);
    assert.equal(s.format, 'foam');
    assert.equal(s.players.length, 12);
    assert.equal(s.players.filter((p) => p.team === 'blue').length, TEAM_SIZES['6v6']);
    assert.equal(s.players.filter((p) => p.team === 'red').length, TEAM_SIZES['6v6']);
    assert.equal(s.status, 'rush');
    assert.equal(s.winner, null);
    assert.equal(s.balls.length, BALL_COUNT);
    assert.equal(s.balls.length, FORMATS.foam.balls);
    for (const b of s.balls) {
      assert.equal(b.mode, 'loose');
      assert.equal(b.z, 0); // WDBF 13: balls on the center line
      assert.equal(b.activated, false); // not live until behind the attack line
    }
    // Everyone starts on their back line (WDBF 13).
    for (const p of s.players) {
      const back = p.team === 'blue' ? COURT_HALF_D - PLAYER_RADIUS : -(COURT_HALF_D - PLAYER_RADIUS);
      assert.ok(Math.abs(p.z - back) < 1e-9, `${p.id} on the back line`);
    }
    assert.equal(s.half, 1);
    assert.equal(s.set, 1);
    assert.deepEqual(s.points, { blue: 0, red: 0 });
  });

  it('3v3 arcade mode: 6 players, still 6 foam balls', () => {
    const s = createMatch(null, { mode: '3v3' });
    assert.equal(s.mode, '3v3');
    assert.equal(s.players.length, 6);
    assert.equal(s.players.filter((p) => p.team === 'blue').length, 3);
    assert.equal(s.players.filter((p) => p.team === 'red').length, 3);
    assert.equal(s.balls.length, 6);
  });

  it('cloth format shortens the shot clock and lengthens halves', () => {
    const s = createMatch(null, { format: 'cloth' });
    assert.equal(s.format, 'cloth');
    assert.equal(s.shotClock.timeLeft, FORMATS.cloth.shotClockSecs);
    assert.equal(s.halfTimeLeft, FORMATS.cloth.halfSecs);
  });
});

describe('opening rush (WDBF 13)', () => {
  it('the whistle blows after the countdown and play begins', () => {
    const s = createMatch();
    step(s, 3.1, idleHuman, noLuck);
    assert.equal(s.status, 'playing');
    assert.ok(s.events.some((e) => e.type === 'whistle'));
  });

  it('moving toward center before the whistle is a false start: out', () => {
    const s = createMatch();
    const you = human(s);
    step(s, 0.1, { ...idleHuman, mz: -1 }, noLuck); // blue runs at the line early
    assert.equal(you.alive, false);
    assert.ok(s.events.some((e) => e.type === 'false-start' && e.victimId === 'you'));
  });

  it('shuffling along the back line before the whistle is fine', () => {
    const s = createMatch();
    const you = human(s);
    step(s, 0.1, { ...idleHuman, mx: 1 }, noLuck); // lateral only, no crossing
    assert.equal(you.alive, true);
    assert.equal(s.status, 'rush');
  });

  it('a rush ball will not throw until carried behind the attack line', () => {
    const s = whistled(createMatch());
    const you = human(s);
    giveBall(s, you, 0, false);
    assert.equal(act(s, you, 0, -1), 'none');
    assert.ok(s.events.some((e) => e.type === 'not-activated'));
    // Carry it behind the attack line: it goes live.
    you.z = ATTACK_LINE_DIST + 2;
    step(s, 0.05, idleHuman, noLuck);
    assert.equal(s.balls[0].activated, true);
    assert.ok(s.events.some((e) => e.type === 'activated'));
    assert.equal(act(s, you, 0, -1), 'threw');
  });
});

describe('pickup and throw', () => {
  it('walking over a loose ball picks it up (one ball max)', () => {
    const s = whistled(createMatch());
    const you = human(s);
    you.x = s.balls[1].x; // ball 1 sits at (x, 0); stand just off the line
    you.z = 1.0; // close but off the center line
    step(s, 0.016, idleHuman, noLuck);
    assert.equal(you.hasBall, 1);
    assert.equal(s.balls[1].mode, 'carried');
  });

  it('throwing sends the ball at aim, sets cooldown, frees the hands', () => {
    const s = whistled(createMatch());
    const you = human(s);
    giveBall(s, you, 1);
    assert.equal(act(s, you, 0, -1), 'threw');
    assert.equal(s.balls[1].mode, 'flying');
    assert.equal(s.balls[1].throwerId, 'you');
    assert.equal(s.balls[1].vz, -22);
    assert.equal(you.hasBall, null);
    assert.ok(you.cooldown > 0);
    // Cooldown blocks a second throw.
    giveBall(s, you, 0);
    assert.equal(act(s, you, 0, -1), 'none');
  });
});

describe('hits, catches, and sets', () => {
  it('a hit is pending until the ball touches a dead object (WDBF 19.1)', () => {
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0;
    you.z = 5;
    you.facing = Math.PI;
    giveBall(s, you, 1);
    const foe = s.players.find((p) => p.id === 'red-1');
    foe.x = 0;
    foe.z = 3;
    act(s, you, 0, -1);
    step(s, 0.05, idleHuman, noLuck);
    assert.ok(s.events.some((e) => e.type === 'hit-pending' && e.playerId === 'red-1'));
    assert.equal(foe.alive, true, 'not out yet — the ball is still live');
    for (let i = 0; i < 60 && foe.alive; i++) {
      step(s, 0.05, idleHuman, noLuck);
    }
    assert.equal(foe.alive, false, 'out once the ball dies at the wall');
    assert.equal(s.balls[1].mode, 'loose');
  });

  it('catching a hit ball saves the hit player and outs the thrower', () => {
    const s = whistled(createMatch());
    const you = human(s);
    const saver = s.players.find((p) => p.id === 'red-2');
    saver.x = 0;
    saver.z = -6;
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.live = true;
    ball.x = 0;
    ball.z = -5.5; // 0.5 m short of the saver, flying at them
    ball.vx = 0;
    ball.vz = -22;
    ball.throwerId = 'you';
    ball.hitIds = ['red-1']; // it already hit red-1 and is still live
    assert.equal(act(s, saver, 0, 1), 'caught');
    assert.equal(s.players.find((p) => p.id === 'red-1').alive, true, 'saved by the catch');
    assert.equal(you.alive, false, 'thrower out');
  });

  it('a timed catch puts the THROWER out and the catcher keeps the ball', () => {
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0; // 6v6 spawns you at x=-3; square up with the ball
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.live = true;
    ball.x = 0;
    ball.z = 8; // 0.4 m short of you at (0, 8.4), flying at you
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'red-1';
    assert.equal(act(s, you, 0, -1), 'caught');
    assert.equal(s.players.find((p) => p.id === 'red-1').alive, false);
    assert.equal(you.hasBall, 0);
    assert.equal(ball.mode, 'carried');
  });

  it('a catch returns the catcher’s first-out teammate (WDBF 23.4)', () => {
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0; // square up with the incoming ball
    const mate = s.players.find((p) => p.id === 'blue-1');
    eliminate(s, mate);
    assert.equal(mate.alive, false);
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.live = true;
    ball.x = 0;
    ball.z = 8;
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'red-1';
    assert.equal(act(s, you, 0, -1), 'caught');
    assert.equal(mate.alive, true, 'first-out teammate returns');
    assert.ok(Math.abs(mate.z - (COURT_HALF_D - PLAYER_RADIUS)) < 1e-9, 're-enters at the back line');
    assert.ok(s.events.some((e) => e.type === 'returned' && e.playerId === 'blue-1'));
  });

  it('a ball never eliminates its thrower’s own teammate', () => {
    const s = whistled(createMatch());
    const mate = s.players.find((p) => p.id === 'red-2');
    mate.x = 0;
    mate.z = -3;
    giveBall(s, mate, 1); // carrying keeps it in place (it throws, not dodges)
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.live = true;
    ball.x = 0;
    ball.z = -4;
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'red-1';
    step(s, 0.05, idleHuman, noLuck);
    assert.equal(mate.alive, true);
  });

  it('eliminating a whole team ends the set, awards points, and re-lines', () => {
    const s = whistled(createMatch());
    for (let i = 1; i <= 6; i++) eliminate(s, s.players.find((p) => p.id === `red-${i}`));
    step(s, 0.016, idleHuman, noLuck); // process the pending set end
    assert.equal(s.points.blue, FORMATS.foam.setWinPoints);
    assert.equal(s.set, 2);
    assert.equal(s.status, 'rush', 'a new set opens with a new rush');
    assert.ok(s.players.every((p) => p.alive), 'everyone re-lines for the next set');
    assert.equal(s.balls.length, 6);
    assert.ok(s.events.some((e) => e.type === 'set-end' && e.result === 'blue'));
  });

  it('running out the half clock ends the match on points', () => {
    const s = whistled(createMatch());
    s.half = 2;
    s.halfTimeLeft = 0.05;
    s.setTimeLeft = 30;
    s.points = { blue: 4, red: 2 };
    step(s, 0.1, idleHuman, noLuck);
    assert.equal(s.status, 'over');
    assert.equal(s.winner, 'blue');
    assert.ok(s.events.some((e) => e.type === 'win' && e.winner === 'blue'));
  });
});

describe('blocking (WDBF 21)', () => {
  it('ACT while carrying blocks an incoming live ball', () => {
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0;
    you.z = 5;
    giveBall(s, you, 0);
    const ball = s.balls[1];
    ball.mode = 'flying';
    ball.live = true;
    ball.x = 0;
    ball.z = 4; // 1 m away, flying at you
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'red-1';
    assert.equal(act(s, you, 0, -1), 'blocked');
    assert.equal(ball.mode, 'loose', 'the blocked ball dies');
    assert.equal(you.hasBall, 0, 'the blocker keeps their ball');
    assert.equal(you.alive, true);
    assert.ok(s.events.some((e) => e.type === 'blocked' && e.blockerId === 'you'));
  });

  it('a carrying bot blocks when its roll succeeds', () => {
    const s = whistled(createMatch());
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.x = 0;
    bot.z = -5;
    bot.facing = 0; // faces +Z, where the ball sits
    giveBall(s, bot, 0);
    const ball = s.balls[1];
    ball.mode = 'flying';
    ball.live = true;
    ball.x = 0;
    ball.z = -4; // 1 m away, flying toward the bot
    ball.vx = 0;
    ball.vz = -22;
    ball.throwerId = 'you';
    const intent = decideBot(s, bot, fullLuck);
    assert.equal(intent.act, true);
    assert.equal(act(s, bot, 0, 0), 'blocked');
  });
});

describe('center line (WDBF 26.3)', () => {
  it('touching the center line is out', () => {
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0;
    you.z = 1.2;
    step(s, 0.3, { ...idleHuman, mz: -1 }, noLuck);
    assert.equal(you.alive, false);
    assert.ok(s.events.some((e) => e.type === 'center-line' && e.victimId === 'you'));
  });

  it('a carrying bot with a dead rush ball retreats behind the attack line', () => {
    const s = whistled(createMatch());
    const bot = s.players.find((p) => p.id === 'red-1');
    giveBall(s, bot, 0, false); // not yet live
    const intent = decideBot(s, bot, fullLuck);
    assert.equal(intent.act, false);
    assert.ok(intent.mz > 0, 'red retreats toward its own attack line');
  });
});

describe('valid attempts (WDBF 16.1)', () => {
  it('a throw that never nears an opponent is an invalid attempt', () => {
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0;
    you.z = 5;
    you.facing = Math.PI / 2; // throw sideways, away from everyone
    giveBall(s, you, 0);
    assert.equal(act(s, you, 1, 0), 'threw');
    let saw = false;
    for (let i = 0; i < 40 && s.balls[0].mode === 'flying'; i++) {
      step(s, 0.05, idleHuman, noLuck);
      if (s.events.some((e) => e.type === 'invalid-attempt' && e.throwerId === 'you')) saw = true;
    }
    assert.ok(saw, 'invalid attempt flagged when the ball dies');
    assert.equal(s.balls[0].mode, 'loose');
  });
});

describe('shot clock (WDBF 17)', () => {
  it('holding 4+ balls for 10 s (foam) turns them over', () => {
    const s = whistled(createMatch());
    // Blue holds 4, red holds 2 — nobody can throw (cooldown), so the
    // only thing that can happen is the shot clock running out.
    const blues = ['you', 'blue-1', 'blue-2', 'blue-3'].map((id) => s.players.find((p) => p.id === id));
    const reds = ['red-1', 'red-2'].map((id) => s.players.find((p) => p.id === id));
    blues.forEach((p, i) => {
      giveBall(s, p, i);
      p.cooldown = 999; // hold the balls: nobody throws
    });
    reds.forEach((p, i) => {
      giveBall(s, p, i + 4);
      p.cooldown = 999;
    });
    let saw = false;
    // Realistic tick (0.05 s): 10 s of holding = 200 ticks.
    for (let i = 0; i < 220 && !saw; i++) {
      step(s, 0.05, idleHuman, noLuck);
      saw = s.events.some((e) => e.type === 'shot-clock-violation' && e.team === 'blue');
    }
    assert.ok(saw, 'violation flagged after 10 s');
    for (let i = 0; i < 4; i++) {
      assert.equal(s.balls[i].mode, 'loose');
      assert.equal(s.balls[i].z, 0, 'turned over to the center line');
    }
    assert.ok(blues.every((p) => p.hasBall === null));
    assert.ok(reds.every((p) => p.hasBall !== null), 'red keeps its balls');
  });
});

describe('bots', () => {
  it('a bot facing an incoming ball catches it when its roll succeeds', () => {
    const s = whistled(createMatch());
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.x = 0;
    bot.z = 5;
    bot.facing = Math.PI; // faces -Z, where the ball sits
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.live = true;
    ball.x = 0;
    ball.z = 4.5; // 0.5 m away, flying toward the bot (+Z)
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'you';
    const intent = decideBot(s, bot, fullLuck);
    assert.equal(intent.act, true);
  });

  it('the same bot does not catch when its roll fails', () => {
    const s = whistled(createMatch());
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.x = 0;
    bot.z = 5;
    bot.facing = Math.PI;
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.live = true;
    ball.x = 0;
    ball.z = 4.5;
    ball.vx = 0;
    ball.vz = 22;
    ball.throwerId = 'you';
    const intent = decideBot(s, bot, noLuck);
    assert.equal(intent.act, false);
  });

  it('a bot strafes perpendicular to a ball it cannot catch', () => {
    const s = whistled(createMatch());
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.x = 0;
    bot.z = 5;
    bot.facing = 0; // faces away: no catch possible
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.live = true;
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
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0; // square up: nearest enemy straight ahead
    const bot = s.players.find((p) => p.id === 'red-1');
    bot.x = 0;
    giveBall(s, bot, 0);
    const intent = decideBot(s, bot, fullLuck);
    assert.equal(intent.act, true);
    const aimAngle = Math.atan2(intent.aimX, intent.aimZ);
    const baseAngle = Math.atan2(you.x - bot.x, you.z - bot.z); // straight at you
    assert.ok(Math.abs(aimAngle - baseAngle) <= 0.12 + 1e-9, 'aim noise within spread');
  });

  it('bots hold the line during the rush', () => {
    const s = createMatch();
    const bot = s.players.find((p) => p.id === 'red-1');
    const intent = decideBot(s, bot, fullLuck);
    assert.deepEqual(intent, { mx: 0, mz: 0, act: false, aimX: 0, aimZ: 0 });
  });
});

describe('matchmaking modes', () => {
  it('a 6v6 lobby holds 12 and backfills 6 per side', () => {
    const lobby = createLobby('host', 'Host');
    assert.equal(lobby.mode, '6v6');
    for (let i = 0; i < 11; i++) assert.equal(addPlayer(lobby, `p${i}`, `P${i}`), true);
    assert.equal(addPlayer(lobby, 'extra', 'Extra'), false, 'lobby is full at 12');
    const roster = buildRoster(lobby);
    assert.equal(roster.length, 12);
    assert.equal(roster.filter((c) => c.team === 'blue').length, 6);
    assert.equal(roster.filter((c) => c.team === 'red').length, 6);
  });

  it('a 3v3 lobby holds 6 and backfills 3 per side', () => {
    const lobby = createLobby('host', 'Host', '3v3');
    assert.equal(lobby.mode, '3v3');
    for (let i = 0; i < 5; i++) assert.equal(addPlayer(lobby, `p${i}`, `P${i}`), true);
    assert.equal(addPlayer(lobby, 'extra', 'Extra'), false, 'lobby is full at 6');
    const roster = buildRoster(lobby);
    assert.equal(roster.length, 6);
    assert.equal(roster.filter((c) => c.team === 'blue').length, 3);
    assert.equal(roster.filter((c) => c.team === 'red').length, 3);
  });

  it('an unknown mode falls back to 6v6', () => {
    const lobby = createLobby('host', 'Host', 'nope');
    assert.equal(lobby.mode, '6v6');
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
    assert.equal(SATELLITES.length, 215); // registry has grown since the 179-seat count; dodgeball's own seat is what matters here; Omega 500 seat: 195→196; Hades seats: 196→198; nether-realms homes: 198→210 (Nov 12, 2026); Earth 4 seat: 210→211 (Nov 14, 2026); Moon + Sun Base seats: 211→213 (Nov 14, 2026); Jupiter 2 + Mars 2 seats: 213→215 (Nov 15, 2026); Ghost Rider seat: 215→216 (Nov 15, 2026); Weapons Forge seat removed: 216→215 (Nov 15, 2026); Land of the Dead seat added: 215→216 (Nov 16, 2026); ARES seat removed: 216→215 (Nov 16, 2026)
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
    const s = whistled(createMatch());
    const you = human(s);
    you.x = COURT_HALF_W - PLAYER_RADIUS;
    you.z = COURT_HALF_D - PLAYER_RADIUS;
    step(s, 1, { mx: 1, mz: 1, act: false, aimX: 0, aimZ: -1 }, noLuck);
    assert.ok(Math.abs(you.x) <= COURT_HALF_W - PLAYER_RADIUS);
    assert.ok(Math.abs(you.z) <= COURT_HALF_D - PLAYER_RADIUS);
    const ball = s.balls[0];
    ball.mode = 'flying';
    ball.live = true;
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
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0;
    you.z = 8.4;
    you.facing = Math.PI;
    giveBall(s, you, 1);
    step(s, 0.016, idleHuman, noLuck);
    assert.ok(Math.abs(s.balls[1].x - 0) < 1e-9);
    assert.ok(Math.abs(s.balls[1].z - 7.7) < 1e-9);
  });

  it('auto-aim snaps to an enemy in the front cone, else keeps facing', () => {
    const s = whistled(createMatch());
    const you = human(s);
    you.x = 0; // 6v6 spawns you at x=-3; square up
    you.facing = Math.PI; // looking toward -Z
    const foe = s.players.find((p) => p.id === 'red-1');
    foe.x = 0;
    foe.z = -8.4;
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
