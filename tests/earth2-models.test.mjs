// tests/earth2-models.test.mjs
// Earth 2 — Dinosaur Bay (Merlin, 2026-10-22):
// - the models manifest: 39 placed foundry models + Indominus Rex
//   and Pachycephalosaurus honestly pending (never uploaded —
//   file null, no stand-in)
// - every placed file exists under public/models/earth2, parses as a
//   GLB, stayed game-weight (<= 5 MB), and kept its rig (skins >= 1
//   for creatures) through the optimization pass — the five
//   Transylvania arrivals pin their exact joint counts
// - the bone-role resolver against the real rig dialects, using the
//   actual joint lists measured off the Studio files (humanoid
//   retarget, Tripo-native, Mixamo, and the measured unnamed-rig
//   resolvers for the mosquito and the bat)
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
import { resolveBones, normalizeJointName, resolveMosquitoRig, resolveBatWings } from '../lib/earth2/bones.js';

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
  it('holds 42 entries: 39 placed files, the compy swarm riding its source model, 2 awaiting upload', () => {
    assert.equal(EARTH2_MODELS.length, 42);
    assert.equal(earth2PlacedModels().length, 39);
    const pending = earth2PendingModels();
    assert.equal(pending.length, 2);
    assert.deepEqual(
      pending.map((m) => m.slug).sort(),
      [
        'indominus-rex',
        'pachycephalosaurus',
      ],
    );
    for (const m of pending) {
      assert.equal(m.file, null, m.slug);
      assert.equal(m.status, 'awaiting-upload', m.slug);
    }
  });

  it('the Transylvania cast has landed — real files, real kinds (Merlin, 2026-10-22)', () => {
    const bySlug = Object.fromEntries(EARTH2_MODELS.map((m) => [m.slug, m]));
    // The exchange's host, his bat, his castle, his mosquitos, and
    // the landed apex hybrid — placed, with the files to prove it.
    assert.equal(bySlug['dracula'].kind, 'character');
    assert.equal(bySlug['vampire-bat'].kind, 'flyer');
    assert.equal(bySlug['giant-mosquito'].kind, 'insect');
    assert.equal(bySlug['castle-transylvania'].kind, 'landform');
    assert.equal(bySlug['indominus-rex'].kind, 'dinosaur');
    assert.equal(bySlug['spinosaurus-rex'].kind, 'dinosaur');
    for (const slug of ['dracula', 'vampire-bat', 'giant-mosquito', 'castle-transylvania', 'spinosaurus-rex']) {
      assert.equal(bySlug[slug].status, 'placed', slug);
      assert.equal(bySlug[slug].file, `/models/earth2/${slug}.glb`, slug);
    }
    // The Rex stands noticeably past its round-1 cousin.
    assert.ok(bySlug['spinosaurus-rex'].scaleM > bySlug['spinosaurus'].scaleM, 'rex outscales spinosaurus');
    // The compy swarm is a presence entry: placed, file-less, and
    // honest about riding the compsognathus model.
    const swarm = bySlug['compy-swarm'];
    assert.equal(swarm.kind, 'swarm');
    assert.equal(swarm.status, 'placed');
    assert.equal(swarm.file, null);
    assert.equal(swarm.sourceSlug, 'compsognathus');
    assert.equal(swarm.scaleM, 0.4);
  });

  it('slugs are unique and kind counts match the foundry roster', () => {
    assert.equal(new Set(EARTH2_MODELS.map((m) => m.slug)).size, 42);
    const by = (k) => EARTH2_MODELS.filter((m) => m.kind === k).length;
    assert.equal(by('dinosaur'), 18);
    assert.equal(by('flyer'), 2);
    assert.equal(by('plant'), 10);
    assert.equal(by('landform'), 9);
    assert.equal(by('insect'), 1);
    assert.equal(by('character'), 1);
    assert.equal(by('swarm'), 1);
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

describe('the Transylvania arrivals kept their skeletons through the weight pass', () => {
  // Joint counts measured off the raw Studio exports; the
  // optimized files in public/ must match them EXACTLY — a lost
  // joint is a lost motion in the Bay.
  const EXPECTED_JOINTS = {
    'dracula': 65,
    'vampire-bat': 32,
    'giant-mosquito': 79,
    'spinosaurus-rex': 78,
    'castle-transylvania': 0, // generate-only set piece — no skeleton, by design
  };
  for (const [slug, joints] of Object.entries(EXPECTED_JOINTS)) {
    it(`${slug}.glb carries exactly ${joints} joints`, () => {
      const buf = readFileSync(join(repo, 'public', 'models', 'earth2', `${slug}.glb`));
      const json = parseGlb(buf);
      const skins = json.skins || [];
      if (joints === 0) {
        assert.equal(skins.length, 0, 'the castle has no skin');
      } else {
        assert.equal(skins.length, 1, `${slug} has one skin`);
        assert.equal(skins[0].joints.length, joints, `${slug} joint count`);
      }
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

const DRACULA_JOINTS = 'mixamorig:Hips|mixamorig:LeftUpLeg|mixamorig:LeftLeg|mixamorig:LeftFoot|mixamorig:LeftToeBase|mixamorig:LeftToe_End|mixamorig:RightUpLeg|mixamorig:RightLeg|mixamorig:RightFoot|mixamorig:RightToeBase|mixamorig:RightToe_End|mixamorig:Spine|mixamorig:Spine1|mixamorig:Spine2|mixamorig:LeftShoulder|mixamorig:LeftArm|mixamorig:LeftForeArm|mixamorig:LeftHand|mixamorig:LeftHandIndex1|mixamorig:LeftHandIndex2|mixamorig:LeftHandIndex3|mixamorig:LeftHandIndex4|mixamorig:LeftHandMiddle1|mixamorig:LeftHandMiddle2|mixamorig:LeftHandMiddle3|mixamorig:LeftHandMiddle4|mixamorig:LeftHandPinky1|mixamorig:LeftHandPinky2|mixamorig:LeftHandPinky3|mixamorig:LeftHandPinky4|mixamorig:LeftHandRing1|mixamorig:LeftHandRing2|mixamorig:LeftHandRing3|mixamorig:LeftHandRing4|mixamorig:LeftHandThumb1|mixamorig:LeftHandThumb2|mixamorig:LeftHandThumb3|mixamorig:LeftHandThumb4|mixamorig:Neck|mixamorig:Head|mixamorig:HeadTop_End|mixamorig:RightShoulder|mixamorig:RightArm|mixamorig:RightForeArm|mixamorig:RightHand|mixamorig:RightHandIndex1|mixamorig:RightHandIndex2|mixamorig:RightHandIndex3|mixamorig:RightHandIndex4|mixamorig:RightHandMiddle1|mixamorig:RightHandMiddle2|mixamorig:RightHandMiddle3|mixamorig:RightHandMiddle4|mixamorig:RightHandPinky1|mixamorig:RightHandPinky2|mixamorig:RightHandPinky3|mixamorig:RightHandPinky4|mixamorig:RightHandRing1|mixamorig:RightHandRing2|mixamorig:RightHandRing3|mixamorig:RightHandRing4|mixamorig:RightHandThumb1|mixamorig:RightHandThumb2|mixamorig:RightHandThumb3|mixamorig:RightHandThumb4'.split('|');
// The mosquito: Root + bone_1 + Spine_0 + bone_3…bone_78 (no bone_2 exists).
const MOSQUITO_JOINTS = ['tripo::Root', 'bone_1', 'tripo::Spine_0',
  ...Array.from({ length: 76 }, (_, i) => `bone_${i + 3}`)];
// The bat: bone_6…bone_23 are the wing chains; bone_3/4/5 do not exist.
const BAT_JOINTS = ['tripo::Root', 'bone_1', 'bone_2', 'tripo::Spine_0', 'tripo::Spine_1', 'tripo::Spine_2',
  ...Array.from({ length: 18 }, (_, i) => `bone_${i + 6}`),
  'tripo::0_Left_Limb_0', 'tripo::0_Left_Limb_1', 'tripo::0_Left_Limb_2', 'tripo::0_Left_Limb_3',
  'tripo::0_Right_Limb_0', 'tripo::0_Right_Limb_1', 'tripo::0_Right_Limb_2', 'tripo::0_Right_Limb_3'];

describe('the bone resolver — Mixamo dialect (Dracula)', () => {
  it('the measured lists carry the counts the Studio exported', () => {
    assert.equal(DRACULA_JOINTS.length, 65);
    assert.equal(MOSQUITO_JOINTS.length, 79);
    assert.equal(BAT_JOINTS.length, 32);
  });
  it('reads the Count’s spine, neck, head, legs and arms', () => {
    const r = resolveBones(DRACULA_JOINTS);
    assert.equal(r.dialect, 'mixamo');
    assert.equal(r.pelvis, 'mixamorig:Hips');
    assert.deepEqual(r.spine, ['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2']);
    assert.deepEqual(r.neck, ['mixamorig:Neck']);
    assert.equal(r.head, 'mixamorig:Head');
    assert.equal(r.jaw, null);
    assert.deepEqual(r.tail, []);
    const hindL = r.legs.find((l) => l.pair === 'hind' && l.side === 'left');
    assert.deepEqual([hindL.thigh, hindL.calf, hindL.foot],
      ['mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot']);
    const frontR = r.legs.find((l) => l.pair === 'front' && l.side === 'right');
    assert.deepEqual([frontR.thigh, frontR.calf, frontR.foot],
      ['mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand']);
    assert.equal(r.legs.length, 4);
    assert.equal(r.wings.length, 2);
  });
  it('survives three-sanitized names (GLTFLoader strips the colons)', () => {
    const sanitized = DRACULA_JOINTS.map((n) => n.replace(/:/g, ''));
    const r = resolveBones(sanitized);
    assert.equal(r.dialect, 'mixamo');
    assert.equal(r.head, 'mixamorigHead');
    assert.equal(normalizeJointName('mixamorig:Hips'), 'Hips');
    assert.equal(normalizeJointName('mixamorigHips'), 'Hips');
  });
});

describe('the measured resolvers — the unnamed Transylvania rigs', () => {
  it('the mosquito’s abdomen is the rear chain off the thorax; its wings the rising pair', () => {
    const rig = resolveMosquitoRig(MOSQUITO_JOINTS);
    assert.deepEqual(rig.abdomen, ['bone_5', 'bone_6', 'bone_7', 'bone_8']);
    assert.deepEqual(
      rig.wingRoots.map((w) => [w.name, w.sign]),
      [['bone_26', 1], ['bone_32', -1]],
    );
  });
  it('the bat’s wings are the unnamed Spine_1 chains — its named limbs are legs', () => {
    const wings = resolveBatWings(BAT_JOINTS);
    assert.equal(wings.length, 2);
    assert.deepEqual(wings[0].chain, ['bone_6', 'bone_7', 'bone_8', 'bone_9']);
    assert.deepEqual(wings[1].chain, ['bone_15', 'bone_16', 'bone_17', 'bone_18']);
    assert.equal(wings[0].sign, -wings[1].sign, 'flap signs oppose');
    // …and the generic resolver agrees the named limb chains are
    // legs, with no head bone to measure a facing from.
    const r = resolveBones(BAT_JOINTS);
    assert.equal(r.dialect, 'tripo');
    assert.equal(r.head, null);
    assert.equal(r.legs.length, 2);
  });
  it('missing bones resolve empty, never throw', () => {
    assert.deepEqual(resolveMosquitoRig(['SomeBone']).abdomen, []);
    assert.deepEqual(resolveMosquitoRig(null).wingRoots, []);
    assert.deepEqual(resolveBatWings([]), []);
  });
});

describe('the chamber wiring', () => {
  it('the Earth 2 page mounts the Bay and keeps its owner gate', () => {
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes("import('@/components/earth2/DinosaurBay')"), 'page lazy-loads the Bay');
    assert.ok(page.includes('<DinosaurBay'), 'page renders the Bay');
    assert.ok(page.includes('bloodSacs={blood.sacs}'), 'page feeds the Bay the sac count');
    assert.ok(page.includes('onBloodSac={collectSacFromBay}'), 'page collects the Bay sacs');
    assert.ok(page.includes("id=\"draculas-exchange\""), "Dracula's Exchange panel is in the chamber");
    assert.ok(page.includes("DRACULA'S EXCHANGE") || page.includes('DRACULA&rsquo;S EXCHANGE'), 'the exchange names its host');
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
  it('the Bay runs the blood-sac loop: swarm, mosquitos, Dracula', () => {
    const bay = read('components/earth2/DinosaurBay.jsx');
    assert.ok(bay.includes('COMPY_SWARM'), 'compy swarm config wired');
    assert.ok(bay.includes('placeCompySwarm'), 'swarm placement wired');
    assert.ok(bay.includes('MOSQUITO_CONFIG'), 'mosquito config wired');
    assert.ok(bay.includes('mosquitoDropsSac'), 'the sac rule wired');
    assert.ok(bay.includes('stepDracula'), 'the transformation wired');
    assert.ok(bay.includes('Raycaster'), 'tap-to-shoot wired');
    assert.ok(bay.includes('Bring sacs to Dracula'), 'the exchange is reachable from the Bay');
  });
  it('the Transylvania cast is real in the Bay — no stand-ins remain for the five', () => {
    const bay = read('components/earth2/DinosaurBay.jsx');
    assert.ok(!bay.includes('PLACEHOLDER'), 'no placeholder labels remain');
    assert.ok(!bay.includes('StandIn'), 'no stand-in builders remain');
    assert.ok(bay.includes('resolveMosquitoRig'), 'the mosquito rides its measured rig');
    assert.ok(bay.includes('resolveBatWings'), 'the bats flap their measured wing chains');
    assert.ok(bay.includes('SkeletonUtils.clone'), 'bat and mosquito clones share their base loads');
    assert.ok(bay.includes("'spinosaurus-rex': { at: [10, 2]"), 'the Rex holds the tar pit edge');
  });
  it('the manifest and resolver stay three-free (pure data + names)', () => {
    assert.ok(!read('lib/earth2/models.js').includes("from 'three'"));
    assert.ok(!read('lib/earth2/bones.js').includes("from 'three'"));
    assert.ok(!read('lib/earth2/creatures.js').includes("from 'three'"));
    assert.ok(!read('lib/earth2/gifts.js').includes("from 'three'"));
    assert.ok(!read('lib/earth2/blood-sacs.js').includes("from 'three'"));
  });
});
