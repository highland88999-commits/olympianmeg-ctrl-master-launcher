// tests/hub-solar-glider.test.mjs
// Headless tests for the hub solar-sail glider (Merlin, Nov 27, 2026):
// flight model, summon/dismount contract, camera module numbers,
// variants, and the scene/page wiring.
// Run: node --test tests/hub-solar-glider.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GLIDER_TUNING,
  createGliderFlightState,
  stepGliderFlight,
  gliderForward,
} from '../lib/hub-glider-flight.js';
import {
  GLIDER_SPAWN_AHEAD,
  GLIDER_MOUNT_CONFIG,
  createGliderState,
  summonGlider,
  dismissGlider,
  dismountGlider,
} from '../lib/hub-glider.js';
import {
  GLIDER_CAM_FOLLOW_DIST,
  GLIDER_CAM_FOLLOW_DIST_TOP,
  GLIDER_CAM_HEIGHT_ABOVE_BOARD,
  GLIDER_CAM_LOOK_HEIGHT_ABOVE_BOARD,
  GLIDER_CAM_FOV_BASE,
  GLIDER_CAM_FOV_TOP,
  GLIDER_CAM_BANK_MAX,
  followDistanceAt,
  fovAt,
  speedFraction,
  bankAngleAt,
  gliderBobY,
  gliderCameraPose,
} from '../lib/hub-glider-camera.js';
import {
  GLIDER_VARIANTS,
  DEFAULT_GLIDER_VARIANT_ID,
  getGliderVariant,
  isGliderVariantId,
  readGliderVariant,
  writeGliderVariant,
} from '../lib/hub-glider-variants.js';
import {
  SAIL_METALNESS,
  SAIL_ROUGHNESS,
  SAIL_ENV_MAP_INTENSITY,
  buildHubGlider,
  disposeHubGlider,
} from '../lib/hub-glider/meshes.js';
import { getEmbodiment } from '../lib/characters/embodiment.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

function stepMany(st, input, seconds, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) stepGliderFlight(st, input, dt, GLIDER_TUNING);
  return st;
}

describe('glider flight tuning', () => {
  it('pins the tuning: a sail, not a rocket — below the bike on every axis', () => {
    assert.equal(GLIDER_TUNING.maxSpeed, 110);
    assert.equal(GLIDER_TUNING.reverseSpeed, 30);
    assert.equal(GLIDER_TUNING.climbSpeed, 70);
    assert.equal(GLIDER_TUNING.accel, 120);
    assert.equal(GLIDER_TUNING.brake, 200);
    assert.equal(GLIDER_TUNING.turnRate, 1.4);
    // Every number sits below the bike's (150/45/95/170/260/1.7):
    // the glider is the scenic sail, the bike stays the travel vehicle.
    assert.ok(GLIDER_TUNING.maxSpeed < 150);
    assert.ok(GLIDER_TUNING.climbSpeed < 95);
    assert.ok(GLIDER_TUNING.turnRate < 1.7);
    // ...but still fast: it crosses the hub disc (radius 245.7) in ~4.5 s.
    assert.ok(245.7 / GLIDER_TUNING.maxSpeed < 5);
  });

  it('full throttle settles at cruise speed', () => {
    const st = createGliderFlightState([0, 35, -80], 0);
    stepMany(st, { throttle: 1, steer: 0, vertical: false }, 3);
    assert.ok(Math.abs(st.speed - GLIDER_TUNING.maxSpeed) < 1, `speed ${st.speed}`);
    assert.ok(st.pos.z > -80, 'moves forward (+Z at yaw 0)');
  });

  it('reverse settles at the gentle reverse speed', () => {
    const st = createGliderFlightState([0, 35, -80], 0);
    stepMany(st, { throttle: -1, steer: 0, vertical: false }, 3);
    assert.ok(Math.abs(st.speed + GLIDER_TUNING.reverseSpeed) < 1, `speed ${st.speed}`);
  });

  it('vertical axis climbs instead of driving forward', () => {
    const st = createGliderFlightState([0, 35, -80], 0);
    stepMany(st, { throttle: 1, steer: 0, vertical: true }, 3);
    assert.ok(Math.abs(st.vertSpeed - GLIDER_TUNING.climbSpeed) < 1, `vert ${st.vertSpeed}`);
    assert.ok(Math.abs(st.speed) < 1, 'forward speed coasts to a stop');
    assert.ok(st.pos.y > 35, 'climbs');
  });

  it('steer yaws the heading (right = decreasing yaw, bike convention)', () => {
    const st = createGliderFlightState([0, 35, -80], 0);
    stepMany(st, { throttle: 0, steer: 1, vertical: false }, 1);
    assert.ok(Math.abs(st.yaw + GLIDER_TUNING.turnRate) < 0.05, `yaw ${st.yaw}`);
    const fwd = gliderForward(st.yaw);
    assert.ok(Math.abs(Math.hypot(fwd.x, fwd.z) - 1) < 1e-9, 'forward is a unit vector');
  });

  it('no input coasts to a stop', () => {
    const st = createGliderFlightState([0, 35, -80], 0);
    stepMany(st, { throttle: 1, steer: 0, vertical: false }, 1);
    assert.ok(st.speed > 0);
    stepMany(st, { throttle: 0, steer: 0, vertical: false }, 3);
    assert.ok(Math.abs(st.speed) < 1, `speed ${st.speed}`);
  });
});

