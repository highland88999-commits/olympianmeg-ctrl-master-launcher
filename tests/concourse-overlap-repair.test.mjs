// tests/concourse-overlap-repair.test.mjs
// CSS-overlap sweep (Merlin, 2026-10-27 — NO OVERLAPPING, flow layouts):
// the regular PORTALS flow (Concourse menu -> PORTALS god menu) and the
// Concourse panel itself must not let rows, badges, headers, or page
// content paint over each other on a phone-width viewport.
//
// Static source analysis (same pattern as program-menu-fullscreen).
// Run: node --test tests/concourse-overlap-repair.test.mjs (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const concourse = readFileSync(join(repo, 'components', 'Concourse.jsx'), 'utf8');
const doomsday = readFileSync(join(repo, 'components', 'DoomsdayBanner.jsx'), 'utf8');
const page = readFileSync(join(repo, 'app', 'page.jsx'), 'utf8');
const satellite = readFileSync(join(repo, 'components', 'SatelliteMenu.jsx'), 'utf8');

describe('Concourse panel: no bleed-through on phones', () => {
  it('tile badges stay inside their tile (no negative top/right offset)', () => {
    assert.ok(!concourse.includes('-top-1.5 -right-1.5'), 'no badge sticks out of its tile');
    assert.ok(concourse.includes('top-1.5 right-1.5'), 'badges sit inside the tile corner');
  });

  it('panel spans the viewport width on narrow screens', () => {
    assert.ok(
      concourse.includes('viewport.w - 20'),
      'phone panel width derives from the viewport, not the fixed 282px box'
    );
  });

  it('panel background is solid on phones so the page cannot ghost through', () => {
    assert.ok(
      concourse.includes("isPhone ? 'bg-zinc-950' : 'bg-zinc-950/55'"),
      'phone panel uses a solid background'
    );
  });
});

describe('Doomsday strip: no clipping on narrow panels', () => {
  it('strip row wraps instead of overflowing its clipped container', () => {
    const strip = doomsday.slice(doomsday.indexOf('export function DoomsdayStrip'));
    assert.ok(strip.includes('flex flex-wrap'), 'strip text wraps to a second line when narrow');
  });
});

describe('PORTALS god menu: a single scroller, no nested scroll', () => {
  it('menu overlay wrapper does not scroll on its own', () => {
    const overlay = page.slice(page.indexOf('{isMenuExpanded ? ('));
    const wrapper = overlay.slice(0, overlay.indexOf('<SatelliteMenu'));
    assert.ok(!wrapper.includes('overflow-y-auto'), 'outer wrapper is not a second scroller');
  });

  it('SatelliteMenu takes the remaining height so its list is the only scroller', () => {
    assert.ok(page.includes('<div className="flex-1 min-h-0">'), 'menu sits in a flex-1 wrapper');
    assert.ok(satellite.includes('flex-1 overflow-y-auto'), 'menu items list still scrolls internally');
  });

  it('pinned menu header is solid and edge-aligned (no ghosting, no overhang)', () => {
    assert.ok(!satellite.includes('-mx-1 shrink-0'), 'header no longer sticks out past the rows');
    assert.ok(satellite.includes('shrink-0 bg-zinc-950 px-1 pb-2'), 'header background is solid');
  });
});
