// tests/kombat-roster16.test.mjs — headless tests for the Hawkins +
// Operatives wave (2026-10-22): Merlin's 16 Tripo-Studio-rigged
// characters wired into Kombat + the platform character roster.
// Run: node tests/kombat-roster16.test.mjs (from the repo root).
//
// Pins, beyond the generic suites (which now cover the 16 through
// their roster-wide loops):
//   - the 16 exist across roster / bridge / characters / manifest
//     with one consistent id chain (kombatId <-> characterId);
//   - their model files are ON DISK at the bridge's local glbUrl,
//     with joint counts exactly matching the rig manifest;
//   - the hub pick surface (listEmbodiments + the pick chain)
//     includes them;
//   - the Mixamo pose adapter lands driver-space rotations on the
//     real bones in the MEASURED directions, and bind capture /
//     restore through the adapter is exact (the step6 totality law,
//     proven for the dialect);
//   - Demobats' honest treatment: ONE fighter entry for the swarm,
//     creature-kind for temperament, humanoid-driven on its
//     humanoid-template skeleton.

import { existsSync, readFileSync } from 'node:fs';
import { FIGHTERS, getFighter } from '../lib/kombat/roster.js';
import { LOADOUTS, getLoadout } from '../lib/kombat/loadouts.js';
import { CHARACTERS, getCharacterById } from '../lib/characters/roster.js';
import { RIG_MANIFEST, rigManifestFor } from '../lib/kombat/rig-manifest.js';
import {
  MIXAMO_BONE_MAP, CREATURE_TABLES, rigKindFor, movementProfile, createPoseDriver,
} from '../lib/kombat/pose-driver.js';
import {
  EMBODIMENTS, listEmbodiments, getEmbodiment,
  resolveSurfaceCharacterId, PROFILE_CHARACTER_LS_KEY,
} from '../lib/characters/embodiment.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const WAVE = [
  ['eddie-munson', 'q044-eddie-munson', 44, 'Hawkins'],
  ['eleven', 'q045-eleven', 45, 'Hawkins'],
  ['jim-hopper', 'q046-jim-hopper', 46, 'Hawkins'],
  ['vecna', 'q047-vecna', 47, 'Hawkins'],
  ['demogorgon', 'q048-demogorgon', 48, 'Hawkins'],
  ['demobats', 'q049-demobats', 49, 'Hawkins'],
  ['mind-flayer', 'q050-mind-flayer', 50, 'Hawkins'],
  ['mind-flayer-hybrid', 'q051-mind-flayer-hybrid', 51, 'Hawkins'],
  ['bounty-hunter', 'q052-bounty-hunter', 52, 'Operatives'],
  ['cybernetic-soldier', 'q053-cybernetic-soldier', 53, 'Operatives'],
  ['cyberpunk-operative', 'q054-cyberpunk-operative', 54, 'Operatives'],
  ['futuristic-female-operative', 'q055-futuristic-female-operative', 55, 'Operatives'],
  ['post-apocalyptic', 'q056-post-apocalyptic', 56, 'Operatives'],
  ['space-marine', 'q057-space-marine', 57, 'Operatives'],
  ['tactical-hitman', 'q058-tactical-hitman', 58, 'Operatives'],
  ['tactical-soldier', 'q059-tactical-soldier', 59, 'Operatives'],
];

