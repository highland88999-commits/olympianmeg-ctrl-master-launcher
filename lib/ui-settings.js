// lib/ui-settings.js — account-level UI settings (the Concourse
// Settings sheet). Pure + storage-injected helpers, unit tested in
// tests/concourse-settings.test.mjs. No DOM here.
//
// Shape (stored per account as the `settings` ui-state key, cached
// in localStorage for instant paint):
//   { sound: boolean } — master sound: the Radio + hub fx emitters.
// Default: sound ON. Unknown keys are dropped; a non-boolean sound
// invalidates the whole value (the route 400s, resolvers fall back
// to the default).

export const UI_SETTINGS_EVENT = 'olympus:ui-settings-changed';
export const UI_SETTINGS_CACHE_KEY = 'olympus.ui-settings';
export const DEFAULT_UI_SETTINGS = Object.freeze({ sound: true });

export function sanitizeUiSettings(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (typeof v.sound !== 'boolean') return null;
  return { sound: v.sound };
}

/** The settings to apply: the stored value, or the defaults. */
export function resolveUiSettings(v) {
  return sanitizeUiSettings(v) || { ...DEFAULT_UI_SETTINGS };
}

export function readUiSettingsCache(storage) {
  try {
    const raw = storage ? storage.getItem(UI_SETTINGS_CACHE_KEY) : null;
    if (!raw) return null;
    return sanitizeUiSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeUiSettingsCache(storage, settings) {
  try {
    const sane = sanitizeUiSettings(settings);
    if (storage && sane) storage.setItem(UI_SETTINGS_CACHE_KEY, JSON.stringify(sane));
  } catch {
    /* private mode etc. — the account copy still saves */
  }
}
