// tests/profile.test.js — Headless tests for the universal PROFILE module.
// Run: node tests/profile.test.js (from the repo root).
// No browser, no network — asserts on lib/profile.js pure logic plus
// source-level checks (menu registration, locale keys, no telemetry).
import { readFileSync } from 'fs';
import {
  DEFAULT_PROFILE,
  AVATAR_STYLES,
  isHexColor,
  validateProfile,
  riderTheme,
  loadProfile,
  saveProfile,
  PROFILE_KEY,
  MEDIA_DB,
  MEDIA_STORE,
} from '../lib/profile.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// --- defaults shape ---
t('DEFAULT_PROFILE has all fields',
  ['displayName', 'callsign', 'suitColor', 'helmetColor', 'bikeGlow',
   'avatarStyle', 'profilePhotoId', 'createdAt', 'updatedAt']
    .every((k) => k in DEFAULT_PROFILE));
t('default colors are valid hex',
  isHexColor(DEFAULT_PROFILE.suitColor) &&
  isHexColor(DEFAULT_PROFILE.helmetColor) &&
  isHexColor(DEFAULT_PROFILE.bikeGlow));
t('default avatarStyle is ring', DEFAULT_PROFILE.avatarStyle === 'ring');
t('AVATAR_STYLES has ring/hex/none',
  AVATAR_STYLES.includes('ring') && AVATAR_STYLES.includes('hex') && AVATAR_STYLES.includes('none'));

// --- validateProfile ---
const good = {
  displayName: 'Merlin', callsign: 'NIGHTFALL',
  suitColor: '#08F7FE', helmetColor: '#23233a', bikeGlow: '#FF2FD6',
  avatarStyle: 'hex', profilePhotoId: 'abc-123',
  createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T01:00:00.000Z',
};
const vgood = validateProfile(good);
t('validate: keeps good values',
  vgood.displayName === 'Merlin' && vgood.callsign === 'NIGHTFALL' &&
  vgood.avatarStyle === 'hex' && vgood.profilePhotoId === 'abc-123');
t('validate: lowercases hex colors',
  vgood.suitColor === '#08f7fe' && vgood.bikeGlow === '#ff2fd6');

const bad = {
  displayName: '  x  ', suitColor: 'red', helmetColor: '#12345',
  bikeGlow: '#zzzzzz', avatarStyle: 'circle', profilePhotoId: 42,
  createdAt: {}, extra: 'junk',
};
const vbad = validateProfile(bad);
t('validate: bad colors fall back to defaults',
  vbad.suitColor === DEFAULT_PROFILE.suitColor &&
  vbad.helmetColor === DEFAULT_PROFILE.helmetColor &&
  vbad.bikeGlow === DEFAULT_PROFILE.bikeGlow);
t('validate: bad avatarStyle falls back', vbad.avatarStyle === 'ring');
t('validate: non-string photo id falls back', vbad.profilePhotoId === null);
t('validate: trims display name', vbad.displayName === 'x');
t('validate: drops unknown fields', !('extra' in vbad));

for (const junk of [null, undefined, 'nope', 42, ['a']]) {
  let ok = true;
  try { validateProfile(junk); } catch { ok = false; }
  t(`validate: never throws on ${JSON.stringify(junk)}`, ok);
}
t('validate: junk input yields defaults',
  JSON.stringify(validateProfile(null)) === JSON.stringify({ ...DEFAULT_PROFILE }));

const long = validateProfile({ displayName: 'a'.repeat(200), callsign: 'b'.repeat(100) });
t('validate: caps name/callsign length',
  long.displayName.length === 60 && long.callsign.length === 24);

// --- riderTheme ---
const theme = riderTheme({ suitColor: '#111111', helmetColor: 'nope', bikeGlow: '#222222' });
t('riderTheme: always valid hex',
  theme.suit === '#111111' && theme.helmet === DEFAULT_PROFILE.helmetColor && theme.glow === '#222222');

// --- loadProfile/saveProfile with a mock localStorage ---
function mockStorage(initial) {
  const data = { ...(initial || {}) };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}
t('loadProfile: empty storage -> defaults',
  JSON.stringify(loadProfile(mockStorage())) === JSON.stringify({ ...DEFAULT_PROFILE }));
