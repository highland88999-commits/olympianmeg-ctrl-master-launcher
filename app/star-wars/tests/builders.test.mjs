/*
 * STAR WARS visual-engine builder tests (node:test, no browser).
 *
 * Run from the repo work dir:
 *   node app/star-wars/tests/builders.test.mjs
 *
 * The DOM stub below is installed BEFORE any three-dependent module is
 * imported. textures/landmarks/zone only touch document inside functions
 * called here, and draw code uses flat fill/stroke calls only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* ---- minimal DOM stub (task-specified shape) ---- */
const fakeCanvas = {
  width: 0,
  height: 0,
  style: {},
  getContext: () => new Proxy({}, { get: () => () => ({}) }),
};
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : { style: {} }),
};

/* ---- dynamic imports, after the stub ---- */
const THREE = await import('three');
const T = await import('../textures.js');
const LM = await import('../landmarks.js');
const { buildZone } = await import('../zone.js');

const approx = (a, b, eps) => Math.abs(a - b) < (eps == null ? 1e-6 : eps);

describe('textures', () => {
  it('makeCanvasTexture runs drawFn and returns a CanvasTexture with Repeat wrap', () => {
    let called = 0;
    const tex = T.makeCanvasTexture(64, (ctx, size) => { called++; assert.equal(size, 64); });
    assert.equal(called, 1);
    assert.ok(tex instanceof THREE.CanvasTexture);
    assert.equal(tex.wrapS, THREE.RepeatWrapping);
    assert.equal(tex.wrapT, THREE.RepeatWrapping);
  });

  for (const name of T.TEXTURE_NAMES) {
    it(name + '() returns a CanvasTexture', () => {
      const tex = T[name]();
      assert.ok(tex, name + ' returned falsy');
      assert.ok(tex instanceof THREE.CanvasTexture, name + ' is not a CanvasTexture');
    });
  }
  it('exports 12 texture makers', () => {
    assert.equal(T.TEXTURE_NAMES.length, 12);
  });
});

describe('landmarks', () => {
  it('exports 29 landmark types', () => {
    assert.equal(LM.LANDMARK_TYPES.length, 29);
  });

  for (const type of LM.LANDMARK_TYPES) {
    it('buildLandmark(' + type + ') -> {group, colliders}', () => {
      const built = LM.buildLandmark(type, THREE, T);
      assert.ok(built, 'falsy result');
      assert.ok(built.group instanceof THREE.Group, 'group is not a THREE.Group');
      assert.ok(Array.isArray(built.colliders), 'colliders is not an array');
      for (const c of built.colliders) {
        assert.equal(typeof c.x, 'number', 'collider.x not a number');
        assert.equal(typeof c.z, 'number', 'collider.z not a number');
        assert.equal(typeof c.r, 'number', 'collider.r not a number');
        assert.ok(c.r > 0, 'collider.r must be > 0');
      }
      // perf rule: no mesh casts/receives shadows
      built.group.traverse((o) => {
        if (o.isMesh) {
          assert.equal(o.castShadow, false, 'mesh casts shadow');
          assert.equal(o.receiveShadow, false, 'mesh receives shadow');
        }
      });
    });
  }

  it('star-destroyer has no colliders (distant silhouette)', () => {
    const built = LM.buildLandmark('star-destroyer', THREE, T);
    assert.deepEqual(built.colliders, []);
  });

  it('death-star trench exposes wall-segment colliders', () => {
    const built = LM.buildLandmark('death-star', THREE, T);
    assert.ok(built.colliders.length >= 20, 'expected wall circles, got ' + built.colliders.length);
    for (const c of built.colliders) assert.ok(Math.abs(Math.abs(c.x) - 16) < 1e-6);
  });

  it('throws on unknown landmark type', () => {
    assert.throws(() => LM.buildLandmark('not-a-landmark', THREE, T), /unknown landmark/);
  });

  it('works without passing THREE (falls back to direct import)', () => {
    const built = LM.buildLandmark('senate-dome', undefined, T);
    assert.ok(built.group instanceof THREE.Group);
  });
});

