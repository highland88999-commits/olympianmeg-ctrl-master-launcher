// tests/concourse-portals-list-default.test.mjs
// PORTALS 3D panel — LIST BY DEFAULT, AS THE MERGED MENU, MINI
// (Merlin, 2026-10-27: "the list form is how I want them, like list
// form was before, by default"; refined 2026-10-28: "how it is in
// the first menu is how it should be in the second version, just a
// little smaller (like a mini version)"; Nov 16, 2026 merge: the
// first menu — the 2D Portal Room — is gone, and this panel IS the
// one menu now):
//
// - the panel opens on the list, not the 3D orb wall
// - a clearly labeled List/3D switch in the header reaches the hall,
//   which stays intact (per-card tilt, retry fallback, wall pages)
// - the list is a mini version of the merged menu: the very
//   same PortalCard (arched frame, artwork, title + subtitle under
//   it), grouped under the section headers, in a two-column
//   grid scaled down to the panel — NOT plain text rows, and NOT a
//   new card design
// - tapping a mini card opens the same detail (name, description,
//   Back / Step through) the orb wall shows — never enter-directly
// - search, pills, and counts are untouched by the view change
// - NO OVERLAPPING: the grid is flow layout, the list is the
//   stage's single scroller, the header wraps
//
// Static source analysis (same pattern as concourse-portals).
// Run: node --test tests/concourse-portals-list-default.test.mjs (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const panel = readFileSync(join(repo, 'components', 'ConcoursePortals.jsx'), 'utf8');
const card = readFileSync(
  join(repo, 'components', 'portal', 'PortalCard.jsx'),
  'utf8'
);

describe('PORTALS 3D panel opens on the list by default', () => {
  it('the default view is the list', () => {
    assert.ok(panel.includes("useState('list')"), 'mode state defaults to list');
  });

  it('opening the panel resets the view to the list', () => {
    const reset = panel.slice(panel.indexOf("useState('list')"));
    assert.ok(reset.includes('if (open) setMode('), 'mode resets when the panel opens');
    assert.ok(reset.includes("setMode('list')"), 'the reset lands on the list');
  });

  it('the header carries a clearly labeled List/3D switch', () => {
    assert.ok(panel.includes('aria-label="View"'), 'switch has a View group label');
    assert.ok(panel.includes("aria-pressed={mode === 'list'}"), 'List button tracks list mode');
    assert.ok(panel.includes("aria-pressed={mode === '3d'}"), '3D button tracks 3D mode');
    assert.ok(panel.includes("onClick={() => setMode('list')}"), 'List button selects the list');
    assert.ok(panel.includes("onClick={() => setMode('3d')}"), '3D button selects the hall');
  });

  it('the header wraps so title + switch + close never collide on narrow phones', () => {
    assert.ok(
      panel.includes('flex flex-wrap items-center justify-between gap-2 px-5 pt-4'),
      'header row wraps instead of clipping'
    );
  });
});

