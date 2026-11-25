// tests/mars2-compass.test.mjs
// MARS 2 COMPASS (Merlin, Nov 25, 2026 — "add a horizontal carousel
// compass to the top of the screen... when users have friends, the
// compass should allow them to travel to their friends outposts
// with compass guidance markers (their home base should be green,
// friends should be blue and tapping a blue friend marker on the
// compass should tell them which friends outpost it is as a
// minimizable overlay").
// Run: node --test tests/mars2-compass.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  wrapDeg, bearingBetween, relativeBearing, distanceBetween,
  formatDistance, compassPoint, compassMarkers, compassTicks,
} from '../lib/mars2/compass.js';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

describe('compass bearings', () => {
  it('north is -Z, east is +X, clockwise', () => {
    assert.equal(bearingBetween({ x: 0, z: 0 }, { x: 0, z: -10 }), 0);
    assert.equal(bearingBetween({ x: 0, z: 0 }, { x: 10, z: 0 }), 90);
    assert.equal(bearingBetween({ x: 0, z: 0 }, { x: 0, z: 10 }), 180);
    assert.equal(bearingBetween({ x: 0, z: 0 }, { x: -10, z: 0 }), 270);
  });

  it('relative bearing wraps to [-180, 180]', () => {
    assert.equal(relativeBearing(350, 10), 20);
    assert.equal(relativeBearing(10, 350), -20);
    assert.equal(relativeBearing(0, 180), 180);
    assert.equal(relativeBearing(180, 0), 180);
  });

  it('wrapDeg keeps -180/180 on the same side', () => {
    assert.equal(wrapDeg(540), 180);
    assert.equal(wrapDeg(-540), 180);
    assert.equal(wrapDeg(181), -179);
  });

  it('distances and formatting', () => {
    assert.equal(distanceBetween({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
    assert.equal(formatDistance(342), '342 m');
    assert.equal(formatDistance(1500), '1.5 km');
    assert.equal(compassPoint(315), 'NW');
    assert.equal(compassPoint(0), 'N');
    assert.equal(compassPoint(90), 'E');
  });
});

describe('compass markers on the strip', () => {
  const position = { x: 0, z: 0 };
  const targets = [
    { id: 'home', kind: 'home', label: 'HOME', x: 0, z: -100 },
    { id: 'friend-1', kind: 'friend', label: "Ada's outpost", x: 100, z: 0 },
    { id: 'friend-2', kind: 'friend', label: "Bo's outpost", x: 0, z: 100 },
  ];

  it('dead-ahead markers sit at the centre of the window', () => {
    const ms = compassMarkers({ headingDeg: 0, position, targets, halfWidthDeg: 60 });
    const home = ms.find((m) => m.id === 'home');
    assert.equal(home.relativeBearing, 0);
    assert.equal(home.xFrac, 0.5);
    assert.equal(home.distance, '100 m');
  });

  it('markers outside the window are flagged offscreen, not misplaced', () => {
    const ms = compassMarkers({ headingDeg: 0, position, targets, halfWidthDeg: 60 });
    const bo = ms.find((m) => m.id === 'friend-2');
    assert.equal(bo.offscreen, true);
    const ada = ms.find((m) => m.id === 'friend-1');
    assert.equal(ada.offscreen, true);
  });

  it('turning the heading brings a side marker into view', () => {
    const ms = compassMarkers({ headingDeg: 90, position, targets, halfWidthDeg: 60 });
    const ada = ms.find((m) => m.id === 'friend-1');
    assert.equal(ada.offscreen, false);
    assert.equal(ada.relativeBearing, 0);
  });

  it('ticks wrap with the heading and label the cardinals', () => {
    const ticks = compassTicks(350, 60, 15, 45);
    const north = ticks.find((t) => t.bearing === 0);
    assert.ok(north, 'north tick present near the wrap');
    assert.equal(north.label, 'N');
    assert.ok(ticks.every((t) => Math.abs(t.relativeBearing) <= 60), 'no tick outside the window');
  });
});

describe('Mars2Compass component', () => {
  const src = read('components/mars2/Mars2Compass.jsx');

  it('exports the strip height and the top offset the other controls share', () => {
    assert.ok(src.includes('MARS2_COMPASS_H_PX'), 'strip height exported');
    assert.ok(src.includes('MARS2_COMPASS_TOP_OFFSET_PX'), 'top offset exported');
    assert.match(src, /MARS2_COMPASS_H_PX = 46/, 'strip is 46 px');
    assert.match(src, /MARS2_COMPASS_TOP_OFFSET_PX = 54/, 'controls shift 54 px');
  });

  it('home is green, friends are blue', () => {
    assert.ok(src.includes("HOME_GREEN = '#9dffb0'"), 'home green');
    assert.ok(src.includes("FRIEND_BLUE = '#7fd4ff'"), 'friends blue');
  });

  it('tapping a marker names the outpost in a minimizable overlay', () => {
    assert.ok(src.includes('onSelectMarker'), 'marker tap selects');
    assert.ok(src.includes('aria-label="Minimize outpost details"'), 'minimize control');
    assert.ok(src.includes('aria-label="Close outpost details"'), 'close control');
    assert.ok(src.includes('overlayMinimized'), 'minimized chip state');
    assert.ok(src.includes('GUIDE ME THERE'), 'guide action');
  });

  it('the overlay is a sibling of the strip, not clipped inside it', () => {
    // The strip clips its overflow; an overlay inside it would be cut at 46 px.
    assert.ok(src.includes('a SIBLING of the strip'), 'sibling comment pins the layout');
    assert.ok(src.includes('role="dialog"'), 'overlay is a dialog');
  });

  it('the page shifts its top controls by the compass offset', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('MARS2_COMPASS_TOP_OFFSET_PX'), 'page imports the offset');
    assert.ok(page.includes('Mars2Compass'), 'page renders the compass');
  });

  it('the scene shifts its top pills by the same offset', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('MARS2_COMPASS_TOP_OFFSET_PX'), 'scene imports the offset');
  });

  it('the build panel shifts by the same offset', () => {
    const panel = read('components/mars2/BuildPanel.jsx');
    assert.ok(panel.includes('MARS2_COMPASS_TOP_OFFSET_PX'), 'panel imports the offset');
  });

  it('the fullscreen orb shifts via a ControlsCore offset prop', () => {
    const core = read('components/world/ControlsCore.jsx');
    assert.ok(core.includes('topOffsetPx'), 'offset prop exists');
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('topOffsetPx={MARS2_COMPASS_TOP_OFFSET_PX}'), 'page passes the offset');
  });
});
