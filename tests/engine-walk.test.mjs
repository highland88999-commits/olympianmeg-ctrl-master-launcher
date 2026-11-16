// World Engine — walk mode (tests/engine-walk.test.mjs).
//
// Covers the pure-logic parts in Node: mode toggle, terrain-height lookup
// (the exact displacement the mesh shows), movement math, bounds
// clamping, and the datasheet walk constants + hints. The live 3D walk
// itself is proven by Merlin's phone check after push, not by Node.
//
// Run: node --test tests/engine-walk.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  PrecisionEngine,
  computeGroundHeight,
  deriveTerrainParams,
  clampWalkPosition,
  walkStep,
  yawPitchFromDirection,
  nextWalkMode,
} from '../lib/world-engine/PrecisionEngine.js';
import {
  ENGINE_RENDER,
  ENGINE_CONTROLS_HINT,
  ENGINE_WALK_HINT,
} from '../lib/world-engine/datasheets/engine.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

describe('walk mode toggle', () => {
  it('toggles orbit <-> walk and nothing else', () => {
    assert.equal(nextWalkMode('orbit'), 'walk');
    assert.equal(nextWalkMode('walk'), 'orbit');
    assert.equal(nextWalkMode('anything-else'), 'walk');
  });

  it('PrecisionEngine exposes setWalkMode + groundHeight', () => {
    assert.equal(typeof PrecisionEngine.prototype.setWalkMode, 'function');
    assert.equal(typeof PrecisionEngine.prototype.groundHeight, 'function');
    assert.equal(typeof PrecisionEngine.prototype.updateWalk, 'function');
  });
});

describe('terrain height lookup', () => {
  it('deriveTerrainParams is deterministic per seed and differs across seeds', () => {
    const a = deriveTerrainParams('alpha', 'mountains', 0.8);
    const b = deriveTerrainParams('alpha', 'mountains', 0.8);
    const c = deriveTerrainParams('beta', 'mountains', 0.8);
    assert.deepEqual(a, b);
    assert.notEqual(a.ox, c.ox);
  });

  it('peaks follow the terrain type, roughness is clamped', () => {
    assert.equal(deriveTerrainParams('s', 'mountains', 1).peak, 14);
    assert.equal(deriveTerrainParams('s', 'desert', 1).peak, 5);
    assert.equal(deriveTerrainParams('s', 'plains', 1).peak, 3);
    assert.equal(deriveTerrainParams('s', 'unknown-type', 1).peak, 3);
    assert.equal(deriveTerrainParams('s', 'plains', 5).roughness, 1.0);
    assert.equal(deriveTerrainParams('s', 'plains', 0).roughness, 0.1);
    const p = deriveTerrainParams('s', 'plains', 0.8);
    assert.ok(p.f1 >= 0.06 && p.f1 <= 0.11);
    assert.ok(p.f2 >= 0.25 && p.f2 <= 0.4);
  });

  it('computeGroundHeight matches the mesh displacement formula', () => {
    const params = deriveTerrainParams('alpha', 'mountains', 0.8);
    const { ox, oz, f1, f2, peak, roughness } = params;
    for (const [x, z] of [[0, 0], [12.5, -7.3], [-40, 40], [79, -79]]) {
      const expected =
        Math.sin((x + ox) * f1) * Math.cos((z + oz) * 0.07) * peak * roughness +
        Math.sin((x + ox) * f2 + (z + oz) * 0.2) * 1.6 * roughness;
      assert.ok(approx(computeGroundHeight(params, x, z), expected, 1e-12), `height at ${x},${z}`);
    }
  });

  it('computeGroundHeight returns 0 with no terrain params and stays bounded', () => {
    assert.equal(computeGroundHeight(null, 10, 10), 0);
    const params = deriveTerrainParams('alpha', 'mountains', 1.0);
    const bound = params.peak * params.roughness + 1.6 * params.roughness;
    for (let x = -80; x <= 80; x += 7) {
      for (let z = -80; z <= 80; z += 11) {
        assert.ok(Math.abs(computeGroundHeight(params, x, z)) <= bound + 1e-9);
      }
    }
  });
});

