// tests/collapse-run.test.mjs — the collapsing-floor runner (Merlin, 2026-10-29).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, stepGame, landFromWarp, resetRun, pathCurve,
  COUNTDOWN_MS, BASE_SPEED, SPRINT_MULT, SOLID_PAUSE_S,
  LEVEL_EVERY_M, MAX_LEVEL, TRACK_HALF,
} from '../app/collapse-run/engine.js';
import {
  paletteForLevel, LEVEL_COUNT, wrapForLevel,
  WRAP_SLOT_FLOOR, WRAP_SLOT_OBSTRUCTION, WRAP_SLOT_SOLID, WRAP_SLOT_CEILING,
} from '../app/collapse-run/textures.js';

const step = (g, secs, input = {}) => {
  const n = Math.ceil(secs / 0.016);
  for (let i = 0; i < n; i++) stepGame(g, 0.016, input);
  return g;
};
const runPastCountdown = (g) => step(g, COUNTDOWN_MS / 1000 + 0.2);

describe('countdown', () => {
  it('runs 3s, then the runner moves', () => {
    const g = createGame(42);
    assert.equal(g.phase, 'countdown');
    step(g, 1.5);
    assert.equal(g.phase, 'countdown');
    assert.equal(g.distance, 0);
    runPastCountdown(g);
    assert.equal(g.phase, 'running');
    const d0 = g.distance;
    step(g, 1);
    assert.ok(g.distance > d0, 'runner moves after countdown');
  });
});

describe('collapse wave', () => {
  it('trails a few seconds behind at full pace', () => {
    const g = createGame(7);
    runPastCountdown(g);
    step(g, 10);
    const gap = g.distance - g.collapseD;
    const secsBehind = gap / g.speed;
    assert.ok(secsBehind > 2 && secsBehind < 6, `wave ${secsBehind.toFixed(1)}s behind`);
  });
  it('catches a slowed runner and warps them (not game over)', () => {
    const g = createGame(7);
    runPastCountdown(g);
    // Slam the brakes: force slow speed for a long time.
    g.speed = 1;
    step(g, 60, {});
    assert.equal(g.phase, 'warping', 'the floor caught the runner → warp');
    assert.ok(g.level >= 1, 'warp advances the realm');
  });
  it('warp keeps distance and resumes running in a new realm', () => {
    const g = createGame(7);
    runPastCountdown(g);
    step(g, 5);
    const d = g.distance;
    const lv = g.level;
    g.collapseD = g.distance + 0.5; // force the catch
    stepGame(g, 0.016, {});
    assert.equal(g.phase, 'warping');
    landFromWarp(g);
    assert.equal(g.phase, 'running');
    assert.ok(g.distance >= d, 'distance kept through the warp');
    assert.equal(g.level, Math.min(MAX_LEVEL, lv + 1), 'new realm, new texture');
    assert.ok(g.distance - g.collapseD > 10, 'fresh grace in the new realm');
  });
});

describe('obstacles and solids', () => {
  it('hitting an obstruction slows the runner', () => {
    const g = createGame(99);
    runPastCountdown(g);
    g.obstacles.push({ d: g.distance + 5, lat: 0, kind: 'obstruction', hit: false });
    g.lateral = 0;
    step(g, 2);
    assert.ok(g.slowT > 0 || g.speed < BASE_SPEED, 'runner slowed by obstruction');
  });
  it('a solid pauses 1s then vanishes', () => {
    const g = createGame(99);
    runPastCountdown(g);
    g.obstacles.push({ d: g.distance + 5, lat: 0, kind: 'solid', hit: false });
    g.lateral = 0;
    let sawPause = false;
    for (let i = 0; i < Math.ceil(1.2 / 0.016); i++) {
      stepGame(g, 0.016, {});
      if (g.phase === 'hitpause') { sawPause = true; break; }
    }
    assert.ok(sawPause, 'solid object pauses the runner');
    const pauseLeft = g.pauseT;
    assert.ok(pauseLeft > 0 && pauseLeft <= SOLID_PAUSE_S);
    step(g, SOLID_PAUSE_S + 0.3);
    assert.equal(g.phase, 'running', 'pause ends, sprint continues');
    assert.ok(!g.obstacles.some((o) => o.kind === 'solid' && !o.hit), 'solid vanished');
  });
  it('sprint multiplies speed', () => {
    const g = createGame(5);
    runPastCountdown(g);
    step(g, 1, { sprint: true });
    assert.ok(g.speed > BASE_SPEED * 1.3, `sprinting at ${g.speed.toFixed(1)} m/s`);
  });
});

