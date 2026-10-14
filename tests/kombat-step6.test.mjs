// tests/kombat-step6.test.mjs — headless tests for wiring plan
// Step 6: the real Tripo models fight in Kombat (GLB swap + code
// pose driver), plus the laws Merlin laid down from playtesting the
// Step 5 build (2026-10-14):
//   FLOOR LAW — the arena floor is a do-not-pass-through, for GLB
//     models and the procedural fallback alike.
//   DOWNED-STATE LAW — the on-the-back pose renders ONLY while a
//     fighter is actually downed (knockdown/KO), never at round
//     start, intro or idle.
//   SPECIALS LOGIC — every special is classified by what it IS and
//     executes/AI-picks by kind, range band and conditions.
//   FINISH HIM — renders exactly once (the dedicated overlay).
//   FRAMING — at phone aspects the fight plays in the clear band
//     above the pad row.
// Run: node tests/kombat-step6.test.mjs (from the repo root).

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { FIGHTERS, getFighter } from '../lib/kombat/roster.js';
import { LOADOUTS, getLoadout } from '../lib/kombat/loadouts.js';
import { RIG_MANIFEST, rigManifestFor } from '../lib/kombat/rig-manifest.js';
import {
  HUMANOID_BONE_MAP, HUMANOID_REQUIRED_ROLES, CREATURE_TABLES,
  rigKindFor, movementProfile, createPoseDriver, koLiftFor, FALL_ANGLE,
  sanitizeBoneName,
} from '../lib/kombat/pose-driver.js';
import {
  SPECIAL_KINDS, classifySpecial, classifyKit, specialUsable, inBand,
  chooseSpecial, healAmountFor, statusDamageMul, statusSpeedMul,
} from '../lib/kombat/specials.js';
import { resolvePose, isDownedPose } from '../lib/kombat/pose-state.js';
import { clampToFloor, applyFloorClamp, solveFloorY, stepVertical, FLOOR_Y } from '../lib/kombat/floor.js';
import { duelFraming, brawlFraming, fighterInClearBand, PAD_BAND_FRAC } from '../lib/kombat/framing.js';
import { buildFighterRig, poseRig } from '../lib/kombat/rig.js';
import { VISUALS } from '../lib/kombat/visuals.js';
import { attachGlbFighter } from '../lib/kombat/glb-fighter.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ==================================================================
// 1. BONE-MAP COVERAGE — every available fighter's rig resolves
// ==================================================================
t('sanitizeBoneName mirrors three (tripo::Tail_0 -> tripoTail_0)',
  sanitizeBoneName('tripo::Tail_0') === 'tripoTail_0');
t('sanitizeBoneName keeps humanoid names intact',
  sanitizeBoneName('L_Upperarm') === 'L_Upperarm');

const available = LOADOUTS.filter((l) => l.available && l.glbUrl);
t('bridge has hosted fighters with glbUrls', available.length >= 30);
for (const lo of available) {
  const man = rigManifestFor(lo.characterId);
  t(`${lo.kombatId}: rig manifest exists`, !!man);
  if (!man) continue;
  const kind = rigKindFor(lo, man.jointCount);
  t(`${lo.kombatId}: manifest rigKind matches driver dispatch`, man.rigKind === kind);
  const jointSet = new Set(man.joints);
  if (kind === 'humanoid') {
    for (const role of HUMANOID_REQUIRED_ROLES) {
      t(`${lo.kombatId}: humanoid role ${role} resolves`, jointSet.has(HUMANOID_BONE_MAP[role]));
    }
  } else if (kind === 'creature') {
    const table = CREATURE_TABLES[lo.characterId];
    t(`${lo.kombatId}: creature table exists`, !!table);
    if (table) {
      for (const [chainName, chain] of Object.entries(table)) {
        if (!chain || !chain.bones) continue;
        for (const bone of chain.bones) {
          t(`${lo.kombatId}: ${chainName} bone ${bone} exists in rig`, jointSet.has(bone));
        }
      }
    }
  } else {
    t(`${lo.kombatId}: rigless fighter has zero joints`, man.jointCount === 0);
  }
}
// every manifest bone name is in sanitized form already
for (const [cid, man] of Object.entries(RIG_MANIFEST)) {
  t(`${cid}: manifest names are pre-sanitized`,
    man.joints.every((j) => sanitizeBoneName(j) === j));
}

