// tests/earth2-models.test.mjs
// Earth 2 — Dinosaur Bay (Merlin, 2026-10-22):
// - the models manifest: 34 placed foundry models + Pachycephalosaurus
//   honestly pending (never uploaded — file null, no stand-in)
// - every placed file exists under public/models/earth2, parses as a
//   GLB, stayed game-weight (<= 5 MB), and kept its rig (skins >= 1
//   for creatures) through the optimization pass
// - the bone-role resolver against BOTH real rig dialects, using the
//   actual joint lists measured off the Studio files (humanoid
//   retarget + Tripo-native, raw and three-sanitized name forms)
// - the chamber wiring: the Bay is mounted, the owner gate is intact
//
// Run: node --test tests/earth2-models.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EARTH2_MODELS,
  earth2PlacedModels,
  earth2PendingModels,
} from '../lib/earth2/models.js';
import { resolveBones, normalizeJointName } from '../lib/earth2/bones.js';

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

describe('the Bay manifest', () => {
  it('holds 35 entries: 34 placed + Pachycephalosaurus awaiting upload', () => {
    assert.equal(EARTH2_MODELS.length, 35);
    assert.equal(earth2PlacedModels().length, 34);
    const pending = earth2PendingModels();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].slug, 'pachycephalosaurus');
    assert.equal(pending[0].file, null);
    assert.equal(pending[0].status, 'awaiting-upload');
  });

  it('slugs are unique and kind counts match the foundry roster', () => {
    assert.equal(new Set(EARTH2_MODELS.map((m) => m.slug)).size, 35);
    const by = (k) => EARTH2_MODELS.filter((m) => m.kind === k).length;
    assert.equal(by('dinosaur'), 16);
    assert.equal(by('flyer'), 1);
    assert.equal(by('plant'), 10);
    assert.equal(by('landform'), 8);
  });

  it('every entry carries a real-world scale; creatures carry diet, social, posture', () => {
    for (const m of EARTH2_MODELS) {
      assert.ok(m.scaleM > 0, m.slug);
      assert.ok(['length', 'height', 'diameter'].includes(m.scaleBasis), m.slug);
      assert.ok(m.name.length > 0, m.slug);
      if (m.kind === 'dinosaur' || m.kind === 'flyer') {
        assert.ok(['carnivore', 'herbivore', 'omnivore'].includes(m.diet), m.slug);
        assert.ok(['herd', 'solo', 'pack', 'flock'].includes(m.social), m.slug);
        assert.ok(['biped', 'quadruped'].includes(m.posture), m.slug);
      }
      if (m.file) assert.equal(m.file, `/models/earth2/${m.slug}.glb`, m.slug);
    }
    // The Foundry-confirmed assignments.
    const bySlug = Object.fromEntries(EARTH2_MODELS.map((m) => [m.slug, m]));
    assert.equal(bySlug['tyrannosaurus-rex'].social, 'solo');
    assert.equal(bySlug['triceratops'].social, 'herd');
    assert.equal(bySlug['triceratops'].diet, 'herbivore');
    assert.equal(bySlug['velociraptor'].social, 'pack');
  });
});

describe('the optimized files on disk', () => {
  for (const m of earth2PlacedModels()) {
    it(`${m.slug}.glb exists, is game-weight, and kept its shape`, () => {
      const p = join(repo, 'public', 'models', 'earth2', `${m.slug}.glb`);
      const buf = readFileSync(p);
      assert.ok(buf.length <= 5 * 1024 * 1024, `${m.slug} is ${(buf.length / 1048576).toFixed(2)} MB`);
      const json = parseGlb(buf);
      assert.ok((json.meshes || []).length >= 1, `${m.slug} has a mesh`);
      assert.ok(
        (json.extensionsUsed || []).includes('EXT_meshopt_compression'),
        `${m.slug} carries meshopt geometry`
      );
      if (m.kind === 'dinosaur' || m.kind === 'flyer') {
        assert.ok((json.skins || []).length >= 1, `${m.slug} kept its rig (skins >= 1)`);
        assert.ok((json.nodes || []).some((n) => n.skin !== undefined), `${m.slug} has a skinned node`);
      }
      assert.equal(statSync(p).size, buf.length);
    });
  }
});

