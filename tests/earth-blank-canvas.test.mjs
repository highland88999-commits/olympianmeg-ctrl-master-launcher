// Black-ground guard (Merlin, 2026-10-29): iOS can reclaim a 2D
// canvas under memory pressure without drawImage throwing, so a
// build "succeeds" with a blank canvas and mounts a black sheet —
// which then defeats the coverage check AND the rendered-record
// dedup, so the ground stays black forever. finish() must treat a
// blank canvas as a failed build: no sheet, no record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('components/NexusEarth.jsx', 'utf8');

test('finish() samples the canvas for paint before calling a build good', () => {
  assert.match(src, /const canvasIsBlank = \(\) => \{/);
  assert.match(src, /getImageData/);
});

test('a blank canvas fails the build even when okCount is up', () => {
  assert.match(src, /else if \(okCount > 0 && !canvasIsBlank\(\)\)/);
});

test('blank-build failure removes the sheet without recording it', () => {
  const failBranch = src.slice(
    src.indexOf('} else if (okCount > 0 && !canvasIsBlank()) {'));
  const elseIdx = failBranch.indexOf('} else {');
  const branch = failBranch.slice(elseIdx, elseIdx + 900);
  assert.match(branch, /bctx\.remove\(job\.key\)/);
  assert.doesNotMatch(branch, /recordRenderedTileKey/);
});

test('tainted canvas (thrown getImageData) is treated as painted, never blocked', () => {
  assert.match(src, /getImageData threw: the canvas is tainted[\s\S]{0,200}return false/);
});
