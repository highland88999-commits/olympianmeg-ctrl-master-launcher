// Fortress of Solitude — crystal-saved cue guards (2026-10-27).
//
// Merlin: "Set a visual cue in there of some sort that indicates when
// a crystal is saved." These pin the cue's shape, which no node test
// can exercise directly (it lives in JSX + a three.js material):
//   1. The saved crystal itself pulses: its emissive intensity is
//      driven up through the bloom pass and settles back to rest.
//   2. A short SAVED badge shows in the crystal's own panel, in flow
//      (never absolutely positioned over other UI), and clears itself.
//   3. The cue fires exactly once in the file, on the crystal-store
//      success path — after the PUT landed and the matrix persisted —
//      never in a catch block, never on attempt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/fortress-of-solitude/page.tsx', import.meta.url), 'utf8');

test('saved crystal pulses its emissive glow and settles back to rest', () => {
  assert.match(page, /flashCrystalSaved/);
  assert.match(page, /gsap\.fromTo\(mat, \{ emissiveIntensity: 0\.4 \}/);
  assert.match(page, /emissiveIntensity: 1\.8/);
  assert.match(page, /onComplete: \(\) => \{ mat\.emissiveIntensity = 0\.4; \}/);
});

test('SAVED badge lives in the crystal panel, in flow, and clears itself', () => {
  assert.match(page, /savedFlash/);
  assert.match(page, /✓ SAVED TO THIS CRYSTAL/);
  // In flow inside the panel's flex column: the badge's own div carries
  // no fixed/absolute positioning (the panel sheet itself is pre-existing).
  const badgeIdx = page.indexOf('✓ SAVED TO THIS CRYSTAL');
  const badgeDiv = page.slice(badgeIdx - 200, badgeIdx);
  assert.match(badgeDiv, /<div className="w-full rounded-xl border border-green-400\/60/);
  assert.doesNotMatch(badgeDiv, /className="[^"]*(fixed|absolute)[^"]*"/);
  assert.match(page, /setTimeout\(\(\) => setSavedFlash\(false\), 4000\)/);
});

test('cue fires once, only on crystal-store success', () => {
  const calls = page.match(/flashCrystalSaved\(selectedMeshRef\.current\)/g) || [];
  assert.equal(calls.length, 1, 'cue must fire from exactly one place');
  const callIdx = page.indexOf('flashCrystalSaved(selectedMeshRef.current)');
  // The nearest preceding syncDatabase in the same function is the
  // success path (PUT landed, matrix persisted); no catch between.
  const region = page.slice(Math.max(0, callIdx - 1200), callIdx);
  assert.match(region, /await syncDatabase\(newMatrix\)/);
  assert.doesNotMatch(region.slice(region.lastIndexOf('await syncDatabase(newMatrix)')), /catch/);
  // The passphrase flow is untouched: the store step still gates on it.
  assert.match(page, /Enter a passphrase to lock this file first\./);
});