// ==================================================================
// 2. POSE DRIVER — full pose set per motion class, no NaN, total
// ==================================================================
function fakeBones(names) {
  const m = new Map();
  for (const n of names) {
    m.set(n, { rotation: { x: 0.1, y: -0.05, z: 0.07 }, position: { x: 0, y: 1, z: 0 } });
  }
  return m;
}
function bonesFinite(bones) {
  for (const b of bones.values()) {
    for (const v of [b.rotation.x, b.rotation.y, b.rotation.z, b.position.x, b.position.y, b.position.z]) {
      if (!Number.isFinite(v)) return false;
    }
  }
  return true;
}
const POSES = ['idle', 'walk', 'punch', 'kick', 'block', 'hit', 'ko', 'win', 'special'];
const SPEC_KINDS = ['strike', 'projectile', 'grab', 'movement', 'ward', 'heal', 'buff', 'debuff'];

function exerciseDriver(label, driver, bones) {
  let now = 0;
  for (const pose of POSES) {
    for (let i = 0; i < 14; i++) {
      now += 0.05;
      const ctx = pose === 'walk' ? { moveDir: i % 3 === 0 ? -1 : 1 }
        : pose === 'special' ? { specKind: SPEC_KINDS[i % SPEC_KINDS.length], actionT: i * 0.07, actionDur: 1.06 }
        : pose === 'punch' || pose === 'kick' ? { actionT: i * 0.03, actionDur: 0.4 }
        : {};
      const out = driver.apply(pose, 0.05, now, ctx);
      t(`${label}: ${pose} frame ${i} finite bones`, bonesFinite(bones));
      t(`${label}: ${pose} frame ${i} lift >= 0`, out.lift >= 0 && Number.isFinite(out.lift));
      t(`${label}: ${pose} frame ${i} fall in [0,1]`, out.fall >= 0 && out.fall <= 1);
      if (pose !== 'ko') t(`${label}: ${pose} never falls`, out.fall < 1 || i < 2);
    }
  }
}

// humanoid (freddy's profile)
{
  const bones = fakeBones(Object.values(HUMANOID_BONE_MAP));
  const driver = createPoseDriver({
    kind: 'humanoid', bones,
    profile: movementProfile(getLoadout('freddy-krueger')),
    weaponSide: 'R', dualWield: false,
    size: { x: 0.86, y: 1.82, z: 1.8 },
  });
  t('humanoid driver captures the full bone map', driver.drivenCount >= 20);
  exerciseDriver('humanoid', driver, bones);
  // totality: after a long ko, idle returns bones EXACTLY to the
  // fresh-idle values at the same clock (no downed leak in the driver)
  const fresh = createPoseDriver({
    kind: 'humanoid', bones: fakeBones(Object.values(HUMANOID_BONE_MAP)),
    profile: movementProfile(getLoadout('freddy-krueger')),
    weaponSide: 'R', dualWield: false, size: { x: 0.86, y: 1.82, z: 1.8 },
  });
  const freshBones = fakeBones(Object.values(HUMANOID_BONE_MAP));
  const fresh2 = createPoseDriver({
    kind: 'humanoid', bones: freshBones,
    profile: movementProfile(getLoadout('freddy-krueger')),
    weaponSide: 'R', dualWield: false, size: { x: 0.86, y: 1.82, z: 1.8 },
  });
  void fresh;
  fresh2.apply('idle', 0.016, 5.0, {});
  for (let i = 0; i < 40; i++) driver.apply('ko', 0.05, 10 + i * 0.05, {});
  let out;
  for (let i = 0; i < 30; i++) out = driver.apply('idle', 0.05, 5.0, {});
  t('driver: fall fully eases out after ko -> idle', out.fall < 0.02);
  const armName = HUMANOID_BONE_MAP.upperArmR;
  t('driver: bones return to fresh-idle values after ko -> idle',
    approx(bones.get(armName).rotation.x, freshBones.get(armName).rotation.x, 1e-9)
    && approx(bones.get(armName).rotation.z, freshBones.get(armName).rotation.z, 1e-9));
}

