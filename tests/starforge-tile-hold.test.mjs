// tests/starforge-tile-hold.test.mjs — Starforge minimum-turn-duration hold.
// After a roll (or a void-pirate landing) wakes tile videos, the turn must
// last at least as long as the video — however fast the player or the AI
// moves. The hold's transitions live in lib/starforge/tile-hold.js (pure,
// unit-tested here); the page owns the React state + backstop timer and
// TileVideo owns the video element.
// Run: node --test tests/starforge-tile-hold.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TILE_HOLD_GRACE_MS, TILE_HOLD_FAILSAFE_MS,
  createTileHold, tileHoldWake, tileHoldDuration, tileHoldEnd,
  tileHoldActive, tileHoldBackstopMs,
} from '../lib/starforge/tile-hold.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pageSrc = readFileSync(join(root, 'app/starforge/page.jsx'), 'utf8');
const graphicsSrc = readFileSync(join(root, 'components/starforge/graphics.jsx'), 'utf8');
const engineSrc = readFileSync(join(root, 'lib/starforge/engine.js'), 'utf8');
const holdSrc = readFileSync(join(root, 'lib/starforge/tile-hold.js'), 'utf8');

// --- Pure transitions ------------------------------------------------------

test('a wake starts the hold; the backstop is the video duration + grace', () => {
  const h = createTileHold();
  assert.equal(tileHoldActive(h), false);
  tileHoldWake(h, 5000);
  assert.equal(tileHoldActive(h), true);
  assert.equal(h.playing, 1);
  assert.equal(tileHoldBackstopMs(h), 6000, 'duration + 1 s grace, not a second duration constant');
});

test('the hold duration comes from the video, never a hardcoded constant', () => {
  // The module knows a grace and a failsafe, but no video length: a 3 s
  // video holds 4 s, a 7 s video holds 8 s.
  const short = createTileHold();
  tileHoldWake(short, 3000);
  assert.equal(tileHoldBackstopMs(short), 4000);
  const long = createTileHold();
  tileHoldWake(long, 7000);
  assert.equal(tileHoldBackstopMs(long), 8000);
  assert.ok(!holdSrc.includes('5000'), 'no 5 s duration constant in the hold module');
  assert.equal(TILE_HOLD_GRACE_MS, 1000, 'grace is 1 s');
});

test('no hold when nothing wakes: a 7 (or a number no hex carries) wakes no tile', () => {
  // The hold only ever starts from a TileVideo wake report. Nothing in the
  // hold module starts one by itself, and the wake rule finds no tile for
  // a 7 — covered by the roll-tiles tests; here: no wake, no hold.
  const h = createTileHold();
  assert.equal(tileHoldActive(h), false);
  assert.equal(tileHoldBackstopMs(h), TILE_HOLD_FAILSAFE_MS, 'an idle hold has only the failsafe, never a running timer');
});

test('two tiles waking on one roll both count; the hold ends when the last ends', () => {
  const h = createTileHold();
  tileHoldWake(h, 5000);
  tileHoldWake(h, 5000);
  assert.equal(h.playing, 2);
  assert.equal(tileHoldBackstopMs(h), 6000, 'backstop is the longest duration, not the sum');
  tileHoldEnd(h);
  assert.equal(tileHoldActive(h), true, 'one tile still playing');
  tileHoldEnd(h);
  assert.equal(tileHoldActive(h), false, 'last tile ended the hold');
});

test('a restart wake does not double-count the play', () => {
  const h = createTileHold();
  tileHoldWake(h, 5000);
  tileHoldWake(h, 5000, true); // same tile, second matching roll mid-play
  assert.equal(h.playing, 1, 'restart is the same play, refreshed');
  tileHoldEnd(h);
  assert.equal(tileHoldActive(h), false);
});

test('a video that errors still ends the hold (no deadlock)', () => {
  const h = createTileHold();
  tileHoldWake(h, 5000);
  tileHoldWake(h, 5000);
  tileHoldEnd(h); // one tile errored / its play() was rejected
  assert.equal(tileHoldActive(h), true);
  tileHoldEnd(h); // the other ended
  assert.equal(tileHoldActive(h), false);
  // Ending twice (a stray end after the hold cleared) stays cleared.
  tileHoldEnd(h);
  assert.equal(tileHoldActive(h), false);
  assert.equal(h.playing, 0, 'play count never goes negative');
});

test('a late duration (metadata loading after the wake) extends the backstop', () => {
  const h = createTileHold();
  tileHoldWake(h, null); // wake before metadata: no duration yet
  assert.equal(tileHoldActive(h), true);
  assert.equal(tileHoldBackstopMs(h), TILE_HOLD_FAILSAFE_MS, 'failsafe bounds the hold until a duration arrives');
  tileHoldDuration(h, 5000);
  assert.equal(tileHoldBackstopMs(h), 6000, 'real duration replaces the failsafe');
});

