// tests/characters-riders.test.mjs — headless tests for WAVE 6 of
// the characters-everywhere program (riders): the pose driver's
// new SEATED family ('seated' / 'drive') as shared vocabulary,
// the Shadow Realm callsign-plate identity (profile character
// icon), and the Luge rider mount (a seated character reclined
// onto the sled by pure mount math).
// Run: node tests/characters-riders.test.mjs (from the repo root).
// No browser, no network: fake bones drive the real pose driver,
// a recording 2D context verifies the plate draw, and the mount
// sweep runs the driver's real seated output through the real
// mount transform.
import { readFileSync } from 'node:fs';
import {
  HUMANOID_BONE_MAP, CREATURE_TABLES, createPoseDriver, movementProfile,
} from '../lib/kombat/pose-driver.js';
import { DRIVER_POSES, toDriverPose } from '../lib/characters/character-glb.js';
import {
  PLATE_CANVAS, PLATE_ICON, plateLayout, plateNameFor,
  characterIdForBeacon, createProfileCharacterLookup, drawPlate,
} from '../lib/shadow-realm/plate-identity.js';
import {
  LUGE_RIDER_POSE, LUGE_RIDER_PROC_SIZE, LUGE_RIDER_MOUNT,
  LUGE_RIDER_RECLINE, LUGE_SLED_HULL, RIDER_REFERENCE,
  figurePointToSled,
} from '../lib/luge/rider-embodiment.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function fakeBones(names, bind = 0) {
  const m = new Map();
  for (const n of names) {
    m.set(n, { rotation: { x: bind, y: bind, z: bind }, position: { x: 0, y: 1, z: 0 } });
  }
  return m;
}
const HUMANOID_NAMES = Object.values(HUMANOID_BONE_MAP);
function humanoidDriver(profile) {
  const bones = fakeBones(HUMANOID_NAMES);
  const driver = createPoseDriver({
    kind: 'humanoid', bones, profile: profile || movementProfile(null),
    weaponSide: 'R', size: { x: 0.9, y: 1.9, z: 0.5 },
  });
  return { bones, driver };
}
const B = (bones, role) => bones.get(HUMANOID_BONE_MAP[role]);

// ==================================================================
// 1. The seated vocabulary reaches the driver through the adapter
// ==================================================================
t("adapter vocabulary carries 'seated'", DRIVER_POSES.has('seated'));
t("adapter vocabulary carries 'drive'", DRIVER_POSES.has('drive'));
t("toDriverPose passes 'seated' through", toDriverPose('seated') === 'seated');
t("toDriverPose passes 'drive' through", toDriverPose('drive') === 'drive');
t('existing mappings unchanged (run -> walk, unknown -> idle)',
  toDriverPose('run') === 'walk' && toDriverPose('dance') === 'idle'
  && toDriverPose('ko') === 'ko');

// ==================================================================
// 2. Humanoid seated / drive: the bone read is a real chair sit
// ==================================================================
{
  const { bones, driver } = humanoidDriver();
  const idle = humanoidDriver();
  idle.driver.apply('idle', 0.016, 0.5, {});
  const out = driver.apply('seated', 0.016, 0.5, {});
  t('seated: fall wrapper never engages', out.fall === 0);
  t('seated: lift is never negative', out.lift >= 0);
  const thighSit = B(bones, 'thighL').rotation.x;
  const thighIdle = B(idle.bones, 'thighL').rotation.x;
  t('seated: thighs swing forward to near-horizontal',
    thighSit - thighIdle > 1.2 && thighSit - thighIdle < 1.6);
  t('seated: both thighs agree',
    approx(B(bones, 'thighL').rotation.x, B(bones, 'thighR').rotation.x));
  t('seated: knees bend so the shins hang (calf sweeps back)',
    B(bones, 'calfL').rotation.x < -1.1);
  t('seated: arms reach low and forward from the guard',
    B(bones, 'upperArmR').rotation.x > B(idle.bones, 'upperArmR').rotation.x + 0.3);

  const drv = humanoidDriver();
  drv.driver.apply('drive', 0.016, 0.5, {});
  const thighDrive = B(drv.bones, 'thighL').rotation.x;
  t('drive: legs reach forward, less folded than the chair sit',
    thighDrive - thighIdle > 0.9 && thighDrive < thighSit - 0.15);
  t('drive: shins angle to pedals (calf only partly bent)',
    B(drv.bones, 'calfL').rotation.x > -0.9 && B(drv.bones, 'calfL').rotation.x < -0.4);
  t('drive: hands rise to a wheel (arms further forward than seated)',
    B(drv.bones, 'upperArmR').rotation.x > B(bones, 'upperArmR').rotation.x + 0.2);
  t('drive: fall wrapper never engages',
    drv.driver.apply('drive', 0.016, 0.6, {}).fall === 0);
}