// creatures (every table)
for (const lo of available) {
  const man = rigManifestFor(lo.characterId);
  if (!man || man.rigKind !== 'creature') continue;
  const bones = fakeBones(man.joints);
  const driver = createPoseDriver({
    kind: 'creature', bones, table: CREATURE_TABLES[lo.characterId],
    profile: movementProfile(lo), weaponSide: 'R', dualWield: false,
    size: { x: 2.4, y: 1.4, z: 0.9 },
  });
  t(`${lo.kombatId}: creature driver captures bones`, driver.drivenCount > 4);
  exerciseDriver(lo.kombatId, driver, bones);
}

// rigless (slimer): mesh-level driver
{
  const mesh = { position: { x: 0, y: 1, z: 0 }, scale: { x: 2, y: 2, z: 2 }, rotation: { x: 0, y: 0, z: 0 } };
  const driver = createPoseDriver({
    kind: 'rigless', bones: new Map(),
    profile: movementProfile(getLoadout('slimer')),
    weaponSide: 'R', dualWield: false, size: { x: 1.6, y: 2, z: 2 }, meshGroup: mesh,
  });
  let now = 0;
  for (const pose of POSES) {
    for (let i = 0; i < 8; i++) {
      now += 0.05;
      const out = driver.apply(pose, 0.05, now, {});
      t(`rigless: ${pose} mesh finite`, [mesh.position.y, mesh.scale.x, mesh.scale.y, mesh.rotation.z].every(Number.isFinite));
      t(`rigless: ${pose} lift >= 0`, out.lift >= 0);
    }
  }
  let out;
  for (let i = 0; i < 30; i++) out = driver.apply('ko', 0.05, 50 + i * 0.05, {});
  t('rigless: ko drops the float (wrapper lift 0)', out.lift === 0);
  t('rigless: ko squashes flat with the bottom pinned (y scales with sy)',
    mesh.scale.y < 2 * 0.7 && approx(mesh.position.y, 1 * 0.55, 0.01));
}

// ==================================================================
// 2b. FLOOR MARGINS — measured worst cases are baked + applied
// ==================================================================
{
  for (const lo of available) {
    const man = rigManifestFor(lo.characterId);
    t(`${lo.kombatId}: floorMargins baked from the sweep`, !!man.floorMargins);
    if (man.floorMargins) {
      for (const [pose, m] of Object.entries(man.floorMargins)) {
        t(`${lo.kombatId}: margin[${pose}] is a sane lift`, m > 0 && m <= 0.35);
      }
    }
  }
  // the driver actually applies a margin to its lift
  const bones = fakeBones(Object.values(HUMANOID_BONE_MAP));
  const driver = createPoseDriver({
    kind: 'humanoid', bones,
    profile: movementProfile(getLoadout('freddy-krueger')),
    weaponSide: 'R', dualWield: false,
    size: { x: 0.86, y: 1.82, z: 1.8 },
    floorMargins: { idle: 0.2 },
  });
  let out;
  for (let i = 0; i < 30; i++) out = driver.apply('idle', 0.05, i * 0.05, {});
  t('driver: floor margin raises the stance lift', out.lift >= 0.19);
}

// ==================================================================
// 3. MOVEMENT PROFILES — "moves like them"
// ==================================================================
{
  const jason = movementProfile(getLoadout('jason-voorhees'));
  const michael = movementProfile(getLoadout('michael-myers'));
  const freddy = movementProfile(getLoadout('freddy-krueger'));
  const palpatine = movementProfile(getLoadout('emperor-palpatine'));
  const slimer = movementProfile(getLoadout('slimer'));
  const xeno = movementProfile(getLoadout('xenomorph'));
  t('jason stalks: slowest gait in the test set', jason.gaitHz <= 1.5 && jason.gaitHz < freddy.gaitHz);
  t('jason barely bobs', jason.bobAmp <= 0.01);
  t('michael glides: near-zero bob', michael.bobAmp <= 0.006);
  t('freddy prowls: hunched with the claw raised', freddy.lean >= 0.15 && freddy.weaponRaise >= 0.8);
  t('palpatine hovers instead of walking', palpatine.hover > 0 && palpatine.gaitAmp < 0.2);
  t('slimer floats (no ground gait)', slimer.hover > 0.1 && slimer.gaitAmp < 0.1);
  t('xenomorph skitters in bursts (freeze + explode)', xeno.still > 0.3 && xeno.gaitHz > 4);
}

