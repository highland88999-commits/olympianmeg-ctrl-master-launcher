// tests/joystick-sign.test.mjs — joystick left/right sign, every consumer.
//
// Merlin, Nov 16, 2026: "pulling the joy stick right goes right,
// pulling joystick left goes left... no inversion."
//
// Rule pinned here: stick right (x +1) moves/steers the player to
// the SCREEN-right, stick left to the screen-left — in every world,
// for every stick. "Screen-right" is always derived from the
// camera that shows the motion (forward x up), never assumed from
// a variable name: several engines call a left turn "steer +1"
// (Omega 500, Earth 2 vehicles, stepFlight) and several call a
// right turn "steer +1" (hub bike, Star Wars vehicles), so each
// test below re-derives the direction from the camera + the
// engine's own forward, and pins the compensation (or its absence)
// at the call site.
//
// Run: node --test tests/joystick-sign.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';

import { createWalker, stepWalker } from '../lib/world/walk-controls.js';
import { createBikeFlightState, stepBikeFlight } from '../lib/bike-flight.js';
import { stepFlight } from '../lib/nova-flight.js';
import { createVehicleState, stepVehicle } from '../app/star-wars/vehicles.js';
import {
  sphereStateForDeck, stepHollowEarthWalker, insideTangentBasis,
} from '../lib/hollow-earth/planet.js';
import { sphereTangentBasis, stepSphereWalker } from '../lib/planet-walker.js';
import { stepGroundVehicle } from '../lib/earth2/vehicles.js';
import { createSoccer, stepSoccer } from '../lib/sports/soccer.js';
import { updateVehicle, createVehicle } from '../lib/gta/vehicle.js';
import { updatePlayer, createPlayer } from '../lib/gta/player.js';
import { createGame, setInput, stepGame } from '../app/swamp-run/engine.js';
import { makeShip, stepShip } from '../app/flying-dutchman/engine.js';
import { tangentFrame, headingVector } from '../lib/earth/roam.js';
import { forward as netherForward, right as netherRight } from '../lib/nether-realm/world.js';
import { createGame as createQuidditch, stepGame as stepQuidditch, COUNTDOWN_MS as QUIDDITCH_COUNTDOWN_MS } from '../app/quidditch/engine.js';
import { createRace, stepRace } from '../app/tidal-rush/engine.js';
import { createGame as createCollapse, stepGame as stepCollapse, COUNTDOWN_MS as COLLAPSE_COUNTDOWN_MS } from '../app/collapse-run/engine.js';
import { createGame as createWeaver, updateGame as updateWeaver } from '../app/arachnid-weaver/game.js';
import { updateRideSteering } from '../lib/argo-street.js';
import { flightAxisMove, bikeAxisInput } from '../lib/flight-axis.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

/** Screen-right for a camera facing `forward` with the given `up`. */
function screenRight(forward, up = { x: 0, y: 1, z: 0 }) {
  return {
    x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z,
    z: forward.x * up.y - forward.y * up.x,
  };
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
/** Component-wise near-equality for unit vectors built by normalize(). */
function vecNear(a, b, eps = 1e-9) {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;
}

// ---------- the shared stick itself ----------

test('WalkJoystick reports x right-positive, y forward-positive', () => {
  const src = read('../components/world/WalkJoystick.jsx');
  assert.ok(src.includes('onMove(dx / max, -dy / max)'),
    'WalkJoystick reports onMove(dx/max, -dy/max): right +, up +');
});

// ---------- shared first-person walker (hub, Star Wars on foot, ME, HE mounts, Myriad, Babel, ARES) ----------

test('stepWalker: strafe +1 moves screen-right at every yaw', () => {
  // Camera forward (-sin yaw, -cos yaw); screen-right (cos yaw, -sin yaw).
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const w = createWalker({ x: 0, z: 0, yaw });
    stepWalker(w, { fwd: 0, strafe: 1 }, 0.5, {});
    const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const moved = { x: w.pos.x, y: 0, z: w.pos.z };
    assert.ok(dot(moved, right) > 0,
      `yaw ${yaw.toFixed(2)}: strafe +1 must move screen-right`);
    const w2 = createWalker({ x: 0, z: 0, yaw });
    stepWalker(w2, { fwd: 0, strafe: -1 }, 0.5, {});
    const moved2 = { x: w2.pos.x, y: 0, z: w2.pos.z };
    assert.ok(dot(moved2, right) < 0,
      `yaw ${yaw.toFixed(2)}: strafe -1 must move screen-left`);
  }
});

test('stepWalker call sites pass the joystick x straight into strafe', () => {
  // Middle-earth (PENDING — owned by the ME worker) and Hollow Earth
  // both feed joy.x as strafe; Star Wars on foot does the same.
  // A minus sign here would be an inversion.
  for (const p of [
    '../app/middle-earth/page.jsx',
    '../app/hollow-earth/page.jsx',
    '../app/star-wars/page.jsx',
  ]) {
    const src = read(p);
    assert.ok(src.includes('strafe: keys.state.strafe + joyRef.current.x'),
      `${p}: strafe carries +joy.x`);
    assert.ok(!src.includes('strafe: keys.state.strafe - joyRef.current.x'),
      `${p}: no negated joystick strafe`);
  }
});

// ---------- hub bike + hub free-fly ----------

test('hub bike: steer +1 turns right (rider view)', () => {
  // Bike yaw 0 = nose +Z; a rider facing +Z has their right hand
  // toward -X, so a right turn DECREASES yaw and drives -X.
  const T = { maxSpeed: 20, reverseSpeed: 5, climbSpeed: 5, accel: 10, brake: 10, turnRate: 2 };
  const st = createBikeFlightState([0, 0, 0], 0);
  stepBikeFlight(st, { throttle: 1, steer: 1, vertical: false }, 0.5, T);
  assert.ok(st.yaw < 0, 'steer +1 decreases yaw (nose toward rider right)');
  assert.ok(st.pos.x < 0, 'steer +1 drives toward -X, the rider\'s right');
  const st2 = createBikeFlightState([0, 0, 0], 0);
  stepBikeFlight(st2, { throttle: 1, steer: -1, vertical: false }, 0.5, T);
  assert.ok(st2.yaw > 0 && st2.pos.x > 0, 'steer -1 turns left');
});

