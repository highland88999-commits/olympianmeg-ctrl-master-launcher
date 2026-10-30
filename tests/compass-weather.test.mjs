// tests/compass-weather.test.mjs
// Compass + Weather (Merlin, 2026-10-22) — global everyday utilities
// in the UTILITIES god menu. Both stand on the shared, session-memoized
// geo layer and a global Open-Meteo place search.
//
// Pins:
// - compass + weather are registered once in satellites.ts, claimed
//   once by UTILITIES, and titled in all 31 locales
// - pure heading maths: 16-wind boundaries and wrap-aware smoothing
// - pure navigation: haversine + initial bearing on known city pairs
// - WMO weather-code coverage and unit conversion
// - page wiring: search, location reuse, iOS permission, unit toggle,
//   hourly and daily presentation
//
// Run: node --test tests/compass-weather.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { GOD_MENUS, allGodMenuSatellites, godMenuFor } from '../lib/god-menus.js';
import {
  CARDINAL_16,
  degreesToCardinal16,
  formatDistance,
  haversineDistanceKm,
  headingFromDeviceOrientation,
  initialBearingDegrees,
  navigationToTarget,
  normalizeDegrees,
  smoothHeading,
} from '../lib/compass/navigation.js';
import {
  WMO_WEATHER_CODES,
  describeWeatherCode,
} from '../lib/weather/codes.js';
import {
  OPEN_METEO_FORECAST_URL,
  OPEN_METEO_GEOCODING_URL,
  buildForecastUrl,
  buildGeocodingUrl,
  convertTemperature,
  convertWindSpeed,
  formatDayLabel,
  formatHourLabel,
  formatPressure,
  formatTemperature,
  formatWindSpeed,
  next24Hours,
  normalizeForecast,
  normalizeGeocodingResults,
} from '../lib/weather/forecast.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (path) => readFileSync(join(repo, path), 'utf8');

const satSrc = read('lib/i18n/satellites.ts');
const compassSrc = read('app/compass/page.jsx');
const weatherSrc = read('app/weather/page.jsx');

describe('registry: compass + weather live in UTILITIES', () => {
  it('satellites.ts registers both routes under UTILITIES/ARES', () => {
    assert.ok(satSrc.includes(
      '{ key: "compass", route: "/compass", pos: "UTILITIES", section: "UTILITIES", constellation: "ARES" }'
    ));
    assert.ok(satSrc.includes(
      '{ key: "weather", route: "/weather", pos: "UTILITIES", section: "UTILITIES", constellation: "ARES" }'
    ));
  });

  it('UTILITIES claims each exactly once, alongside their neighbours', () => {
    const menu = GOD_MENUS.find((entry) => entry.god === 'UTILITIES');
    assert.ok(menu, 'UTILITIES menu exists');
    for (const key of ['notepad', 'calculator', 'calendar', 'journal', 'compass', 'weather']) {
      assert.ok(menu.satellites.includes(key), key);
      assert.equal(allGodMenuSatellites().filter((claimed) => claimed === key).length, 1, key);
    }
    assert.equal(godMenuFor('compass')?.god, 'UTILITIES');
    assert.equal(godMenuFor('weather')?.god, 'UTILITIES');
  });

  it('does not place either utility in DIONYSUS', () => {
    const dionysus = GOD_MENUS.find((entry) => entry.god === 'DIONYSUS');
    assert.ok(dionysus);
    assert.equal(dionysus.satellites.includes('compass'), false);
    assert.equal(dionysus.satellites.includes('weather'), false);
  });

  it('all 34 locales carry both translated titles and subtitles', () => {
    const files = readdirSync(join(repo, 'lib/i18n/locales')).filter((file) => file.endsWith('.json'));
    assert.equal(files.length, 34);
    for (const file of files) {
      const dict = JSON.parse(read(`lib/i18n/locales/${file}`));
      assert.ok(dict['sat.compass.title']?.trim(), `${file} compass title`);
      assert.ok(dict['sat.weather.title']?.trim(), `${file} weather title`);
      // Subtitles are translated too in the comprehensive dictionaries
      // (jv/te/mr); older machine locales share the English subtitle.
      assert.ok(dict['sat.compass.subtitle']?.trim(), `${file} compass subtitle`);
      assert.ok(dict['sat.weather.subtitle']?.trim(), `${file} weather subtitle`);
    }
    const en = JSON.parse(read('lib/i18n/locales/en.json'));
    assert.equal(en['sat.compass.title'], 'Compass');
    assert.equal(en['sat.weather.title'], 'Weather');
  });
});

