"use client";

// /weather — global Weather for the UTILITIES menu (Merlin, 2026-10-22).
// Open-Meteo supplies both geocoding and forecasts: it is free, global,
// CORS-open, and needs no API key, so all requests happen client-side.
//
// On open, the shared geo layer resolves the user's position once per
// session. Denial never blocks the program: the global place search
// stays front and center and can load weather for anywhere on Earth.
// The API response is kept in metric units and converted only for
// display, which makes the °C/°F toggle instant and honest.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ToggleSwitch from "@/components/journal/ToggleSwitch";
import { formatCoords, getUserPosition } from "@/lib/geo";
import { degreesToCardinal16 } from "@/lib/compass/navigation";
import { describeWeatherCode } from "@/lib/weather/codes";
import {
  buildForecastUrl,
  buildGeocodingUrl,
  formatDayLabel,
  formatHourLabel,
  formatLocalTime,
  formatPressure,
  formatTemperature,
  formatWindSpeed,
  next24Hours,
  normalizeForecast,
  normalizeGeocodingResults,
  normalizeUnit,
} from "@/lib/weather/forecast";

const PREFS_KEY = "olympus:weather:prefs:v1";

function readUnitPreference() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}");
    return normalizeUnit(parsed.unit);
  } catch {
    return "metric";
  }
}

function saveUnitPreference(unit) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ unit }));
  } catch {
    /* storage blocked — the selected unit still applies to this visit */
  }
}

function devicePlaceFromPosition(position) {
  return {
    name: "Your location",
    label: "Your location",
    region: "",
    country: "",
    latitude: position.lat,
    longitude: position.lon,
    source: "device",
  };
}

function searchPlaceFromResult(result) {
  return {
    name: result.name,
    label: result.label,
    region: result.region,
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude,
    source: "search",
  };
}

function MetricCard({ label, value, detail }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="break-words text-lg font-semibold text-slate-50">{value}</span>
      {detail && <span className="break-words text-xs text-slate-400">{detail}</span>}
    </div>
  );
}

