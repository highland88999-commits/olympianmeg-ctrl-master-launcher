// Headless builder tests for app/middle-earth/landmarks.js, textures.js
// and zone.js. DOM stub is installed BEFORE any imports (static
// imports would hoist above it, so this file uses dynamic imports
// after the stub).

// --- fake canvas: every 2d-context method is a no-op -------------------------
const fakeCtx = new Proxy(
  {
    canvas: null,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: [] }),
    measureText: () => ({ width: 100 }),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }
);
const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: () => fakeCtx,
  style: {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : { style: {} }),
};
globalThis.window = globalThis;

import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three');
const T = await import('../textures.js');
const { buildLandmark, buildAmbient } = await import('../landmarks.js');
const { buildZone } = await import('../zone.js');
const DATA = await import('../data.js');
const ORCS = await import('../orcs.js');

const LANDMARK_TYPES = [
  'hobbit-hole', 'party-tree', 'green-dragon', 'rivendell-terrace', 'waterfall',
  'moria-door', 'moria-bridge', 'mallorn-tree', 'galadriel-mirror', 'mirkwood-web',
  'edoras-hall', 'minas-tirith', 'black-gate', 'barad-dur', 'mount-doom', 'arganath',
  'shire-mound', 'elven-arch', 'ford-stones', 'watch-rock', 'beacon-pyre',
  'gondor-tower', 'white-tree', 'city-gate', 'elf-path-arch', 'ruined-watchtower',
  'orthanc', 'isengard-ring',
];

const TEXTURE_MAKERS = [
  'grassTexture', 'forestFloorTexture', 'stoneTexture', 'marbleTexture',
  'goldLeafTexture', 'thatchTexture', 'ashTexture', 'lavaTexture',
  'rockTexture', 'barkTexture', 'waterTexture',
];

test('texture makers: each returns a THREE.CanvasTexture', () => {
  for (const name of TEXTURE_MAKERS) {
    const tex = T[name]();
    assert.ok(tex && tex.isTexture, `${name} is a texture`);
  }
});

test('landmark builders: every type builds a group with colliders or a GLB seat', () => {
  for (const type of LANDMARK_TYPES) {
    const built = buildLandmark(type, THREE, T);
    assert.ok(built && built.group, `${type} group`);
    assert.ok(Array.isArray(built.colliders), `${type} colliders array`);
  }
});

test('ambient builders run headless', () => {
  for (const type of ['sheep', 'deer', 'horse', 'bird', 'firefly', 'ember']) {
    const amb = buildAmbient(type, THREE, T);
    assert.ok(amb && amb.group, `${type} group`);
  }
});

function zoneFor(podId, opts) {
  return buildZone(THREE, DATA.PODS[podId], T, { freeRoam: true, ...(opts || {}) });
}

test('every pod builds: terrain dense, colliders present, spawn inside bounds', () => {
  for (const id of DATA.POD_ORDER) {
    const z = zoneFor(id);
    assert.ok(z.group, `${id} group`);
    assert.ok(z.colliders.length >= 10, `${id} colliders (${z.colliders.length})`);
    assert.ok(typeof z.groundHeight === 'function', `${id} groundHeight`);
    assert.ok(Math.hypot(z.spawn.x, z.spawn.z) <= z.bounds.max, `${id} spawn in bounds`);
    // dense terrain mesh present (the saga density law)
    let terrainVerts = 0;
    z.group.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
        terrainVerts = Math.max(terrainVerts, o.geometry.attributes.position.count);
      }
    });
    assert.ok(terrainVerts > 10000, `${id} terrain verts (${terrainVerts})`);
    z.dispose();
  }
});