describe('compass pure logic: headings and cardinals', () => {
  it('normalises degrees into 0 <= degrees < 360', () => {
    assert.equal(normalizeDegrees(0), 0);
    assert.equal(normalizeDegrees(360), 0);
    assert.equal(normalizeDegrees(-10), 350);
    assert.equal(normalizeDegrees(725), 5);
    assert.equal(normalizeDegrees('north'), null);
  });

  it('maps all sixteen cardinal centres', () => {
    CARDINAL_16.forEach((label, index) => {
      assert.equal(degreesToCardinal16(index * 22.5), label);
    });
  });

  it('respects the half-sector cardinal boundaries', () => {
    assert.equal(degreesToCardinal16(11.24), 'N');
    assert.equal(degreesToCardinal16(11.25), 'NNE');
    assert.equal(degreesToCardinal16(348.74), 'NNW');
    assert.equal(degreesToCardinal16(348.75), 'N');
    assert.equal(degreesToCardinal16(191.24), 'S');
    assert.equal(degreesToCardinal16(191.25), 'SSW');
  });

  it('smooths across the 359°/0° wrap instead of spinning backwards', () => {
    const midpoint = smoothHeading(359, 1, 0.5);
    assert.ok(midpoint !== null && (midpoint < 0.01 || midpoint > 359.99), midpoint);
    const weighted = smoothHeading(359, 1, 0.25);
    assert.ok(weighted > 359 && weighted < 360, weighted);
    const otherSide = smoothHeading(1, 359, 0.25);
    assert.ok(otherSide >= 0 && otherSide < 1, otherSide);
  });

  it('reads iOS webkitCompassHeading before alpha', () => {
    assert.equal(headingFromDeviceOrientation({ webkitCompassHeading: 370, alpha: 0 }), 10);
    assert.equal(headingFromDeviceOrientation({ alpha: 10 }), 350);
    assert.equal(headingFromDeviceOrientation({ alpha: 0 }), 0);
    assert.equal(headingFromDeviceOrientation({}), null);
  });
});

describe('compass pure logic: global navigation', () => {
  const edmonton = { lat: 53.5462, lon: -113.4912 };
  const paris = { lat: 48.8566, lon: 2.3522 };

  it('calculates the Edmonton -> Paris distance within tolerance', () => {
    const distance = haversineDistanceKm(edmonton, paris);
    assert.ok(distance !== null && Math.abs(distance - 7138) < 60, distance);
  });

  it('calculates the Edmonton -> Paris initial bearing within tolerance', () => {
    const bearing = initialBearingDegrees(edmonton, paris);
    assert.ok(bearing !== null && Math.abs(bearing - 41.1) < 2, bearing);
    assert.equal(degreesToCardinal16(bearing), 'NE');
  });

  it('combines distance, bearing, and cardinal for a searched target', () => {
    const navigation = navigationToTarget(edmonton, paris);
    assert.ok(navigation);
    assert.equal(navigation.cardinal, 'NE');
    assert.ok(navigation.distanceKm > 7000 && navigation.distanceKm < 7300);
    assert.match(formatDistance(navigation.distanceKm), /km$/);
    assert.match(formatDistance(navigation.distanceKm, 'imperial'), /mi$/);
  });

  it('handles the same place and invalid coordinates honestly', () => {
    assert.equal(haversineDistanceKm(edmonton, edmonton), 0);
    assert.equal(initialBearingDegrees(edmonton, edmonton), 0);
    assert.equal(haversineDistanceKm(edmonton, { lat: 120, lon: 0 }), null);
    assert.equal(initialBearingDegrees(null, paris), null);
  });
});

