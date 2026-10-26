// Hawkins tracer streaks: shots render as thick visible streaks, not 1px lines.
// Run: node tests/hawkins-tracer.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync('app/hawkins/engine.js', 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
const code = strip(src);

test('spawnTracer builds a thick mesh streak', () => {
  assert.match(code, /BoxGeometry\(0\.35, 0\.35/);
  assert.match(code, /tracers\.push\(\{ mesh, life: 0\.3 \}\)/);
  assert.match(code, /color: 0xffdd88/);
});

test('old 1px line tracer is gone', () => {
  assert.doesNotMatch(code, /new THREE\.Line\(\s*new THREE\.BufferGeometry\(\)\.setFromPoints\(\[from, to\]\)/);
  assert.doesNotMatch(code, /tracers\[i\]\.line/);
  assert.doesNotMatch(code, /tracers\.push\(\{ line, life: 0\.09 \}\)/);
});

test('tracer loop fades and disposes the mesh', () => {
  assert.match(code, /tracers\[i\]\.mesh\.material\.opacity/);
  assert.match(code, /tracers\[i\]\.mesh\.geometry\.dispose\(\)/);
  assert.match(code, /tracers\[i\]\.mesh\.material\.dispose\(\)/);
});

test('shot paths still spawn tracers (hits and misses)', () => {
  assert.match(code, /E\.spawnTracer\(E\.vecna\.mesh\.position/);
  assert.match(code, /E\.spawnTracer\(b\.mesh\.position/);
  assert.match(code, /if \(!hit\) E\.spawnTracer\(/);
});
