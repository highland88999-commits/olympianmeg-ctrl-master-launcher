// tests/characters-driving.test.mjs — headless tests for the
// DRIVING EMBODIMENT follow-up wave of the characters-everywhere
// program: the driver mount contract (lib/gta/driver-embodiment.js),
// the walker adapter's in-vehicle mount (lib/gta/walker-embodiment.js),
// and the Skyscraper Lightcycle rider swap (NexusEngine.jsx).
// Merlin's directive: "make sure they live in all character
// enabled games" — Wave 1 embodied the walkers on foot and Wave 2
// Skyscraper's hero on foot; driving was the deferred half in
// both, waiting on Wave 6's 'drive' pose. This is that half.
// Run: node tests/characters-driving.test.mjs (from the repo root).
// No browser, no network: fake bones drive the real pose driver,
// an injectable embodiment scene exercises the adapter's ready
// path, and the mount sweep runs the driver's real 'drive' output
// through the real mount transform.
import fs from 'node:fs';
import * as THREE from 'three';
import {
  HUMANOID_BONE_MAP, createPoseDriver, movementProfile,
} from '../lib/kombat/pose-driver.js';
import { DRIVER_POSES } from '../lib/characters/character-glb.js';
import {
  DRIVER_POSE, DRIVER_FIGURE_HEIGHT, DRIVER_MOUNT, DRIVER_REFERENCE,
  GTA_CAR_INTERIOR, figurePointToCar, vehicleMountable, driverShowing,
} from '../lib/gta/driver-embodiment.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const JASON = 'q002-jason-voorhees';
const FREDDY = 'q001-freddy-krueger';
const C = GTA_CAR_INTERIOR;
const R = DRIVER_REFERENCE;

// ==================================================================
// 1. The mount contract: data the worlds' cars are actually built
// ==================================================================
t("the driver's pose is the pose driver's 'drive'", DRIVER_POSE === 'drive'
  && DRIVER_POSES.has(DRIVER_POSE));
t('the mount is derived for the walker stature (capsule height 2.0)',
  DRIVER_FIGURE_HEIGHT === 2.0);
t('mount puts the figure floor so the pelvis lands on the cushion',
  approx(DRIVER_MOUNT.position[1], C.cushionY - R.pelvisHeight * DRIVER_FIGURE_HEIGHT));
t('mount sits on the driver side, at the cushion',
  DRIVER_MOUNT.position[0] === C.driverX && DRIVER_MOUNT.position[2] === C.cushionZ);
t('the interior spec matches the shared car (body 2 x 0.8 x 4.2, cabin 1.7 x 0.6 x 2.0)',
  C.bodyTopY === 1.0 && C.cabinTopY === 1.5 && C.halfWidth === 0.85 && C.halfLength === 2.1);
{
  const o = figurePointToCar({ x: 0, y: 0, z: 0 });
  t('mount transform: the figure floor origin lands at the mount position',
    approx(o.x, DRIVER_MOUNT.position[0]) && approx(o.y, DRIVER_MOUNT.position[1])
    && approx(o.z, DRIVER_MOUNT.position[2]));
  const f = figurePointToCar({ x: 0.5, y: 1.25, z: -0.75 });
  t('mount transform is a pure translation (no rotation, no scale — no pop on enter/exit)',
    approx(f.x, 0.5 + DRIVER_MOUNT.position[0]) && approx(f.y, 1.25 + DRIVER_MOUNT.position[1])
    && approx(f.z, -0.75 + DRIVER_MOUNT.position[2]));
}

// ==================================================================
// 2. Vehicle + showing matrices (pure)
// ==================================================================
t('a real vehicle state mounts', vehicleMountable({ x: 1, z: -2, heading: 0.5 }) === true);
t('no vehicle never mounts', vehicleMountable(null) === false && vehicleMountable(undefined) === false);
t('a vehicle without numbers never mounts',
  vehicleMountable({}) === false && vehicleMountable({ x: 1, z: 2 }) === false
  && vehicleMountable({ x: NaN, z: 2, heading: 0 }) === false
  && vehicleMountable({ x: 1, z: 2, heading: 'east' }) === false);