describe('weather pure logic: WMO codes', () => {
  it('covers every code Open-Meteo can return', () => {
    assert.deepEqual(WMO_WEATHER_CODES, [
      0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57,
      61, 63, 65, 66, 67, 71, 73, 75, 77,
      80, 81, 82, 85, 86, 95, 96, 99,
    ]);
    for (const code of WMO_WEATHER_CODES) {
      const detail = describeWeatherCode(code);
      assert.notEqual(detail.category, 'unknown', `code ${code}`);
      assert.ok(detail.label.length > 2, `code ${code} label`);
      assert.ok(detail.icon.length > 0, `code ${code} icon`);
    }
  });

  it('names the important weather families', () => {
    assert.equal(describeWeatherCode(0).label, 'Clear sky');
    assert.equal(describeWeatherCode(3).label, 'Overcast');
    assert.equal(describeWeatherCode(45).category, 'fog');
    assert.equal(describeWeatherCode(51).category, 'drizzle');
    assert.equal(describeWeatherCode(65).category, 'rain');
    assert.equal(describeWeatherCode(75).category, 'snow');
    assert.equal(describeWeatherCode(82).category, 'showers');
    assert.equal(describeWeatherCode(95).category, 'thunderstorm');
    assert.match(describeWeatherCode(99).label, /hail/i);
  });

  it('falls back honestly for an unknown code', () => {
    assert.equal(describeWeatherCode(999).category, 'unknown');
    assert.equal(describeWeatherCode('rain').code, null);
  });
});