test('hub bike input: stick right is steer +1', () => {
  const src = read('../lib/flight-axis.js');
  assert.ok(src.includes('steer: clamp(keyD - keyA + moveX)'),
    'bikeAxisInput maps moveX (stick right) to steer +1');
});

// ---------- stepFlight family (Nova / Erebus / Myriad): turn +1 is LEFT ----------

test('stepFlight: turn +1 yaws toward screen-left (world frame)', () => {
  // Forward (sin yaw, cos yaw); facing +Z the screen-right is -X,
  // so a yaw increase swings the nose toward +X = screen-left.
  const f = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, speed: 10 };
  const next = stepFlight(f, { thrust: 0, turn: 1, pitch: 0, boost: false, brake: false }, 0.5);
  assert.ok(next.yaw > 0, 'turn +1 increases yaw (nose toward +X, screen-left)');
});

test('Nova / Erebus / Myriad drag sticks negate into stepFlight', () => {
  // Because turn +1 is left, a drag-right (dx +) must feed a
  // NEGATIVE turn, and the left key must feed +1 — exactly what
  // these pages do. An un-negated dx here would steer backwards.
  for (const p of ['../app/nova/page.jsx', '../app/erebus/page.jsx', '../app/myriad/page.jsx']) {
    const src = read(p);
    assert.ok(src.includes('inputRef.current.turn = -(dx / 60)'),
      `${p}: drag stick negates into turn`);
    assert.ok(src.includes("inputRef.current.turn = (left ? 1 : 0) + (right ? -1 : 0)"),
      `${p}: left key is turn +1, right key -1`);
  }
});

// ---------- Star Wars vehicles: turn +1 is RIGHT ----------

test('Star Wars speeder/rover/pod: turn +1 turns right', () => {
  // stepVehicle subtracts turn from yaw; forward is (-sin, -cos),
  // so a yaw decrease swings the nose toward +X = screen-right
  // for the chase camera behind the craft.
  const sv = createVehicleState('landspeeder', { x: 0, z: 0, yaw: 0 });
  sv.speed = 10;
  stepVehicle(sv, { fwd: 1, turn: 1 }, 0.5, {});
  assert.ok(sv.yaw < 0, 'turn +1 decreases yaw (nose toward screen-right)');
  const sv2 = createVehicleState('landspeeder', { x: 0, z: 0, yaw: 0 });
  sv2.speed = 10;
  stepVehicle(sv2, { fwd: 1, turn: -1 }, 0.5, {});
  assert.ok(sv2.yaw > 0, 'turn -1 turns left');
});

test('Star Wars page passes the joystick x straight into turn', () => {
  const src = read('../app/star-wars/page.jsx');
  assert.ok(src.includes('turn: keys.state.strafe + joyRef.current.x'),
    'mounted vehicle turn carries +joy.x');
});

// ---------- Hollow Earth sphere walker ----------

test('Hollow Earth sphere walker: strafe +1 moves along basis.right', () => {
  const s0 = sphereStateForDeck(0, 0, () => 0);
  const basis = insideTangentBasis(s0.feet, 0);
  // right is cross(forward, up) — the camera's screen-right.
  assert.ok(vecNear(basis.right, screenRight(basis.forward, basis.up)),
    'sphere basis right is forward x up');
  const s = stepHollowEarthWalker(
    sphereStateForDeck(0, 0, () => 0),
    { fwd: 0, strafe: 1, sprint: false, jump: false, yaw: 0 },
    0.5, { heightAt: () => 0, walkSpeed: 10 },
  );
  const moved = { x: s.feet.x - s0.feet.x, y: s.feet.y - s0.feet.y, z: s.feet.z - s0.feet.z };
  assert.ok(dot(moved, basis.right) > 0, 'strafe +1 moves screen-right');
});

// ---------- Moon / Earth-walk sphere basis (PENDING — J2 mirror worker owns it) ----------

test('planet-walker sphere basis: right is forward x up', () => {
  const basis = sphereTangentBasis({ x: 0, y: 100, z: 0 }, 0, 100);
  assert.ok(vecNear(basis.forward, { x: 0, y: 0, z: -1 }), 'yaw 0 faces -Z');
  assert.ok(vecNear(basis.right, { x: 1, y: 0, z: 0 }), 'right is +X at yaw 0');
  assert.ok(vecNear(basis.right, screenRight(basis.forward, basis.up)),
    'basis right is forward x up');
  let s = { feet: { x: 0, y: 100, z: 0 }, vr: 0, grounded: true };
  s = stepSphereWalker(s,
    { fwd: 0, strafe: 1, jump: false, forward: basis.forward, right: basis.right },
    0.5, { radius: 100, gravity: 1.62, walkSpeed: 5, jumpSpeed: 3 });
  assert.ok(s.feet.x > 0, 'strafe +1 moves +X (screen-right at yaw 0)');
});

test('Moon / Earth-walk scenes feed the joystick x straight into strafe', () => {
  for (const p of ['../components/MoonScene.jsx', '../components/EarthWalkScene.jsx']) {
    const src = read(p);
    assert.ok(src.includes('strafe += moveRef.current.x || 0'),
      `${p}: strafe carries +moveRef.x`);
  }
});

// ---------- Earth 2: steer +1 is LEFT, so the drive negates ----------

test('Earth 2 ground vehicle: steer +1 turns screen-left', () => {
  const env = { heightAt: () => 0, waterDepthAt: () => 0, colliders: [] };
  const spec = { turnRate: 2, maxSpeed: 20, reverseMax: 5, accel: 10, turnFloor: 0.5, radius: 2, halfLength: 2, halfWidth: 1 };
  const right = stepGroundVehicle(
    { x: 0, z: 0, heading: 0, speed: 10 }, spec, { throttle: 1, steer: 1 }, 0.5, env);
  const left = stepGroundVehicle(
    { x: 0, z: 0, heading: 0, speed: 10 }, spec, { throttle: 1, steer: -1 }, 0.5, env);
  assert.ok(right.heading > 0, 'steer +1 increases heading (nose toward +X, screen-left)');
  assert.ok(left.heading < 0, 'steer -1 turns right');
});

