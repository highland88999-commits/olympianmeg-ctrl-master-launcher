// tests/hawkins-glb.test.mjs
// HAWKINS — the Tripo GLB swap (Merlin, 2026-10-22):
// - the five in-hand characters (Eleven, Eddie, Hopper, Vecna,
//   Demogorgon) are placed as real GLBs in public/models/hawkins,
//   each with its 65-joint Mixamo skeleton intact, no baked clips
// - the three creatures landed the same day with their rigs: the
//   Demobats (78 joints, humanoid-retarget template — arm chains skin
//   the wings), the Mind Flayer (65) and its Hybrid (64) on
//   Tripo-native 'Other' rigs. The manifest now holds all 8 bodies
//   PLACED; the Hybrid stays a variant entry (red aura, speedMul > 1)
// - the joint resolvers read the REAL joint lists (raw file names and
//   three-sanitized names), report gaps instead of erroring, and find
//   NO jaw — the honest expression limit, pinned
// - the pose driver is deterministic and personality-shaped
// - the engine source: the procedural bodies for the five are GONE
//   from the spawn paths; Vecna/Demogorgon spawn GLBs; the bats and
//   the Mind Flayer route through the manifest (entry.file decides),
//   their procedural fallbacks retained for a missing file only
//
// Run: node --test tests/hawkins-glb.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  HAWKINS_MODELS, HAWKINS_PLAYER_CHARACTERS,
  hawkinsModel, hawkinsPlacedModels, hawkinsPendingModels,
} from '../lib/hawkins/models.js';
import {
  normalizeHawkinsJointName, boneLookupKey, resolveHawkinsJoints,
  resolveCreatureJoints, buildJointObjects, createPoseDriver,
  pickBones, createFlapDriver, createSwayDriver,
  HAWKINS_PERSONALITIES,
} from '../lib/hawkins/rig.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

function parseGlb(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'glTF', 'GLB magic');
  assert.equal(buf.readUInt32LE(4), 2, 'GLB version');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.toString('ascii', 16, 20), 'JSON', 'first chunk is JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}

function inspect(relFile) {
  const p = join(repo, 'public', relFile);
  const js = parseGlb(readFileSync(p));
  const skin = (js.skins || [])[0];
  const jointNames = skin ? skin.joints.map((j) => js.nodes[j].name) : [];
  let tris = 0;
  for (const m of js.meshes || []) {
    for (const prim of m.primitives) {
      if (prim.indices !== undefined) tris += js.accessors[prim.indices].count / 3;
    }
  }
  return { js, jointNames, tris, bytes: statSync(p).size };
}

const PLACED = ['eleven', 'eddie', 'hopper', 'vecna', 'demogorgon'];

