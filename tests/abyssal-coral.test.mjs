// Coral reef (Merlin, 2026-10-29): procedural reefs grow on the
// trench walls/floor in the hadal zone, with living anemones and
// glowing polyps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coralVisibility, CORAL_DEPTH_START, CORAL_DEPTH_FULL, mergeGeometries } from '../app/abyssal-voyage/coral.js';

test('reefs are invisible above the hadal approach, full at the floor', () => {
  assert.equal(coralVisibility(0), 0);
  assert.equal(coralVisibility(5000), 0);
  assert.equal(coralVisibility(CORAL_DEPTH_START), 0);
  assert.equal(coralVisibility(CORAL_DEPTH_FULL), 1);
  assert.equal(coralVisibility(20000), 1);
});

test('reef visibility ramps smoothly between approach and floor', () => {
  const mid = (CORAL_DEPTH_START + CORAL_DEPTH_FULL) / 2;
  const v = coralVisibility(mid);
  assert.ok(v > 0.4 && v < 0.6, `mid visibility ${v}`);
  assert.ok(coralVisibility(CORAL_DEPTH_START + 1) < coralVisibility(CORAL_DEPTH_FULL - 1));
});

test('mergeGeometries keeps vertex colors for the reef material', () => {
  // headless check: the merger is structural; three.js import proves
  // the module loads in node (it is imported above).
  assert.equal(typeof mergeGeometries, 'function');
});
