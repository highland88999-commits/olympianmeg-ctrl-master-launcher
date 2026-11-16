// tests/drag-look-direction.test.mjs — FINGER-FOLLOWS DRAG-LOOK
// (Merlin, Nov 16, 2026 — UNIVERSAL CONTROLS CORE round, workstream B).
//
// Merlin decided: the camera drag-look FOLLOWS the finger — drag
// right → look right, drag down → look down — universally. He
// confirmed on his phone that the camera turning was inverted.
//
// The inversion lived in exactly ONE rig family: the sphere-basis
// walkers (Moon, Earth walk, Jupiter 2), where yaw+ is look-RIGHT
// (sphereTangentBasis: yaw π/2 faces east, +X — the viewer's right
// when facing north), so the old `yaw -= lookTurnForDrag(dx)`
// turned the view LEFT on a drag right. Both axes are pinned here
// from the rig maths, plus source pins on the two scene files this
// workstream flipped (MoonScene, EarthWalkScene). Jupiter 2 is
// workstream A's file and is deliberately NOT pinned here.
//
// Every OTHER first-person rig in the repo uses the three.js
// convention (yaw+ is look-LEFT, pitch+ is look-up), where
// `yaw -= dx` / `pitch -= dy` already IS finger-follows — those
// are pinned here too, so a future "unify the signs" sweep cannot
// flip a correct rig by assumption. The shared dragLookStep
// (lib/world/controls-core.js) is pinned the same way.
//
// Run: node --test tests/drag-look-direction.test.mjs (repo root).
// No browser, no network — pure maths + source audits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lookTurnForDrag,
  sphereSurfaceUp,
  sphereTangentBasis,
} from '../lib/planet-walker.js';
import { applyLook as worldApplyLook } from '../lib/world/walk-controls.js';
import { applyLook as babelApplyLook } from '../lib/babel/walk.js';
import { dragLookStep } from '../lib/world/controls-core.js';
import { applyWorldLook } from '../lib/earth2/world.js';
import { MOON_RADIUS } from '../lib/hub-layout.js';
import { EARTH_RADIUS } from '../lib/god-orbits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// The sphere rigs stand at a pole for this proof (the Moon /
// Earth-walk spawns): up is +Y, north is -Z, east is +X, and
// facing north the viewer's right hand is +X.
const POLE_FEET = { x: 0, y: MOON_RADIUS, z: 0 };
// THREE forward for a YXZ yaw (the convention every three.js rig
// here uses): forward = (-sin yaw, 0, -cos yaw).
const threeForward = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

// ── the sphere-basis rigs (Moon, Earth walk — FLIPPED) ─────────────

test('sphere rig: yaw +PI/2 faces east (+X) — yaw+ is look-right', () => {
  const north = sphereTangentBasis(POLE_FEET, 0, MOON_RADIUS);
  assert.ok(approx(north.forward.z, -1), 'yaw 0 faces north (-Z)');
  const east = sphereTangentBasis(POLE_FEET, Math.PI / 2, MOON_RADIUS);
  assert.ok(approx(east.forward.x, 1), 'yaw +PI/2 faces east (+X) = viewer right');
  assert.ok(approx(east.forward.z, 0), 'yaw +PI/2 has no north component');
  // Same law on the Earth-walk sphere (different radius, same basis).
  const earthEast = sphereTangentBasis({ x: 0, y: EARTH_RADIUS, z: 0 }, Math.PI / 2, EARTH_RADIUS);
  assert.ok(approx(earthEast.forward.x, 1), 'Earth walk: yaw +PI/2 also faces east (+X)');
});

test('sphere rig: drag right must ADD the turn — the old -= looked left', () => {
  const turn = lookTurnForDrag(195, 390); // half-screen drag right → 90°
  assert.ok(approx(turn, Math.PI / 2), 'half-screen drag right is a 90° turn');
  const fixed = sphereTangentBasis(POLE_FEET, 0 + turn, MOON_RADIUS);
  assert.ok(approx(fixed.forward.x, 1), 'yaw + turn faces east: drag right looks right');
  const inverted = sphereTangentBasis(POLE_FEET, 0 - turn, MOON_RADIUS);
  assert.ok(approx(inverted.forward.x, -1), 'yaw - turn faces west: the old sign looked left');
});

