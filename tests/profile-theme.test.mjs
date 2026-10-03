// tests/profile-theme.test.mjs — profiles + Agora visual unification.
// Merlin's color direction: navy base, personal -> navy accent,
// business -> white accent, gold/yellow retired, cyan only functional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NAVY_ACCENT,
  BUSINESS_ACCENT,
  FUNCTIONAL_CYAN,
  profileTheme,
  profileThemeVars,
} from '../lib/profiles/theme.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('personal theme is navy blue', () => {
  const t = profileTheme('personal');
  assert.equal(t.accent, '#3a86ff');
  assert.equal(t.accentRgb, '58,134,255');
  assert.equal(t.onAccent, '#ffffff');
  assert.equal(NAVY_ACCENT, '#3a86ff');
});

test('business theme is white (not yellow)', () => {
  const t = profileTheme('business');
  assert.equal(t.accent, '#f4f6ff');
  assert.equal(t.accentRgb, '244,246,255');
  assert.equal(t.onAccent, '#0a0f22');
  assert.equal(BUSINESS_ACCENT, '#f4f6ff');
});

test('unknown type falls back to personal navy, never gold', () => {
  for (const weird of [undefined, null, '', 'enterprise', 'GOLD']) {
    const t = profileTheme(weird);
    assert.equal(t.accent, '#3a86ff', `type ${String(weird)}`);
  }
});

test('profileThemeVars emits the three CSS vars the stylesheets consume', () => {
  const v = profileThemeVars('business');
  assert.equal(v['--pf-accent'], '#f4f6ff');
  assert.equal(v['--pf-accent-rgb'], '244,246,255');
  assert.equal(v['--pf-on-accent'], '#0a0f22');
  const p = profileThemeVars('personal');
  assert.equal(p['--pf-accent'], '#3a86ff');
});

test('functional cyan is preserved as the link color', () => {
  assert.equal(FUNCTIONAL_CYAN, '#00f2ff');
});

const TOUCHED = [
  'app/u/[username]/page.jsx',
  'app/u/[username]/edit/page.jsx',
  'components/profiles/ProfileClient.jsx',
  'components/NotificationsWindow.jsx',
  'app/agora/page.jsx',
  'app/agora/post/[id]/page.jsx',
  'app/agora/profile/[id]/page.jsx',
  'app/agora/new/page.jsx',
  'components/agora/PostCard.jsx',
  'components/agora/CategoryTabs.jsx',
  'components/agora/CommentSection.jsx',
];

test('no gold/yellow/amber color remains in the unified surfaces', () => {
  const banned = /#ffd166|#FFD166|amber-\d|gold-500|255,\s*209,\s*102/i;
  for (const rel of TOUCHED) {
    const src = read(rel);
    assert.ok(!banned.test(src), `${rel} still contains a gold/amber color`);
  }
});

test('the old pf-btn gold class is gone (renamed to accent)', () => {
  for (const rel of TOUCHED) {
    const src = read(rel);
    assert.ok(!src.includes('pf-btn gold'), `${rel} still uses pf-btn gold`);
  }
  const page = read('app/u/[username]/page.jsx');
  assert.ok(page.includes('pf-btn accent'), 'profile page defines .pf-btn.accent');
});

test('profile pages set the theme vars from the profile type', () => {
  const page = read('app/u/[username]/page.jsx');
  assert.ok(page.includes('profileThemeVars(type)'), 'public profile themes by type');
  assert.ok(page.includes("from '@/lib/profiles/theme'"), 'public profile imports the theme');
  const edit = read('app/u/[username]/edit/page.jsx');
  assert.ok(edit.includes('profileThemeVars(type)'), 'editor themes by active tab');
});

test('agora primary buttons are navy with white text', () => {
  const feed = read('app/agora/page.jsx');
  assert.ok(feed.includes('bg-[#3a86ff]'), 'feed has navy primary buttons');
  assert.ok(feed.includes('bg-[#070d1d]'), 'feed uses the navy base');
});

test('background_video column migration exists', () => {
  const sql = read('supabase/profile-background-video.sql');
  assert.ok(sql.includes('background_video'), 'migration adds background_video');
});