describe('weather pure logic: Open-Meteo requests and responses', () => {
  it('builds the keyless global geocoding and forecast endpoints', () => {
    assert.equal(OPEN_METEO_GEOCODING_URL, 'https://geocoding-api.open-meteo.com/v1/search');
    assert.equal(OPEN_METEO_FORECAST_URL, 'https://api.open-meteo.com/v1/forecast');

    const searchUrl = new URL(buildGeocodingUrl('San José', 6));
    assert.equal(searchUrl.origin + searchUrl.pathname, OPEN_METEO_GEOCODING_URL);
    assert.equal(searchUrl.searchParams.get('name'), 'San José');
    assert.equal(searchUrl.searchParams.get('count'), '6');
    assert.equal(searchUrl.searchParams.get('language'), 'en');
    assert.equal(searchUrl.searchParams.get('format'), 'json');

    const forecastUrl = new URL(buildForecastUrl({ latitude: 53.5462, longitude: -113.4912 }));
    assert.equal(forecastUrl.origin + forecastUrl.pathname, OPEN_METEO_FORECAST_URL);
    assert.equal(forecastUrl.searchParams.get('latitude'), '53.5462');
    assert.equal(forecastUrl.searchParams.get('longitude'), '-113.4912');
    assert.match(forecastUrl.searchParams.get('current'), /temperature_2m/);
    assert.match(forecastUrl.searchParams.get('current'), /wind_direction_10m/);
    assert.match(forecastUrl.searchParams.get('hourly'), /precipitation_probability/);
    assert.match(forecastUrl.searchParams.get('daily'), /temperature_2m_max/);
    assert.equal(forecastUrl.searchParams.get('timezone'), 'auto');
    assert.equal(forecastUrl.searchParams.get('forecast_days'), '7');
  });

  it('normalises geocoding results with region, country, and coordinates', () => {
    const results = normalizeGeocodingResults({
      results: [{
        id: 2988507,
        name: 'Paris',
        admin1: 'Île-de-France',
        admin2: 'Paris',
        country: 'France',
        latitude: 48.8566,
        longitude: 2.3522,
        timezone: 'Europe/Paris',
      }, {
        name: 'Broken', latitude: 999, longitude: 0,
      }],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].label, 'Paris, Île-de-France, France');
    assert.equal(results[0].region, 'Île-de-France');
    assert.equal(results[0].country, 'France');
  });

  it('normalises a forecast and takes the next 24 hours from current time', () => {
    const times = Array.from({ length: 48 }, (_, index) => {
      const day = index < 24 ? '02' : '03';
      const hour = String(index % 24).padStart(2, '0');
      return `2026-10-${day}T${hour}:00`;
    });
    const forecast = normalizeForecast({
      timezone: 'America/Edmonton',
      utc_offset_seconds: -21600,
      current: {
        time: '2026-10-02T01:30',
        temperature_2m: 8,
        relative_humidity_2m: 61,
        apparent_temperature: 6,
        is_day: 0,
        precipitation: 0,
        weather_code: 2,
        surface_pressure: 1013,
        wind_speed_10m: 14,
        wind_direction_10m: 315,
      },
      hourly: {
        time: times,
        temperature_2m: times.map((_, index) => index),
        weather_code: times.map(() => 1),
        precipitation_probability: times.map(() => 10),
      },
      daily: {
        time: ['2026-10-02'],
        weather_code: [2],
        temperature_2m_max: [12],
        temperature_2m_min: [3],
        precipitation_probability_max: [20],
      },
    });
    assert.ok(forecast);
    assert.equal(forecast.current.temperatureC, 8);
    assert.equal(forecast.current.windDirectionDegrees, 315);
    assert.equal(forecast.daily[0].highC, 12);
    const next = next24Hours(forecast);
    assert.equal(next.length, 24);
    assert.equal(next[0].time, '2026-10-02T02:00');
    assert.equal(next.at(-1).time, '2026-10-03T01:00');
  });

  it('formats API-local hours and dates without shifting time zones', () => {
    assert.equal(formatHourLabel('2026-10-02T00:15'), '12 AM');
    assert.equal(formatHourLabel('2026-10-02T13:15'), '1 PM');
    assert.equal(formatDayLabel('2026-10-22'), 'Thu Oct 22');
  });
});

describe('weather pure logic: units', () => {
  it('converts temperatures between Celsius and Fahrenheit', () => {
    assert.equal(convertTemperature(0, 'imperial'), 32);
    assert.equal(convertTemperature(100, 'imperial'), 212);
    assert.equal(convertTemperature(-40, 'imperial'), -40);
    assert.equal(formatTemperature(37, 'imperial', 1), '98.6°F');
    assert.equal(formatTemperature(20, 'metric'), '20°C');
  });

  it('converts wind and pressure for imperial display', () => {
    assert.ok(Math.abs(convertWindSpeed(100, 'imperial') - 62.1371) < 0.001);
    assert.equal(formatWindSpeed(100, 'metric'), '100 km/h');
    assert.equal(formatWindSpeed(100, 'imperial'), '62 mph');
    assert.equal(formatPressure(1013, 'metric'), '1013 hPa');
    assert.equal(formatPressure(1013, 'imperial'), '29.91 inHg');
  });
});

