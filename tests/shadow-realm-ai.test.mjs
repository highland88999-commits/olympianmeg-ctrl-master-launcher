// tests/shadow-realm-ai.test.mjs — Headless tests for the SHADOW REALM
// VS AI (app/shadow-realm/ai.js): parametric ghost racers.
//
// Coverage: determinism, skill bounds, wobble/boundary clamp on all 20
// tracks, rubber-band math, advanceBot lap/finish, placements sort.
//
// Run: node --test tests/shadow-realm-ai.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRACKS, trackLength } from '../app/shadow-realm/tracks.js';
import {
  makeBots,
  buildTrackData,
  sampleTrack,
  cornerSharpness,
  rubberBandFactor,
  advanceBot,
  botPose,
  placements,
  respawnBot,
} from '../app/shadow-realm/ai.js';
import { FLY_SECS, startFly } from '../lib/shadow-realm/bump.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('makeBots({ count, track, seed })', () => {
  it('is deterministic: same seed -> identical bots', () => {
    const a = makeBots({ count: 3, track: TRACKS[0], seed: 12345 });
    const b = makeBots({ count: 3, track: TRACKS[0], seed: 12345 });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it('different seeds -> different rosters', () => {
    const a = makeBots({ count: 3, track: TRACKS[0], seed: 1 });
    const b = makeBots({ count: 3, track: TRACKS[0], seed: 2 });
    assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  });

  it('names, colors, and counts for 0/1/3/7', () => {
    for (const count of [0, 1, 3, 7]) {
      const bots = makeBots({ count, track: TRACKS[4], seed: 99 });
      assert.equal(bots.length, count, `count=${count}`);
      const colors = new Set();
      bots.forEach((bot, i) => {
        assert.equal(bot.name, `RIVAL-${i + 1}`);
        assert.match(bot.color, HEX);
        colors.add(bot.color);
        assert.equal(bot.finished, false);
        assert.equal(bot.finishTime, null);
      });
      assert.equal(colors.size, count, 'colors are distinct');
    }
  });

  it('skill rolls stay in bounds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const bot of makeBots({ count: 7, track: TRACKS[0], seed })) {
        assert.ok(bot.skill.topSpeedFrac >= 0.85 && bot.skill.topSpeedFrac <= 1.0,
          `topSpeedFrac=${bot.skill.topSpeedFrac}`);
        assert.ok(bot.skill.cornerFrac >= 0.55 && bot.skill.cornerFrac <= 0.85,
          `cornerFrac=${bot.skill.cornerFrac}`);
        assert.ok(bot.skill.wobbleAmp >= 0.6 && bot.skill.wobbleAmp <= 2.2,
          `wobbleAmp=${bot.skill.wobbleAmp}`);
        assert.ok(bot.skill.wobblePhase >= 0 && bot.skill.wobblePhase <= Math.PI * 2);
      }
    }
  });

  it('staggers bots behind the start line (s < 0)', () => {
    const bots = makeBots({ count: 3, track: TRACKS[0], seed: 7 });
    assert.ok(bots[0].s < 0 && bots[1].s < bots[0].s && bots[2].s < bots[1].s);
  });
});