test('a longer second wake extends the backstop; a shorter one does not shrink it', () => {
  const h = createTileHold();
  tileHoldWake(h, 5000);
  tileHoldWake(h, 8000);
  assert.equal(tileHoldBackstopMs(h), 9000);
  tileHoldWake(h, 2000);
  assert.equal(tileHoldBackstopMs(h), 9000, 'max duration wins');
});

// --- Page wiring -----------------------------------------------------------

test('End Turn is disabled during the hold, with a visible reason', () => {
  const endTurnAt = pageSrc.indexOf('label="End turn"');
  assert.ok(endTurnAt > -1, 'End turn orb exists');
  const orb = pageSrc.slice(endTurnAt, endTurnAt + 200);
  assert.ok(orb.includes('disabled={!canAct || tileHold}'), 'End Turn disabled while tiles are playing');
  assert.ok(pageSrc.includes('Tiles still playing — End turn unlocks when the video finishes.'),
    'visible hold reason shown while End Turn is held');
  // The reason line only renders during a hold.
  const reasonAt = pageSrc.indexOf('Tiles still playing');
  const gateAt = pageSrc.indexOf('{tileHold && (');
  assert.ok(gateAt > -1 && gateAt < reasonAt && reasonAt - gateAt < 250, 'reason line is gated on the hold');
});

test('mid-turn actions stay available during the hold (only End Turn is held)', () => {
  // Every other action orb's disabled condition must not mention tileHold:
  // build / trade / play-card are part of the same turn, not its end.
  const disableds = [...pageSrc.matchAll(/disabled=\{([^}]+)\}/g)].map((m) => m[1]);
  assert.ok(disableds.length > 0, 'orb disabled conditions exist');
  const held = disableds.filter((d) => d.includes('tileHold'));
  assert.equal(held.length, 1, `exactly one orb is held (End turn), found: ${JSON.stringify(held)}`);
  assert.ok(held[0].includes('canAct'), 'the held orb is the End turn orb');
});

test('the solo AI pump waits out the hold before its next step', () => {
  const pumpAt = pageSrc.indexOf('async function pumpAi()');
  assert.ok(pumpAt > -1, 'pumpAi exists');
  const pump = pageSrc.slice(pumpAt, pageSrc.indexOf('useEffect(() => { if (screen', pumpAt));
  assert.ok(pump.includes('while (tileHoldActive(tileHoldRef.current)) await sleep(100);'),
    'pump waits while tiles are playing');
  // The wait sits AFTER the 600 ms pacing sleep and BEFORE the AI step:
  // a wake from the step that just ran only reaches the page (React
  // commit -> TileVideo effect -> onTileWake) during that sleep, so a
  // check before the sleep could never see it and the next step would
  // run during the video. The wait must follow the sleep.
  const sleepAt = pump.indexOf('await sleep(600);');
  const waitAt = pump.indexOf('while (tileHoldActive');
  // The pump steps through stepFn(g) — classic aiStep or the Explorers &
  // Pirates exAiStep, chosen above in the same function — either way the
  // step follows the wait.
  const stepAt = pump.indexOf('stepFn(g)');
  assert.ok(sleepAt > -1 && waitAt > sleepAt, 'hold wait follows the pacing sleep');
  assert.ok(stepAt > -1 && waitAt < stepAt, 'hold wait precedes the AI step');
  assert.ok(pump.includes('exAiStep'), 'the pump also steps Explorers & Pirates turns');
});

test('the hold is in-memory UI state only: reload / new game restores play', () => {
  // No persistence of the hold anywhere: no storage, no phase, no engine field.
  assert.ok(!pageSrc.includes('localStorage') && !pageSrc.includes('sessionStorage'),
    'hold is never written to storage');
  assert.ok(!engineSrc.includes('tileHold'), 'the engine (rules) knows nothing about the hold');
  assert.ok(pageSrc.includes('endTileHold();\n    resetPanels();'),
    'starting a game clears any hold');
  // Unmount clears the backstop timer so no stale hold can lock a later game.
  assert.ok(pageSrc.includes('useEffect(() => () => { clearTileHoldTimer(); }, []);'),
    'unmount cleanup clears the hold timer');
});

test('the hold backstop is duration + grace, driven by the reported duration', () => {
  assert.ok(pageSrc.includes('tileHoldBackstopMs(h)'), 'page arms the timer from the hold module');
  assert.ok(pageSrc.includes('setTimeout(() => { endTileHold(); }, tileHoldBackstopMs(h))'),
    'backstop timer ends the hold');
  assert.ok(!pageSrc.includes('setTimeout(() => { endTileHold(); }, 5000'),
    'no hardcoded 5 s hold timer in the page');
  // The page imports the hold transitions from the pure module.
  assert.ok(pageSrc.includes("from '@/lib/starforge/tile-hold.js'"), 'page imports the hold module');
});
