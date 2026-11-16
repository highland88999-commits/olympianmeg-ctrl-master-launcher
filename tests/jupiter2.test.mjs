// tests/jupiter2.test.mjs — Jupiter 2 (Merlin, Nov 15 ~01:11, spec Nov 10).
// Route renders, speeder summon + ride, lever visible + confirm-gated,
// storm reads, creatures present. Run: node --test tests/jupiter2.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  JUPITER2_ROUTE, JUPITER2_ROUTE_KEY, WALK_SPEED, SPEEDER_SPEED,
  LIGHTNING_MONSTER_COUNT, DEMOBAT_COUNT, JUPITER2_SPHERE_R,
  groundHeight, jupiter2Sky,
} from '../lib/jupiter2/profile.js';
import {
  PLANET_R, CAVE_MOUTH_THETA_RAD, LEVER_CAVE_THETA_RAD,
  leverCavePoint, leverCaveMouthPoint, isInCave, thetaFromPole,
  spherePointFromDeck, deckToDir, deckForwardForYaw,
} from '../lib/jupiter2/planet.js';
import { sphereTangentBasis } from '../lib/planet-walker.js';
import {
  createSpeederState, summonSpeeder, dismissSpeeder, dismountSpeeder,
  stepSpeeder, speedFor, SPEEDER_MOUNTED_EYE_M,
} from '../lib/jupiter2/speeder.js';
import {
  createLeverState, pullLever, confirmOblivion, cancelLever, leverStatus,
  LEVER_GREEN, LEVER_BEACON_HEIGHT, OBLIVION_WAIT_MS,
} from '../lib/jupiter2/lever.js';
import { lifeFor, growthStage, activityFor, homeFor, CREATURE_KINDS } from '../lib/jupiter2/operators.js';
import { flashAt, boltFor, rainBases, stormIntensity, RAIN_COUNT, J2_FLASH_CHANCE } from '../lib/jupiter2/storm.js';
import {
  buildSpeeder, buildOblivionLever, buildLandspeederFlame,
  LANDSPEEDER_GLB_URL, LANDSPEEDER_NATIVE_SIZE_M, LANDSPEEDER_FIT_LENGTH_M,
  LANDSPEEDER_BASE_Y_M, LANDSPEEDER_YAW_FIX, landspeederFitScale,
  landspeederFittedSize,
} from '../lib/jupiter2/meshes.js';
import { LIGHTNING_MONSTER_MODELS, DEMOBAT_MODEL_ID, DEMOBAT_HEIGHT_M, modelUrlFor, lightningModelFor } from '../lib/jupiter2/models.js';
import { hawkinsModel } from '../lib/hawkins/models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('route', () => {
  it('the /jupiter-2 route file exists and exports the page', () => {
    const src = read('app/jupiter-2/page.jsx');
    assert.match(src, /export default function Jupiter2Page/);
    assert.match(src, /Jupiter2Scene/);
    // The summon button lives in the scene (Mars's TouchControls
    // pattern: the scene owns its own overlay controls).
    assert.match(read('components/jupiter2/Jupiter2Scene.jsx'), /SUMMON SPEEDER/);
    assert.equal(JUPITER2_ROUTE, '/jupiter-2');
    assert.equal(JUPITER2_ROUTE_KEY, 'jupiter-2');
  });
  it('the scene module exists and the page drives the shared day/night law', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'components/jupiter2/Jupiter2Scene.jsx')));
    const src = read('app/jupiter-2/page.jsx');
    assert.match(src, /timeOfDay01/);
    assert.match(src, /requestDayNightPlace/);
  });
});