test('landmarks never hover: seated within a small band of the analytic ground', () => {
  for (const id of DATA.POD_ORDER) {
    const z = zoneFor(id);
    const def = DATA.PODS[id];
    for (const ld of def.landmarks) {
      let found = null;
      z.group.traverse((o) => { if (!found && o.name === 'landmark:' + ld.type) found = o; });
      if (!found) continue;
      const g = z.groundHeight(ld.x || 0, ld.z || 0);
      assert.ok(found.position.y <= g + 2, `${id}/${ld.type} not floating (${found.position.y} vs ${g})`);
      assert.ok(found.position.y >= g - 4, `${id}/${ld.type} not buried`);
    }
    z.dispose();
  }
});

test('blanket field: records across the whole disc, none on the spawn point', () => {
  for (const id of DATA.POD_ORDER) {
    const z = zoneFor(id);
    const recs = z.hunt.records;
    assert.ok(recs.length >= 10, `${id} records (${recs.length})`);
    for (const r of recs) {
      assert.ok(Math.hypot(r.x, r.z) <= DATA.PODS[id].boundsRadius - 12, `${id} record in disc`);
      assert.ok(Math.hypot(r.x - 0, r.z - 95) >= ORCS.SPAWN_SAFE_R, `${id} record clear of spawn`);
    }
    // spread, not a clump: max pairwise spread across quadrants
    const quads = new Set(recs.map((r) => (r.x >= 0 ? 'E' : 'W') + (r.z >= 0 ? 'S' : 'N')));
    assert.ok(quads.size >= 3, `${id} records span quadrants (${[...quads]})`);
    z.dispose();
  }
  // density ordering holds in the field itself
  const shire = zoneFor('shire').hunt.records.length;
  const mordor = zoneFor('mordor').hunt.records.length;
  assert.ok(mordor > shire, `mordor field (${mordor}) > shire field (${shire})`);
});

test('streaming: live orcs follow the observer, far zones go quiet', () => {
  const z = zoneFor('rohan');
  z.setObserver(0, 95);
  z.update(0, 0.016);
  const near = z.hunt.liveCount;
  assert.ok(near >= 1, `live orcs near spawn (${near})`);
  assert.ok(near <= z.hunt.records.length, 'live never exceeds records');
  // the far corner (290, 290) is beyond every record's activation radius
  z.setObserver(290, 290);
  z.update(1, 0.016);
  assert.equal(z.hunt.liveCount, 0, 'no live orcs at the far corner');
  z.setObserver(0, 95);
  z.update(2, 0.016);
  assert.ok(z.hunt.liveCount >= 1, 'orcs stream back in');
  z.dispose();
});

test('respawn: a cleared record refills on its clock once the player leaves', () => {
  const z = zoneFor('shire');
  z.setObserver(0, 95);
  z.update(0, 0.016);
  const orc = z.hunt.orcs[0];
  assert.ok(orc, 'a live orc exists');
  const rec = z.hunt.records.find((r) => r.id === orc.recordId);
  assert.ok(rec && rec.alive);
  z.hunt.markDead(orc);
  assert.equal(rec.alive, false);
  // player far away, clock advanced past the Shire's 60 s
  z.setObserver(290, 290);
  for (let i = 0; i < 70; i++) z.update(10 + i, 1);
  assert.equal(rec.alive, true, 'record refilled');
  z.dispose();
});

test('twin rule: the player hero\'s NPC seat stands empty', () => {
  const withHero = zoneFor('shire', { playerKey: 'wizard' });
  assert.ok(!withHero.characters.find((c) => c.id === 'wizard'), 'wizard seat empty for a wizard player');
  const without = zoneFor('shire', {});
  assert.ok(without.characters.find((c) => c.id === 'wizard'), 'wizard seat filled otherwise');
  withHero.dispose();
  without.dispose();
});

test('boss: dormant without the gate, ready with it (Rohan only)', () => {
  const shut = zoneFor('rohan', { gateOpen: false });
  assert.equal(shut.hunt.boss.state, 'dormant');
  const open = zoneFor('rohan', { gateOpen: true });
  assert.equal(open.hunt.boss.state, 'ready');
  const shire = zoneFor('shire', { gateOpen: true });
  assert.equal(shire.hunt.boss, null);
  shut.dispose();
  open.dispose();
  shire.dispose();
});