describe('glider summon contract (J2 speeder law, camera-anchored)', () => {
  it('summon spawns the glider at the camera anchor and auto-mounts it', () => {
    const g = createGliderState();
    assert.equal(g.summoned, false);
    const ok = summonGlider(g, { x: 10, y: 35, z: -92, yaw: 0.6 }, 'ember');
    assert.equal(ok, true);
    assert.equal(g.summoned, true);
    assert.equal(g.mounted, true);
    assert.equal(g.pos.x, 10);
    assert.equal(g.pos.y, 35);
    assert.equal(g.pos.z, -92);
    assert.equal(g.yaw, 0.6);
    assert.equal(g.variant, 'ember');
    assert.equal(g.speed, 0);
  });

  it('the mount config rides the flight tuning and dismounts at the exact spot', () => {
    assert.equal(GLIDER_MOUNT_CONFIG.rideSpeedMps, GLIDER_TUNING.maxSpeed);
    assert.equal(GLIDER_MOUNT_CONFIG.dismountSideM, 0);
    assert.equal(GLIDER_MOUNT_CONFIG.seatYawOffset, 0);
  });

  it('spawn-ahead distance is 12 units', () => {
    assert.equal(GLIDER_SPAWN_AHEAD, 12);
  });

  it('dismount restores the rider to foot exactly where the craft was — and the glider vanishes', () => {
    const g = createGliderState();
    summonGlider(g, { x: 5, y: 35, z: 5, yaw: 1 }, 'dart');
    // Fly it somewhere first, so the pose is a travelled one.
    const st = createGliderFlightState([g.pos.x, g.pos.y, g.pos.z], g.yaw);
    stepMany(st, { throttle: 1, steer: 0, vertical: false }, 2);
    g.pos = { ...st.pos };
    g.yaw = st.yaw;
    const pose = dismountGlider(g);
    assert.equal(g.summoned, false);
    assert.equal(g.mounted, false);
    assert.equal(pose.x, g.pos.x);
    assert.equal(pose.y, g.pos.y);
    assert.equal(pose.z, g.pos.z);
    assert.equal(pose.yaw, g.yaw);
    assert.ok(pose.x !== 5 || pose.z !== 5, 'the rider takes the travelled place');
  });

  it('dismiss clears the glider', () => {
    const g = createGliderState();
    summonGlider(g, { x: 0, y: 35, z: 0, yaw: 0 }, null);
    dismissGlider(g);
    assert.equal(g.summoned, false);
    assert.equal(g.mounted, false);
  });
});