test('Earth 2 drive negates the joystick strafe into steer', () => {
  const src = read('../components/earth2/Earth2World.jsx');
  assert.ok(src.includes('steer: -strafeIn'),
    'Earth 2 passes steer -strafeIn, so stick right steers right');
});

// ---------- Earth 1 supercar: NO negation is correct here ----------

test('Earth 1 supercar: turn +1 is right in the Earth tangent frame', () => {
  // The Earth frame is right-handed east/north (east x north =
  // normal): facing north, east is on the right, and a yaw
  // increase turns the heading toward east. So the supercar's
  // un-negated turn = moveX + (D - A) is correct — unlike the
  // world-frame stepFlight callers, which must negate.
  const fr = tangentFrame(0, 0);
  const north = headingVector(fr, 0);
  const east = fr.east;
  const turned = headingVector(fr, 90);
  assert.ok(Math.abs(north.y - 1) < 1e-9, 'yaw 0 faces north (+Y at lon 0)');
  assert.ok(dot(turned, east) > 0.99, 'yaw +90 faces east');
  assert.ok(dot(east, screenRight(north, fr.normal)) > 0.99,
    'east is screen-right when facing north');
  const src = read('../components/EarthSupercar.jsx');
  assert.ok(src.includes('const turn = (c.moveX || 0) + ((c.keyD ? 1 : 0) - (c.keyA ? 1 : 0));'),
    'supercar turn carries +moveX with no negation');
});

// ---------- Jupiter 2 speeder (PENDING — J2 mirror worker owns it) ----------

test('Jupiter 2 speeder: stick right steers right (already fixed upstream)', () => {
  // lib/jupiter2/speeder.js: steer +1 is full LEFT and the step
  // SUBTRACTS it from yaw, while forward is (sin yaw, -cos yaw)
  // so a yaw increase turns right. The scene therefore negates
  // the stick deflection into steer. Pins the current correct
  // state; the J2 mirror worker owns this file.
  const scene = read('../components/jupiter2/Jupiter2Scene.jsx');
  assert.ok(scene.includes('inputRef.current.steer = -scaled * Math.sign(raw)'),
    'J2 scene negates the stick deflection into steer');
  const speeder = read('../lib/jupiter2/speeder.js');
  assert.ok(speeder.includes('state.yaw -= steer * turnRate * dt'),
    'speeder subtracts steer from yaw');
});

// ---------- sports: world-axis camera at +Z ----------

test('sports: stick right moves +X (screen-right under the +Z camera)', () => {
  // Every sports camera sits at +Z looking toward -Z, so
  // screen-right is +X and mx = joy.x is correct; mz = -joy.y
  // puts stick-up toward -Z (up-screen).
  const game = createSoccer();
  game.status = 'play';
  game.deadball = null;
  const you = game.players.find((p) => p.isHuman);
  const x0 = you.x;
  const z0 = you.z;
  stepSoccer(game, 0.5, { mx: 1, mz: 0, act: false }, Math.random);
  assert.ok(you.x > x0, 'soccer: stick right moves +X');
  stepSoccer(game, 0.5, { mx: 0, mz: -1, act: false }, Math.random);
  assert.ok(you.z < z0, 'soccer: stick up moves -Z (up-screen)');
  for (const p of [
    '../app/dodgeball/page.jsx', '../app/volleyball/page.jsx', '../app/hockey/page.jsx',
    '../app/soccer/page.jsx', '../app/tennis/page.jsx', '../app/table-tennis/page.jsx',
  ]) {
    const src = read(p);
    assert.ok(src.includes('joyRef.current.x'), `${p}: uses joy.x for mx`);
    assert.ok(src.includes('-joyRef.current.y'), `${p}: uses -joy.y for mz`);
  }
});

// ---------- GTA (Mega-City / Truman / Babel GTA): player + vehicle ----------

test('GTA on foot: stick right moves screen-right (camera-relative)', () => {
  const p = createPlayer(0, 0);
  updatePlayer(p, { moveX: 1, moveY: 0, sprint: false, jump: false }, 0, [], 0.5);
  assert.ok(p.vx > 0, 'camYaw 0: moveX +1 drives +X (screen-right)');
  const p2 = createPlayer(0, 0);
  updatePlayer(p2, { moveX: 0, moveY: 1, sprint: false, jump: false }, 0, [], 0.5);
  assert.ok(p2.vz < 0, 'moveY +1 drives -Z (forward, away from camera)');
});

test('GTA vehicle: stick right turns right', () => {
  // steerTarget = -moveX: stick right gives a negative wheel
  // angle, and heading follows the wheel — heading decreases,
  // nose toward -X, which is screen-right for the chase camera.
  const v = createVehicle('adder', 0, 0);
  v.speed = 10;
  updateVehicle(v, { moveX: 1, moveY: 1, handbrake: false }, [], 0.5);
  assert.ok(v.heading < 0, 'moveX +1 decreases heading (nose toward screen-right)');
});

// ---------- Swamp Run joystick ----------

test('Swamp Run: stick right turns right', () => {
  // The page sets joy.angle = heading - atan2(dx, -dy): stick
  // right (dx +) aims the target heading to the RIGHT of the
  // current heading, and the engine turns toward it (turn -1).
  // Forward is (sin, cos); facing +Z the screen-right is -X,
  // and a heading decrease swings the nose toward -X.
  const g = createGame(7);
  g.status = 'playing';
  g.player.heading = 0;
  g.player.mode = 'canoe';
  g.player.speed = 5;
  setInput(g, { thrust: 0.5, turn: -1, sprint: false });
  stepGame(g, 0.5);
  assert.ok(g.player.heading < 0, 'turn -1 (stick right) decreases heading = right');
  const src = read('../app/swamp-run/page.jsx');
  assert.ok(src.includes('joyRef.current.angle = stateRef.current.player.heading - headingOffset(dx, dy)'),
    'swamp stick subtracts the screen-right offset from the heading');
});

