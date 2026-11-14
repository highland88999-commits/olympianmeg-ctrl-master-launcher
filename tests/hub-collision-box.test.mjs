// tests/hub-collision-box.test.mjs
// Oriented-box colliders (lib/hub-collision.js registerBoxCollider):
// the god towers wear boxes, not spheres, so users can pass between
// them. A box sweep must stop the body at the face it enters, slide
// it along that face (tangential motion preserved), respect the box's
// yaw, push a body that starts inside back out, and let a body pass
// cleanly through the gap between two boxes. Spheres keep working
// unchanged.
//
// Run: node --test tests/hub-collision-box.test.mjs (from the repo root)

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  registerCollider,
  registerBoxCollider,
  unregisterCollider,
  clearColliders,
  resolveFlightCollision,
} from '../lib/hub-collision.js';

const approx = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

describe('oriented-box colliders', () => {
  beforeEach(() => clearColliders());

  it('stops a body at the face it enters (no pass-through)', () => {
    registerBoxCollider('box', () => ({ x: 0, y: 0, z: 0 }), { x: 10, y: 10, z: 10 }, () => 0);
    const prev = { x: -20, y: 0, z: 0 };
    const next = { x: -5, y: 0, z: 0 };
    assert.equal(resolveFlightCollision(prev, next, 1), true);
    // Expanded face at -11 (half 10 + body 1), plus the 0.05 hair.
    assert.ok(approx(next.x, -11.05), `next.x ${next.x}`);
    assert.equal(next.y, 0);
    assert.equal(next.z, 0);
  });

  it('slides along the face: tangential motion is preserved', () => {
    registerBoxCollider('box', () => ({ x: 0, y: 0, z: 0 }), { x: 10, y: 10, z: 10 }, () => 0);
    const prev = { x: -20, y: 5, z: 0 };
    const next = { x: -5, y: 8, z: 3 };
    assert.equal(resolveFlightCollision(prev, next, 1), true);
    assert.ok(approx(next.x, -11.05), `next.x ${next.x}`);
    assert.equal(next.y, 8);
    assert.equal(next.z, 3);
  });

  it('a through-pass in one frame stops at the entry point', () => {
    registerBoxCollider('box', () => ({ x: 0, y: 0, z: 0 }), { x: 10, y: 10, z: 10 }, () => 0);
    const prev = { x: -20, y: 0, z: 0 };
    const next = { x: 20, y: 0, z: 0 };
    assert.equal(resolveFlightCollision(prev, next, 1), true);
    assert.ok(approx(next.x, -11.05), `next.x ${next.x}`);
  });

  it('a body that starts inside is pushed out along the shallowest face', () => {
    registerBoxCollider('box', () => ({ x: 0, y: 0, z: 0 }), { x: 10, y: 10, z: 10 }, () => 0);
    const prev = { x: 0, y: 9, z: 0 };
    const next = { x: 0, y: 9.5, z: 0 };
    assert.equal(resolveFlightCollision(prev, next, 1), true);
    // Shallowest face is +y: out to half 10 + body 1 + 0.05.
    assert.ok(approx(next.y, 11.05), `next.y ${next.y}`);
    assert.equal(next.x, 0);
  });

  it('a body that never reaches the box is untouched', () => {
    registerBoxCollider('box', () => ({ x: 0, y: 0, z: 0 }), { x: 10, y: 10, z: 10 }, () => 0);
    const prev = { x: -30, y: 0, z: 0 };
    const next = { x: -20, y: 0, z: 0 };
    assert.equal(resolveFlightCollision(prev, next, 1), false);
    assert.equal(next.x, -20);
  });

  it('the yaw is respected: a 90-degree box presents its short side', () => {
    // Long box (10 along x, 5 along z). Yaw 0: the x face is at 10.
    // Yaw 90 degrees: the long axis points along z, so the x face is at 5.
    registerBoxCollider('box', () => ({ x: 0, y: 0, z: 0 }), { x: 10, y: 10, z: 5 }, () => Math.PI / 2);
    const prev = { x: 20, y: 0, z: 0 };
    const next = { x: 0, y: 0, z: 0 };
    assert.equal(resolveFlightCollision(prev, next, 0), true);
    assert.ok(approx(next.x, 5.05), `next.x ${next.x}`);
  });

  it('a flyer passes cleanly through the 8.00 gap between two tower boxes', () => {
    // Two tower boxes side by side, centres 41.54 apart (the ring
    // chord at 159.11), half-side 16.768 — an 8.00 gap between them.
    const half = 16.768;
    const gap = 8.0;
    const halfChord = half + gap / 2;
    registerBoxCollider('left', () => ({ x: -halfChord, y: 0, z: 0 }), { x: half, y: 38.75, z: half }, () => 0);
    registerBoxCollider('right', () => ({ x: halfChord, y: 0, z: 0 }), { x: half, y: 38.75, z: half }, () => 0);
    // Flyer (r1.2) straight through the middle of the gap.
    const prev = { x: 0, y: 0, z: -30 };
    const next = { x: 0, y: 0, z: 30 };
    assert.equal(resolveFlightCollision(prev, next, 1.2), false);
    assert.equal(next.z, 30);
    // The bike (r3.0) fits too, with 2.00 to spare across the gap.
    const prevB = { x: 0, y: 0, z: -30 };
    const nextB = { x: 0, y: 0, z: 30 };
    assert.equal(resolveFlightCollision(prevB, nextB, 3.0), false);
    assert.equal(nextB.z, 30);
    // But a body wider than the gap is stopped at the faces.
    const prevW = { x: 0, y: 0, z: -30 };
    const nextW = { x: 0, y: 0, z: 30 };
    assert.equal(resolveFlightCollision(prevW, nextW, 4.5), true);
  });

  it('sphere colliders still work unchanged', () => {
    registerCollider('ball', () => ({ x: 0, y: 0, z: 0 }), 10);
    const prev = { x: -20, y: 0, z: 0 };
    const next = { x: -5, y: 0, z: 0 };
    assert.equal(resolveFlightCollision(prev, next, 1), true);
    assert.ok(approx(next.x, -11.05), `next.x ${next.x}`);
    unregisterCollider('ball');
    assert.equal(resolveFlightCollision({ x: -20, y: 0, z: 0 }, { x: -5, y: 0, z: 0 }, 1), false);
  });
});