t('driver showing: ready live GLB + mountable vehicle = seated',
  driverShowing({ hasHandle: true, ready: true, liveGlb: true, inVehicle: true, mountable: true, hidden: false }) === true);
t('driver showing: not ready = capsule',
  driverShowing({ hasHandle: true, ready: false, liveGlb: true, inVehicle: true, mountable: true, hidden: false }) === false);
t('driver showing: a billboard stand-in is never seated',
  driverShowing({ hasHandle: true, ready: true, liveGlb: false, inVehicle: true, mountable: true, hidden: false }) === false);
t('driver showing: unmountable vehicle = capsule',
  driverShowing({ hasHandle: true, ready: true, liveGlb: true, inVehicle: true, mountable: false, hidden: false }) === false);
t('driver showing: world-hidden (train ride) = nothing',
  driverShowing({ hasHandle: true, ready: true, liveGlb: true, inVehicle: true, mountable: true, hidden: true }) === false);
t('driver showing: on foot is not the driver question',
  driverShowing({ hasHandle: true, ready: true, liveGlb: true, inVehicle: false, mountable: false, hidden: false }) === false);
t('driver showing: empty state = capsule', driverShowing() === false && driverShowing({}) === false);

// ==================================================================
// 3. FLOOR SWEEP — the real 'drive' pose through the real mount.
//    Reference chains (DRIVER_REFERENCE proportions) driven by
//    the pose driver's REAL bone output, sampled over time:
//    pelvis on the cushion, feet on the pedals above the car
//    floor, hands on the wheel's upper arc, head over the
//    roofline by less than the native capsule's 0.5.
// ==================================================================
const FOOT_DROP_FRAC = 0.039; // foot thickness below the ankle
function fakeBones(names) {
  const m = new Map();
  for (const n of names) {
    m.set(n, { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 1, z: 0 } });
  }
  return m;
}
const B = (bones, role) => bones.get(HUMANOID_BONE_MAP[role]);
function seg(th, L) { return { y: -Math.cos(th) * L, z: Math.sin(th) * L }; }
function driveChain(bones, H) {
  const pelvisY = R.pelvisHeight * H;
  const pelvis = { x: 0, y: pelvisY, z: 0 };
  const thT = B(bones, 'thighL').rotation.x;
  const thC = B(bones, 'calfL').rotation.x;
  const kneeS = seg(thT, R.thighLength * H);
  const knee = { x: 0, y: pelvisY + kneeS.y, z: kneeS.z };
  const ankS = seg(thT + thC, R.shinLength * H);
  const ankle = { x: 0, y: knee.y + ankS.y, z: knee.z + ankS.z };
  const headTop = {
    x: 0, y: pelvisY + (R.torsoLength + R.headLength) * H, z: 0.02 * H,
  };
  const hands = {};
  for (const side of ['R', 'L']) {
    const sh = {
      x: (side === 'R' ? 1 : -1) * R.shoulderHalfWidth * H,
      y: pelvisY + R.shoulderRise * H, z: 0,
    };
    const ua = B(bones, 'upperArm' + side).rotation.x;
    const fa = B(bones, 'foreArm' + side).rotation.x;
    const e1 = seg(ua, R.upperArmLength * H);
    const e2 = seg(ua + fa, R.forearmLength * H);
    hands[side] = { x: sh.x, y: sh.y + e1.y + e2.y, z: sh.z + e1.z + e2.z };
  }
  return { pelvis, knee, ankle, headTop, hands };
}
{
  const H = DRIVER_FIGURE_HEIGHT;
  const bones = fakeBones(Object.values(HUMANOID_BONE_MAP));
  const driver = createPoseDriver({
    kind: 'humanoid', bones, profile: movementProfile(null),
    weaponSide: 'R', size: { x: 0.9, y: 1.9, z: 0.5 },
  });
  let pelvisOk = true;
  let feetOk = true;
  let kneeOk = true;
  let headOk = true;
  let handsOk = true;
  let widthOk = true;
  let minLift = Infinity;
  let maxFall = 0;
  for (let i = 0; i <= 180; i++) {
    const out = driver.apply('drive', 1 / 30, i / 30, {});
    minLift = Math.min(minLift, out.lift);
    maxFall = Math.max(maxFall, out.fall);
    const ch = driveChain(bones, H);
    const pelvis = figurePointToCar(ch.pelvis);
    const knee = figurePointToCar(ch.knee);
    const ankle = figurePointToCar(ch.ankle);
    const head = figurePointToCar(ch.headTop);
    // pelvis rests on the cushion, on the driver's side
    if (!(pelvis.y >= C.cushionY - 0.02 && pelvis.y <= C.cushionY + 0.1)) pelvisOk = false;
    if (!(Math.abs(pelvis.z - C.cushionZ) <= 0.2)) pelvisOk = false;
    if (!approx(pelvis.x, C.driverX)) pelvisOk = false;
    // feet reach the pedals: forward of the cushion, in the
    // footwell, the foot never crossing the car floor
    if (!(ankle.y - FOOT_DROP_FRAC * H >= C.carFloorY - 0.02)) feetOk = false;
    if (!(ankle.z > C.cushionZ + 0.4 && ankle.z <= C.wheelZ + 0.25)) feetOk = false;
    // knees bent up ahead of the pelvis, inside the body
    if (!(knee.y > C.carFloorY + 0.3 && knee.z > pelvis.z)) kneeOk = false;
    // head over the roofline — present, like the native capsule,
    // but by LESS than the capsule's 0.5
    if (!(head.y > C.cabinTopY && head.y <= C.cabinTopY + 0.5)) headOk = false;
    // hands grip the wheel's upper arc: at the wheel, straddling
    // its centre from the driver's seat
    for (const side of ['R', 'L']) {
      const hand = figurePointToCar(ch.hands[side]);
      if (!(Math.abs(hand.z - C.wheelZ) <= 0.3)) handsOk = false;
      if (!(hand.y >= C.wheelY + 0.2 && hand.y <= C.cabinTopY + 0.25)) handsOk = false;
      if (!(Math.abs(hand.x - C.driverX) <= 0.3)) handsOk = false;
    }
    // the whole driven figure stays within the cabin width
    for (const p of [pelvis, knee, ankle, head,
      figurePointToCar(ch.hands.R), figurePointToCar(ch.hands.L)]) {
      if (Math.abs(p.x) > C.halfWidth) widthOk = false;
    }
  }
  t('mount sweep: pelvis rests on the cushion, driver side', pelvisOk);
  t('mount sweep: feet on the pedals, never through the car floor', feetOk);
  t('mount sweep: knees up ahead of the pelvis', kneeOk);
  t('mount sweep: head over the roofline by less than the capsule', headOk);
  t("mount sweep: hands grip the wheel's upper arc", handsOk);
  t('mount sweep: the figure stays within the cabin width', widthOk);
  t('mount sweep: lift >= 0 and fall stays 0 across the sweep',
    minLift >= 0 && maxFall === 0);
}