// Total function: a seated pose can never leak into the next state.
{
  const a = humanoidDriver();
  a.driver.apply('seated', 0.016, 0.5, {});
  a.driver.apply('idle', 0.016, 0.6, {});
  const b = humanoidDriver();
  b.driver.apply('idle', 0.016, 0.6, {});
  let same = true;
  for (const role of Object.keys(HUMANOID_BONE_MAP)) {
    const ra = B(a.bones, role).rotation;
    const rb = B(b.bones, role).rotation;
    if (!approx(ra.x, rb.x) || !approx(ra.y, rb.y) || !approx(ra.z, rb.z)) same = false;
  }
  t('seated -> idle restores the exact idle pose (total function)', same);
}

// ==================================================================
// 3. FLOOR SWEEP — the seated family's lowest point, kinematically
//    Standard humanoid chain (RIDER_REFERENCE proportions) driven
//    by the driver's REAL bone output, sampled over time: the
//    ankle (the leg chain's lowest joint; the foot mesh reaches
//    ~0.039H below it when level) never crosses the Step 6 floor
//    tolerance of -0.02 in wrapper units.
// ==================================================================
const FOOT_DROP_FRAC = 0.039; // foot thickness below the ankle
function legChain(driver, bones, H) {
  // forward kinematics in the figure's side plane (z = forward)
  const pelvisY = RIDER_REFERENCE.pelvisHeight * H;
  const Lt = RIDER_REFERENCE.thighLength * H;
  const Ls = RIDER_REFERENCE.shinLength * H;
  const thT = B(bones, 'thighL').rotation.x;
  const thC = B(bones, 'calfL').rotation.x;
  const knee = { y: pelvisY - Math.cos(thT) * Lt, z: Math.sin(thT) * Lt };
  const shinAbs = thT + thC;
  const ankle = { y: knee.y - Math.cos(shinAbs) * Ls, z: knee.z + Math.sin(shinAbs) * Ls };
  return { pelvis: { x: 0, y: pelvisY, z: 0 }, knee: { x: 0, ...knee }, ankle: { x: 0, ...ankle } };
}
{
  const H = LUGE_RIDER_PROC_SIZE.y;
  for (const pose of ['seated', 'drive']) {
    const { bones, driver } = humanoidDriver();
    let minAnkle = Infinity;
    let minLift = Infinity;
    let maxFall = 0;
    for (let i = 0; i <= 180; i++) {
      const now = i / 30;
      const out = driver.apply(pose, 1 / 30, now, {});
      const chain = legChain(driver, bones, H);
      minAnkle = Math.min(minAnkle, chain.ankle.y - FOOT_DROP_FRAC * H);
      minLift = Math.min(minLift, out.lift);
      maxFall = Math.max(maxFall, out.fall);
    }
    t(`floor sweep (${pose}): ankle minus foot never below -0.02`, minAnkle >= -0.02);
    t(`floor sweep (${pose}): lift >= 0 across the sweep`, minLift >= 0);
    t(`floor sweep (${pose}): fall stays 0 across the sweep`, maxFall === 0);
  }
}

