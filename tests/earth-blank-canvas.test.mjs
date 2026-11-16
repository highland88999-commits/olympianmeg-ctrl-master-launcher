// Black-ground guard, video era (Merlin, 2026-10-29, reworked
// 2026-11-15): the old guard sampled a 2D canvas for paint
// because iOS could reclaim a canvas backing store without
// drawImage throwing, so a build "succeeded" with a blank canvas
// and mounted a black sheet — which then defeated the coverage
// check AND the rendered-record dedup, so the ground stayed black
// forever.
//
// 2026-11-15 (Merlin — tiles no longer render): there is no
// canvas, no build, no sheet, no finish() and no record any
// more. The ground is one prerendered sphere wearing the
// looping video; the failure mode the guard protected against
// (a black ground that never recovers) is gone with the build
// that could produce it. What remains, pinned here: NexusEarth
// carries no build gate, no per-sheet failure branch and no
// record call; the prerender renders nothing when the texture
// is missing instead of mounting black ground; and the video
// module still reports a load failure at the lib level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('components/NexusEarth.jsx', 'utf8');
const prerender = readFileSync('components/earth/PrerenderedEarthGround.jsx', 'utf8');
const groundVideo = readFileSync('lib/earth/ground-video.js', 'utf8');

test('no finish() build gate remains in NexusEarth', () => {
  assert.doesNotMatch(src, /onGroundVideoReady/);
  assert.doesNotMatch(src, /groundVideoHasError/);
  assert.doesNotMatch(src, /startLensBuild/);
});

test('a missing texture renders nothing (no black sheet)', () => {
  assert.match(prerender, /if \(!material\) return null/);
});

test('no canvas guard remains (no canvas, no getImageData, no okCount)', () => {
  assert.doesNotMatch(src, /canvasIsBlank/);
  assert.doesNotMatch(src, /getImageData/);
  assert.doesNotMatch(src, /okCount/);
  assert.doesNotMatch(prerender, /canvasIsBlank/);
});

test('no rendered record runs from the ground path', () => {
  assert.doesNotMatch(src, /recordRenderedTileKey/);
  assert.doesNotMatch(prerender, /recordRenderedTileKey/);
});

test('the video module still reports a load failure (lib level)', () => {
  assert.match(groundVideo, /export function groundVideoHasError/);
  assert.match(groundVideo, /groundVideoError = true/);
});
