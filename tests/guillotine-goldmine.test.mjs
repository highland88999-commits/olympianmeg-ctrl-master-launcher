// tests/guillotine-goldmine.test.mjs — headless tests for the Tron batch
// Worker C (guillotine-goldmine) deliverables. Pure logic only: torch
// flicker, camera limit values, hold-pour state machine, gold-piece
// contract helpers, and the economy-untouched guarantee.
// Run: node --test tests/guillotine-goldmine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { torchFlicker, TORCH_BASE_INTENSITY, TORCH_POSITIONS, TORCH_FLICKER_RANGE } from '../app/guillotine/torches.js';
import { CAMERA_LIMITS, clampTarget } from '../app/guillotine/cameraRig.js';
import {
  GOLD_PIECE_SOURCE_ID,
  monthKey,
  storageKeyFor,
  collectedThisMonth,
  interpretCollectResponse,
} from '../app/guillotine/goldPiece.js';
import {
  newState,
  setPouring,
  togglePour,
  createHoldPour,
  flowRate,
  pourTick,
  TICK,
} from '../app/liquid-gold/engine.js';

// ── Torch flicker ────────────────────────────────────────────────────────
test('torchFlicker is deterministic for the same (seed, t)', () => {
  assert.equal(torchFlicker(0, 1.234), torchFlicker(0, 1.234));
  assert.equal(torchFlicker(2, 99.9), torchFlicker(2, 99.9));
});

test('torchFlicker stays inside the advertised flicker band', () => {
  const lo = 1 - TORCH_FLICKER_RANGE;
  const hi = 1 + TORCH_FLICKER_RANGE;
  for (let seed = 0; seed < 3; seed++) {
    for (let i = 0; i < 2000; i++) {
      const f = torchFlicker(seed, i * 0.016);
      assert.ok(f >= lo && f <= hi, `seed ${seed} t ${i}: ${f} outside [${lo}, ${hi}]`);
    }
  }
});

test('torchFlicker actually moves (not a constant) and differs per torch', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(torchFlicker(0, i * 0.016).toFixed(4));
  assert.ok(seen.size > 50, `expected varied output, got ${seen.size} distinct values`);
  assert.notEqual(torchFlicker(0, 5.0).toFixed(6), torchFlicker(1, 5.0).toFixed(6));
});

test('torchFlicker mean is ~1 (no brightness drift)', () => {
  let sum = 0; const n = 10000;
  for (let i = 0; i < n; i++) sum += torchFlicker(1, i * 0.016);
  const mean = sum / n;
  assert.ok(Math.abs(mean - 1) < 0.05, `mean ${mean} drifted too far from 1`);
});

test('torch layout is cheap and restrained: 3 positions, modest base intensity', () => {
  assert.equal(TORCH_POSITIONS.length, 3);
  for (const [x, z] of TORCH_POSITIONS) {
    assert.ok(Number.isFinite(x) && Number.isFinite(z));
  }
  assert.equal(TORCH_BASE_INTENSITY, 220);
});

// ── Camera limits ────────────────────────────────────────────────────────
test('camera: pan is enabled and damping is softened', () => {
  assert.equal(CAMERA_LIMITS.enablePan, true);
  assert.equal(CAMERA_LIMITS.dampingFactor, 0.08); // was 0.05
});

test('camera: pull-back widened, near plane keeps camera out of the geometry', () => {
  assert.equal(CAMERA_LIMITS.maxDistance, 2200); // was 1500
  assert.equal(CAMERA_LIMITS.minDistance, 180); // was 1 (inside the machine!)
  assert.ok(CAMERA_LIMITS.maxPolarAngle > Math.PI / 2, 'can tilt slightly below horizon');
  assert.ok(CAMERA_LIMITS.minPolarAngle >= 0, 'never flips under the floor');
});

test('clampTarget keeps the orbit target near the machine', () => {
  const box = CAMERA_LIMITS.targetClamp;
  const clamped = clampTarget({ x: 5000, y: -100, z: 9999 });
  assert.deepEqual(clamped, { x: box.maxX, y: box.minY, z: box.maxZ });
  const inside = clampTarget({ x: 10, y: 300, z: -20 });
  assert.deepEqual(inside, { x: 10, y: 300, z: -20 });
});

test('clampTarget does not mutate its input', () => {
  const t = { x: 9999, y: 9999, z: 9999 };
  clampTarget(t);
  assert.deepEqual(t, { x: 9999, y: 9999, z: 9999 });
});

