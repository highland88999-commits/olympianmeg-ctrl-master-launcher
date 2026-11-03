// lib/time/true-time.js
// TRUE TIME (Merlin, 2026-11-03): every clock on the platform
// reads the real time. If the user grants location permission,
// clocks show the user's local time. If not (denied, unavailable,
// or never asked), clocks fall back to Sydney, Australia time.
//
// Pure logic here — the browser's geolocation and Intl APIs do
// the heavy lifting. Any 3D scene (Big Ben, Hawkins clocks, any
// future clock) calls getTrueTime() per frame and sets its
// hands from the returned angles.

/** Fallback timezone when location is unavailable: Sydney, Australia. */
export const FALLBACK_TIMEZONE = 'Australia/Sydney';

// Cached location state — we ask once, not every frame.
let _locationState = 'unknown'; // 'unknown' | 'granted' | 'denied' | 'unavailable'
let _watchStarted = false;

/**
 * Ask for the user's location (once). Resolves when we know
 * whether it's granted or not. Safe to call repeatedly — only
 * the first call triggers the browser prompt.
 */
export function requestLocationForTime() {
  if (_watchStarted) return Promise.resolve(_locationState);
  _watchStarted = true;
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      _locationState = 'unavailable';
      resolve(_locationState);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => { _locationState = 'granted'; resolve(_locationState); },
      () => { _locationState = 'denied'; resolve(_locationState); },
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}

/** Current location permission state for time purposes. */
export function locationTimeState() {
  return _locationState;
}

/**
 * The true time, as { hours, minutes, seconds, timezone }.
 * Uses the user's local timezone when location is granted,
 * Sydney time otherwise. Always returns *something* — never throws.
 */
export function getTrueTime(date = new Date()) {
  const useLocal = _locationState === 'granted';
  const timeZone = useLocal ? undefined : FALLBACK_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false, ...(timeZone ? { timeZone } : {}),
    }).formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
    return {
      hours: get('hour') % 24,
      minutes: get('minute'),
      seconds: get('second'),
      timezone: useLocal ? 'local' : FALLBACK_TIMEZONE,
    };
  } catch {
    // Intl failed — fall back to the raw local time.
    return {
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds(),
      timezone: 'local-fallback',
    };
  }
}

/**
 * Clock-hand angles in radians, for direct use in 3D scenes.
 * 0 = pointing up (12 o'clock), increasing clockwise.
 * Returns { hourAngle, minuteAngle, secondAngle }.
 */
export function getClockAngles(date = new Date()) {
  const { hours, minutes, seconds } = getTrueTime(date);
  const TAU = Math.PI * 2;
  return {
    hourAngle: ((hours % 12) + minutes / 60 + seconds / 3600) / 12 * TAU,
    minuteAngle: (minutes + seconds / 60) / 60 * TAU,
    secondAngle: seconds / 60 * TAU,
  };
}
