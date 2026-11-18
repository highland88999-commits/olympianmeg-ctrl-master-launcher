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
const { buildZone, buildWorldScatter, createHeightFunction, distToPath, spanSeatY } = await import('../zone.js');
const { PLANETS } = await import('../data.js');
const {
  createSaberState, saberEase,
  SABER_IGNITE_DIST, SABER_RETRACT_DIST, SABER_IGNITE_S, SABER_RETRACT_S,
  SABER_DRAW_DIST, SABER_DRAW_S, SABER_HOLSTER_S,
} = await import('../saber.js');
const CH = await import('../characters.js');
const VH = await import('../vehicles.js');
const WC = await import('../../../lib/world/walk-controls.js');
const { SW_STREAM } = await import('../../../lib/world/streaming.js');
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const publicModel = (key) => fileURLToPath(
  new URL(`../../../public/models/star-wars/${key}.glb`, import.meta.url));

const approx = (a, b, eps) => Math.abs(a - b) < (eps == null ? 1e-6 : eps);

// Checkpoint/target records now carry their meshes — beam + zone on a
// checkpoint, pillar + zone on the target (rings -> beams, Nov 15, 2026,
// so page.jsx can recolour them green on reach). assert.deepEqual on a
// record would walk the whole scene graph through mesh.parent (and OOM
// the runner on the Tatooine zone), so compare the plain data fields.
const markerFields = (m) => ({ x: m.x, z: m.z, r: m.r, label: m.label });

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
  it('exports 33 landmark types', () => {
    // 29 + 'cantina' + 'landspeeder' (procedural stand-ins for the
    // Tatooine GLB seats, added with the ever-expanding Tatooine build)
    // + 'kyber-forge' (the Kyber Smith's seat at the Jedi Temple)
    // + 'crashed-ship' (the Nov 15, 2026 crash site that replaced the
    // army-truck rover — the rover builder + GLB seat are gone)
    assert.equal(LM.LANDMARK_TYPES.length, 33);
    assert.ok(LM.LANDMARK_TYPES.includes('cantina'));
    assert.ok(LM.LANDMARK_TYPES.includes('landspeeder'));
    assert.ok(LM.LANDMARK_TYPES.includes('kyber-forge'));
    assert.ok(LM.LANDMARK_TYPES.includes('crashed-ship'));
    assert.ok(!LM.LANDMARK_TYPES.includes('rover'), 'the rover landmark type is gone');
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
    assert.equal(z.bounds, null, 'endless: no bounds (Merlin, Nov 18, 2026)');
    assert.equal(typeof z.groundHeight, 'function');
    assert.equal(z.checkpoints.length, 1);
    assert.deepEqual(markerFields(z.checkpoints[0]), { x: 20, z: -20, r: 5, label: 'CP1' });
    assert.deepEqual(markerFields(z.target), { x: -20, z: -60, r: 6, label: 'FINISH' });
    assert.equal(typeof z.update, 'function');
    assert.equal(typeof z.dispose, 'function');
    assert.equal(z.kind, 'walk');
    assert.equal(z.sky, 0xe8c98a);
    assert.deepEqual(z.fog, { color: 0xe8c98a, density: 0.006 });
    z.dispose();
  });

  it('offsets landmark-local colliders to world space', () => {
    const z = buildZone(THREE, planetDef, T);
    // mos-eisley local {x:0,z:0,r:13.5} at (0,0) -> world (0,0,13.5)
    const home = z.colliders.find((c) => approx(c.x, 0) && approx(c.z, 0));
    assert.ok(home, 'mos-eisley collider missing');
    assert.equal(home.r, 13.5);
    // moisture-farm centre {x:0,z:0,r:8.4} at (-40,-30) ry=0.7 -> world (-40,-30,8.4)
    // (the dome's entrance drum reaches 8.2; the vaporator poles carry
    // their own colliders — all-worlds QA, 2026-10-23)
    const farm = z.colliders.find((c) => approx(c.x, -40) && approx(c.z, -30));
    assert.ok(farm, 'moisture-farm collider missing');
    assert.equal(farm.r, 8.4);
    z.dispose();
  });

  it('rotates local colliders by ry (podrace-arch pillars)', () => {
    const z = buildZone(THREE, planetDef, T);
    // local pillars (±6,0); ry=PI/2 at (10,10) -> world (10,4) and (10,16), r=2.9
    // (the pillar's 4 x 4 base has a 2.83 half-diagonal — all-worlds QA)
    const p1 = z.colliders.find((c) => approx(c.x, 10, 1e-4) && approx(c.z, 4, 1e-4));
    const p2 = z.colliders.find((c) => approx(c.x, 10, 1e-4) && approx(c.z, 16, 1e-4));
    assert.ok(p1, 'rotated pillar 1 missing: ' + JSON.stringify(z.colliders));
    assert.ok(p2, 'rotated pillar 2 missing');
    assert.equal(p1.r, 2.9);
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
    assert.equal(z.bounds, null, 'endless: no bounds (Merlin, Nov 18, 2026)');
    assert.equal(z.groundHeight(0, 0), 0);
    assert.equal(z.groundHeight(50, 50), 0);
    assert.ok(z.colliders.length >= 20, 'trench wall colliders missing');
    assert.deepEqual(markerFields(z.checkpoints[0]), { x: 0, z: 40, r: 5, label: 'TRENCH 1' });
    assert.deepEqual(markerFields(z.target), { x: 0, z: -80, r: 6, label: 'CORE' });
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
  it('registry covers the finished Tatooine assets', () => {
    // the 'tatooine-rover' seat was removed with the rover (Nov 15,
    // 2026) — every remaining seat lives under /models/star-wars/
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

  it('the landspeeder GLB turns its measured +Z nose to the drive heading', () => {
    // z-slice profiles of landspeeder.glb: the nose tapers at +Z;
    // vehicles drive toward the landmark group's -Z, so the fitted
    // model carries a half-turn yawFix inside its slot.
    assert.equal(LM.GLB_MODELS.landspeeder.yawFix, Math.PI);
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

  it('tatooine zone: big home region, canyon under the gates, scatter + GLB colliders', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    assert.equal(z.bounds, null, 'endless: no bounds (Merlin, Nov 18, 2026)');
    assert.deepEqual(z.spawn, { x: 0, z: 95, yaw: Math.PI });
    // the podrace circuit is untouched — gates re-seated on the canyon
    assert.deepEqual(z.checkpoints.map(markerFields), PLANETS.tatooine.beat.checkpoints);
    for (const cp of z.checkpoints) {
      assert.equal(distToPath(cp.x, cp.z, PLANETS.tatooine.canyon.path), 0,
        `gate '${cp.label}' sits on the canyon run`);
    }
    // the expanded podrace finishes at a target on the mesa circuit —
    // also a canyon path point, so the pillar stands in the carve
    assert.deepEqual(markerFields(z.target), PLANETS.tatooine.beat.target);
    assert.equal(distToPath(z.target.x, z.target.z, PLANETS.tatooine.canyon.path), 0,
      'finish target sits on the canyon run');
    // GLB seats contribute the REGISTRY colliders, not the stand-ins'
    const cantina = z.colliders.find((c) => approx(c.x, 10) && approx(c.z, -28));
    assert.ok(cantina && approx(cantina.r, 8.4), 'cantina registry collider');
    const speeder = z.colliders.find((c) => approx(c.x, 60) && approx(c.z, 26));
    assert.ok(speeder && approx(speeder.r, 2.9), 'landspeeder registry collider');
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
    assert.equal(z.bounds, null, 'endless: no bounds (Merlin, Nov 18, 2026)');
    assert.deepEqual(z.checkpoints, []); // target-only beat
    assert.deepEqual(markerFields(z.target), { x: 0, z: -30, r: 10, label: 'Plaza' });
    z.dispose();
  });

  it('naboo zone: expanded to the full template (foliage, horizon)', () => {
    const z = buildZone(THREE, PLANETS.naboo, T);
    assert.equal(z.bounds, null, 'endless: no bounds (Merlin, Nov 18, 2026)');
    assert.deepEqual(z.checkpoints, []); // Naboo's first mission is a target
    assert.deepEqual(markerFields(z.target), PLANETS.naboo.beat.target);
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
      assert.equal(z0.bounds, null, def.id + ' endless: no bounds');
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
        if (m.target) assert.deepEqual(markerFields(zm.target), { x: m.target.x, z: m.target.z, r: m.target.r, label: m.target.label }, `${def.id}/${m.id} target`);
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
  /* Drive a fresh state to a lit blade at close range: the draw
   * (holster law) must complete before the blade can ignite. */
  const lightBlade = (s, dist = 5) => {
    s.update(SABER_DRAW_S, dist);
    s.update(SABER_IGNITE_S, dist);
    assert.equal(s.state, 'lit');
  };

  it('thresholds: ignite at 12 m, retract only beyond 18 m (hysteresis)', () => {
    assert.equal(SABER_IGNITE_DIST, 12);
    assert.equal(SABER_RETRACT_DIST, 18);
    assert.ok(SABER_RETRACT_DIST > SABER_IGNITE_DIST);
    assert.equal(SABER_DRAW_DIST, 24);
    assert.ok(SABER_DRAW_DIST > SABER_RETRACT_DIST, 'the draw ring wraps the blade rings');
  });

  it('starts retracted AND holstered with zero blade; easing pins the endpoints', () => {
    const s = createSaberState();
    assert.equal(s.state, 'retracted');
    assert.equal(s.blade01(), 0);
    assert.equal(s.grip, 'holstered');
    assert.equal(s.grip01(), 0);
    assert.equal(saberEase(0), 0);
    assert.equal(saberEase(1), 1);
    assert.ok(saberEase(0.5) > 0.5, 'easeOutCubic runs ahead of linear');
  });

  it('draws inside 24 m first, then ignites inside 12 m', () => {
    const s = createSaberState();
    assert.deepEqual(s.update(0.01, 30), [], 'far away: nothing happens');
    assert.equal(s.state, 'retracted');
    assert.equal(s.grip, 'holstered');
    const ev = s.update(SABER_DRAW_S, 11.9);
    assert.deepEqual(ev, ['draw', 'inhand', 'ignite'],
      'the draw completes, then ignition begins');
    assert.equal(s.state, 'igniting');
    assert.equal(s.blade01(), 0, 'the draw consumed the tick — no blade yet');
    const ev2 = s.update(SABER_IGNITE_S, 11.9);
    assert.deepEqual(ev2, ['lit']);
    assert.equal(s.state, 'lit');
    assert.equal(s.blade01(), 1);
  });

  it('hysteresis: a lit blade ignores the 12–18 m band, retracts past 18 m', () => {
    const s = createSaberState();
    lightBlade(s);
    assert.deepEqual(s.update(0.05, 15), [], 'inside the band: still lit, no flicker');
    assert.equal(s.state, 'lit');
    assert.equal(s.blade01(), 1);
    assert.deepEqual(s.update(0.01, 18.5), ['retract']);
    const ev = s.update(SABER_RETRACT_S, 18.5);
    assert.deepEqual(ev, ['dark']);
    assert.equal(s.state, 'retracted');
    assert.equal(s.blade01(), 0);
    assert.equal(s.grip, 'hand', 'inside 24 m the hilt stays in hand');
  });

  it('mid-ignite reversal collapses from the current length, never teleports', () => {
    const s = createSaberState();
    s.update(SABER_DRAW_S, 4); // drawn; ignition begins
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
    // and it can re-ignite cleanly afterwards (grip never holstered:
    // the re-close lands before the holster tick)
    s.update(SABER_IGNITE_S, 2);
    assert.equal(s.state, 'lit');
  });

  it('a retracting blade re-ignites if the player closes again', () => {
    const s = createSaberState();
    lightBlade(s);
    s.update(0.02, 30);
    assert.equal(s.state, 'retracting');
    const ev = s.update(0.01, 6);
    assert.deepEqual(ev, ['ignite']);
    assert.equal(s.state, 'igniting');
  });

  it('holster law: belt beyond 24 m, draw inside it, re-holster once dark + gone', () => {
    const s = createSaberState();
    assert.deepEqual(s.update(1, 40), [], 'far: no draw, no events');
    assert.equal(s.grip, 'holstered');
    // inside the draw ring but outside ignition: hilt travels, blade stays dark
    assert.deepEqual(s.update(0.01, 20), ['draw']);
    assert.equal(s.grip, 'drawing');
    assert.deepEqual(s.update(SABER_DRAW_S, 20), ['inhand']);
    assert.equal(s.grip, 'hand');
    assert.equal(s.grip01(), 1);
    assert.equal(s.state, 'retracted', 'no ignition at 20 m');
    // light it, kill it inside the 18–24 m band: grip stays in hand
    s.update(SABER_IGNITE_S, 5);
    assert.equal(s.state, 'lit');
    assert.deepEqual(s.update(0.01, 20), ['retract']);
    assert.deepEqual(s.update(SABER_RETRACT_S, 20), ['dark']);
    assert.equal(s.grip, 'hand');
    // walk away beyond 24 m: the hilt returns to the belt
    assert.deepEqual(s.update(0.01, 30), [], 'holstering starts silently');
    assert.equal(s.grip, 'holstering');
    assert.deepEqual(s.update(SABER_HOLSTER_S, 30), ['holster']);
    assert.equal(s.grip, 'holstered');
    assert.equal(s.grip01(), 0);
  });

  it('a draw reversed mid-way sends the hilt back toward the belt', () => {
    const s = createSaberState();
    s.update(SABER_DRAW_S / 2, 20);
    assert.equal(s.grip, 'drawing');
    const mid = s.grip01();
    assert.ok(mid > 0 && mid < 1);
    s.update(0.01, 40);
    assert.equal(s.grip, 'holstering');
    assert.ok(s.grip01() <= mid, 'grip travel only reverses, never teleports');
    s.update(SABER_HOLSTER_S, 40);
    assert.equal(s.grip, 'holstered');
    assert.equal(s.grip01(), 0);
  });

  it('never ignites from the belt, even point-blank, before the draw lands', () => {
    const s = createSaberState();
    s.update(SABER_DRAW_S / 2, 2);
    assert.equal(s.grip, 'drawing');
    assert.equal(s.state, 'retracted', 'mid-draw at 2 m: blade still dark');
    assert.equal(s.blade01(), 0);
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
        assert.ok(Array.isArray(c.belt) && c.belt.length === 3, `${def.id}/${c.id}: belt anchor (holster law)`);
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
      assert.ok(saber, 'saber assembly present');
      // holster law: at spawn (observer far away) the hilt rides the
      // BELT anchor, not the hand
      const belt = PLANETS.tatooine.characters[0].belt;
      assert.ok(approx(saber.position.x, belt[0]) && approx(saber.position.y, belt[1])
        && approx(saber.position.z, belt[2]), 'hilt starts holstered at the belt');
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

describe('QA item 1 — walker gravity: exact ground follow + terrain fidelity', () => {
  it('snapY pins walker y to groundHeight + eye on every step, dunes and canyon alike', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    const world = {
      groundHeight: z.groundHeight, colliders: z.colliders,
      bounds: z.bounds, snapY: true, eye: WC.WALK_EYE,
    };
    // a straight west->east line at z=40 crosses the canyon carve
    const w = WC.createWalker({ x: -280, z: 40, yaw: -Math.PI / 2 });
    let crossedCarve = false;
    for (let i = 0; i < 60 * 70; i++) {
      WC.stepWalker(w, { fwd: 1 }, 1 / 60, world);
      const dev = Math.abs(w.pos.y - WC.WALK_EYE - z.groundHeight(w.pos.x, w.pos.z));
      assert.ok(dev < 1e-6, `clearance drifted ${dev} at (${w.pos.x.toFixed(1)}, ${w.pos.z.toFixed(1)})`);
      if (Math.abs(w.pos.x - (-84)) < 3) crossedCarve = true; // canyon path vertex country
      if (w.pos.x > 270) break;
    }
    assert.ok(crossedCarve, 'the line really crossed the canyon');
    z.dispose();
  });

  it('the rendered terrain mesh tracks the analytic heightfield (no visual float/clip)', () => {
    // ENDLESS (Nov 18, 2026): the ground is a ring of chunk meshes
    // now, not one disc — raycast the whole ring, same probes.
    const z = buildZone(THREE, PLANETS.tatooine, T);
    z.group.updateMatrixWorld(true);
    const chunks = [];
    let verts = 0;
    z.group.traverse((o) => {
      if (o.name === 'terrain-chunk') {
        chunks.push(o);
        verts += o.geometry.attributes.position.count;
      }
    });
    assert.ok(chunks.length > 100, `chunk ring present, got ${chunks.length} chunks`);
    assert.ok(verts > 30000, `dense chunked terrain, got ${verts} verts`);
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    let maxDev = 0, samples = 0;
    const probe = (x, zz) => {
      ray.set(new THREE.Vector3(x, 200, zz), down);
      const hits = ray.intersectObjects(chunks, false);
      if (!hits.length) return;
      samples++;
      const dev = Math.abs(hits[0].point.y - z.groundHeight(x, zz));
      if (dev > maxDev) maxDev = dev;
    };
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      for (let r = 12; r <= 285; r += 13) probe(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    // and a dense walk across the canyon carve itself
    for (let x = -160; x <= 60; x += 4) probe(x, 40);
    for (const [px, pz] of PLANETS.tatooine.canyon.path) {
      probe(px + 3, pz + 2); probe(px - 4, pz - 3); probe(px, pz + 6);
    }
    assert.ok(samples > 200, `probed ${samples} points`);
    assert.ok(maxDev <= 0.2, `mesh deviates ${maxDev.toFixed(3)} m from groundHeight (was 2.39 m)`);
    z.dispose();
  });
});

describe('QA item 3 — span seating: buildings meet the sand', () => {
  it('spanSeatY takes the footprint-ring minimum and honours the drop clamp', () => {
    const slope = (x) => x * 0.1;
    assert.equal(spanSeatY(slope, 0, 0, 10, {}), -1); // ring min at x=-10
    assert.equal(spanSeatY(slope, 0, 0, 10, { clampDrop: 0.4 }), -0.4);
    assert.equal(spanSeatY(() => 3.3, 5, 5, 8, {}), 3.3); // flat stays flat
  });

  it('the Tatooine GLB seats sit at span-seat minus the footing sink', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    const find = (name) => z.group.children.find((c) => c.name === name);
    const farm = find('landmark:moisture-farm');
    assert.ok(farm, 'homestead landmark group named');
    const expectFarm = spanSeatY(z.groundHeight, 45, 20, 8.5, { clampDrop: 3.5 }) - 0.3;
    assert.ok(approx(farm.position.y, expectFarm, 1e-6),
      `homestead seat ${farm.position.y} == span seat ${expectFarm}`);
    assert.ok(farm.position.y <= z.groundHeight(45, 20) - 0.29,
      'never seated above the centre sample (the old hover)');
    // Mos Eisley + its minaret: one group, span-seated with the
    // procedural clamp — grounded, not buried.
    const eisley = find('landmark:mos-eisley');
    assert.ok(eisley, 'mos-eisley landmark group named');
    assert.ok(eisley.position.y <= z.groundHeight(0, -40) - 0.29, 'minaret base meets the sand');
    assert.ok(eisley.position.y >= z.groundHeight(0, -40) - 2.31, 'clamp keeps it out of the ground');
    z.dispose();
  });
});

describe('QA item 2 — the podracer is solid from every approach', () => {
  const pod = PLANETS.tatooine.landmarks.find((l) => l.type === 'podracer');
  const pc = Math.cos(pod.ry), ps = Math.sin(pod.ry);
  const toLocal = (wx, wz) => {
    const dx = wx - pod.x, dz = wz - pod.z;
    return { x: (dx * pc - dz * ps) / pod.s, z: (dx * ps + dz * pc) / pod.s };
  };
  const fromLocal = (lx, lz) => ({
    x: pod.x + (lx * pc + lz * ps) * pod.s,
    z: pod.z + (-lx * ps + lz * pc) * pod.s,
  });
  /* The visual hull in local plan view: engine cylinders + intake
   * ball, and the pod ellipsoid. A walker point inside either means
   * the player is standing inside the machine. */
  const insideHull = (lx, lz) => {
    for (const side of [-1, 1]) {
      if (Math.abs(lx - side * 2.4) < 1.0 && lz > -3.4 && lz < 1.72) return 'engine cylinder';
      if (Math.hypot(lx - side * 2.4, lz + 3.55) < 0.45) return 'intake ball';
    }
    if (Math.abs(lx) < 1.08 && lz > 1.2 && lz < 5.6) return 'pod body';
    return null;
  };
  function walkInto(z, fromL, toL, seconds) {
    const from = fromLocal(fromL[0], fromL[1]);
    const to = fromLocal(toL[0], toL[1]);
    const w = WC.createWalker({
      x: from.x, z: from.z,
      yaw: Math.atan2(-(to.x - from.x), -(to.z - from.z)),
    });
    const world = {
      groundHeight: z.groundHeight, colliders: z.colliders,
      bounds: z.bounds, snapY: true,
    };
    let violation = null;
    for (let i = 0; i < seconds * 60; i++) {
      WC.stepWalker(w, { fwd: 1 }, 1 / 60, world);
      const l = toLocal(w.pos.x, w.pos.z);
      const hit = insideHull(l.x, l.z);
      if (hit && !violation) violation = `${hit} at local (${l.x.toFixed(2)}, ${l.z.toFixed(2)})`;
    }
    return { w, violation, end: toLocal(w.pos.x, w.pos.z) };
  }

  it('head-on into an engine: stopped before the intake, never inside the hull', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    const r = walkInto(z, [2.4, -16], [2.4, -0.6], 5);
    assert.equal(r.violation, null);
    assert.ok(r.end.z < -3.6, `stopped ahead of the engine (local z ${r.end.z.toFixed(2)})`);
    z.dispose();
  });

  it('down the centre corridor: the beam/centre chain seals the gap between engines', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    const r = walkInto(z, [0, -16], [0, 3.4], 5);
    assert.equal(r.violation, null);
    assert.ok(r.end.z < -3.6, `corridor walk stopped at local z ${r.end.z.toFixed(2)}, before the machine`);
    z.dispose();
  });

  it('into the pod from behind: the pod circle stops the walker at its skin', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    const r = walkInto(z, [0, 17], [0, 3.4], 5);
    assert.equal(r.violation, null);
    assert.ok(r.end.z > 5.6, `stopped behind the pod (local z ${r.end.z.toFixed(2)})`);
    z.dispose();
  });

  it('the parked landspeeder stops the walker too (registry collider)', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    // start (60,36): the old (60,42) start now sits inside a seeded
    // scatter mesa that the wider 460 m scatter ring placed there,
    // which shoved the walker sideways past the speeder instead of
    // into it. The lane from 36 is clear; the speeder still stops it.
    const w = WC.createWalker({ x: 60, z: 36, yaw: 0 }); // forward (0,-1): toward the speeder at (60,26)
    const world = {
      groundHeight: z.groundHeight, colliders: z.colliders, bounds: z.bounds, snapY: true,
    };
    for (let i = 0; i < 5 * 60; i++) WC.stepWalker(w, { fwd: 1 }, 1 / 60, world);
    const d = Math.hypot(w.pos.x - 60, w.pos.z - 26);
    assert.ok(d >= 2.85 && d <= 5.5, `stopped at the speeder skin (d=${d.toFixed(2)})`);
    z.dispose();
  });
});

describe('QA items 4+5 — small label, holstered saber, measured mounts', () => {
  it('labelOpacity: gone in the face, gone on the horizon, full between', () => {
    assert.equal(CH.labelOpacity(2), 0);
    assert.equal(CH.labelOpacity(4), 0);
    assert.ok(CH.labelOpacity(5.5) > 0 && CH.labelOpacity(5.5) < 0.95);
    assert.equal(CH.labelOpacity(20), 0.95);
    assert.equal(CH.labelOpacity(45), 0.95);
    assert.ok(CH.labelOpacity(55) > 0 && CH.labelOpacity(55) < 0.95);
    assert.equal(CH.labelOpacity(60), 0);
    assert.equal(CH.labelOpacity(120), 0);
  });

  it('the built name label is a small tag (<= 2 m wide), not the old billboard', () => {
    const def = PLANETS.tatooine.characters[0];
    const ch = CH.buildCharacter(THREE, def, () => 0);
    let sprite = null;
    ch.group.traverse((o) => { if (o.isSprite) sprite = o; });
    assert.ok(sprite, 'label sprite built');
    assert.ok(sprite.scale.x <= 2.0, `label width ${sprite.scale.x} m`);
    assert.ok(sprite.position.y > def.height, 'tag floats above the head');
    ch.dispose();
  });

  it('saberMountPose pins the holster endpoints: belt at 0, fist at 1', () => {
    const hand = [0.43, 0.54, 0.02], belt = [0.24, 0.92, 0.06];
    const tilts = CH.saberTilts(hand);
    const at0 = CH.saberMountPose(0, hand, belt, tilts);
    assert.ok(at0.position.every((v, i) => approx(v, belt[i], 1e-9)), 'grip 0 = belt anchor');
    assert.ok(approx(at0.rotation[0], tilts.belt.x) && approx(at0.rotation[2], tilts.belt.z), 'grip 0 = belt tilt');
    const at1 = CH.saberMountPose(1, hand, belt, tilts);
    assert.ok(at1.position.every((v, i) => approx(v, hand[i], 1e-9)), 'grip 1 = fist anchor');
    assert.ok(approx(at1.rotation[0], tilts.hand.x) && approx(at1.rotation[2], tilts.hand.z), 'grip 1 = hand tilt');
    const mid = CH.saberMountPose(0.5, hand, belt, tilts);
    assert.ok(mid.position[1] > hand[1] && mid.position[1] < belt[1], 'travel is a true lerp');
    // the roll mirrors with the hand side so the blade clears the leg
    const leftTilts = CH.saberTilts([-0.4, 0.6, 0.1]);
    assert.equal(leftTilts.hand.z, -tilts.hand.z);
  });

  it('findGripBones picks the right hand + pelvis out of a rig, nulls without one', () => {
    const root = new THREE.Group();
    const hips = new THREE.Group(); hips.name = 'mixamorig:Hips';
    const spine = new THREE.Group(); spine.name = 'mixamorig:Spine';
    const handR = new THREE.Group(); handR.name = 'mixamorig:RightHand';
    const thumb = new THREE.Group(); thumb.name = 'mixamorig:RightHandThumb1';
    const handL = new THREE.Group(); handL.name = 'mixamorig:LeftHand';
    root.add(hips); hips.add(spine); spine.add(handR); handR.add(thumb); spine.add(handL);
    const bones = CH.findGripBones(root);
    assert.equal(bones.hand, handR);
    assert.equal(bones.pelvis, hips);
    assert.deepEqual(CH.findGripBones(new THREE.Group()), { hand: null, pelvis: null });
    assert.deepEqual(CH.findGripBones(null), { hand: null, pelvis: null });
  });
});

describe('QA item 6 — rideable vehicles (vehicles.js + zone wiring)', () => {
  it('tatooine stages four rideables — the rover is gone, the crash site is not a ride', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    // The QA round left the winner's pod as dressing; the all-worlds
    // pass (2026-10-23) wires it — same type as its grid siblings.
    // The rover is GONE (Nov 15, 2026 rework): its GLB's broken
    // skinning made the truck sit on its own mangled undercarriage,
    // and the crash site that replaced it is dressing, not a vehicle.
    assert.deepEqual(z.vehicles.map((v) => v.id).sort(),
      ['landspeeder', 'pod-grid-a', 'pod-grid-b', 'pod-winner']);
    assert.equal(z.vehicles.find((v) => v.id === 'tatooine-rover'), undefined);
    assert.ok(VH.VEHICLE_TYPES.rover, 'rover drive type stays in vehicles.js (inert, unseated)');
    assert.ok(VH.VEHICLE_TYPES.rover.cruise < VH.VEHICLE_TYPES.landspeeder.cruise,
      'the rover is slower than the speeder');
    for (const v of z.vehicles) {
      assert.equal(v.state.mode, 'parked');
      assert.equal(v.state.speed, 0);
      assert.ok(v.colliders.length >= 1, 'parked colliders ride along for the ignore set');
    }
    const podA = z.vehicles.find((v) => v.id === 'pod-grid-a');
    assert.equal(podA.state.x, 31); assert.equal(podA.state.z, 64);
    assert.equal(podA.colliders.length, 7, 'the full pod collider chain');
    z.update(0, 0.016); // parked render = seat transform, no pop
    assert.equal(podA.group.position.x, 31);
    assert.equal(podA.group.position.y, podA.state.y);
    z.dispose();
  });

  it('landspeeder blue exhaust flame: dark parked, lit while driving', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    const speeder = z.vehicles.find((v) => v.id === 'landspeeder');
    assert.ok(speeder.flame, 'the speeder carries a flame entry');
    assert.ok(speeder.flame.group.userData.keepVisible, 'the GLB arrival never hides the flame');
    z.update(0, 0.016);
    assert.equal(speeder.flame.group.visible, false, 'parked: no flame');
    assert.equal(VH.mountVehicle(speeder.state), true);
    speeder.state.speed = 12;
    z.update(1, 0.016);
    assert.equal(speeder.flame.group.visible, true, 'driving: blue flame on');
    // the plume points out the back (+Z local: vehicles drive -Z)
    let flameZ = null;
    speeder.flame.group.traverse((o) => { if (o.isMesh) flameZ = o.position.z; });
    assert.ok(flameZ > 2, 'flame sits behind the hull, not ahead of it');
    VH.parkVehicle(speeder.state, () => 0);
    z.update(2, 0.016);
    assert.equal(speeder.flame.group.visible, false, 'parked again: flame off');
    assert.equal(z.vehicles.filter((v) => v.flame).length, 1, 'the flame belongs to the speeder only');
    z.dispose();
  });

  it('world expansion (2026-10-26) + endless (2026-11-18): home region pushed out, no bounds at all', () => {
    assert.equal(PLANETS.tatooine.worldRadius, 520);
    assert.equal(PLANETS.tatooine.boundsRadius, 460);
    for (const def of Object.values(PLANETS)) {
      if (def.kind === 'walk') {
        assert.ok(def.worldRadius >= 500, `${def.id} terrain pushed out`);
        assert.ok(def.boundsRadius >= 400, `${def.id} home region pushed out`);
        assert.ok(def.horizon.radius > def.worldRadius, `${def.id} horizon beyond terrain`);
      }
    }
    // missions and landmarks did NOT move with the expansion
    const beat = PLANETS.tatooine.missions[0];
    assert.equal(beat.checkpoints[0].label, 'Canyon Gate');
    assert.deepEqual([beat.checkpoints[0].x, beat.checkpoints[0].z], [25, 55]);
    // ... and the endless convert removed the bound itself: the
    // walker strides straight past the old 460 m edge
    const z = buildZone(THREE, PLANETS.tatooine, T);
    assert.equal(z.bounds, null, 'tatooine: no bounds');
    const w = WC.createWalker({ x: 0, z: 95, yaw: -Math.PI / 2 });
    const world = { groundHeight: z.groundHeight, colliders: [], bounds: z.bounds, snapY: true };
    for (let i = 0; i < 60 * 70; i++) WC.stepWalker(w, { fwd: 1 }, 1 / 60, world);
    assert.ok(Math.hypot(w.pos.x, w.pos.z) > 460,
      `walker passed the old edge (r=${Math.hypot(w.pos.x, w.pos.z).toFixed(0)})`);
    z.dispose();
  });

  it('mount/dismount state machine + prompt range', () => {
    const st = VH.createVehicleState('landspeeder', { x: 10, z: 10, yaw: 0.5, seatY: 1 });
    assert.equal(st.mode, 'parked');
    assert.ok(VH.vehicleInPromptRange(st, 12, 10), '2 m away: prompt');
    assert.ok(!VH.vehicleInPromptRange(st, 14, 10), '4 m away: no prompt');
    assert.equal(VH.mountVehicle(st), true);
    assert.equal(st.mode, 'mounted');
    assert.equal(VH.mountVehicle(st), false, 'no double mount');
    const pt = VH.dismountPoint(st);
    const d = Math.hypot(pt.x - st.x, pt.z - st.z);
    assert.ok(d > VH.VEHICLE_TYPES.landspeeder.radius, 'steps out clear of the hull');
    VH.parkVehicle(st, () => 2.5);
    assert.equal(st.mode, 'parked');
    assert.equal(st.y, 2.5 + VH.VEHICLE_TYPES.landspeeder.rest);
    assert.throws(() => VH.createVehicleState('x-wing', {}), /unknown vehicle type/);
  });

  it('driving: smooth accel to cruise, hover tracks the terrain', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T);
    const st = VH.createVehicleState('landspeeder', { x: -100, z: 120, yaw: Math.PI, seatY: 0 });
    VH.mountVehicle(st);
    const world = { groundHeight: z.groundHeight, colliders: [], bounds: z.bounds, ignore: new Set() };
    let hoverDev = 0;
    for (let i = 0; i < 60 * 6; i++) {
      VH.stepVehicle(st, { fwd: 1, turn: 0 }, 1 / 60, world);
      if (i > 60 * 2) {
        const dev = Math.abs(st.y - (z.groundHeight(st.x, st.z) + VH.VEHICLE_TYPES.landspeeder.hover));
        if (dev > hoverDev) hoverDev = dev;
      }
    }
    assert.ok(st.speed > VH.VEHICLE_TYPES.landspeeder.cruise * 0.9, `reached cruise (${st.speed.toFixed(1)})`);
    assert.ok(hoverDev < 0.15, `hover held within ${hoverDev.toFixed(3)} m of groundHeight + hover`);
    // throttle off: settles to a stop, never rolls backwards forever
    for (let i = 0; i < 60 * 4; i++) VH.stepVehicle(st, { fwd: 0, turn: 0 }, 1 / 60, world);
    assert.ok(Math.abs(st.speed) < 0.05, `coasted to a stop (${st.speed.toFixed(2)})`);
    z.dispose();
  });

  it('a driven vehicle ignores ONLY its own colliders', () => {
    const own = [{ x: 0, z: 0, r: 3 }];
    const foreign = [{ x: 0, z: -30, r: 3 }];
    const st = VH.createVehicleState('landspeeder', { x: 0, z: 6, yaw: 0, seatY: 0 });
    VH.mountVehicle(st);
    const world = {
      groundHeight: () => 0, colliders: [...own, ...foreign],
      bounds: { kind: 'circle', max: 115 }, ignore: new Set(own),
    };
    // drive north (-z) through the own circle: no push-out
    for (let i = 0; i < 60 * 2; i++) VH.stepVehicle(st, { fwd: 1, turn: 0 }, 1 / 60, world);
    assert.ok(st.z < -1, `drove out through its own parked circle (z=${st.z.toFixed(1)})`);
    // keep driving into the foreign circle: it must stop the vehicle
    let minD = Infinity;
    for (let i = 0; i < 60 * 4; i++) {
      VH.stepVehicle(st, { fwd: 1, turn: 0 }, 1 / 60, world);
      minD = Math.min(minD, Math.hypot(st.x - 0, st.z + 30));
    }
    assert.ok(minD > 3, `foreign collider kept the hull out (minD=${minD.toFixed(2)})`);
  });

  it('the podrace completes ON a pod: gates read the vehicle position', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T); // default = first mission
    const pod = z.vehicles.find((v) => v.id === 'pod-grid-a');
    assert.ok(pod, 'grid pod rideable');
    VH.mountVehicle(pod.state);
    const ignore = new Set(pod.colliders);
    const world = {
      groundHeight: z.groundHeight, colliders: z.colliders,
      bounds: z.bounds, ignore,
    };
    const gates = [...z.checkpoints, z.target];
    assert.ok(gates.length >= 8, 'the expanded circuit');
    let gi = 0;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    for (let i = 0; i < 60 * 240 && gi < gates.length; i++) {
      const g = gates[gi];
      const dx = g.x - pod.state.x, dz = g.z - pod.state.z;
      if (Math.hypot(dx, dz) <= g.r) { gi++; continue; }
      const targetYaw = Math.atan2(-dx, -dz);
      const err = wrap(targetYaw - pod.state.yaw);
      VH.stepVehicle(pod.state, {
        fwd: Math.abs(err) < 1.1 ? 1 : 0.25,
        turn: -Math.max(-1, Math.min(1, err * 3)),
      }, 1 / 60, world);
    }
    assert.equal(gi, gates.length,
      `pod drove the whole circuit (${gi}/${gates.length} gates)`);
    z.dispose();
  });
});

