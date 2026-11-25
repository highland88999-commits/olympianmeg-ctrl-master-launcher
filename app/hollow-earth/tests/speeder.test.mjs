// Hollow Earth speeder: the Jupiter 2 landspeeder as a rideable vehicle
// on the inner sphere — GLB + fit, the 3D drive step on the real terrain,
// heading that never degenerates, J2's speed, a parked dismount, and the
// SUMMON / DISMOUNT orb wiring in the HUD.
// Run: node app/hollow-earth/tests/speeder.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  LANDSPEEDER_GLB_URL,
  LANDSPEEDER_NATIVE_SIZE_M,
  LANDSPEEDER_FIT_LENGTH_M,
  LANDSPEEDER_BASE_Y_M,
  LANDSPEEDER_YAW_FIX,
  SPEEDER_SPEED,
  SPEEDER_TURN_RATE_RAD_S,
  SPEEDER_ACCEL_M_S2,
  SPEEDER_BOOST_MULT,
  SPEEDER_REVERSE_FRACTION,
  SPEEDER_MOUNTED_EYE_M,
  SPEEDER_SEAT_LIFT_M,
  SPEEDER_DISMOUNT_SIDE_M,
  createSpeederState,
  isSpeederDriving,
  summonSpeeder,
  dismountSpeeder,
  resyncSpeeder,
  stepSpeeder,
  speederFeet,
  speederGroundRadius,
  speederSphereState,
} from '../speeder.js';
import {
  SPHERE_R,
  spherePointFromDeck,
  groundRadiusAt,
  frameFromRef,
} from '../../../lib/hollow-earth/planet.js';
import { SPEEDER_SPEED as J2_SPEEDER_SPEED } from '../../../lib/jupiter2/profile.js';
import {
  LANDSPEEDER_GLB_URL as J2_GLB_URL,
  LANDSPEEDER_FIT_LENGTH_M as J2_FIT_LENGTH_M,
  LANDSPEEDER_NATIVE_SIZE_M as J2_NATIVE_SIZE_M,
} from '../../../lib/jupiter2/meshes.js';

// Rolling terrain, ±3.4 m like the realm's own undulation — the
// drive must ride it, not the flat chart.
const heightAt = (x, z) => 3 * Math.sin(x * 0.02) * Math.cos(z * 0.017) + 0.4 * Math.sin(x * 0.11 + z * 0.07);
const FLAT = () => 0;
const DT = 0.05;

function summonAt(x = 0, z = 155, yaw = 0) {
  const s = createSpeederState();
  summonSpeeder(s, { x, z, yaw }, heightAt);
  return s;
}

test("GLB URL + fit are Jupiter 2's own — same craft, same numbers", () => {
  assert.equal(LANDSPEEDER_GLB_URL, '/models/star-wars/landspeeder.glb');
  assert.equal(LANDSPEEDER_GLB_URL, J2_GLB_URL);
  assert.equal(LANDSPEEDER_FIT_LENGTH_M, 4.4);
  assert.equal(LANDSPEEDER_FIT_LENGTH_M, J2_FIT_LENGTH_M);
  assert.deepEqual(LANDSPEEDER_NATIVE_SIZE_M, { x: 0.6674, y: 0.2352, z: 0.9772 });
  assert.deepEqual(LANDSPEEDER_NATIVE_SIZE_M, J2_NATIVE_SIZE_M);
  assert.equal(LANDSPEEDER_BASE_Y_M, 0.27);
  assert.equal(LANDSPEEDER_YAW_FIX, Math.PI);
  // The fitted top (base + fitted height) stays below the mounted eye.
  const scale = LANDSPEEDER_FIT_LENGTH_M / Math.max(LANDSPEEDER_NATIVE_SIZE_M.x, LANDSPEEDER_NATIVE_SIZE_M.z);
  const topY = LANDSPEEDER_BASE_Y_M + LANDSPEEDER_NATIVE_SIZE_M.y * scale;
  assert.ok(topY < SPEEDER_MOUNTED_EYE_M, `fitted top ${topY} must clear the mounted eye ${SPEEDER_MOUNTED_EYE_M}`);
  assert.ok(topY < 2.4 + SPEEDER_SEAT_LIFT_M, 'fitted top must clear the Hollow Earth driving eye too');
});