describe('speeder (Earth 1 summon contract)', () => {
  it('summon spawns the speeder at the walker and auto-mounts it', () => {
    const sp = createSpeederState();
    assert.equal(sp.summoned, false);
    const ok = summonSpeeder(sp, { x: 10, z: 26, yaw: 0.6 });
    assert.equal(ok, true);
    assert.equal(sp.summoned, true);
    assert.equal(sp.mounted, true);
    assert.equal(sp.x, 10);
    assert.equal(sp.z, 26);
  });
  it('riding is faster than walking', () => {
    assert.ok(SPEEDER_SPEED > WALK_SPEED, `speeder ${SPEEDER_SPEED} must beat walk ${WALK_SPEED}`);
    assert.equal(speedFor('walk'), WALK_SPEED);
    assert.equal(speedFor('speeder'), SPEEDER_SPEED);
    const sp = createSpeederState();
    summonSpeeder(sp, { x: 0, z: 0, yaw: 0 });
    let speed = 0;
    for (let i = 0; i < 120; i++) speed = stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 1 / 60);
    assert.ok(speed > WALK_SPEED, `ride speed ${speed} must beat walk ${WALK_SPEED}`);
    assert.ok(Math.abs(speed - SPEEDER_SPEED) < 0.5, `ride settles at top speed ${SPEEDER_SPEED}, got ${speed}`);
    const x0 = sp.x;
    stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 1);
    assert.ok(Math.abs(sp.z - 0) > 0 || Math.abs(sp.x - x0) > 0, 'the speeder moves');
  });
  it('a parked speeder does not move', () => {
    const sp = createSpeederState();
    assert.equal(stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 1), 0);
  });
  it('dismount restores the walker to foot exactly where the craft was — and the speeder vanishes', () => {
    const sp = createSpeederState();
    summonSpeeder(sp, { x: 5, z: 5, yaw: 1 });
    for (let i = 0; i < 60; i++) stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 1 / 60);
    const pose = dismountSpeeder(sp);
    assert.equal(sp.summoned, false);
    assert.equal(sp.mounted, false);
    assert.equal(pose.x, sp.x);
    assert.equal(pose.z, sp.z);
    assert.equal(pose.yaw, sp.yaw);
    assert.ok(pose.x !== 5 || pose.z !== 5, 'the walker takes the speeder’s travelled place');
  });
  it('dismiss clears the speeder', () => {
    const sp = createSpeederState();
    summonSpeeder(sp, { x: 0, z: 0, yaw: 0 });
    dismissSpeeder(sp);
    assert.equal(sp.summoned, false);
    assert.equal(sp.mounted, false);
  });
  it('analog steer turns in proportion — a slight hold turns gently, a hard hold at full rate', () => {
    const yawAfter = (steer, seconds = 1) => {
      const sp = createSpeederState();
      summonSpeeder(sp, { x: 0, z: 0, yaw: 0 });
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        stepSpeeder(sp, { fwd: 0, back: 0, left: 0, right: 0, boost: false, steer }, 1 / 60);
      }
      return sp.yaw;
    };
    // Half deflection turns at half the 2.2 rad/s rate. Yaw speaks
    // the shared basis language (yaw+ = RIGHT), steer is +1 = LEFT,
    // so a left steer DECREASES the yaw and a right steer increases
    // it — the scene's steer = -scaled * sign(raw) is correct.
    assert.ok(Math.abs(yawAfter(0.5) + 1.1) < 0.05, `half left steer turns ~-1.1 rad, got ${yawAfter(0.5)}`);
    // Full deflection turns at the full rate, either way.
    assert.ok(Math.abs(yawAfter(1) + 2.2) < 0.05, `full left steer turns ~-2.2 rad, got ${yawAfter(1)}`);
    assert.ok(Math.abs(yawAfter(-1) - 2.2) < 0.05, `full right steer turns ~+2.2 rad, got ${yawAfter(-1)}`);
    // A centred stick (steer 0) turns nothing, even with a left key held — the stick is the active device.
    const sp = createSpeederState();
    summonSpeeder(sp, { x: 0, z: 0, yaw: 0 });
    stepSpeeder(sp, { fwd: 0, back: 0, left: 1, right: 0, boost: false, steer: 0 }, 1);
    assert.equal(sp.yaw, 0);
    // Steer clamps to -1..1 instead of spinning faster than full rate.
    assert.ok(Math.abs(yawAfter(2) + 2.2) < 0.05, `steer 2 clamps to full rate, got ${yawAfter(2)}`);
  });
  it('the speeder drives nose-first: heading is the shared basis forward, never its mirror', () => {
    // The old step drove along (-sin yaw, -cos yaw) — the mirror of
    // sphereTangentBasis forward — so at spawn yaw 0.6 it crabbed
    // 69° off the view, almost straight to screen-left. Drive a
    // full second at top speed and the displacement must lie in the
    // forward/up plane: along the basis forward, ~nothing sideways.
    const drive = (yaw) => {
      const sp = createSpeederState();
      summonSpeeder(sp, { x: 0, z: 0, yaw });
      sp.speed = SPEEDER_SPEED;
      const before = spherePointFromDeck(sp.x, sp.z);
      stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 1);
      const after = spherePointFromDeck(sp.x, sp.z);
      const d = { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
      const n = Math.hypot(d.x, d.y, d.z) || 1;
      const basis = sphereTangentBasis(before, sp.yaw, PLANET_R);
      return {
        along: (basis.forward.x * d.x + basis.forward.y * d.y + basis.forward.z * d.z) / n,
        sideways: (basis.right.x * d.x + basis.right.y * d.y + basis.right.z * d.z) / n,
      };
    };
    const straight = drive(0.6);
    // The chord over a full second dips radially (terrain + sphere
    // curve), so `along` reads ~0.98, not 1 — the decisive pin is
    // `sideways`: a mirrored heading crabbed at -0.92 across the
    // view, a nose-first heading reads ~0 sideways.
    assert.ok(straight.along > 0.95, `straight at yaw 0.6 drives along the view, got ${straight.along}`);
    assert.ok(Math.abs(straight.sideways) < 0.02, `no sideways crab at yaw 0.6, got ${straight.sideways}`);
    // Stick right (steer -1) turns the heading right, then the craft
    // still drives along its new nose — the turn and the travel agree.
    const sp = createSpeederState();
    summonSpeeder(sp, { x: 0, z: 0, yaw: 0.6 });
    stepSpeeder(sp, { fwd: 0, back: 0, left: 0, right: 0, boost: false, steer: -1 }, 0.5);
    assert.ok(Math.abs(sp.yaw - 1.7) < 0.05, `stick right turns the yaw up (right), got ${sp.yaw}`);
    sp.speed = SPEEDER_SPEED;
    const before = spherePointFromDeck(sp.x, sp.z);
    stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 1);
    const after = spherePointFromDeck(sp.x, sp.z);
    const d = { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
    const n = Math.hypot(d.x, d.y, d.z) || 1;
    const basis = sphereTangentBasis(before, sp.yaw, PLANET_R);
    const along = (basis.forward.x * d.x + basis.forward.y * d.y + basis.forward.z * d.z) / n;
    const sideways = (basis.right.x * d.x + basis.right.y * d.y + basis.right.z * d.z) / n;
    assert.ok(along > 0.95, `after a right turn the craft still drives along its nose, got ${along}`);
    assert.ok(Math.abs(sideways) < 0.02, `after a right turn there is still no sideways crab, got ${sideways}`);
  });
  it('the deck-Jacobian step kills the residual rim crab: cap < 0.1°, sideways 0', () => {
    // The flat (sin yaw, −cos yaw) step was only pole-exact: it
    // crabbed 19.88° at (−60,−60) yaw 0 on the deck cap and
    // 180° (fully backwards) at (0,−165) past the drop. The
    // helper steps along the shared basis forward instead — so
    // measure the angle between the helper's infinitesimal deck
    // step and the basis forward, over the cap and past the drop.
    const residual = (x, z, yaw) => {
      const feet = spherePointFromDeck(x, z);
      const basis = sphereTangentBasis(feet, yaw, PLANET_R);
      const f = deckForwardForYaw(x, z, yaw);
      const a0 = deckToDir(x, z);
      const a1 = deckToDir(x + f.x * 0.01, z + f.z * 0.01);
      const t = { x: a1.x - a0.x, y: a1.y - a0.y, z: a1.z - a0.z };
      const n = Math.hypot(t.x, t.y, t.z) || 1;
      const dot = (basis.forward.x * t.x + basis.forward.y * t.y + basis.forward.z * t.z) / n;
      return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    };
    const yaws = [0, 0.6, 1.3, 2.1, -0.9, 3.0];
    let worstCap = 0;
    let worstPast = 0;
    for (let x = -170; x <= 170; x += 5) {
      for (let z = -170; z <= 170; z += 5) {
        const r = Math.hypot(x, z);
        if (r > 170) continue;
        for (const yaw of yaws) {
          const off = residual(x, z, yaw);
          if (r <= 85 && off > worstCap) worstCap = off;
          if (off > worstPast) worstPast = off;
        }
      }
    }
    // Measured with the real modules: 0.022° on the cap, 0.097°
    // past the drop — against 19.88° / 180° for the flat step.
    assert.ok(worstCap < 0.1, `worst residual on the deck cap ${worstCap.toFixed(4)}° must stay under 0.1°`);
    assert.ok(worstPast < 0.2, `worst residual past the drop ${worstPast.toFixed(4)}° must stay under 0.2°`);
    // And in the nose-first test scenario the helper gives
    // sideways = 0.0000 — the real pin (the 28 m chord dips over
    // sphere curvature + terrain, so `along` reads 0.9799 there,
    // not 1 — do NOT re-tighten the along > 0.95 pin to 0.98).
    for (const yaw of [0.6, 1.7]) {
      const sp = createSpeederState();
      summonSpeeder(sp, { x: 0, z: 0, yaw });
      sp.speed = SPEEDER_SPEED;
      const before = spherePointFromDeck(sp.x, sp.z);
      stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 1);
      const after = spherePointFromDeck(sp.x, sp.z);
      const d = { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
      const n = Math.hypot(d.x, d.y, d.z) || 1;
      const basis = sphereTangentBasis(before, sp.yaw, PLANET_R);
      const sideways = (basis.right.x * d.x + basis.right.y * d.y + basis.right.z * d.z) / n;
      assert.ok(Math.abs(sideways) < 0.0001, `sideways at yaw ${yaw} is ${sideways.toFixed(4)}, must read 0.0000`);
    }
  });
  it('no steer given keeps the binary WASD steering exactly as before', () => {
    const sp = createSpeederState();
    summonSpeeder(sp, { x: 0, z: 0, yaw: 0 });
    for (let i = 0; i < 60; i++) stepSpeeder(sp, { fwd: 0, back: 0, left: 1, right: 0, boost: false }, 1 / 60);
    assert.ok(Math.abs(sp.yaw + 2.2) < 0.05, `left key still turns at 2.2 rad/s (yaw decreases: left), got ${sp.yaw}`);
    const sp2 = createSpeederState();
    summonSpeeder(sp2, { x: 0, z: 0, yaw: 0 });
    stepSpeeder(sp2, { fwd: 0, back: 0, left: 0, right: 0, boost: false, steer: null }, 1);
    assert.equal(sp2.yaw, 0, 'a null steer (stick untouched) turns nothing and leaves the keys live');
  });
});