// ==================================================================
// 4. Creature + rigless seated reads (no chair-sit for a raptor;
//    a settled crouch — and crucially, never the downed pose)
// ==================================================================
{
  const table = CREATURE_TABLES['q024-fang-raptor'];
  const names = [];
  for (const chain of Object.values(table)) {
    if (chain && chain.bones) names.push(...chain.bones);
  }
  const bones = fakeBones(names);
  const driver = createPoseDriver({
    kind: 'creature', bones, table, profile: movementProfile(null),
    weaponSide: 'R', size: { x: 2.2, y: 1.4, z: 0.8 },
  });
  let out;
  for (let i = 0; i < 30; i++) out = driver.apply('seated', 1 / 30, i / 30, {});
  t('creature seated: fall wrapper never engages', out.fall === 0);
  t('creature seated: lift >= 0', out.lift >= 0);
  const legBone = bones.get(table.legL.bones[1]);
  t('creature seated: leg chain folds (knee channel driven)', legBone.rotation.x !== 0);
  // and the downed pose is a different state entirely
  let koOut;
  for (let i = 0; i < 30; i++) koOut = driver.apply('ko', 1 / 30, 1 + i / 30, {});
  t('creature ko still falls (seated is not a leaked downed state)', koOut.fall > 0.5);
}
{
  const mesh = { position: { x: 0, y: -0.8, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 } };
  const driver = createPoseDriver({
    kind: 'rigless', bones: new Map(), profile: movementProfile(null),
    meshGroup: mesh, size: { x: 1, y: 1.6, z: 1 },
  });
  const out = driver.apply('seated', 0.016, 0.5, {});
  t('rigless seated: settles (squash below bind)', mesh.scale.y < 1);
  t('rigless seated: lift >= 0 and no fall', out.lift >= 0 && out.fall === 0);
  t('rigless seated: mesh bottom stays pinned to its floor line',
    approx(mesh.position.y, -0.8 * mesh.scale.y));
}