describe('the list view: the merged menu, mini', () => {
  it('the list branch renders the room cards, grouped by section', () => {
    assert.ok(panel.includes("mode === 'list' ? ("), 'list branch exists');
    assert.ok(panel.includes('groupBySection(listItems)'), 'list groups the filtered list');
    assert.ok(panel.includes('<PortalCard'), 'list renders the room cards');
    assert.ok(
      panel.includes("from '@/lib/portal-roster'") && panel.includes('groupBySection,'),
      'grouping comes from the shared roster'
    );
  });

  it('the mini grid is two columns under section headers, like the room', () => {
    const list = panel.slice(panel.indexOf("mode === 'list' ? ("));
    assert.ok(list.includes('grid grid-cols-2'), 'two-column grid');
    assert.ok(list.includes('<h2'), 'section header per group');
    assert.ok(list.includes('{s}'), 'header carries the section name');
  });

  it('the mini cards are the room cards, not a new design', () => {
    assert.ok(card.includes('portal-arch'), 'card keeps the arched frame');
    assert.ok(card.includes('aspect-[3/4]'), 'card keeps the room proportions');
    assert.ok(card.includes('/videos/portals/'), 'card keeps the room artwork source');
    assert.ok(card.includes('portal-swirl'), 'card keeps the swirl fallback');
    assert.ok(card.includes('{program.title}'), 'card keeps the title under the frame');
    assert.ok(card.includes('{program.subtitle}'), 'card keeps the subtitle under the frame');
  });

  it('tapping a mini card opens the same detail the orb wall shows', () => {
    const list = panel.slice(panel.indexOf("mode === 'list' ? ("));
    assert.ok(
      list.includes('onEnter={() => setExpandedKey(p.key)}'),
      'card tap selects the realm instead of entering directly'
    );
    assert.ok(panel.includes('{expanded.title}'), 'caption bar shows the selected name');
    assert.ok(panel.includes('Step through'), 'caption bar keeps Step through');
    assert.ok(panel.includes('Back'), 'caption bar keeps Back');
  });

  it('the selected mini card is highlighted, and its label names viewing', () => {
    const list = panel.slice(panel.indexOf("mode === 'list' ? ("));
    assert.ok(list.includes('selected={expandedKey === p.key}'), 'selected card is flagged');
    assert.ok(list.includes('ariaLabel={`View ${p.title}`}'), 'card label says View, not Enter');
    assert.ok(card.includes('selected = false'), 'selected defaults off for the room');
    assert.ok(card.includes('border-amber-300/70'), 'selected card wears the amber frame');
    assert.ok(card.includes('ariaLabel = null'), 'aria label defaults off for the room');
  });

  it('the mini grid is contained flow layout on the stage single scroller', () => {
    const list = panel.slice(panel.indexOf("mode === 'list' ? ("), panel.indexOf(') : glFailed ? ('));
    assert.ok(list.includes('grid grid-cols-2'), 'grid is flow layout, not overlays');
    const scrollers = (list.match(/overflow-y-auto/g) || []).length;
    assert.equal(scrollers, 1, 'exactly one scroller in the list branch');
    assert.ok(list.includes('gap-x-3 gap-y-5'), 'cards sit in gutters, never overlapping');
  });
});

describe('search, pills, counts, and the 3D hall are untouched', () => {
  it('search and pills still drive the same wall', () => {
    assert.ok(panel.includes('placeholder="Search realms…'), 'search bar unchanged');
    assert.ok(panel.includes('Results · {resultsCount}'), 'results chip unchanged');
    assert.ok(panel.includes('`${s} · ${counts.get(s)}`'), 'pills still carry per-section counts');
    assert.ok(panel.includes('{programs.length} realms'), 'header count unchanged');
  });

  it('the 3D hall is still reachable and intact', () => {
    assert.ok(panel.includes('<PortalHallScene'), 'hall still renders in 3D mode');
    assert.ok(panel.includes("onTap={(program) => setExpandedKey(program.key)}"), 'hall taps still select');
    assert.ok(panel.includes('Retry 3D'), 'WebGL retry fallback still exists in 3D mode');
    assert.ok(panel.includes('onGlFail'), 'context loss still reported');
  });

  it('wall pages only appear in 3D mode — the list shows every match', () => {
    assert.ok(
      panel.includes("mode === '3d' && !glFailed && pages.length > 1"),
      'page dots are gated to 3D mode'
    );
  });

  it('the 2D room is gone; the shared cards moved to components/portal/', () => {
    assert.ok(!existsSync(join(repo, 'components', 'portal-room', 'PortalRoom.jsx')), 'room file deleted');
    assert.ok(!existsSync(join(repo, 'app', 'portal-room', 'page.jsx')), 'room route deleted');
    assert.ok(panel.includes("from './portal/PortalCard'"), 'panel imports the moved card');
    assert.ok(panel.includes("from './portal/PortalEnterOverlay'"), 'panel imports the moved step-through');
    assert.ok(card.includes('portal-arch'), 'moved card keeps the arched frame');
  });
});
