"use client";

// /compass — a real device compass for the UTILITIES menu (Merlin,
// 2026-10-22). DeviceOrientationEvent supplies the live heading where
// the hardware and browser permit it; iOS permission is requested only
// from the visible Enable compass button, inside a user gesture.
//
// The shared geo layer supplies the user's coordinates once per
// session. A global Open-Meteo place search can select any target on
// Earth; pure navigation helpers then calculate the great-circle
// bearing and distance from the user to that place. Desktop and other
// no-sensor devices are told plainly that live heading is unavailable,
// while the searched target bearing can still be shown statically.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatCoords, getUserPosition } from "@/lib/geo";
import {
  CARDINAL_16,
  degreesToCardinal16,
  formatDistance,
  headingFromDeviceOrientation,
  navigationToTarget,
  normalizeDegrees,
  smoothHeading,
} from "@/lib/compass/navigation";
import {
  buildGeocodingUrl,
  normalizeGeocodingResults,
} from "@/lib/weather/forecast";

function polarPoint(angleDegrees, radius) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: 160 + radius * Math.sin(radians),
    y: 160 - radius * Math.cos(radians),
  };
}

function CompassDial({ heading, targetBearing, targetPointing }) {
  const displayHeading = heading ?? 0;
  const targetAngle =
    targetBearing === null || targetBearing === undefined
      ? null
      : normalizeDegrees(targetBearing - displayHeading);

  return (
    <svg
      viewBox="0 0 320 320"
      role="img"
      aria-label={
        heading === null
          ? "Compass dial. Live heading unavailable"
          : `Compass dial. Heading ${Math.round(heading)} degrees ${degreesToCardinal16(heading)}`
      }
      className="mx-auto aspect-square w-full max-w-[420px]"
    >
      <circle cx="160" cy="160" r="156" fill="#0b1c33" stroke="#31527a" strokeWidth="2" />
      <circle cx="160" cy="160" r="126" fill="none" stroke="#1e3a5f" strokeWidth="1" />

      <g transform={`rotate(${-displayHeading} 160 160)`}>
        {Array.from({ length: 72 }, (_, index) => index * 5).map((angle) => {
          const major = angle % 30 === 0;
          const inner = polarPoint(angle, major ? 132 : 142);
          const outer = polarPoint(angle, 151);
          return (
            <line
              key={angle}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={angle === 0 ? "#f87171" : major ? "#cbd5e1" : "#64748b"}
              strokeWidth={major ? 2.5 : 1}
            />
          );
        })}

        {CARDINAL_16.map((label, index) => {
          const angle = index * 22.5;
          const point = polarPoint(angle, 112);
          const primary = index % 4 === 0;
          const secondary = index % 2 === 0;
          return (
            <text
              key={label}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={label === "N" ? "#f87171" : "#e2e8f0"}
              fontSize={primary ? 19 : secondary ? 12 : 9}
              fontWeight={primary || secondary ? 700 : 500}
            >
              {label}
            </text>
          );
        })}

        <path d="M160 48 L171 160 L160 149 L149 160 Z" fill="#ef4444" />
        <path d="M160 272 L171 160 L160 171 L149 160 Z" fill="#94a3b8" />
      </g>

      {targetPointing && targetAngle !== null && (
        <g transform={`rotate(${targetAngle} 160 160)`}>
          <path d="M160 1 L170 22 L150 22 Z" fill="#fbbf24" stroke="#78350f" strokeWidth="1" />
          <circle cx="160" cy="31" r="5" fill="#fbbf24" stroke="#78350f" strokeWidth="1" />
        </g>
      )}

      <circle cx="160" cy="160" r="17" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
      <circle cx="160" cy="160" r="4" fill="#0f172a" />
    </svg>
  );
}

function InfoCard({ label, value, detail }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="break-words text-lg font-semibold text-slate-50">{value}</span>
      {detail && <span className="break-words text-xs leading-relaxed text-slate-400">{detail}</span>}
    </div>
  );
}