describe('oblivion lever (confirm-gated)', () => {
  it('the lever is green and carries a tall beacon that reads through the storm', () => {
    assert.equal(LEVER_GREEN, '#22ff66');
    assert.equal(LEVER_BEACON_HEIGHT, 60);
    const lever = buildOblivionLever();
    assert.equal(lever.userData.kind, 'oblivion-lever');
    assert.equal(lever.userData.orbMat.color.getHexString(), '22ff66');
    assert.equal(lever.userData.beaconMat.color.getHexString(), '22ff66');
    // A real light, not just a colour — the beacon glows at range.
    const lights = [];
    lever.traverse((o) => { if (o.isPointLight) lights.push(o); });
    assert.equal(lights.length, 1);
    assert.equal(lights[0].color.getHexString(), '22ff66');
    // The beacon column is tall (60 m) by construction.
    const beacon = lever.children.find((c) => c.material === lever.userData.beaconMat);
    assert.ok(beacon.geometry.parameters.height >= 60);
    // The lever's place is inside the cave, not on the deck
    // (Merlin, Nov 16 ~00:02 — the full-planet rework): θ=1.40
    // from the spawn pole, inside the cave passage, with the
    // mouth at θ=1.25 facing back toward the drop.
    assert.equal(JUPITER2_SPHERE_R, 88);
    assert.equal(PLANET_R, 88);
    assert.equal(LEVER_CAVE_THETA_RAD, 1.40);
    assert.equal(CAVE_MOUTH_THETA_RAD, 1.25);
    const caveLever = leverCavePoint();
    assert.ok(Math.abs(thetaFromPole(caveLever) - 1.40) < 1e-9);
    assert.equal(isInCave(caveLever), true, 'the lever stands inside the cave');
    const mouth = leverCaveMouthPoint();
    assert.ok(Math.abs(thetaFromPole(mouth) - 1.25) < 1e-9);
    assert.ok(mouth.z > caveLever.z, 'the mouth faces back toward the drop');
  });
  it('pulling without confirming does NOTHING destructive — armed stays false', () => {
    const lv = createLeverState();
    const res = pullLever(lv, Date.now());
    assert.equal(res.action, 'warn');
    assert.equal(lv.armed, false);
    assert.equal(lv.warned, true);
    assert.equal(leverStatus(lv).phase, 'warned');
  });
  it('confirming an idle lever arms nothing', () => {
    const lv = createLeverState();
    const rec = confirmOblivion(lv, Date.now());
    assert.equal(rec.armed, false);
    assert.equal(lv.armed, false);
  });
  it('the confirm path arms the 72-hour oblivion countdown', () => {
    const lv = createLeverState();
    pullLever(lv, 1000);
    const rec = confirmOblivion(lv, 1000);
    assert.equal(rec.armed, true);
    assert.equal(rec.endsAtMs, 1000 + OBLIVION_WAIT_MS);
    assert.equal(rec.countdown, '72:00:00');
    assert.equal(leverStatus(lv, 1000).phase, 'armed');
    assert.equal(leverStatus(lv, 1000).countdown, '72:00:00');
  });
  it('standing down from the warning leaves the world untouched', () => {
    const lv = createLeverState();
    pullLever(lv, Date.now());
    cancelLever(lv);
    assert.equal(lv.armed, false);
    assert.equal(lv.warned, false);
    assert.equal(leverStatus(lv).phase, 'idle');
  });
});