// ==================================================================
// 4. The adapter in-vehicle: one handle, two homes (injected
//    embodiment scene, ready path) + the fallback matrix
// ==================================================================
globalThis.fetch = () => Promise.reject(new Error('offline (test stub)'));
const { createWalkerEmbodiment, capsuleProcSize } = await import(
  '../lib/gta/walker-embodiment.js'
);
function fakePlayer(over) {
  return {
    x: 3, z: -7, y: 0, vx: 0, vz: 0, vy: 0, radius: 0.6,
    heading: 1.25, grounded: true, inVehicle: null, health: 100,
    moving: false, sprinting: false, ...(over || {}),
  };
}
const fakeVehicle = (over) => ({
  type: 'sedan', x: 40, z: 25, heading: -0.7, speed: 12, ...(over || {}),
});
function controllableScene() {
  const calls = [];
  const state = { ready: true, live: true, disposed: 0 };
  return {
    calls, state,
    attach({ characterId }) {
      const group = new THREE.Group();
      group.name = `fake-${characterId}`;
      return {
        characterId, kind: state.live ? 'glb' : 'billboard', group,
        ready: Promise.resolve(state.ready),
        isReady: () => state.ready,
        isLiveGlb: () => state.live,
        update(pose, dt, now, ctx) { calls.push({ characterId, pose, ctx }); },
        dispose() { state.disposed++; },
      };
    },
    prefetch() {},
  };
}
{
  const emb = controllableScene();
  const scene = new THREE.Scene();
  const w = createWalkerEmbodiment({
    scene, surface: 'mega-city', characterId: JASON,
    procSize: capsuleProcSize(0.5, 1.0), embodimentScene: emb,
  });
  const handleGroup = () => [...w.group.children, ...w.seat.children]
    .find((c) => c.name && c.name.startsWith('fake-'));
  t('on foot: the embodiment shows at the walker root',
    w.update(fakePlayer(), 0.016, 1.0, {}) === true
    && handleGroup().parent === w.group && w.seat.visible === false);
  // ENTER: the same handle moves into the seat, anchor pins to
  // the vehicle, the drive pose flows
  const veh = fakeVehicle();
  const callsBefore = emb.calls.length;
  t('enter: update shows the seated embodiment',
    w.update(fakePlayer({ inVehicle: veh }), 0.016, 1.1, {}) === true
    && w.group.visible === true && w.seat.visible === true);
  t('enter: the handle reparents into the seat (one body, new home)',
    handleGroup().parent === w.seat);
  t('enter: the anchor pins to the vehicle, not the player',
    w.group.position.x === 40 && w.group.position.z === 25
    && Math.abs(w.group.rotation.y - (-0.7)) < 1e-9);
  t("enter: the 'drive' pose flows to the driver",
    emb.calls.length > callsBefore && emb.calls[emb.calls.length - 1].pose === 'drive');
  t('driving: the seat carries the mount offset',
    approx(w.seat.position.y, DRIVER_MOUNT.position[1])
    && approx(w.seat.position.x, DRIVER_MOUNT.position[0]));
  // the car moves; the seated figure rides it
  veh.x = 55; veh.z = 30; veh.heading = 0.3;
  w.update(fakePlayer({ inVehicle: veh }), 0.016, 1.2, {});
  t('driving: the anchor rides the vehicle as it moves',
    w.group.position.x === 55 && w.group.position.z === 30
    && Math.abs(w.group.rotation.y - 0.3) < 1e-9
    && handleGroup().parent === w.seat);
  // EXIT: the handle comes home to the anchor root, walking poses
  t('exit: the embodiment shows on foot again, handle back at the root',
    w.update(fakePlayer({ moving: true }), 0.016, 1.3, {}) === true
    && handleGroup().parent === w.group && w.seat.visible === false
    && emb.calls[emb.calls.length - 1].pose === 'walk');
  t('exit: the anchor tracks the walker again',
    w.group.position.x === 3 && w.group.position.z === -7);
  // ENTER AGAIN: transitions repeat cleanly
  t('re-enter: seated again, same handle',
    w.update(fakePlayer({ inVehicle: fakeVehicle() }), 0.016, 1.4, {}) === true
    && handleGroup().parent === w.seat
    && emb.calls[emb.calls.length - 1].pose === 'drive');
  // swap characters mid-drive: the new handle seats on the
  // next frame, still one body
  t('swap while driving: validated and seated next frame',
    w.setCharacter(FREDDY) === true
    && w.update(fakePlayer({ inVehicle: fakeVehicle() }), 0.016, 1.5, {}) === true
    && handleGroup().name === 'fake-' + FREDDY
    && handleGroup().parent === w.seat);
  w.update(fakePlayer(), 0.016, 1.6, {});
  w.dispose();
  t('dispose after driving disposes the live handle', emb.state.disposed >= 2);
}
{
  // fallback matrix over the same adapter
  const emb = controllableScene();
  const scene = new THREE.Scene();
  const w = createWalkerEmbodiment({
    scene, surface: 'truman', characterId: JASON,
    procSize: capsuleProcSize(0.5, 1.0), embodimentScene: emb,
  });
  emb.state.ready = false;
  t('not ready + driving = capsule (fallback law)',
    w.update(fakePlayer({ inVehicle: fakeVehicle() }), 0.016, 2.0, {}) === false
    && w.group.visible === false);
  emb.state.ready = true;
  emb.state.live = false; // a billboard stand-in
  t('billboard + driving = capsule (a stand-in is never seated)',
    w.update(fakePlayer({ inVehicle: fakeVehicle() }), 0.016, 2.1, {}) === false);
  emb.state.live = true;
  t('hidden + driving = nothing (train-ride rule)',
    w.update(fakePlayer({ inVehicle: fakeVehicle() }), 0.016, 2.2, { hidden: true }) === false);
  t('unmountable vehicle = capsule',
    w.update(fakePlayer({ inVehicle: { speed: 3 } }), 0.016, 2.3, {}) === false);
  w.dispose();
  const bare = createWalkerEmbodiment({
    scene, surface: 'truman', characterId: null,
    procSize: capsuleProcSize(0.5, 1.0), embodimentScene: controllableScene(),
  });
  t('no pick + driving = capsule, exactly as before this wave',
    bare.update(fakePlayer({ inVehicle: fakeVehicle() }), 0.016, 2.4, {}) === false
    && bare.hasHandle() === false);
  bare.dispose();
}

