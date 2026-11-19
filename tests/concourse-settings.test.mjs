// tests/concourse-settings.test.mjs
// Headless tests for the Concourse Settings sheet (Merlin, 2026-10-21):
// - Background preference shape + validation (lib/concourse-bg.js)
// - background upload validation (mime + size caps, client/server shared)
// - static wiring: settings tile, ui-state whitelist + concourse_bg
//   branch, the signed-URL upload route reusing the profile-media
//   bucket, the box backdrop layer, the panel's section seams
//
// Run: node --test tests/concourse-settings.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  sanitizeUiSettings,
  resolveUiSettings,
  readUiSettingsCache,
  writeUiSettingsCache,
  UI_SETTINGS_CACHE_KEY,
} from '../lib/ui-settings.js';
import {
  TILT_PREF_KEY,
  loadTiltPref,
  saveTiltPref,
} from '../lib/tilt-control.js';
import {
  CONCOURSE_BG_ART,
  BG_IMAGE_MAX_BYTES,
  BG_VIDEO_MAX_BYTES,
  sanitizeConcourseBg,
  resolveConcourseBg,
  validateBackgroundUpload,
} from '../lib/concourse-bg.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const concourse = readFileSync(join(repo, 'components', 'Concourse.jsx'), 'utf8');
const mergedMenu = readFileSync(join(repo, 'components', 'ConcoursePortals.jsx'), 'utf8');
const panel = readFileSync(join(repo, 'components', 'ConcourseSettings.jsx'), 'utf8');
const uiState = readFileSync(join(repo, 'app', 'api', 'ui-state', 'route.js'), 'utf8');
const uploadRoute = readFileSync(join(repo, 'app', 'api', 'concourse', 'background-upload-url', 'route.js'), 'utf8');
const layout = readFileSync(join(repo, 'app', 'layout.jsx'), 'utf8');
const useTilt = readFileSync(join(repo, 'lib', 'use-tilt.js'), 'utf8');
const radioProvider = readFileSync(join(repo, 'components', 'radio', 'RadioProvider.jsx'), 'utf8');
const enDict = JSON.parse(readFileSync(join(repo, 'lib', 'i18n', 'locales', 'en.json'), 'utf8'));
const seasonalDecor = readFileSync(join(repo, 'components', 'SeasonalDecor.jsx'), 'utf8');

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const HTTPS_URL = 'https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/profile-media/profiles/u1/concourse-bg/x.webp';

describe('sanitizeConcourseBg', () => {
  it('accepts the default kind (any url is dropped)', () => {
    assert.deepEqual(sanitizeConcourseBg({ kind: 'default' }), { kind: 'default' });
    assert.deepEqual(sanitizeConcourseBg({ kind: 'default', url: 'https://x.co/a.png' }), { kind: 'default' });
  });

  it('accepts image and video kinds with an https url', () => {
    assert.deepEqual(sanitizeConcourseBg({ kind: 'image', url: HTTPS_URL }), { kind: 'image', url: HTTPS_URL });
    assert.deepEqual(sanitizeConcourseBg({ kind: 'video', url: HTTPS_URL }), { kind: 'video', url: HTTPS_URL });
  });

  it('rejects junk shapes and kinds', () => {
    for (const bad of [null, undefined, 'default', 42, [], {}, { kind: 'hologram' }, { kind: 'IMAGE', url: HTTPS_URL }]) {
      assert.equal(sanitizeConcourseBg(bad), null, JSON.stringify(bad));
    }
  });

  it('rejects image/video without a usable https url', () => {
    assert.equal(sanitizeConcourseBg({ kind: 'image' }), null);
    assert.equal(sanitizeConcourseBg({ kind: 'video', url: '' }), null);
    assert.equal(sanitizeConcourseBg({ kind: 'image', url: 'http://x.co/a.png' }), null, 'https only');
    assert.equal(sanitizeConcourseBg({ kind: 'image', url: 'javascript:alert(1)' }), null);
    assert.equal(sanitizeConcourseBg({ kind: 'image', url: 'not a url' }), null);
    assert.equal(sanitizeConcourseBg({ kind: 'image', url: `https://x.co/${'a'.repeat(1200)}` }), null, 'overlong');
    assert.equal(sanitizeConcourseBg({ kind: 'image', url: 42 }), null);
  });
});

