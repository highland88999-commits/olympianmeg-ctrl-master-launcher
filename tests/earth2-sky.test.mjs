// Earth 2 — the living sky (Wave A): the pure solar/lunar math
// behind real local time on the planet. The world's clock is
// the REAL time at the parcel underfoot, so the sun, the moon,
// the constellations and the aurora all have to be right —
// these tests pin them against known astronomy, not vibes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  solarPosition, sunVector, moonPosition, siderealHours, celestialToAltAz,
  starVector, CONSTELLATIONS, constellationStars, fieldStars,
  auroraIntensity, skyPalette, solarClockLabel,
} from '../lib/earth2/sky.js';

describe('solar position — known cases', () => {
  it('the equinox sun at the equator culminates near the zenith', () => {
    // 2026-03-20 ~12:00 UTC at (0, 0): declination ≈ 0, hour
    // angle ≈ 0 — elevation should be within a few degrees of 90.
    const s = solarPosition(Date.UTC(2026, 2, 20, 12, 0), 0, 0);
    assert.ok(s.elevationDeg > 80, `equinox noon elevation ${s.elevationDeg}`);
    assert.equal(s.phase, 'day');
    assert.ok(Math.abs(s.declinationDeg) < 2.5);
  });

  it('Edmonton on an October afternoon sits in low western light', () => {
    // 2026-10-23 19:30 UTC = 13:30 MDT in Edmonton (53.55, -113.5):
    // the sun should be up but modest — between 10° and 30°.
    const s = solarPosition(Date.UTC(2026, 9, 23, 19, 30), 53.55, -113.5);
    assert.ok(s.elevationDeg > 10 && s.elevationDeg < 30, `elevation ${s.elevationDeg}`);
    assert.equal(s.phase, 'day');
    assert.ok(s.solarTimeHours > 12 && s.solarTimeHours < 15, `solar time ${s.solarTimeHours}`);
  });

  it('midnight is night, with the sun far below the horizon', () => {
    const s = solarPosition(Date.UTC(2026, 9, 24, 6, 30), 53.55, -113.5); // 00:30 MDT
    assert.equal(s.phase, 'night');
    assert.ok(s.elevationDeg < -10, `elevation ${s.elevationDeg}`);
  });

  it('the sun vector points up by day and down by night', () => {
    const day = sunVector(Date.UTC(2026, 5, 21, 18, 0), 53.55, -113.5);
    const night = sunVector(Date.UTC(2026, 5, 21, 6, 30), 53.55, -113.5);
    assert.ok(day.y > 0.2);
    assert.ok(night.y < 0);
    const len = Math.hypot(day.x, day.y, day.z);
    assert.ok(Math.abs(len - 1) < 1e-6, 'unit vector');
  });
});

describe('the celestial dome', () => {
  it('a star transits the zenith when RA = sidereal time and dec = latitude', () => {
    const when = Date.UTC(2026, 9, 23, 20, 0);
    const lat = 53.55, lon = -113.5;
    const lst = siderealHours(when, lon);
    const v = celestialToAltAz(lst, lat, when, lat, lon);
    assert.ok(Math.abs(v.altDeg - 90) < 0.5, `alt ${v.altDeg}`);
  });

  it('starVector agrees with the zenith identity too', () => {
    const when = Date.UTC(2026, 9, 23, 20, 0);
    const lat = 53.55, lon = -113.5;
    const lst = siderealHours(when, lon);
    const v = starVector({ ra: lst, dec: lat, mag: 2 }, when, lat, lon);
    assert.ok(v.y > 0.99, `y ${v.y}`);
  });

  it('the moon is a sane disc: illuminated fraction in range, altitude bounded', () => {
    const m = moonPosition(Date.UTC(2026, 9, 24, 2, 0), 53.55, -113.5);
    assert.ok(m.illum >= 0 && m.illum <= 1);
    assert.ok(Math.abs(m.altDeg) <= 90);
    assert.ok(m.azDeg >= 0 && m.azDeg < 360);
  });
});