// ==================================================================
// 5. Source wiring — the worlds inherit the mount through the
//    shared adapter; Skyscraper swaps its rider the same way
// ==================================================================
{
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const walker = read('lib/gta/walker-embodiment.js');
  t('the walker adapter owns the seat mount (imports the contract)',
    walker.includes("from './driver-embodiment.js'")
    && walker.includes('DRIVER_POSE') && walker.includes('seat.add(handle.group)'));
  const worlds = [
    'app/mega-city/gta-scene.js', 'app/truman/gta-scene.js', 'app/babel/gta-scene.js',
  ];
  // Mega City + Babel build cars through the shared builder (lib/gta/city-cgi.js
  // buildVehicleMesh); Truman still builds them inline in its scene. The
  // geometry lives in exactly one of those two places — never nowhere.
  const sharedBuilder = read('lib/gta/city-cgi.js');
  for (const p of worlds) {
    const src = read(p);
    const viaShared = src.includes('buildVehicleMesh')
      && sharedBuilder.includes('new THREE.BoxGeometry(isSports ? 1.9 : 2, isSports ? 0.65 : 0.8, isSports ? 4.4 : 4.2)')
      && sharedBuilder.includes('new THREE.BoxGeometry(1.7, 0.6, 2.0)')
      && sharedBuilder.includes('cabin.position.set(0, 1.2, -0.2)');
    const inline = src.includes('new THREE.BoxGeometry(2, 0.8, 4.2)')
      && src.includes('new THREE.BoxGeometry(1.7, 0.6, 2.0)')
      && src.includes('cabin.position.set(0, 1.2, -0.2)');
    t(`${p}: builds the shared interior the contract describes`, viaShared || inline);
    t(`${p}: driving embodiment arrives via the adapter alone (no scene-local mount)`,
      src.includes('walker.update(player, dt, now / 1000')
      && !src.includes('driver-embodiment'));
  }
  t('the logic bodies are untouched (radius 0.6, vehicle specs intact)',
    read('lib/gta/player.js').includes('radius: 0.6')
    && read('lib/gta/vehicle.js').includes('maxSpeed: 32'));
  const engine = read('app/skyscraper/components/NexusEngine.jsx');
  t('Skyscraper: the self host rides the active Lightcycle while ready',
    engine.includes('riderHost={selfHost}') && engine.includes('riderReady={selfReady}')
    && engine.includes('<primitive object={riderHost} />'));
  t("Skyscraper: the rider is posed 'drive' in the frame loop",
    engine.includes("selfHandleNow.update('drive', dt, state.clock.elapsedTime, {});"));
  t('Skyscraper: the bespoke rider remains the fallback in the same seat',
    engine.includes('<DeadpoolAvatar isDriving={true} velocity={1} />')
    && engine.includes('scale={[3.5, 3.5, 3.5]}')
    && engine.includes('position={[0, -0.2, 0]} rotation={[0.4, 0, 0]}'));
  t('Skyscraper: the walking embodiment is untouched (FREE_ROAM avatar group intact)',
    engine.includes("animState === 'FREE_ROAM'")
    && engine.includes('<primitive object={selfHost} />'));
  t('no chess paths are touched by this wave (Merlin\'s standing order)',
    !walker.includes('chess') && !engine.includes('chess')
    && !read('lib/gta/driver-embodiment.js').includes('chess'));
}

console.log(`\ncharacters-driving: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