describe('resolveConcourseBg (default when no preference)', () => {
  it('falls back to the default art for missing or junk preferences', () => {
    assert.deepEqual(resolveConcourseBg(undefined), { kind: 'default' });
    assert.deepEqual(resolveConcourseBg(null), { kind: 'default' });
    assert.deepEqual(resolveConcourseBg({ kind: 'nope' }), { kind: 'default' });
    assert.equal(CONCOURSE_BG_ART, '/concourse-icons/background-default.webp');
  });

  it('passes a valid stored preference through untouched', () => {
    assert.deepEqual(resolveConcourseBg({ kind: 'video', url: HTTPS_URL }), { kind: 'video', url: HTTPS_URL });
  });
});

describe('validateBackgroundUpload (mime + caps)', () => {
  it('accepts images up to 8 MB with the right ext + media', () => {
    const v = validateBackgroundUpload({ contentType: 'image/png', sizeBytes: BG_IMAGE_MAX_BYTES });
    assert.equal(v.ok, true);
    assert.equal(v.value.ext, 'png');
    assert.equal(v.value.media, 'image');
    assert.equal(validateBackgroundUpload({ contentType: 'image/jpeg', sizeBytes: 12 }).value.ext, 'jpg');
    assert.equal(validateBackgroundUpload({ contentType: 'image/webp', sizeBytes: 12 }).value.ext, 'webp');
    assert.equal(validateBackgroundUpload({ contentType: 'image/gif', sizeBytes: 12 }).value.ext, 'gif');
  });

  it('accepts mp4/webm video up to 15 MB', () => {
    const v = validateBackgroundUpload({ contentType: 'video/mp4', sizeBytes: BG_VIDEO_MAX_BYTES });
    assert.equal(v.ok, true);
    assert.equal(v.value.media, 'video');
    assert.equal(validateBackgroundUpload({ contentType: 'video/webm', sizeBytes: 12 }).value.ext, 'webm');
  });

  it('rejects oversize, wrong-type and empty uploads', () => {
    assert.equal(validateBackgroundUpload({ contentType: 'image/png', sizeBytes: BG_IMAGE_MAX_BYTES + 1 }).ok, false);
    assert.equal(validateBackgroundUpload({ contentType: 'video/mp4', sizeBytes: BG_VIDEO_MAX_BYTES + 1 }).ok, false);
    assert.equal(validateBackgroundUpload({ contentType: 'video/quicktime', sizeBytes: 12 }).ok, false, 'quicktime not allowed for backgrounds');
    assert.equal(validateBackgroundUpload({ contentType: 'image/svg+xml', sizeBytes: 12 }).ok, false);
    assert.equal(validateBackgroundUpload({ contentType: 'image/png', sizeBytes: 0 }).ok, false);
    assert.equal(validateBackgroundUpload({ sizeBytes: 12 }).ok, false);
    assert.equal(validateBackgroundUpload(null).ok, false);
  });
});

describe('Concourse Settings wiring (static)', () => {
  it('the settings tile opens the sheet from fireTile', () => {
    assert.ok(concourse.includes("{ id: 'settings', label: 'Settings', icon: '⚙️' }"), 'settings tile defined');
    assert.ok(concourse.includes("tile.id === 'settings'") && concourse.includes('setSettingsOpen(true)'), 'settings tile opens the sheet');
    assert.ok(concourse.includes('<ConcourseSettings'), 'sheet rendered');
  });

  it('the merged menu carries the backdrop layer under the glass scrim', () => {
    assert.ok(mergedMenu.includes("bgPref?.kind === 'video' && bgPref.url"), 'backdrop media rendered');
    assert.ok(mergedMenu.includes('CONCOURSE_BG_ART'), 'default art is the fallback');
    assert.ok(mergedMenu.includes('bg-[#070418]/75'), 'scrim of the glass darkness over the art');
    assert.ok(mergedMenu.includes('prefers-reduced-motion: reduce'), 'video backdrop respects reduced motion');
    assert.ok(existsSync(join(repo, 'public', 'concourse-icons', 'background-default.webp')), 'default art shipped');
  });

  it('the preference round-trips through /api/ui-state as concourse_bg', () => {
    assert.ok(concourse.includes('concourse_bg: resolved'), 'client saves the resolved preference');
    assert.ok(uiState.includes("if ('concourse_bg' in prefs)"), 'route accepts the key');
    assert.ok(uiState.includes('sanitizeConcourseBg(prefs.concourse_bg)'), 'route validates server-side');
  });

  it('the settings tile id is whitelisted for pins', () => {
    const m = uiState.match(/const TILE_IDS = \[([^\]]*)\]/);
    assert.ok(m, 'TILE_IDS present');
    assert.ok(m[1].includes("'settings'"), 'settings whitelisted');
  });

  it('uploads reuse the existing public profile-media bucket via signed URLs', () => {
    assert.ok(uploadRoute.includes("const BUCKET = 'profile-media';"), 'existing bucket, no new infrastructure');
    assert.ok(uploadRoute.includes('createSignedUploadUrl'), 'signed upload URL minted server-side');
    assert.ok(uploadRoute.includes('concourse-bg/'), 'namespaced per-user path');
    assert.ok(uploadRoute.includes('validateBackgroundUpload'), 'route validates with the shared caps');
    assert.ok(panel.includes('/api/concourse/background-upload-url'), 'panel uses the route');
  });

  it('the panel is a section list with a Background section and a reset', () => {
    assert.ok(panel.includes("id: 'background'"), 'background section seam');
    assert.ok(panel.includes('Back to default'), 'reset present');
    assert.ok(panel.includes('My photo') && panel.includes('My video'), 'photo + video choices');
  });
});

