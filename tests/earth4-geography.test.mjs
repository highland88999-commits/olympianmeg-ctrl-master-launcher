// tests/earth4-geography.test.mjs
// EARTH 4 — TRUE EARTH SIZE (Merlin, 2026-11-12): the pure law in
// lib/earth4/geography.js — real metres, real lat/lon, real relief
// from the repo's topology PNG, real colours from earth-day.jpg.
//
// Run: node --test tests/earth4-geography.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EARTH_RADIUS_M,
  M_PER_DEG_LAT,
  START_PLACE,
  wrapLon,
  localFromLatLon,
  latLonFromLocal,
  haversineM,
  metresPerDegLon,
  elevationForGray,
  isWaterGray,
  sampleGray,
  grayAtLatLon,
  heightAtLatLon,
  isWaterAtLatLon,
  sampleDayColor,
  tileMetresPerPixel,
  tileMetres,
  tileGridSize,
  formatLatLon,
  mercatorLat,
  esriPatchUV,
} from '../lib/earth4/geography.js';

describe('true scale', () => {
  it('one degree of latitude is 111,195 m', () => {
    assert.ok(Math.abs(M_PER_DEG_LAT - 111194.93) < 0.1);
    assert.ok(Math.abs(EARTH_RADIUS_M - 6371000) < 1);
  });

  it('longitude metres shrink with cos(latitude)', () => {
    assert.ok(Math.abs(metresPerDegLon(0) - M_PER_DEG_LAT) < 0.01);
    assert.ok(Math.abs(metresPerDegLon(60) - M_PER_DEG_LAT / 2) < 1);
    assert.ok(metresPerDegLon(89) < 2000);
  });

  it('local metres round-trip through lat/lon', () => {
    const origin = { lat: 53.95235, lon: -113.11636 };
    for (const [lat, lon] of [
      [53.95235, -113.11636],
      [54.0, -113.0],
      [53.5, -114.0],
      [-33.8688, 151.2093],
      [0, 0],
    ]) {
      const p = localFromLatLon(lat, lon, origin);
      const back = latLonFromLocal(p.x, p.z, origin);
      assert.ok(Math.abs(back.lat - lat) < 1e-9, `lat ${lat}`);
      // Longitudes wrap at the antimeridian; compare wrapped.
      const dLon = Math.abs(((back.lon - lon + 540) % 360) - 180);
      assert.ok(dLon < 1e-9, `lon ${lon}`);
    }
  });

  it('walking 111 km north really moves 1 degree of latitude', () => {
    const origin = { lat: 0, lon: 0 };
    const p = localFromLatLon(1, 0, origin);
    assert.ok(Math.abs(p.z + M_PER_DEG_LAT) < 0.01);
    assert.ok(Math.abs(p.x) < 0.01);
  });

  it('haversine: Redwater to Edmonton is a real ~57 km', () => {
    // Edmonton centre 53.5461, -113.4938 (city hall, approx).
    const d = haversineM(53.95235, -113.11636, 53.5461, -113.4938);
    assert.ok(d > 50000 && d < 65000, `got ${d}`);
  });

  it('haversine: a degree of latitude at the equator is 111,195 m', () => {
    const d = haversineM(0, 0, 1, 0);
    assert.ok(Math.abs(d - 111194.93) < 1);
  });

  it('wrapLon keeps longitudes in range', () => {
    assert.equal(wrapLon(190), -170);
    assert.equal(wrapLon(-190), 170);
    assert.equal(wrapLon(0), 0);
  });
});