export default function WeatherPage() {
  const [unit, setUnit] = useState("metric");
  const [devicePlace, setDevicePlace] = useState(null);
  const [displayPlace, setDisplayPlace] = useState(null);
  const [locationState, setLocationState] = useState("loading");
  const [forecast, setForecast] = useState(null);
  const [weatherState, setWeatherState] = useState("idle");
  const [weatherError, setWeatherError] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchState, setSearchState] = useState("idle");
  const searchRequestRef = useRef(0);
  const ignoredSearchQueryRef = useRef("");
  const weatherRequestRef = useRef(0);
  const userSelectedPlaceRef = useRef(false);

  useEffect(() => {
    setUnit(readUnitPreference());
  }, []);

  const loadForecast = useCallback(async (place) => {
    if (!place) return;
    const requestId = ++weatherRequestRef.current;
    const url = buildForecastUrl(place);
    if (!url) {
      setWeatherState("error");
      setWeatherError("That place does not have valid coordinates.");
      return;
    }

    setWeatherState("loading");
    setWeatherError("");
    setForecast(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
      const payload = await response.json();
      const normalized = normalizeForecast(payload);
      if (!normalized) throw new Error("Open-Meteo returned an incomplete forecast");
      if (weatherRequestRef.current !== requestId) return;
      setForecast(normalized);
      setWeatherState("ready");
    } catch {
      if (weatherRequestRef.current !== requestId) return;
      setWeatherState("error");
      setWeatherError("Weather could not be loaded. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const position = await getUserPosition();
      if (!alive) return;
      if (!position) {
        setLocationState("unavailable");
        return;
      }
      const place = devicePlaceFromPosition(position);
      setDevicePlace(place);
      setLocationState("ready");
      if (!userSelectedPlaceRef.current) setDisplayPlace(place);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (displayPlace) loadForecast(displayPlace);
  }, [displayPlace, loadForecast]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchState("idle");
      return;
    }
    if (trimmed === ignoredSearchQueryRef.current) {
      ignoredSearchQueryRef.current = "";
      setSearchResults([]);
      setSearchState("idle");
      return;
    }

    setSearchState("loading");
    const timeoutId = setTimeout(async () => {
      const requestId = ++searchRequestRef.current;
      try {
        const response = await fetch(buildGeocodingUrl(trimmed, 6));
        if (!response.ok) throw new Error(`Open-Meteo geocoding ${response.status}`);
        const payload = await response.json();
        const results = normalizeGeocodingResults(payload);
        if (searchRequestRef.current !== requestId) return;
        setSearchResults(results);
        setSearchState(results.length ? "ready" : "empty");
      } catch {
        if (searchRequestRef.current !== requestId) return;
        setSearchResults([]);
        setSearchState("error");
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  function selectSearchResult(result) {
    userSelectedPlaceRef.current = true;
    ignoredSearchQueryRef.current = result.name;
    setDisplayPlace(searchPlaceFromResult(result));
    setQuery(result.name);
    setSearchResults([]);
    setSearchState("idle");
  }

  async function useMyLocation() {
    if (devicePlace) {
      userSelectedPlaceRef.current = false;
      setDisplayPlace(devicePlace);
      setQuery("");
      setSearchResults([]);
      setSearchState("idle");
      return;
    }
    setLocationState("loading");
    const position = await getUserPosition();
    if (!position) {
      setLocationState("unavailable");
      return;
    }
    const place = devicePlaceFromPosition(position);
    userSelectedPlaceRef.current = false;
    setDevicePlace(place);
    setDisplayPlace(place);
    setLocationState("ready");
  }

  function changeUnit(showImperial) {
    const nextUnit = showImperial ? "imperial" : "metric";
    setUnit(nextUnit);
    saveUnitPreference(nextUnit);
  }

  const current = forecast?.current || null;
  const currentDescription = current ? describeWeatherCode(current.weatherCode) : null;
  const hourly = forecast ? next24Hours(forecast) : [];
  const daily = forecast?.daily || [];

  return (
    <main className="min-h-[100dvh] bg-[#081426] text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link href="/" className="page-back">
            ← Hub
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">🌤️ Weather</h1>
            <p className="text-sm text-slate-400">
              Current conditions and forecasts for your location — or anywhere on Earth.
            </p>
          </div>
        </header>

        <section
          aria-label="Find a place"
          className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5"
        >
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Search global locations
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a city, town, or place…"
              autoComplete="off"
              className="w-full min-w-0 rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            />
          </label>

          {searchState === "loading" && (
            <p className="text-sm text-slate-400" role="status">
              Searching places…
            </p>
          )}
          {searchState === "error" && (
            <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              Place search could not be completed. Try again in a moment.
            </p>
          )}
          {searchState === "empty" && (
            <p className="text-sm text-slate-400">
              No places found for “{query.trim()}”. Try a different spelling or a nearby city.
            </p>
          )}
          {searchResults.length > 0 && (
            <ul aria-label="Place search results" className="flex flex-col gap-2">
              {searchResults.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => selectSearchResult(result)}
                    className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2.5 text-left transition hover:border-sky-300/40 hover:bg-sky-400/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-100">
                      {result.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatCoords(result.latitude, result.longitude)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <button
              type="button"
              onClick={useMyLocation}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
            >
              Use my location
            </button>
            <ToggleSwitch
              label="Units"
              offLabel="°C"
              onLabel="°F"
              checked={unit === "imperial"}
              onToggle={changeUnit}
            />
          </div>

          {locationState === "loading" && (
            <p className="text-sm text-slate-400" role="status">
              Finding your location…
            </p>
          )}
          {locationState === "unavailable" && (
            <p className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm leading-relaxed text-amber-100">
              Your location is unavailable or permission was denied. No location has been guessed — use the search above to load weather for any place.
            </p>
          )}
          {locationState === "ready" && devicePlace && (
            <p className="text-sm text-slate-400">
              Device position ready: {formatCoords(devicePlace.latitude, devicePlace.longitude)}
            </p>
          )}
        </section>

        {!displayPlace && locationState === "loading" && (
          <section aria-label="Loading weather" className="flex flex-col gap-3">
            <div className="h-36 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
          </section>
        )}

        {displayPlace && weatherState === "loading" && (
          <section aria-label="Loading weather" className="flex flex-col gap-3">
            <div className="h-44 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
            <div className="h-56 animate-pulse rounded-2xl bg-white/5" />
          </section>
        )}

        {displayPlace && weatherState === "error" && (
          <section className="flex flex-col gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-6">
            <h2 className="text-lg font-semibold text-red-100">Weather unavailable</h2>
            <p className="text-sm leading-relaxed text-red-200">{weatherError}</p>
            <div>
              <button
                type="button"
                onClick={() => loadForecast(displayPlace)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              >
                Retry weather
              </button>
            </div>
          </section>
        )}

        {forecast && current && currentDescription && weatherState === "ready" && (
          <>
            <section
              aria-label="Current weather"
              className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-xl font-bold text-slate-50">
                    {displayPlace?.label || "Selected place"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {displayPlace
                      ? formatCoords(displayPlace.latitude, displayPlace.longitude)
                      : ""}
                    {forecast.timezone ? ` · ${forecast.timezone}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Local time {formatLocalTime(current.time)}
                  </p>
                </div>
                <span className="rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">
                  {displayPlace?.source === "device" ? "Your location" : "Searched place"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                <span aria-hidden="true" className="text-6xl leading-none">
                  {currentDescription.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
                    {formatTemperature(current.temperatureC, unit)}
                  </p>
                  <p className="mt-1 text-base font-medium text-slate-200">
                    {currentDescription.label}
                  </p>
                  <p className="text-sm text-slate-400">
                    Feels like {formatTemperature(current.apparentTemperatureC, unit)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard label="Humidity" value={current.humidity === null ? "—" : `${Math.round(current.humidity)}%`} />
                <MetricCard
                  label="Wind"
                  value={formatWindSpeed(current.windSpeedKmh, unit)}
                  detail={current.windDirectionDegrees === null ? undefined : `From ${degreesToCardinal16(current.windDirectionDegrees)} · ${Math.round(current.windDirectionDegrees)}°`}
                />
                <MetricCard label="Pressure" value={formatPressure(current.surfacePressureHpa, unit)} />
                <MetricCard
                  label="Precipitation"
                  value={current.precipitationMm === null ? "—" : `${current.precipitationMm} mm`}
                />
                <MetricCard
                  label="Coordinates"
                  value={displayPlace ? formatCoords(displayPlace.latitude, displayPlace.longitude) : "—"}
                />
              </div>
            </section>

            <section aria-label="Next 24 hours" className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-slate-50">Next 24 hours</h2>
              <div className="overflow-x-auto pb-2">
                <div className="flex min-w-full gap-3">
                  {hourly.map((hour) => {
                    const description = describeWeatherCode(hour.weatherCode);
                    return (
                      <article
                        key={hour.time}
                        className="flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-center"
                      >
                        <time className="text-xs font-semibold text-slate-300">
                          {formatHourLabel(hour.time)}
                        </time>
                        <span aria-hidden="true" className="text-3xl leading-none">
                          {description.icon}
                        </span>
                        <span className="text-base font-bold text-white">
                          {formatTemperature(hour.temperatureC, unit)}
                        </span>
                        <span className="min-h-8 break-words text-[11px] leading-tight text-slate-400">
                          {description.label}
                        </span>
                        <span className="text-[11px] text-sky-300">
                          {hour.precipitationProbability === null
                            ? "— rain"
                            : `${Math.round(hour.precipitationProbability)}% rain`}
                        </span>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>

            <section aria-label="Seven-day forecast" className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-slate-50">7-day forecast</h2>
              <ul className="flex flex-col gap-3">
                {daily.map((day) => {
                  const description = describeWeatherCode(day.weatherCode);
                  return (
                    <li
                      key={day.date}
                      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <time className="w-28 shrink-0 text-sm font-semibold text-slate-100">
                        {formatDayLabel(day.date)}
                      </time>
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <span aria-hidden="true" className="text-3xl leading-none">
                          {description.icon}
                        </span>
                        <span className="min-w-0 break-words text-sm text-slate-200">
                          {description.label}
                        </span>
                      </span>
                      <span className="text-sm text-sky-300">
                        {day.precipitationProbability === null
                          ? "—"
                          : `${Math.round(day.precipitationProbability)}% precip.`}
                      </span>
                      <span className="text-sm text-slate-300">
                        {formatTemperature(day.lowC, unit)} /{" "}
                        <strong className="text-white">{formatTemperature(day.highC, unit)}</strong>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        {!displayPlace && locationState === "unavailable" && (
          <section className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
            <h2 className="text-lg font-semibold text-slate-100">Search to see the weather</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              Your device position is off, but global weather is still available. Search
              for any city or place above and its current conditions, next 24 hours,
              and 7-day forecast will appear here.
            </p>
          </section>
        )}

        <footer className="text-xs text-slate-500">
          Weather, forecasts, and place search by Open-Meteo.
        </footer>
      </div>
    </main>
  );
}