// ---------- New Earth (Earth 3) + Earth 4: strafe basis (FIXED) ----------

test('New Earth + Earth 4: strafe basis is camera-right, not its mirror', () => {
  // The camera's right, from its own euler (pitch, yaw, 0), is
  // (cos yaw, 0, -sin yaw) — verified against three.js. The old
  // rightV (cy, 0, +sy) mirrored it: stick-right strafed
  // screen-left at yaw ±90° and sideways at ±45°.
  for (const p of ['../app/new-earth/scene.js', '../app/earth-4/scene.js']) {
    const src = read(p);
    assert.ok(src.includes('rightV.set(cy, 0, -sy)'),
      `${p}: rightV is (cy, 0, -sy)`);
    assert.ok(!src.includes('rightV.set(cy, 0, sy)'),
      `${p}: mirrored rightV is gone`);
  }
  // Proof against the real camera: three.js Euler(pitch, yaw, 0)
  // applied to local +X is the screen-right. The code's rightV is
  // the horizontal part of that vector, so it must stay in the
  // same half-plane as the camera's screen-right at every yaw and
  // pitch (dot > 0.9 in the tested range; a full sweep to pitch
  // 1.2 still gives >= 0.88), while the old mirrored vector falls
  // to the opposite half-plane as soon as yaw leaves 0.
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const pitch of [0, 0.3, -0.2]) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0));
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const len = Math.hypot(right.x, right.z);
      const camRightH = { x: right.x / len, z: right.z / len };
      const fixed = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const old = { x: Math.cos(yaw), z: Math.sin(yaw) };
      const dotFixed = fixed.x * camRightH.x + fixed.z * camRightH.z;
      const dotOld = old.x * camRightH.x + old.z * camRightH.z;
      assert.ok(dotFixed > 0.9,
        `yaw ${yaw.toFixed(2)} pitch ${pitch}: fixed rightV aligns with camera-right (dot ${dotFixed.toFixed(2)})`);
      if (Math.abs(Math.sin(yaw)) > 0.5) { // yaws where fixed and mirrored actually differ
        assert.ok(dotFixed > dotOld,
          `yaw ${yaw.toFixed(2)} pitch ${pitch}: fixed beats the mirrored vector`);
      }
    }
  }
});

// ---------- Hall of Mirrors: forward axis (FIXED) ----------

test('Hall of Mirrors: stick up walks forward, stick right strafes right', () => {
  const src = read('../app/hall-of-mirrors/page.jsx');
  assert.ok(src.includes('let mz = joyRef.current.y;'),
    'mz is +joy.y (forward amount)');
  assert.ok(!src.includes('let mz = -joyRef.current.y;'),
    'inverted mz is gone');
  assert.ok(src.includes("if (keys.has('w') || keys.has('arrowup')) mz += 1;"),
    'W walks forward');
  // The step moves mz along camera forward (-sin, -cos) and mx
  // along camera right (cos, -sin): re-derive it here.
  const step = (angle, mx, mz) => ({
    dx: Math.sin(angle) * -mz + Math.cos(angle) * mx,
    dz: Math.cos(angle) * -mz - Math.sin(angle) * mx,
  });
  for (const angle of [0, Math.PI / 2, Math.PI]) {
    const fwd = { x: -Math.sin(angle), z: -Math.cos(angle) };
    const right = { x: Math.cos(angle), z: -Math.sin(angle) };
    const up = step(angle, 0, 1); // stick up (joy.y +1) / W
    assert.ok(up.dx * fwd.x + up.dz * fwd.z > 0,
      `angle ${angle.toFixed(2)}: stick up moves forward`);
    const r = step(angle, 1, 0); // stick right
    assert.ok(r.dx * right.x + r.dz * right.z > 0,
      `angle ${angle.toFixed(2)}: stick right moves screen-right`);
    const l = step(angle, -1, 0); // stick left
    assert.ok(l.dx * right.x + l.dz * right.z < 0,
      `angle ${angle.toFixed(2)}: stick left moves screen-left`);
  }
});

// ---------- Flying Dutchman helm (FIXED) ----------

test('Flying Dutchman: stick right turns the ship right', () => {
  // Engine: heading += rudder, forward (sin, cos); facing +Z the
  // screen-right is -X, so a POSITIVE rudder turns screen-LEFT.
  // The page therefore negates the player's stick/keys into the
  // rudder. The AI steers in bearing terms and is untouched.
  const ship = makeShip(6);
  ship.heading = 0;
  ship.speed = 5;
  ship.throttle = 1;
  ship.sails = 'full';
  ship.rudder = 1;
  stepShip(ship, 0.5, { direction: 0, strength: 0 });
  assert.ok(ship.heading > 0, 'rudder +1 increases heading (screen-left)');
  const ship2 = makeShip(6);
  ship2.heading = 0;
  ship2.speed = 5;
  ship2.throttle = 1;
  ship2.sails = 'full';
  ship2.rudder = -1; // what stick-right (+1) becomes after the page negation
  stepShip(ship2, 0.5, { direction: 0, strength: 0 });
  assert.ok(ship2.heading < 0, 'rudder -1 decreases heading (screen-right)');
  const src = read('../app/flying-dutchman/page.jsx');
  assert.ok(src.includes('const rudder = input.joy !== 0 ? -input.joy : (input.keys.left ? 1 : 0) - (input.keys.right ? 1 : 0);'),
    'page negates the helm stick/keys into the rudder');
});

// ---------- STICK_RADIUS family (26 afterlife/heaven worlds) ----------

