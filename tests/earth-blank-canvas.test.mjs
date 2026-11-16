// Black-ground guard, video era (Merlin, 2026-10-29, reworked
// 2026-11-15): the old guard sampled a 2D canvas for paint
// because iOS could reclaim a canvas backing store without
// drawImage throwing, so a build "succeeded" with a blank canvas
// and mounted a black sheet — which then defeated the coverage
// check AND the rendered-record dedup, so the ground stayed black
// forever. There is no canvas any more — the ground is one
// looping video — so the failure mode is now a video that fails
// to load. finish() must treat a failed video as a failed build:
// no sheet, no record, so the 10 s reconciler retries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('components/NexusEarth.jsx', 'utf8');

test('finish() checks the video for error before calling a build good', () => {
  assert.match(src, /else if \(groundVideoHasError\(\)\) \{/);
});

test('a failed video fails the build (no black sheet, no record)', () => {
  const failStart = src.indexOf('} else if (groundVideoHasError()) {');
  assert.notEqual(failStart, -1, 'the failed-video branch is missing');
  const failEnd = src.indexOf('} else {', failStart);
  const branch = src.slice(failStart, failEnd);
  assert.match(branch, /bctx\.remove\(job\.key\)/);
  assert.doesNotMatch(branch, /recordRenderedTileKey/);
});

test('the build finishes only once the video has data (or failed)', () => {
  assert.match(src, /onGroundVideoReady\(\(\) => finish\(\)\)/);
});

test('no canvas guard remains (no canvas, no getImageData, no okCount)', () => {
  assert.doesNotMatch(src, /canvasIsBlank/);
  assert.doesNotMatch(src, /getImageData/);
  assert.doesNotMatch(src, /okCount/);
});

test('the success branch still records the cell exactly as before', () => {
  const okStart = src.indexOf('} else {', src.indexOf('} else if (groundVideoHasError()) {'));
  const branch = src.slice(okStart, okStart + 1200);
  assert.match(branch, /recordRenderedTileKey\(cellKey\)/);
});