// ==================================================================
// 4. FLOOR LAW
// ==================================================================
t('clampToFloor pins negatives to the plane', clampToFloor(-2.5) === FLOOR_Y && clampToFloor(1.5) === 1.5);
t('clampToFloor is NaN-safe', clampToFloor(NaN) === FLOOR_Y);
{
  const root = { position: { x: 0, y: -0.4, z: 0 } };
  applyFloorClamp(root);
  t('applyFloorClamp lifts a sunken root to the plane', root.position.y === 0);
}
t('solveFloorY lifts a dipping body exactly onto the plane',
  approx(solveFloorY(0, -0.3, 0), 0.3));
t('solveFloorY never lowers a root below its base',
  solveFloorY(0, 0.25, 0) === 0 && approx(solveFloorY(0.8, 1.05, 0.8), 0.8));
{
  // a full jump arc through the shared stepper never crosses y=0
  let s = { y: 0, vy: 7.2, grounded: false };
  let minY = Infinity;
  for (let i = 0; i < 240 && !s.grounded; i++) {
    s = stepVertical(s.y, s.vy, 22, 1 / 60);
    minY = Math.min(minY, s.y);
  }
  t('stepVertical: jump arc lands ON the plane, never below', s.grounded && s.y === 0 && minY >= 0);
}
{
  // knockdown rest height: the analytic lift puts the fallen body's
  // lowest point exactly on the plane (driver-level floor proof)
  const cases = [
    { label: 'freddy (back fall)', size: { x: 0.86, y: 1.82, z: 1.8 }, fall: 'back' },
    { label: 'xenomorph (back fall)', size: { x: 0.9, y: 2.45, z: 2.4 }, fall: 'back' },
    { label: 't-rex (side fall)', size: { x: 3.0, y: 2.31, z: 2.13 }, fall: 'side' },
    { label: 'raptor (side fall)', size: { x: 2.59, y: 1.42, z: 0.97 }, fall: 'side' },
  ];
  for (const c of cases) {
    const lift = koLiftFor(c.size, c.fall);
    const extent = c.fall === 'side' ? c.size.z : c.size.x;
    const lowestAfterFall = -(extent / 2) * Math.sin(FALL_ANGLE) + lift;
    t(`${c.label}: fallen body rests ON the plane`, Math.abs(lowestAfterFall) < 0.02 && lift > 0);
  }
}
{
  // procedural fallback, geometrically: in every pose, the shared
  // clamp math (measure box -> solveFloorY) puts the body on/above
  // the plane. This is the exact computation the engines run.
  for (const id of ['freddy-krueger', 't-rex', 'slimer', 'jason-voorhees']) {
    const rig = buildFighterRig(VISUALS[id]);
    for (const pose of ['idle', 'walk', 'punch', 'kick', 'block', 'hit', 'ko', 'win', 'special']) {
      for (const tt of [0, 0.7, 1.9]) {
        poseRig(rig, pose, tt);
        rig.position.y = 0;
        rig.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(rig);
        const solved = solveFloorY(rig.position.y, box.min.y, 0);
        t(`${id}/${pose}@${tt}: clamp solves to a non-negative lift`, solved >= 0);
        rig.position.y = solved;
        rig.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(rig);
        t(`${id}/${pose}@${tt}: lowest point rests on/above the plane`, box2.min.y >= -0.02);
      }
    }
  }
}

