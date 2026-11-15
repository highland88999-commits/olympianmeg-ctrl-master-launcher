// tests/weapons-hold-sheathe.test.mjs — the weapon hold + sheathe
// fix (lib/weapons/cgi.js, Merlin 2026-11-15): every weapon GLB
// normalises to grip-at-the-origin, long axis on the aim axis,
// fitted to its intended in-hand length; the hand mount only
// places the grip at the fist; the sheathe hangs the carried
// weapons on the body. Run: node tests/weapons-hold-sheathe.test.mjs
//   (from the repo root)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// GLTFLoader touches `self` (browser global) when it loads the
// embedded textures; node has none, so alias it first.
globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  WEAPON_LENGTH_M,
  WEAPON_MOUNT,
  WEAPON_SHEATHE,
  intendedWeaponLengthM,
  normaliseWeaponGroup,
  buildProceduralWeapon,
  mountWeaponInHand,
  mountWeaponSheathed,
} from '../lib/weapons/cgi.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

async function loadGlb(file) {
  const path = join(ROOT, 'public/models/weapons', file);
  assert.ok(existsSync(path), `${file} missing on disk`);
  const buf = readFileSync(path);
  const gltf = await loader.parseAsync(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  return gltf.scene;
}

function boxOf(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { box, size };
}

// Rotation-invariant box: raw geometry extents in the group's
// own space, ignoring the mount's rotation (a tilted blade's
// world AABB is shorter than the blade; its local box is not).
function localBoxOf(group) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); box.expandByPoint(v); }
  });
  const size = new THREE.Vector3();
  box.getSize(size);
  return { box, size };
}