// The real joint lists, measured off the Studio files 2026-10-22.
const TREX_JOINTS = 'BoneRoot|Hip|Pelvis|L_Thigh|L_Calf|L_Foot|L_ToeBase|L_CalfTwist01|L_CalfTwist02|L_KneeShareBone|L_ThighTwist01|L_ThighTwist02|R_Thigh|R_Calf|R_KneeShareBone|R_Foot|R_ToeBase|R_CalfTwist01|R_CalfTwist02|R_ThighTwist01|R_ThighTwist02|Waist|Spine01|Spine02|NeckTwist01|NeckTwist02|Head|FacialBone|R_Eye|L_Eye|L_Clavicle|L_Upperarm|L_Forearm|L_ForearmTwist01|L_ForearmTwist02|L_ElbowShareBone|L_Hand|L_Pinky1|L_Pinky2|L_Pinky3|L_Ring1|L_Ring2|L_Ring3|L_Mid1|L_Mid2|L_Mid3|L_Index1|L_Index2|L_Index3|L_Thumb1|L_Thumb2|L_Thumb3|L_UpperarmTwist01|L_UpperarmTwist02|R_Clavicle|R_Upperarm|R_Forearm|R_ElbowShareBone|R_ForearmTwist01|R_ForearmTwist02|R_Hand|R_Ring1|R_Ring2|R_Ring3|R_Mid1|R_Mid2|R_Mid3|R_Thumb1|R_Thumb2|R_Thumb3|R_Index1|R_Index2|R_Index3|R_Pinky1|R_Pinky2|R_Pinky3|R_UpperarmTwist01|R_UpperarmTwist02'.split('|');
const TRICERATOPS_JOINTS = 'tripo::Root|bone_1|tripo::Spine_0|tripo::1_Left_Limb_0|tripo::1_Left_Limb_1|tripo::1_Left_Limb_2|tripo::1_Left_Limb_3|tripo::1_Right_Limb_0|tripo::1_Right_Limb_1|tripo::1_Right_Limb_2|tripo::1_Right_Limb_3|tripo::Spine_1|tripo::Spine_2|tripo::Head_0|bone_14|tripo::0_Left_Limb_0|tripo::0_Left_Limb_1|tripo::0_Left_Limb_2|tripo::0_Left_Limb_3|bone_19|tripo::0_Right_Limb_0|tripo::0_Right_Limb_1|tripo::0_Right_Limb_2|tripo::0_Right_Limb_3|tripo::Head_1|tripo::Head_2|bone_26|bone_27|bone_28|bone_29|tripo::Head_3'.split('|');
const BRACHIOSAURUS_JOINTS = 'tripo::Root|bone_1|tripo::Tail_0|tripo::Tail_1|tripo::Tail_2|tripo::Tail_3|tripo::Spine_0|tripo::Spine_1|tripo::0_Left_Limb_0|bone_9|tripo::Head_0|tripo::Head_1|tripo::Head_2|tripo::Head_3|tripo::Head_4|tripo::Head_5|tripo::Head_6|tripo::0_Left_Limb_1|tripo::0_Left_Limb_2|tripo::0_Left_Limb_3|bone_20|bone_21|bone_22|tripo::1_Left_Limb_0|tripo::1_Left_Limb_1|tripo::1_Left_Limb_2|tripo::1_Right_Limb_0|tripo::1_Right_Limb_1|tripo::1_Right_Limb_2|tripo::0_Right_Limb_0|tripo::0_Right_Limb_1|tripo::0_Right_Limb_2|tripo::0_Right_Limb_3'.split('|');

describe('the bone resolver — humanoid retarget dialect', () => {
  const r = resolveBones(TREX_JOINTS);
  it('reads the T. rex spine, neck and head', () => {
    assert.equal(r.dialect, 'humanoid');
    assert.deepEqual(r.spine, ['Waist', 'Spine01', 'Spine02']);
    assert.deepEqual(r.neck, ['NeckTwist01', 'NeckTwist02']);
    assert.equal(r.head, 'Head');
    assert.equal(r.pelvis, 'Pelvis');
    assert.equal(r.jaw, null); // FacialBone is a face bone, never driven as a jaw
  });
  it('reads hind legs off the thigh chains and front limbs off the arm chains', () => {
    const hindL = r.legs.find((l) => l.pair === 'hind' && l.side === 'left');
    assert.deepEqual([hindL.thigh, hindL.calf, hindL.foot], ['L_Thigh', 'L_Calf', 'L_Foot']);
    const frontR = r.legs.find((l) => l.pair === 'front' && l.side === 'right');
    assert.deepEqual([frontR.thigh, frontR.calf, frontR.foot], ['R_Upperarm', 'R_Forearm', 'R_Hand']);
    assert.equal(r.legs.length, 4);
    assert.equal(r.wings.length, 2);
  });
  it('finds NO tail — these rigs skin the tail to the pelvis', () => {
    assert.deepEqual(r.tail, []);
  });
});

