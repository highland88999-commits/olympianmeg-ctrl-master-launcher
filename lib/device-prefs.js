// lib/device-prefs.js — device-level preferences captured at onboarding
// (Merlin, 2026-10-29): tilt/motion controls and location, both auto-ON,
// both user-toggleable. Persisted per account via /api/ui-state; programs
// read them through this module (never raw ui-state keys).

export const TILT_CONTROLS_KEY = 'tilt_controls';
export const LOCATION_ENABLED_KEY = 'location_enabled';

// Auto-on: a fresh account gets both features working without a setup tap.
export const DEVICE_PREF_DEFAULTS = {
  [TILT_CONTROLS_KEY]: true,
  [LOCATION_ENABLED_KEY]: true,
};

export function coerceDevicePref(key, value) {
  if (typeof value === 'boolean') return value;
  return DEVICE_PREF_DEFAULTS[key] !== false;
}

// Merge saved prefs over the auto-on defaults; unknown keys are dropped.
export function resolveDevicePrefs(saved) {
  const out = { ...DEVICE_PREF_DEFAULTS };
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(DEVICE_PREF_DEFAULTS)) {
      if (typeof saved[key] === 'boolean') out[key] = saved[key];
    }
  }
  return out;
}

// Fetch the account's device prefs (auto-on defaults when signed out or
// unsaved). Pass a getToken function returning the supabase session token.
export async function fetchDevicePrefs(getToken) {
  try {
    const token = await getToken();
    if (!token) return { ...DEVICE_PREF_DEFAULTS };
    const res = await fetch('/api/ui-state', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return { ...DEVICE_PREF_DEFAULTS };
    const body = await res.json().catch(() => null);
    return resolveDevicePrefs(body && body.preferences);
  } catch {
    return { ...DEVICE_PREF_DEFAULTS };
  }
}
