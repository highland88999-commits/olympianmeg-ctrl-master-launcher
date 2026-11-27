// tests/seasonal-overlay-video.test.mjs
// Seasonal overlay video routing (Merlin, Nov 27, 2026):
//   Nov 27 - Dec 24, 2026 : the early Christmas video (60 s, vertical)
//   Dec 25, 2026 - Jan 6, 2027 : the Christmas Day video (1:04, landscape)
// Thanksgiving plays Nov 26 only, on the viewer's LOCAL date.
//
// Regression: the Nov 27 Thanksgiving bug. The old Thanksgiving window
// was fixed absolute-UTC ("Thanksgiving Day across all timezones" =
// Nov 25 10:00Z -> Nov 27 12:00Z), which is still open at 07:31 UTC on
// Nov 27 — so the Thanksgiving video played first on load the morning
// of Nov 27, after the Christmas season had already begun. The routing
// is now on local calendar dates, so Nov 26 and Nov 27 can never overlap.
//
// Run: node --test tests/seasonal-overlay-video.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CHRISTMAS_EARLY_VIDEO,
  CHRISTMAS_DAY_VIDEO,
  seasonalOverlayVideo,
  thanksgivingOverlayActive,
} from '../lib/seasonal/overlay-video.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

// Local-time constructor: month is 0-based, so November is 10.
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('thanksgivingOverlayActive — Nov 26 local only, never Nov 27', () => {
  it('is active all day Nov 26, 2026', () => {
    assert.equal(thanksgivingOverlayActive(local(2026, 11, 26, 0, 0)), true);
    assert.equal(thanksgivingOverlayActive(local(2026, 11, 26, 1, 31)), true);
    assert.equal(thanksgivingOverlayActive(local(2026, 11, 26, 23, 59)), true);
  });

  it('is NOT active on Nov 27, 2026 — the bug repro time (01:31 local)', () => {
    assert.equal(thanksgivingOverlayActive(local(2026, 11, 27, 1, 31)), false);
    assert.equal(thanksgivingOverlayActive(local(2026, 11, 27, 0, 0)), false);
    assert.equal(thanksgivingOverlayActive(local(2026, 11, 27, 12, 0)), false);
  });

  it('is NOT active on Nov 25 or in other years', () => {
    assert.equal(thanksgivingOverlayActive(local(2026, 11, 25, 23, 59)), false);
    assert.equal(thanksgivingOverlayActive(local(2025, 11, 26, 12, 0)), false);
    assert.equal(thanksgivingOverlayActive(local(2027, 11, 26, 12, 0)), false);
  });
});

describe('seasonalOverlayVideo — Christmas season routing', () => {
  it('is null before the season starts (Nov 26)', () => {
    assert.equal(seasonalOverlayVideo(local(2026, 11, 26, 12, 0)), null);
  });

  it('shows the early video Nov 27 through Dec 24', () => {
    assert.equal(seasonalOverlayVideo(local(2026, 11, 27, 0, 0)), CHRISTMAS_EARLY_VIDEO);
    assert.equal(seasonalOverlayVideo(local(2026, 11, 27, 1, 31)), CHRISTMAS_EARLY_VIDEO);
    assert.equal(seasonalOverlayVideo(local(2026, 12, 1, 12, 0)), CHRISTMAS_EARLY_VIDEO);
    assert.equal(seasonalOverlayVideo(local(2026, 12, 24, 23, 59)), CHRISTMAS_EARLY_VIDEO);
  });

  it('shows the Christmas Day video Dec 25 through Jan 6', () => {
    assert.equal(seasonalOverlayVideo(local(2026, 12, 25, 0, 0)), CHRISTMAS_DAY_VIDEO);
    assert.equal(seasonalOverlayVideo(local(2026, 12, 25, 12, 0)), CHRISTMAS_DAY_VIDEO);
    assert.equal(seasonalOverlayVideo(local(2026, 12, 31, 12, 0)), CHRISTMAS_DAY_VIDEO);
    assert.equal(seasonalOverlayVideo(local(2027, 1, 1, 12, 0)), CHRISTMAS_DAY_VIDEO);
    assert.equal(seasonalOverlayVideo(local(2027, 1, 6, 23, 59)), CHRISTMAS_DAY_VIDEO);
  });

  it('is null after Twelfth Night (Jan 7+) and in other years', () => {
    assert.equal(seasonalOverlayVideo(local(2027, 1, 7, 0, 0)), null);
    assert.equal(seasonalOverlayVideo(local(2027, 1, 8, 12, 0)), null);
    assert.equal(seasonalOverlayVideo(local(2027, 11, 27, 12, 0)), null);
    assert.equal(seasonalOverlayVideo(local(2025, 12, 25, 12, 0)), null);
  });

  it('points at the two shipped videos', () => {
    assert.equal(CHRISTMAS_EARLY_VIDEO, '/videos/holidays/christmas/2026-early.mp4');
    assert.equal(CHRISTMAS_DAY_VIDEO, '/videos/holidays/christmas/2026-day.mp4');
  });
});

describe('overlay components use the local-date routing (no UTC window left)', () => {
  // Strip line comments: the header comments document the old UTC window
  // as the bug's history, so the no-UTC-window check applies to code only.
  const code = (p) => read(p).replace(/^\/\/.*$/gm, '');

  it('ChristmasOverlay imports the router and names no fixed UTC window', () => {
    const src = code('components/ChristmasOverlay.jsx');
    assert.match(src, /seasonalOverlayVideo/);
    assert.doesNotMatch(src, /WINDOW_START|WINDOW_END|2026-12-24T10:00/);
    assert.doesNotMatch(src, /year-01\.mp4/);
  });

  it('ThanksgivingOverlay imports the local-date check and names no UTC window', () => {
    const src = code('components/ThanksgivingOverlay.jsx');
    assert.match(src, /thanksgivingOverlayActive/);
    assert.doesNotMatch(src, /WINDOW_START|WINDOW_END|2026-11-25T10:00|2026-11-27T12:00/);
  });

  it('both videos exist in the repo', async () => {
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(join(repo, 'public/videos/holidays/christmas/2026-early.mp4')), true);
    assert.equal(existsSync(join(repo, 'public/videos/holidays/christmas/2026-day.mp4')), true);
  });
});
