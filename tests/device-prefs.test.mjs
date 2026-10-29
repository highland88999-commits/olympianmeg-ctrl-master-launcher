// tests/device-prefs.test.mjs — auto-on device preferences (Merlin, 2026-10-29).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TILT_CONTROLS_KEY,
  LOCATION_ENABLED_KEY,
  DEVICE_PREF_DEFAULTS,
  coerceDevicePref,
  resolveDevicePrefs,
} from '../lib/device-prefs.js';

describe('device prefs', () => {
  it('both prefs are auto-on by default', () => {
    assert.equal(DEVICE_PREF_DEFAULTS[TILT_CONTROLS_KEY], true);
    assert.equal(DEVICE_PREF_DEFAULTS[LOCATION_ENABLED_KEY], true);
  });
  it('resolveDevicePrefs merges saved values over the auto-on defaults', () => {
    assert.deepEqual(resolveDevicePrefs(null), { tilt_controls: true, location_enabled: true });
    assert.deepEqual(resolveDevicePrefs({}), { tilt_controls: true, location_enabled: true });
    const off = resolveDevicePrefs({ [TILT_CONTROLS_KEY]: false });
    assert.equal(off[TILT_CONTROLS_KEY], false);
    assert.equal(off[LOCATION_ENABLED_KEY], true);
  });
  it('non-boolean saved values fall back to the default', () => {
    assert.equal(coerceDevicePref(TILT_CONTROLS_KEY, 'yes'), true);
    assert.equal(coerceDevicePref(LOCATION_ENABLED_KEY, 0), true);
    assert.equal(coerceDevicePref(TILT_CONTROLS_KEY, false), false);
  });
  it('unknown keys are dropped', () => {
    const out = resolveDevicePrefs({ tilt_controls: false, something_else: true });
    assert.equal('something_else' in out, false);
  });
});

describe('device controls frame', () => {
  const src = readFileSync('components/FintracExplanation.jsx', 'utf8');
  it('step 2 renders the street-light tilt + location toggles', () => {
    assert.match(src, /DeviceControlsFrame/);
    assert.match(src, /Tilt control/);
    assert.match(src, /Location/);
    assert.match(src, /aria-pressed/);
  });
  it('toggles persist per account via ui-state', () => {
    assert.match(src, /TILT_CONTROLS_KEY/);
    assert.match(src, /LOCATION_ENABLED_KEY/);
  });
});

describe('venus-wifi respects the location toggle', () => {
  const src = readFileSync('app/venus-wifi/page.jsx', 'utf8');
  it('startGPS checks the onboarding location pref before watching', () => {
    assert.match(src, /LOCATION_ENABLED_KEY/);
    assert.match(src, /LOCATION IS OFF/);
  });
});