t('loadProfile: corrupt JSON -> defaults, no throw', (() => {
  const s = mockStorage({ [PROFILE_KEY]: '{oops' });
  const p = loadProfile(s);
  return p.avatarStyle === 'ring' && isHexColor(p.suitColor);
})());
t('loadProfile: no storage (SSR) -> defaults, no throw', (() => {
  const p = loadProfile(null);
  return p.displayName === '' && p.avatarStyle === 'ring';
})());
t('save/load round-trip', (() => {
  const s = mockStorage();
  saveProfile({ ...good, createdAt: null, updatedAt: null }, s);
  const back = loadProfile(s);
  return back.displayName === 'Merlin' && back.callsign === 'NIGHTFALL' &&
    typeof back.createdAt === 'string' && typeof back.updatedAt === 'string' &&
    back.suitColor === '#08f7fe';
})());
t('saveProfile: sanitizes on the way in', (() => {
  const s = mockStorage();
  const saved = saveProfile({ suitColor: 'banana', avatarStyle: 'x' }, s);
  return saved.suitColor === DEFAULT_PROFILE.suitColor && saved.avatarStyle === 'ring';
})());
t('saveProfile: works with no storage, no throw', (() => {
  const saved = saveProfile(good, null);
  return saved.displayName === 'Merlin';
})());

// --- constants ---
t('PROFILE_KEY stable', PROFILE_KEY === 'universal-profile-v1');
t('media DB/store names stable',
  MEDIA_DB === 'universal-profile-media' && MEDIA_STORE === 'items');

// --- source-level checks: lib/profile.js ---
{
  const src = readFileSync('lib/profile.js', 'utf8');
  const code = stripComments(src);
  t('lib: no fetch', !/fetch\(/.test(code));
  t('lib: no telemetry/phone-home', !/central_telemetry|phone.?home/i.test(code));
  t('lib: no supabase', !/supabase/i.test(code));
  t('lib: no external URLs', !/https?:\/\//.test(code));
  t('lib: IndexedDB used for media', /indexedDB\.open/.test(code));
  t('lib: exports media CRUD',
    /saveMediaItem/.test(code) && /listMediaItems/.test(code) &&
    /getMediaItem/.test(code) && /deleteMediaItem/.test(code) && /countMedia/.test(code));
}

// --- source-level checks: app/profile/page.jsx ---
{
  const page = readFileSync('app/profile/page.jsx', 'utf8');
  const code = stripComments(page);
  t('page: no fetch', !/fetch\(/.test(code));
  t('page: no telemetry/phone-home', !/central_telemetry|phone.?home/i.test(code));
  t('page: no supabase', !/supabase/i.test(code));
  t('page: no external URLs', !/https?:\/\//.test(code));
  t('page: reduced-motion respected', /prefers-reduced-motion/.test(page));
  t('page: safari bottom clearance', /safe-area-inset-bottom/.test(page));
  t('page: touch targets >= 44px', /min-h-\[44px\]/.test(page));
  t('page: honest on-device copy', /Nothing is uploaded/.test(page) && /on this device/.test(page));
  t('page: character customization present',
    /Rider name/.test(page) && /Callsign/.test(page) && /Tron bike glow/.test(page));
  t('page: avatar frames present', /FRAME_LABELS/.test(page) && /hex/.test(page));
  t('page: set-as-profile-photo present', /Use as profile photo/.test(page));
}

// --- satellite registration + locales ---
{
  const sats = readFileSync('lib/i18n/satellites.ts', 'utf8');
  t('satellites: profile registered',
    /key: "profile", route: "\/profile"/.test(sats));
  t('satellites: profile is UTILITIES/ARES (not GAMES)',
    /key: "profile"[^}]*section: "UTILITIES"[^}]*constellation: "ARES"/.test(sats));
  const langs = ['de', 'el', 'en', 'es', 'fr', 'it', 'pt'];
  for (const lang of langs) {
    const loc = readFileSync(`lib/i18n/locales/${lang}.json`, 'utf8');
    let okTitle = false;
    let okSub = false;
    try {
      const j = JSON.parse(loc);
      okTitle = j['sat.profile.title'] === 'Profile';
      okSub = typeof j['sat.profile.subtitle'] === 'string' && j['sat.profile.subtitle'].length > 0;
    } catch { /* handled below */ }
    if (okTitle && okSub) { passed++; }
    else { failed++; console.error(`FAIL: ${lang} locale missing sat.profile.title/subtitle`); }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