/* ================================================================== */
/* ALL-WORLDS QA (2026-10-23, Merlin's order: "the other fixes        */
/* should be applied to all Star Wars worlds"). The six Tatooine QA  */
/* fixes, pinned across EVERY def / landmark type / scatter kind,    */
/* so any future world inherits the audit instead of the bugs.       */
/* ================================================================== */

const fs = await import('node:fs');

describe('ALL-WORLDS QA 1 — gravity + ground truth, every world', () => {
  /* Rebuild the rendered terrain's height at (x, z) from the chunk
   * ring's own grids — exactly what the triangles interpolate —
   * instead of raycasting (a ray misses hole-punched cells, which
   * is how the first fidelity probe under-read the disc). ENDLESS
   * (Nov 18, 2026): the ground is a ring of chunk meshes now, not
   * one radial disc — the sampler looks a chunk up by key and
   * interpolates its regular grid with the same triangle rule the
   * renderer draws. Points outside the live ring return null and
   * the probe grid skips them; the whole-disc fidelity of the
   * chunk LAW itself is pinned in the endless suite
   * (tests/middle-earth-star-wars-endless.test.mjs), which probes
   * chunkHeightField directly on every planet. */
  function terrainSampler(z) {
    const byKey = new Map();
    let verts = 0;
    z.group.traverse((o) => {
      if (o.name === 'terrain-chunk' && o.userData.chunk) {
        byKey.set(`${o.userData.chunk.cx},${o.userData.chunk.cz}`, o);
        verts += o.geometry.attributes.position.count;
      }
    });
    assert.ok(byKey.size > 0, 'terrain chunks present');
    assert.ok(verts > 30000, `dense chunked terrain, got ${verts} verts`);
    // Chunk vertices sit exactly on the analytic surface — they are
    // sampled from it.
    let checked = 0, worst = 0;
    for (const o of byKey.values()) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 977) {
        const wx = o.position.x + pos.getX(i), wz = o.position.z + pos.getZ(i);
        const dev = Math.abs(pos.getY(i) - z.groundHeight(wx, wz));
        if (dev > worst) worst = dev;
        checked++;
      }
    }
    assert.ok(checked > 0 && worst < 1e-4,
      `chunk vertices match the analytic surface (worst ${worst})`);
    const n = SW_STREAM.tiles + 1, step = SW_STREAM.chunkM / SW_STREAM.tiles;
    const sample = (wx, wz) => {
      const cx = Math.floor(wx / SW_STREAM.chunkM), cz = Math.floor(wz / SW_STREAM.chunkM);
      const o = byKey.get(`${cx},${cz}`);
      if (!o) return null;
      const pos = o.geometry.attributes.position;
      const lx = wx - o.position.x, lz = wz - o.position.z;
      const fx = Math.min(n - 1 - 1e-9, Math.max(0, lx / step));
      const fz = Math.min(n - 1 - 1e-9, Math.max(0, lz / step));
      const ix = Math.floor(fx), iz = Math.floor(fz);
      const u = fx - ix, v = fz - iz;
      const yAt = (j, i) => pos.getY(j * n + i);
      /* interpolate the way the renderer draws: the quad's two
       * triangles (a, c, b) and (b, c, d) from chunkHeightField's
       * index order — bilinear across the quad would invent a
       * smoother surface than the one on screen */
      const ya = yAt(iz, ix), yb = yAt(iz, ix + 1);
      const yc = yAt(iz + 1, ix), yd = yAt(iz + 1, ix + 1);
      if (u + v <= 1) return ya + (yb - ya) * u + (yc - ya) * v;
      return yd + (yb - yd) * (1 - v) + (yc - yd) * (1 - u);
    };
    for (const o of byKey.values()) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 613) {
        const wx = o.position.x + pos.getX(i), wz = o.position.z + pos.getZ(i);
        const s = sample(wx, wz);
        assert.ok(s != null && Math.abs(s - pos.getY(i)) < 0.02, 'sampler self-check at a vertex');
      }
    }
    return sample;
  }

  for (const def of Object.values(PLANETS)) {
    if (def.kind !== 'walk') continue;
    it(`${def.id}: mesh tracks groundHeight within 0.2 m; snapY line-walks hold`, () => {
      const z = buildZone(THREE, def, T);
      const sample = terrainSampler(z);
      let maxDev = 0, probes = 0;
      const R = def.worldRadius - 3;
      for (let x = -R; x <= R; x += 3) {
        for (let zz = -R; zz <= R; zz += 3) {
          if (Math.hypot(x, zz) > R) continue;
          const mh = sample(x, zz);
          if (mh == null) continue;
          probes++;
          const dev = Math.abs(mh - z.groundHeight(x, zz));
          if (dev > maxDev) maxDev = dev;
        }
      }
      assert.ok(probes > 1000, `${def.id}: probe grid covered (${probes} probes)`);
      assert.ok(maxDev <= 0.2,
        `${def.id}: worst mesh-vs-analytic deviation ${maxDev.toFixed(3)} m (bound 0.2)`);
      /* snapY line-walks over the world's own features: the walker
       * clearance invariant must hold on every step, wherever the
       * line leads (colliders may stop the line; drifting may not). */
      const world = {
        groundHeight: z.groundHeight, colliders: z.colliders,
        bounds: z.bounds, snapY: true, eye: WC.WALK_EYE,
      };
      const lines = [
        { from: [-def.worldRadius + 8, 0], yaw: -Math.PI / 2, axis: 'x' },
        { from: [0, -def.worldRadius + 8], yaw: Math.PI, axis: 'z' },
      ];
      for (const line of lines) {
        const w = WC.createWalker({ x: line.from[0], z: line.from[1], yaw: line.yaw });
        const start = line.axis === 'x' ? w.pos.x : w.pos.z;
        let progress = 0;
        const maxSteps = Math.ceil((def.worldRadius * 2 + 80) / (WC.WALK_SPEED / 60)) ;
        for (let i = 0; i < maxSteps; i++) {
          WC.stepWalker(w, { fwd: 1 }, 1 / 60, world);
          const dev = Math.abs(w.pos.y - WC.WALK_EYE - z.groundHeight(w.pos.x, w.pos.z));
          assert.ok(dev < 1e-6,
            `${def.id}: clearance drifted ${dev} at (${w.pos.x.toFixed(1)}, ${w.pos.z.toFixed(1)})`);
          const p = (line.axis === 'x' ? w.pos.x : w.pos.z) - start;
          if (p > progress) progress = p;
          if (p > def.worldRadius * 2 - 20) break;
        }
        assert.ok(progress > 30, `${def.id}: line-walk travelled ${progress.toFixed(0)} m`);
      }
      z.dispose();
    });
  }

  for (const def of Object.values(PLANETS)) {
    if (def.kind !== 'fly') continue;
    it(`${def.id}: fly law — groundHeight is identically 0, placements sit at y=0`, () => {
      const z = buildZone(THREE, def, T);
      for (let x = -200; x <= 200; x += 25) {
        for (let zz = -200; zz <= 200; zz += 25) {
          assert.equal(z.groundHeight(x, zz), 0, `${def.id}: fly groundHeight`);
        }
      }
      for (const child of z.group.children) {
        if (child.name && child.name.startsWith('landmark:')) {
          assert.equal(child.position.y, 0, `${def.id}: ${child.name} seatY`);
        }
      }
      assert.deepEqual(z.vehicles, [], `${def.id}: no ground vehicles in a fly zone`);
      z.dispose();
    });
  }
});