describe('the constellation atlas', () => {
  it('plots the four named patterns from real J2000 positions', () => {
    const names = CONSTELLATIONS.map((c) => c.name);
    for (const want of ['Ursa Major', 'Cassiopeia', 'Orion', 'Crux']) {
      assert.ok(names.includes(want), want);
    }
    for (const c of CONSTELLATIONS) {
      assert.ok(c.stars.length >= 4, c.name);
      for (const s of c.stars) {
        assert.ok(s.ra >= 0 && s.ra < 24, `${c.name} RA`);
        assert.ok(Math.abs(s.dec) <= 90, `${c.name} dec`);
        assert.ok(s.mag > 0 && s.mag < 4, `${c.name} mag`);
      }
      for (const [a, b] of c.lines) {
        assert.ok(a < c.stars.length && b < c.stars.length, `${c.name} line indices`);
      }
    }
  });

  it('the famous stars are where the atlas says (Betelgeuse, Dubhe, Acrux)', () => {
    const flat = constellationStars();
    const betel = flat.find((s) => s.name === 'Betelgeuse');
    assert.ok(Math.abs(betel.ra - 5.919) < 0.01 && Math.abs(betel.dec - 7.407) < 0.05);
    const dubhe = flat.find((s) => s.name === 'Dubhe');
    assert.ok(Math.abs(dubhe.dec - 61.751) < 0.05);
    const acrux = flat.find((s) => s.name === 'Acrux');
    assert.ok(Math.abs(acrux.dec + 63.099) < 0.05);
    assert.equal(flat.length, CONSTELLATIONS.reduce((n, c) => n + c.stars.length, 0));
  });

  it('the field stars are seeded and procedural — same call, same sky', () => {
    const a = fieldStars();
    const b = fieldStars();
    assert.deepEqual(a, b);
    assert.ok(a.length >= 500);
    for (const s of a.slice(0, 50)) assert.ok(s.ra >= 0 && s.ra < 24);
  });

  it('Orion rides the winter sky: up at midnight in January, gone at noon', () => {
    const betel = constellationStars().find((s) => s.name === 'Betelgeuse');
    const night = starVector(betel, Date.UTC(2027, 0, 15, 6, 0), 53.55, -113.5); // 23:00 MST
    const noon = starVector(betel, Date.UTC(2027, 0, 15, 19, 0), 53.55, -113.5); // 12:00 MST
    assert.ok(night.altDeg > 10, `Betelgeuse at night: ${night.altDeg}`);
    assert.ok(noon.altDeg < night.altDeg - 30, 'the dome turns with the hours');
  });
});

describe('aurora + palette', () => {
  it('the aurora loves high latitudes at night and dies at the equator', () => {
    assert.ok(auroraIntensity(53.55, -20) > 0.7, 'Edmonton at night');
    assert.ok(auroraIntensity(65, -20) > auroraIntensity(53.55, -20));
    assert.equal(auroraIntensity(0, -20), 0);
    assert.equal(auroraIntensity(53.55, 10), 0, 'no aurora in daylight');
    assert.ok(auroraIntensity(-66, -20) > 0.7, 'the southern aurora mirrors');
  });

  it('the palette runs night → dawn → day and back, monotonic in light', () => {
    const night = skyPalette(-12);
    const dawn = skyPalette(0);
    const day = skyPalette(30);
    assert.ok(day.sunIntensity > dawn.sunIntensity && dawn.sunIntensity > night.sunIntensity);
    assert.equal(skyPalette(-16).night, 1);
    assert.ok(night.night > 0.9);
    assert.equal(day.night, 0);
    assert.ok(day.hemiIntensity > night.hemiIntensity);
    // Sunset fire: at the horizon the sun colour runs redder
    // than at noon (red channel share rises).
    const share = (c) => c[0] / (c[0] + c[1] + c[2]);
    assert.ok(share(dawn.sunColor) > share(day.sunColor));
  });

  it('the solar clock labels read like a clock', () => {
    // Edmonton's October-afternoon read is early-afternoon solar.
    const label = solarClockLabel(Date.UTC(2026, 9, 23, 19, 30), 53.55, -113.5);
    assert.match(label, /^\d{2}:\d{2}$/);
    assert.ok(label.startsWith('12:'), label);
    // Solar noon at the equator on the equinox reads ~midday.
    const noon = solarClockLabel(Date.UTC(2026, 2, 20, 12, 0), 0, 0);
    assert.ok(noon.startsWith('11:') || noon.startsWith('12:'), noon);
  });
});