// ==================================================================
// 1. One consistent id chain across all four data surfaces
// ==================================================================
t('roster carries 59 fighters', FIGHTERS.length === 59);
for (const [kid, cid, q, franchise] of WAVE) {
  const f = getFighter(kid);
  t(`${kid}: roster entry exists`, !!f);
  t(`${kid}: franchise is ${franchise}`, f && f.franchise === franchise);
  t(`${kid}: five specials + a fatality`, !!f && f.specials.length === 5 && !!f.fatality);
  const l = getLoadout(kid);
  t(`${kid}: bridge record joins by kombatId`, !!l && l.characterId === cid && l.queueNumber === q);
  t(`${kid}: bridge available + locally hosted`, !!l && l.available === true
    && l.glbUrl === `/models/kombat/${kid}.glb`);
  t(`${kid}: tint declared (Studio exports carry no materials)`,
    !!l && typeof l.tint === 'string' && /^#[0-9a-f]{6}$/i.test(l.tint));
  const c = getCharacterById(cid);
  t(`${kid}: character roster joins`, !!c && c.queueNumber === q && c.name === f.name);
  const man = rigManifestFor(cid);
  t(`${kid}: rig manifest measured`, !!man && man.kombatId === kid && man.jointCount === man.joints.length);
}

// ==================================================================
// 2. Model files on disk, joint-exact against the manifest
// ==================================================================
for (const [kid, cid] of WAVE) {
  const url = new URL(`../public/models/kombat/${kid}.glb`, import.meta.url);
  t(`${kid}: model file exists at the bridge glbUrl`, existsSync(url));
  if (!existsSync(url)) continue;
  const buf = readFileSync(url);
  t(`${kid}: glTF magic`, buf.toString('ascii', 0, 4) === 'glTF');
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const joints = gltf.skins && gltf.skins[0] ? gltf.skins[0].joints.length : 0;
  t(`${kid}: file joint count == manifest (${joints})`, joints === rigManifestFor(cid).jointCount);
  t(`${kid}: no authored materials in the export (tint renders it)`,
    !gltf.materials || gltf.materials.length === 0);
}

// ==================================================================
// 3. Hub picks: the embodiment listing + pick chain include the 16
// ==================================================================
t('listEmbodiments is the pick listing', listEmbodiments() === EMBODIMENTS);
for (const [kid, cid] of WAVE) {
  const e = getEmbodiment(cid);
  t(`${kid}: hub embodiment resolves`, !!e && e.kombatId === kid && e.available === true);
}
{
  const store = new Map([[PROFILE_CHARACTER_LS_KEY, 'q047-vecna']]);
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null) };
  t('pick chain resolves a wave fighter from the profile default',
    resolveSurfaceCharacterId('earth', { storage }) === 'q047-vecna');
}

// ==================================================================
// 4. Mixamo adapter: measured directions + exact bind restore
// ==================================================================
function fakeMixamoBones() {
  const m = new Map();
  for (const name of Object.values(MIXAMO_BONE_MAP)) {
    m.set(name, { rotation: { x: 0.1, y: -0.05, z: 0.07 }, position: { x: 0, y: 1, z: 0 } });
  }
  m.set('mixamorigHips', m.get('mixamorigHips')); // the dialect key itself
  return m;
}
const mixaProfile = movementProfile(getLoadout('eddie-munson'));
{
  const bones = fakeMixamoBones();
  const driver = createPoseDriver({
    kind: 'humanoid', bones, profile: mixaProfile,
    weaponSide: 'R', dualWield: false, size: { x: 0.8, y: 1.8, z: 0.5 },
  });
  t('mixamo driver captures the full role map', driver.drivenCount === 20);
  // Direction proof, legs: in driver space a kick swings the thigh
  // FORWARD (positive driver x). On a real Mixamo bone forward is
  // NEGATIVE x (measured) — after kicking frames the real thigh
  // must sit below its bind x, the real calf folded positive.
  // The driver kicks with the OFF-side leg (weaponSide R -> left).
  const thigh = bones.get('mixamorigLeftUpLeg');
  const calf = bones.get('mixamorigLeftLeg');
  const bindThighX = thigh.rotation.x, bindCalfX = calf.rotation.x;
  let now = 0;
  for (let i = 0; i < 8; i++) { now += 0.05; driver.apply('kick', 0.05, now, { actionT: i * 0.05, actionDur: 0.4 }); }
  t('mixamo kick: real thigh swings forward (x below bind)', thigh.rotation.x < bindThighX - 0.05);
  t('mixamo kick: real calf folds (x above bind)', calf.rotation.x > bindCalfX + 0.02);
  // Direction proof, arms: a punch drives the arm's swing axis —
  // on Mixamo that is the real z, not x.
  const arm = bones.get('mixamorigRightArm');
  const bindArmZ = arm.rotation.z;
  for (let i = 0; i < 8; i++) { now += 0.05; driver.apply('punch', 0.05, now, { actionT: i * 0.05, actionDur: 0.4 }); }
  t('mixamo punch: real arm z carries the swing', Math.abs(arm.rotation.z - bindArmZ) > 0.05);
  // Totality through the adapter: after a long ko, idle returns the
  // REAL bones exactly to fresh-idle values at the same clock.
  const freshBones = fakeMixamoBones();
  const fresh = createPoseDriver({
    kind: 'humanoid', bones: freshBones, profile: mixaProfile,
    weaponSide: 'R', dualWield: false, size: { x: 0.8, y: 1.8, z: 0.5 },
  });
  fresh.apply('idle', 0.016, 5.0, {});
  for (let i = 0; i < 40; i++) driver.apply('ko', 0.05, 10 + i * 0.05, {});
  let out;
  for (let i = 0; i < 30; i++) out = driver.apply('idle', 0.05, 5.0, {});
  t('mixamo driver: fall fully eases out after ko -> idle', out.fall < 0.02);
  const realArm = bones.get('mixamorigRightArm');
  const freshArm = freshBones.get('mixamorigRightArm');
  t('mixamo driver: real bones return to fresh-idle values exactly',
    approx(realArm.rotation.x, freshArm.rotation.x) && approx(realArm.rotation.z, freshArm.rotation.z)
    && approx(bones.get('mixamorigRightUpLeg').rotation.x, freshBones.get('mixamorigRightUpLeg').rotation.x));
  // Every pose finite through the adapter.
  let finite = true;
  for (const pose of ['idle', 'walk', 'punch', 'kick', 'block', 'hit', 'ko', 'win', 'special']) {
    for (let i = 0; i < 10; i++) {
      now += 0.05;
      driver.apply(pose, 0.05, now, pose === 'special' ? { specKind: 'strike', actionT: i * 0.07, actionDur: 1.06 } : {});
      for (const b of bones.values()) {
        if (![b.rotation.x, b.rotation.y, b.rotation.z].every(Number.isFinite)) finite = false;
      }
    }
  }
  t('mixamo driver: all poses finite on the real bones', finite);
}