describe('glider camera module (the one adjustable place)', () => {
  it('pins the film angle: behind the rider, high enough to see the rider and board, sail ahead', () => {
    assert.equal(GLIDER_CAM_FOLLOW_DIST, 11);
    assert.equal(GLIDER_CAM_FOLLOW_DIST_TOP, 15);
    assert.equal(GLIDER_CAM_HEIGHT_ABOVE_BOARD, 4.8);
    assert.equal(GLIDER_CAM_LOOK_HEIGHT_ABOVE_BOARD, 1.2);
    assert.equal(GLIDER_CAM_FOV_BASE, 52);
    assert.equal(GLIDER_CAM_FOV_TOP, 60);
    assert.equal(GLIDER_CAM_BANK_MAX, 0.38);
    // The camera sits ~2.9 above the rider's ~1.9 m head, looking
    // down at the rider's mid-body — the whole craft in frame
    // (board + rider + sail), not the sail alone.
    assert.ok(GLIDER_CAM_HEIGHT_ABOVE_BOARD > 1.9);
    assert.ok(GLIDER_CAM_HEIGHT_ABOVE_BOARD - 1.9 < 3.5);
    assert.ok(GLIDER_CAM_LOOK_HEIGHT_ABOVE_BOARD < 1.9);
  });

  it('follow distance grows with speed, FOV kicks with speed', () => {
    assert.equal(followDistanceAt(0), GLIDER_CAM_FOLLOW_DIST);
    assert.equal(followDistanceAt(1), GLIDER_CAM_FOLLOW_DIST_TOP);
    assert.ok(followDistanceAt(0.5) > GLIDER_CAM_FOLLOW_DIST);
    assert.ok(followDistanceAt(0.5) < GLIDER_CAM_FOLLOW_DIST_TOP);
    assert.equal(fovAt(0), GLIDER_CAM_FOV_BASE);
    assert.equal(fovAt(1), GLIDER_CAM_FOV_TOP);
    assert.equal(speedFraction(55, 110), 0.5);
    assert.equal(speedFraction(220, 110), 1);
    assert.equal(speedFraction(-110, 110), 1);
  });

  it('bank leans into the turn, at most the bike’s 0.38', () => {
    assert.equal(bankAngleAt(1), GLIDER_CAM_BANK_MAX);
    assert.equal(bankAngleAt(-1), -GLIDER_CAM_BANK_MAX);
    assert.equal(bankAngleAt(0), 0);
    assert.ok(Math.abs(bankAngleAt(0.5) - 0.19) < 1e-9);
  });

  it('hover bob is the bike’s 0.25 at 2.2 rad/s', () => {
    assert.equal(gliderBobY(0), 0);
    assert.ok(Math.abs(gliderBobY(Math.PI / 2 / 2.2) - 0.25) < 1e-9);
  });

  it('camera sits behind the board and looks forward over the rider', () => {
    const pose = gliderCameraPose({
      pos: { x: 0, y: 35, z: -80 },
      yaw: 0,
      speedFrac: 0,
      lookYaw: 0,
      lookPitch: 0,
      dist: GLIDER_CAM_FOLLOW_DIST,
    });
    // Yaw 0 = nose +Z, so the camera trails at -Z.
    assert.equal(pose.cx, 0);
    assert.equal(pose.cz, -80 - GLIDER_CAM_FOLLOW_DIST);
    assert.equal(pose.cy, 35 + GLIDER_CAM_HEIGHT_ABOVE_BOARD);
    assert.equal(pose.rotY, Math.PI);
    // Level pitch still looks slightly DOWN at the rider (the
    // shoulders sit in the lower frame) — the down-tilt.
    assert.ok(pose.rotX < 0, `rotX ${pose.rotX} should tilt down`);
    assert.equal(pose.fov, GLIDER_CAM_FOV_BASE);
  });

  it('pitch moves only the view, never the camera height (the pitch law)', () => {
    const base = { pos: { x: 0, y: 35, z: -80 }, yaw: 0, speedFrac: 0, dist: GLIDER_CAM_FOLLOW_DIST };
    const level = gliderCameraPose({ ...base, lookPitch: 0 });
    const up = gliderCameraPose({ ...base, lookPitch: 0.5 });
    const down = gliderCameraPose({ ...base, lookPitch: -0.5 });
    assert.equal(up.cy, level.cy);
    assert.equal(down.cy, level.cy);
    assert.equal(up.cx, level.cx);
    assert.equal(up.cz, level.cz);
    assert.ok(Math.abs((up.rotX - level.rotX) - 0.5) < 1e-9, 'pitch tilts the view up');
    assert.ok(Math.abs((down.rotX - level.rotX) + 0.5) < 1e-9, 'pitch tilts the view down');
  });

  it('look yaw pans the view while the camera stays behind the board', () => {
    const base = { pos: { x: 0, y: 35, z: -80 }, yaw: 0, speedFrac: 0, dist: GLIDER_CAM_FOLLOW_DIST };
    const ahead = gliderCameraPose({ ...base, lookYaw: 0 });
    const aside = gliderCameraPose({ ...base, lookYaw: 0.8 });
    assert.equal(aside.cx, ahead.cx);
    assert.equal(aside.cy, ahead.cy);
    assert.equal(aside.cz, ahead.cz);
    assert.ok(Math.abs((aside.rotY - ahead.rotY) - 0.8) < 1e-9);
  });
});

describe('glider variants', () => {
  it('ships three variants, Dart first and default', () => {
    assert.equal(GLIDER_VARIANTS.length, 3);
    assert.deepEqual(GLIDER_VARIANTS.map((v) => v.id), ['dart', 'ember', 'aurora']);
    assert.equal(DEFAULT_GLIDER_VARIANT_ID, 'dart');
    assert.equal(getGliderVariant('ember').sail, '#ff3b30');
    assert.equal(getGliderVariant('aurora').sail, '#2dd4ff');
    assert.equal(getGliderVariant('dart').sail, '#00ff88');
    assert.equal(getGliderVariant('nope').id, 'dart');
    assert.equal(isGliderVariantId('aurora'), true);
    assert.equal(isGliderVariantId('nope'), false);
  });

  it('persists the pick in localStorage and refuses unknown ids', () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    };
    assert.equal(readGliderVariant(storage), 'dart');
    assert.equal(writeGliderVariant('aurora', storage), true);
    assert.equal(readGliderVariant(storage), 'aurora');
    assert.equal(writeGliderVariant('nope', storage), false);
    assert.equal(readGliderVariant(storage), 'aurora');
  });
});

