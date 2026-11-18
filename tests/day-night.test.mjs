// tests/day-night.test.mjs
// Day/night — the shared law (Merlin, 2026-11-14): every planet
// and realm runs Earth 2's cycle from the same clock, the nether
// daylight is red, and hellscape lightning sometimes sets a
// ground fire. These tests pin the pure law — no browser, no
// WebGL — so a scene that wires it wrong is the scene's bug,
// not the law's.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  solarPosition,
  skyPalette,
  dayNightFor,
  timeOfDay01,
  dateMsForSolarTime,
  moonPhaseDaylight,
  getDayNightPlace,
  FALLBACK_PLACE,
  netherPalette,
  NETHER_SHADES,
  NETHER_REALM_SHADE,
  NETHER_REALM_STORM,
  strikeDelaySeconds,
  strikePosition,
  strikeRoll,
  rollGroundFire,
  fireLifetimeMs,
  chooseGroundFireSpot,
  makeGroundFire,
  fireIntensity,
  isFireAlive,
  pruneFires,
  rgbStr,
  applyDayNightRig,
  STORM_STRIKE_MIN_S,
  STORM_STRIKE_MAX_S,
  STORM_FIRE_LIFETIME_MIN_MS,
  STORM_FIRE_LIFETIME_MAX_MS,
} from '../lib/day-night.js';

const NOON_EQUINOX = Date.UTC(2026, 2, 20, 12, 0);
const MIDNIGHT_EQUINOX = Date.UTC(2026, 2, 20, 0, 0);

describe('the shared cycle is Earth 2’s law', () => {
  it('noon on the equinox is day, midnight is night', () => {
    const day = dayNightFor(NOON_EQUINOX, 0, 0);
    assert.equal(day.phase, 'day');
    assert.equal(day.night, 0);
    assert.ok(day.sun.elevationDeg > 80, `elevation ${day.sun.elevationDeg}`);
    const night = dayNightFor(MIDNIGHT_EQUINOX, 0, 0);
    assert.equal(night.phase, 'night');
    assert.equal(night.night, 1);
    assert.ok(night.sun.elevationDeg < -16, `elevation ${night.sun.elevationDeg}`);
  });

  it('the clock read follows solar time', () => {
    const { clock } = dayNightFor(NOON_EQUINOX, 0, 0);
    assert.match(clock, /^\d\d:\d\d$/);
    const [h] = clock.split(':').map(Number);
    assert.ok(h >= 11 && h <= 12, `clock ${clock}`);
  });

  it('timeOfDay01 is ~0.5 at solar noon and ~0 at solar midnight', () => {
    const noon = timeOfDay01(NOON_EQUINOX, 0, 0);
    assert.ok(noon > 0.48 && noon < 0.52, `noon ${noon}`);
    const mid = timeOfDay01(MIDNIGHT_EQUINOX, 0, 0);
    assert.ok(mid < 0.02 || mid > 0.98, `midnight ${mid}`);
  });

  it('dateMsForSolarTime inverts timeOfDay01: the round trip lands on the target', () => {
    // Mars 2's TIME slider drives the rig through this — the
    // slider's 0..1 must become a real sun position, not just a
    // label. Round-trip each target through the same law.
    for (const target of [0.0, 0.26, 0.5, 0.72, 0.95]) {
      const dateMs = dateMsForSolarTime(target, -33.8688, 151.2093, NOON_EQUINOX);
      const back = timeOfDay01(dateMs, -33.8688, 151.2093);
      const diff = Math.min(Math.abs(back - target), 1 - Math.abs(back - target));
      assert.ok(diff < 0.002, `target ${target} round-trips to ${back}`);
    }
  });

  it('dateMsForSolarTime puts the sun up at noon and down at midnight', () => {
    const noon = dayNightFor(dateMsForSolarTime(0.5, 0, 0, NOON_EQUINOX), 0, 0);
    assert.ok(noon.sun.elevationDeg > 60, `noon elevation ${noon.sun.elevationDeg}`);
    assert.equal(noon.phase, 'day');
    const night = dayNightFor(dateMsForSolarTime(0.0, 0, 0, NOON_EQUINOX), 0, 0);
    assert.ok(night.sun.elevationDeg < -10, `midnight elevation ${night.sun.elevationDeg}`);
    assert.equal(night.phase, 'night');
  });

  it('lunar daylight is the moon’s illuminated fraction', () => {
    // Known moons: new 2000-01-06 18:14 UTC, full 2000-01-21 04:40 UTC.
    const newMoon = moonPhaseDaylight(Date.UTC(2000, 0, 6, 18, 14));
    assert.ok(newMoon < 0.05, `new moon daylight ${newMoon}`);
    const fullMoon = moonPhaseDaylight(Date.UTC(2000, 0, 21, 4, 40));
    assert.ok(fullMoon > 0.95, `full moon daylight ${fullMoon}`);
  });

  it('the place falls back to Sydney with no geolocation', () => {
    assert.deepEqual(getDayNightPlace(), FALLBACK_PLACE);
    assert.equal(FALLBACK_PLACE.lat, -33.8688);
    assert.equal(FALLBACK_PLACE.lon, 151.2093);
  });
});