test('STICK_RADIUS family: strafe = dx/R, fwd = -dy/R, basis is camera-right', () => {
  // Every page in the family writes the same two lines; the
  // consumer moves strafe along right(yaw) = (cos, -sin).
  const pages = [
    'ares/prison', 'tlalocan', 'maya-sky', 'vyraj', 'tiangong', 'heaven',
    'svarga', 'takamagahara', 'tir-na-nog', 'elysium', 'valhalla', 'aaru',
    'ghost-rider', 'nether-realm', 'helheim', 'duat', 'hell', 'naraka',
    'yomi', 'annwn', 'mictlan', 'xibalba', 'kur', 'nav', 'diyu', 'orun',
  ];
  for (const name of pages) {
    const src = read(`../app/${name}/page.jsx`);
    assert.ok(src.includes('inputRef.current.strafe = dx / STICK_RADIUS'),
      `${name}: strafe = dx/R (right +)`);
    assert.ok(src.includes('inputRef.current.fwd = -dy / STICK_RADIUS'),
      `${name}: fwd = -dy/R (up +)`);
  }
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    assert.deepEqual(netherRight(yaw),
      { x: Math.cos(yaw), z: -Math.sin(yaw) },
      `right(${yaw.toFixed(2)}) is camera-right`);
    assert.deepEqual(netherForward(yaw),
      { x: -Math.sin(yaw), z: -Math.cos(yaw) },
      `forward(${yaw.toFixed(2)}) is camera forward`);
  }
});

// ---------- Sun Base, Mars 1, Aethelgard, Dream Engine, Enyo, Skyscraper, Argo ----------

test('Sun Base: strafe moves along camera-right', () => {
  // BaseRig: forward (-sin, -cos), right (cos, -sin); strafe
  // adds moveRef.x along right, fwd adds moveRef.y along forward.
  const src = read('../components/SunBaseScene.jsx');
  assert.ok(src.includes('const nx = pos.current.x + (cos * strafe - sin * fwd) * step;'),
    'sun base x step uses (cos*strafe - sin*fwd)');
  assert.ok(src.includes('const nz = pos.current.z + (-sin * strafe - cos * fwd) * step;'),
    'sun base z step uses (-sin*strafe - cos*fwd)');
  assert.ok(src.includes('strafe += moveRef.current.x || 0;'),
    'sun base strafe carries +moveRef.x');
});

test('Mars 1 + Aethelgard touch sticks write the keys the right way', () => {
  for (const p of ['../components/mars/MarsScene.jsx', '../components/aethelgard/RainforestScene.jsx']) {
    const src = read(p);
    assert.ok(src.includes("setKey('right', dx > T);"), `${p}: dx + sets right`);
    assert.ok(src.includes("setKey('fwd', dy < -T);"), `${p}: dy up sets fwd`);
    assert.ok(src.includes('let dx = (-sin) * fwd + cos * strafe') ||
      src.includes('p.x += (-sin * fwd + cos * strafe)'),
    `${p}: movement uses the shared (-sin, cos) basis`);
  }
});

test('Dream Engine + Enyo: joystick x is strafe, up is forward', () => {
  const dream = read('../components/dream-engine/DreamScene.jsx');
  assert.ok(dream.includes('ix += rig.current.joyX || 0;'), 'dream: joyX is strafe');
  assert.ok(dream.includes('iz += -(rig.current.joyY || 0);'), 'dream: -joyY is forward');
  assert.ok(dream.includes('// forward = (-sin yaw, 0, -cos yaw); right = (cos yaw, 0, -sin yaw)'),
    'dream: basis comment states the standard frame');
  const enyo = read('../app/enyo/page.jsx');
  assert.ok(enyo.includes('ix += joy.dx;'), 'enyo: joy.dx is strafe');
  assert.ok(enyo.includes('iz += joy.dy;'), 'enyo: joy.dy is down-positive iz');
  assert.ok(enyo.includes('player.vel.x = (fx * -iz + rx * ix) * speed;'),
    'enyo: forward amount is -iz, so stick-up (dy -1) walks forward');
});

// ---------- Flying Dutchman ashore: strafe basis (FIXED, Wave 2) ----------

test('Flying Dutchman ashore: stick right walks screen-right (FIXED)', () => {
  // The chase camera sits BEHIND the walker (w - f*16, y 16,
  // lookAt w) looking along forward (sin h, cos h), so the
  // screen-right is forward x up = (-cos h, +sin h). The old
  // basis (cos h, -sin h) paired with the NEGATED forward
  // (-sin, -cos) and walked stick-right to the screen-LEFT.
  // Proof against the real camera, not the variable names.
  const src = read('../app/flying-dutchman/page.jsx');
  assert.ok(src.includes('const rx = -Math.cos(w.heading), rz = Math.sin(w.heading);'),
    'ashore strafe basis is (-cos h, +sin h)');
  assert.ok(!src.includes('const rx = Math.cos(w.heading), rz = -Math.sin(w.heading);'),
    'mirrored ashore basis is gone');
  assert.ok(src.includes('s.dy = clamp(dy / (rect.height / 2), -1, 1);'),
    'joyState.dy is raw screen dy (down-positive)');
  for (const h of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    cam.position.set(-Math.sin(h) * 16, 16, -Math.cos(h) * 16);
    cam.lookAt(0, 2, 0);
    cam.updateMatrixWorld();
    const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const camFwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate();
    const fixed = { x: -Math.cos(h), z: Math.sin(h) };
    const old = { x: Math.cos(h), z: -Math.sin(h) };
    const fwd = { x: Math.sin(h), z: Math.cos(h) };
    assert.ok(fixed.x * camRight.x + fixed.z * camRight.z > 0.9,
      `heading ${h.toFixed(2)}: fixed basis aligns with camera-right`);
    assert.ok(old.x * camRight.x + old.z * camRight.z < -0.9,
      `heading ${h.toFixed(2)}: old basis was the mirror (screen-left)`);
    // Stick right (jx +1): mx/mz from the page's own step math.
    const mx = fixed.x * 1 + fwd.x * 0, mz = fixed.z * 1 + fwd.z * 0;
    assert.ok(mx * camRight.x + mz * camRight.z > 0,
      `heading ${h.toFixed(2)}: stick right moves screen-right`);
    // Stick up (jy -1, so -jy = +1): along forward, away from the camera.
    const ux = fwd.x * 1, uz = fwd.z * 1;
    assert.ok(ux * camFwd.x + uz * camFwd.z > 0,
      `heading ${h.toFixed(2)}: stick up moves forward (up-screen)`);
  }
});