describe('real relief from the topology PNG', () => {
  it('the elevation fit honours its two surveyed anchors', () => {
    // Everest 8,848 m at gray 242; Redwater ~625 m at gray 26.
    assert.ok(Math.abs(elevationForGray(242) - 8848) < 15);
    assert.ok(Math.abs(elevationForGray(26) - 625) < 15);
  });

  it('oceans are water, land is land', () => {
    assert.equal(isWaterGray(0), true);
    assert.equal(isWaterGray(2), false); // lowland (Amazon ~100 m) is land
    assert.equal(isWaterGray(25), false);
    assert.equal(elevationForGray(0), -3); // the seabed
    assert.equal(elevationForGray(2), 0); // lowland clamps to sea level
  });

  it('bilinear sampling is exact at corners and the centre', () => {
    // 2×2 heightmap: NW=0, NE=100, SW=200, SE=255 (row 0 = north).
    const data = new Uint8Array([0, 100, 200, 255]);
    assert.equal(sampleGray(data, 2, 2, 0, 1), 0); // NW corner
    assert.equal(sampleGray(data, 2, 2, 1, 1), 100); // NE corner
    assert.equal(sampleGray(data, 2, 2, 0, 0), 200); // SW corner
    assert.equal(sampleGray(data, 2, 2, 1, 0), 255); // SE corner
    assert.ok(Math.abs(sampleGray(data, 2, 2, 0.5, 0.5) - 138.75) < 0.01);
  });

  it('a synthetic heightmap reads through lat/lon', () => {
    // Flat land everywhere except a 0-valued ocean strip at the west.
    const w = 360;
    const h = 180;
    const data = new Uint8Array(w * h).fill(100);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 10; x++) data[y * w + x] = 0;
    }
    const height = { data, w, h };
    assert.ok(isWaterAtLatLon(0, -179, height));
    assert.ok(!isWaterAtLatLon(0, 0, height));
    assert.ok(heightAtLatLon(0, 0, height) > 3000);
    assert.equal(heightAtLatLon(0, -179, height), -3);
    // No heightmap at all: the sea, never a crash.
    assert.equal(heightAtLatLon(0, 0, null), -3);
    assert.equal(isWaterAtLatLon(0, 0, null), true);
  });
});

describe('true colours', () => {
  it('the day texture samples bilinearly', () => {
    // 2×2 RGBA: NW red, NE green, SW blue, SE white.
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const tex = { data, w: 2, h: 2 };
    const nw = sampleDayColor(90, -180, tex);
    assert.ok(Math.abs(nw.r - 1) < 0.01 && nw.g < 0.01);
    const mid = sampleDayColor(0, 0, tex);
    assert.ok(Math.abs(mid.r - 0.5) < 0.02);
    assert.ok(Math.abs(mid.g - 0.5) < 0.02);
    assert.ok(Math.abs(mid.b - 0.5) < 0.02);
    assert.equal(sampleDayColor(0, 0, null), null);
  });
});

describe('satellite tiles', () => {
  it('a zoom-16 tile is ~612 m at the equator', () => {
    assert.ok(Math.abs(tileMetres(0, 16) - 611.6) < 1);
    assert.ok(Math.abs(tileMetresPerPixel(0, 16) - 2.389) < 0.01);
  });

  it('the tile grid covers the patch and stays bounded', () => {
    assert.equal(tileGridSize(640, 0, 16), 3);
    assert.ok(tileGridSize(640, 53.95, 16) <= 5);
    assert.ok(tileGridSize(640, 80, 16) <= 9);
  });

  it('the ESRI patch UV crops the tile canvas to exactly the patch', () => {
    const origin = { lat: 53.95235, lon: -113.11636 };
    const uv = esriPatchUV(320, origin, 16, 3);
    // The patch is a fraction of the canvas, anchored inside it.
    assert.ok(uv.repeatX > 0 && uv.repeatX <= 1, `repeatX ${uv.repeatX}`);
    assert.ok(uv.repeatY > 0 && uv.repeatY <= 1, `repeatY ${uv.repeatY}`);
    assert.ok(uv.offsetX >= 0 && uv.offsetX + uv.repeatX <= 1.000001);
    assert.ok(uv.offsetY >= 0 && uv.offsetY + uv.repeatY <= 1.000001);
    // At the equator the tiles are square in metres, so the crop
    // is square too (within Mercator's latitude stretch).
    const eq = esriPatchUV(320, { lat: 0, lon: 0 }, 16, 3);
    assert.ok(Math.abs(eq.repeatX - eq.repeatY) < 0.02,
      `repeatX ${eq.repeatX} vs repeatY ${eq.repeatY}`);
    assert.ok(Number.isInteger(uv.tileX) && Number.isInteger(uv.tileY));
  });

  it('Mercator latitude inverts the tile row', () => {
    // Tile row 0 is the north pole; the equator sits at row 2^(z-1).
    assert.ok(Math.abs(mercatorLat(0, 2) - 85.0511) < 0.01);
    assert.ok(Math.abs(mercatorLat(2, 2)) < 0.01);
  });
});

describe('the anchor and the readout', () => {
  it('starts at Redwater, Alberta — the geocoded home town', () => {
    assert.equal(START_PLACE.name, 'Redwater, Alberta');
    assert.ok(Math.abs(START_PLACE.lat - 53.95235) < 1e-5);
    assert.ok(Math.abs(START_PLACE.lon - (-113.11636)) < 1e-5);
  });

  it('formats lat/lon for the HUD', () => {
    assert.equal(formatLatLon(53.95235, -113.11636), '53.9524°N, 113.1164°W');
    assert.equal(formatLatLon(-33.8688, 151.2093), '33.8688°S, 151.2093°E');
  });
});