describe('the placed GLBs are real, rigged and game-weight', () => {
  for (const id of PLACED) {
    it(`${id}: file exists, 65-joint Mixamo skeleton, no baked clips`, () => {
      const entry = hawkinsModel(id);
      assert.equal(entry.status, 'placed');
      assert.ok(entry.file && entry.file.startsWith('/models/hawkins/'));
      const { js, jointNames, tris, bytes } = inspect(entry.file.replace(/^\//, ''));
      assert.equal((js.skins || []).length, 1, 'exactly one skin');
      assert.equal(jointNames.length, 65, '65 joints');
      assert.ok(jointNames.every((n) => n.startsWith('mixamorig:')), 'Mixamo dialect names');
      assert.equal((js.animations || []).length, 0, 'no baked clips — all motion is code');
      assert.ok(tris > 90000 && tris < 110000, `tri count sane (${tris})`);
      assert.ok(bytes < 1024 * 1024, `under 1 MB (${bytes})`);
      // the delivered rig exports carry no materials — the loader's
      // tint is what dresses them; pin the truth so nobody waits for
      // textures that are not in the file
      assert.equal((js.materials || []).length, 0, 'no materials in the export');
      assert.ok(entry.tint !== undefined, 'manifest carries a tint for it');
    });
  }

  it('all five share the identical joint list', () => {
    const lists = PLACED.map((id) => inspect(hawkinsModel(id).file.replace(/^\//, '')).jointNames.join('|'));
    for (const l of lists) assert.equal(l, lists[0]);
  });
});

const CREATURES = ['demobats', 'mind-flayer', 'mind-flayer-hybrid'];

describe('the manifest holds all eight bodies', () => {
  it('8 placed, 0 awaiting-rig — every body has a real file', () => {
    assert.equal(HAWKINS_MODELS.length, 8);
    assert.deepEqual(
      hawkinsPlacedModels().map((m) => m.id).sort(),
      [...PLACED, ...CREATURES].sort(),
    );
    assert.deepEqual(hawkinsPendingModels(), [], 'nothing is pending any more');
    for (const m of HAWKINS_MODELS) {
      assert.ok(m.file && m.file.startsWith('/models/hawkins/'), `${m.id} carries its file`);
      assert.ok(existsSync(join(repo, 'public', m.file)), `${m.id} file exists on disk`);
    }
  });

  it('creature scale reads kept the tune-on-arrival values', () => {
    assert.equal(hawkinsModel('demobats').heightUnits, 7);
    assert.equal(hawkinsModel('mind-flayer').scaleBasis, 'span');
    assert.equal(hawkinsModel('mind-flayer').spanUnits, 820);
    assert.equal(hawkinsModel('mind-flayer-hybrid').spanUnits, 780);
  });

  it('player characters are the three humans, Eleven first (default)', () => {
    assert.deepEqual(HAWKINS_PLAYER_CHARACTERS.map((c) => c.id), ['eleven', 'eddie', 'hopper']);
  });

  it('the Hybrid is a variant of the Flayer — red aura, faster', () => {
    const hy = hawkinsModel('mind-flayer-hybrid');
    assert.equal(hy.variantOf, 'mind-flayer');
    assert.equal(hy.aura, 0xff2222);
    assert.ok(hy.speedMul > 1, 'hybrid attacks faster');
    assert.equal(hawkinsModel('mind-flayer').speedMul, 1);
  });

  it('scale reads preserve the game: demogorgon head at the headshot line', () => {
    // headshot test in the engine reads mesh.y + 32 (±9); the GLB head
    // sits at ~0.87 of its height, so 36 units puts it at ~31.3
    const dg = hawkinsModel('demogorgon');
    assert.equal(dg.heightUnits, 36);
    assert.ok(Math.abs(dg.heightUnits * 0.87 - 32) < 9);
    assert.equal(hawkinsModel('vecna').heightUnits, 50);
  });
});

describe('the creature GLBs are real, rigged and game-weight', () => {
  const EXPECTED = { demobats: 78, 'mind-flayer': 65, 'mind-flayer-hybrid': 64 };
  for (const [id, joints] of Object.entries(EXPECTED)) {
    it(`${id}: file exists, exactly ${joints} joints survived the weight pass`, () => {
      const entry = hawkinsModel(id);
      assert.equal(entry.status, 'placed');
      const { js, jointNames, tris, bytes } = inspect(entry.file.replace(/^\//, ''));
      assert.equal((js.skins || []).length, 1, 'exactly one skin');
      assert.equal(jointNames.length, joints, `${joints} joints — a lost joint is a lost motion`);
      assert.equal(new Set(jointNames).size, joints, 'joint names unique');
      assert.equal((js.animations || []).length, 0, 'no baked clips — all motion is code');
      assert.ok((js.extensionsUsed || []).includes('EXT_meshopt_compression'), 'meshopt recipe applied');
      assert.equal((js.materials || []).length, 0, 'no materials in the export — the tint dresses it');
      assert.ok(entry.tint !== undefined, 'manifest carries a tint for it');
      assert.ok(tris > 90000 && tris < 110000, `tri count sane (${tris}) — NOT simplified`);
      assert.ok(bytes < 1024 * 1024, `under 1 MB (${bytes})`);
    });
  }

  it('the demobats rig is the humanoid-retarget template (arm chains skin the wings)', () => {
    const names = inspect(hawkinsModel('demobats').file.replace(/^\//, '')).jointNames;
    for (const n of ['BoneRoot', 'Pelvis', 'Waist', 'Spine01', 'Spine02', 'L_Upperarm', 'R_Upperarm', 'L_Hand', 'R_Hand', 'Head']) {
      assert.ok(names.includes(n), n);
    }
  });

  it('the flayer rigs are tripo-native: Root + named limb chains', () => {
    for (const id of ['mind-flayer', 'mind-flayer-hybrid']) {
      const names = inspect(hawkinsModel(id).file.replace(/^\//, '')).jointNames;
      assert.ok(names.includes('tripo::Root'), `${id} root`);
      assert.ok(names.filter((n) => /_Limb_\d$/.test(n)).length >= 25, `${id} limb chains`);
      assert.ok(names.includes('tripo::Spine_0'), `${id} spine`);
    }
  });
});

describe('the joint resolver', () => {
  const rawNames = inspect('models/hawkins/eleven.glb').jointNames;

  it('resolves every role from the real (raw) joint list', () => {
    const r = resolveHawkinsJoints(rawNames);
    assert.equal(r.dialect, 'mixamo');
    assert.deepEqual(r.missing, []);
    assert.ok(r.hips && r.head && r.neck);
    assert.equal(r.spine.length, 3);
    for (const side of ['left', 'right']) {
      assert.ok(r.arms[side].arm && r.arms[side].foreArm && r.arms[side].hand);
      assert.equal(r.arms[side].fingers.length, 20, 'full finger chain per hand');
      assert.ok(r.legs[side].upLeg && r.legs[side].leg && r.legs[side].foot);
    }
  });

  it('resolves the same from three-sanitized names', () => {
    const sanitized = rawNames.map((n) => n.replace(':', ''));
    const r = resolveHawkinsJoints(sanitized);
    assert.equal(r.dialect, 'mixamo');
    assert.deepEqual(r.missing, []);
    assert.equal(boneLookupKey('mixamorig:Hips'), boneLookupKey('mixamorigHips'));
    assert.equal(normalizeHawkinsJointName('mixamorig:LeftUpLeg'), 'LeftUpLeg');
  });

  it('honest limit: no jaw on these rigs — expressions cannot be driven', () => {
    const r = resolveHawkinsJoints(rawNames);
    assert.equal(r.jaw, null);
  });

  it('gaps are reported, not fatal', () => {
    const r = resolveHawkinsJoints(rawNames.filter((n) => !/Head/.test(n)));
    assert.ok(r.missing.includes('head'));
    assert.equal(r.head, null);
    const empty = resolveHawkinsJoints([]);
    assert.equal(empty.dialect, 'unknown');
    assert.ok(empty.missing.length > 0);
  });

  it('creature resolution finds sway chains and wings by name', () => {
    const r = resolveCreatureJoints(['tripo::Tail_0', 'Wing_L', 'Wing_R', 'Leg_3', 'Root']);
    assert.ok(r.sway.includes('tripo::Tail_0'));
    assert.ok(r.sway.includes('Leg_3'));
    assert.equal(r.wings.length, 2);
  });

  it('creature resolution reads the REAL demobats rig — upperarms are the wings', () => {
    const names = inspect(hawkinsModel('demobats').file.replace(/^\//, '')).jointNames;
    const r = resolveCreatureJoints(names);
    assert.equal(r.dialect, 'humanoid');
    assert.deepEqual(r.wings, ['L_Upperarm', 'R_Upperarm']);
    assert.deepEqual(r.sway, ['Waist', 'Spine01', 'Spine02', 'NeckTwist01', 'NeckTwist02']);
  });

  it('creature resolution reads the REAL flayer rigs — limb chains sway, no wings', () => {
    for (const [id, swayCount] of [['mind-flayer', 43], ['mind-flayer-hybrid', 31]]) {
      const names = inspect(hawkinsModel(id).file.replace(/^\//, '')).jointNames;
      const r = resolveCreatureJoints(names);
      assert.equal(r.dialect, 'tripo', id);
      assert.deepEqual(r.wings, [], `${id} has no wings — it hovers`);
      assert.equal(r.sway.length, swayCount, `${id} sway chain count`);
      assert.ok(r.sway.includes('tripo::Spine_0'), `${id} spine sways`);
      assert.ok(r.sway.every((n) => /_Limb_\d$|Spine/.test(n)), `${id} sway is named chains only — bone_N fillers stay at bind`);
    }
  });

  it('creature resolution survives unknown and empty rigs', () => {
    const r = resolveCreatureJoints(['SomeBone', 'Another']);
    assert.equal(r.dialect, 'generic');
    assert.deepEqual(r.sway, []);
    assert.deepEqual(r.wings, []);
    assert.deepEqual(resolveCreatureJoints([]).all, []);
    assert.deepEqual(resolveCreatureJoints(null).all, []);
  });
});

describe('the creature drivers move the real rigs', () => {
  const fakeBone = (name) => ({
    name,
    rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  });
  const rigFor = (id) => {
    const names = inspect(hawkinsModel(id).file.replace(/^\//, '')).jointNames;
    return { names, bones: names.map(fakeBone), resolved: resolveCreatureJoints(names) };
  };

  it('the demobats flap: both wing roots move, opposed', () => {
    const { bones, resolved } = rigFor('demobats');
    const flap = createFlapDriver(pickBones(bones, resolved.wings), { hz: 2.6, amp: 0.65 });
    assert.ok(flap, 'a flap driver exists for the bat rig');
    flap.update(0.31, 0);
    const [l, r] = pickBones(bones, resolved.wings);
    assert.ok(l.rotation.z !== 0 && r.rotation.z !== 0, 'both wings move');
    assert.equal(Math.sign(l.rotation.z), -Math.sign(r.rotation.z), 'wings oppose');
  });

  it('the flayers get NO flap driver — sway only, all sway bones move', () => {
    for (const id of ['mind-flayer', 'mind-flayer-hybrid']) {
      const { bones, resolved } = rigFor(id);
      assert.equal(createFlapDriver(pickBones(bones, resolved.wings)), null, `${id} flap is null`);
      const swayBones = pickBones(bones, resolved.sway);
      assert.equal(swayBones.length, resolved.sway.length, `${id} every sway name picks a bone`);
      createSwayDriver(swayBones, { amp: 0.06, hz: 0.4 }).update(0.77);
      assert.ok(swayBones.every((b) => b.rotation.x !== 0 || b.rotation.y !== 0), `${id} sway moves`);
    }
  });

  it('the bat spine sways beneath the flap', () => {
    const { bones, resolved } = rigFor('demobats');
    const swayBones = pickBones(bones, resolved.sway);
    assert.equal(swayBones.length, 5);
    createSwayDriver(swayBones, { amp: 0.04, hz: 0.4 }).update(0.77);
    assert.ok(swayBones.some((b) => b.rotation.x !== 0 || b.rotation.y !== 0), 'spine moves');
  });
});

describe('the pose driver', () => {
  const fakeBone = (name) => ({
    name,
    rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  });
  const buildRig = (personality) => {
    const names = inspect('models/hawkins/eleven.glb').jointNames.map((n) => n.replace(':', ''));
    const bones = names.map(fakeBone);
    const joints = buildJointObjects(bones, resolveHawkinsJoints(names));
    return { bones, joints, driver: createPoseDriver(joints, personality) };
  };

  it('is deterministic — same t and state, same pose', () => {
    const a = buildRig(HAWKINS_PERSONALITIES.demogorgon);
    const b = buildRig(HAWKINS_PERSONALITIES.demogorgon);
    for (const t of [0, 0.4, 1.7, 3.33]) {
      a.driver.update(t, { mode: 'chase', phase: 1.2, flare: 0.4 });
      b.driver.update(t, { mode: 'chase', phase: 1.2, flare: 0.4 });
      a.bones.forEach((bone, i) => {
        assert.equal(bone.rotation.x, b.bones[i].rotation.x);
        assert.equal(bone.rotation.y, b.bones[i].rotation.y);
        assert.equal(bone.rotation.z, b.bones[i].rotation.z);
      });
    }
  });

  it('produces finite rotations and a non-negative bob in every mode', () => {
    const { bones, driver } = buildRig(HAWKINS_PERSONALITIES.eleven);
    for (const mode of ['idle', 'walk', 'run', 'ride', 'stalk', 'chase', 'attack', 'weakened', 'hover']) {
      const out = driver.update(2.5, { mode, phase: 0.7, flare: 0.5 });
      assert.ok(Number.isFinite(out.bobY) && out.bobY >= 0, `${mode} bob`);
      for (const bone of bones) {
        assert.ok(Number.isFinite(bone.rotation.x + bone.rotation.y + bone.rotation.z), `${mode} finite`);
      }
    }
  });

  it('personalities differ: the Demogorgon crouches deeper than Eleven', () => {
    const dg = buildRig(HAWKINS_PERSONALITIES.demogorgon);
    const el = buildRig(HAWKINS_PERSONALITIES.eleven);
    dg.driver.update(1.1, { mode: 'stalk', phase: 0 });
    el.driver.update(1.1, { mode: 'stalk', phase: 0 });
    const spineX = (rig) => rig.joints.spine[0].rotation.x;
    assert.ok(spineX(dg) > spineX(el) * 2, `demogorgon prowl (${spineX(dg)}) vs eleven (${spineX(el)})`);
  });

  it('attack flare raises the arms beyond idle', () => {
    const { joints, driver } = buildRig(HAWKINS_PERSONALITIES.vecna);
    driver.update(0.8, { mode: 'hover', phase: 0, flare: 0 });
    const idleZ = Math.abs(joints.arms.left.arm.rotation.z);
    driver.update(0.8, { mode: 'attack', phase: 0, flare: 1 });
    const atkZ = Math.abs(joints.arms.left.arm.rotation.z);
    assert.ok(atkZ > idleZ, `flare raises arms (${idleZ} -> ${atkZ})`);
    // and the fingers curl harder with flare
    driver.update(0.8, { mode: 'hover', phase: 0, flare: 0 });
    const idleCurl = joints.arms.left.fingers[0].rotation.x;
    driver.update(0.8, { mode: 'hover', phase: 0, flare: 1 });
    assert.ok(joints.arms.left.fingers[0].rotation.x > idleCurl, 'fingers curl with flare');
  });

  it('no Math.random in the gait math', () => {
    assert.ok(!/Math\.random/.test(read('lib/hawkins/rig.js')), 'rig.js is deterministic');
  });
});

describe('the engine swap (source pins)', () => {
  const engine = read('app/hawkins/engine.js');

  it('the five spawn as GLBs; character select exists', () => {
    assert.ok(engine.includes("instantiateHawkins('demogorgon')"));
    assert.ok(engine.includes("instantiateHawkins('vecna')"));
    assert.ok(engine.includes('setPlayerCharacter'));
    assert.ok(engine.includes("from '../../lib/hawkins/models.js'"));
    assert.ok(engine.includes("from '../../lib/hawkins/loader.js'"));
  });

  it('the procedural bodies for the five are gone', () => {
    assert.ok(!/petal/i.test(engine), 'no petal-head builder');
    assert.ok(!engine.includes('CylinderGeometry(2.6, 4.2, 42'), 'no Vecna cylinder body');
    assert.ok(!engine.includes('TorusGeometry(3.4'), 'no Vecna rib cage');
    assert.ok(!engine.includes('ConeGeometry(3.2, 11, 4)'), 'no demogorgon petal cones');
    assert.ok(!engine.includes('CylinderGeometry(2.2, 4.2, 30'), 'no demogorgon cylinder body');
  });

  it('vecna record keeps gameplay fields, body refs removed', () => {
    assert.ok(!engine.includes('tendrils'), 'no tendril body parts remain');
    assert.ok(engine.includes('captureWeak: false'));
  });

  it('bats and mind flayer route through the manifest, fallbacks kept', () => {
    assert.ok(engine.includes("hawkinsModel('demobats')"), 'bat spawn consults the manifest');
    assert.ok(engine.includes('buildProceduralMindflayer'), 'flayer fallback builder retained');
    assert.ok(engine.includes('hawkinsModel(variantId'), 'flayer spawn is manifest-routed');
    assert.ok(engine.includes('mf.speedMul'), 'variant speed reaches the attack cadence');
  });

  it('with files placed, both creature spawns take the GLB branch', () => {
    // the branch condition is the manifest entry's file — placed
    // entries (pinned above) make the GLB path the live one, and the
    // procedural bodies remain only behind the else
    assert.ok(engine.includes('if (entry.file)'), 'flayer spawn branches on the manifest file');
    assert.ok(engine.includes('if (entry && entry.file)'), 'bat spawn branches on the manifest file');
    assert.ok(engine.includes("instantiateHawkins('demobats')"), 'bat swarm instantiates the GLB');
    assert.ok(engine.includes('instantiateHawkins(entry.id)'), 'flayer instantiates by manifest id (hybrid included)');
  });

  it('the page offers the three characters', () => {
    const page = read('app/hawkins/page.jsx');
    assert.ok(page.includes('HAWKINS_PLAYER_CHARACTERS'));
    assert.ok(page.includes('setPlayerCharacter'));
    assert.ok(page.includes('pickCharacter'));
  });
});