describe('the bone resolver — Tripo-native dialect', () => {
  it('reads the Triceratops spine chain, head chain and both limb pairs', () => {
    const r = resolveBones(TRICERATOPS_JOINTS);
    assert.equal(r.dialect, 'tripo');
    assert.deepEqual(r.spine, ['tripo::Spine_0', 'tripo::Spine_1', 'tripo::Spine_2']);
    assert.equal(r.head, 'tripo::Head_3');
    assert.deepEqual(r.neck, ['tripo::Head_0', 'tripo::Head_1', 'tripo::Head_2']);
    assert.deepEqual(r.tail, []); // the trike rig folds its tail away too
    const frontL = r.legs.find((l) => l.pair === 'front' && l.side === 'left');
    assert.deepEqual(
      [frontL.thigh, frontL.calf, frontL.foot],
      ['tripo::0_Left_Limb_0', 'tripo::0_Left_Limb_1', 'tripo::0_Left_Limb_2']
    );
    const hindR = r.legs.find((l) => l.pair === 'hind' && l.side === 'right');
    assert.equal(hindR.thigh, 'tripo::1_Right_Limb_0');
    assert.equal(r.legs.length, 4);
  });
  it('reads the Brachiosaurus tail chain and long neck', () => {
    const r = resolveBones(BRACHIOSAURUS_JOINTS);
    assert.equal(r.dialect, 'tripo');
    assert.deepEqual(r.tail, ['tripo::Tail_0', 'tripo::Tail_1', 'tripo::Tail_2', 'tripo::Tail_3']);
    assert.equal(r.head, 'tripo::Head_6');
    assert.equal(r.neck.length, 6);
    assert.equal(r.legs.length, 4);
  });
  it('survives three-sanitized names (GLTFLoader strips the colons)', () => {
    const sanitized = TRICERATOPS_JOINTS.map((n) => n.replace(/:/g, ''));
    const r = resolveBones(sanitized);
    assert.equal(r.dialect, 'tripo');
    assert.equal(r.head, 'tripoHead_3');
    assert.equal(r.legs.length, 4);
    assert.equal(normalizeJointName('tripo::Spine_0'), 'Spine_0');
    assert.equal(normalizeJointName('tripoSpine_0'), 'Spine_0');
    assert.equal(normalizeJointName('L_Thigh'), 'L_Thigh');
  });
  it('unknown rigs resolve empty, never throw', () => {
    const r = resolveBones(['SomeBone', 'Another']);
    assert.equal(r.dialect, 'unknown');
    assert.equal(r.head, null);
    assert.deepEqual(r.legs, []);
    assert.deepEqual(resolveBones([]).spine, []);
    assert.deepEqual(resolveBones(null).tail, []);
  });
});

describe('the chamber wiring', () => {
  it('the Earth 2 page mounts the Bay and keeps its owner gate', () => {
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes("import('@/components/earth2/DinosaurBay')"), 'page lazy-loads the Bay');
    assert.ok(page.includes('<DinosaurBay />'), 'page renders the Bay');
    assert.ok(page.includes('isOwnerEmail'), 'owner gate intact');
    assert.ok(page.includes('This page could not be found.'), 'plain 404 intact');
    assert.ok(!page.includes('This bay fills when the real assets land'), 'the empty state is gone');
  });
  it('the Bay is driven by the manifest and the resolver', () => {
    const bay = read('components/earth2/DinosaurBay.jsx');
    assert.ok(bay.includes('EARTH2_MODELS'), 'roster comes from the manifest');
    assert.ok(bay.includes('earth2PlacedModels'), 'scene loads from the manifest');
    assert.ok(bay.includes('resolveBones'), 'life is driven off the resolver');
    assert.ok(bay.includes('setMeshoptDecoder'), 'loader matches the optimized files');
  });
  it('the manifest and resolver stay three-free (pure data + names)', () => {
    assert.ok(!read('lib/earth2/models.js').includes("from 'three'"));
    assert.ok(!read('lib/earth2/bones.js').includes("from 'three'"));
  });
});