describe('ALL-WORLDS QA 3 — span seating recomputed for every landmark, every world', () => {
  for (const def of Object.values(PLANETS)) {
    it(`${def.id}: every landmark seat matches the span law`, () => {
      const z = buildZone(THREE, def, T);
      const groups = z.group.children.filter((c) => c.name && c.name.startsWith('landmark:'));
      assert.equal(groups.length, (def.landmarks || []).length, `${def.id}: landmark groups`);
      (def.landmarks || []).forEach((ld, idx) => {
        const g = groups[idx];
        assert.equal(g.name, 'landmark:' + ld.type);
        if (def.kind === 'fly') {
          assert.equal(g.position.y, 0, `${def.id}/${ld.type}: fly seatY law`);
          return;
        }
        /* mirror buildZone's seating law exactly (same inputs, same
         * branches) — the built seat must equal the law's output */
        const glb = ld.model ? LM.GLB_MODELS[ld.model] : null;
        const local = glb ? glb.colliders : LM.buildLandmark(ld.type, THREE, T).colliders;
        const s = ld.s || 1;
        let footprint = 0;
        for (const c of local) {
          footprint = Math.max(footprint, (Math.hypot(c.x, c.z) + c.r) * s);
        }
        if (glb) footprint = (glb.meters / 2) * s;
        let expect;
        if (glb) {
          expect = spanSeatY(z.groundHeight, ld.x || 0, ld.z || 0,
            Math.max(footprint, 1), { clampDrop: 3.5 }) - 0.3;
        } else if (footprint >= 6) {
          expect = spanSeatY(z.groundHeight, ld.x || 0, ld.z || 0,
            footprint * 0.75, { clampDrop: 2 }) - 0.3;
        } else {
          expect = z.groundHeight(ld.x || 0, ld.z || 0) - 0.12;
        }
        assert.ok(approx(g.position.y, expect, 1e-6),
          `${def.id}/${ld.type}: seat ${g.position.y} vs law ${expect}`);
      });
      z.dispose();
    });
  }
});