describe('levels', () => {
  it('advances a level every 400m up to 100', () => {
    const g = createGame(5);
    runPastCountdown(g);
    g.distance = LEVEL_EVERY_M * 3 + 10;
    stepGame(g, 0.016, {});
    assert.equal(g.level, 4);
  });
  it('reaching level 100 ascends (victory), not another warp', () => {
    const g = createGame(5);
    runPastCountdown(g);
    g.distance = LEVEL_EVERY_M * 99 + 10;
    stepGame(g, 0.016, {});
    assert.equal(g.phase, 'ascending');
    assert.equal(g.level, MAX_LEVEL);
  });
  it('steering stays on the platform', () => {
    const g = createGame(5);
    runPastCountdown(g);
    step(g, 3, { steer: 1 });
    assert.ok(g.lateral <= TRACK_HALF, 'clamped to the platform edge');
    step(g, 6, { steer: -1 });
    assert.ok(g.lateral >= -TRACK_HALF, 'clamped to the other edge');
  });
});

describe('palettes', () => {
  it('100 levels, 100 different textures', () => {
    assert.equal(LEVEL_COUNT, 100);
    const seen = new Set();
    for (let lv = 1; lv <= 100; lv++) {
      const p = paletteForLevel(lv);
      assert.ok(p.skyTop && p.tileTop && p.runner, `level ${lv} has a full palette`);
      seen.add(p.skyTop + p.tileTop);
    }
    assert.ok(seen.size >= 90, `palettes are distinct (${seen.size}/100 unique)`);
  });
  it('paletteForLevel is deterministic', () => {
    assert.deepEqual(paletteForLevel(17), paletteForLevel(17));
  });
  it('level 100 is The Summit, level 1 is First Steps', () => {
    assert.equal(paletteForLevel(100).name, 'The Summit');
    assert.equal(paletteForLevel(1).name, 'First Steps');
  });
});

describe('path', () => {
  it('the platform turns (curve varies with distance)', () => {
    const a = pathCurve(0), b = pathCurve(200), c = pathCurve(500);
    assert.ok(a !== b || b !== c, 'the path is not straight');
  });
});

describe('reset', () => {
  it('runAgain restarts cleanly keeping best', () => {
    const g = createGame(5, 1234);
    runPastCountdown(g);
    step(g, 5);
    resetRun(g);
    assert.equal(g.phase, 'countdown');
    assert.equal(g.distance, 0);
    assert.equal(g.level, 1);
    assert.equal(g.best, 1234);
  });
});

describe('realm graphics (Merlin 2026-10-29)', () => {
  it('wrapForLevel is deterministic per realm and slot', () => {
    assert.equal(wrapForLevel(7, WRAP_SLOT_FLOOR), wrapForLevel(7, WRAP_SLOT_FLOOR));
    assert.equal(wrapForLevel(42, WRAP_SLOT_SOLID), wrapForLevel(42, WRAP_SLOT_SOLID));
  });
  it('each realm gets its own floor graphic, and cube types differ', () => {
    const floors = new Set();
    for (let lv = 1; lv <= 100; lv++) floors.add(wrapForLevel(lv, WRAP_SLOT_FLOOR));
    assert.ok(floors.size >= 70, `floors vary by realm (${floors.size}/100 unique)`);
    const f = wrapForLevel(5, WRAP_SLOT_FLOOR);
    const o = wrapForLevel(5, WRAP_SLOT_OBSTRUCTION);
    const s = wrapForLevel(5, WRAP_SLOT_SOLID);
    const c = wrapForLevel(5, WRAP_SLOT_CEILING);
    assert.ok(f && o && s && c, 'all four slots resolve to a graphic');
    assert.ok(f !== o || o !== s, 'cube types do not all share the floor graphic');
    assert.ok(c !== f, 'ceiling wears a different graphic from the floor');
  });
  it('run3d exposes setCharacter for the selected-character runner', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../app/collapse-run/run3d.js', import.meta.url), 'utf8');
    assert.ok(src.includes('setCharacter'), 'createRunRenderer returns setCharacter');
    assert.ok(src.includes('runnerSprite'), 'character renders as a billboard sprite');
  });
});