// ---------- Quidditch seeker steering (FIXED, Wave 2) ----------

test('Quidditch: drag right / D turns the broom right (FIXED)', () => {
  // Chase camera behind the broom looking along (sin yaw, cos yaw);
  // screen-right is (-cos, +sin), so a yaw increase swings the nose
  // screen-LEFT. A right input (yawIn +1) must therefore DECREASE
  // yaw. The rival steers by wantYaw and never touches yawIn.
  const g = createQuidditch(7);
  stepQuidditch(g, QUIDDITCH_COUNTDOWN_MS / 1000 + 0.1, {});
  assert.equal(g.phase, 'playing');
  const yaw0 = g.player.yaw;
  const x0 = g.player.pos.x, z0 = g.player.pos.z;
  stepQuidditch(g, 0.5, { yaw: 1 });
  assert.ok(g.player.yaw < yaw0, 'yaw +1 decreases yaw (turn right)');
  // The nose swung toward screen-right: at yaw ~0 the screen-right
  // is -X, so the new forward must have a negative-X component
  // relative to the old forward (0, +1 in xz).
  const fw = { x: Math.sin(g.player.yaw), z: Math.cos(g.player.yaw) };
  const right0 = { x: -Math.cos(yaw0), z: Math.sin(yaw0) };
  assert.ok(fw.x * right0.x + fw.z * right0.z > 0,
    'new forward has a screen-right component');
  assert.ok(g.player.pos.x !== x0 || g.player.pos.z !== z0, 'broom moved');
  const src = read('../app/quidditch/page.jsx');
  assert.ok(src.includes("inputRef.current.yaw = Math.max(-1, Math.min(1, dx));"),
    'drag right feeds yaw +1');
  assert.ok(src.includes("if (k === 'arrowright' || k === 'd') inputRef.current.yaw = 1;"),
    'ArrowRight / D feeds yaw +1');
  const eng = read('../app/quidditch/engine.js');
  assert.ok(eng.includes('p.yaw -= yawIn * TURN_RATE * dt;'),
    'engine subtracts the yaw input');
});

// ---------- Tidal Rush player steering (FIXED, Wave 2) ----------

test('Tidal Rush: drag right / D / ▶ steers right (FIXED)', () => {
  // The engine's steer +1 is a LEFT turn (heading += steer swings
  // the nose toward +X, screen-left under the chase camera that
  // looks along (sin, cos)) — and the AI steers through that same
  // channel, so the engine is untouched and the PLAYER input is
  // negated at the page instead, exactly like Earth 2's drive.
  const s = createRace({ racerCount: 4 });
  for (let i = 0; i < Math.ceil(3.5 / (1 / 120)); i++) stepRace(s, 1 / 120, {});
  assert.equal(s.phase, 'racing');
  const h0 = s.racers[0].heading;
  for (let i = 0; i < 60; i++) stepRace(s, 1 / 120, { steer: 1, boost: false });
  assert.ok(s.racers[0].heading > h0, 'engine steer +1 increases heading (left)');
  const src = read('../app/tidal-rush/page.jsx');
  assert.ok(src.includes("if (k.has('left')) steer += 1;"),
    'keyboard left feeds steer +1 (left turn)');
  assert.ok(src.includes("if (k.has('right')) steer -= 1;"),
    'keyboard right feeds steer -1 (right turn)');
  assert.ok(src.includes('inputRef.current.steer = Math.max(-1, Math.min(1, -dx / 70));'),
    'drag right feeds a negative steer (right turn)');
  assert.ok(src.includes('inputRef.current.steer = -dir;'),
    'hold buttons feed negated (▶ right = steer -1)');
  assert.ok(src.includes('inputRef.current.steer === -dir'),
    'hold-button release check matches the negated steer');
});

// ---------- Babel walk mode (verified correct, Wave 2 audit) ----------

test('Babel walk: stick up walks forward, stick right strafes right', () => {
  // The Babel stick reports dy DOWN-positive (dy = clientY - center),
  // so WalkMode takes fwd = keys - joy.y and strafe = keys + joy.x
  // into the standard stepWalker (forward (-sin, -cos), right
  // (cos, -sin)) — drag up (joy.y -1) is forward, drag right is right.
  const page = read('../app/babel/page.jsx');
  assert.ok(page.includes('inputRef.current.joy = { x: dx / R, y: dy / R };'),
    'babel stick reports raw dy (down-positive)');
  const walk = read('../components/babel/WalkMode.jsx');
  assert.ok(walk.includes('const fwd = (inp.keys.fwd ? 1 : 0) - (inp.keys.back ? 1 : 0) - inp.joy.y;'),
    'walk fwd negates the down-positive joy.y');
  assert.ok(walk.includes('const strafe = (inp.keys.right ? 1 : 0) - (inp.keys.left ? 1 : 0) + inp.joy.x;'),
    'walk strafe carries +joy.x');
  const lib = read('../lib/babel/walk.js');
  assert.ok(lib.includes('let dx = -Math.sin(yaw) * input.fwd + Math.cos(yaw) * input.strafe;'),
    'babel stepWalker uses the standard (-sin, cos) basis');
});

// ---------- World Nexus (verified correct, Wave 2 audit) ----------

