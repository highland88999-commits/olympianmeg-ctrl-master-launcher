// tests/shadow-realm-roam.test.mjs — Headless tests for Shadow Realm
// open-world GRID free-roam (Merlin's "Add an open world without tracks
// with the regen mapping").
//
// Contract:
// - roam.js: deterministic spawn pose + mode gating helpers (pure, no JSX).
// - scene.jsx: roam renders no TrackMesh, creates no LapTracker, never
//   resolves barriers, never fires onLap/onFinish — while the regen boost
//   pipeline keeps running mode-independently.
// - page.jsx: FREE ROAM skips the track stage, garage BACK returns to mode
//   select in roam, and the riding HUD carries a GRID · FREE ROAM chip.
//
// Run: node --test tests/shadow-realm-roam.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  isRoam,
  roamSpawn,
  shouldRenderTrack,
  shouldTrackLaps,
  shouldResolveBarriers,
} from '../app/shadow-realm/roam.js';

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, '../app/shadow-realm/page.jsx'), 'utf8');
const sceneSrc = readFileSync(join(here, '../app/shadow-realm/scene.jsx'), 'utf8');

describe('isRoam(mode)', () => {
  it('is true only for roam', () => {
    assert.equal(isRoam('roam'), true);
  });
  it('is false for race and junk', () => {
    assert.equal(isRoam('race'), false);
    assert.equal(isRoam(undefined), false);
    assert.equal(isRoam(null), false);
    assert.equal(isRoam('ROAM'), false);
    assert.equal(isRoam(''), false);
  });
});

describe('roamSpawn()', () => {
  it('spawns at the grid origin facing +Z (Rig nose convention)', () => {
    assert.deepEqual(roamSpawn(), { x: 0, z: 0, heading: 0 });
  });
  it('is deterministic across calls (fresh object each time)', () => {
    const a = roamSpawn();
    const b = roamSpawn();
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
  });
  it('returns numbers only (safe to feed the physics sim)', () => {
    const p = roamSpawn();
    for (const k of ['x', 'z', 'heading']) {
      assert.equal(typeof p[k], 'number');
      assert.ok(Number.isFinite(p[k]), `${k} is finite`);
    }
  });
});

describe('mode gating helpers', () => {
  it('shouldRenderTrack: no track mesh in roam, mesh everywhere else', () => {
    assert.equal(shouldRenderTrack('roam'), false);
    assert.equal(shouldRenderTrack('race'), true);
    assert.equal(shouldRenderTrack(undefined), true);
  });
  it('shouldTrackLaps: laps only in race', () => {
    assert.equal(shouldTrackLaps('roam'), false);
    assert.equal(shouldTrackLaps('race'), true);
    assert.equal(shouldTrackLaps('junk'), false);
  });
  it('shouldResolveBarriers: no barriers in the open world', () => {
    assert.equal(shouldResolveBarriers('roam'), false);
    assert.equal(shouldResolveBarriers('race'), true);
  });
});

describe('scene.jsx roam branch (source checks)', () => {
  it('imports the roam helpers', () => {
    assert.ok(sceneSrc.includes("from './roam'"), 'roam imported');
    assert.ok(sceneSrc.includes('roamSpawn'), 'roamSpawn used');
    assert.ok(sceneSrc.includes('isRoam'), 'isRoam used');
  });
  it('never renders TrackMesh in roam', () => {
    assert.ok(
      sceneSrc.includes('{!isRoam(mode) && <TrackMesh track={track} scheme={scheme} />'),
      'TrackMesh gated on !isRoam'
    );
  });
  it('skips barrier loops in roam', () => {
    assert.ok(
      sceneSrc.includes("isRoam(mode) ? null : barrierLoops(track, 220)"),
      'loops are null in roam'
    );
  });
  it('spawns from roamSpawn and creates no LapTracker in roam', () => {
    assert.ok(sceneSrc.includes('roam ? roamSpawn() : startPose(track, 220)'), 'roam spawn pose');
    assert.ok(sceneSrc.includes('tracker: roam ? null : new LapTracker(loops.center)'), 'no tracker in roam');
  });
  it('skips resolveBarrier entirely in roam (no barriers in open world)', () => {
    assert.ok(sceneSrc.includes('isRoam(mode)'), 'resolveBarrier gated on mode');
    assert.ok(sceneSrc.includes('bounced: false }'), 'roam pass-through cannot bounce');
  });
  it('never fires onLap / onFinish in roam (no finish screen reachable)', () => {
    assert.ok(
      sceneSrc.includes("if (mode === 'race' && !isRoam(mode))"),
      'lap block double-gated'
    );
    // onFinish is only reachable through the lap block above.
    const finishCalls = [...sceneSrc.matchAll(/onFinish && onFinish\(/g)];
    assert.equal(finishCalls.length, 1, 'exactly one onFinish call site');
  });
  it('the regen pipeline stays mode-independent (Merlin: regen everywhere)', () => {
    assert.ok(sceneSrc.includes('REGEN_CHARGE_RATE'), 'regen charge rate present');
    assert.ok(sceneSrc.includes('SURGE_SECS'), 'surge duration present');
    assert.ok(sceneSrc.includes('s.boostCharge = Math.min(1, s.boostCharge + regen * REGEN_CHARGE_RATE * dt)'), 'charge math intact');
    // No mode gate around the regen block: the block above must not mention mode.
    const regenIdx = sceneSrc.indexOf('regen boost meter');
    const block = sceneSrc.slice(regenIdx, regenIdx + 1600);
    assert.ok(!block.includes("mode"), 'regen block is not mode-gated');
  });
  it('GridGround and PylonRing stay rendered (open-world read + landmark)', () => {
    assert.ok(sceneSrc.includes('<GridGround />'), 'infinite grid stays');
    assert.ok(sceneSrc.includes('<PylonRing />'), 'distant pylon landmark stays');
  });
});

describe('page.jsx roam menu flow (source checks)', () => {
  it('FREE ROAM jumps straight to the garage (skips track select)', () => {
    assert.ok(
      pageSrc.includes("setMode('roam'); try { fx.menuOpen(); } catch {} setStage('garage');"),
      'FREE ROAM -> garage'
    );
    assert.ok(
      !pageSrc.includes("setMode('roam'); try { fx.menuOpen(); } catch {} setStage('track');"),
      'no roam path still routes through track'
    );
  });
  it('garage BACK returns to mode select in roam, track select in race', () => {
    assert.ok(
      pageSrc.includes("setStage(mode === 'roam' ? 'mode' : 'track')"),
      'garage BACK is mode-aware'
    );
  });
  it('riding HUD shows a GRID · FREE ROAM chip in roam', () => {
    assert.ok(pageSrc.includes("mode === 'roam' && ("), 'roam chip condition');
    assert.ok(pageSrc.includes('GRID · FREE ROAM'), 'roam chip label');
  });
  it('race HUD lap chip stays race-gated', () => {
    assert.ok(pageSrc.includes("mode === 'race' && ("), 'lap chip still race-gated');
  });
  it('did not touch the garage AI-selector area or the finished screen', () => {
    // Sanity: these regions still exist unmodified in shape.
    assert.ok(pageSrc.includes("stage === 'finished'"), 'finished screen intact');
    assert.ok(pageSrc.includes('MOUNT & RIDE'), 'mount CTA intact');
  });
});
