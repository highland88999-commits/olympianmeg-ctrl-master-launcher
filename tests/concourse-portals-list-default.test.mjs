// tests/concourse-portals-list-default.test.mjs
// PORTALS 3D panel — LIST BY DEFAULT (Merlin, 2026-10-27: "the list
// form is how I want them, like list form was before, by default"):
// - the panel opens on the realm list, not the 3D orb wall
// - a clearly labeled List/3D switch in the header reaches the hall,
//   which stays intact (per-card tilt, retry fallback, wall pages)
// - list rows carry name + category, tap opens the same detail
//   (name, description, Back / Step through) the orb wall shows
// - search, pills, and counts are untouched by the view change
// - NO OVERLAPPING: rows are contained flow-layout buttons, the
//   list is the stage's single scroller, the header wraps
//
// What the list was before (history evidence): before commit
// 97d26a77 (2026-10-27, "Portal Room single view + per-card tilt")
// removed it, the panel at e064a348 had a mode toggle (header
// button) and a list branch: a scrollable grid of PortalCards with
// direct enter on tap. The restored form keeps that structure
// (header switch, scrollable list, same wallItems/search/pills,
// same caption-bar detail) but renders rows per the order — name +
// category per row, tap opens the detail instead of entering
// directly — and never renders a PortalCard grid in the panel.
//
// Static source analysis (same pattern as concourse-portals).
// Run: node --test tests/concourse-portals-list-default.test.mjs (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const panel = readFileSync(join(repo, 'components', 'ConcoursePortals.jsx'), 'utf8');

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

describe('the list view: rows, detail, no overlap', () => {
  it('the list branch renders one row per realm in the current wall', () => {
    assert.ok(panel.includes("mode === 'list' ? ("), 'list branch exists');
    assert.ok(panel.includes('wallItems.map((p) => ('), 'rows iterate the filtered wall');
  });

  it('each row shows the realm name and its category', () => {
    const list = panel.slice(panel.indexOf("mode === 'list' ? ("));
    assert.ok(list.includes('{p.title}'), 'row shows the name');
    assert.ok(list.includes('{p.section}'), 'row shows the category');
    assert.ok(list.includes('{p.subtitle}'), 'row shows the description line when present');
  });

  it('tapping a row opens the same detail the orb wall shows', () => {
    const list = panel.slice(panel.indexOf("mode === 'list' ? ("));
    assert.ok(list.includes('onClick={() => setExpandedKey(p.key)}'), 'row tap selects the realm');
    assert.ok(panel.includes('{expanded.title}'), 'caption bar shows the selected name');
    assert.ok(panel.includes('Step through'), 'caption bar keeps Step through');
    assert.ok(panel.includes('Back'), 'caption bar keeps Back');
  });

  it('rows are contained flow-layout buttons, never overlapping layers', () => {
    const rows = panel.slice(panel.indexOf('wallItems.map((p) => ('), panel.indexOf(') : glFailed ? ('));
    assert.ok(rows.includes('flex w-full items-center justify-between gap-3'), 'row is a full-width flex row');
    assert.ok(rows.includes('min-w-0'), 'text block can shrink instead of spilling');
    assert.ok(rows.includes('truncate'), 'long names/descriptions clip inside the row');
    assert.ok(rows.includes('shrink-0'), 'category label cannot be squeezed out');
    assert.ok(!rows.includes('absolute'), 'no absolutely positioned element inside the rows');
    assert.ok(!panel.includes('<PortalCard '), 'no DOM card grid in the panel');
  });

  it('the list is the stage single scroller', () => {
    const stage = panel.slice(panel.indexOf('The stage:'));
    assert.ok(stage.includes('absolute inset-0 overflow-y-auto'), 'list scrolls inside the stage');
    assert.ok(stage.includes('flex flex-col gap-2'), 'rows stack with gaps, not overlays');
  });
});

describe('search, pills, counts, and the 3D hall are untouched', () => {
  it('search and pills still drive the same wall', () => {
    assert.ok(panel.includes('placeholder="Search realms…'), 'search bar unchanged');
    assert.ok(panel.includes('Results · {wallItems.length}'), 'results chip unchanged');
    assert.ok(panel.includes('{s} · {counts.get(s)}'), 'pills still carry per-section counts');
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

  it('the Portal Room card wall is not touched by this change', () => {
    const room = readFileSync(join(repo, 'components', 'portal-room', 'PortalRoom.jsx'), 'utf8');
    assert.ok(!room.includes("useState('list')"), 'room carries no list-default state');
  });
});