test('World Nexus: stick up walks forward, stick right strafes right', () => {
  // The page stick reports onMove(dx/max, -dy/max) (y fwd-positive)
  // into setMove(x, y); the scene adds joy.x to ix and joy.y to iz,
  // W is iz +1, and movement is fx*nz + rx*nx with forward
  // (-sin, -cos) and right (-fz, fx) = (cos, -sin).
  const page = read('../app/world-nexus/page.jsx');
  assert.ok(page.includes('onMove(dx / max, -dy / max);'),
    'nexus stick reports y fwd-positive');
  const scene = read('../app/world-nexus/scene.js');
  assert.ok(scene.includes('ix += joy.x; iz += joy.y;'),
    'nexus scene adds joy.x to strafe, joy.y to forward');
  assert.ok(scene.includes("const rx = -fz, rz = fx;"),
    'nexus right is (-fz, fx) = (cos, -sin)');
});

// ---------- Argo street rig (verified correct, Wave 2 audit) ----------

test('Argo: stick right turns right in fly, walk and ride', () => {
  // The stick writes strafe = dx (right +), thrust = -dy (up +).
  // Fly/walk steer by yaw -= strafe: forward is (sin, cos), so a
  // yaw decrease swings the nose toward -X, which is screen-right
  // for the chase camera looking along (sin, cos). Ride steers the
  // camera yaw the same way (camYaw -= strafe * rate).
  const page = read('../app/argo/page.jsx');
  assert.ok(page.includes('controlsRef.current.strafe = dx;'),
    'argo stick strafe is +dx');
  assert.ok(page.includes('controlsRef.current.thrust = -dy;'),
    'argo stick thrust is -dy (up +)');
  const scene = read('../components/argo/StreetScene.jsx');
  assert.ok(scene.includes('r.yaw -= strafe * 1.6 * dt;'),
    'argo fly steers yaw -= strafe');
  assert.ok(scene.includes('r.yaw -= strafe * 1.9 * dt;'),
    'argo walk steers yaw -= strafe');
  const st0 = updateRideSteering({ yaw: 0, camYaw: 0 }, { strafe: 1, thrust: 1, lookDX: 0 }, 0.5);
  assert.ok(st0.camYaw < 0, 'ride: strafe +1 decreases camYaw (nose toward screen-right)');
  assert.ok(st0.yaw < 0, 'ride: bike heading chases the camera right');
  const stL = updateRideSteering({ yaw: 0, camYaw: 0 }, { strafe: -1, thrust: 1, lookDX: 0 }, 0.5);
  assert.ok(stL.camYaw > 0, 'ride: strafe -1 turns left');
});

// ---------- Arachnid Weaver (verified correct, Wave 2 audit) ----------

test('Arachnid Weaver: stick right runs right, stick up runs up', () => {
  // 2D canvas, y down: the stick reports raw dx/dy (right +,
  // down +) and the keyboard agrees (W is dy -1, D is dx +1);
  // the engine moves p.x += dx*speed, p.y += dy*speed, so
  // stick-right is screen-right and stick-up is screen-up.
  const g = createWeaver(7);
  const x0 = g.player.x, y0 = g.player.y;
  updateWeaver(g, { dx: 1, dy: 0 }, 0.2);
  assert.ok(g.player.x > x0, 'stick right moves +x (screen-right)');
  updateWeaver(g, { dx: 0, dy: -1 }, 0.2);
  assert.ok(g.player.y < y0, 'stick up moves -y (screen-up)');
  const src = read('../app/arachnid-weaver/page.jsx');
  assert.ok(src.includes('if (k["w"] || k["arrowup"]) dy -= 1;'),
    'keyboard W is dy -1, matching stick-up');
  assert.ok(src.includes('if (k["d"] || k["arrowright"]) dx += 1;'),
    'keyboard D is dx +1, matching stick-right');
});

// ---------- Hawkins (verified correct, Wave 2 audit) ----------

test('Hawkins: stick up runs forward, stick right strafes right', () => {
  // The touch stick writes _tx = dx/max (right +), _ty = dy/max
  // (down +); movePlayer takes f2 = -_ty (up = forward) and
  // s2 = _tx into the standard (-sin*f + cos*s, -cos*f - sin*s)
  // basis — the same frame as stepWalker.
  const src = read('../app/hawkins/engine.js');
  assert.ok(src.includes('E.keys._tx = dx / max; E.keys._ty = dy / max;'),
    'hawkins stick writes raw dx/dy (right +, down +)');
  assert.ok(src.includes('const f2 = -E.keys._ty, s2 = E.keys._tx;'),
    'hawkins takes f2 = -_ty, s2 = _tx');
  assert.ok(src.includes('mx = (-sin * f2 + cos * s2); mz = (-cos * f2 - sin * s2);'),
    'hawkins uses the standard basis');
});

// ---------- Skyscraper (verified correct, Wave 2 audit) ----------

test('Skyscraper: stick up walks forward, stick right strafes right', () => {
  // The floating stick records raw start/cur (down-positive dy);
  // velocity.z += -normY (drag up = forward) and velocity.x +=
  // normX (drag right = right), applied along vDir (-sin, -cos)
  // and vRight (cos, -sin) — the camera's own frame.
  const src = read('../app/skyscraper/components/NexusEngine.jsx');
  assert.ok(src.includes('velocity.current.z += (-normY) * intensity * 0.1;'),
    'skyscraper: -normY is forward velocity');
  assert.ok(src.includes("velocity.current.x += normX * intensity * 0.1;"),
    'skyscraper: +normX is right velocity');
  assert.ok(src.includes('vDir.set(-Math.sin(eulerY), 0, -Math.cos(eulerY)).normalize();'),
    'skyscraper forward is (-sin, -cos)');
  assert.ok(src.includes('vRight.set(Math.cos(eulerY), 0, -Math.sin(eulerY)).normalize();'),
    'skyscraper right is (cos, -sin)');
  // Driving: bikeSteer -= normX, and the bike's forward is
  // (0,0,-1) rotated by bikeSteer — a steer decrease swings the
  // nose toward screen-right (see the report's derivation).
  assert.ok(src.includes('bikeSteer.current -= normX * intensity * 0.04;'),
    'skyscraper driving: drag right decreases bikeSteer (turn right)');
});

// ---------- GTA touch input (verified correct, Wave 2 audit) ----------