// ==================================================================
// 5. The two Mind Flayers: creature tables keyed + fully measured
// ==================================================================
for (const cid of ['q050-mind-flayer', 'q051-mind-flayer-hybrid']) {
  const lo = LOADOUTS.find((l) => l.characterId === cid);
  const man = rigManifestFor(cid);
  t(`${cid}: driver dispatch is creature`, rigKindFor(lo, man.jointCount) === 'creature');
  const table = CREATURE_TABLES[cid];
  t(`${cid}: creature table exists`, !!table);
  if (table) {
    const jointSet = new Set(man.joints);
    let allIn = true;
    for (const chain of Object.values(table)) {
      if (chain && chain.bones) for (const b of chain.bones) if (!jointSet.has(b)) allIn = false;
    }
    t(`${cid}: every table bone exists in the measured rig`, allIn);
  }
}

// ==================================================================
// 6. Demobats: the honest swarm treatment
// ==================================================================
{
  const lo = getLoadout('demobats');
  const man = rigManifestFor('q049-demobats');
  t('demobats: ONE fighter entry for the swarm', !!lo && !!getFighter('demobats'));
  t('demobats: creature-kind bridge (temperament reads the swarm)',
    lo.rigClass === 'creature' && lo.motionClass === 'other');
  t('demobats: humanoid-driven on its template skeleton (78j)',
    rigKindFor(lo, man.jointCount) === 'humanoid' && man.jointCount === 78);
}

// ==================================================================
// 7. The loader honors the tint field (source-level)
// ==================================================================
{
  const src = readFileSync(new URL('../lib/kombat/glb-fighter.js', import.meta.url), 'utf8');
  t('glb-fighter applies loadout.tint as a flat re-skin', src.includes('loadout.tint')
    && src.includes('MeshStandardMaterial'));
  t('the original 43 carry no tint (authored materials untouched)',
    LOADOUTS.filter((l) => l.queueNumber <= 43).every((l) => l.tint === undefined));
}

console.log(`\nkombat-roster16: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
