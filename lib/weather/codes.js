// lib/weather/codes.js — WMO weather-code meanings used by Open-Meteo.
//
// Pure data + lookup helpers only: no DOM and no network, so the full
// code table can be unit-tested. Open-Meteo returns numeric WMO codes;
// the Weather page renders the label and icon returned here.

const CODE_DETAILS = {
  0: ['Clear sky', '☀️', 'clear'],
  1: ['Mainly clear', '🌤️', 'clear'],
  2: ['Partly cloudy', '⛅', 'cloudy'],
  3: ['Overcast', '☁️', 'cloudy'],
  45: ['Fog', '🌫️', 'fog'],
  48: ['Depositing rime fog', '🌫️', 'fog'],
  51: ['Light drizzle', '🌦️', 'drizzle'],
  53: ['Moderate drizzle', '🌦️', 'drizzle'],
  55: ['Dense drizzle', '🌦️', 'drizzle'],
  56: ['Light freezing drizzle', '🧊', 'freezing-precipitation'],
  57: ['Dense freezing drizzle', '🧊', 'freezing-precipitation'],
  61: ['Slight rain', '🌧️', 'rain'],
  63: ['Moderate rain', '🌧️', 'rain'],
  65: ['Heavy rain', '🌧️', 'rain'],
  66: ['Light freezing rain', '🧊', 'freezing-precipitation'],
  67: ['Heavy freezing rain', '🧊', 'freezing-precipitation'],
  71: ['Slight snow', '🌨️', 'snow'],
  73: ['Moderate snow', '🌨️', 'snow'],
  75: ['Heavy snow', '❄️', 'snow'],
  77: ['Snow grains', '❄️', 'snow'],
  80: ['Slight rain showers', '🌦️', 'showers'],
  81: ['Moderate rain showers', '🌦️', 'showers'],
  82: ['Violent rain showers', '🌧️', 'showers'],
  85: ['Slight snow showers', '🌨️', 'snow-showers'],
  86: ['Heavy snow showers', '🌨️', 'snow-showers'],
  95: ['Thunderstorm', '⛈️', 'thunderstorm'],
  96: ['Thunderstorm with slight hail', '⛈️', 'thunderstorm'],
  99: ['Thunderstorm with heavy hail', '⛈️', 'thunderstorm'],
};

export const WMO_WEATHER_CODES = Object.freeze(
  Object.keys(CODE_DETAILS).map((code) => Number(code)).sort((a, b) => a - b)
);

export function describeWeatherCode(code) {
  const numericCode = Number(code);
  const detail = CODE_DETAILS[numericCode];
  if (!detail) {
    return {
      code: Number.isFinite(numericCode) ? numericCode : null,
      label: 'Weather unavailable',
      icon: '🌡️',
      category: 'unknown',
    };
  }
  return { code: numericCode, label: detail[0], icon: detail[1], category: detail[2] };
}

export function weatherCodeLabel(code) {
  return describeWeatherCode(code).label;
}

export function weatherCodeIcon(code) {
  return describeWeatherCode(code).icon;
}
