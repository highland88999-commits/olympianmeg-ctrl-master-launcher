// tests/portal-flat-grid.test.mjs
// The flat portal grid (Merlin, Nov 18, 2026 — "I don't want the
// 3d version of portals as seen in the video"): the 3D hall is
// gone; the menu is a flat 2D grid, 3 across, one circular video
// face per portal with the destination name in BOLD underneath.
// A tap sucks the user into the video fullscreen; the portal
// system engages when the video finishes — never before, never
// via a skip button. Portals with no video (earth-2, mars-moon)
// keep the swirl by design.
//
// Static pins (the grid/overlay are JSX — node reads their
// sources) plus the live portalHasVideo truth. The headless probe
// (not this suite) watches a real tap play a real video to its
// end and then travel.
//
// Run: node --test tests/portal-flat-grid.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { portalHasVideo } from '../lib/portal-videos.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const grid = read('components/concourse/PortalFlatGrid.jsx');
const suck = read('components/concourse/PortalSuckOverlay.jsx');
const panel = read('components/ConcoursePortals.jsx');

describe('flat, not 3D', () => {
  it('the 3D hall file is gone and nothing mounts it', () => {
    assert.ok(!existsSync(join(repo, 'components', 'concourse', 'PortalHallScene.jsx')), 'hall file deleted');
    assert.ok(!panel.includes('PortalHallScene'), 'panel never references the hall');
    assert.ok(!grid.includes('three'), 'the grid never touches three.js');
    assert.ok(!grid.includes('THREE'), 'no THREE namespace in the grid');
    assert.ok(!suck.includes('THREE'), 'no THREE namespace in the overlay');
    assert.ok(!panel.includes('probeWebGL'), 'no WebGL probe anywhere in the menu');
  });

  it('the grid is plain DOM: buttons, not a canvas', () => {
    assert.ok(grid.includes('<button'), 'each portal is a real button');
    assert.ok(!grid.includes('<Canvas'), 'no react-three-fiber canvas');
    assert.ok(!grid.includes('useFrame'), 'no frame loop');
  });
});

describe('3 across, bigger faces, bold name underneath', () => {
  it('FLAT_GRID_COLS is 3 — Merlin\'s call ("Maybe 3")', () => {
    assert.ok(grid.includes('export const FLAT_GRID_COLS = 3'), '3 across, exported');
    assert.ok(grid.includes('grid-cols-3'), 'three columns in the layout');
  });

  it('faces are big circles, not the wall\'s tiny discs', () => {
    assert.ok(grid.includes('aspect-square'), 'faces are square');
    assert.ok(grid.includes('rounded-full'), 'faces are circles');
    assert.ok(grid.includes('max-w-[148px]'), 'faces cap at 148 px on desktop');
    assert.ok(grid.includes('w-full'), 'faces fill their column on a phone');
  });

  it('the destination name sits in BOLD under each face', () => {
    assert.ok(grid.includes('font-bold'), 'the name is bold');
    assert.ok(grid.includes('{item.title}'), 'the name is the destination title');
    // The face span comes before the name span inside the button —
    // the name is UNDER the face, never over it.
    assert.ok(grid.indexOf('data-face') < grid.indexOf('{item.title}'), 'face first, name under it');
    assert.ok(grid.includes('text-center'), 'the name is centred under its face');
    assert.ok(grid.includes('truncate'), 'a long name truncates instead of overlapping its neighbours');
  });

  it('the grid scrolls vertically and caps its width on desktop', () => {
    assert.ok(grid.includes('max-w-[520px]'), 'grid caps at 520 px');
    assert.ok(panel.includes('overflow-y-auto'), 'the panel stage scrolls vertically');
    assert.ok(grid.includes('gap-y-5'), 'rows breathe — no overlap between a name and the next row\'s face');
  });
});