// ---------------------------------------------------------------------------
// Part 3 — Language / Tilt / Sound sections
// ---------------------------------------------------------------------------
describe('sanitizeUiSettings (the settings ui-state key)', () => {
  it('accepts a boolean sound flag and drops unknown keys', () => {
    assert.deepEqual(sanitizeUiSettings({ sound: false }), { sound: false, vgogh: false });
    assert.deepEqual(sanitizeUiSettings({ sound: true, volume: 3, theme: 'x' }), { sound: true, vgogh: false });
  });

  it('vgogh is lenient: only explicit true survives, defaulting false', () => {
    assert.deepEqual(sanitizeUiSettings({ sound: true, vgogh: true }), { sound: true, vgogh: true });
    assert.deepEqual(sanitizeUiSettings({ sound: true, vgogh: false }), { sound: true, vgogh: false });
    assert.deepEqual(sanitizeUiSettings({ sound: true, vgogh: 'yes' }), { sound: true, vgogh: false });
    assert.deepEqual(sanitizeUiSettings({ sound: true, vgogh: 1 }), { sound: true, vgogh: false });
    // Old stored settings without vgogh keep working untouched.
    assert.deepEqual(sanitizeUiSettings({ sound: false }), { sound: false, vgogh: false });
  });

  it('rejects junk: non-objects, arrays, a missing or non-boolean sound', () => {
    for (const bad of [null, undefined, 'x', 1, [], {}, { sound: 'yes' }, { sound: 1 }, { sound: null }]) {
      assert.equal(sanitizeUiSettings(bad), null, JSON.stringify(bad));
    }
  });

  it('resolveUiSettings defaults to sound ON, Van Gogh OFF with no stored value', () => {
    assert.deepEqual(resolveUiSettings(undefined), { sound: true, vgogh: false });
    assert.deepEqual(resolveUiSettings({ sound: 'junk' }), { sound: true, vgogh: false });
    assert.deepEqual(resolveUiSettings({ sound: false }), { sound: false, vgogh: false });
    assert.deepEqual(resolveUiSettings({ sound: true, vgogh: true }), { sound: true, vgogh: true });
  });

  it('the localStorage cache round-trips through the injected store', () => {
    const st = memStore();
    assert.equal(readUiSettingsCache(st), null);
    writeUiSettingsCache(st, { sound: false });
    assert.deepEqual(readUiSettingsCache(st), { sound: false, vgogh: false });
    assert.ok(st.getItem(UI_SETTINGS_CACHE_KEY).includes('"sound":false'));
    writeUiSettingsCache(st, { sound: true, vgogh: true });
    assert.deepEqual(readUiSettingsCache(st), { sound: true, vgogh: true });
  });

  it('the ui-state route validates the settings key server-side', () => {
    assert.ok(uiState.includes("if ('settings' in prefs)"), 'route accepts settings');
    assert.ok(uiState.includes('sanitizeUiSettings(prefs.settings)'), 'route sanitizes');
  });
});

describe('language mount (Part 3 infra)', () => {
  it('app/layout.jsx mounts LanguageProvider around the tree', () => {
    assert.ok(layout.includes("import { LanguageProvider } from '@/lib/i18n';"), 'provider imported in layout');
    assert.ok(layout.includes('<LanguageProvider>'), 'provider mounted in layout');
    assert.ok(
      layout.indexOf('<LanguageProvider>') < layout.indexOf('<Concourse'),
      'the Concourse lives inside the provider, so the season pill translates'
    );
  });

  it('the season key resolves in English — the pill reads "Halloween", not the key', () => {
    assert.equal(enDict['season.halloween'], 'Halloween');
  });

  it('the language section lists every locale from useI18n and marks the current one', () => {
    assert.ok(panel.includes("id: 'language'"), 'language section seam');
    assert.ok(panel.includes('useI18n()'), 'panel reads the i18n context');
    assert.ok(panel.includes('languages.map'), 'all locales listed');
    assert.ok(panel.includes('setLang(l.code)'), 'one tap switches');
  });
});

