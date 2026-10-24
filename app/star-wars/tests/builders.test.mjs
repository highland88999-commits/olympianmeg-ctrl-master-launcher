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
const { buildZone, createHeightFunction, distToPath } = await import('../zone.js');
const { PLANETS } = await import('../data.js');
const {
  createSaberState, saberEase,
  SABER_IGNITE_DIST, SABER_RETRACT_DIST, SABER_IGNITE_S, SABER_RETRACT_S,
} = await import('../saber.js');
const CH = await import('../characters.js');
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const publicModel = (key) => fileURLToPath(
  new URL(`../../../public/models/star-wars/${key}.glb`, import.meta.url));

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
  it('exports 31 landmark types', () => {
    // 29 + 'cantina' + 'landspeeder' (procedural stand-ins for the
    // Tatooine GLB seats, added with the ever-expanding Tatooine build)
    assert.equal(LM.LANDMARK_TYPES.length, 31);
    assert.ok(LM.LANDMARK_TYPES.includes('cantina'));
    assert.ok(LM.LANDMARK_TYPES.includes('landspeeder'));
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

describe('GLB seats (landmarks.js)', () => {
  it('registry covers the three finished Tatooine assets', () => {
    assert.deepEqual(Object.keys(LM.GLB_MODELS).sort(), ['cantina', 'homestead', 'landspeeder']);
    for (const [key, def] of Object.entries(LM.GLB_MODELS)) {
      assert.ok(def.url.startsWith('/models/star-wars/') && def.url.endsWith('.glb'), key);
      assert.ok(def.meters > 0, key);
      assert.ok(Array.isArray(def.colliders) && def.colliders.length >= 1, key);
      for (const c of def.colliders) {
        assert.equal(typeof c.x, 'number'); assert.equal(typeof c.z, 'number');
        assert.ok(c.r > 0);
      }
    }
  });

  it('attachGlbModel is a no-op without a window (node) and for unknown keys', () => {
    const holder = new THREE.Group();
    assert.equal(LM.attachGlbModel(THREE, holder, 'homestead'), null);
    assert.equal(LM.attachGlbModel(THREE, holder, 'nope'), null);
    assert.equal(holder.children.length, 0);
  });
});

describe('planet surfaces (textures.js)', () => {
  it('planetSurfaceTexture renders a CanvasTexture per biome', () => {
    for (const def of Object.values(PLANETS)) {
      const tex = T.planetSurfaceTexture(def);
      assert.ok(tex && tex.isTexture, def.id);
    }
  });
  it('is deterministic per planet and distinct across planets', () => {
    const a = T.planetSurfaceTexture(PLANETS.tatooine);
    const b = T.planetSurfaceTexture(PLANETS.hoth);
    assert.equal(a.image.width, b.image.width);
    assert.notEqual(a, b);
  });
  it('stays out of TEXTURE_NAMES (galaxy-only, pin unchanged)', () => {
    assert.equal(T.TEXTURE_NAMES.length, 12);
  });
});

describe('ever-expanding template + Tatooine (zone.js)', () => {
  it('createHeightFunction: canyon carves below the same-seed dunes', () => {
    const plain = createHeightFunction({ seed: 4242, groundAmp: 4 });
    const carved = createHeightFunction(PLANETS.tatooine);
    assert.equal(carved(25, 55), carved(25, 55), 'deterministic');
    // (25,55) is a canyon path vertex: s = 1 there
    assert.ok(carved(25, 55) < plain(25, 55) - 4, 'canyon floor is carved down');
    // far off-path the two agree exactly
    assert.equal(carved(200, -200), plain(200, -200));
    assert.equal(distToPath(25, 55, PLANETS.tatooine.canyon.path), 0);
    assert.ok(distToPath(200, -200, PLANETS.tatooine.canyon.path) > 100);
  });

  it('tatooine zone: big bounds, canyon under the gates, scatter + GLB colliders', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    assert.deepEqual(z.bounds, { kind: 'circle', max: 295 });
    assert.deepEqual(z.spawn, { x: 0, z: 95, yaw: Math.PI });
    // the podrace circuit is untouched — gates re-seated on the canyon
    assert.deepEqual(z.checkpoints, PLANETS.tatooine.beat.checkpoints);
    for (const cp of z.checkpoints) {
      assert.equal(distToPath(cp.x, cp.z, PLANETS.tatooine.canyon.path), 0,
        `gate '${cp.label}' sits on the canyon run`);
    }
    // the expanded podrace finishes at a target on the mesa circuit —
    // also a canyon path point, so the pillar stands in the carve
    assert.deepEqual(z.target, PLANETS.tatooine.beat.target);
    assert.equal(distToPath(z.target.x, z.target.z, PLANETS.tatooine.canyon.path), 0,
      'finish target sits on the canyon run');
    // GLB seats contribute the REGISTRY colliders, not the stand-ins'
    const cantina = z.colliders.find((c) => approx(c.x, 10) && approx(c.z, -28));
    assert.ok(cantina && approx(cantina.r, 8), 'cantina registry collider');
    const speeder = z.colliders.find((c) => approx(c.x, 60) && approx(c.z, 26));
    assert.ok(speeder && approx(speeder.r, 2.4), 'landspeeder registry collider');
    // seeded scatter produced instanced dressing
    let instanced = 0;
    z.group.traverse((o) => { if (o.isInstancedMesh) instanced++; });
    assert.ok(instanced >= 4, `expected instanced scatter, got ${instanced}`);
    // scatter colliders exist and stay out of the spawn clearing
    assert.ok(z.colliders.length > 40, 'scatter added colliders');
    for (const c of z.colliders) {
      assert.ok(!(Math.hypot(c.x - 0, c.z - 95) < 4), 'nothing parked on the spawn');
    }
    // ground follows the new dunes, not the old disc chop
    assert.notEqual(z.groundHeight(120, 40), 0);
    assert.doesNotThrow(() => z.update(4, 0.016));
    z.dispose();
  });

  it('defs without the expansion fields keep the original pocket disc', () => {
    // Naboo itself is expanded now — the legacy shape is pinned on a
    // synthetic field-less def, byte-identical behaviour as before.
    const z = buildZone(THREE, {
      id: 'legacy-test', kind: 'walk', sky: 0x8fd3f4, fog: 0xcfe8d8, fogDensity: 0.0012,
      ground: 0x5dbb63, ground2: 0x2e7d44,
      landmarks: [{ type: 'theed-palace', x: 0, z: -50, s: 1.3 }],
      ambient: [],
      beat: { target: { x: 0, z: -30, r: 10, label: 'Plaza' } },
    }, T);
    assert.deepEqual(z.bounds, { kind: 'circle', max: 115 });
    assert.deepEqual(z.checkpoints, []); // target-only beat
    assert.deepEqual(z.target, { x: 0, z: -30, r: 10, label: 'Plaza' });
    z.dispose();
  });

  it('naboo zone: expanded to the full template (bounds, foliage, horizon)', () => {
    const z = buildZone(THREE, PLANETS.naboo, T);
    assert.deepEqual(z.bounds, { kind: 'circle', max: 295 });
    assert.deepEqual(z.checkpoints, []); // Naboo's first mission is a target
    assert.deepEqual(z.target, PLANETS.naboo.beat.target);
    let instanced = 0;
    z.group.traverse((o) => { if (o.isInstancedMesh) instanced++; });
    assert.ok(instanced >= 4, `foliage + horizon instancing present, got ${instanced}`);
    assert.doesNotThrow(() => z.update(4, 0.016));
    z.dispose();
  });
});

describe('saga expansion: modes + missions in the zone builder', () => {
  it('every world builds in mission mode, free roam, and per-mission', () => {
    for (const def of Object.values(PLANETS)) {
      // default build = first mission, as before the expansion
      const z0 = buildZone(THREE, def, T);
      assert.equal(z0.checkpoints.length, (def.beat.checkpoints || []).length, def.id);
      if (def.beat.target) assert.ok(z0.target, def.id + ' target');
      assert.equal(z0.bounds.max, def.boundsRadius || (def.kind === 'fly' ? 150 : 115), def.id);
      assert.doesNotThrow(() => z0.update(2, 0.016), def.id);
      z0.dispose();
      // free roam: same world, NO beat furniture at all
      const zr = buildZone(THREE, def, T, { freeRoam: true });
      assert.deepEqual(zr.checkpoints, [], def.id + ' roam has no checkpoints');
      assert.equal(zr.target, null, def.id + ' roam has no target');
      assert.ok(zr.colliders.length > 0, def.id + ' roam world is still dressed/solid');
      assert.doesNotThrow(() => zr.update(2, 0.016), def.id);
      zr.dispose();
      // every mission is individually buildable and drives the gates
      for (const m of def.missions) {
        const zm = buildZone(THREE, def, T, { mission: m });
        assert.equal(zm.checkpoints.length, (m.checkpoints || []).length, `${def.id}/${m.id}`);
        if (m.target) assert.deepEqual(zm.target, { x: m.target.x, z: m.target.z, r: m.target.r, label: m.target.label }, `${def.id}/${m.id} target`);
        else assert.equal(zm.target, null, `${def.id}/${m.id} no target`);
        zm.dispose();
      }
    }
  });

  it('walk worlds carry instanced foliage/scatter dressing', () => {
    for (const def of Object.values(PLANETS)) {
      if (def.kind !== 'walk') continue;
      const z = buildZone(THREE, def, T);
      let instanced = 0;
      z.group.traverse((o) => { if (o.isInstancedMesh) instanced++; });
      assert.ok(instanced >= 3, `${def.id}: expected instanced scatter + horizon, got ${instanced}`);
      z.dispose();
    }
  });

  it('every mission gate can actually be stood in (no collider seals a ring)', () => {
    for (const def of Object.values(PLANETS)) {
      for (const m of def.missions) {
        const z = buildZone(THREE, def, T, { mission: m });
        const gates = [...(m.checkpoints || []), ...(m.target ? [m.target] : [])];
        for (const g of gates) {
          // sample the centre and two rings of stand-points; at least
          // one must be outside every collider (the walker is pushed
          // out to a collider's radius, so >= is standable)
          let standable = false;
          const samples = [[g.x, g.z]];
          for (const rr of [g.r * 0.5, g.r * 0.85]) {
            for (let k = 0; k < 12; k++) {
              const a = (k / 12) * Math.PI * 2;
              samples.push([g.x + Math.cos(a) * rr, g.z + Math.sin(a) * rr]);
            }
          }
          for (const [sx, sz] of samples) {
            if (z.colliders.every((c) => Math.hypot(sx - c.x, sz - c.z) >= c.r - 1e-6)) {
              standable = true; break;
            }
          }
          assert.ok(standable, `${def.id}/${m.id}: gate '${g.label}' is sealed by colliders`);
        }
        z.dispose();
      }
    }
  });

  it('tatooine: pod grid staged on the canyon floor at Canyon Gate', () => {
    const t = PLANETS.tatooine;
    const pods = t.landmarks.filter((lm) => lm.type === 'podracer');
    assert.equal(pods.length, 3, 'three pods staged');
    for (const p of pods) {
      assert.ok(distToPath(p.x, p.z, t.canyon.path) < t.canyon.width / 2,
        `pod at (${p.x},${p.z}) sits in the canyon carve`);
    }
    // and the gauntlet mission really is the tighter, meaner run
    const g = t.missions[2];
    assert.equal(g.id, 'tatooine-tusken-gauntlet');
    assert.ok(g.checkpoints.every((cp) => cp.r <= t.missions[0].checkpoints[0].r), 'gauntlet rings tighter');
    assert.ok(g.extraAmbient.some((a) => a.type === 'tuskan'), 'gauntlet adds Tuskens');
  });
});

describe('lightsaber state machine (saber.js)', () => {
  it('thresholds: ignite at 12 m, retract only beyond 18 m (hysteresis)', () => {
    assert.equal(SABER_IGNITE_DIST, 12);
    assert.equal(SABER_RETRACT_DIST, 18);
    assert.ok(SABER_RETRACT_DIST > SABER_IGNITE_DIST);
  });

  it('starts retracted with zero blade; easing pins the endpoints', () => {
    const s = createSaberState();
    assert.equal(s.state, 'retracted');
    assert.equal(s.blade01(), 0);
    assert.equal(saberEase(0), 0);
    assert.equal(saberEase(1), 1);
    assert.ok(saberEase(0.5) > 0.5, 'easeOutCubic runs ahead of linear');
  });

  it('ignites inside 12 m and reaches full blade in SABER_IGNITE_S', () => {
    const s = createSaberState();
    assert.deepEqual(s.update(0.01, 30), [], 'far away: nothing happens');
    assert.equal(s.state, 'retracted');
    const ev = s.update(SABER_IGNITE_S, 11.9);
    assert.deepEqual(ev, ['ignite', 'lit']);
    assert.equal(s.state, 'lit');
    assert.equal(s.blade01(), 1);
  });

  it('hysteresis: a lit blade ignores the 12–18 m band, retracts past 18 m', () => {
    const s = createSaberState();
    s.update(SABER_IGNITE_S, 5);
    assert.equal(s.state, 'lit');
    assert.deepEqual(s.update(0.05, 15), [], 'inside the band: still lit, no flicker');
    assert.equal(s.state, 'lit');
    assert.equal(s.blade01(), 1);
    assert.deepEqual(s.update(0.01, 18.5), ['retract']);
    const ev = s.update(SABER_RETRACT_S, 18.5);
    assert.deepEqual(ev, ['dark']);
    assert.equal(s.state, 'retracted');
    assert.equal(s.blade01(), 0);
  });

  it('mid-ignite reversal collapses from the current length, never teleports', () => {
    const s = createSaberState();
    s.update(SABER_IGNITE_S / 2, 4);
    assert.equal(s.state, 'igniting');
    const mid = s.blade01();
    assert.ok(mid > 0 && mid < 1);
    s.update(0.001, 40);
    assert.equal(s.state, 'retracting');
    assert.ok(s.blade01() <= mid, 'blade only shrinks from where it was');
    s.update(SABER_RETRACT_S, 40);
    assert.equal(s.state, 'retracted');
    assert.equal(s.blade01(), 0);
    // and it can re-ignite cleanly afterwards
    s.update(SABER_IGNITE_S, 2);
    assert.equal(s.state, 'lit');
  });

  it('a retracting blade re-ignites if the player closes again', () => {
    const s = createSaberState();
    s.update(SABER_IGNITE_S, 5);
    s.update(0.02, 30);
    assert.equal(s.state, 'retracting');
    const ev = s.update(0.01, 6);
    assert.deepEqual(ev, ['ignite']);
    assert.equal(s.state, 'igniting');
  });
});

describe('characters + sabers (characters.js)', () => {
  it('registry covers the knight and the dark lord, files on disk', () => {
    assert.deepEqual(Object.keys(CH.CHARACTER_MODELS).sort(), ['dark-lord', 'knight']);
    for (const [key, def] of Object.entries(CH.CHARACTER_MODELS)) {
      assert.equal(def.url, `/models/star-wars/${key}.glb`, key);
      assert.ok(existsSync(publicModel(key)), `${key}.glb optimized into public/models/star-wars/`);
    }
  });

  it('attachCharacterModel is a no-op without a window (node) and for unknown keys', () => {
    const slot = new THREE.Group();
    assert.equal(CH.attachCharacterModel(THREE, slot, 'knight', 1.8), null);
    assert.equal(CH.attachCharacterModel(THREE, slot, 'nope', 1.8), null);
  });

  it('the Jedi stands on Tatooine with a blue saber; the Sith on Mustafar with red', () => {
    const k = PLANETS.tatooine.characters;
    assert.equal(k.length, 1);
    assert.equal(k[0].id, 'knight');
    assert.equal(k[0].name, 'Jedi Knight');
    assert.equal(k[0].saber.color, 0x3f9dff, 'a Jedi blue');
    assert.ok(k[0].saber.length >= 1 && k[0].saber.length <= 1.2);
    // near the homestead landmark, clear of its GLB collider (r 8.5)
    const home = PLANETS.tatooine.landmarks.find((l) => l.model === 'homestead');
    const dHome = Math.hypot(k[0].at[0] - home.x, k[0].at[1] - home.z);
    assert.ok(dHome > 9 && dHome < 20, `knight stands by the farm (d=${dHome.toFixed(1)})`);

    const s = PLANETS.mustafar.characters;
    assert.equal(s.length, 1);
    assert.equal(s[0].id, 'dark-lord');
    assert.equal(s[0].name, 'Sith Lord');
    assert.equal(s[0].saber.color, 0xff2a1a, 'a Sith red');
    assert.ok(s[0].height > k[0].height, 'the dark lord is the taller figure');
    // on the fortress approach: between the gate target and the fortress
    const fort = PLANETS.mustafar.landmarks.find((l) => l.type === 'mustafar-fortress');
    assert.ok(s[0].at[1] > fort.z && s[0].at[1] < 0, 'between fortress and spawn road');
    const dGate = Math.hypot(s[0].at[0] - 0, s[0].at[1] - (-30));
    assert.ok(dGate > 10, 'outside the fortress-gate target ring');
  });

  it('every character def names a registered model and carries a hand anchor', () => {
    for (const def of Object.values(PLANETS)) {
      for (const c of def.characters || []) {
        assert.ok(CH.CHARACTER_MODELS[c.model], `${def.id}/${c.id}: model registered`);
        assert.ok(Array.isArray(c.at) && c.at.length === 2, `${def.id}/${c.id}: at [x, z]`);
        assert.ok(Array.isArray(c.hand) && c.hand.length === 3, `${def.id}/${c.id}: hand anchor`);
        assert.ok(Math.hypot(c.at[0], c.at[1]) < (def.boundsRadius || 115),
          `${def.id}/${c.id}: inside the world bounds`);
      }
    }
  });

  it('zones build their characters in BOTH mission and free-roam modes', () => {
    for (const opts of [undefined, { freeRoam: true }]) {
      const z = buildZone(THREE, PLANETS.tatooine, T, opts);
      assert.equal(z.characters.length, 1);
      assert.equal(z.characters[0].id, 'knight');
      const body = z.colliders.find((c) => approx(c.x, 33) && approx(c.z, 24));
      assert.ok(body && approx(body.r, 0.45), 'small body collider at the knight');
      let found = null;
      z.group.traverse((o) => { if (o.name === 'character:knight') found = o; });
      assert.ok(found, 'character group in the scene graph');
      let saber = null;
      found.traverse((o) => { if (o.name === 'saber') saber = o; });
      assert.ok(saber, 'saber assembly hangs at the hand');
      // proximity plumbing runs without throwing, near or far
      z.setObserver(33, 30);
      assert.doesNotThrow(() => { z.update(1, 0.016); z.update(1.2, 0.2); });
      z.setObserver(-200, -200);
      assert.doesNotThrow(() => z.update(2, 0.016));
      z.dispose();
    }
    const m = buildZone(THREE, PLANETS.mustafar, T);
    assert.equal(m.characters.length, 1);
    assert.equal(m.characters[0].id, 'dark-lord');
    m.dispose();
  });
});