test("speed is Jupiter 2's speed — 28 m/s, boost x1.5, reverse 0.4x", () => {
  assert.equal(SPEEDER_SPEED, 28);
  assert.equal(SPEEDER_SPEED, J2_SPEEDER_SPEED);
  assert.equal(SPEEDER_BOOST_MULT, 1.5);
  assert.equal(SPEEDER_REVERSE_FRACTION, 0.4);
  assert.equal(SPEEDER_TURN_RATE_RAD_S, 2.2);
  assert.equal(SPEEDER_ACCEL_M_S2, 40);
  const s = summonAt();
  // Ramps to top speed, never past it.
  for (let i = 0; i < 40; i++) stepSpeeder(s, { fwd: 1 }, DT, { heightAt });
  assert.ok(Math.abs(s.speed - 28) < 1e-9, `top speed ${s.speed}`);
  // Boost is 42, reverse is -11.2.
  for (let i = 0; i < 40; i++) stepSpeeder(s, { fwd: 1, boost: true }, DT, { heightAt });
  assert.ok(Math.abs(s.speed - 42) < 1e-9, `boost speed ${s.speed}`);
  for (let i = 0; i < 80; i++) stepSpeeder(s, { back: 1 }, DT, { heightAt });
  assert.ok(Math.abs(s.speed - (-11.2)) < 1e-9, `reverse speed ${s.speed}`);
  // A parked speeder does not move.
  const parked = createSpeederState();
  assert.equal(stepSpeeder(parked, { fwd: 1 }, DT, { heightAt }), 0);
  assert.equal(parked.speed, 0);
});

test('the drive step stays on the terrain over a long drive', () => {
  const s = summonAt(-120, 80, 0.6);
  for (let i = 0; i < 1200; i++) { // 60 s at full throttle, ~1.7 km
    stepSpeeder(s, { fwd: 1, steer: 0.15 }, DT, { heightAt });
    if (i % 10 === 0) {
      const feet = speederFeet(s);
      const r = Math.hypot(feet.x, feet.y, feet.z);
      const groundR = groundRadiusAt(feet, heightAt);
      assert.ok(Math.abs(r - groundR) < 1e-6, `step ${i}: feet radius ${r} off ground ${groundR}`);
      assert.equal(speederGroundRadius(s, heightAt), groundR);
    }
  }
  assert.ok(Math.abs(s.speed - 28) < 1e-9);
});

test('heading never degenerates over a full great-circle drive', () => {
  const s = summonAt(0, 0, 0);
  const start = { x: s.x, z: s.z };
  const circumference = 2 * Math.PI * SPHERE_R; // ~2400 m
  let worstDeg = 0;
  let travelled = 0;
  let prevFeet = speederFeet(s);
  let prevForward = frameFromRef(prevFeet, s.ref, s.yaw).forward;
  // Drive until the travelled surface distance closes the circle —
  // the step count is not fixed up front, because the speed ramp
  // covers less ground than top speed would.
  for (let i = 0; travelled < circumference && i < 4000; i++) {
    stepSpeeder(s, { fwd: 1 }, DT, { heightAt: FLAT });
    const feet = speederFeet(s);
    assert.ok(Number.isFinite(feet.x) && Number.isFinite(feet.y) && Number.isFinite(feet.z), `step ${i}: feet went non-finite`);
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z), `step ${i}: deck went non-finite`);
    // The step's displacement must stay aligned with the heading
    // it stepped along — a flip would read as a wide angle here.
    const dx = feet.x - prevFeet.x;
    const dy = feet.y - prevFeet.y;
    const dz = feet.z - prevFeet.z;
    const len = Math.hypot(dx, dy, dz);
    travelled += len;
    if (len > 1e-9) {
      const dot = (dx * prevForward.x + dy * prevForward.y + dz * prevForward.z) / len;
      const deg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
      worstDeg = Math.max(worstDeg, deg);
    }
    prevFeet = feet;
    prevForward = frameFromRef(feet, s.ref, s.yaw).forward;
  }
  // Straight-ahead the whole way: every step within a degree of
  // its heading — the J2 antipode failure (83.7°) cannot recur.
  assert.ok(worstDeg < 1, `worst step/heading angle ${worstDeg}°`);
  // A great circle closes: the loop comes back near the start
  // (within one step of overshoot past the circumference).
  const closed = Math.hypot(s.x - start.x, s.z - start.z);
  assert.ok(closed < 5, `great-circle closure error ${closed} m after ${travelled.toFixed(1)} m travelled`);
});

test('steering turns the craft and the stick steers proportionally', () => {
  const s = summonAt(0, 155, 0);
  for (let i = 0; i < 20; i++) stepSpeeder(s, { fwd: 1, steer: 1 }, DT, { heightAt: FLAT });
  assert.ok(s.yaw > 0, 'steer +1 (full left) turns yaw positive — Hollow Earth yaw+ is left');
  assert.ok(Math.abs(s.yaw - SPEEDER_TURN_RATE_RAD_S * 1) < 1e-9, `full-left yaw ${s.yaw}`);
  const gentle = summonAt(0, 155, 0);
  for (let i = 0; i < 20; i++) stepSpeeder(gentle, { fwd: 1, steer: 0.5 }, DT, { heightAt: FLAT });
  assert.ok(Math.abs(gentle.yaw - s.yaw / 2) < 1e-9, 'half stick turns at half rate');
  const keys = summonAt(0, 155, 0);
  for (let i = 0; i < 20; i++) stepSpeeder(keys, { fwd: 1, left: true }, DT, { heightAt: FLAT });
  assert.ok(Math.abs(keys.yaw - s.yaw) < 1e-9, 'left key turns at full rate when no steer is given');
});