describe('click = sucked into the video', () => {
  it('a tap measures the tapped face and opens the fullscreen overlay from it', () => {
    assert.ok(grid.includes('getBoundingClientRect()'), 'the face rect is measured');
    assert.ok(grid.includes('onTap(item,'), 'tap hands program + rect to the panel');
    assert.ok(panel.includes('setSucking({ program, rect })'), 'the panel opens the suck-in');
    assert.ok(suck.includes('fromRect'), 'the overlay starts at the tapped rect');
    assert.ok(suck.includes('ZOOM_MS'), 'the zoom is timed — a suck-in, not a hard cut');
    assert.ok(suck.includes('borderRadius'), 'the circle face morphs into the fullscreen frame');
  });

  it('the fullscreen video plays once, to its end', () => {
    assert.ok(suck.includes('autoPlay'), 'the video starts itself');
    assert.ok(suck.includes('muted'), 'muted');
    assert.ok(suck.includes('playsInline'), 'inline');
    assert.ok(suck.includes('object-cover'), 'the video fills the screen');
    assert.ok(!suck.includes('loop'), 'plays ONCE — it must end for travel to engage');
    assert.ok(suck.includes('/videos/portals/'), 'the fullscreen video is the portal\'s own video');
  });
});

describe('travel engages on video end — and NOT before', () => {
  it('onEnded is the travel trigger, guarded to fire exactly once', () => {
    assert.ok(suck.includes('onEnded={engage}'), 'video end engages travel');
    assert.ok(suck.includes('doneRef'), 'a once-guard');
    assert.ok(suck.includes('if (doneRef.current) return;'), 'the guard returns early on a second call');
    assert.ok(panel.includes('handleSuckDone'), 'the panel engages travel from the overlay');
  });

  it('there is no skip button and no early travel path', () => {
    assert.ok(!suck.includes('Skip'), 'no skip button — the video runs to its end (per brief)');
    assert.ok(!suck.includes('onClick'), 'nothing clickable in the overlay ends the video early');
  });

  it('a failed or stalled video still travels — never stranded', () => {
    assert.ok(suck.includes('onError={engage}'), 'a video that fails to load still travels');
    assert.ok(suck.includes('STALL_SLACK_MS'), 'a stalled video still travels');
    assert.ok(suck.includes('onLoadedMetadata'), 'the timeout re-arms from the real length');
  });

  it('Esc cancels before travel; reduced motion travels at once with no video', () => {
    assert.ok(suck.includes("'Escape'"), 'Esc cancels');
    assert.ok(suck.includes('onCancel'), 'cancel returns to the grid');
    assert.ok(suck.includes('if (reduced) return null;'), 'no overlay under reduced motion');
    assert.ok(panel.includes('enterProgram(program)'), 'travel is the existing enterProgram');
  });
});

describe('earth-2 still wears the swirl (by design)', () => {
  it('earth-2 has no portal video — none invented', () => {
    assert.equal(portalHasVideo('earth-2'), false, 'signed-in portal has no portal video');
    // The Red Moon's video arrived Nov 18, 2026 (the Concourse
    // merge video run) — it no longer waits. earth-2 is now the
    // only portal that wears the swirl.
    assert.equal(portalHasVideo('mars-moon'), true, 'the Red Moon has its video now');
    assert.equal(portalHasVideo('no-such-key'), false, 'unknown keys have no video');
  });

  it('the grid and the overlay both fall back to the shared swirl', () => {
    assert.ok(grid.includes('portalHasVideo(item.key)'), 'the grid gates on video presence');
    assert.ok(grid.includes('getSwirlDataUrl'), 'the grid face falls back to the swirl');
    assert.ok(suck.includes('portalHasVideo(program.key)'), 'the overlay gates on video presence');
    assert.ok(suck.includes('NO_VIDEO_BEAT_MS'), 'the swirl holds fullscreen for a beat, then travel');
    assert.ok(suck.includes('getSwirlDataUrl'), 'the overlay face is the shared swirl');
  });
});

describe('video-element discipline (from the wall-videos round, kept flat)', () => {
  it('only the current page ever holds video elements', () => {
    assert.ok(panel.includes('pageItems'), 'the panel hands one page to the grid');
    assert.ok(grid.includes('pageItems.map'), 'the grid renders exactly that page');
    assert.ok(grid.includes("removeAttribute('src')"), 'unmount unloads the video');
  });

  it('starts are staggered and the tab-hide pause survives', () => {
    assert.ok(grid.includes('VIDEO_START_STAGGER_MS'), '120 ms stagger');
    assert.ok(grid.includes('visibilitychange'), 'pause on tab-hide');
    assert.ok(grid.includes('document.hidden'), 'hidden-tab check before resuming');
  });

  it('reduced motion keeps the first frame, unmoving', () => {
    assert.ok(grid.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'the grid checks reduced motion');
    assert.ok(grid.includes('gridStill'), 'a still face is marked so it never resumes playing');
  });
});