describe('buildTrackData / sampleTrack', () => {
  it('lapLen matches trackLength() and halfW matches width/2', () => {
    for (const track of TRACKS) {
      const td = buildTrackData(track, { maxSpeed: 45, raceLaps: 3 });
      assert.ok(Math.abs(td.lapLen - trackLength(track)) < 1,
        `${track.key}: lapLen=${td.lapLen} vs ${trackLength(track)}`);
      assert.equal(td.halfW, (track.width || 14) / 2);
    }
  });

  it('sampleTrack wraps and returns unit tangents', () => {
    const td = buildTrackData(TRACKS[0], {});
    for (const s of [-50, 0, 123.4, td.lapLen - 1, td.lapLen + 40]) {
      const p = sampleTrack(td, s);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
      assert.ok(Math.abs(Math.hypot(p.tx, p.tz) - 1) < 1e-9);
    }
  });

  it('cornerSharpness is ~0 on an oval straight, >0 in the turns', () => {
    const td = buildTrackData(TRACKS[0], {});
    // s=0 region of gridiron-oval: sample broadly and check range
    let min = 1;
    let max = 0;
    for (let i = 0; i < 64; i++) {
      const v = cornerSharpness(td, (i / 64) * td.lapLen);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    assert.ok(min < 0.3, `min sharpness ${min}`);
    assert.ok(max > 0.3, `max sharpness ${max}`);
  });
});

describe('rubberBandFactor(progressDelta)', () => {
  it('behind the player -> faster (>1)', () => {
    assert.ok(rubberBandFactor(0.3) > 1);
  });
  it('ahead of the player -> slower (<1)', () => {
    assert.ok(rubberBandFactor(-0.3) < 1);
  });
  it('even -> exactly 1', () => {
    assert.equal(rubberBandFactor(0), 1);
  });
  it('clamps to +0.12 / -0.08', () => {
    assert.equal(rubberBandFactor(100), 1.12);
    assert.equal(rubberBandFactor(-100), 0.92);
    assert.equal(rubberBandFactor(0.24), 1.12); // 0.24*0.5 = 0.12 exactly
  });
});

describe('advanceBot: laps, finish, and boundary respect', () => {
  it('counts laps and finishes after raceLaps with a finishTime', () => {
    const td = buildTrackData(TRACKS[0], { maxSpeed: 45, raceLaps: 2 });
    const [bot] = makeBots({ count: 1, track: TRACKS[0], seed: 5 });
    let steps = 0;
    while (!bot.finished && steps < 200000) {
      advanceBot(bot, 1 / 60, td, bot.progress); // no rubber-band (delta 0)
      steps++;
    }
    assert.equal(bot.finished, true);
    assert.ok(bot.finishTime > 0, `finishTime=${bot.finishTime}`);
    assert.equal(bot.lap, 2);
    assert.equal(bot.progress, 2);
    assert.equal(bot.speed, 0);
    // Finished bots park: further steps change nothing.
    const snap = JSON.stringify(bot);
    advanceBot(bot, 1 / 60, td, 0);
    assert.equal(JSON.stringify(bot), snap);
  });

  it('speed never exceeds the rubber-banded top speed', () => {
    const td = buildTrackData(TRACKS[0], { maxSpeed: 45, raceLaps: 1 });
    const [bot] = makeBots({ count: 1, track: TRACKS[0], seed: 11 });
    const cap = bot.skill.topSpeedFrac * 45 * 1.12 + 1e-6;
    for (let i = 0; i < 3000 && !bot.finished; i++) {
      advanceBot(bot, 1 / 60, td, bot.progress - 5); // max rubber-band boost
      assert.ok(bot.speed <= cap, `speed=${bot.speed} cap=${cap}`);
    }
  });

  it('corners slow the bot: hairpin speed < straight speed', () => {
    const td = buildTrackData(TRACKS[12], { maxSpeed: 45, raceLaps: 1 }); // hairpin-heights
    const [bot] = makeBots({ count: 1, track: TRACKS[12], seed: 21 });
    const speeds = [];
    for (let i = 0; i < 6000 && !bot.finished; i++) {
      advanceBot(bot, 1 / 60, td, bot.progress);
      speeds.push({ speed: bot.speed, sharp: cornerSharpness(td, bot.s) });
    }
    const straight = speeds.filter((r) => r.sharp < 0.15).map((r) => r.speed);
    const hairpin = speeds.filter((r) => r.sharp > 0.6).map((r) => r.speed);
    assert.ok(straight.length > 10 && hairpin.length > 10, 'need both samples');
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    assert.ok(avg(hairpin) < avg(straight),
      `hairpin avg ${avg(hairpin)} vs straight avg ${avg(straight)}`);
  });

  it('wobble stays within ±halfW*0.7 on ALL 21 tracks (boundary respect)', () => {
    assert.equal(TRACKS.length, 21);
    for (const track of TRACKS) {
      const td = buildTrackData(track, { maxSpeed: 45, raceLaps: 2 });
      const bots = makeBots({ count: 3, track, seed: 4242 });
      const maxOff = td.halfW * 0.7;
      let allDone = false;
      for (let step = 0; step < 60000 && !allDone; step++) {
        allDone = true;
        for (const bot of bots) {
          if (!bot.finished) {
            advanceBot(bot, 1 / 60, td, bot.progress);
            allDone = false;
          }
          assert.ok(Math.abs(bot.offset) <= maxOff + 1e-9,
            `${track.key}: offset=${bot.offset} maxOff=${maxOff}`);
          // Pose lateral position is offset by construction -> inside walls.
          const pose = botPose(bot, td);
          assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.z));
          assert.ok(pose.heading >= -Math.PI && pose.heading <= Math.PI);
        }
      }
      assert.ok(bots.every((b) => b.finished), `${track.key}: all bots finished`);
    }
  });
});