describe('page wiring: weather', () => {
  it('reuses the shared session geo layer', () => {
    assert.ok(weatherSrc.includes('getUserPosition'));
    assert.ok(weatherSrc.includes("from \"@/lib/geo\""));
  });

  it('has a debounced global search with selectable results', () => {
    assert.ok(weatherSrc.includes('type="search"'));
    assert.ok(weatherSrc.includes('Search global locations'));
    assert.ok(weatherSrc.includes('buildGeocodingUrl(trimmed, 6)'));
    assert.ok(weatherSrc.includes('}, 300);'));
    assert.ok(weatherSrc.includes('onClick={() => selectSearchResult(result)}'));
    assert.ok(weatherSrc.includes('No places found'));
  });

  it('has a Use my location path and honest denied state', () => {
    assert.ok(weatherSrc.includes('Use my location'));
    assert.ok(weatherSrc.includes('Your location is unavailable or permission was denied'));
    assert.ok(weatherSrc.includes('No location has been guessed'));
  });

  it('has a persisted °C/°F toggle', () => {
    assert.ok(weatherSrc.includes('olympus:weather:prefs:v1'));
    assert.ok(weatherSrc.includes('offLabel="°C"'));
    assert.ok(weatherSrc.includes('onLabel="°F"'));
    assert.ok(weatherSrc.includes('checked={unit === "imperial"}'));
    assert.ok(weatherSrc.includes('localStorage.setItem(PREFS_KEY'));
  });

  it('renders current metrics, the next 24 hours, and the 7-day forecast', () => {
    assert.ok(weatherSrc.includes('Feels like'));
    assert.ok(weatherSrc.includes('Humidity'));
    assert.ok(weatherSrc.includes('Pressure'));
    assert.ok(weatherSrc.includes('next24Hours(forecast)'));
    assert.ok(weatherSrc.includes('Next 24 hours'));
    assert.ok(weatherSrc.includes('7-day forecast'));
    assert.ok(weatherSrc.includes('Retry weather'));
  });
});

describe('page wiring: compass', () => {
  it('reuses the shared session geo layer for coordinates', () => {
    assert.ok(compassSrc.includes('getUserPosition'));
    assert.ok(compassSrc.includes("from \"@/lib/geo\""));
    assert.ok(compassSrc.includes('formatCoords(position.lat, position.lon)'));
  });

  it('requests iOS orientation permission only from the Enable compass gesture', () => {
    assert.ok(compassSrc.includes('DeviceOrientationEvent.requestPermission'));
    assert.ok(compassSrc.includes('onClick={enableCompass}'));
    assert.ok(compassSrc.includes('Enable compass'));
    assert.ok(compassSrc.includes('permission !== "granted"'));
  });

  it('listens for orientation and smooths the heading across north', () => {
    assert.ok(compassSrc.includes('addEventListener("deviceorientation", handleOrientation, true)'));
    assert.ok(compassSrc.includes('addEventListener("deviceorientationabsolute", handleOrientation, true)'));
    assert.ok(compassSrc.includes('headingFromDeviceOrientation(event)'));
    assert.ok(compassSrc.includes('smoothHeading(headingRef.current, rawHeading, 0.22)'));
    assert.ok(compassSrc.includes('removeEventListener("deviceorientation", handleOrientation, true)'));
  });

  it('renders an SVG dial with cardinal marks and degree readout', () => {
    assert.ok(compassSrc.includes('<svg'));
    assert.ok(compassSrc.includes('CARDINAL_16.map'));
    assert.ok(compassSrc.includes('rotate(${-displayHeading} 160 160)'));
    assert.ok(compassSrc.includes('degreesToCardinal16(heading)'));
  });

  it('has a global search that computes target bearing and distance', () => {
    assert.ok(compassSrc.includes('type="search"'));
    assert.ok(compassSrc.includes('Search global locations'));
    assert.ok(compassSrc.includes('buildGeocodingUrl(trimmed, 6)'));
    assert.ok(compassSrc.includes('navigationToTarget(position, target)'));
    assert.ok(compassSrc.includes('Bearing from you'));
    assert.ok(compassSrc.includes('Distance from you'));
  });

  it('can point the dial toward the searched target and is honest without a sensor', () => {
    assert.ok(compassSrc.includes('Point to target'));
    assert.ok(compassSrc.includes('targetBearing={targetBearing}'));
    assert.ok(compassSrc.includes('normalizeDegrees(targetBearing - displayHeading)'));
    assert.ok(compassSrc.includes('No live compass sensor'));
    assert.ok(compassSrc.includes('no starting point has been invented'));
  });
});