describe('storm reads (street level)', () => {
  it('lightning flashes on the seeded schedule — busier than the hub sphere, still mostly dark', () => {
    let sawFlash = false;
    let sawDark = false;
    let count = 0;
    for (let t = 0; t < 120000; t += 90) {
      const f = flashAt(Date.UTC(2026, 10, 15) + t);
      assert.ok(f >= 0 && f <= 1, `flash ${f} in 0..1`);
      if (f > 0.5) sawFlash = true;
      if (f === 0) sawDark = true;
      else count++;
    }
    assert.ok(sawFlash, 'the storm flashes');
    assert.ok(sawDark, 'the storm is dark between flashes');
    // MORE LIGHTNING (Merlin, Nov 15 ~14:44): J2 flashes on ~28%
    // of slices, double the shared kit's ~14% — 442 flashing
    // slices in this window (measured), against 138 at the old
    // rate. The sky stays mostly dark (892 of 1334 slices).
    assert.equal(J2_FLASH_CHANCE, 0.28);
    assert.ok(count > 300 && count < 600, `busier storm flashes ${count} slices, expected ~442`);
  });
  it('a bolt has a jagged sky-to-ground path while the flash is live', () => {
    // Find a flashing instant deterministically, then check the bolt.
    let bolt = null;
    for (let t = 0; t < 120000; t += 90) {
      const now = Date.UTC(2026, 10, 15) + t;
      if (flashAt(now) >= 0.45) { bolt = boltFor(now); break; }
    }
    assert.ok(bolt, 'a flashing instant exists in the window');
    assert.ok(bolt.points.length >= 8, 'the bolt is a jagged polyline');
    assert.equal(bolt.points[0].y, 42);
    assert.equal(bolt.points[bolt.points.length - 1].y, 0);
  });
  it('wind-driven rain is present in volume', () => {
    assert.equal(RAIN_COUNT, 900);
    const bases = rainBases();
    assert.equal(bases.length, 900);
    for (const b of bases) {
      assert.ok(b.y >= 0 && b.y <= 22);
      assert.ok(b.speed >= 16 && b.speed <= 26);
    }
  });
  it('storm strength breathes in 0..1', () => {
    for (let t = 0; t < 600000; t += 30000) {
      const s = stormIntensity(Date.UTC(2026, 10, 15) + t);
      assert.ok(s >= 0 && s <= 1);
    }
  });
  it('the deck is walkable ground and the storm sky dims by day/night', () => {
    for (let x = -80; x <= 80; x += 20) {
      for (let z = -80; z <= 80; z += 20) {
        const h = groundHeight(x, z);
        assert.ok(Number.isFinite(h) && Math.abs(h) <= 1.3, `ground ${h} at ${x},${z}`);
      }
    }
    const day = jupiter2Sky(0.5);
    const night = jupiter2Sky(0.95);
    assert.ok(day.dayF > night.dayF);
    assert.ok(day.fogFar > night.fogFar, 'night visibility is shorter than day');
    assert.ok(night.fogFar >= 26, 'fog never closes below reading range');
  });
});