const approx = (actual, expected, tol, label) => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, want ${expected} ± ${tol}`);
};

// Every GLB the hero can hold: file, class, intended length,
// aim axis after normalisation, grip fraction from the grip end.
const GLB_CASES = [
  { file: 'revolver-handgun.glb', weaponClass: 'firearm', length: 0.32, axis: 'z', gripAt: 0.15 },
  { file: 'crystal-sniper-rifle.glb', weaponClass: 'firearm', length: 1.1, axis: 'z', gripAt: 0.35 },
  { file: 'recurve-bow.glb', weaponClass: 'bow', length: 1.2, axis: 'y', gripAt: 0.50 },
  { file: 'short-sword.glb', weaponClass: 'blade', length: 0.9, axis: 'y', gripAt: 0.08 },
  { file: 'spear.glb', weaponClass: 'spear', length: 1.8, axis: 'y', gripAt: 0.12 },
  { file: 'wizard-staff.glb', weaponClass: 'staff', length: 1.6, axis: 'y', gripAt: 0.30 },
  { file: 'heavy-spiked-mace.glb', weaponClass: 'blunt', length: 0.8, axis: 'y', gripAt: 0.08 },
  { file: 'walking-cane.glb', weaponClass: 'cane', length: 0.95, axis: 'y', gripAt: 0.95 },
  { file: 'rusty-grappling-hook.glb', weaponClass: 'blade', length: 0.9, axis: 'y', gripAt: 0.08 },
];

describe('intended in-hand lengths', () => {
  it('are real-world sizes, ordered small to long', () => {
    assert.equal(intendedWeaponLengthM({ weaponClass: 'firearm' }), 0.32);
    assert.equal(intendedWeaponLengthM({ weaponClass: 'blade' }), 0.9);
    assert.equal(intendedWeaponLengthM({ weaponClass: 'bow' }), 1.2);
    assert.equal(intendedWeaponLengthM({ weaponClass: 'spear' }), 1.8);
    for (const [cls, len] of Object.entries(WEAPON_LENGTH_M)) {
      assert.ok(len >= 0.2 && len <= 2.0, `${cls}: ${len} m is not a hand weapon`);
    }
  });
  it('the sniper rifle is a long gun, not a handgun', () => {
    assert.equal(
      intendedWeaponLengthM({ weaponClass: 'firearm', src: '/models/weapons/crystal-sniper-rifle.glb' }),
      1.1);
  });
});

describe('GLB normalisation (grip at the origin, true size)', () => {
  for (const c of GLB_CASES) {
    it(`${c.file}: longest ≈ ${c.length} m on +${c.axis.toUpperCase()}, grip at the origin`, async () => {
      const group = await loadGlb(c.file);
      const out = normaliseWeaponGroup(THREE, group, { weaponClass: c.weaponClass, src: `/models/weapons/${c.file}` });
      assert.ok(out && out.isGroup, 'normalise returns the group');
      const { box, size } = boxOf(out);
      const longest = Math.max(size.x, size.y, size.z);
      approx(longest, c.length, 0.12 * c.length, `${c.file} longest`);
      const axisIdx = { x: 0, y: 1, z: 2 }[c.axis];
      assert.equal(size.getComponent(axisIdx), longest, `${c.file}: longest axis is ${c.axis}`);
      // The grip (group origin) splits the long axis at the grip
      // fraction: min ≈ −gripAt·L behind the fist, max ahead.
      approx(box.min.getComponent(axisIdx), -c.gripAt * c.length, 0.12 * c.length, `${c.file} min.${c.axis}`);
      approx(box.max.getComponent(axisIdx), (1 - c.gripAt) * c.length, 0.12 * c.length, `${c.file} max.${c.axis}`);
    });
  }
  it('the revolver barrel points forward: thin muzzle at +Z, grip drooping at −Z', async () => {
    const group = await loadGlb('revolver-handgun.glb');
    normaliseWeaponGroup(THREE, group, { weaponClass: 'firearm', src: '/models/weapons/revolver-handgun.glb' });
    const { box } = boxOf(group);
    const spreadAt = (zLo, zHi) => {
      let lo = Infinity;
      let hi = -Infinity;
      group.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const z = p.getZ(i);
          if (z < zLo || z > zHi) continue;
          const y = p.getY(i);
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      });
      return hi - lo;
    };
    // Muzzle tip (last 5 cm): a thin barrel. Grip end (first 5 cm):
    // the grip droops well below the barrel line.
    assert.ok(spreadAt(box.max.z - 0.05, box.max.z) < 0.06,
      `muzzle Y-spread ${spreadAt(box.max.z - 0.05, box.max.z)}`);
    assert.ok(spreadAt(box.min.z, box.min.z + 0.05) > 0.06,
      `grip-end Y-spread ${spreadAt(box.min.z, box.min.z + 0.05)}`);
  });
  it('the spear lost its Tripo display disc: no 0.9 m plate at the butt', async () => {
    const group = await loadGlb('spear.glb');
    normaliseWeaponGroup(THREE, group, { weaponClass: 'spear', src: '/models/weapons/spear.glb' });
    const { box, size } = boxOf(group);
    assert.ok(size.x < 0.35, `spear width ${size.x} — the disc is still there`);
    assert.ok(size.z < 0.35, `spear depth ${size.z} — the disc is still there`);
    approx(Math.max(size.x, size.y, size.z), 1.8, 0.2, 'spear length');
    // The shaft — not the disc's centre — sits on the fist: the
    // box is centred on the origin across the shaft, both ways.
    assert.ok(Math.abs(box.min.x + box.max.x) < 0.12, `spear x-centre ${box.min.x + box.max.x}`);
    assert.ok(Math.abs(box.min.z + box.max.z) < 0.12, `spear z-centre ${box.min.z + box.max.z}`);
  });
  it('the short sword is straightened: no diagonal across the box', async () => {
    const group = await loadGlb('short-sword.glb');
    normaliseWeaponGroup(THREE, group, { weaponClass: 'blade', src: '/models/weapons/short-sword.glb' });
    const { size } = boxOf(group);
    assert.ok(size.z < 0.35, `sword depth ${size.z} — still diagonal`);
    approx(size.y, 0.9, 0.1, 'sword length');
  });
});

describe('procedural builds normalise the same way', () => {
  for (const [weaponClass, build] of [
    ['firearm', 'firearm'], ['bow', 'bow'], ['blade', 'blade'],
    ['spear', 'spear'], ['staff', 'staff'], ['cane', 'cane'], ['blunt', 'blunt'],
  ]) {
    it(`${build}: longest ≈ ${WEAPON_LENGTH_M[weaponClass]} m, grip at the origin`, () => {
      const g = buildProceduralWeapon(THREE, build);
      normaliseWeaponGroup(THREE, g, { weaponClass });
      const { box, size } = boxOf(g);
      const target = WEAPON_LENGTH_M[weaponClass];
      const longest = Math.max(size.x, size.y, size.z);
      approx(longest, target, 0.12 * target, `${build} longest`);
      // Firearms lie barrel-forward on +Z, the rest stand on +Y.
      const axisIdx = weaponClass === 'firearm' ? 2 : 1;
      assert.equal(size.getComponent(axisIdx), longest, `${build}: longest axis`);
      assert.ok(box.min.getComponent(axisIdx) <= 0.05, `${build}: grip end behind the fist`);
      // The weapon reaches a good way from the fist in at least
      // one direction (a bow reaches both ways, a cane hangs down).
      assert.ok(box.max.getComponent(axisIdx) > target * 0.3
        || box.min.getComponent(axisIdx) < -target * 0.3,
        `${build}: business end ahead of the fist`);
    });
  }
});

describe('in-hand mount (grip at the fist, true size)', () => {
  for (const weaponClass of ['firearm', 'bow', 'blade', 'spear', 'staff', 'cane', 'blunt']) {
    it(`${weaponClass}: the fist is at the mount point, the weapon its true length`, () => {
      const anchor = new THREE.Group();
      const build = weaponClass === 'blunt' ? 'blunt' : weaponClass;
      const g = buildProceduralWeapon(THREE, build);
      normaliseWeaponGroup(THREE, g, { weaponClass });
      const out = mountWeaponInHand(THREE, anchor, g, { weaponClass, height: 1.9 });
      assert.equal(out, g);
      assert.equal(anchor.children.length, 1);
      const m = WEAPON_MOUNT[weaponClass];
      approx(g.position.x, m.at[0] * (1.9 / 1.8), 0.01, 'hand x');
      approx(g.position.y, m.at[1] * 1.9, 0.01, 'hand y');
      assert.ok(g.position.y > 1 && g.position.y < 1.4, `hand y ${g.position.y}`);
      // World-space: the weapon is its intended length, and the
      // grip (the group origin) is exactly at the fist.
      const { size } = localBoxOf(g);
      const longest = Math.max(size.x, size.y, size.z);
      const target = WEAPON_LENGTH_M[weaponClass];
      approx(longest, target, 0.15 * target, `${weaponClass} in-hand longest`);
      assert.ok(g.name.startsWith('weapon-in-hand:'));
    });
  }
  it('the mount never re-scales a fitted group', () => {
    const anchor = new THREE.Group();
    const g = buildProceduralWeapon(THREE, 'firearm');
    normaliseWeaponGroup(THREE, g, { weaponClass: 'firearm' });
    mountWeaponInHand(THREE, anchor, g, { weaponClass: 'firearm', height: 1.9 });
    assert.equal(g.scale.x, 1, 'mount scale stays 1');
    assert.equal(g.scale.y, 1, 'mount scale stays 1');
    assert.equal(g.scale.z, 1, 'mount scale stays 1');
  });
});

describe('sheathe mount (carried, on the body, true size)', () => {
  for (const weaponClass of ['firearm', 'bow', 'blade', 'spear', 'staff', 'cane', 'blunt']) {
    it(`${weaponClass}: hangs at its sheathe spot, inside the body silhouette`, () => {
      const anchor = new THREE.Group();
      const g = buildProceduralWeapon(THREE, weaponClass);
      normaliseWeaponGroup(THREE, g, { weaponClass });
      const out = mountWeaponSheathed(THREE, anchor, g, { weaponClass, height: 1.9 });
      assert.ok(out, `${weaponClass} has a sheathe spot`);
      assert.ok(g.name.startsWith('weapon-sheathed:'));
      const m = WEAPON_SHEATHE[weaponClass];
      approx(g.position.x, m.at[0] * (1.9 / 1.8), 0.02, 'sheathe x');
      approx(g.position.y, m.at[1] * 1.9, 0.02, 'sheathe y');
      // Nothing floats free of the body and nothing is oversized:
      // the whole sheathed weapon stays within a body-sized box
      // (long staves/spears may rise above the head, never wide).
      const { box } = boxOf(anchor);
      assert.ok(Math.abs(box.min.x) < 0.8 && Math.abs(box.max.x) < 0.8, `${weaponClass} x ${box.min.x}..${box.max.x}`);
      assert.ok(box.min.y > -0.2 && box.max.y < 3.0, `${weaponClass} y ${box.min.y}..${box.max.y}`);
      assert.ok(Math.abs(box.min.z) < 0.8 && Math.abs(box.max.z) < 0.8, `${weaponClass} z ${box.min.z}..${box.max.z}`);
      const longest = Math.max(localBoxOf(g).size.x, localBoxOf(g).size.y, localBoxOf(g).size.z);
      approx(longest, WEAPON_LENGTH_M[weaponClass], 0.15 * WEAPON_LENGTH_M[weaponClass], `${weaponClass} sheathed longest`);
    });
  }
  it('the cannon has no sheathe: it is never carried', () => {
    const anchor = new THREE.Group();
    const g = buildProceduralWeapon(THREE, 'cannon');
    assert.equal(mountWeaponSheathed(THREE, anchor, g, { weaponClass: 'cannon', height: 1.9 }), null);
    assert.equal(anchor.children.length, 0);
  });
  it('mounting with no anchor or group returns null', () => {
    assert.equal(mountWeaponSheathed(THREE, null, new THREE.Group(), {}), null);
    assert.equal(mountWeaponSheathed(THREE, new THREE.Group(), null, {}), null);
  });
});

describe('wiring: the page sheathes, the forge previews the fit', () => {
  it('the ME page sheathes on swap and disposes the sheathe on exit', () => {
    const src = readFileSync(join(ROOT, 'app/middle-earth/page.jsx'), 'utf8');
    assert.ok(src.includes('mountWeaponSheathed('), 'page mounts the sheathe');
    assert.ok(src.includes('syncSheathe('), 'page re-syncs the sheathe on swap');
    assert.ok(src.includes('sheathed.lastOut'), 'the swapped-out weapon goes on the body');
    assert.ok(src.includes('sheathed.groups.clear()'), 'zone cleanup disposes the sheathe');
  });
  it('the forge preview runs the shared fit', () => {
    const src = readFileSync(join(ROOT, 'app/weapons-forge/page.jsx'), 'utf8');
    assert.ok(src.includes('normaliseWeaponGroup('), 'preview normalises the model');
    assert.ok(src.includes('weaponClass={previewWeapon.weaponClass}'), 'preview knows the class');
  });
});