// ── Hold-to-pour state machine ───────────────────────────────────────────
test('createHoldPour: press starts, release stops', () => {
  const h = createHoldPour();
  assert.equal(h.isPouring(), false);
  h.press();
  assert.equal(h.isPouring(), true);
  h.release();
  assert.equal(h.isPouring(), false);
});

test('createHoldPour: cancel stops the pour (pointercancel path)', () => {
  const h = createHoldPour();
  h.press();
  h.cancel();
  assert.equal(h.isPouring(), false);
});

test('createHoldPour: idempotent — double press / stray release are safe', () => {
  const h = createHoldPour();
  h.press();
  h.press(); // repeat press must not double-trigger
  assert.equal(h.isPouring(), true);
  assert.equal(h.release(), true);
  assert.equal(h.release(), false); // stray release: no-op
  assert.equal(h.cancel(), false); // cancel while idle: no-op
  assert.equal(h.isPouring(), false);
});

test('setPouring sets the latch explicitly and touches nothing else', () => {
  const st = newState();
  st.crude = 42.5;
  assert.equal(setPouring(st, true), true);
  assert.equal(st.pouring, true);
  assert.equal(st.crude, 42.5);
  assert.equal(setPouring(st, false), false);
  assert.equal(st.pouring, false);
  assert.equal(st.crude, 42.5);
});

test('togglePour still works (legacy compat)', () => {
  const st = newState();
  assert.equal(togglePour(st), true);
  assert.equal(togglePour(st), false);
});

test('economy untouched: pour amount/rate identical to the toggle era', () => {
  const a = newState();
  setPouring(a, true);
  const rate = flowRate(a);
  assert.equal(rate, 6, 'base flow rate must stay 6 L/s');
  let poured = 0;
  for (let i = 0; i < 10; i++) poured += pourTick(a, TICK);
  assert.ok(Math.abs(poured - rate * TICK * 10) < 1e-9, `poured ${poured} != rate*dt*10`);
  // Same result via the old toggle path.
  const b = newState();
  togglePour(b);
  let pouredB = 0;
  for (let i = 0; i < 10; i++) pouredB += pourTick(b, TICK);
  assert.ok(Math.abs(pouredB - poured) < 1e-9, 'hold-to-pour must pour exactly what the toggle did');
  assert.equal(flowRate(b), rate, 'flow rate must not depend on the interaction mode');
});

// ── Gold piece contract helpers ──────────────────────────────────────────
test('gold piece source id matches the required contract', () => {
  assert.equal(GOLD_PIECE_SOURCE_ID, 'guillotine-gold-piece');
});

test('monthKey formats as YYYY-MM', () => {
  assert.equal(monthKey(new Date(2026, 9, 2)), '2026-10');
  assert.equal(monthKey(new Date(2026, 0, 31)), '2026-01');
});

test('storageKeyFor is account-scoped', () => {
  assert.equal(storageKeyFor('user-123'), 'guillotine-gold-piece:user-123');
  assert.notEqual(storageKeyFor('user-123'), storageKeyFor('user-456'));
  assert.equal(storageKeyFor(null), 'guillotine-gold-piece:anon');
});

test('collectedThisMonth hides the piece until the calendar month rolls over', () => {
  const oct = new Date(2026, 9, 15);
  assert.equal(collectedThisMonth('2026-10', oct), true);
  assert.equal(collectedThisMonth('2026-09', oct), false);
  assert.equal(collectedThisMonth(null, oct), false);
  assert.equal(collectedThisMonth('2026-10', new Date(2026, 10, 1)), false);
});

test('interpretCollectResponse: ok:true credits what the server says', () => {
  assert.deepEqual(interpretCollectResponse({ ok: true, credited: 5 }), { action: 'collected', credited: 5 });
  assert.deepEqual(interpretCollectResponse({ ok: true, credited: 0 }), { action: 'collected', credited: 0 });
});

test('interpretCollectResponse: already_collected -> returns next month', () => {
  assert.deepEqual(interpretCollectResponse({ ok: false, reason: 'already_collected' }), { action: 'already_collected' });
});

test('interpretCollectResponse: not_signed_in -> prompt sign-in, keep visible', () => {
  assert.deepEqual(interpretCollectResponse({ ok: false, reason: 'not_signed_in' }), { action: 'not_signed_in' });
});

test('interpretCollectResponse: anything else -> error path, keep visible', () => {
  assert.deepEqual(interpretCollectResponse(null), { action: 'error' });
  assert.deepEqual(interpretCollectResponse({}), { action: 'error' });
  assert.deepEqual(interpretCollectResponse({ ok: false, reason: 'weird' }), { action: 'error' });
  assert.deepEqual(interpretCollectResponse({ ok: true, credited: 'bogus' }), { action: 'collected', credited: 0 });
});
