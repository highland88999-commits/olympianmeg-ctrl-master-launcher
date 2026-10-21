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
const panel = readFileSync(join(repo, 'components', 'ConcourseSettings.jsx'), 'utf8');
const uiState = readFileSync(join(repo, 'app', 'api', 'ui-state', 'route.js'), 'utf8');
const uploadRoute = readFileSync(join(repo, 'app', 'api', 'concourse', 'background-upload-url', 'route.js'), 'utf8');

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

  it('the box carries the backdrop layer under the glass scrim', () => {
    assert.ok(concourse.includes('<ConcourseBackdrop bg={bgPref} />'), 'backdrop media rendered');
    assert.ok(concourse.includes('bg-zinc-950/55'), 'scrim of the glass darkness over the art');
    assert.ok(concourse.includes('prefers-reduced-motion'), 'video backdrop respects reduced motion');
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