describe('the nether palette — daylight is red', () => {
  for (const shade of Object.keys(NETHER_SHADES)) {
    it(`${shade}: high-day sun is red-family`, () => {
      const pal = netherPalette(35, shade);
      const [r, g, b] = pal.sunColor;
      assert.ok(r >= 0.9, `${shade} sun red ${r}`);
      assert.ok(r > g && r > b, `${shade} sun [${r}, ${g}, ${b}]`);
      assert.equal(pal.night, 0);
      assert.equal(pal.shade, shade);
    });
  }

  it('every shade differs from blood at high day', () => {
    const blood = netherPalette(35, 'blood');
    for (const shade of ['ember', 'crimson', 'violet', 'ash']) {
      const pal = netherPalette(35, shade);
      const diff = Math.abs(pal.sunColor[0] - blood.sunColor[0])
        + Math.abs(pal.sunColor[1] - blood.sunColor[1])
        + Math.abs(pal.sunColor[2] - blood.sunColor[2]);
      assert.ok(diff > 0.05, `${shade} differs by ${diff}`);
    }
  });

  it('deep night is fully night in every shade', () => {
    for (const shade of Object.keys(NETHER_SHADES)) {
      assert.equal(netherPalette(-16, shade).night, 1);
    }
  });

  it('the night factor follows the same curve as the earth palette', () => {
    for (const elev of [-8, -3, 0, 3, 10]) {
      assert.equal(
        netherPalette(elev, 'blood').night,
        skyPalette(elev).night,
        `night at elev ${elev}`,
      );
    }
  });

  it('an unknown shade falls back to blood', () => {
    assert.deepEqual(netherPalette(10, 'nope'), netherPalette(10, 'blood'));
  });

  it('every nether-realm has a shade assigned', () => {
    const realms = ['hades', 'helheim', 'duat', 'hell', 'naraka', 'yomi',
      'annwn', 'mictlan', 'xibalba', 'kur', 'nav', 'diyu', 'orun'];
    for (const r of realms) {
      assert.ok(NETHER_SHADES[NETHER_REALM_SHADE[r]], `${r} has shade ${NETHER_REALM_SHADE[r]}`);
    }
  });

  it('the storm realms are the hellscapes, red or purple', () => {
    for (const [realm, hue] of Object.entries(NETHER_REALM_STORM)) {
      assert.ok(hue === 'red' || hue === 'purple', `${realm} hue ${hue}`);
      assert.ok(NETHER_REALM_SHADE[realm], `${realm} has a shade too`);
    }
    for (const r of ['hades', 'hell', 'naraka', 'diyu', 'kur', 'xibalba']) {
      assert.ok(NETHER_REALM_STORM[r], `${r} has a storm`);
    }
  });
});