// ==================================================================
// 5. DOWNED-STATE LAW
// ==================================================================
{
  // pose resolution matrix: 'ko' iff actually downed
  const cases = [
    [{ state: 'idle', alive: true }, 'idle'],
    [{ state: 'idle', alive: true, blockHeld: true, actionable: true }, 'block'],
    [{ state: 'walk', alive: true }, 'walk'],
    [{ state: 'punch', alive: true }, 'punch'],
    [{ state: 'kick', alive: true }, 'kick'],
    [{ state: 'special', alive: true }, 'special'],
    [{ state: 'hit', alive: true }, 'hit'],
    [{ state: 'dizzy', alive: true }, 'hit'],
    [{ state: 'win', alive: true }, 'win'],
    [{ state: 'ko', alive: true }, 'ko'],
    [{ state: 'idle', alive: false }, 'ko'],
    [{ state: 'dizzy', alive: false }, 'ko'],
    [{ state: 'idle', alive: true, grounded: false }, 'walk'],
    [{ state: 'ko', alive: true, grounded: false }, 'ko'],
  ];
  for (const [input, want] of cases) {
    t(`resolvePose(${JSON.stringify(input)}) == ${want}`, resolvePose(input) === want);
  }
  // simulated match: round transitions, KO -> next round, reset —
  // the downed pose is active ONLY inside the downed windows
  const script = [
    // [state, alive, downedExpected]
    ['idle', true, false],   // round intro
    ['idle', true, false],   // FIGHT!
    ['walk', true, false],
    ['punch', true, false],
    ['hit', true, false],
    ['ko', true, true],      // knocked out — downed window opens
    ['ko', true, true],      // round end holds the body down
    ['idle', true, false],   // reset: next round intro — standing
    ['walk', true, false],
    ['hit', true, false],
    ['ko', false, true],     // brawl-style death — downed
    ['idle', true, false],   // respawn/reset — standing again
  ];
  script.forEach(([state, alive, downed], i) => {
    const pose = resolvePose({ state, alive });
    t(`match script step ${i} (${state}): downed == ${downed}`, isDownedPose(pose) === downed);
  });
}
{
  // poseRig totality on the REAL procedural rigs: the ko root
  // rotation/position must not survive a single non-ko pose call
  for (const id of ['freddy-krueger', 't-rex', 'slimer', 'chucky']) {
    const rig = buildFighterRig(VISUALS[id]);
    const bind = rig.userData.bindRoot;
    t(`${id}: bindRoot captured at build`, !!bind);
    poseRig(rig, 'ko', 0.4);
    const rootKo = rig.userData.joints.root;
    const koRx = rootKo.rotation.x;
    if (VISUALS[id].body !== 'blob') {
      t(`${id}: ko pose actually lays the root down`, Math.abs(koRx) > 0.5);
    }
    // totality, stated exactly: posing X after a ko must produce
    // EXACTLY what posing X from bind produces (win/special move the
    // root themselves — the law is that the KO never leaks into them)
    for (const next of ['idle', 'walk', 'win', 'hit', 'block', 'special']) {
      poseRig(rig, 'ko', 0.4);
      poseRig(rig, next, 0.4);
      const freshRig = buildFighterRig(VISUALS[id]);
      poseRig(freshRig, next, 0.4);
      const r = rig.userData.joints.root;
      const fr = freshRig.userData.joints.root;
      t(`${id}: ko -> ${next} == fresh ${next} (no leak)`,
        approx(r.rotation.x, fr.rotation.x, 1e-9) && approx(r.rotation.z, fr.rotation.z, 1e-9)
        && approx(r.position.y, fr.position.y, 1e-9) && approx(r.position.z, fr.position.z, 1e-9));
    }
    // blob torso scale totality (block/hit squash must not stick)
    if (rig.userData.bindTorsoScale) {
      poseRig(rig, 'block', 0.3);
      poseRig(rig, 'idle', 0.3);
      const freshRig = buildFighterRig(VISUALS[id]);
      poseRig(freshRig, 'idle', 0.3);
      const s = rig.userData.parts.torsoMesh.scale;
      const fs = freshRig.userData.parts.torsoMesh.scale;
      t(`${id}: blob torso scale after block -> idle == fresh idle`,
        approx(s.x, fs.x, 1e-9) && approx(s.y, fs.y, 1e-9) && approx(s.z, fs.z, 1e-9));
    }
  }
}