describe('ALL-WORLDS QA 2 — colliders cover hulls, every landmark type used on foot', () => {
  /* Probe = the hull's own surface: geometry vertices in the walker
   * band (y <= 2.6), plus AABB edge midpoints for axis-aligned parts
   * (flat faces are where chains gap). A probe passes when it lies
   * within some collider's disc + 0.35 m of triangulation slop — the
   * walker is a point against these discs (resolveColliders), so
   * anything further out is visual hull a walker can stand inside.
   * Exempt by construction: Circle/Plane geometry (surface decals —
   * the lava pool, the Theed plaza step, windows), Torus geometry
   * (arch beams overhead + doorframes whose inner skin bounds a
   * walk-through opening; their posts carry the colliders), and
   * parts floating above the walker band. */
  const SKIP_GEO = new Set(['CircleGeometry', 'PlaneGeometry', 'TorusGeometry']);
  const walkTypes = new Set();
  for (const def of Object.values(PLANETS)) {
    if (def.kind !== 'walk') continue;
    for (const ld of def.landmarks || []) walkTypes.add(ld.type);
  }
  for (const type of [...walkTypes].sort()) {
    it(`${type}: no hull point in the walker band escapes collider reach`, () => {
      const b = LM.buildLandmark(type, THREE, T);
      b.group.updateMatrixWorld(true);
      const probes = [];
      b.group.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSprite) return;
        if (SKIP_GEO.has(o.geometry && o.geometry.type)) return;
        /* flat ground plates are steps, not hulls: the Theed plaza
         * (r16, 1 m) and the Tipoca sea disc (r30, 1 m) */
        if (o.geometry.type === 'CylinderGeometry'
          && o.geometry.parameters.height <= 1.2
          && o.geometry.parameters.radiusTop >= 8) return;
        const pa = o.geometry.attributes.position;
        const stride = Math.max(1, Math.floor(pa.count / 240));
        const v = new THREE.Vector3();
        for (let i = 0; i < pa.count; i += stride) {
          v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
          if (v.y <= 2.6) probes.push([v.x, v.z]);
        }
        const axisAligned = Math.abs(Math.sin(2 * (o.rotation.y || 0))) < 0.01
          && Math.abs(o.rotation.x || 0) < 0.01 && Math.abs(o.rotation.z || 0) < 0.01;
        if (axisAligned) {
          const bb = new THREE.Box3().setFromObject(o);
          if (bb.min.y <= 2.6) {
            const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
            probes.push([bb.min.x, cz], [bb.max.x, cz], [cx, bb.min.z], [cx, bb.max.z]);
          }
        }
      });
      assert.ok(probes.length > 0, `${type}: probes sampled`);
      for (const [px, pz] of probes) {
        let best = Infinity;
        for (const c of b.colliders) {
          best = Math.min(best, Math.hypot(px - c.x, pz - c.z) - c.r);
        }
        assert.ok(best <= 0.35,
          `${type}: hull point (${px.toFixed(1)}, ${pz.toFixed(1)}) sits ${best.toFixed(2)} m past the nearest collider`);
      }
    });
  }

  it('debris-field: every one of the 200 rocks carries its own flight collider', () => {
    const b = LM.buildLandmark('debris-field', THREE, T);
    assert.equal(b.colliders.length, 201, '200 rocks + the beacon pylon');
    assert.ok(b.colliders.some((c) => c.x === 0 && c.z === 0 && c.r === 4), 'pylon collider');
    assert.ok(b.colliders.every((c) => c.r >= 1), 'rock radii follow their instance scale');
  });

  it('star-destroyer: a distant silhouette by design — no colliders at all', () => {
    const b = LM.buildLandmark('star-destroyer', THREE, T);
    assert.equal(b.colliders.length, 0);
  });
});