// ==================================================================
// 5. Shadow Realm plate identity: layout, resolution, draw
// ==================================================================
t('plate canvas keeps the 4:1 plate proportion',
  PLATE_CANVAS.width / PLATE_CANVAS.height === 4);
{
  const bare = plateLayout(false);
  t('name-only plate: centered name, no icon, full name length',
    bare.icon === null && bare.textAlign === 'center' && bare.maxName === 16
    && bare.textX === PLATE_CANVAS.width / 2);
  const withIcon = plateLayout(true);
  t('icon plate: icon box at the plate edge, name beside it',
    withIcon.icon && withIcon.icon.x === PLATE_ICON.x && withIcon.icon.size === PLATE_ICON.size
    && withIcon.textAlign === 'left' && withIcon.textX > PLATE_ICON.x + PLATE_ICON.size);
  t('plate names slice to the layout',
    plateNameFor('A very long rider name', false) === 'A very long ride'
    && plateNameFor('A very long rider name', true) === 'A very long r'
    && plateNameFor('', true) === 'Rider');
}
{
  const JASON = 'q002-jason-voorhees';
  const FREDDY = 'q001-freddy-krueger';
  t('beacon-stamped pick wins over the profile lookup',
    characterIdForBeacon({ char: FREDDY }, JASON) === FREDDY);
  t('long-form beacon pick also resolves',
    characterIdForBeacon({ characterId: JASON }, null) === JASON);
  t('no beacon pick: the profile lookup answers',
    characterIdForBeacon({}, JASON) === JASON);
  t('a garbage beacon pick never smuggles a character in',
    characterIdForBeacon({ char: 'q999-nobody' }, JASON) === JASON);
  t('no pick anywhere: name-only plate (null)',
    characterIdForBeacon({}, null) === null
    && characterIdForBeacon(null, 'q999-nobody') === null);
}
{
  // session cache: one fetch per rider, failures cached as null
  let calls = 0;
  const lookup = createProfileCharacterLookup({
    fetchFn: async (userId) => {
      calls++;
      if (userId === 'user-jason') return 'q002-jason-voorhees';
      if (userId === 'user-bogus') return 'q999-nobody';
      throw new Error('offline');
    },
  });
  const [a1, a2] = [await lookup.lookup('user-jason'), await lookup.lookup('user-jason')];
  t('lookup returns the roster-validated pick', a1 === 'q002-jason-voorhees' && a2 === a1);
  t('lookup caches per rider (one fetch for repeat riders)', calls === 1);
  t('lookup refuses a non-roster answer', (await lookup.lookup('user-bogus')) === null);
  t('lookup failure resolves null, never throws', (await lookup.lookup('user-down')) === null);
  const callsAfterFailures = calls;
  await lookup.lookup('user-down');
  t('lookup failures are cached (no fetch-per-beacon storm)', calls === callsAfterFailures);
  t('lookup ignores a missing user id', (await lookup.lookup('')) === null);
}
{
  // the draw itself, against a recording 2D context
  function fakeCtx() {
    const calls = [];
    return {
      calls,
      clearRect: (...a) => calls.push(['clearRect', ...a]),
      save: () => calls.push(['save']),
      restore: () => calls.push(['restore']),
      beginPath: () => calls.push(['beginPath']),
      arc: (...a) => calls.push(['arc', ...a]),
      clip: () => calls.push(['clip']),
      stroke: () => calls.push(['stroke']),
      drawImage: (...a) => calls.push(['drawImage', ...a]),
      fillText: (...a) => calls.push(['fillText', ...a]),
    };
  }
  const bare = fakeCtx();
  drawPlate(bare, { name: 'Merlin', color: '#ff3355', iconImage: null });
  t('name-only draw: no image, name centered',
    !bare.calls.some((c) => c[0] === 'drawImage')
    && bare.calls.some((c) => c[0] === 'fillText' && c[1] === 'Merlin' && c[2] === PLATE_CANVAS.width / 2));
  const withImg = fakeCtx();
  const img = { width: 256, height: 256 };
  drawPlate(withImg, { name: 'Merlin', color: '#ff3355', iconImage: img });
  const drawCall = withImg.calls.find((c) => c[0] === 'drawImage');
  t('icon draw: preview clipped into the icon box',
    withImg.calls.some((c) => c[0] === 'clip')
    && drawCall && drawCall[2] === PLATE_ICON.x && drawCall[3] === PLATE_ICON.y
    && drawCall[4] === PLATE_ICON.size);
  t('icon draw: name sits beside the icon',
    withImg.calls.some((c) => c[0] === 'fillText' && c[2] === plateLayout(true).textX));
}

// ==================================================================
// 6. The Luge mount: the seated rider lands ON the sled
// ==================================================================
t("the luge rider's pose is the driver's seated pose",
  LUGE_RIDER_POSE === 'seated' && DRIVER_POSES.has(LUGE_RIDER_POSE));
t('recline is a luge recline (40-60 degrees from vertical)',
  LUGE_RIDER_RECLINE > 0.7 && LUGE_RIDER_RECLINE < 1.05);
