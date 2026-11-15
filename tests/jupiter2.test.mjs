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
  LIGHTNING_MONSTER_COUNT, DEMOBAT_COUNT, LEVER_POSITION,
  groundHeight, jupiter2Sky,
} from '../lib/jupiter2/profile.js';
import {
  createSpeederState, summonSpeeder, dismissSpeeder, dismountSpeeder,
  stepSpeeder, speedFor,
} from '../lib/jupiter2/speeder.js';
import {
  createLeverState, pullLever, confirmOblivion, cancelLever, leverStatus,
  LEVER_GREEN, LEVER_BEACON_HEIGHT, OBLIVION_WAIT_MS,
} from '../lib/jupiter2/lever.js';
import { lifeFor, growthStage, activityFor, homeFor, CREATURE_KINDS } from '../lib/jupiter2/operators.js';
import { flashAt, boltFor, rainBases, stormIntensity, RAIN_COUNT, J2_FLASH_CHANCE } from '../lib/jupiter2/storm.js';
import { buildSpeeder, buildOblivionLever } from '../lib/jupiter2/meshes.js';
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
    assert.ok(LEVER_POSITION.x !== 0 || LEVER_POSITION.z !== 0, 'the lever has a fixed place on the deck');
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
  it('NO death law: the spec orders none, so the creatures persist', () => {
    for (const kind of ['lightning-monster', 'demobat']) {
      const life = lifeFor(kind, 3, Date.now());
      assert.equal(life.death, null);
      assert.equal(life.dies, false);
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
      assert.equal(life.death, null);
      assert.equal(life.dies, false);
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
});