describe('ALL-WORLDS QA 2b — scatter colliders cover their hulls, every kind', () => {
  const flat = () => 0;
  function scatterFor(kind, size) {
    const colliders = [];
    const group = buildWorldScatter(THREE, {
      seed: 99, worldRadius: 140,
      scatter: [{ kind, count: 30, minR: 25, maxR: 110, size }],
    }, T, flat, colliders, []);
    return { group, colliders };
  }
  function firstInstanced(group) {
    let mesh = null;
    group.traverse((o) => { if (!mesh && o.isInstancedMesh) mesh = o; });
    return mesh;
  }
  function instanceAt(mesh, i) {
    const e = mesh.instanceMatrix.array, o = i * 16;
    return {
      x: e[o + 12], z: e[o + 14],
      s: Math.hypot(e[o], e[o + 1], e[o + 2]),
      zx: e[o + 8], zz: e[o + 10],
    };
  }
  /* visual = the hull radius the kind's geometry actually reaches at
   * scale s (from the builders in zone.js); min = the size below
   * which the kind is dressing, not a hull */
  const SOLID = {
    rock: { visual: (s) => s, min: 1.8 },
    mesa: { visual: (s) => 1.23 * s, min: 0 },
    'canopy-tree': { visual: (s) => 0.55 * s, min: 1.6 },
    'garden-tree': { visual: (s) => 0.44 * s, min: 1.6 },
    'swamp-tree': { visual: (s) => 0.95 * s, min: 1.6 },
    'ice-crag': { visual: (s) => s, min: 1.8 },
    'lava-rock': { visual: (s) => s, min: 1.8 },
    spire: { visual: (s) => 1.13 * s, min: 0 },
    pylon: { visual: (s) => 0.62 * s, min: 1.6 },
    'dark-spire': { visual: (s) => 0.85 * s, min: 1.8 },
    obsidian: { visual: (s) => 0.55 * s, min: 1.8 },
  };
  for (const [kind, rule] of Object.entries(SOLID)) {
    it(`${kind}: every placed instance carries a collider covering its hull`, () => {
      const { group, colliders } = scatterFor(kind, [2.2, 3.2]);
      const mesh = firstInstanced(group);
      assert.ok(mesh && mesh.count > 0, `${kind}: instances built`);
      for (let i = 0; i < mesh.count; i++) {
        const p = instanceAt(mesh, i);
        if (p.s < rule.min) continue;
        const need = rule.visual(p.s);
        const ok = colliders.some((c) =>
          Math.hypot(c.x - p.x, c.z - p.z) <= 0.06 && c.r >= need - 0.02);
        assert.ok(ok, `${kind} #${i} (s=${p.s.toFixed(2)}): no collider covering r=${need.toFixed(2)}`);
      }
    });
  }

  it('wreck: the two-circle chain follows each hull slab', () => {
    const { group, colliders } = scatterFor('wreck', [2.2, 3.2]);
    const mesh = firstInstanced(group);
    assert.ok(mesh && mesh.count > 0, 'wreck instances built');
    for (let i = 0; i < mesh.count; i++) {
      const p = instanceAt(mesh, i);
      const len = Math.hypot(p.zx, p.zz) || 1;
      const ax = p.zx / len, az = p.zz / len; // the slab's long axis
      for (const sgn of [-1, 1]) {
        const ex = p.x + sgn * 1.15 * p.s * ax, ez = p.z + sgn * 1.15 * p.s * az;
        const ok = colliders.some((c) =>
          Math.hypot(c.x - ex, c.z - ez) <= 0.15 && c.r >= 1.75 * p.s);
        assert.ok(ok, `wreck #${i}: chain circle missing at (${ex.toFixed(1)}, ${ez.toFixed(1)})`);
      }
    }
  });

  it('vaporator: the pole takes the flat r0.7 collider, which covers its base', () => {
    const { group, colliders } = scatterFor('vaporator', [2.2, 3.2]);
    const mesh = firstInstanced(group);
    assert.ok(mesh && mesh.count > 0, 'vaporator instances built');
    for (let i = 0; i < mesh.count; i++) {
      const p = instanceAt(mesh, i);
      const ok = colliders.some((c) =>
        Math.hypot(c.x - p.x, c.z - p.z) <= 0.06 && c.r >= 0.14 * p.s);
      assert.ok(ok, `vaporator #${i}: pole collider missing`);
    }
  });

  for (const kind of ['undergrowth', 'swamp-knee', 'snow-drift', 'salt-crystal', 'reed', 'scrub']) {
    it(`${kind}: soft dressing stays walk-through by design`, () => {
      const { colliders } = scatterFor(kind, [2.2, 3.2]);
      assert.equal(colliders.length, 0, `${kind} must not wall the walker`);
    });
  }
});