// ==================================================================
// 6. GLB FALLBACK CONTRACT
// ==================================================================
{
  // a fighter with no glbUrl keeps the procedural body: attach is null
  const noGlb = LOADOUTS.find((l) => !l.glbUrl);
  t('a no-glbUrl loadout exists for the fallback contract', !!noGlb);
  if (noGlb) {
    t('attachGlbFighter returns null without a glbUrl',
      attachGlbFighter({ kombatId: noGlb.kombatId, procSize: { x: 1, y: 1.9, z: 1 } }) === null);
  }
  // a hosted fighter returns a handle that starts NOT ready (the
  // procedural body stands in while the model loads)
  const freddy = attachGlbFighter({ kombatId: 'freddy-krueger', procSize: { x: 0.7, y: 1.82, z: 0.6 } });
  t('attachGlbFighter returns a handle for a hosted fighter', !!freddy);
  if (freddy) {
    t('handle starts not-ready (procedural stand-in window)', freddy.isReady() === false);
    t('handle exposes the engine group + update', !!freddy.group && typeof freddy.update === 'function');
  }
}

// ==================================================================
// 7. SPECIALS LOGIC
// ==================================================================
{
  // classification covers ALL 43 fighters' specials — none unclassified
  let total = 0;
  for (const f of FIGHTERS) {
    const kinds = classifyKit(f.specials);
    t(`${f.id}: kit classifies fully`, kinds.length === f.specials.length);
    for (let i = 0; i < f.specials.length; i++) {
      total++;
      const { kind, band } = kinds[i];
      t(`${f.id}/${f.specials[i].name}: kind is a real kind`, SPECIAL_KINDS.includes(kind));
      t(`${f.id}/${f.specials[i].name}: band is a range`, Array.isArray(band) && band[1] > band[0]);
      if (kind === 'ward' || kind === 'heal' || kind === 'buff') {
        // the never-damage invariant for self kinds, from roster data
        t(`${f.id}/${f.specials[i].name}: ${kind} carries no damage`, !(f.specials[i].damage > 0) || kind === 'buff');
      }
    }
  }
  t('roster specials total > 200', total > 200);
  // anchors — the classification reads what the special IS
  const anchor = (fid, name, want) => {
    const s = getFighter(fid).specials.find((x) => x.name === name);
    t(`${fid} :: ${name} is ${want}`, classifySpecial(s).kind === want);
  };
  anchor('freddy-krueger', 'Never Sleep', 'projectile');
  anchor('freddy-krueger', 'Dream Walk', 'movement');
  anchor('freddy-krueger', 'Boiler Room Trap', 'debuff');
  anchor('freddy-krueger', 'Dream Slash', 'strike');
  anchor('jason-voorhees', 'Lake Grab', 'grab');
  anchor('jason-voorhees', 'Machete Throw', 'projectile');
  anchor('jason-voorhees', 'Undying', 'ward');
  anchor('wolverine', 'Healing Factor', 'heal');
  anchor('slimer', 'Snack Break', 'heal');
  anchor('t-800', 'Target Lock', 'buff');
  anchor('hulk', 'Hulk Angry', 'buff');
  anchor('emperor-palpatine', 'Force Lightning', 'projectile');
  anchor('darth-vader', 'Force Choke', 'grab');
  t('vader :: Force Choke grabs from across the arena (data override)',
    classifySpecial(getFighter('darth-vader').specials.find((x) => x.name === 'Force Choke'), 'darth-vader').band[1] > 90);
  anchor('xenomorph', 'Acid Spit', 'projectile');
  anchor('dr-cockroach', 'Exoskeleton', 'ward');

  // fire conditions
  const healSpec = { name: 'Mend', effect: 'restores health', damage: 0, cooldown: 8 };
  t('heal denied at full health', !specialUsable(healSpec, 'heal', { health: 100, maxHealth: 100 }, {}).ok);
  t('heal allowed when hurt', specialUsable(healSpec, 'heal', { health: 40, maxHealth: 100 }, {}).ok);
  const wardSpec = { name: 'Aegis', effect: 'shield; damage taken is halved', damage: 0, cooldown: 9 };
  t('ward denied while already warded', !specialUsable(wardSpec, 'ward', { health: 50, wardT: 2 }, {}).ok);
  t('ward denied at full health', !specialUsable(wardSpec, 'ward', { health: 100, maxHealth: 100, wardT: 0 }, {}).ok);
  t('ward allowed when hurt and unwarded', specialUsable(wardSpec, 'ward', { health: 60, wardT: 0 }, {}).ok);
  const buffSpec = { name: 'Surge', effect: 'attack power surges', damage: 0, cooldown: 8 };
  t('buff denied while already buffed', !specialUsable(buffSpec, 'buff', { health: 80, buffT: 1 }, {}).ok);
  t('heal amount scales with cooldown', healAmountFor(healSpec) > 15);

  // range bands — the honest-whiff contract
  t('grab whiffs beyond contact', !inBand('grab', 2.0));
  t('grab lands at contact', inBand('grab', 1.2));
  t('strike lands inside its band', inBand('strike', 2.4));
  t('strike whiffs at range', !inBand('strike', 3.1));
  t('projectile works at range', inBand('projectile', 7.5));
  t('debuff whiffs beyond its band', !inBand('debuff', 3.2));

  // status math
  t('buff multiplies damage dealt', approx(statusDamageMul({ buffT: 1 }, {}), 1.3));
  t('curse multiplies damage taken', approx(statusDamageMul({}, { debuffT: 1 }), 1.2));
  t('buff + curse stack', approx(statusDamageMul({ buffT: 1 }, { debuffT: 1 }), 1.56));
  t('curse slows', approx(statusSpeedMul({ debuffT: 1 }), 0.75));
  t('buff hastes', approx(statusSpeedMul({ buffT: 1 }), 1.15));

  // AI policy on a synthetic kit (deterministic rng)
  const kit = [
    { name: 'Bolt Hurl', effect: 'throws a crackling bolt of energy', damage: 10, cooldown: 5 },
    { name: 'Mend', effect: 'restores health over time', damage: 0, cooldown: 8 },
    { name: 'Heavy Smash', effect: 'a crushing overhead punch', damage: 16, cooldown: 4 },
    { name: 'Aegis', effect: 'raises a shield; damage taken is halved', damage: 0, cooldown: 9 },
    { name: 'Snatch', effect: 'grabs the opponent and slams them down', damage: 14, cooldown: 6 },
  ];
  const kinds = classifyKit(kit);
  t('synthetic kit classifies as designed',
    kinds.map((k) => k.kind).join(',') === 'projectile,heal,strike,ward,grab');
  const ready = [0, 0, 0, 0, 0];
  const pick = (s, cds = ready) => chooseSpecial(kit, kinds, cds, s, () => 0);
  t('AI: at range, healthy -> projectile', pick({ dist: 6, selfHealth: 100, foeHealth: 100 }) === 0);
  t('AI: at range, hurt -> heal beats projectile', pick({ dist: 6, selfHealth: 30, foeHealth: 100 }) === 1);
  t('AI: point blank -> a contact kind wins, not the projectile',
    [2, 4].includes(pick({ dist: 1, selfHealth: 100, foeHealth: 100 })));
  t('AI: point blank, grab on cooldown -> strike', pick({ dist: 1, selfHealth: 100, foeHealth: 100 }, [0, 0, 0, 0, 5]) === 2);
  t('AI: point blank, strike on cooldown -> grab', pick({ dist: 1, selfHealth: 100, foeHealth: 100 }, [0, 0, 3, 0, 0]) === 4);
  t('AI: hurt in close, offence on cooldown -> ward',
    pick({ dist: 1, selfHealth: 40, foeHealth: 100 }, [0, 0, 3, 0, 3]) === 3);
  t('AI: nothing sensible at range at full health (no ward/buff waste) -> -1',
    pick({ dist: 6, selfHealth: 100, foeHealth: 100 }, [3, 0, 0, 0, 0]) === -1);
  t('AI: never picks a special on cooldown',
    pick({ dist: 1, selfHealth: 100, foeHealth: 100 }, [5, 5, 5, 5, 5]) === -1);
  t('AI: finisher bias — the heavy strike when the foe is low',
    pick({ dist: 1.4, selfHealth: 100, foeHealth: 20 }, [5, 5, 0, 5, 5]) === 2);
  // real-kit sanity: freddy at long range picks the phantom, not a strike
  const freddy = getFighter('freddy-krueger');
  const fKinds = classifyKit(freddy.specials);
  const fIdx = chooseSpecial(freddy.specials, fKinds, freddy.specials.map(() => 0),
    { dist: 6.5, selfHealth: 100, foeHealth: 100 }, () => 0);
  t('AI: freddy at range fires Never Sleep (projectile)',
    fIdx >= 0 && freddy.specials[fIdx].name === 'Never Sleep');
  const fIdxClose = chooseSpecial(freddy.specials, fKinds, freddy.specials.map(() => 0),
    { dist: 1.0, selfHealth: 100, foeHealth: 100 }, () => 0);
  t('AI: freddy in close picks a strike-kind',
    fIdxClose >= 0 && fKinds[fIdxClose].kind === 'strike');
}