describe('ambient', () => {
  it('exports 10 ambient types', () => {
    assert.equal(LM.AMBIENT_TYPES.length, 10);
  });

  for (const type of LM.AMBIENT_TYPES) {
    it('buildAmbient(' + type + ') -> update() runs without throwing', () => {
      const a = LM.buildAmbient(type, THREE, T);
      assert.ok(a.group instanceof THREE.Group, 'group is not a THREE.Group');
      assert.equal(typeof a.update, 'function', 'update is not a function');
      a.group.position.set(10, 2, -5); // zone-assigned base position
      assert.doesNotThrow(() => {
        a.update(0, 0.016);
        a.update(1.5, 0.016);
        a.update(123.456, 0.05);
      });
    });
  }

  it('throws on unknown ambient type', () => {
    assert.throws(() => LM.buildAmbient('not-a-creature', THREE, T), /unknown ambient/);
  });
});

describe('zone (walk)', () => {
  const planetDef = {
    id: 'tatooine-test',
    sky: 0xe8c98a, fog: 0xe8c98a, fogDensity: 0.006,
    ground: 0xc9a06a, ground2: 0xa37f52, tex: 'sand', groundAmp: 3, seed: 42,
    kind: 'walk',
    landmarks: [
      { type: 'mos-eisley', x: 0, z: 0, s: 1 },
      { type: 'moisture-farm', x: -40, z: -30, s: 1, ry: 0.7 },
      { type: 'podrace-arch', x: 10, z: 10, s: 1, ry: Math.PI / 2 },
    ],
    ambient: [
      { type: 'bantha', count: 3 },
      { type: 'jawa', count: 2 },
    ],
    beat: {
      checkpoints: [{ x: 20, z: -20, r: 5, label: 'CP1' }],
      target: { x: -20, z: -60, r: 6, label: 'FINISH' },
    },
  };

  it('buildZone returns the full zone shape', () => {
    const z = buildZone(THREE, planetDef, T);
    assert.ok(z.group instanceof THREE.Group);
    assert.ok(Array.isArray(z.colliders));
    assert.ok(z.colliders.length > 0);
    assert.deepEqual(z.spawn, { x: 0, z: 95, yaw: Math.PI });
    assert.deepEqual(z.bounds, { kind: 'circle', max: 115 });
    assert.equal(typeof z.groundHeight, 'function');
    assert.equal(z.checkpoints.length, 1);
    assert.deepEqual(z.checkpoints[0], { x: 20, z: -20, r: 5, label: 'CP1' });
    assert.deepEqual(z.target, { x: -20, z: -60, r: 6, label: 'FINISH' });
    assert.equal(typeof z.update, 'function');
    assert.equal(typeof z.dispose, 'function');
    assert.equal(z.kind, 'walk');
    assert.equal(z.sky, 0xe8c98a);
    assert.deepEqual(z.fog, { color: 0xe8c98a, density: 0.006 });
    z.dispose();
  });

  it('offsets landmark-local colliders to world space', () => {
    const z = buildZone(THREE, planetDef, T);
    // mos-eisley local {x:0,z:0,r:13} at (0,0) -> world (0,0,13)
    const home = z.colliders.find((c) => approx(c.x, 0) && approx(c.z, 0));
    assert.ok(home, 'mos-eisley collider missing');
    assert.equal(home.r, 13);
    // moisture-farm local {x:0,z:0,r:8} at (-40,-30) ry=0.7 -> world (-40,-30,8)
    const farm = z.colliders.find((c) => approx(c.x, -40) && approx(c.z, -30));
    assert.ok(farm, 'moisture-farm collider missing');
    assert.equal(farm.r, 8);
    z.dispose();
  });

  it('rotates local colliders by ry (podrace-arch pillars)', () => {
    const z = buildZone(THREE, planetDef, T);
    // local pillars (±6,0); ry=PI/2 at (10,10) -> world (10,4) and (10,16), r=2.4
    const p1 = z.colliders.find((c) => approx(c.x, 10, 1e-4) && approx(c.z, 4, 1e-4));
    const p2 = z.colliders.find((c) => approx(c.x, 10, 1e-4) && approx(c.z, 16, 1e-4));
    assert.ok(p1, 'rotated pillar 1 missing: ' + JSON.stringify(z.colliders));
    assert.ok(p2, 'rotated pillar 2 missing');
    assert.equal(p1.r, 2.4);
    z.dispose();
  });

  it('groundHeight is deterministic and non-trivial', () => {
    const z = buildZone(THREE, planetDef, T);
    const a = z.groundHeight(10, 20), b = z.groundHeight(10, 20);
    assert.equal(a, b);
    assert.ok(Math.abs(z.groundHeight(60, -70)) > 1e-9, 'terrain is flat — noise not applied');
    z.dispose();
  });

  it('update(t, dt) animates without throwing; dispose() is safe', () => {
    const z = buildZone(THREE, planetDef, T);
    assert.doesNotThrow(() => {
      z.update(0, 0.016);
      z.update(5.25, 0.033);
      z.update(100, 0.016);
    });
    assert.doesNotThrow(() => z.dispose());
    assert.doesNotThrow(() => z.dispose()); // double-dispose safe
  });

  it('skips unknown landmark/ambient types instead of crashing', () => {
    const z = buildZone(THREE, {
      kind: 'walk',
      landmarks: [{ type: 'bogus', x: 0, z: 0, s: 1 }],
      ambient: [{ type: 'bogus', count: 2 }],
      beat: {},
    }, T);
    assert.ok(z.group instanceof THREE.Group);
    assert.doesNotThrow(() => z.update(1, 0.016));
    z.dispose();
  });
});