export default function CompassPage() {
  const [heading, setHeading] = useState(null);
  const [sensorState, setSensorState] = useState("checking");
  const [sensorMessage, setSensorMessage] = useState("");
  const [position, setPosition] = useState(null);
  const [locationState, setLocationState] = useState("loading");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchState, setSearchState] = useState("idle");
  const [target, setTarget] = useState(null);
  const [targetPointing, setTargetPointing] = useState(true);
  const headingRef = useRef(null);
  const listeningRef = useRef(false);
  const ignoredSearchQueryRef = useRef("");
  const searchRequestRef = useRef(0);

  const handleOrientation = useCallback((event) => {
    const rawHeading = headingFromDeviceOrientation(event);
    if (rawHeading === null) return;
    const smoothed = smoothHeading(headingRef.current, rawHeading, 0.22);
    headingRef.current = smoothed;
    setHeading(smoothed);
    setSensorState("live");
    setSensorMessage("");
  }, []);

  const startCompass = useCallback(() => {
    if (listeningRef.current) return true;
    if (
      typeof window === "undefined" ||
      typeof DeviceOrientationEvent === "undefined"
    ) {
      setSensorState("unavailable");
      return false;
    }
    window.addEventListener("deviceorientation", handleOrientation, true);
    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    listeningRef.current = true;
    setSensorState((current) => (current === "live" ? current : "starting"));
    return true;
  }, [handleOrientation]);

  useEffect(() => {
    if (typeof DeviceOrientationEvent === "undefined") {
      setSensorState("unavailable");
      return;
    }
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      setSensorState("permission-needed");
      setSensorMessage(
        "This device asks for motion permission before it will share a compass heading."
      );
      return;
    }
    startCompass();
  }, [startCompass]);

  useEffect(() => {
    return () => {
      if (!listeningRef.current || typeof window === "undefined") return;
      window.removeEventListener("deviceorientation", handleOrientation, true);
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      listeningRef.current = false;
    };
  }, [handleOrientation]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const nextPosition = await getUserPosition();
      if (!alive) return;
      if (nextPosition) {
        setPosition(nextPosition);
        setLocationState("ready");
      } else {
        setLocationState("unavailable");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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

  async function enableCompass() {
    if (typeof DeviceOrientationEvent === "undefined") {
      setSensorState("unavailable");
      setSensorMessage("This browser does not expose a device compass.");
      return;
    }

    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") {
          setSensorState("denied");
          setSensorMessage(
            "Compass permission was denied. You can still search for a place and see its bearing."
          );
          return;
        }
        setSensorMessage("Motion access granted — hold the device flat and turn slowly.");
      } catch {
        setSensorState("denied");
        setSensorMessage(
          "Compass permission could not be granted. You can still use the place search and target bearing."
        );
        return;
      }
    }
    startCompass();
  }

  function selectTarget(result) {
    ignoredSearchQueryRef.current = result.name;
    setTarget({
      name: result.name,
      label: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setTargetPointing(true);
    setQuery(result.name);
    setSearchResults([]);
    setSearchState("idle");
  }

  function clearTarget() {
    setTarget(null);
    setQuery("");
    setSearchResults([]);
    setSearchState("idle");
  }

  const targetNavigation = useMemo(() => {
    if (!position || !target) return null;
    return navigationToTarget(position, target);
  }, [position, target]);

  const targetBearing = targetNavigation?.bearingDegrees ?? null;

  return (
    <main className="min-h-[100dvh] bg-[#081426] text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link href="/" className="page-back">
            ← Hub
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">🧭 Compass</h1>
            <p className="text-sm text-slate-400">
              Live heading, your coordinates, and the way to any place on Earth.
            </p>
          </div>
        </header>

        <section
          aria-label="Compass status and controls"
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          <InfoCard
            label="Live heading"
            value={
              heading === null
                ? "Unavailable"
                : `${Math.round(heading)}° ${degreesToCardinal16(heading)}`
            }
            detail={
              sensorState === "live"
                ? "Heading is being smoothed so the dial does not jump across north."
                : "A searched target can still be pointed to from your position."
            }
          />
          <InfoCard
            label="Your coordinates"
            value={
              locationState === "ready" && position
                ? formatCoords(position.lat, position.lon)
                : locationState === "loading"
                  ? "Finding…"
                  : "Unavailable"
            }
            detail={
              locationState === "unavailable"
                ? "No location has been guessed. Place search remains available."
                : "Shared once for this session through the Olympus geo layer."
            }
          />
          <InfoCard
            label="Sensor"
            value={
              sensorState === "live"
                ? "Live"
                : sensorState === "permission-needed"
                  ? "Permission needed"
                  : sensorState === "starting"
                    ? "Waiting for heading"
                    : sensorState === "denied"
                      ? "Denied"
                      : sensorState === "unavailable"
                        ? "Not available"
                        : "Checking"
            }
            detail={sensorMessage || "Desktop browsers usually have no compass sensor."}
          />
        </section>

        {(sensorState === "permission-needed" || sensorState === "denied") && (
          <section className="flex flex-col gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-5">
            <h2 className="text-lg font-semibold text-amber-100">Enable the compass sensor</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-amber-100/90">
              Apple devices require a tap before sharing orientation. Tap Enable
              compass, allow motion access, then hold the device flat and turn
              slowly. The dial will begin moving when the first heading arrives.
            </p>
            <div>
              <button
                type="button"
                onClick={enableCompass}
                className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
              >
                Enable compass
              </button>
            </div>
          </section>
        )}

        {sensorState === "unavailable" && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-slate-100">No live compass sensor</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              This device or browser does not provide a live heading. The dial
              therefore stays at north, but searching for a place below still
              shows its bearing and distance from your position when location
              is available.
            </p>
          </section>
        )}

        <section
          aria-label="Search for a target place"
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
                    onClick={() => selectTarget(result)}
                    className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2.5 text-left transition hover:border-amber-300/40 hover:bg-amber-400/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
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

          {target && (
            <div className="flex flex-col gap-4 rounded-xl border border-amber-300/25 bg-amber-400/5 p-4">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-lg font-bold text-slate-50">{target.label}</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatCoords(target.latitude, target.longitude)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearTarget}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-100 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  Clear target
                </button>
              </div>

              {targetNavigation ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoCard
                    label="Bearing from you"
                    value={`${Math.round(targetNavigation.bearingDegrees)}° ${targetNavigation.cardinal}`}
                    detail="Initial great-circle bearing — the direction to start travelling."
                  />
                  <InfoCard
                    label="Distance from you"
                    value={formatDistance(targetNavigation.distanceKm)}
                    detail="Straight-line distance over the Earth."
                  />
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-slate-400">
                  A bearing and distance need your position. Your location is
                  unavailable, so this target is shown by coordinates only —
                  no starting point has been invented.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTargetPointing((value) => !value)}
                  aria-pressed={targetPointing}
                  className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
                >
                  {targetPointing ? "Hide target pointer" : "Point to target"}
                </button>
                <span className="text-sm text-slate-400">
                  The gold marker rides the edge of the dial toward the target.
                </span>
              </div>
            </div>
          )}
        </section>

        <section
          aria-label="Compass dial"
          className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
        >
          <CompassDial
            heading={heading}
            targetBearing={targetBearing}
            targetPointing={targetPointing && Boolean(target)}
          />
          <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
            <div className="rounded-xl bg-slate-950/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Heading</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {heading === null ? "—" : `${Math.round(heading)}°`}
              </p>
            </div>
            <div className="rounded-xl bg-slate-950/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cardinal</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {heading === null ? "—" : degreesToCardinal16(heading)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-950/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Target</p>
              <p className="mt-1 break-words text-2xl font-bold text-amber-200">
                {targetNavigation
                  ? `${Math.round(targetNavigation.bearingDegrees)}° ${targetNavigation.cardinal}`
                  : "—"}
              </p>
            </div>
          </div>
          {heading === null && (
            <p className="text-center text-sm leading-relaxed text-slate-400">
              {targetNavigation
                ? "Static view: the gold marker shows the target's true bearing because no live heading is available."
                : "Static view: the dial points north until a device heading becomes available."}
            </p>
          )}
        </section>

        <footer className="text-xs text-slate-500">
          Place search by Open-Meteo. Bearings follow the shortest great-circle path.
        </footer>
      </div>
    </main>
  );
}
