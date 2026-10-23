// Earth 2 — real weather, mirrored (Wave A): the pure mapping
// from an Open-Meteo current-conditions read to the world's sky
// state. The fetch itself is the shipped Weather app's route
// (lib/weather); this suite pins the URL shape, the normaliser
// and — above all — weatherToWorld, so rain reads as rain and
// fog reads as fog on the planet.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCurrentWeatherUrl, normalizeCurrentWeather, weatherToWorld,
  shouldRefetchWeather, WEATHER_REFETCH_MS, WEATHER_REFETCH_DEG,
} from '../lib/earth2/conditions.js';

function payload(over = {}) {
  return {
    current: {
      time: '2026-10-23T13:30',
      temperature_2m: 6.4,
      weather_code: 61,
      wind_speed_10m: 18,
      wind_direction_10m: 270,
      cloud_cover: 82,
      is_day: 1,
      ...(over.current || {}),
    },
    hourly: {
      time: ['2026-10-23T13:00', '2026-10-23T14:00'],
      visibility: [9000, 8000],
      ...(over.hourly || {}),
    },
  };
}

describe('the current-weather URL', () => {
  it('asks Open-Meteo for exactly the fields the mirror reads', () => {
    const url = buildCurrentWeatherUrl(51.4792, -112.7897);
    assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?'));
    assert.ok(url.includes('latitude=51.4792'));
    assert.ok(url.includes('longitude=-112.7897'));
    assert.ok(url.includes('weather_code'));
    assert.ok(url.includes('cloud_cover'));
    assert.ok(url.includes('visibility'));
  });

  it('refuses nonsense coordinates', () => {
    assert.equal(buildCurrentWeatherUrl(NaN, 0), null);
    assert.equal(buildCurrentWeatherUrl(0, Infinity), null);
    assert.equal(buildCurrentWeatherUrl(91, 0), null, 'off the planet');
    assert.equal(buildCurrentWeatherUrl(0, -181), null);
  });
});

describe('the normaliser', () => {
  it('reads a rainy read into the shared shape, visibility matched to the hour', () => {
    const wx = normalizeCurrentWeather(payload());
    assert.equal(wx.code, 61);
    assert.equal(wx.tempC, 6.4);
    assert.equal(wx.cloudCover, 0.82); // a fraction — the world dims by it directly
    assert.equal(wx.windKmh, 18);
    assert.equal(wx.windDirDeg, 270);
    assert.equal(wx.visibilityM, 9000); // the 13:00 row for a 13:30 read
    assert.equal(wx.isDay, true);
    // The words for the code ride the world mapping (the
    // Weather app's own label for 61).
    assert.equal(weatherToWorld(wx).label, 'Slight rain');
  });

  it('returns null for junk instead of throwing', () => {
    assert.equal(normalizeCurrentWeather(null), null);
    assert.equal(normalizeCurrentWeather({}), null);
    assert.equal(normalizeCurrentWeather({ current: { weather_code: 'rain?' } }), null);
  });
});

describe('weather → world', () => {
  it('clear skies map to the untouched world', () => {
    const w = weatherToWorld(null);
    assert.equal(w.cloudCover, 0);
    assert.equal(w.precip.kind, 'none');
    assert.equal(w.fogFar, 980);
    assert.ok(w.windSway >= 0.7);
  });

  it('rain codes precipitate, scaled by their weight', () => {
    const w = weatherToWorld(normalizeCurrentWeather(payload({ current: { weather_code: 63 } })));
    assert.equal(w.precip.kind, 'rain');
    assert.ok(w.precip.intensity > 0.5);
    assert.ok(w.fogFar < 980, 'rain pulls the horizon in');
  });

  it('snow codes precipitate as snow — and cold rain turns to snow', () => {
    const snow = weatherToWorld(normalizeCurrentWeather(payload({ current: { weather_code: 71 } })));
    assert.equal(snow.precip.kind, 'snow');
    const coldRain = weatherToWorld(normalizeCurrentWeather(payload({
      current: { weather_code: 61, temperature_2m: -2 },
    })));
    assert.equal(coldRain.precip.kind, 'snow');
    const warmRain = weatherToWorld(normalizeCurrentWeather(payload({
      current: { weather_code: 61, temperature_2m: 9 },
    })));
    assert.equal(warmRain.precip.kind, 'rain');
  });

  it('fog codes and low visibility close the world in', () => {
    const fog = weatherToWorld(normalizeCurrentWeather(payload({ current: { weather_code: 45 } })));
    assert.equal(fog.fogFar, 260);
    const murk = weatherToWorld(normalizeCurrentWeather(payload({
      hourly: { time: ['2026-10-23T13:00'], visibility: [600] },
    })));
    assert.ok(murk.fogFar <= 200, `visibility fog ${murk.fogFar}`);
    const far = weatherToWorld(normalizeCurrentWeather(payload({
      current: { weather_code: 0 },
      hourly: { time: ['2026-10-23T13:00'], visibility: [24000] },
    })));
    assert.equal(far.fogFar, 980);
  });

  it('cloud cover dims, and wind drives the sway', () => {
    const overcast = weatherToWorld(normalizeCurrentWeather(payload({ current: { cloud_cover: 100 } })));
    assert.equal(overcast.cloudCover, 1);
    assert.equal(overcast.windDirDeg, 270);
    const calm = weatherToWorld(normalizeCurrentWeather(payload({ current: { wind_speed_10m: 0 } })));
    const gale = weatherToWorld(normalizeCurrentWeather(payload({ current: { wind_speed_10m: 60 } })));
    assert.ok(gale.windSway > calm.windSway);
    assert.ok(calm.windSway >= 0.7, 'never fully still');
  });
});

describe('the refetch cadence', () => {
  it('the first read always fetches; a fresh, near read never does', () => {
    const now = 1_000_000_000;
    assert.equal(shouldRefetchWeather(null, 51, -112, now), true);
    const last = { lat: 51, lon: -112, atMs: now - 1000 };
    assert.equal(shouldRefetchWeather(last, 51, -112, now), false);
  });

  it('staleness and distance each trigger a refetch', () => {
    const now = 1_000_000_000;
    const stale = { lat: 51, lon: -112, atMs: now - WEATHER_REFETCH_MS - 1 };
    assert.equal(shouldRefetchWeather(stale, 51, -112, now), true);
    const fresh = { lat: 51, lon: -112, atMs: now };
    assert.equal(shouldRefetchWeather(fresh, 51 + WEATHER_REFETCH_DEG + 0.1, -112, now), true);
    assert.equal(shouldRefetchWeather(fresh, 51 + 0.5, -112, now), false);
  });
});
