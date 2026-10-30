// Olympus Eclipse — NEXT EVENT skip behavior (2026-10-30)
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextEventIn, nextWindowStart, EVENT_WINDOWS, CYCLE } from '../app/olympus-eclipse/engine.js';

test('nextEventIn is 0 inside a window', () => {
  assert.equal(nextEventIn(10), 0); // inside solar window [7.5, 22.5]
});

test('nextWindowStart skips to the following window when inside one', () => {
  // Inside solar [7.5,22.5] → should land at lunar start 37.5
  const jump = nextWindowStart(10);
  assert.ok(Math.abs((10 + jump) - 37.5) < 1e-9, `jumped to ${10 + jump}`);
});

test('nextWindowStart goes to the upcoming window when between windows', () => {
  // t=30 is between solar end (22.5) and lunar start (37.5)
  const jump = nextWindowStart(30);
  assert.ok(Math.abs((30 + jump) - 37.5) < 1e-9, `jumped to ${30 + jump}`);
});

test('nextWindowStart wraps past the last window', () => {
  // Inside blood [67.5,82.5] → wraps to solar start 7.5 next cycle
  const jump = nextWindowStart(70);
  const landed = (70 + jump) % CYCLE;
  assert.ok(Math.abs(landed - 7.5) < 1e-9, `landed at ${landed}`);
});