t('rider stature fits the sled (creature length cap inside 6)',
  LUGE_RIDER_PROC_SIZE.y >= 2 && LUGE_RIDER_PROC_SIZE.y <= 2.6);
{
  const origin = figurePointToSled({ x: 0, y: 0, z: 0 });
  t('mount transform: the figure floor origin lands at the mount position',
    approx(origin.x, LUGE_RIDER_MOUNT.position[0])
    && approx(origin.y, LUGE_RIDER_MOUNT.position[1])
    && approx(origin.z, LUGE_RIDER_MOUNT.position[2]));
  const fwd = figurePointToSled({ x: 0, y: 0, z: 1 });
  t('mount transform: figure-forward becomes sled-forward (-Z), tipped up by the recline',
    fwd.z < origin.z && fwd.y > origin.y);
}
{
  // The full sweep: real driver output -> FK chain -> mount ->
  // landing zones on the hull, sampled over time.
  const H = LUGE_RIDER_PROC_SIZE.y;
  const { bones, driver } = humanoidDriver();
  let pelvisOk = true;
  let feetOk = true;
  let headOk = true;
  let widthOk = true;
  for (let i = 0; i <= 90; i++) {
    driver.apply('seated', 1 / 30, i / 30, {});
    const chain = legChain(driver, bones, H);
    const pelvis = figurePointToSled(chain.pelvis);
    const ankle = figurePointToSled(chain.ankle);
    const headFig = {
      x: 0,
      y: chain.pelvis.y + RIDER_REFERENCE.torsoLength * H + 0.17 * H,
      z: chain.pelvis.z + 0.02 * H,
    };
    const head = figurePointToSled(headFig);
    // pelvis rests on the hull top, back-of-center
    if (!(pelvis.y >= LUGE_SLED_HULL.topY - 0.02 && pelvis.y <= LUGE_SLED_HULL.topY + 0.35)) pelvisOk = false;
    if (!(pelvis.z >= -0.5 && pelvis.z <= 1.2)) pelvisOk = false;
    // feet rest on the hull top in the front half — never through it
    if (!(ankle.y >= LUGE_SLED_HULL.topY - 0.02)) feetOk = false;
    if (!(ankle.z < 0.5 && ankle.z >= -LUGE_SLED_HULL.halfLength)) feetOk = false;
    // head up, back, and inside the sled
    if (!(head.y > pelvis.y && head.z <= LUGE_SLED_HULL.halfLength && head.z > pelvis.z)) headOk = false;
    if (Math.abs(pelvis.x) > LUGE_SLED_HULL.halfWidth) widthOk = false;
  }
  t('mount sweep: pelvis rests on the hull, back of center', pelvisOk);
  t('mount sweep: feet rest on the hull front, never through it', feetOk);
  t('mount sweep: head rides up and back, inside the sled', headOk);
  t('mount sweep: rider stays within the hull width', widthOk);
}

// ==================================================================
// 7. Source pins: the surfaces wire the identity + rider in, and
//    the physics / ghost-color laws are untouched
// ==================================================================
{
  const remote = readFileSync(new URL('../app/shadow-realm/RemoteBikes.jsx', import.meta.url), 'utf8');
  t('RemoteBikes draws plates through plate-identity',
    remote.includes("from '../../lib/shadow-realm/plate-identity'")
    && remote.includes('drawPlate(') && remote.includes('sharedProfileCharacterLookup'));
  t('RemoteBikes plate receives the resolved character',
    remote.includes('characterId={characterId}'));
  t('RemoteBikes: bike ghost colors still come from the user id',
    remote.includes('ghostColorFor(beacon.user_id)'));
  t('RemoteBikes: plate world size unchanged',
    remote.includes('scale={[7, 1.75, 1]}') && remote.includes('position={[0, 2.7, 0]}'));

  const luge = readFileSync(new URL('../app/luge/page.tsx', import.meta.url), 'utf8');
  t('Luge mounts the rider inside the sled group',
    luge.includes('<RiderFigure />')
    && luge.indexOf('<RiderFigure />') > luge.indexOf('boxGeometry args={[3.2, 0.2, 6.2]}'));
  t("Luge rider resolves through the pick chain (surface 'luge')",
    luge.includes("resolveSurfaceCharacter('luge')"));
  t('Luge rider is driven in the seated pose via the shared mount',
    luge.includes('LUGE_RIDER_POSE') && luge.includes('LUGE_RIDER_MOUNT')
    && luge.includes('createEmbodimentScene'));
  t('Luge tilt physics untouched (steering + ride radius intact)',
    luge.includes('steerAngle(tubeAngle.current, tiltData.current.x, delta)')
    && luge.includes('RIDE_RADIUS'));
}

console.log(`\ncharacters-riders: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