test('GTA bindTouch: stick up is forward, stick right is strafe right', () => {
  // bindTouch writes joyX = dx/R (right +) and joyY = -dy/R
  // (up +); update() adds them to mx/my, where my +1 is forward
  // (updatePlayer: moveY +1 drives -Z, away from the camera).
  const src = read('../lib/gta/input.js');
  assert.ok(src.includes('touch.joyX = dx / JOY_RADIUS;'),
    'gta bindTouch joyX is +dx');
  assert.ok(src.includes('touch.joyY = -dy / JOY_RADIUS; // up = forward'),
    'gta bindTouch joyY is -dy (up +)');
  assert.ok(src.includes('mx += t.joyX;'),
    'gta update adds joyX to moveX');
  assert.ok(src.includes('my += t.joyY;'),
    'gta update adds joyY to moveY');
});

// ---------- Hub flight axis + supercar moveY (verified correct, Wave 2 audit) ----------

test('Hub: stick up is forward/throttle, stick right is strafe/steer', () => {
  // Hub channels carry moveY DOWN-positive (the page drag
  // convention): flightAxisMove takes forward = -moveY and
  // strafe = moveX; the bike takes throttle = -moveY and
  // steer = +moveX; the supercar takes thrust = -moveY and
  // turn = +moveX. The WalkJoystick feed flips y for exactly
  // this reason (moveY = -y).
  assert.deepEqual(flightAxisMove({ moveX: 1, moveY: -1, axis: 'horizontal' }),
    { forward: 1, strafe: 1, climb: 0 },
    'horizontal: stick up-right is forward +1, strafe +1');
  assert.deepEqual(flightAxisMove({ moveX: 1, moveY: -1, axis: 'vertical' }),
    { forward: 0, strafe: 1, climb: 1 },
    'vertical: stick up-right is climb +1, strafe +1');
  const bike = bikeAxisInput({ moveX: 1, moveY: -1, axis: 'horizontal' });
  assert.ok(bike.throttle > 0 && bike.steer > 0, 'bike: stick up-right throttles and steers right');
  const page = read('../app/page.jsx');
  assert.ok(page.includes('controlsRef.current.moveY = -y;'),
    'hub WalkJoystick feed flips y into down-positive moveY');
  const car = read('../components/EarthSupercar.jsx');
  assert.ok(car.includes('const thrust = -((c.moveY || 0) + ((c.keyS ? 1 : 0) - (c.keyW ? 1 : 0)));'),
    'supercar thrust is -moveY (stick up = throttle)');
});

// ---------- Collapse Run (verified correct, Wave 2 audit) ----------

test('Collapse Run: steer right runs screen-right', () => {
  // The camera looks down -Z, so screen-right is +X; steer +1
  // (touch the right half, ArrowRight, D) drives lateralVel
  // positive and the runner's x = lateral moves +X.
  const g = createCollapse(7);
  stepCollapse(g, COLLAPSE_COUNTDOWN_MS / 1000 + 0.1, {});
  assert.equal(g.phase, 'running');
  const lat0 = g.lateral;
  stepCollapse(g, 0.5, { steer: 1 });
  assert.ok(g.lateral > lat0, 'steer +1 moves the runner +X (screen-right)');
  stepCollapse(g, 0.5, { steer: -1 });
  assert.ok(g.lateral < lat0 + 1, 'steer -1 moves the runner back left');
  const src = read('../app/collapse-run/page.jsx');
  assert.ok(src.includes("inputRef.current.steer = Math.max(-1, Math.min(1, (x / window.innerWidth) * 2 - 1)) * 1.4;"),
    'collapse touch x maps right-half to steer +');
});

// ---------- Myriad walk rig (verified correct, Wave 2 audit) ----------

test('Myriad walk rig: stick up walks forward, stick right strafes right', () => {
  // The walk stick is the shared WalkJoystick (y fwd-positive);
  // WalkRig feeds fwd = keys + joy.y and strafe = keys + joy.x
  // straight into the shared stepWalker, which the suite already
  // proves moves strafe +1 screen-right.
  const rig = read('../components/myriad/MyriadExtras.jsx');
  assert.ok(rig.includes('fwd: (keys.fwd || 0) + (joy.y || 0),'),
    'myriad walk fwd carries +joy.y');
  assert.ok(rig.includes('strafe: (keys.strafe || 0) + (joy.x || 0),'),
    'myriad walk strafe carries +joy.x');
  const page = read('../app/myriad/page.jsx');
  assert.ok(page.includes('<WalkJoystick onMove={(x, y) => { walkJoyRef.current.x = x; walkJoyRef.current.y = y; }} />'),
    'myriad walk stick is the shared WalkJoystick');
});

// ---------- Wave 1 open items: still as reported (not built here) ----------

test('Wave 1 open items are still as reported (not built here)', () => {
  // Mars 2 has NO joystick at all: the roverbar still says
  // "stick / WASD to drive" but no stick is rendered and the
  // rover keys object is keyboard-only. Building a Mars 2
  // joystick is new function, not this workstream's fix.
  const mars2 = read('../app/mars-2/page.jsx');
  assert.ok(mars2.includes('stick / WASD to drive'),
    'mars 2 roverbar still promises a stick');
  assert.ok(!mars2.includes('WalkJoystick') && !mars2.includes('Joystick'),
    'mars 2 still renders no joystick');
  // Omega 500 keyboard A/D is still inverted on screen (A -> +1,
  // D -> -1, while steer +1 is screen-right); the joystick was
  // fixed in Wave 1 and stays fixed. The keyboard is a separate fix.
  const omega = read('../lib/omega-500/input.js');
  assert.ok(omega.includes('const steer = clamp((k.left ? 1 : 0) + (k.right ? -1 : 0) + (t.steer || 0), -1, 1);'),
    'omega 500 keyboard A/D still maps left to +1');
  assert.ok(omega.includes('return clamp(x, -1, 1);'),
    'omega 500 joystick still maps straight through');
});