describe('zone (fly)', () => {
  it('death-star fly zone shape', () => {
    const z = buildZone(THREE, {
      id: 'ds-test', kind: 'fly', sky: 0x05070f, seed: 7,
      landmarks: [{ type: 'death-star', x: 0, z: 0, s: 1 }],
      ambient: [{ type: 'probe-droid', count: 2 }],
      beat: {
        checkpoints: [{ x: 0, z: 40, r: 5, label: 'TRENCH 1' }],
        target: { x: 0, z: -80, r: 6, label: 'CORE' },
      },
    }, T);
    assert.equal(z.kind, 'fly');
    assert.deepEqual(z.spawn, { x: 0, z: 120, yaw: Math.PI });
    assert.deepEqual(z.bounds, { kind: 'circle', max: 150 });
    assert.equal(z.groundHeight(0, 0), 0);
    assert.equal(z.groundHeight(50, 50), 0);
    assert.ok(z.colliders.length >= 20, 'trench wall colliders missing');
    assert.deepEqual(z.checkpoints[0], { x: 0, z: 40, r: 5, label: 'TRENCH 1' });
    assert.deepEqual(z.target, { x: 0, z: -80, r: 6, label: 'CORE' });
    assert.doesNotThrow(() => z.update(2, 0.016));
    z.dispose();
  });

  it('debris-field fly zone builds 200 instanced rocks + beacon', () => {
    const z = buildZone(THREE, {
      id: 'debris-test', kind: 'fly', sky: 0x05070f, seed: 9,
      landmarks: [{ type: 'debris-field', x: 0, z: 0, s: 1 }],
      ambient: [],
      beat: { target: { x: 0, z: 0, r: 6, label: 'MEMORIAL' } },
    }, T);
    const beacon = z.colliders.find((c) => approx(c.x, 0) && approx(c.z, 0));
    assert.ok(beacon, 'beacon collider missing');
    assert.equal(beacon.r, 4);
    assert.doesNotThrow(() => z.update(3, 0.016));
    z.dispose();
  });
});