describe('tilt wiring (Part 3)', () => {
  it('an explicit off persists as \'0\' — distinguishable from never-touched', () => {
    const st = memStore();
    saveTiltPref(st, true);
    assert.equal(st.getItem(TILT_PREF_KEY), '1');
    assert.equal(loadTiltPref(st), true);
    saveTiltPref(st, false);
    assert.equal(st.getItem(TILT_PREF_KEY), '0', 'deliberate off is stored, not removed');
    assert.equal(loadTiltPref(st), false);
  });

  it('the hub hook honors the explicit off over its auto-arm', () => {
    assert.ok(useTilt.includes("getItem(TILT_PREF_KEY) === '0'"), 'off gate in the enablement effect');
  });

  it('the live hook hears the Settings switch and Recalibrate via window events', () => {
    assert.ok(useTilt.includes("'olympus:tilt-pref-changed'"), 'pref-changed listener');
    assert.ok(useTilt.includes("'olympus:tilt-recalibrate'"), 'recalibrate listener');
    assert.ok(useTilt.includes('neutralRef.current = null'), 'recalibrate re-zeros the neutral');
    assert.ok(panel.includes("dispatchEvent(new CustomEvent('olympus:tilt-pref-changed'"), 'panel dispatches the switch');
    assert.ok(panel.includes("dispatchEvent(new CustomEvent('olympus:tilt-recalibrate')"), 'panel dispatches recalibrate');
  });

  it('the tilt section offers the iOS motion-permission remedy', () => {
    assert.ok(panel.includes("id: 'tilt'"), 'tilt section seam');
    assert.ok(panel.includes('DeviceOrientationEvent.requestPermission()'), 'permission requested in a gesture');
    assert.ok(panel.includes('Enable motion access'), 'visible remedy button');
    assert.ok(panel.includes('saveTiltPref(window.localStorage, next)'), 'switch bound to the pref');
  });
});

describe('sound gate (Part 3)', () => {
  it('the panel has a Sound section with honest scope copy', () => {
    assert.ok(panel.includes("id: 'sound'"), 'sound section seam');
    assert.ok(panel.includes('Games keep their own sound settings'), 'no overclaiming in the copy');
  });

  it('the radio provider gates playback on the master flag', () => {
    assert.ok(radioProvider.includes('UI_SETTINGS_EVENT'), 'provider hears settings changes');
    assert.ok(radioProvider.includes('setFxEnabled(soundOn)'), 'hub fx follow the flag');
    assert.ok(radioProvider.includes('soundOnRef.current'), 'play paths check the flag');
    assert.ok(radioProvider.includes("typeof ctl.pause === 'function'"), 'turning off pauses the embed');
  });

  it('panel order is Background, Sky, Language, Tilt, Sound', () => {
    const order = ["id: 'background'", "id: 'sky'", "id: 'language'", "id: 'tilt'", "id: 'sound'"].map((x) => panel.indexOf(x));
    assert.ok(order.every((i) => i >= 0), 'all five sections present');
    assert.ok(order[0] < order[1] && order[1] < order[2] && order[2] < order[3] && order[3] < order[4], 'in order');
  });

  it('the sky section toggles the Van Gogh background', () => {
    assert.ok(panel.includes("id: 'sky'"), 'sky section seam');
    assert.ok(panel.includes('Van Gogh sky'), 'section copy');
    assert.ok(panel.includes('vgogh'), 'switch bound to the vgogh flag');
  });
});

describe('tile plate (Part 5)', () => {
  it('every tile button wears the TRON plate under its emblem', () => {
    assert.ok(concourse.includes("src=\"/concourse-icons/tile-plate.webp\""), 'plate rendered in the tile button');
    assert.ok(existsSync(join(repo, 'public', 'concourse-icons', 'tile-plate.webp')), 'plate asset shipped');
  });

  it('the season pill wears the same plate behind its artwork + name', () => {
    assert.ok(seasonalDecor.includes("src=\"/concourse-icons/tile-plate.webp\""), 'plate rendered in SeasonBadge');
  });
});