describe('ALL-WORLDS QA 4 — characters: measured anchors + holster law, every def', () => {
  const withChars = Object.values(PLANETS)
    .filter((d) => Array.isArray(d.characters) && d.characters.length);
  it('the figure-bearing worlds are tatooine + mustafar (a new one must bring measured anchors)', () => {
    assert.deepEqual(withChars.map((d) => d.id).sort(), ['mustafar', 'tatooine']);
  });
  for (const def of withChars) {
    for (const cd of def.characters) {
      it(`${def.id}/${cd.id}: hand + belt anchors present; the hilt spawns holstered ON the belt`, () => {
        assert.ok(Array.isArray(cd.hand) && cd.hand.length === 3, 'measured fist anchor');
        assert.ok(Array.isArray(cd.belt) && cd.belt.length === 3, 'measured belt anchor');
        const ch = CH.buildCharacter(THREE, cd, () => 0);
        let saberAtBelt = false, labels = 0;
        ch.group.traverse((o) => {
          if (o.isSprite) labels++;
          if (o.isGroup && o.position
            && approx(o.position.x, cd.belt[0], 1e-6)
            && approx(o.position.y, cd.belt[1], 1e-6)
            && approx(o.position.z, cd.belt[2], 1e-6)) saberAtBelt = true;
        });
        assert.ok(saberAtBelt, 'saber group mounted at the belt anchor (grip 0 = holstered)');
        assert.ok(labels >= 1, 'the small name label exists (distance-faded by labelOpacity)');
        ch.dispose();
      });
    }
  }
});