// ==================================================================
// 8. FINISH HIM — single render (source-level proof)
// ==================================================================
{
  const engineSrc = readFileSync(new URL('../app/kombat/engine.js', import.meta.url), 'utf8');
  const brawlSrc = readFileSync(new URL('../app/kombat/brawl.js', import.meta.url), 'utf8');
  const pageSrc = readFileSync(new URL('../app/kombat/page.jsx', import.meta.url), 'utf8');
  t('duel engine never announces FINISH HIM (overlay owns it)',
    !engineSrc.includes("onAnnounce', 'FINISH HIM!"));
  t('brawl engine never announces FINISH HIM (overlay owns it)',
    !brawlSrc.includes("onAnnounce', 'FINISH HIM!"));
  const overlays = (pageSrc.match(/>FINISH HIM!</g) || []).length;
  t('page renders exactly one FINISH HIM overlay per screen (duel + brawl)', overlays === 2);
  t('both engines still fire onFinishHim',
    engineSrc.includes("H('onFinishHim', true") && brawlSrc.includes("H('onFinishHim', true"));
  // integration presence: the swap + driver + clamp are wired in
  for (const [label, src] of [['engine', engineSrc], ['brawl', brawlSrc]]) {
    t(`${label}: GLB attach wired`, src.includes('attachGlbFighter'));
    t(`${label}: floor clamp wired`, src.includes('solveFloorY') && src.includes('applyFloorClamp'));
    t(`${label}: specials logic wired`, src.includes('chooseSpecial') && src.includes('classifyKit'));
    t(`${label}: pose resolver wired`, src.includes('resolvePose'));
  }
  t('page prefetches GLBs at the versus splash',
    pageSrc.includes('prefetchFighterGlbs') && pageSrc.includes('beginFight'));
}