describe('the storm law — seeded lightning and ground fires', () => {
  it('strike delays are deterministic and inside 6–18 s', () => {
    for (let i = 0; i < 10; i++) {
      const d = strikeDelaySeconds(1234, i);
      assert.equal(d, strikeDelaySeconds(1234, i), `index ${i} repeats`);
      assert.ok(d >= STORM_STRIKE_MIN_S && d <= STORM_STRIKE_MAX_S, `delay ${d}`);
    }
  });

  it('strike positions are deterministic and inside bounds', () => {
    const bounds = { xMin: -100, xMax: 100, zMin: -80, zMax: 80 };
    const a = strikePosition(99, 3, bounds);
    assert.deepEqual(a, strikePosition(99, 3, bounds));
    assert.ok(a.x >= -100 && a.x <= 100 && a.z >= -80 && a.z <= 80, JSON.stringify(a));
  });

  it('the fire roll is deterministic and 35% by construction', () => {
    assert.equal(strikeRoll(7, 2), strikeRoll(7, 2));
    assert.ok(strikeRoll(7, 2) >= 0 && strikeRoll(7, 2) < 1);
    assert.equal(rollGroundFire(0.1), true);
    assert.equal(rollGroundFire(0.34), true);
    assert.equal(rollGroundFire(0.35), false);
    assert.equal(rollGroundFire(0.9), false);
  });

  it('fire lifetimes are deterministic and inside 20–45 s', () => {
    for (let i = 0; i < 5; i++) {
      const life = fireLifetimeMs(55, i);
      assert.equal(life, fireLifetimeMs(55, i));
      assert.ok(life >= STORM_FIRE_LIFETIME_MIN_MS && life <= STORM_FIRE_LIFETIME_MAX_MS, `${life}`);
    }
  });

  it('a fire spot is open ground only — never when nothing is open', () => {
    const bounds = { xMin: -50, xMax: 50, zMin: -50, zMax: 50 };
    let calls = 0;
    const none = chooseGroundFireSpot(() => 0.5, bounds, () => { calls += 1; return false; });
    assert.equal(none, null);
    assert.equal(calls, 8, 'tried 8 candidates');
    const spot = chooseGroundFireSpot(() => 0.5, bounds, () => true);
    assert.deepEqual(spot, { x: 0, z: 0 });
  });

  it('a fire ramps up, burns, fades out and is pruned', () => {
    const fire = makeGroundFire(1, 10, -20, 'red', 1000, 30000);
    assert.equal(fireIntensity(fire, 500), 0, 'before birth');
    assert.equal(fireIntensity(fire, 1000), 0, 'at birth');
    const mid = fireIntensity(fire, 10000);
    assert.ok(mid > 0.9, `mid-burn ${mid}`);
    assert.equal(fireIntensity(fire, 31000), 0, 'after lifetime');
    assert.equal(isFireAlive(fire, 10000), true);
    assert.equal(isFireAlive(fire, 31001), false);
    assert.deepEqual(pruneFires([fire], 10000), [fire]);
    assert.deepEqual(pruneFires([fire], 31001), []);
  });
});

