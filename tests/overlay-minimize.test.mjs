// tests/overlay-minimize.test.mjs
// Regression tests for Merlin's bug report 2026-10-22 (Hub, ?enter=earth):
//   "CSS overlay issue. The controls are not minimizing. Concourse
//    should be able to be moved to any place on the screen by any
//    user. The planetary information window is also not minimizable."
//
// Root causes pinned here:
//   1. EarthConsole — the minimize button lived INSIDE the card's
//      scroll surface (it scrolled out of reach on a phone), and an
//      effect force-reopened the console whenever a dive/travel
//      phase began, overriding the user's minimize.
//   2. Concourse — the glass box was welded to the Orb anchor; only
//      the Orb could move (2s hold). The box itself now drags by
//      its title bar and remembers its spot per account.
//   3. MarsConsole — the planetary (world profile) information
//      window had no minimize control at all; neither did its dock.
//
// Run: node --test tests/overlay-minimize.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const earth = read('components/EarthConsole.jsx');
const concourse = read('components/Concourse.jsx');
const panel = read('components/ConcoursePortals.jsx');
const mars = read('components/MarsConsole.jsx');
const uiState = read('app/api/ui-state/route.js');

describe('EarthConsole minimize (controls)', () => {
  it('the busy effect no longer force-reopens the console', () => {
    assert.ok(!earth.includes('if (busy) setMin(false)'), 'auto-reopen effect must stay gone');
  });

  it('the minimized globe still signals travel instead of reopening', () => {
    assert.ok(earth.includes("busy ? 'animate-pulse' : ''"), 'globe pulses while busy');
    assert.ok(earth.includes("aria-label={busy ? 'Open Earth console (traveling)' : 'Open Earth console'}"));
  });

  it('the header (with minimize) is pinned OUTSIDE the scroll body', () => {
    const headerAt = earth.indexOf('shrink-0 border-b border-zinc-800');
    const scrollAt = earth.indexOf('overflow-y-auto custom-scrollbar');
    const minimizeAt = earth.indexOf('aria-label="Minimize Earth console"');
    assert.ok(headerAt >= 0, 'pinned header present');
    assert.ok(scrollAt > headerAt, 'scroll body starts after the pinned header');
    assert.ok(minimizeAt > headerAt && minimizeAt < scrollAt, 'minimize button lives in the pinned header');
  });

  it('still exactly one scroll surface and the swim gates stay in both branches', () => {
    const code = earth.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    assert.equal((code.match(/overflow-y-auto/g) || []).length, 1);
    assert.equal((earth.match(/swimUi\.active && !sizeUi\.micro/g) || []).length, 2);
  });
});

describe('The merged Concourse menu (Nov 18, 2026: the box is the portal menu now)', () => {
  it('the Orb opens the merged menu (portal panel first)', () => {
    assert.ok(concourse.includes('setPortal3dOpen(true)'), 'the Orb opens the merged menu');
    assert.ok(!concourse.includes('setOpen((o) => !o)'), 'the Orb no longer toggles the old box');
  });

  it('the merged dialog closes from its header — the Orb reopens it', () => {
    assert.ok(panel.includes('aria-label="Close Portals"'), 'header close button');
    assert.ok(panel.includes('onClick={handleClose}'), 'close returns to the hub scene');
  });

  it('the box drag engine and box position retired with the box', () => {
    assert.ok(!concourse.includes('beginBoxDrag'), 'no box drag handler');
    assert.ok(!concourse.includes('boxFrac'), 'no box position state');
  });

  it('the server validates concourse_box like concourse_orb', () => {
    assert.ok(uiState.includes("if ('concourse_box' in prefs)"));
    assert.ok(uiState.includes('patch.concourse_box = sane'));
  });
});

describe('MarsConsole planetary information window', () => {
  it('the world profile panel can minimize to a chip and return', () => {
    assert.ok(mars.includes('aria-label="Minimize world information"'));
    assert.ok(mars.includes('aria-label="Show world information"'));
    assert.ok(mars.includes("localStorage.getItem('mars-world-minimized')"), 'choice remembered');
  });

  it('the control dock can minimize to a chip and return', () => {
    assert.ok(mars.includes('aria-label="Minimize Mars controls"'));
    assert.ok(mars.includes('aria-label="Show Mars controls"'));
    assert.ok(mars.includes("localStorage.getItem('mars-dock-minimized')"), 'choice remembered');
  });

  it('the realm exit survives both minimize paths', () => {
    assert.ok(mars.includes('onClick={onExit}'), 'return to orbit untouched');
    assert.ok(mars.includes('<TouchControls inputRef={inputRef} fly={mode === \'fly\'} />'), 'touch controls untouched');
  });
});