describe('creatures', () => {
  it('lightning monsters live on the surface and demobats in the air', () => {
    assert.equal(LIGHTNING_MONSTER_COUNT, 7);
    assert.equal(DEMOBAT_COUNT, 9);
    assert.equal(CREATURE_KINDS['lightning-monster'].realm, 'surface');
    assert.equal(CREATURE_KINDS.demobat.realm, 'air');
  });
  it('each creature has a pure clock-driven life: birth, growth, diet, habit', () => {
    const now = Date.UTC(2026, 10, 15, 12, 0, 0);
    for (const kind of ['lightning-monster', 'demobat']) {
      const life = lifeFor(kind, 0, now);
      assert.ok(life.birthMs <= now, 'born before now');
      assert.ok(['spark', 'juvenile', 'adult', 'elder'].includes(life.stage));
      assert.ok(life.diet.length > 10);
      assert.ok(life.habit.length > 10);
      assert.ok(life.activity.length > 3);
      // Same place + same time = same life, on any phone.
      assert.deepEqual(lifeFor(kind, 0, now), life);
    }
  });
  it('growth stages advance with age', () => {
    assert.equal(growthStage('lightning-monster', 10), 'spark');
    assert.equal(growthStage('lightning-monster', 150), 'juvenile');
    assert.equal(growthStage('lightning-monster', 300), 'adult');
    assert.equal(growthStage('lightning-monster', 400), 'elder');
  });
  it('activity changes with the device clock hour', () => {
    // Local-time instants: the operator reads the device-local hour,
    // so UTC-built instants shift buckets with the timezone (in
    // America/Resolute, UTC 02:00 and 08:00 are both local night).
    assert.notEqual(
      activityFor('demobat', new Date(2026, 10, 15, 2).getTime()),
      activityFor('demobat', new Date(2026, 10, 15, 8).getTime()),
    );
  });
  it('death is REAL now: the old no-death law is superseded (Merlin, Nov 16 ~00:08)', () => {
    // The spec ordered no death law in the first build; the agents
    // order superseded it — every monster ages, dies, decomposes,
    // and is reborn in the same slot (see tests/jupiter2-agents.test.mjs).
    for (const kind of ['lightning-monster', 'dragon', 'demobat']) {
      const life = lifeFor(kind, 3, Date.now());
      assert.equal(life.dies, true);
      assert.notEqual(life.death, null);
      assert.equal(life.death.cause, 'age');
    }
  });
  it('homes are spread inside the world disc', () => {
    for (const kind of ['lightning-monster', 'demobat']) {
      const seen = new Set();
      for (let i = 0; i < 9; i++) {
        const h = homeFor(kind, i);
        assert.ok(Math.hypot(h.x, h.z) <= 78, 'home inside the disc');
        seen.add(`${h.x.toFixed(2)},${h.z.toFixed(2)}`);
      }
      assert.equal(seen.size, 9, 'homes are spread, not stacked');
    }
  });
  it('the creatures are real GLBs, not placeholders — the procedural builders are gone', () => {
    const meshesSrc = read('lib/jupiter2/meshes.js');
    assert.doesNotMatch(meshesSrc, /export function buildLightningMonster/);
    assert.doesNotMatch(meshesSrc, /export function buildDemobat/);
    assert.doesNotMatch(meshesSrc, /buildLightningMonster\(|buildDemobat\(/);
    const sceneSrc = read('components/jupiter2/Jupiter2Scene.jsx');
    assert.match(sceneSrc, /instantiateHawkins/);
    assert.match(sceneSrc, /kickOffGlb/);
    assert.doesNotMatch(sceneSrc, /buildLightningMonster\(|buildDemobat\(/);
    // The speeder and the lever stay procedural.
    const speeder = buildSpeeder();
    assert.equal(speeder.userData.kind, 'speeder');
    assert.ok(speeder.userData.glowMat, 'the speeder has an underglow');
  });
  it('the lightning roster is the Monsterverse lightning seats — seven slots, six distinct real models', () => {
    assert.equal(LIGHTNING_MONSTER_MODELS.length, 7);
    assert.equal(LIGHTNING_MONSTER_COUNT, 7);
    const keys = LIGHTNING_MONSTER_MODELS.map((m) => m.key);
    assert.equal(new Set(keys).size, 6, 'six distinct models; Volta stands twice');
    assert.equal(keys.filter((k) => k === 'slot-19').length, 2, 'the repeat is Volta');
    for (const m of LIGHTNING_MONSTER_MODELS) {
      assert.ok(m.name.length > 2);
      assert.ok(m.blurb.length > 10);
      assert.ok(m.heightM >= 1.5 && m.heightM <= 4, `${m.name} stands ${m.heightM} m`);
      const url = modelUrlFor(m.key);
      assert.equal(url, `/models/hollow-earth/${m.key}.glb`);
      const disk = path.join(__dirname, '..', 'public', 'models', 'hollow-earth', `${m.key}.glb`);
      assert.ok(fs.existsSync(disk), `${m.key}.glb on disk`);
      assert.ok(fs.statSync(disk).size > 100000, `${m.key}.glb is a real file, not a stub`);
    }
    // The two lightning seats with NO GLB on disk stay out — no
    // placeholder stands in for them.
    for (const missing of ['slot-16', 'slot-39']) {
      assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', 'models', 'hollow-earth', `${missing}.glb`)), `${missing} has no GLB`);
      assert.ok(!keys.includes(missing));
    }
  });
  it('the demobat is the Hawkins GLB', () => {
    const entry = hawkinsModel(DEMOBAT_MODEL_ID);
    assert.ok(entry, 'demobats in the Hawkins manifest');
    assert.equal(entry.file, '/models/hawkins/demobats.glb');
    assert.equal(entry.status, 'placed');
    const disk = path.join(__dirname, '..', 'public', 'models', 'hawkins', 'demobats.glb');
    assert.ok(fs.existsSync(disk), 'demobats.glb on disk');
    assert.ok(fs.statSync(disk).size > 100000, 'demobats.glb is a real file, not a stub');
    assert.equal(DEMOBAT_COUNT, 9);
    assert.ok(DEMOBAT_HEIGHT_M > 0 && DEMOBAT_HEIGHT_M <= 4);
  });
  it('life lines name the real creatures', () => {
    const names = ['Volta', 'Auric Storm', 'Howler', 'Stormwing', 'Aureline the Dawnscale', "Liberty 'Lib' Talon", 'Volta'];
    names.forEach((name, i) => {
      const life = lifeFor('lightning-monster', i, Date.UTC(2026, 10, 15, 12, 0, 0));
      assert.equal(life.name, name, `slot ${i} is ${name}`);
      assert.equal(life.model, LIGHTNING_MONSTER_MODELS[i].key);
      assert.ok(life.blurb.length > 10);
      assert.equal(life.dies, true, 'every monster dies now');
      assert.equal(life.death.cause, 'age');
    });
    assert.equal(lightningModelFor(7).key, 'slot-19', 'the roster wraps');
    const bat = lifeFor('demobat', 0, Date.UTC(2026, 10, 15, 12, 0, 0));
    assert.equal(bat.name, 'Demobat');
    assert.equal(bat.model, 'demobats');
  });
  it('the scene mounts the real loaders and the CGI atmosphere', () => {
    const sceneSrc = read('components/jupiter2/Jupiter2Scene.jsx');
    assert.match(sceneSrc, /from '@\/lib\/hawkins\/loader'/);
    assert.match(sceneSrc, /from '@\/app\/hollow-earth\/model-loader'/);
    assert.match(sceneSrc, /cloudLayerTexture/, 'storm-cloud dome');
    assert.match(sceneSrc, /murk/, 'low murk layer');
    assert.match(sceneSrc, /twinRef/, 'twin bolt on hard flashes');
    assert.match(sceneSrc, /flash \* 8/, 'flash light driven harder');
    assert.match(sceneSrc, /spotTex\.rotation = spinAngle/, 'the Red Spot turns');
    assert.match(sceneSrc, /washMat\.opacity = flash \* 0\.3/, 'lightning-lit sky wash');
    // No new real lights: the scene's only lights are the day/night
    // rig, the lever beacon's own light (in meshes.js), and the one
    // flash directional. Count the light elements in this file.
    const lights = (sceneSrc.match(/<directionalLight|<pointLight|<ambientLight|<hemisphereLight/g) || []);
    assert.equal(lights.length, 5, `lights in the scene: ${lights.join(', ')}`);
  });
  it('the page warms the creature downloads before the scene mounts', () => {
    const pageSrc = read('app/jupiter-2/page.jsx');
    assert.match(pageSrc, /prefetchHawkins\(DEMOBAT_MODEL_ID\)/);
    assert.match(pageSrc, /preloadGlb\(modelUrlFor\(m\.key\)\)/);
  });
  it('the scene is a sphere world now — no flat disc, no world-edge clamp', () => {
    const sceneSrc = read('components/jupiter2/Jupiter2Scene.jsx');
    // The ground is a sphere, displaced by the planet geography.
    assert.match(sceneSrc, /new THREE\.SphereGeometry\(JUPITER2_SPHERE_R, 96, 64\)/);
    assert.match(sceneSrc, /groundRadiusAt/);
    // The walker steps on the sphere, not the flat disc.
    assert.match(sceneSrc, /stepJupiter2Walker/);
    assert.doesNotMatch(sceneSrc, /stepFlatWalker/);
    // No clamp keeps the walker inside the old disc.
    assert.doesNotMatch(sceneSrc, /clamp\(walkerRef\.current\.x, -MOVE_R/);
    assert.doesNotMatch(sceneSrc, /MOVE_R/);
    // The mountain + cave stand on the sphere.
    assert.match(sceneSrc, /buildMountain/);
    assert.match(sceneSrc, /groundPointAt\(dirAt\(MOUNTAIN_THETA_RAD, MOUNTAIN_AZIMUTH\)\)/);
    // Every creature wears a 59 m aura ring; the brain tick runs
    // the strikes, the burns and the walker HP.
    assert.match(sceneSrc, /auraRingPoints/);
    assert.match(sceneSrc, /AURA_R_M/);
    assert.match(sceneSrc, /BURNING/);
    assert.match(sceneSrc, /THE STORM TOOK YOU/);
    // The camera looks along the sphere (surface normal is up),
    // and the orbit target is the spawn pole, not the disc centre.
    assert.match(sceneSrc, /sphereSurfaceUp/);
    assert.match(sceneSrc, /target=\{\[0, JUPITER2_SPHERE_R, 0\]\}/);
  });
});

describe('speeder GLB (landspeeder swap, Merlin Nov 16 ~01:11)', () => {
  const approx = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

  it('the speeder is the real Star Wars landspeeder GLB, on disk and intact', () => {
    assert.equal(LANDSPEEDER_GLB_URL, '/models/star-wars/landspeeder.glb');
    const p = path.join(__dirname, '..', 'public/models/star-wars/landspeeder.glb');
    assert.ok(fs.existsSync(p), 'landspeeder.glb exists');
    const buf = fs.readFileSync(p);
    assert.equal(buf.length, 697624, '697,624 bytes, not truncated');
    assert.equal(buf.toString('ascii', 0, 4), 'glTF');
    assert.equal(buf.readUInt32LE(4), 2, 'glTF v2');
    assert.equal(buf.readUInt32LE(8), buf.length, 'declared length matches actual bytes');
    // The same file Tatooine rides: the Star Wars registry seats it.
    const lm = read('app/star-wars/landmarks.js');
    assert.match(lm, /url: '\/models\/star-wars\/landspeeder\.glb'/);
    assert.match(lm, /yawFix: Math\.PI/);
  });
  it('buildSpeeder returns a GLB slot + flame, never the procedural wedge', () => {
    const g = buildSpeeder();
    assert.equal(g.userData.kind, 'speeder');
    assert.equal(g.userData.glbUrl, LANDSPEEDER_GLB_URL);
    const slot = g.children.find((c) => c.name === 'glb:landspeeder');
    assert.ok(slot, 'the GLB slot is there');
    assert.equal(slot.rotation.y, Math.PI, 'slot turned half a turn: the +Z nose faces -Z forward');
    // No hull meshes at all: the only geometry in the group is the
    // flame's cones (the GLB itself loads async in the browser).
    const geos = [];
    g.traverse((o) => { if (o.isMesh) geos.push(o.geometry.type); });
    assert.deepEqual(geos.sort(), ['ConeGeometry', 'ConeGeometry']);
    // The old wedge is gone from the source, not just unbuilt.
    const src = read('lib/jupiter2/meshes.js');
    assert.doesNotMatch(src, /BoxGeometry\(1\.1, 0\.32, 3\.2\)/);
    assert.doesNotMatch(src, /glow = new THREE\.Mesh\(new THREE\.PlaneGeometry/);
    assert.match(src, /MeshoptDecoder/, 'meshopt-compressed GLB needs the decoder');
  });
  it('the fit keeps the placeholder footprint, hover height and heading', () => {
    const fit = landspeederFittedSize();
    assert.ok(approx(landspeederFitScale(), LANDSPEEDER_FIT_LENGTH_M / LANDSPEEDER_NATIVE_SIZE_M.z, 0.001));
    assert.ok(approx(fit.length, 4.4), `fitted length ${fit.length} — the old wedge's 4.4 m`);
    assert.ok(approx(fit.width, 3.01), `fitted width ${fit.width} — the model's own wide flat hull`);
    assert.ok(approx(fit.height, 1.06), `fitted height ${fit.height}`);
    assert.equal(fit.baseY, LANDSPEEDER_BASE_Y_M);
    assert.equal(LANDSPEEDER_BASE_Y_M, 0.27, 'base at the old runners\' bottom: same hover clearance');
    assert.ok(approx(fit.topY, 1.33), `top ${fit.topY}`);
    assert.equal(LANDSPEEDER_YAW_FIX, Math.PI, 'nose (+Z in the GLB) turned to the -Z forward');
    // The camera cannot clip the model: the fitted top (1.33 m
    // above the group origin) stays well under the mounted eye.
    assert.equal(SPEEDER_MOUNTED_EYE_M, 2.2);
    assert.ok(fit.topY < SPEEDER_MOUNTED_EYE_M, 'top 1.33 m < mounted eye 2.2 m');
  });
  it('the blue engine flame is the Star Wars one: dark parked, lit while driving', () => {
    const flame = buildLandspeederFlame();
    assert.equal(flame.group.name, 'exhaust-flame');
    assert.equal(flame.group.visible, false, 'dark parked');
    assert.equal(flame.outer.material.color.getHex(), 0x2a7bff, 'outer cone: Star Wars blue');
    assert.equal(flame.inner.material.color.getHex(), 0xbfe6ff, 'inner cone: pale blue-white');
    assert.equal(flame.outer.material.blending, 2, 'additive (THREE.AdditiveBlending)');
    assert.equal(flame.outer.rotation.x, Math.PI / 2, 'cone tip points +Z, out the rear');
    // The plume base sits just inside the tail (half-length 2.2)
    // and the tip trails behind the craft.
    const k = LANDSPEEDER_FIT_LENGTH_M / 5.6;
    assert.ok(approx(flame.outer.position.z, 2.4 * k), `outer z ${flame.outer.position.z}`);
    assert.ok(flame.outer.position.z < 2.2, 'flame base inside the tail');
    assert.ok(flame.outer.position.z + 1.7 * k > 2.2, 'flame tip trails past the tail');
    // The scene group carries the flame and the glow material the
    // frame loop brightens at speed is the outer flame material.
    const g = buildSpeeder();
    assert.ok(g.userData.flame, 'flame rides the speeder group');
    assert.equal(g.userData.flame.group.name, 'exhaust-flame');
    assert.equal(g.userData.glowMat, g.userData.flame.outer.material);
  });
  it('the scene drives the flame (visible + flicker) and keeps the speed glow', () => {
    const sceneSrc = read('components/jupiter2/Jupiter2Scene.jsx');
    assert.match(sceneSrc, /speederGroup\.userData\.flame/, 'scene reads the flame from userData');
    assert.match(sceneSrc, /flame\.group\.visible = driving/, 'lit only while driving');
    assert.match(sceneSrc, /Math\.abs\(sp\.speed\) > 1/, 'driving threshold');
    assert.match(sceneSrc, /flame\.outer\.scale\.set\(w, \(0\.7 \+ 0\.6 \* ratio\) \* flick, w\)/);
    assert.match(sceneSrc, /speederGroup\.userData\.glowMat\.opacity = 0\.6 \+/);
    assert.match(sceneSrc, /import \{ buildSpeeder, buildOblivionLever, buildMountain \} from '@\/lib\/jupiter2\/meshes'/);
  });
});

describe('speeder auto-center + no motion walls (Merlin, Nov 16 ~02:41-02:44)', () => {
  it('the auto-center is the ONE shared helper in lib/planet-walker.js — J2 speeder is the first consumer, no local copy', () => {
    const walker = read('lib/planet-walker.js');
    const sceneSrc = read('components/jupiter2/Jupiter2Scene.jsx');
    // The helper lives in the shared module and takes only an
    // offset + dt (vehicle-agnostic — no J2 constant inside).
    assert.match(walker, /export const LOOK_RECENTER_RATE = 0\.8/);
    assert.match(walker, /export function recenterLookOffset\(offset, dt, rate = LOOK_RECENTER_RATE\)/);
    assert.match(walker, /export function lookOffsetFromHeading\(yawTarget, heading\)/);
    assert.match(walker, /export function wrapAngle\(rad\)/);
    // The scene consumes it — and defines no local rate of its own
    // (it names the shared LOOK_RECENTER_RATE only in a comment).
    assert.match(sceneSrc, /recenterLookOffset, lookOffsetFromHeading \} from '@\/lib\/planet-walker'/);
    assert.match(sceneSrc, /recenterLookOffset\(/);
    assert.match(sceneSrc, /lookOffsetFromHeading\(yawTarget\.current, sp\.yaw\)/);
    assert.doesNotMatch(sceneSrc, /const LOOK_RECENTER_RATE|const RECENTER_RATE|recenterRate =/);
    // The ease runs only while mounted, only after a real look-drag
    // (a tap never starts it), and a new drag cancels it.
    assert.match(sceneSrc, /if \(recenterRef\.current\) \{/);
    assert.match(sceneSrc, /if \(moved\) \{/);
    assert.match(sceneSrc, /if \(sp && sp\.summoned && sp\.mounted\) recenterRef\.current = true;/);
    assert.match(sceneSrc, /recenterRef\.current = false;/);
  });
  it('no motion walls on Jupiter 2: the walker climbs, the speeder wraps, nothing clamps or turns back', () => {
    const planet = read('lib/jupiter2/planet.js');
    const speeder = read('lib/jupiter2/speeder.js');
    const sceneSrc = read('components/jupiter2/Jupiter2Scene.jsx');
    // The walker step has no position clamp and no turn-back: a
    // rise climbs, a drop falls airborne.
    assert.match(planet, /A rise is a climb, never a wall/);
    assert.doesNotMatch(planet, /clampBounds|turnBack|turn-back/);
    // The speeder step integrates its position freely (no clamp on
    // x/z); the flat (x, z) maps onto the sphere and wraps past
    // the antipode instead of turning back.
    assert.doesNotMatch(speeder, /clamp/);
    // The heading is the shared basis forward, read through the
    // deck-Jacobian helper deckForwardForYaw — the flat
    // (sin yaw, −cos yaw) step was only pole-exact and crabbed
    // up to ~20° on the rim; the old line drove along
    // (−sin yaw, −cos yaw), the mirror.
    assert.match(speeder, /const f = deckForwardForYaw\(state\.x, state\.z, state\.yaw\);/);
    assert.match(speeder, /state\.x \+= f\.x \* state\.speed \* dt;/);
    assert.match(speeder, /state\.z \+= f\.z \* state\.speed \* dt;/);
    assert.match(sceneSrc, /instead of being clamped and turned back/);
    // The cave corridor has no walls in the ground law, and the
    // drop stays a drop (a fall, not a barrier).
    assert.match(planet, /with NO wall at the cave corridor/);
    assert.match(planet, /Walked off a drop bigger than one step: go airborne and fall/);
  });
  it('the riding hint fits two lines now (was a cramped 3-line pill)', () => {
    const sceneSrc = read('components/jupiter2/Jupiter2Scene.jsx');
    assert.match(sceneSrc, /'SPEEDER · STICK\/WASD STEER · SHIFT BOOST · F FIRE'/);
    assert.match(sceneSrc, /'STICK\/WASD MOVE · DRAG LOOK · SPACE JUMP · B SUMMON SPEEDER'/);
    assert.doesNotMatch(sceneSrc, /SHIFT \/ BOOST · F FIRE/);
  });
});
