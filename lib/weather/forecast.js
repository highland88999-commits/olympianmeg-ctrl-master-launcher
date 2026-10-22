// lib/weather/forecast.js — pure Open-Meteo request/response helpers.
//
// Open-Meteo is free, global, CORS-open, and needs no API key. These
// helpers own URL construction, geocoding-result normalisation,
// forecast normalisation, local clock labels, and unit conversion.
// No DOM and no fetch calls live here, so every function is testable.

export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
].join(',');

const HOURLY_FIELDS = [
  'temperature_2m',
  'weather_code',
  'precipitation_probability',
].join(',');

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
].join(',');

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordinate(value, min, max) {
  const number = finiteNumber(value);
  return number !== null && number >= min && number <= max ? number : null;
}

export function buildGeocodingUrl(query, count = 6) {
  const params = new URLSearchParams({
    name: String(query || '').trim(),
    count: String(Math.max(1, Math.min(10, Number(count) || 6))),
    language: 'en',
    format: 'json',
  });
  return `${OPEN_METEO_GEOCODING_URL}?${params.toString()}`;
}

export function normalizeGeocodingResults(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.flatMap((result) => {
    const latitude = coordinate(result?.latitude, -90, 90);
    const longitude = coordinate(result?.longitude, -180, 180);
    const name = typeof result?.name === 'string' ? result.name.trim() : '';
    if (!name || latitude === null || longitude === null) return [];

    const country = typeof result?.country === 'string' ? result.country.trim() : '';
    const regions = [result?.admin1, result?.admin2]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
      .filter((value, index, all) => value !== name && all.indexOf(value) === index);
    const region = regions.join(', ');
    const label = [name, region, country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

    return [{
      id: result.id ?? `${latitude},${longitude},${name}`,
      name,
      region,
      country,
      latitude,
      longitude,
      timezone: typeof result?.timezone === 'string' ? result.timezone : '',
      label,
    }];
  });
}

export function buildForecastUrl(place, forecastDays = 7) {
  const latitude = coordinate(place?.latitude ?? place?.lat, -90, 90);
  const longitude = coordinate(place?.longitude ?? place?.lon, -180, 180);
  if (latitude === null || longitude === null) return null;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    daily: DAILY_FIELDS,
    // The canonical response is metric. The page converts for display,
    // so the °C/°F switch is instant and does not need a second fetch.
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    timezone: 'auto',
    forecast_days: String(Math.max(1, Math.min(16, Number(forecastDays) || 7))),
  });
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
}

export function normalizeForecast(payload) {
  const current = payload?.current;
  const hourly = payload?.hourly;
  const daily = payload?.daily;
  if (!current || !Array.isArray(hourly?.time) || !Array.isArray(daily?.time)) return null;

  const hourlyRows = hourly.time.map((time, index) => ({
    time,
    temperatureC: finiteNumber(hourly.temperature_2m?.[index]),
    weatherCode: finiteNumber(hourly.weather_code?.[index]),
    precipitationProbability: finiteNumber(hourly.precipitation_probability?.[index]),
  }));

  const dailyRows = daily.time.map((date, index) => ({
    date,
    weatherCode: finiteNumber(daily.weather_code?.[index]),
    highC: finiteNumber(daily.temperature_2m_max?.[index]),
    lowC: finiteNumber(daily.temperature_2m_min?.[index]),
    precipitationProbability: finiteNumber(daily.precipitation_probability_max?.[index]),
  }));

  return {
    timezone: typeof payload.timezone === 'string' ? payload.timezone : '',
    utcOffsetSeconds: finiteNumber(payload.utc_offset_seconds),
    current: {
      time: current.time || '',
      temperatureC: finiteNumber(current.temperature_2m),
      apparentTemperatureC: finiteNumber(current.apparent_temperature),
      humidity: finiteNumber(current.relative_humidity_2m),
      isDay: current.is_day === 1,
      precipitationMm: finiteNumber(current.precipitation),
      weatherCode: finiteNumber(current.weather_code),
      surfacePressureHpa: finiteNumber(current.surface_pressure),
      windSpeedKmh: finiteNumber(current.wind_speed_10m),
      windDirectionDegrees: finiteNumber(current.wind_direction_10m),
    },
    hourly: hourlyRows,
    daily: dailyRows,
  };
}

export function next24Hours(forecast, fromTime = forecast?.current?.time) {
  const hourly = Array.isArray(forecast?.hourly) ? forecast.hourly : [];
  if (!hourly.length) return [];
  const start = fromTime ? hourly.findIndex((row) => row.time >= fromTime) : 0;
  const safeStart = start >= 0 ? start : Math.max(0, hourly.length - 24);
  return hourly.slice(safeStart, safeStart + 24);
}

export function normalizeUnit(unit) {
  return unit === 'imperial' ? 'imperial' : 'metric';
}

export function convertTemperature(celsius, unit = 'metric') {
  const value = finiteNumber(celsius);
  if (value === null) return null;
  return normalizeUnit(unit) === 'imperial' ? (value * 9) / 5 + 32 : value;
}

export function formatTemperature(celsius, unit = 'metric', digits = 0) {
  const converted = convertTemperature(celsius, unit);
  if (converted === null) return '—';
  const suffix = normalizeUnit(unit) === 'imperial' ? '°F' : '°C';
  return `${converted.toFixed(Math.max(0, Math.min(2, digits)))}${suffix}`;
}

export function convertWindSpeed(kmh, unit = 'metric') {
  const value = finiteNumber(kmh);
  if (value === null) return null;
  return normalizeUnit(unit) === 'imperial' ? value * 0.621371192237334 : value;
}

export function formatWindSpeed(kmh, unit = 'metric') {
  const converted = convertWindSpeed(kmh, unit);
  if (converted === null) return '—';
  const suffix = normalizeUnit(unit) === 'imperial' ? 'mph' : 'km/h';
  return `${Math.round(converted)} ${suffix}`;
}

export function formatPressure(hpa, unit = 'metric') {
  const value = finiteNumber(hpa);
  if (value === null) return '—';
  return normalizeUnit(unit) === 'imperial'
    ? `${(value * 0.029529983071445).toFixed(2)} inHg`
    : `${Math.round(value)} hPa`;
}

function parseIsoParts(value) {
  const match = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/
  );
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] === undefined ? null : Number(match[4]),
    minute: match[5] === undefined ? null : Number(match[5]),
  };
}

function hour12(hour) {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const display = normalized % 12 || 12;
  return { display, suffix };
}

export function formatHourLabel(value) {
  const parts = parseIsoParts(value);
  if (!parts || parts.hour === null) return '—';
  const { display, suffix } = hour12(parts.hour);
  return `${display} ${suffix}`;
}

export function formatLocalTime(value) {
  const parts = parseIsoParts(value);
  if (!parts || parts.hour === null || parts.minute === null) return '—';
  const { display, suffix } = hour12(parts.hour);
  return `${display}:${String(parts.minute).padStart(2, '0')} ${suffix}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDayLabel(value) {
  const parts = parseIsoParts(value);
  if (!parts) return '—';
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[parts.month - 1]} ${parts.day}`;
}