describe('glider mesh (procedural, no GLB, no Disney assets)', () => {
  it('builds board + mast + billowed sail + rigging + rider anchor', () => {
    const g = buildHubGlider('ember', null);
    try {
      assert.equal(g.name, 'hub-glider:ember');
      assert.ok(g.children.length >= 8, `children ${g.children.length}`);
      assert.ok(g.userData.riderAnchor, 'rider anchor exists');
      assert.ok(g.userData.procRider, 'procedural rider exists');
      assert.ok(g.userData.procRider.children.length >= 8, 'rider has legs, torso, arms, head');
      // The sail is the brightest, most light-catching part.
      const sail = g.userData.sailMat;
      assert.equal(sail.metalness, SAIL_METALNESS);
      assert.equal(sail.roughness, SAIL_ROUGHNESS);
      assert.equal(sail.envMapIntensity, SAIL_ENV_MAP_INTENSITY);
      assert.equal(SAIL_METALNESS, 0.95);
      assert.equal(SAIL_ROUGHNESS, 0.08);
      assert.equal(SAIL_ENV_MAP_INTENSITY, 1.5);
      assert.equal(sail.side, 2, 'DoubleSide — a sail is seen from both faces');
      assert.equal(sail.color.getHexString(), 'ff3b30');
      // No env-map without a renderer — the sail builds anyway
      // (dimmer, never a crash); the scene passes the hub gl.
      assert.equal(sail.envMap, null);
      // The rider leans forward into the sail.
      assert.ok(g.userData.riderAnchor.rotation.x > 0);
      // The sail geometry is billowed, not flat.
      const sailMesh = g.children.find((c) => c.material === sail);
      assert.ok(sailMesh, 'sail mesh present');
      const pos = sailMesh.geometry.attributes.position;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        minZ = Math.min(minZ, pos.getZ(i));
        maxZ = Math.max(maxZ, pos.getZ(i));
      }
      assert.ok(maxZ - minZ > 0.5, `sail belly depth ${maxZ - minZ}`);
    } finally {
      disposeHubGlider(g);
    }
  });

  it('every variant builds with its own sail colour', () => {
    for (const v of GLIDER_VARIANTS) {
      const g = buildHubGlider(v.id, null);
      try {
        assert.equal(g.userData.sailMat.color.getHexString(), v.sail.slice(1));
      } finally {
        disposeHubGlider(g);
      }
    }
  });

  it('length-class creatures never ride as GLBs — a T-Rex would swamp the board', () => {
    // The scene attaches a selected character only when it is
    // upright with a hosted GLB; this pins the data the guard reads.
    assert.equal(getEmbodiment('q021-t-rex').lengthM, 12);
    assert.ok(getEmbodiment('q021-t-rex').glbUrl, 'the T-Rex HAS a GLB — the guard must still refuse it');
    assert.equal(getEmbodiment('q020-neo').lengthM, null);
    assert.ok(getEmbodiment('q020-neo').glbUrl, 'an upright character with a GLB rides as itself');
    const src = read('../components/HomeScene.jsx');
    assert.match(src, /embodiment\.lengthM/);
  });
});

describe('glider scene wiring', () => {
  it('HomeScene has to_glider/on_glider branches driven by the camera module', () => {
    const src = read('../components/HomeScene.jsx');
    assert.match(src, /launchState === 'to_glider'/);
    assert.match(src, /launchState === 'on_glider'/);
    assert.match(src, /gliderCameraPose\(/);
    assert.match(src, /recenterLookOffset\(/);
    assert.match(src, /stepGliderFlight\(st, input, step, GLIDER_TUNING\)/);
    assert.match(src, /dismountGlider\(gliderStateRef\.current\)/);
    assert.match(src, /function HubGliderMesh/);
    // The camera numbers live in the module: the scene imports them
    // and never hard-codes a follow distance or FOV of its own.
    assert.match(src, /from '\.\.\/lib\/hub-glider-camera'/);
    assert.doesNotMatch(src, /FOLLOW_DIST = 8\.5/);
  });

  it('the page flips state only — no rider-state write for the glider', () => {
    const src = read('../app/page.jsx');
    assert.match(src, /const toggleGlider = \(\) => \{/);
    assert.match(src, /setAppState\('to_glider'\)/);
    assert.match(src, /setAppState\('hub_freeroam'\)/);
    const toggle = src.slice(src.indexOf('const toggleGlider'));
    const toggleBody = toggle.slice(0, toggle.indexOf('\n  };'));
    assert.doesNotMatch(toggleBody, /saveRiderState/);
  });

  it('the FLIGHT AXIS pill applies while gliding', () => {
    const src = read('../app/page.jsx');
    assert.match(src, /appState === 'on_glider'\) && !showEarthVehicleSelect/);
  });
});
