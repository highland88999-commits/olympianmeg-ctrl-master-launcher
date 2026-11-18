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
    // The lap block and the bump battle are both gated off roam: roam is
    // the pure open world — no laps, no flame, no eliminations.
    assert.ok(
      sceneSrc.includes('!isRoam(mode)'),
      'lap + bump blocks gated off roam'
    );
    assert.ok(
      sceneSrc.includes('isBumpTrack(track) && !isRoam(mode)'),
      'bump mode requires a bump track AND a non-roam mode'
    );
    // onFinish is reachable through the lap block and the bump last-
    // standing block only — neither fires in roam.
    const finishCalls = [...sceneSrc.matchAll(/onFinish && onFinish\(/g)];
    assert.equal(finishCalls.length, 2, 'lap-complete + bump-win call sites');
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
    // The handler now also normalizes a stale bump trackKey (video bug hunt
    // 2026-10-03: roam + bump track was an impossible broken state), but the
    // flow is unchanged: roam -> garage, never through track select.
    assert.ok(
      pageSrc.includes("setMode('roam');") && pageSrc.includes("setStage('garage');"),
      'FREE ROAM -> garage'
    );
    assert.ok(
      !pageSrc.includes("setMode('roam'); try { fx.menuOpen(); } catch {} setStage('track');"),
      'no roam path still routes through track'
    );
  });
  it('garage BACK returns to mode select in roam/bump, track select in race', () => {
    assert.ok(
      pageSrc.includes("setStage(mode === 'roam' || mode === 'bump' ? 'mode' : 'track')"),
      'garage BACK is mode-aware (roam + bump skip the track picker)'
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

describe('endless grid (Merlin, Nov 18, 2026 — no edge)', () => {
  it('chunk law: floors for negatives, ring is centre-first, 5x5 at radius 2', async () => {
    const m = await import('../app/shadow-realm/roam.js');
    assert.deepEqual(m.gridChunkFor(-1, -1), { cx: -1, cz: -1 });
    assert.deepEqual(m.gridChunkFor(400, 400), { cx: 1, cz: 1 });
    assert.equal(m.gridChunkKey(2, -3), '2,-3');
    assert.deepEqual(m.gridChunkBounds(1, -1), { x0: 400, z0: -400, x1: 800, z1: 0 });
    assert.equal(m.GRID_CHUNK_M, 400);
    assert.equal(m.GRID_STREAM_CHUNK_COUNT, 25);
    const ring = m.gridChunksAround(0, 0);
    assert.equal(ring.length, 25);
    assert.deepEqual({ cx: ring[0].cx, cz: ring[0].cz }, { cx: 0, cz: 0 });
    const far = m.gridChunksAround(5000, -5000);
    assert.equal(far[0].cx, 12);
    assert.equal(far[0].cz, -13);
    const d = m.gridChunkSetDiff(
      m.gridChunksAround(0, 0).map((c) => c.key),
      m.gridChunksAround(2000, 0).map((c) => c.key)
    );
    assert.ok(d.load.length > 0 && d.drop.length > 0);
  });
  it('scene streams the ground in chunks around the camera (no fixed plane)', () => {
    assert.ok(!sceneSrc.includes('planeGeometry args={[2400, 2400]}'), 'fixed 2400 m plane is gone');
    assert.ok(sceneSrc.includes('gridChunksAround(camera.position.x, camera.position.z)'), 'ring follows the camera');
    assert.ok(sceneSrc.includes('buildGridChunk'), 'per-chunk builder present');
    assert.ok(sceneSrc.includes('GRID_CHUNK_M'), 'chunk size from roam law');
    // The old grid colours survive per chunk: 20 m fine + 100 m coarse.
    assert.ok(sceneSrc.includes("GRID_CHUNK_M / 20"), 'fine grid 20 m cells');
    assert.ok(sceneSrc.includes("GRID_CHUNK_M / 100"), 'coarse grid 100 m cells');
    assert.ok(sceneSrc.includes("'#1e4d8f'"), 'fine grid colour kept');
    assert.ok(sceneSrc.includes("'#2f6fd0'"), 'coarse grid colour kept');
  });
  it('the night sky follows the camera (no 1500 m dome edge to ride out of)', () => {
    assert.ok(sceneSrc.includes('groupRef.current.position.set(camera.position.x, 0, camera.position.z)'), 'sky rides with the camera');
  });
  it('race mode is untouched: barrier walls + track mesh + laps all still gated as before', () => {
    assert.ok(sceneSrc.includes('barrier walls — translucent blue glass'), 'race walls stay');
    assert.ok(sceneSrc.includes('resolveBarrier'), 'barrier resolution stays');
    assert.ok(sceneSrc.includes('new LapTracker(loops.center)'), 'lap tracker stays');
    assert.ok(sceneSrc.includes('{!isRoam(mode) && <TrackMesh track={track} scheme={scheme} />}'), 'track mesh gating unchanged');
  });
});
