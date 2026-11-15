/*
 * app/star-wars/tests/cleanup-integration.test.mjs
 *
 * STAR WARS CLEANUP + INTEGRATION (Merlin, Nov 15, 2026 — "Really
 * clean that up please" + the vehicle rework: "the rover with a chunk
 * of god knows what under it?").
 *
 * Pins the cleanup at the zone level — what the CGI suite (specs and
 * builders) and the operators suite (life laws) do NOT cover:
 *   1. the green army-truck rover is GONE (def, registry, builder,
 *      live zone) and the crash site that replaced it is grounded;
 *   2. the purple/pink band is gone — the podracer beam is additive
 *      energy now, not an opaque magenta bar;
 *   3. scatter can no longer perch a boulder on a landmark (the
 *      clearance law covers the instance's own radius);
 *   4. vaporators read as farm machinery, not black lamp posts;
 *   5. every one of the 16 named worlds renders with the CGI layer
 *      AND its lives present, with tap-card data (group refs + life
 *      lines) available for the page.
 *
 * Run from the worktree root:
 *   node app/star-wars/tests/cleanup-integration.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function fakeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => ({});
    },
    set() { return true; },
  });
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => fakeCtx(), style: {} }
    : { style: {} }),
};

const THREE = await import('three');
const T = await import('../textures.js');
const LM = await import('../landmarks.js');
const { buildZone, buildWorldScatter, createHeightFunction } = await import('../zone.js');
const { PLANETS } = await import('../data.js');
const { lifeFor } = await import('../operators.js');
const CGI = await import('../cgi.js');

const SIXTEEN = [
  'tatooine', 'naboo', 'coruscant', 'kamino', 'geonosis', 'mustafar',
  'yavin-4', 'alderaan', 'death-star', 'hoth', 'dagobah', 'bespin',
  'endor', 'jakku', 'takodana', 'starkiller',
];

describe('vehicle rework — the green army-truck rover is gone', () => {
  it('no planet def seats a rover anywhere (type, model, or vehicle)', () => {
    for (const def of Object.values(PLANETS)) {
      for (const l of (def.landmarks || [])) {
        assert.notEqual(l.type, 'rover', `${def.id}: rover landmark`);
        assert.notEqual(l.model, 'tatooine-rover', `${def.id}: rover GLB seat`);
        assert.notEqual(l.vehicle, 'rover', `${def.id}: rover rideable`);
        assert.notEqual(l.vid, 'tatooine-rover', `${def.id}: rover vid`);
      }
    }
  });

  it('the registry and the builder are gone too', () => {
    assert.equal(LM.GLB_MODELS['tatooine-rover'], undefined, 'GLB seat removed');
    assert.ok(!LM.LANDMARK_TYPES.includes('rover'), 'landmark type removed');
    assert.throws(() => LM.buildLandmark('rover', THREE, T), /unknown landmark type/);
  });

  it('the live Tatooine zone stages four rideables, no rover', () => {
    const z = buildZone(THREE, PLANETS.tatooine, T, { freeRoam: true });
    assert.deepEqual(z.vehicles.map((v) => v.id).sort(),
      ['landspeeder', 'pod-grid-a', 'pod-grid-b', 'pod-winner']);
    z.dispose();
  });
});

describe('vehicle rework — the crash site that replaced it', () => {
  it('Tatooine carries a crashed-ship landmark where the rover sat', () => {
    const wreck = (PLANETS.tatooine.landmarks || []).find((l) => l.type === 'crashed-ship');
    assert.ok(wreck, 'crashed-ship landmark in the def');
    assert.equal(wreck.x, 76); assert.equal(wreck.z, 40);
    assert.equal(wreck.vehicle, undefined, 'the wreck is a place, not a ride');
    assert.equal(wreck.model, undefined, 'no GLB seat — procedural only');
  });

  it('the wreck builds, covers its hull with colliders, and sits grounded', () => {
    const built = LM.buildLandmark('crashed-ship', THREE, T);
    assert.ok(built.group instanceof THREE.Group);
    assert.ok(built.colliders.length >= 3, 'hull chain + nacelle');
    let reach = 0;
    for (const c of built.colliders) reach = Math.max(reach, Math.hypot(c.x, c.z) + c.r);
    assert.ok(reach >= 4, `colliders cover the hull (reach ${reach.toFixed(1)})`);
    // half-buried by construction: some mesh dips at/below the seat plane
    const box = new THREE.Box3().setFromObject(built.group);
    assert.ok(box.min.y <= 0.05, `wreck geometry dips to/below its seat (minY ${box.min.y.toFixed(2)})`);

    const z = buildZone(THREE, PLANETS.tatooine, T, { freeRoam: true });
    const group = z.group.getObjectByName('landmark:crashed-ship');
    assert.ok(group, 'wreck group in the live zone');
    const ground = z.groundHeight(76, 40);
    assert.ok(group.position.y <= ground + 0.2,
      `wreck seated at the terrain, not perched (seat ${group.position.y.toFixed(2)} vs ground ${ground.toFixed(2)})`);
    assert.ok(group.position.y >= ground - 1.5, 'wreck is not buried out of sight');
    z.dispose();
  });
});

describe('the purple/pink band — the podracer beam reads as energy now', () => {
  it('no opaque magenta bar anywhere in the podracer build', () => {
    const built = LM.buildLandmark('podracer', THREE, T);
    const bad = [];
    built.group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      if (m.color && m.color.getHex && m.color.getHex() === 0xd76bff
        && m.blending !== THREE.AdditiveBlending) bad.push(o);
    });
    assert.deepEqual(bad, [], 'the flat magenta bar is gone');
  });

  it('the beam still spans engine to engine, as two additive layers', () => {
    const built = LM.buildLandmark('podracer', THREE, T);
    const beams = [];
    built.group.traverse((o) => {
      if (!o.isMesh || !o.material || !o.geometry) return;
      const g = o.geometry;
      if (g.parameters && g.parameters.width === 4.8 && o.material.blending === THREE.AdditiveBlending) {
        beams.push({ w: g.parameters.width, h: g.parameters.height, color: o.material.color.getHex() });
      }
    });
    assert.ok(beams.length >= 2, `core + halo present (found ${beams.length})`);
    const core = beams.find((b) => b.h <= 0.1);
    assert.ok(core, 'thin near-white core present');
    assert.ok(core.color > 0xe0e0e0, `core is near-white (0x${core.color.toString(16)})`);
  });
});

describe('scatter clearance — nothing perches on a landmark any more', () => {
  it('a size-5 rock keeps its whole radius clear of a landmark collider', () => {
    const colliders = [{ x: 0, z: 0, r: 3.3 }]; // a landmark, e.g. the old rover seat
    const before = colliders.length;
    const group = buildWorldScatter(THREE,
      { seed: 4242, scatter: [{ kind: 'rock', count: 60, minR: 0, maxR: 30, size: [2, 5] }] },
      T, () => 0, colliders, []);
    assert.ok(group.children.length > 0, 'rocks placed');
    const placed = colliders.slice(before);
    assert.ok(placed.length > 0, 'rock colliders recorded');
    for (const c of placed) {
      const d = Math.hypot(c.x, c.z);
      assert.ok(d >= 3.3 + c.r - 1e-6,
        `rock at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) r ${c.r} keeps clear (d ${d.toFixed(2)})`);
    }
  });

  it('mesa skirts keep their flare clear too', () => {
    const colliders = [{ x: 0, z: 0, r: 3.3 }];
    const before = colliders.length;
    buildWorldScatter(THREE,
      { seed: 4242, scatter: [{ kind: 'mesa', count: 20, minR: 0, maxR: 40, size: [6, 10] }] },
      T, () => 0, colliders, []);
    for (const c of colliders.slice(before)) {
      const d = Math.hypot(c.x, c.z);
      assert.ok(d >= 3.3 + c.r - 1e-6, `mesa r ${c.r} keeps clear (d ${d.toFixed(2)})`);
    }
  });
});

describe('vaporators — farm machinery, not black lamp posts', () => {
  it('the vaporator metal is pale (low metalness) and the bar reads at distance', () => {
    const group = buildWorldScatter(THREE,
      { seed: 4242, scatter: [{ kind: 'vaporator', count: 6, cx: 0, cz: 0, minR: 5, maxR: 20 }] },
      T, () => 0, [], []);
    const metals = [];
    const bars = [];
    group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        const m = o.material;
        if (m && m.color && m.color.getHex && m.color.getHex() === 0x9aa0a6) metals.push(m);
        if (o.geometry && o.geometry.parameters && o.geometry.parameters.width > 1.5) {
          bars.push(o.geometry.parameters);
        }
      }
    });
    assert.ok(metals.length > 0, 'vaporator metal found');
    for (const m of metals) assert.ok(m.metalness <= 0.35, `metalness ${m.metalness} — no more near-black poles`);
    assert.ok(bars.length > 0, 'crossbar found');
    for (const b of bars) assert.ok(b.height >= 0.2, `bar thickness ${b.height} reads at distance`);
  });
});

describe('integration — all 16 worlds render with CGI + lives', () => {
  for (const id of SIXTEEN) {
    it(`${id}: CGI layer present, lives present, tap data available`, () => {
      const def = PLANETS[id];
      const z = buildZone(THREE, def, T, { freeRoam: true });
      try {
        // CGI: the layer the zone adds on top of the terrain/starfield
        const cgi = z.group.getObjectByName('cgi');
        assert.ok(cgi, 'cgi group in the live zone');
        const suns = [];
        cgi.traverse((o) => { if (o.name === 'cgi-sun') suns.push(o); });
        assert.ok(suns.length >= 1, `${id} has at least one sun sprite`);
        if (def.kind === 'walk') {
          assert.ok(cgi.getObjectByName('cgi-sky-dome'), 'walk worlds carry the sky dome');
          if (id === 'tatooine') assert.equal(suns.length, 2, 'Tatooine carries exactly two suns');
        } else {
          assert.equal(cgi.getObjectByName('cgi-sky-dome'), undefined, 'fly worlds have no dome');
        }
        assert.equal(CGI.worldCgiSpec(def).suns.length, suns.length, 'spec suns == built suns');
        // the CGI updater runs on the clock without throwing
        z.update(0, 0.016);
        z.update(1, 0.016);

        // LIVES: ambient records match the def; characters match the def
        const ambientTotal = (def.ambient || []).reduce((n, a) => n + (a.count | 0), 0);
        if (def.kind === 'fly') {
          assert.equal(z.ambient.length, 0, 'fly worlds carry no ambient life by design');
        } else {
          assert.equal(z.ambient.length, ambientTotal,
            `${id}: ${z.ambient.length} ambient lives vs ${ambientTotal} in the def`);
        }
        for (const rec of z.ambient) {
          assert.ok(rec.group instanceof THREE.Group, `${id}: ambient ${rec.type} carries its group for tap targeting`);
          assert.ok(rec.name && rec.name.length > 0, `${id}: ambient ${rec.type} has a name`);
          const life = lifeFor({ type: rec.type, planet: rec.planet, index: rec.index });
          assert.ok(life && life.line && life.line.length > 0, `${id}: ${rec.type} has a life line`);
        }
        const charTotal = (def.characters || []).length;
        assert.equal(z.characters.length, charTotal, `${id}: named figures match the def`);
        for (const rec of z.characters) {
          assert.ok(rec.group instanceof THREE.Group, `${id}: character ${rec.id} carries its group`);
          const life = lifeFor({ kind: 'character', id: rec.id, name: rec.name });
          assert.ok(life && life.line && life.line.length > 0, `${id}: ${rec.id} has a life line`);
        }
      } finally {
        z.dispose();
      }
    });
  }

  it('tap-card wiring exists in the page (raycast + life card)', () => {
    const src = readFileSync(fileURLToPath(new URL('../page.jsx', import.meta.url)), 'utf8');
    assert.ok(src.includes("from './operators'"), 'page imports the operators layer');
    assert.ok(src.includes('Raycaster'), 'page raycasts taps');
    assert.ok(src.includes('setLifeCard'), 'page holds a life-card state');
    assert.ok(src.includes('styles.lifeCard'), 'page renders a life card');
    assert.ok(src.includes('lifeFor('), 'the card reads the operator life line');
  });

  it('the height function still seats the walker on the terrain (no regression)', () => {
    const h = createHeightFunction(PLANETS.tatooine);
    assert.ok(Number.isFinite(h(76, 40)), 'height is finite at the crash site');
    assert.ok(Math.abs(h(76, 40) - h(76, 40)) < 1e-9, 'height is deterministic');
  });
});
