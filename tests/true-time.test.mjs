// tests/true-time.test.mjs
// TRUE TIME (Merlin, 2026-11-03): every clock reads the real
// time — user's local time with location permission, Sydney
// time without it.
//
// Run: node --test tests/true-time.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FALLBACK_TIMEZONE,
  getTrueTime,
  getClockAngles,
  locationTimeState,
} from '../lib/time/true-time.js';

describe('true time', () => {
  it('falls back to Sydney when location is unknown', () => {
    assert.equal(FALLBACK_TIMEZONE, 'Australia/Sydney');
    // Fresh module: location unknown → Sydney.
    assert.equal(locationTimeState(), 'unknown');
    const t = getTrueTime(new Date('2026-11-03T00:00:00Z'));
    assert.equal(t.timezone, 'Australia/Sydney');
    // Midnight UTC = 11:00 Sydney (AEDT, UTC+11 in November).
    assert.equal(t.hours, 11);
    assert.equal(t.minutes, 0);
  });

  it('returns sane clock-hand angles', () => {
    // 3:00:00 Sydney = hour hand at 90°, minute at 0°.
    const a = getClockAngles(new Date('2026-11-02T16:00:00Z'));
    const deg = (r) => r * 180 / Math.PI;
    assert.ok(Math.abs(deg(a.hourAngle) - 90) < 1, `hour: ${deg(a.hourAngle)}`);
    assert.ok(Math.abs(deg(a.minuteAngle)) < 1, `minute: ${deg(a.minuteAngle)}`);
  });

  it('never throws', () => {
    const t = getTrueTime();
    assert.ok(t.hours >= 0 && t.hours < 24);
    assert.ok(t.minutes >= 0 && t.minutes < 60);
  });
});