// ==================================================================
// 9. FRAMING — the fight plays above the pad row at phone aspects
// ==================================================================
{
  const landscape = duelFraming(16 / 9);
  t('landscape keeps the classic framing',
    landscape.camZ === 8.8 && landscape.camY === 2.35 && landscape.shiftUpFrac === 0);
  const W = 390, H = 844;
  const fr = duelFraming(W / H);
  t('portrait framing pulls back and shifts up', fr.camZ > 10 && fr.shiftUpFrac > 0.1);
  const cam = new THREE.PerspectiveCamera(fr.fovY, W / H, 0.1, 120);
  cam.position.set(0, fr.camY, fr.camZ);
  cam.lookAt(0, fr.lookY, 0);
  if (fr.shiftUpFrac > 0) cam.setViewOffset(W, H, 0, Math.round(fr.shiftUpFrac * H), W, H);
  cam.updateProjectionMatrix();
  const mk = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const x of [-3.6, -1.5, 0, 1.5, 3.6]) {
    const r = fighterInClearBand(cam, mk, x, 1.9);
    t(`portrait: fighter at x=${x} plays in the clear band`, r.ok);
    t(`portrait: feet above pad band at x=${x}`, r.feet.yFromTop <= 1 - PAD_BAND_FRAC);
  }
  t('brawl framing shifts up only in portrait',
    brawlFraming(0.46).shiftUpFrac > 0 && brawlFraming(1.7).shiftUpFrac === 0);
}

console.log(`kombat-step6: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
