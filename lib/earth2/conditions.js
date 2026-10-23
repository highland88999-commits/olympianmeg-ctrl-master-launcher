// lib/earth2/conditions.js
// EARTH 2 — REAL WEATHER, MIRRORED (Living Planet Wave A,
// 2026-10-23). The Weather app already reads Open-Meteo for the
// walker's real position (lib/weather/*); this module reads it
// for the WALKER'S PARCEL — the parcel's own lat/lon, from
// lib/earth2/parcels.js — and maps the answer into the handful
// of numbers the walked world runs on: how much cloud covers
// the sky, whether anything falls out of it (and what), how far
// the fog lets you see, and how hard the wind pushes the plants.
//
// Pure mapping + a defensive fetch wrapper: no DOM, no three.js.
// Total failure (offline, API down, junk payload) returns null
// and the world keeps the clear local-time sky it already had —
// the weather never blocks the planet. Refetch discipline lives
// here too: a fresh read every 10 minutes, or sooner when the
// walker crosses ~1.5° of the globe (parcels are 3.6° × 7.2°,
// so any parcel change CAN justify a read — the threshold keeps
// border-pacing from hammering the API).

import { OPEN_METEO_FORECAST_URL } from '../weather/forecast.js';
import { describeWeatherCode } from '../weather/codes.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// How far (in degrees of travel) and how long (ms) a cached read
// stays fresh.
export const WEATHER_REFETCH_DEG = 1.5;
export const WEATHER_REFETCH_MS = 10 * 60 * 1000;

// Open-Meteo current read for the world: the code, the
// temperature (snow vs rain judgment), the wind (plant sway,
// cloud drift), the cloud cover (sky dimming + the cloud layer)
// and the day flag. Visibility is hourly-only in the API, so
// the nearest hour rides along for the fog.
const CURRENT_FIELDS = [
  'temperature_2m',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'cloud_cover',
  'is_day',
].join(',');

export function buildCurrentWeatherUrl(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
    return null;
  }
  const params = new URLSearchParams({
    latitude: String(la),
    longitude: String(lo),
    current: CURRENT_FIELDS,
    hourly: 'visibility',
    forecast_days: '2',
    timezone: 'auto',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
  });
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
}

/**
 * Normalize an Open-Meteo payload into the world's read:
 * { code, tempC, windKmh, windDirDeg, cloudCover (0..1),
 *   visibilityM (or null), isDay } — or null when the payload
 *   carries nothing usable. Visibility is matched to the hour
 *   the payload calls current.
 */
export function normalizeCurrentWeather(payload) {
  const cur = payload && payload.current;
  if (!cur || typeof cur !== 'object') return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const code = num(cur.weather_code);
  if (code === null) return null;
  let visibilityM = null;
  const hourly = payload.hourly;
  if (hourly && Array.isArray(hourly.time) && Array.isArray(hourly.visibility)) {
    const hourKey = typeof cur.time === 'string' ? cur.time.slice(0, 13) : '';
    let idx = hourly.time.findIndex((t) => typeof t === 'string' && t.slice(0, 13) === hourKey);
    if (idx < 0) idx = 0;
    visibilityM = num(hourly.visibility[idx]);
  }
  return {
    code,
    tempC: num(cur.temperature_2m),
    windKmh: num(cur.wind_speed_10m) ?? 0,
    windDirDeg: num(cur.wind_direction_10m) ?? 0,
    cloudCover: clamp((num(cur.cloud_cover) ?? 0) / 100, 0, 1),
    visibilityM,
    isDay: cur.is_day === 1,
  };
}

/**
 * The mapping the world runs on. Input: a normalized read (or
 * null). Output, always total:
 *   cloudCover  0..1 — sky dimming + cloud layer opacity
 *   precip      { kind: 'none'|'rain'|'snow', intensity 0..1 }
 *   fogFar      metres the fog plane sits at (the scene lerps
 *               its near/far around this)
 *   windSway    plant-sway speed multiplier (calm 0.7 … storm 2.6)
 *   windDirDeg  where the wind comes FROM (cloud drift uses it)
 *   label/icon  the Weather app's own words for the code
 */
export function weatherToWorld(wx) {
  if (!wx) {
    return {
      cloudCover: 0, precip: { kind: 'none', intensity: 0 },
      fogFar: 980, windSway: 1, windDirDeg: 0, label: '', icon: '', code: null,
    };
  }
  const { category, label, icon } = describeWeatherCode(wx.code);
  const temp = wx.tempC == null ? 10 : wx.tempC;
  let precip = { kind: 'none', intensity: 0 };
  const rainy = ['rain', 'drizzle', 'showers', 'thunderstorm', 'freezing-precipitation'];
  const snowy = ['snow', 'snow-showers'];
  if (rainy.includes(category) || snowy.includes(category)) {
    // Frozen categories always fall as snow; rain categories
    // turn to snow when the air itself is freezing.
    const kind = snowy.includes(category) || temp <= 0.5 ? 'snow' : 'rain';
    const base = {
      drizzle: 0.3, rain: 0.55, showers: 0.6, snow: 0.55, 'snow-showers': 0.6,
      thunderstorm: 0.9, 'freezing-precipitation': 0.5,
    }[category] ?? 0.5;
    // Heavier codes in a family fall harder (61 < 63 < 65).
    const step = [61, 63, 65, 71, 73, 75, 80, 81, 82, 85, 86].includes(wx.code) ? 0.12 : 0;
    precip = { kind, intensity: clamp(base + step - 0.12, 0.15, 1) };
  }
  // Fog: the fog codes and genuinely poor visibility close the
  // world in; ordinary haze barely moves the far plane.
  let fogFar = 980;
  if (category === 'fog') fogFar = 260;
  if (wx.visibilityM != null) {
    if (wx.visibilityM < 1000) fogFar = Math.min(fogFar, 190);
    else if (wx.visibilityM < 4000) fogFar = Math.min(fogFar, 420);
    else if (wx.visibilityM < 10000) fogFar = Math.min(fogFar, 700);
  }
  if (precip.kind !== 'none') fogFar = Math.min(fogFar, 760);
  const windSway = clamp(0.7 + (wx.windKmh || 0) / 28, 0.7, 2.6);
  return {
    cloudCover: wx.cloudCover,
    precip,
    fogFar,
    windSway,
    windDirDeg: wx.windDirDeg || 0,
    label, icon, code: wx.code,
  };
}

/** Should the world fetch fresh weather? `last` is
 *  { lat, lon, atMs } of the previous successful read (or null). */
export function shouldRefetchWeather(last, lat, lon, nowMs) {
  if (!last) return true;
  if (nowMs - last.atMs >= WEATHER_REFETCH_MS) return true;
  const moved = Math.abs((Number(lat) || 0) - last.lat) + Math.abs((Number(lon) || 0) - last.lon);
  return moved >= WEATHER_REFETCH_DEG;
}

/**
 * Fetch + normalize the current weather for a parcel. Returns
 * the normalized read, or null on ANY failure — offline, HTTP
 * error, junk body. Never throws: the world falls back to the
 * clear sky it already has.
 */
export async function fetchCurrentWeather(lat, lon, fetchImpl) {
  const url = buildCurrentWeatherUrl(lat, lon);
  if (!url) return null;
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return null;
  try {
    const res = await doFetch(url);
    if (!res || !res.ok) return null;
    const data = await res.json();
    return normalizeCurrentWeather(data);
  } catch {
    return null;
  }
}
