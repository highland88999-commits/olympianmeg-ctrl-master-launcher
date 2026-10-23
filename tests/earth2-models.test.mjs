// tests/earth2-models.test.mjs
// Earth 2 — Dinosaur Bay (Merlin, 2026-10-22):
// - the models manifest: 58 placed foundry models + only
//   Pachycephalosaurus honestly pending (never uploaded —
//   file null, no stand-in)
// - every placed file exists under public/models/earth2, parses as a
//   GLB, stayed game-weight (<= 5 MB), and kept its rig (skins >= 1
//   for creatures) through the optimization pass — the five
//   Transylvania arrivals, the nine aquatic-round arrivals and the
//   eight aerial-round arrivals pin their exact joint counts
// - the bone-role resolver against the real rig dialects, using the
//   actual joint lists measured off the Studio files (humanoid
//   retarget, Tripo-native, Mixamo, and the measured unnamed-rig
//   resolvers for the mosquito and the bat), plus the swim
//   resolver against the sea cast's measured joint trees and the
//   flyer wing resolver against each dialect family
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
import { resolveBones, normalizeJointName, resolveMosquitoRig, resolveBatWings, resolveSwimRig, resolveFlyerWings } from '../lib/earth2/bones.js';
import { LAKE, SWIMMERS, FLYERS, lakeBedDepthAt, lakeBedYAt, surfacePhase } from '../lib/earth2/creatures.js';

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
  it('holds 60 entries: 58 placed files, the compy swarm riding its source model, 1 awaiting upload', () => {
    assert.equal(EARTH2_MODELS.length, 60);
    assert.equal(earth2PlacedModels().length, 58);
    const pending = earth2PendingModels();
    assert.equal(pending.length, 1);
    assert.deepEqual(
      pending.map((m) => m.slug).sort(),
      [
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
    assert.equal(new Set(EARTH2_MODELS.map((m) => m.slug)).size, 60);
    const by = (k) => EARTH2_MODELS.filter((m) => m.kind === k).length;
    assert.equal(by('dinosaur'), 18);
    assert.equal(by('flyer'), 10);
    assert.equal(by('marine'), 8);
    assert.equal(by('plant'), 10);
    assert.equal(by('landform'), 9);
    assert.equal(by('insect'), 1);
    assert.equal(by('character'), 2);
    assert.equal(by('swarm'), 1);
    assert.equal(by('structure'), 1);
  });

  it('the museum mount has landed — the building and the founder, world-only (Phase 2, 2026-10-23)', () => {
    const bySlug = Object.fromEntries(EARTH2_MODELS.map((m) => [m.slug, m]));
    // The fossil economy's counter: the museum building (a
    // structure, not Bay scenery) and John Hammond (a character
    // like the Count) — placed, filed, and flagged worldOnly so
    // the Dinosaur Bay diorama never picks them up.
    assert.equal(bySlug['museum'].kind, 'structure');
    assert.equal(bySlug['museum'].name, 'Royal Tyrrell Museum');
    assert.equal(bySlug['hammond'].kind, 'character');
    assert.equal(bySlug['hammond'].name, 'John Hammond');
    for (const slug of ['museum', 'hammond']) {
      assert.equal(bySlug[slug].status, 'placed', slug);
      assert.equal(bySlug[slug].file, `/models/earth2/${slug}.glb`, slug);
      assert.equal(bySlug[slug].worldOnly, true, `${slug} belongs to the walkable planet, not the Bay`);
    }
    // The building's frontage sits convincingly on its 28 m
    // parcel; the founder stands at a natural 1.8 m.
    assert.equal(bySlug['museum'].scaleM, 25);
    assert.equal(bySlug['museum'].scaleBasis, 'length');
    assert.equal(bySlug['hammond'].scaleM, 1.8);
    assert.equal(bySlug['hammond'].scaleBasis, 'height');
    // Nobody else is worldOnly — the flag is the museum's alone.
    assert.deepEqual(
      EARTH2_MODELS.filter((m) => m.worldOnly).map((m) => m.slug).sort(),
      ['hammond', 'museum'],
    );
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
      if (m.kind === 'marine') {
        assert.ok(['carnivore', 'herbivore', 'omnivore'].includes(m.diet), m.slug);
        assert.ok(['herd', 'solo', 'pack', 'flock'].includes(m.social), m.slug);
        assert.equal(m.posture, 'swimmer', m.slug);
        // Water-zone placement data: the sea cast lives in the lake.
        assert.equal(m.habitat, 'water', m.slug);
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
      if (m.kind === 'dinosaur' || m.kind === 'flyer' || m.kind === 'marine') {
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

describe('the museum arrivals kept their shape through the weight pass', () => {
  // The founder rides the 65-joint Mixamo template (measured off
  // the Studio export, like Dracula's pin above); the museum is a
  // generate-only structure — no skeleton, by design.
  it('hammond.glb carries exactly 65 joints; museum.glb has no skin', () => {
    const h = parseGlb(readFileSync(join(repo, 'public', 'models', 'earth2', 'hammond.glb')));
    assert.equal((h.skins || []).length, 1, 'hammond has one skin');
    assert.equal(h.skins[0].joints.length, 65, 'hammond joint count');
    const m = parseGlb(readFileSync(join(repo, 'public', 'models', 'earth2', 'museum.glb')));
    assert.equal((m.skins || []).length, 0, 'the museum has no skin');
  });
});

describe('the aquatic-round arrivals kept their skeletons through the weight pass', () => {
  // Same law as the Transylvania pins: joint counts measured off
  // the raw Studio exports must survive EXACTLY. The four big
  // bodies ride the 78-joint humanoid-retarget template; the
  // Tripo-native spine chains keep their measured counts
  // (plesiosaurus 29, liopleurodon 23, tylosaurus 14, megalodon
  // 14) — their swim motion is spine undulation, so a dropped
  // spine joint is a dropped wave segment.
  const EXPECTED_JOINTS = {
    'mosasaurus': 78,
    'kronosaurus': 78,
    'elasmosaurus': 78,
    'ichthyosaurus': 78,
    'indominus-rex': 78,
    'plesiosaurus': 29,
    'liopleurodon': 23,
    'tylosaurus': 14,
    'megalodon': 14,
  };
  for (const [slug, joints] of Object.entries(EXPECTED_JOINTS)) {
    it(`${slug}.glb carries exactly ${joints} joints`, () => {
      const buf = readFileSync(join(repo, 'public', 'models', 'earth2', `${slug}.glb`));
      const json = parseGlb(buf);
      const skins = json.skins || [];
      assert.equal(skins.length, 1, `${slug} has one skin`);
      assert.equal(skins[0].joints.length, joints, `${slug} joint count`);
    });
  }
});

describe('the aerial-round arrivals kept their skeletons through the weight pass', () => {
  // Same law as the earlier rounds: joint counts measured off the
  // raw Studio exports must survive EXACTLY — a lost joint is a
  // lost wing segment. Six ride the 78-joint humanoid-retarget
  // template (arm chains skin the wings); the three Tripo-native
  // flyers keep their measured counts (quetzalcoatlus 12,
  // tapejara 42, pterodactylus 38) — their wings are unnamed
  // bone_N fans the flyer resolver reads from its table.
  const EXPECTED_JOINTS = {
    'hatzegopteryx': 78,
    'rhamphorhynchus': 78,
    'nyctosaurus': 78,
    'dimorphodon': 78,
    'archaeopteryx': 78,
    'quetzalcoatlus': 12,
    'tapejara': 42,
    'pterodactylus': 38,
  };
  for (const [slug, joints] of Object.entries(EXPECTED_JOINTS)) {
    it(`${slug}.glb carries exactly ${joints} joints`, () => {
      const buf = readFileSync(join(repo, 'public', 'models', 'earth2', `${slug}.glb`));
      const json = parseGlb(buf);
      const skins = json.skins || [];
      assert.equal(skins.length, 1, `${slug} has one skin`);
      assert.equal(skins[0].joints.length, joints, `${slug} joint count`);
    });
  }
});

// The three Tripo-native flyers' joint lists, measured off the
// raw Studio files 2026-10-22 (skin order). Their wings live in
// unnamed bone_N chains — these lists pin the measured table in
// resolveFlyerWings (bones.js): quetzalcoatlus's only side chains
// off bone_1, tapejara's two Spine_2 fans, pterodactylus's two
// bone_8 forks, with sides read off the skin-weight centroids
// (head end + up define the animal's left and right).
const QUETZALCOATLUS_JOINTS = 'tripo::Root|bone_1|tripo::Spine_0|tripo::Spine_1|tripo::Head_0|bone_5|bone_6|bone_7|bone_8|tripo::0_Left_Limb_0|tripo::0_Left_Limb_1|tripo::0_Left_Limb_2'.split('|');
const TAPEJARA_JOINTS = 'tripo::Root|tripo::Spine_0|tripo::Spine_1|tripo::Spine_2|tripo::Spine_3|tripo::Spine_4|tripo::Head_0|bone_7|bone_8|bone_9|bone_10|bone_11|bone_12|bone_13|bone_14|bone_15|bone_16|bone_17|bone_18|bone_19|bone_20|bone_21|bone_22|bone_23|bone_24|bone_25|bone_26|bone_27|bone_28|bone_29|tripo::0_Left_Limb_0|tripo::0_Left_Limb_1|tripo::0_Left_Limb_2|tripo::0_Left_Limb_3|tripo::0_Right_Limb_0|tripo::0_Right_Limb_1|tripo::0_Right_Limb_2|tripo::0_Right_Limb_3|tripo::Tail_0|bone_39|bone_40|tripo::Tail_1'.split('|');
const PTERODACTYLUS_JOINTS = 'tripo::Root|bone_1|bone_2|tripo::Tail_0|tripo::Tail_1|tripo::Spine_0|bone_6|bone_7|bone_8|bone_9|tripo::Head_0|tripo::Head_1|bone_12|bone_13|bone_14|bone_15|bone_16|bone_17|bone_18|bone_19|bone_20|bone_21|bone_22|bone_23|bone_24|tripo::0_Left_Limb_0|tripo::0_Left_Limb_1|tripo::0_Left_Limb_2|tripo::0_Left_Limb_3|bone_29|tripo::0_Right_Limb_0|tripo::0_Right_Limb_1|tripo::0_Right_Limb_2|tripo::0_Right_Limb_3|tripo::Spine_1|bone_35|bone_36|bone_37'.split('|');

describe('the aerial wing — manifest, flight profiles and the castle law', () => {
  const bySlug = Object.fromEntries(EARTH2_MODELS.map((m) => [m.slug, m]));
  const SKY = ['quetzalcoatlus', 'hatzegopteryx', 'tapejara', 'nyctosaurus', 'pterodactylus', 'dimorphodon', 'rhamphorhynchus', 'archaeopteryx'];
  const CASTLE = [-24, -100]; // LANDFORM_SPOTS in the Bay

  it('all eight new flyers are placed flyer entries at their natural wingspans', () => {
    for (const slug of SKY) {
      assert.equal(bySlug[slug].kind, 'flyer', slug);
      assert.equal(bySlug[slug].status, 'placed', slug);
      assert.equal(bySlug[slug].file, `/models/earth2/${slug}.glb`, slug);
      assert.equal(bySlug[slug].scaleBasis, 'length', `${slug} spans on the flyer convention`);
      assert.ok(FLYERS[slug], `${slug} carries a flight profile`);
    }
    assert.equal(bySlug['quetzalcoatlus'].scaleM, 10.5);
    assert.equal(bySlug['hatzegopteryx'].scaleM, 10);
    assert.equal(bySlug['tapejara'].scaleM, 5);
    assert.equal(bySlug['nyctosaurus'].scaleM, 2.8);
    assert.equal(bySlug['pterodactylus'].scaleM, 1.5);
    assert.equal(bySlug['dimorphodon'].scaleM, 1.5);
    assert.equal(bySlug['rhamphorhynchus'].scaleM, 1.8);
    assert.equal(bySlug['archaeopteryx'].scaleM, 0.6);
  });

  it('the Pteranodon keeps its round-1 circuit verbatim as its profile', () => {
    const p = FLYERS['pteranodon'];
    assert.deepEqual(
      { cx: p.cx, cz: p.cz, r: p.r, h: p.h, speed: p.speed },
      { cx: 0, cz: -8, r: 58, h: 30, speed: 0.055 },
    );
  });

  it('every flight profile is flyable: real circuit, real wingbeat, a glide share', () => {
    for (const slug of [...SKY, 'pteranodon']) {
      const P = FLYERS[slug];
      assert.ok(P.r > 0 && P.h > 0 && P.speed > 0, slug);
      assert.ok(P.flapHz > 0 && P.flapAmp > 0, slug);
      assert.ok(P.glideDuty > 0 && P.glideDuty < 1, `${slug} glide share is a fraction`);
      assert.ok(P.cycle > 0 && P.bob > 0, slug);
      assert.ok(P.dir === 1 || P.dir === -1, slug);
    }
  });

  it('no circuit passes through Castle Transylvania — clear of its walls or above its towers', () => {
    // The castle stands 40 m tall on a ~39 m footprint
    // (half-diagonal ≈ 27 m): a circuit is lawful when its
    // closest approach to the castle's centre stays beyond the
    // walls, or when it cruises above 45 m across the south.
    for (const slug of [...SKY, 'pteranodon']) {
      const P = FLYERS[slug];
      const closest = Math.hypot(P.cx - CASTLE[0], P.cz - CASTLE[1]) - P.r;
      assert.ok(closest > 28 || P.h > 45, `${slug} clears the castle (closest ${closest.toFixed(1)} m at ${P.h} m)`);
    }
  });

  it('the giants ride high and slow; the skimmers own the lake surface', () => {
    assert.ok(FLYERS['quetzalcoatlus'].h >= 45, 'quetzalcoatlus rides highest');
    assert.ok(FLYERS['hatzegopteryx'].h >= 40, 'hatzegopteryx rides high');
    assert.ok(FLYERS['archaeopteryx'].flapHz > FLYERS['hatzegopteryx'].flapHz, 'the little wings beat faster');
    for (const slug of ['dimorphodon', 'rhamphorhynchus']) {
      const P = FLYERS[slug];
      assert.deepEqual([P.cx, P.cz], LAKE.center, `${slug} circles the lake itself`);
      assert.ok(P.h <= 8, `${slug} skims — never climbs`);
      assert.ok(P.r < LAKE.radius, `${slug} stays over the water`);
    }
  });

  it('the Bay wires the aerial wing: profiles in, wings resolved, glide shared', () => {
    const bay = read('components/earth2/DinosaurBay.jsx');
    assert.ok(bay.includes('FLYERS'), 'flight profiles drive the circuits');
    assert.ok(bay.includes('resolveFlyerWings'), 'wings resolve off the measured tables');
    assert.ok(bay.includes('glideDuty'), 'the flap/glide envelope is per-species');
    assert.ok(bay.includes('wings over the lake'), 'the intro names the filled sky');
  });
});

describe('the flyer wing resolver — one pin per dialect family', () => {
  it('humanoid retarget: the arm chains are the wings (the Pteranodon template)', () => {
    const wings = resolveFlyerWings(TREX_JOINTS);
    assert.equal(wings.length, 2);
    assert.deepEqual(wings.find((w) => w.side === 'left').chain, ['L_Upperarm', 'L_Forearm', 'L_Hand']);
    assert.deepEqual(wings.find((w) => w.side === 'right').chain, ['R_Upperarm', 'R_Forearm', 'R_Hand']);
  });

  it('quetzalcoatlus (12j sparse Tripo): the two bone_1 side chains, folded wings', () => {
    const wings = resolveFlyerWings(QUETZALCOATLUS_JOINTS);
    assert.deepEqual(wings, [
      { side: 'left', chain: ['bone_7', 'bone_8'] },
      { side: 'right', chain: ['bone_5', 'bone_6'] },
    ]);
  });

  it('tapejara (42j): the two Spine_2 spar fans — the bone_23 rear fan stays undriven', () => {
    const wings = resolveFlyerWings(TAPEJARA_JOINTS);
    assert.deepEqual(wings, [
      { side: 'left', chain: ['bone_7', 'bone_8', 'bone_9', 'bone_10', 'bone_11', 'bone_12'] },
      { side: 'right', chain: ['bone_15', 'bone_16', 'bone_17', 'bone_18', 'bone_19', 'bone_20'] },
    ]);
    assert.ok(!wings.flatMap((w) => w.chain).includes('bone_23'), 'the trailing-edge fan is not a spar');
  });

  it('pterodactylus (38j): the two bone_8 forks — the lone claw fingers stay undriven', () => {
    const wings = resolveFlyerWings(PTERODACTYLUS_JOINTS);
    assert.deepEqual(wings, [
      { side: 'left', chain: ['bone_12', 'bone_13', 'bone_14', 'bone_15', 'bone_16'] },
      { side: 'right', chain: ['bone_18', 'bone_19', 'bone_20', 'bone_21', 'bone_22'] },
    ]);
    const driven = wings.flatMap((w) => w.chain);
    assert.ok(!driven.includes('bone_17') && !driven.includes('bone_23'), 'claw fingers are not wings');
  });

  it('survives three-sanitized names (GLTFLoader strips the colons)', () => {
    const san = TAPEJARA_JOINTS.map((n) => n.replace(/:/g, ''));
    const wings = resolveFlyerWings(san);
    assert.equal(wings.length, 2);
    assert.equal(wings[0].chain[0], 'bone_7');
    const sanQ = QUETZALCOATLUS_JOINTS.map((n) => n.replace(/:/g, ''));
    assert.equal(resolveFlyerWings(sanQ).length, 2);
  });

  it('non-flyers and empty input resolve empty, never throw', () => {
    assert.deepEqual(resolveFlyerWings(TRICERATOPS_JOINTS), []);
    // The mosquito has bone_5…bone_8 AND bone_9 (and 79 joints):
    // the quetzalcoatlus table must refuse it twice over.
    assert.deepEqual(resolveFlyerWings(MOSQUITO_JOINTS), []);
    assert.deepEqual(resolveFlyerWings(BAT_JOINTS), []);
    assert.deepEqual(resolveFlyerWings([]), []);
    assert.deepEqual(resolveFlyerWings(null), []);
  });
});

// The sea cast's joint trees, measured off the raw Studio files
// 2026-10-22 (names in skin order, parents aligned by index —
// a non-joint parent is the armature). These pin the TREE walk
// in resolveSwimRig: names alone cannot find a plesiosaur's
// flippers (its front pair is named Spine_3/Spine_4).
const TYLOSAURUS_JOINTS = 'tripo::Root|tripo::Spine_0|tripo::Spine_1|tripo::Spine_2|tripo::Tail_0|tripo::Tail_1|bone_6|tripo::Head_0|bone_8|bone_9|bone_10|bone_11|bone_12|bone_13'.split('|');
const TYLOSAURUS_PARENTS = 'Armature|tripo::Root|tripo::Spine_0|tripo::Spine_1|tripo::Spine_2|tripo::Tail_0|tripo::Root|bone_6|tripo::Root|bone_8|bone_9|tripo::Root|bone_11|bone_12'.split('|');
const MEGALODON_JOINTS = 'tripo::Root|tripo::Spine_0|tripo::Spine_1|bone_3|bone_4|tripo::Tail_0|tripo::Tail_1|bone_7|tripo::Head_0|bone_9|bone_10|bone_11|bone_12|bone_13'.split('|');
const MEGALODON_PARENTS = 'Armature|tripo::Root|tripo::Spine_0|tripo::Spine_1|bone_3|bone_3|tripo::Tail_0|tripo::Root|tripo::Root|tripo::Head_0|bone_9|tripo::Head_0|bone_11|tripo::Root'.split('|');
const PLESIOSAURUS_JOINTS = 'tripo::Root|tripo::Spine_0|tripo::Spine_1|tripo::Spine_2|tripo::Head_0|tripo::Head_1|bone_6|bone_7|bone_8|bone_9|tripo::Spine_3|tripo::Spine_4|bone_12|bone_13|bone_14|bone_15|tripo::Tail_0|tripo::Tail_1|tripo::Tail_2|tripo::Tail_3|bone_20|tripo::0_Right_Limb_0|tripo::0_Right_Limb_1|tripo::0_Right_Limb_2|bone_24|tripo::0_Left_Limb_0|tripo::0_Left_Limb_1|bone_27|tripo::0_Left_Limb_2'.split('|');
const PLESIOSAURUS_PARENTS = 'Armature|tripo::Root|tripo::Spine_0|tripo::Spine_1|tripo::Spine_2|tripo::Head_0|tripo::Spine_2|bone_6|bone_7|bone_8|tripo::Spine_2|tripo::Spine_3|tripo::Spine_4|bone_12|tripo::Root|bone_14|bone_15|tripo::Tail_0|tripo::Tail_1|tripo::Tail_2|tripo::Root|bone_20|tripo::0_Right_Limb_0|tripo::0_Right_Limb_1|tripo::Root|bone_24|tripo::0_Left_Limb_0|tripo::0_Left_Limb_1|tripo::0_Left_Limb_1'.split('|');
const LIOPLEURODON_JOINTS = 'tripo::Root|bone_1|bone_2|tripo::Tail_0|tripo::Tail_1|tripo::Tail_2|tripo::Tail_3|tripo::Spine_0|tripo::Spine_1|tripo::Head_0|bone_10|bone_11|bone_12|bone_13|bone_14|bone_15|tripo::Head_1|bone_17|bone_18|bone_19|bone_20|bone_21|bone_22'.split('|');
const LIOPLEURODON_PARENTS = 'Armature|tripo::Root|bone_1|bone_2|tripo::Tail_0|tripo::Tail_1|tripo::Tail_2|tripo::Root|tripo::Spine_0|tripo::Spine_1|tripo::Head_0|bone_10|bone_11|tripo::Head_0|bone_13|bone_14|tripo::Head_0|tripo::Spine_0|bone_17|bone_18|tripo::Spine_0|bone_20|bone_21'.split('|');

describe('the aquatic wing — manifest, lake and swim profiles', () => {
  const bySlug = Object.fromEntries(EARTH2_MODELS.map((m) => [m.slug, m]));
  const SEA = ['mosasaurus', 'kronosaurus', 'elasmosaurus', 'ichthyosaurus', 'plesiosaurus', 'liopleurodon', 'tylosaurus', 'megalodon'];

  it('all eight swimmers are placed marine entries at their natural scales', () => {
    for (const slug of SEA) {
      assert.equal(bySlug[slug].kind, 'marine', slug);
      assert.equal(bySlug[slug].status, 'placed', slug);
      assert.equal(bySlug[slug].file, `/models/earth2/${slug}.glb`, slug);
      assert.ok(SWIMMERS[slug], `${slug} carries a swim profile`);
    }
    assert.equal(bySlug['mosasaurus'].scaleM, 15);
    assert.equal(bySlug['megalodon'].scaleM, 15);
    assert.equal(bySlug['tylosaurus'].scaleM, 14);
    assert.equal(bySlug['elasmosaurus'].scaleM, 14);
    assert.equal(bySlug['kronosaurus'].scaleM, 10);
    assert.equal(bySlug['plesiosaurus'].scaleM, 7);
    assert.equal(bySlug['liopleurodon'].scaleM, 6.5);
    assert.equal(bySlug['ichthyosaurus'].scaleM, 5);
  });

  it('Indominus Rex is placed — the second apex, at a natural 16 m', () => {
    assert.equal(bySlug['indominus-rex'].status, 'placed');
    assert.equal(bySlug['indominus-rex'].file, '/models/earth2/indominus-rex.glb');
    assert.equal(bySlug['indominus-rex'].scaleM, 16);
  });

  it('every swim profile keeps its circuit inside the lake and its body off the bed', () => {
    for (const slug of SEA) {
      const P = SWIMMERS[slug];
      const reach = Math.max(P.rx, P.rz);
      assert.ok(reach < LAKE.radius, `${slug} circuit inside the lake`);
      assert.ok(P.shallow > P.deep, `${slug} surfaces above its cruise`);
      assert.ok(P.shallow < LAKE.waterY + 0.3, `${slug} never beaches`);
      assert.ok(P.deep > -LAKE.depth, `${slug} cruises above the deepest bed`);
      assert.ok(P.duty > 0 && P.duty < 1, `${slug} duty is a fraction`);
      assert.ok(P.period > 0 && P.speed > 0, slug);
    }
  });

  it('the lake bed is a dish: full depth at the centre, grade at the rim', () => {
    const [cx, cz] = LAKE.center;
    assert.equal(lakeBedDepthAt(cx, cz), LAKE.depth);
    assert.equal(lakeBedYAt(cx, cz), -LAKE.depth);
    assert.equal(lakeBedDepthAt(cx + LAKE.radius, cz), 0);
    assert.equal(lakeBedDepthAt(cx + LAKE.radius + 10, cz), 0);
    // Monotonic from rim to centre.
    let prev = -1;
    for (let d = LAKE.radius; d >= 0; d -= 2) {
      const v = lakeBedDepthAt(cx + d, cz);
      assert.ok(v >= prev, `depth eases in at ${d}`);
      prev = v;
    }
    // The lake sits inside the flat grounds, clear of the castle
    // rim and the tar pit.
    assert.ok(Math.hypot(cx, cz) + LAKE.radius < 66, 'lake inside the flat valley');
  });

  it('surfacePhase rises, holds and sinks inside the duty window only', () => {
    assert.equal(surfacePhase(0, 0.5), 0);
    assert.equal(surfacePhase(0.25, 0.5), 1); // mid-window: fully surfaced
    assert.equal(surfacePhase(0.5, 0.5), 0);  // window over
    assert.equal(surfacePhase(0.9, 0.5), 0);
    assert.ok(surfacePhase(0.05, 0.5) > 0 && surfacePhase(0.05, 0.5) < 1, 'easing up');
    assert.equal(surfacePhase(-0.75, 0.5), 1); // phases wrap
  });

  it('the Bay wires the swimmers, the lake and the second apex', () => {
    const bay = read('components/earth2/DinosaurBay.jsx');
    assert.ok(bay.includes('placeSwimmer'), 'swimmers are placed');
    assert.ok(bay.includes('updateSwimmer'), 'swimmers are driven');
    assert.ok(bay.includes('resolveSwimRig'), 'swim rigs resolve off the real skeletons');
    assert.ok(bay.includes('lakeBedDepthAt'), 'the ground is carved with the lake dish');
    assert.ok(bay.includes('lakeBedYAt'), 'swimmers clamp against the same bed');
    assert.ok(bay.includes('0x2f9fd8'), 'the water is clear bright blue, never murky');
    assert.ok(bay.includes("'indominus-rex': { walk:"), 'Indominus prowls on a stalker circuit');
    const spot = bay.match(/'indominus-rex': \{ walk: \{ cx: (-?[\d.]+), cz: (-?[\d.]+)/);
    assert.ok(spot, 'Indominus circuit parses');
    // Opposite territory from the tar pit (12, 13): the circuit
    // centre is west of the lake and never dips into it.
    const icx = Number(spot[1]), icz = Number(spot[2]);
    assert.ok(icx < LAKE.center[0], 'west of the lake');
    assert.ok(Math.hypot(icx - LAKE.center[0], icz - LAKE.center[1]) > LAKE.radius + 8, 'clear of the water');
  });
});

describe('the swim resolver — measured trees', () => {
  it('tylosaurus (14j): axis runs Head_0 → Root → tail; both flipper fans sit on the root', () => {
    const r = resolveSwimRig(TYLOSAURUS_JOINTS, TYLOSAURUS_PARENTS);
    assert.equal(r.dialect, 'tripo');
    assert.deepEqual(r.axial, ['tripo::Head_0', 'bone_6', 'tripo::Root', 'tripo::Spine_0', 'tripo::Spine_1', 'tripo::Spine_2', 'tripo::Tail_0', 'tripo::Tail_1']);
    assert.equal(r.flippers.length, 2);
    assert.deepEqual(r.flippers[0].chain, ['bone_8', 'bone_9', 'bone_10']);
    assert.deepEqual(r.flippers[1].chain, ['bone_11', 'bone_12', 'bone_13']);
    assert.deepEqual(r.extras, []);
  });

  it('megalodon (14j): pectoral chains off the head joint paddle; fin singles sway as extras', () => {
    const r = resolveSwimRig(MEGALODON_JOINTS, MEGALODON_PARENTS);
    assert.deepEqual(r.axial, ['tripo::Head_0', 'tripo::Root', 'tripo::Spine_0', 'tripo::Spine_1', 'bone_3', 'tripo::Tail_0', 'tripo::Tail_1']);
    assert.equal(r.flippers.length, 2);
    assert.deepEqual(r.flippers[0].chain, ['bone_9', 'bone_10']);
    assert.deepEqual(r.flippers[1].chain, ['bone_11', 'bone_12']);
    // bone_7 (a lone fin bone), bone_13 (the snout mass) and
    // bone_4 (rear extra) must never paddle.
    const flat = r.extras.flat();
    assert.deepEqual(flat.sort(), ['bone_13', 'bone_4', 'bone_7']);
  });

  it('plesiosaurus (29j): the tree finds all four flippers — including the pair NAMED Spine_3/Spine_4', () => {
    const r = resolveSwimRig(PLESIOSAURUS_JOINTS, PLESIOSAURUS_PARENTS);
    assert.deepEqual(r.axial, ['tripo::Head_1', 'tripo::Head_0', 'tripo::Spine_2', 'tripo::Spine_1', 'tripo::Spine_0', 'tripo::Root', 'bone_14', 'bone_15', 'tripo::Tail_0', 'tripo::Tail_1', 'tripo::Tail_2', 'tripo::Tail_3']);
    assert.equal(r.flippers.length, 4);
    const chains = r.flippers.map((f) => f.chain.join(','));
    assert.ok(chains.includes('bone_6,bone_7,bone_8,bone_9'), 'front-right flipper');
    assert.ok(chains.includes('tripo::Spine_3,tripo::Spine_4,bone_12,bone_13'), 'front-left flipper hides in Spine names');
    assert.ok(chains.some((c) => c.startsWith('bone_20,tripo::0_Right_Limb_0')), 'hind-right flipper');
    assert.ok(chains.some((c) => c.startsWith('bone_24,tripo::0_Left_Limb_0')), 'hind-left flipper');
    assert.deepEqual(r.extras, [['tripo::0_Left_Limb_2']]);
  });

  it('liopleurodon (23j): head at the far end — axis and four flippers still resolve', () => {
    const r = resolveSwimRig(LIOPLEURODON_JOINTS, LIOPLEURODON_PARENTS);
    assert.deepEqual(r.axial, ['tripo::Head_1', 'tripo::Head_0', 'tripo::Spine_1', 'tripo::Spine_0', 'tripo::Root', 'bone_1', 'bone_2', 'tripo::Tail_0', 'tripo::Tail_1', 'tripo::Tail_2', 'tripo::Tail_3']);
    assert.equal(r.flippers.length, 4);
    const chains = r.flippers.map((f) => f.chain.join(','));
    assert.ok(chains.includes('bone_10,bone_11,bone_12'));
    assert.ok(chains.includes('bone_17,bone_18,bone_19'));
  });

  it('the 78-joint swimmers resolve from names alone (humanoid dialect)', () => {
    const r = resolveSwimRig(TREX_JOINTS, TREX_JOINTS.map(() => null));
    assert.equal(r.dialect, 'humanoid');
    assert.deepEqual(r.axial, ['Head', 'NeckTwist02', 'NeckTwist01', 'Spine02', 'Spine01', 'Waist', 'Pelvis']);
    assert.equal(r.flippers.length, 4);
    const front = r.flippers.filter((f) => f.pair === 'front');
    const hind = r.flippers.filter((f) => f.pair === 'hind');
    assert.deepEqual(front.find((f) => f.side === 'left').chain, ['L_Upperarm', 'L_Forearm', 'L_Hand']);
    assert.deepEqual(hind.find((f) => f.side === 'right').chain, ['R_Thigh', 'R_Calf', 'R_Foot']);
  });

  it('survives sanitized tripo names and empty input', () => {
    const san = TYLOSAURUS_JOINTS.map((n) => n.replace(/:/g, ''));
    const sanP = TYLOSAURUS_PARENTS.map((n) => n.replace(/:/g, ''));
    const r = resolveSwimRig(san, sanP);
    assert.equal(r.axial[0], 'tripoHead_0');
    assert.equal(r.axial.length, 8);
    assert.equal(r.flippers.length, 2);
    const empty = resolveSwimRig([], []);
    assert.deepEqual(empty.axial, []);
    assert.deepEqual(empty.flippers, []);
  });
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