describe('ALL-WORLDS QA 5+6 — rideable inventory per world + shared page laws', () => {
  it('vehicle inventory: tatooine stages four rideables; every other world none (audited)', () => {
    /* Audit basis (2026-10-23): Endor's "Speeder-Bike Run" beat, Crait's
     * ski speeders, Hoth's tauntauns, Jakku's wreckage, Kamino's stilts
     * and Coruscant's spires are narrative/ambient/dressing — no
     * rideable-class prop exists in their landmark sets. The fly
     * worlds need none (the player already flies). Tatooine is the
     * only world with vehicle-class props — four since the Nov 15,
     * 2026 rover rework (the rover left; the crash site is not a ride). */
    const expect = { tatooine: ['landspeeder', 'pod-grid-a', 'pod-grid-b', 'pod-winner'] };
    for (const def of Object.values(PLANETS)) {
      const vids = (def.landmarks || []).filter((l) => l.vehicle).map((l) => l.vid).sort();
      assert.deepEqual(vids, (expect[def.id] || []).slice().sort(), `${def.id} vehicle inventory`);
      for (const l of def.landmarks || []) {
        if (l.vehicle) {
          assert.ok(VH.VEHICLE_TYPES[l.vehicle], `${def.id}: type ${l.vehicle} exists in vehicles.js`);
        }
      }
    }
  });

  it('page laws hold for every world (single shared page, no per-world branches)', () => {
    const src = fs.readFileSync(
      fileURLToPath(new URL('../page.jsx', import.meta.url)), 'utf8');
    assert.ok(/snapY:\s*true/.test(src), 'the walker world opts into exact ground follow');
    assert.ok(src.includes('walker.pos.x = st.x') && src.includes('walker.pos.z = st.z'),
      'while mounted, gates + saber observer read the VEHICLE position');
    assert.ok(src.includes("entry.kind !== 'roam'"), 'roam fade keys on entry kind, not planet');
    assert.ok(src.includes('setTimeout(() => setRoamCard(false), 6000)'),
      'the Free Roam banner fades after 6 s');
    assert.ok(src.includes('styles.modeChip') && src.includes('🧭 Free Roam'),
      'the small mode chip remains after the fade');
  });
});