describe('scene helpers', () => {
  it('rgbStr formats and clamps', () => {
    assert.equal(rgbStr([1, 0.5, 0]), '#ff8000');
    assert.equal(rgbStr([0, 0, 0]), '#000000');
    assert.equal(rgbStr([2, -1, 0.5]), '#ff0080');
  });

  it('applyDayNightRig drives a plain-three rig from the palette', () => {
    const colorSpy = () => {
      const c = { v: null, setRGB(r, g, b) { this.v = [r, g, b]; } };
      return c;
    };
    const posSpy = () => {
      const p = { v: null, set(x, y, z) { this.v = [x, y, z]; } };
      return p;
    };
    const sunLight = { color: colorSpy(), intensity: 0, position: posSpy() };
    const moonLight = { color: colorSpy(), intensity: 0, position: posSpy() };
    const hemiLight = { intensity: 0 };
    const fog = { color: colorSpy() };
    const background = { isColor: true, setRGB(r, g, b) { this.v = [r, g, b]; } };
    const day = dayNightFor(NOON_EQUINOX, 0, 0);
    applyDayNightRig(
      { sunLight, moonLight, hemiLight, fog, background },
      day.palette, day.sunVec, day.moon, day.moonVec,
    );
    assert.ok(sunLight.intensity > 1.5, `sun ${sunLight.intensity}`);
    assert.ok(sunLight.position.v[1] > 50, `sun up ${sunLight.position.v}`);
    assert.equal(moonLight.intensity, 0, 'no moon at noon');
    assert.equal(hemiLight.intensity, day.palette.hemiIntensity);
    assert.deepEqual(fog.color.v, day.palette.fog);
    assert.deepEqual(background.v, day.palette.top);
    const night = dayNightFor(MIDNIGHT_EQUINOX, 0, 0);
    applyDayNightRig({ sunLight, moonLight }, night.palette, night.sunVec, night.moon, night.moonVec);
    assert.equal(sunLight.intensity, 0, 'no sun at midnight');
  });

  it('applyDayNightRig tolerates a partial rig', () => {
    const day = dayNightFor(NOON_EQUINOX, 0, 0);
    assert.doesNotThrow(() => applyDayNightRig({}, day.palette, day.sunVec, day.moon, day.moonVec));
    assert.doesNotThrow(() => applyDayNightRig(null, day.palette, day.sunVec, day.moon, day.moonVec));
  });
});

// Sun + moon wrap sweep (Merlin, Nov 17, 2026): every DayNightRig
// world renders the house sun (core disc + halo) and Merlin's
// photo moon — the rig opts in per world. Mars 2 is the one
// exception: its sun is on, its moon stays red (a separate
// coordinator builds it), so its tag must NOT carry `moon`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(__dirname, '..');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');
const rigTag = (src) => {
  const m = src.match(/<DayNightRig[\s\S]*?\/>/);
  assert.ok(m, 'no DayNightRig tag found');
  return m[0];
};

const RIG_SUN_MOON_WORLDS = [
  'app/tlalocan/world3d.js',
  'app/maya-sky/world3d.js',
  'app/vyraj/world3d.js',
  'app/tiangong/world3d.js',
  'app/heaven/world3d.js',
  'app/svarga/world3d.js',
  'app/takamagahara/world3d.js',
  'app/tir-na-nog/world3d.js',
  'app/elysium/world3d.js',
  'app/valhalla/world3d.js',
  'app/aaru/world3d.js',
  'app/ghost-rider/world3d.js',
  'app/nether-realm/world3d.js',
  'app/helheim/world3d.js',
  'app/duat/world3d.js',
  'app/hell/world3d.js',
  'app/naraka/world3d.js',
  'app/yomi/world3d.js',
  'app/annwn/world3d.js',
  'app/mictlan/world3d.js',
  'app/xibalba/world3d.js',
  'app/kur/world3d.js',
  'app/nav/world3d.js',
  'app/diyu/world3d.js',
  'app/orun/world3d.js',
  'components/agora/AgoraScene.jsx',
];

describe('the sun + moon wrap — every rig world opts in', () => {
  it('the rig renders the photo moon when moon is passed', () => {
    const rig = read('components/DayNightRig.jsx');
    assert.ok(rig.includes('moon = false'), 'moon prop exists, default false');
    assert.ok(rig.includes('makeMoonTexture'), 'moon wears Merlin’s photo via makeMoonTexture');
    assert.ok(rig.includes('moonVis'), 'moon visibility follows the moon law');
  });

  for (const f of RIG_SUN_MOON_WORLDS) {
    it(`${f} passes sun + moon to the rig`, () => {
      const tag = rigTag(read(f));
      assert.ok(/\bsun\b/.test(tag), `sun missing in ${f}`);
      assert.ok(/\bmoon\b/.test(tag), `moon missing in ${f}`);
    });
  }

  it('Mars 2 passes sun but NOT moon — its moon stays red', () => {
    const tag = rigTag(read('components/mars2/Mars2Scene.jsx'));
    assert.ok(/\bsun\b/.test(tag), 'Mars 2 sun missing');
    assert.ok(!/\bmoon\b/.test(tag), 'Mars 2 must not carry the grey photo moon');
  });
});