describe('placements(playerResult, bots)', () => {
  const mk = (over) => ({ name: 'R', color: '#fff', ...over });

  it('solo race: player alone is rank 1', () => {
    const st = placements({ finishTime: 90, progress: 3 }, []);
    assert.equal(st.length, 1);
    assert.equal(st[0].rank, 1);
    assert.equal(st[0].isPlayer, true);
    assert.equal(st[0].name, 'YOU');
  });

  it('finished sorted by finishTime asc', () => {
    const st = placements(
      { finishTime: 100, progress: 3 },
      [
        mk({ name: 'RIVAL-1', finished: true, finishTime: 95, progress: 3 }),
        mk({ name: 'RIVAL-2', finished: true, finishTime: 110, progress: 3 }),
      ]
    );
    assert.deepEqual(st.map((r) => r.name), ['RIVAL-1', 'YOU', 'RIVAL-2']);
    assert.deepEqual(st.map((r) => r.rank), [1, 2, 3]);
  });

  it('unfinished rank after finished, by progress desc', () => {
    const st = placements(
      { finishTime: 100, progress: 3 },
      [
        mk({ name: 'RIVAL-1', finished: false, finishTime: null, progress: 2.8 }),
        mk({ name: 'RIVAL-2', finished: false, finishTime: null, progress: 1.2 }),
        mk({ name: 'RIVAL-3', finished: true, finishTime: 120, progress: 3 }),
      ]
    );
    assert.deepEqual(st.map((r) => r.name), ['YOU', 'RIVAL-3', 'RIVAL-1', 'RIVAL-2']);
  });

  it('player DNF ranks by progress like everyone else', () => {
    const st = placements(
      { finishTime: null, progress: 1.5 },
      [mk({ name: 'RIVAL-1', finished: false, finishTime: null, progress: 2.1 })]
    );
    assert.deepEqual(st.map((r) => r.name), ['RIVAL-1', 'YOU']);
    assert.equal(st[1].isPlayer, true);
  });

  it('carries names and colors into standings', () => {
    const st = placements(
      { name: 'YOU', color: '#19d3ff', finishTime: 100, progress: 3 },
      [mk({ name: 'RIVAL-1', color: '#ff2fb3', finished: true, finishTime: 90, progress: 3 })]
    );
    assert.equal(st[0].color, '#ff2fb3');
    assert.equal(st[1].color, '#19d3ff');
  });
});