describe('movement math', () => {
  const speed = ENGINE_RENDER.walk.walkSpeed;

  it('W moves forward (-z at yaw 0), S back, D right, A left', () => {
    const base = { x: 0, z: 0, yaw: 0 };
    assert.deepEqual(walkStep(base, new Set(['KeyW']), 1, speed), { x: 0, z: -speed });
    assert.deepEqual(walkStep(base, new Set(['KeyS']), 1, speed), { x: 0, z: speed });
    assert.deepEqual(walkStep(base, new Set(['KeyD']), 1, speed), { x: speed, z: 0 });
    assert.deepEqual(walkStep(base, new Set(['KeyA']), 1, speed), { x: -speed, z: 0 });
  });

  it('arrow keys move exactly like WASD', () => {
    const base = { x: 0, z: 0, yaw: 0 };
    assert.deepEqual(walkStep(base, new Set(['ArrowUp']), 1, speed), walkStep(base, new Set(['KeyW']), 1, speed));
    assert.deepEqual(walkStep(base, new Set(['ArrowLeft']), 1, speed), walkStep(base, new Set(['KeyA']), 1, speed));
  });

  it('movement follows yaw: W at yaw PI/2 walks -x', () => {
    const stepped = walkStep({ x: 0, z: 0, yaw: Math.PI / 2 }, new Set(['KeyW']), 1, speed);
    assert.ok(approx(stepped.x, -speed));
    assert.ok(approx(stepped.z, 0));
  });

  it('diagonal input is no faster than straight ahead, and dt scales the step', () => {
    const base = { x: 0, z: 0, yaw: 0 };
    const diag = walkStep(base, new Set(['KeyW', 'KeyD']), 1, speed);
    assert.ok(approx(Math.hypot(diag.x, diag.z), speed));
    const half = walkStep(base, new Set(['KeyW']), 0.5, speed);
    assert.ok(approx(half.z, -speed / 2));
    assert.deepEqual(walkStep(base, new Set(), 1, speed), { x: 0, z: 0 });
    assert.deepEqual(walkStep(base, new Set(['KeyW']), 0, speed), { x: 0, z: 0 });
  });

  it('opposite keys cancel out', () => {
    const base = { x: 5, z: 5, yaw: 0 };
    assert.deepEqual(walkStep(base, new Set(['KeyW', 'KeyS']), 1, speed), { x: 5, z: 5 });
    assert.deepEqual(walkStep(base, new Set(['KeyA', 'KeyD']), 1, speed), { x: 5, z: 5 });
  });
});

describe('bounds clamping', () => {
  it('clamps each axis to ±halfBound and leaves inside points alone', () => {
    const b = ENGINE_RENDER.walk.halfBound;
    assert.deepEqual(clampWalkPosition(10, -10, b), { x: 10, z: -10 });
    assert.deepEqual(clampWalkPosition(500, -500, b), { x: b, z: -b });
    assert.deepEqual(clampWalkPosition(b, b, b), { x: b, z: b });
  });
});

describe('yaw/pitch from look direction', () => {
  it('recovers yaw 0 / pitch 0 from looking down -z', () => {
    const { yaw, pitch } = yawPitchFromDirection(0, 0, -1);
    assert.ok(approx(yaw, 0));
    assert.ok(approx(pitch, 0));
  });

  it('looking +x is yaw -PI/2, looking straight up is pitch PI/2', () => {
    assert.ok(approx(yawPitchFromDirection(1, 0, 0).yaw, -Math.PI / 2));
    assert.ok(approx(yawPitchFromDirection(0, 1, 0).pitch, Math.PI / 2));
    assert.ok(approx(yawPitchFromDirection(0, -1, 0).pitch, -Math.PI / 2));
  });
});

describe('datasheet walk constants + hints', () => {
  it('walk constants are sane and inside the terrain', () => {
    const w = ENGINE_RENDER.walk;
    assert.equal(w.eyeHeight, 1.7);
    assert.equal(w.walkSpeed, 6);
    assert.equal(w.toggleKey, 'V');
    assert.ok(w.halfBound > 0 && w.halfBound < ENGINE_RENDER.terrain.size / 2);
    assert.ok(w.lookSensitivity > 0 && w.lookSensitivity < 0.01);
    assert.ok(w.maxPitch > 0 && w.maxPitch < Math.PI / 2);
  });

  it('orbit hint is unchanged; walk hint names the walk controls', () => {
    assert.equal(ENGINE_CONTROLS_HINT, 'Drag to orbit · Scroll to zoom · Press I for your library');
    assert.match(ENGINE_WALK_HINT, /WASD/);
    assert.match(ENGINE_WALK_HINT, /Drag to look/);
    assert.match(ENGINE_WALK_HINT, /V for orbit/);
    assert.match(ENGINE_WALK_HINT, /Press I for your library/);
  });
});

describe('walk wiring (source checks)', () => {
  it('engine listens for the toggle, answers with the mode, and disposes cleanly', () => {
    const src = read('lib/world-engine/PrecisionEngine.js');
    assert.match(src, /world-engine:toggle-walk/);
    assert.match(src, /world-engine:walk-mode/);
    assert.match(src, /removeEventListener\('keydown', this\.handleWalkKeyDown\)/);
    assert.match(src, /removeEventListener\('world-engine:toggle-walk', this\.handleWalkToggleEvent\)/);
    assert.match(src, /this\.controls\.enabled = false/);
    assert.match(src, /this\.controls\.enabled = true/);
  });

  it('engine page has the toggle button and listens for the mode event', () => {
    const src = read('app/world-engine/engine/page.jsx');
    assert.match(src, /world-engine:toggle-walk/);
    assert.match(src, /world-engine:walk-mode/);
    assert.match(src, /🚶 Walk/);
    assert.match(src, /🔄 Orbit/);
    assert.match(src, /ENGINE_WALK_HINT/);
    assert.match(src, /ENGINE_CONTROLS_HINT/);
  });
});