test('summon auto-mounts at the walker; dismount parks the craft beside it', () => {
  const s = createSpeederState();
  assert.equal(isSpeederDriving(s), false);
  summonSpeeder(s, { x: 10, z: -40, yaw: 1.2 }, heightAt);
  assert.equal(isSpeederDriving(s), true);
  assert.equal(s.x, 10);
  assert.equal(s.z, -40);
  assert.equal(s.yaw, 1.2);
  const feet = speederFeet(s);
  const expected = spherePointFromDeck(10, -40, heightAt);
  assert.ok(Math.abs(feet.x - expected.x) < 1e-9 && Math.abs(feet.y - expected.y) < 1e-9 && Math.abs(feet.z - expected.z) < 1e-9);
  // Drive it somewhere, then get off.
  for (let i = 0; i < 100; i++) stepSpeeder(s, { fwd: 1 }, DT, { heightAt });
  const parked = { x: s.x, z: s.z, yaw: s.yaw };
  const pose = dismountSpeeder(s, heightAt);
  assert.equal(isSpeederDriving(s), false);
  assert.equal(s.summoned, true, 'dismount parks — the craft stays summoned, it does not vanish (J2 vanishes; HE parks)');
  assert.equal(s.x, parked.x);
  assert.equal(s.z, parked.z);
  assert.equal(s.yaw, parked.yaw);
  // The walker lands on the flank, on real ground, clear of the craft.
  const flank = Math.hypot(pose.x - parked.x, pose.z - parked.z);
  assert.ok(Math.abs(flank - SPEEDER_DISMOUNT_SIDE_M) < 1e-9, `flank distance ${flank}`);
  assert.equal(pose.yaw, parked.yaw);
  const groundR = groundRadiusAt(spherePointFromDeck(pose.x, pose.z, heightAt), heightAt);
  assert.ok(Math.abs(Math.hypot(...Object.values(spherePointFromDeck(pose.x, pose.z, heightAt))) - groundR) < 1e-6, 'dismount pose sits on the terrain');
  // SUMMON brings the parked craft back to the walker.
  summonSpeeder(s, { x: -200, z: 300, yaw: -0.5 }, heightAt);
  assert.equal(isSpeederDriving(s), true);
  assert.equal(s.x, -200);
  assert.equal(s.z, 300);
});

test('resync keeps the heading after a collider push-out', () => {
  const s = summonAt(0, 155, 0.8);
  for (let i = 0; i < 40; i++) stepSpeeder(s, { fwd: 1 }, DT, { heightAt });
  const before = frameFromRef(speederFeet(s), s.ref, s.yaw).forward;
  // A 3 m push sideways, as the walker's push-out would do.
  resyncSpeeder(s, s.x + 3, s.z, heightAt);
  const after = frameFromRef(speederFeet(s), s.ref, s.yaw).forward;
  const dot = before.x * after.x + before.y * after.y + before.z * after.z;
  assert.ok(dot > 0.999, `heading survived the push (dot ${dot})`);
  const sphereState = speederSphereState(s);
  assert.ok(sphereState && sphereState.grounded && sphereState.h === 0);
  assert.equal(sphereState.deck.x, s.x);
  assert.equal(sphereState.deck.z, s.z);
});

test('HUD wiring: SUMMON + DISMOUNT orbs, JUMP hidden while driving', () => {
  const page = readFileSync(new URL('../page.jsx', import.meta.url), 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
  const code = strip(page);
  // The page imports the pure module and J2's GLB builder — the
  // loader is reused, not re-written.
  assert.match(code, /from '\.\/speeder'/);
  assert.match(code, /buildSpeeder/);
  assert.match(code, /from '\.\.\/\.\.\/lib\/jupiter2\/meshes'/);
  // SUMMON shows on foot only (no prompt, no mount, not driving);
  // DISMOUNT shows while driving; both ride the shared MOUNT_SLOT
  // — one orb in the slot at a time, never two.
  assert.match(code, /fn="summon"[^>]*ariaLabel="Summon speeder"/);
  assert.match(code, /fn="dismount"[^>]*ariaLabel="Dismount speeder"/);
  assert.match(code, /\{!mounted && !speederDriving && !mountPrompt && \(/);
  assert.match(code, /\{speederDriving && \(/);
  assert.match(code, /style=\{MOUNT_SLOT\}/);
  // JUMP is hidden while driving (and the tick still swallows a
  // Space press while driving, like the mount path).
  assert.match(code, /\{!speederDriving && \(\s*<OrbButton fn="jump"/);
  assert.match(code, /if \(ride \|\| driving\) \{ keys\.consumeJump\(\); jumpRef\.current = false; \}/);
  // Summon refuses while monster-mounted; mounting refuses while
  // driving — never both at once.
  assert.match(code, /if \(rideRef\.current \|\| speederRef\.current\.mounted\) return;/);
  assert.match(code, /if \(!m \|\| rideRef\.current \|\| speederRef\.current\.mounted\) return;/);
  // Strikes from the saddle are suppressed inside a sanctuary.
  assert.match(code, /isSpeederDriving\(speederRef\.current\) && inSanctuaryAt\(walker\.pos\.x, walker\.pos\.z\)/);
});