describe('fly-off: launched bots tumble, then respawn at the pre-hit pose', () => {
  it('makeBots starts every bot grounded (no fly state)', () => {
    for (const bot of makeBots({ count: 3, track: TRACKS[0], seed: 7 })) {
      assert.equal(bot.fly, null);
      assert.equal(bot.preHitS, null);
      assert.equal(bot.preHitOffset, null);
    }
  });

  it('respawnBot with a pre-hit pose restores exactly that pose', () => {
    const td = buildTrackData(TRACKS[0], { maxSpeed: 45, raceLaps: 3 });
    const bot = makeBots({ count: 1, track: TRACKS[0], seed: 7 })[0];
    bot.s = 500;
    bot.offset = 2;
    bot.preHitS = 500;
    bot.preHitOffset = 2;
    bot.fly = startFly({ x: 0, z: 0, heading: 0, vx: 10, vz: 0 });
    bot.speed = 30;
    bot.shoveX = 5;
    bot.trail.record(1, 1, 0);
    respawnBot(bot, td, [], 0);
    assert.equal(bot.s, 500, 'respawn arclength is the pre-hit arclength');
    assert.equal(bot.offset, 2, 'respawn offset is the pre-hit offset');
    assert.equal(bot.fly, null, 'flight state clears on respawn');
    assert.equal(bot.preHitS, null);
    assert.equal(bot.preHitOffset, null);
    assert.equal(bot.speed, 0, 'respawn parks the bike');
    assert.equal(bot.shoveX, 0, 'shove clears on respawn');
    assert.ok(bot.invulnT > 0, 'respawn grants brief grace');
    assert.equal(bot.trail.length, 0, 'trail clears on respawn');
  });

  it('respawnBot without a pre-hit pose still uses the safe search', () => {
    const td = buildTrackData(TRACKS[0], { maxSpeed: 45, raceLaps: 3 });
    const bot = makeBots({ count: 1, track: TRACKS[0], seed: 7 })[0];
    bot.s = 100;
    respawnBot(bot, td, [], 0);
    assert.ok(Number.isFinite(bot.s), 'safe respawn lands somewhere finite');
    assert.equal(bot.offset, 0, 'safe respawn centers the bot');
  });

  it('advanceBot pauses a flying bot, then lands it back at the pre-hit pose', () => {
    const td = buildTrackData(TRACKS[0], { maxSpeed: 45, raceLaps: 3 });
    const bot = makeBots({ count: 1, track: TRACKS[0], seed: 7 })[0];
    bot.s = 500;
    bot.offset = 2;
    bot.speed = 30;
    bot.preHitS = 500;
    bot.preHitOffset = 2;
    bot.fly = startFly({ x: 0, z: 0, heading: 0, vx: 10, vz: 0 });
    bot.deadT = FLY_SECS;
    // Mid-flight: the bot does not advance along the track.
    advanceBot(bot, 0.3, td, 0, null, [], 0);
    assert.equal(bot.s, 500, 'flying bot holds its arclength');
    assert.ok(bot.fly.t > 0, 'flight timer advances');
    assert.ok(bot.deadT > 0 && bot.deadT < FLY_SECS, 'pause timer counts down');
    assert.equal(bot.speed, 0, 'flying bot has no drive');
    // Step to the landing — no further: once deadT hits 0 the bot drives
    // on, so assert the landing pose the moment the pause ends.
    let guard = 0;
    while (bot.deadT > 0 && guard++ < 20) advanceBot(bot, 0.1, td, 0, null, [], 0);
    assert.equal(bot.deadT, 0, 'pause ends');
    assert.equal(bot.fly, null, 'flight clears on landing');
    assert.equal(bot.s, 500, 'lands at the pre-hit arclength');
    assert.equal(bot.offset, 2, 'lands at the pre-hit offset');
    // And it drives again on the next step.
    advanceBot(bot, 0.1, td, 0, null, [], 0.3);
    assert.ok(bot.s > 500, 'bot races on after landing');
  });

  it('a flying bot lays no trail and takes no flame hit while airborne', () => {
    const td = buildTrackData(TRACKS[0], { maxSpeed: 45, raceLaps: 3 });
    const bot = makeBots({ count: 1, track: TRACKS[0], seed: 7 })[0];
    bot.fly = startFly({ x: 0, z: 0, heading: 0, vx: 0, vz: 0 });
    bot.deadT = FLY_SECS;
    bot.lives = 3;
    advanceBot(bot, 0.1, td, 0, { playerS: 0, playerOffset: 0, flame: { x: 0, z: 0, radius: 62 } }, [], 0);
    assert.equal(bot.lives, 3, 'no life lost mid-flight');
  });
});