test('sphere rig: pitch+ is look-up, so drag down SUBTRACTS (look down)', () => {
  const up = sphereSurfaceUp(POLE_FEET, MOON_RADIUS);
  const gazeY = (pitch) => {
    const { forward } = sphereTangentBasis(POLE_FEET, 0, MOON_RADIUS);
    return forward.y * Math.cos(pitch) + up.y * Math.sin(pitch);
  };
  assert.ok(gazeY(0.35) > 0, 'arrival pitch 0.35 looks slightly up');
  // Drag down (dy > 0): pitch - turn lowers the gaze.
  const down = 0.35 - lookTurnForDrag(195, 390);
  assert.ok(gazeY(down) < 0, 'pitch - turn after a drag down looks down');
  // The opposite sign would look up on a drag down — wrong.
  const wrong = 0.35 + lookTurnForDrag(195, 390);
  assert.ok(gazeY(wrong) > 0, 'pitch + turn after a drag down would look up (inverted)');
});

// ── source pins: the two flipped scenes ────────────────────────────

test('MoonScene + EarthWalkScene: yaw ADDS the turn, pitch still SUBTRACTS', () => {
  for (const file of ['components/MoonScene.jsx', 'components/EarthWalkScene.jsx']) {
    const src = read(file);
    assert.ok(
      src.includes('yawTarget.current += lookTurnForDrag(e.clientX - d.x, w)'),
      `${file}: drag right adds the turn (finger-follows yaw)`,
    );
    assert.ok(
      !src.includes('yawTarget.current -= lookTurnForDrag(e.clientX - d.x, w)'),
      `${file}: the inverted yaw -= is gone`,
    );
    assert.ok(
      src.includes('pitchTarget.current - lookTurnForDrag(e.clientY - d.y, w)'),
      `${file}: drag down still subtracts pitch (look down)`,
    );
    // The recenter wiring is untouched by this workstream.
    assert.ok(src.includes('recenterLookOffset('), `${file}: recenter wiring intact`);
  }
});

test('helper unchanged: lookTurnForDrag still returns +PI for a full-width drag right', () => {
  assert.ok(approx(lookTurnForDrag(390, 390), Math.PI), 'sign lives in the callers, not the helper');
  assert.ok(approx(lookTurnForDrag(-390, 390), -Math.PI), 'drag left is a negative turn');
});

// ── the three.js-convention rigs (already correct — do NOT flip) ───

test('THREE rigs: yaw+ is look-LEFT, so yaw -= dx is finger-follows', () => {
  assert.ok(approx(threeForward(0).z, -1), 'yaw 0 faces -Z');
  assert.ok(threeForward(Math.PI / 2).x < 0, 'yaw +PI/2 faces -X (left of a -Z viewer)');
  assert.ok(threeForward(-Math.PI / 2).x > 0, 'yaw -PI/2 faces +X (right of a -Z viewer)');
  // So a drag right (dx > 0) must DECREASE yaw to look right.
  const yawAfterDragRight = 0 - lookTurnForDrag(195, 390);
  assert.ok(threeForward(yawAfterDragRight).x > 0, 'yaw - turn faces right: drag right looks right');
});

test('dragLookStep (shared core): drag right looks right, drag up looks up', () => {
  const right = dragLookStep({ yaw: 0, pitch: 0 }, 390, 0, 390);
  assert.ok(approx(right.yaw, -Math.PI), 'full-width drag right turns yaw -PI (look right)');
  assert.equal(right.pitch, 0, 'no vertical drag leaves pitch alone');
  // Small vertical drags (inside the ±1.25 walk clamp) prove the pitch sign.
  const up = dragLookStep({ yaw: 0, pitch: 0 }, 0, -100, 390);
  assert.ok(up.pitch > 0, 'drag up raises pitch (look up)');
  const down = dragLookStep({ yaw: 0, pitch: 0 }, 0, 100, 390);
  assert.ok(down.pitch < 0, 'drag down lowers pitch (look down)');
  const over = dragLookStep({ yaw: 0, pitch: 0 }, 0, -100000, 390);
  assert.ok(approx(over.pitch, 1.25), 'pitch still clamps at the walk limit');
});

test('applyLook (world + babel) and applyWorldLook (Earth 2): drag right looks right', () => {
  for (const [name, fn] of [
    ['world applyLook', (yaw, pitch, dx, dy) => worldApplyLook({ yaw, pitch }, dx, dy)],
    ['babel applyLook', (yaw, pitch, dx, dy) => babelApplyLook(yaw, pitch, dx, dy)],
    ['Earth 2 applyWorldLook', (yaw, pitch, dx, dy) => applyWorldLook(yaw, pitch, dx, dy)],
  ]) {
    const r = fn(0, 0, 100, 0);
    assert.ok(r.yaw < 0, `${name}: drag right decreases yaw (look right under THREE)`);
    assert.ok(threeForward(r.yaw).x > 0, `${name}: the decreased yaw faces right`);
    const d = fn(0, 0, 0, 100);
    assert.ok(d.pitch < 0, `${name}: drag down decreases pitch (look down)`);
    const u = fn(0, 0, 0, -100);
    assert.ok(u.pitch > 0, `${name}: drag up increases pitch (look up)`);
  }
});
