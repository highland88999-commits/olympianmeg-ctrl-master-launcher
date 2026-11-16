// tests/forge-avatar.test.js — Headless tests for the forge-your-own-avatar
// flow in the "Your rider" panel (Merlin, 2026-11-15: "Users can create
// their own avatars using the forge.").
//
// Run: node tests/forge-avatar.test.js (from the repo root).
// No browser, no network — asserts on lib/profile.js + lib/world-engine/economy.js
// pure logic plus source-level checks on the picker, the profile page,
// the Character builder save path and the creations read.
//
// The honest-rendering law this suite guards: a forged character has
// generation_params, NOT an image — so its thumb and the panel preview
// render the live MiniViewport, never a faked image or a snapshot.
import { readFileSync } from 'fs';
import {
  DEFAULT_PROFILE,
  validateProfile,
  loadProfile,
  saveProfile,
  PROFILE_KEY,
} from '../lib/profile.js';
import { costFor, FREE_GENERATIONS_PER_MONTH } from '../lib/world-engine/economy.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function stripComments(s) {
  // String-aware comment stripper (see tests/profile.test.js): strings
  // are copied verbatim; only genuine // and /* */ comments go.
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      out += ch;
      i++;
      while (i < s.length) {
        out += s[i];
        if (s[i] === '\\') {
          i++;
          if (i < s.length) { out += s[i]; i++; }
          continue;
        }
        if (s[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end === -1 ? s.length : end + 2;
      continue;
    }
    if (ch === '/' && s[i + 1] === '/') {
      const end = s.indexOf('\n', i);
      i = end === -1 ? s.length : end;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
function mockStorage(initial) {
  const data = { ...(initial || {}) };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}

// --- lib/profile.js: forgedAvatarId field ---
t('DEFAULT_PROFILE has forgedAvatarId, null by default',
  'forgedAvatarId' in DEFAULT_PROFILE && DEFAULT_PROFILE.forgedAvatarId === null);
t('validate: keeps a forged creation id',
  validateProfile({ forgedAvatarId: '550e8400-e29b-41d4-a716-446655440000' }).forgedAvatarId ===
    '550e8400-e29b-41d4-a716-446655440000');
t('validate: trims the forged id',
  validateProfile({ forgedAvatarId: '  abc-123  ' }).forgedAvatarId === 'abc-123');
t('validate: empty forged id falls back to null',
  validateProfile({ forgedAvatarId: '   ' }).forgedAvatarId === null);
t('validate: non-string forged id falls back to null',
  validateProfile({ forgedAvatarId: 42 }).forgedAvatarId === null &&
  validateProfile({ forgedAvatarId: { id: 'x' } }).forgedAvatarId === null);
t('validate: over-long forged id is capped at 128',
  validateProfile({ forgedAvatarId: 'x'.repeat(600) }).forgedAvatarId.length === 128);
t('validate: null forged id stays null',
  validateProfile({ forgedAvatarId: null }).forgedAvatarId === null);
t('validate: junk input still yields defaults incl. forgedAvatarId',
  JSON.stringify(validateProfile(null)) === JSON.stringify({ ...DEFAULT_PROFILE }));
t('save/load round-trip: forged pick sticks', (() => {
  const s = mockStorage();
  saveProfile({ ...DEFAULT_PROFILE, forgedAvatarId: 'abc-123' }, s);
  return loadProfile(s).forgedAvatarId === 'abc-123';
})());
t('save/load round-trip: clearing the forged pick sticks', (() => {
  const s = mockStorage();
  saveProfile({ ...DEFAULT_PROFILE, forgedAvatarId: 'abc-123' }, s);
  saveProfile({ ...loadProfile(s), forgedAvatarId: null }, s);
  return loadProfile(s).forgedAvatarId === null;
})());
t('save/load round-trip: forged pick survives alongside colours', (() => {
  const s = mockStorage();
  saveProfile({
    ...DEFAULT_PROFILE, displayName: 'Merlin', suitColor: '#00f2ff',
    forgedAvatarId: 'abc-123', defaultAvatar: null, profilePhotoId: null,
  }, s);
  const back = loadProfile(s);
  return back.forgedAvatarId === 'abc-123' && back.displayName === 'Merlin' &&
    back.suitColor === '#00f2ff';
})());

// --- lib/world-engine/economy.js: the forge price (the law, not invented) ---
t('costFor(character) is 200 Aether', costFor('character') === 200);
t('FREE_GENERATIONS_PER_MONTH is 20', FREE_GENERATIONS_PER_MONTH === 20);

// --- source: components/profile/ForgedAvatarPicker.jsx ---
const picker = readFileSync('components/profile/ForgedAvatarPicker.jsx', 'utf8');
const pickerCode = stripComments(picker);
t('picker: reads forged characters from the creations endpoint',
  /\/api\/profiles\/[\s\S]*?\/creations\?category=character/.test(pickerCode));
t('picker: lists each forged character by name',
  /characters\.map/.test(pickerCode) && /display_name/.test(pickerCode));
t('picker: picking a forged character hands its id to onPick',
  /onClick=\{\(\) => onPick && onPick\(c\.id\)\}/.test(pickerCode));
t('picker: cost comes from the shared economy (not a hardcoded price)',
  /costFor\('character'\)/.test(pickerCode) && /FREE_GENERATIONS_PER_MONTH/.test(pickerCode) &&
  !/200 Aether/.test(pickerCode));
t('picker: cost text states Aether + free monthly generations',
  /Costs \{cost\} Aether/.test(pickerCode) &&
  /free monthly generations/.test(pickerCode));
t('picker: links into the Character builder',
  /href="\/world-engine\/characters"/.test(pickerCode));
t('picker: signed-out users get plain words, no dead button',
  /Sign in to forge your own avatar/.test(pickerCode) &&
  /the forge needs a signed-in account/.test(pickerCode));
t('picker: forged thumbs render the live MiniViewport from params',
  /<MiniViewport category="character" params=\{c\.generation_params/.test(pickerCode));
t('picker: never snapshots or fakes an image for a forged character',
  !/toDataURL/.test(pickerCode) && !/data:image/.test(pickerCode) &&
  !/snapshot/i.test(pickerCode));
t('picker: 3D thumbs mount only near the viewport (InView gating)',
  /IntersectionObserver/.test(pickerCode));
t('picker: reports the picked creation up for the panel preview',
  /onSelectedCreation/.test(pickerCode) &&
  /characters\.find\(\(c\) => c\.id === value\)/.test(pickerCode));
t('picker: signed-in check goes through the session (forge needs one)',
  /supabase\.auth\.getSession/.test(pickerCode));
t('picker: selected forged character is marked',
  /aria-pressed=\{selected\}/.test(pickerCode) && /Your rider/.test(pickerCode));

// --- source: app/profile/page.jsx — wiring into the Your rider panel ---
const page = readFileSync('app/profile/page.jsx', 'utf8');
const pageCode = stripComments(page);
t('page: imports the forged picker and MiniViewport',
  /import ForgedAvatarPicker/.test(pageCode) && /import MiniViewport/.test(pageCode));
t('page: forged picker lives inside the Your rider panel, before the gallery', (() => {
  const riderAt = pageCode.indexOf('aria-label="Your rider"');
  const forgedAt = pageCode.indexOf('<ForgedAvatarPicker');
  const galleryAt = pageCode.indexOf('aria-label="Photos and videos"');
  return riderAt !== -1 && forgedAt > riderAt && galleryAt > forgedAt;
})());
t('page: picking a forged avatar clears the photo and the default',
  /forgedAvatarId: profile\.forgedAvatarId === id \? null : id, profilePhotoId: null, defaultAvatar: null/.test(pageCode));
t('page: picking a default clears the forged avatar',
  /defaultAvatar: profile\.defaultAvatar === src \? null : src, profilePhotoId: null, forgedAvatarId: null/.test(pageCode));
t('page: using a photo clears the forged avatar',
  /profilePhotoId: viewer\.id, defaultAvatar: null, forgedAvatarId: null/.test(pageCode));
t('page: panel preview renders the live MiniViewport for a forged avatar',
  /showForgedPreview/.test(pageCode) &&
  /<MiniViewport category="character" params=\{forgedAvatar\.generation_params/.test(pageCode));
t('page: preview priority is photo, then forged, then default, then drawn rider', (() => {
  const photoAt = pageCode.indexOf('{photoUrl ? (');
  const forgedAt = pageCode.indexOf('showForgedPreview ? (');
  const imageAt = pageCode.indexOf(') : previewImage ? (');
  const riderAt = pageCode.indexOf('<RiderPortrait', photoAt);
  return photoAt !== -1 && forgedAt > photoAt && imageAt > forgedAt && riderAt > imageAt;
})());
t('page: status line says which picture is in use, forged included',
  /Using your forged character/.test(pageCode));
t('page: picture copy states the priority (photo > forged > default > drawn)',
  /A photo beats a forged avatar/.test(pageCode) &&
  /a forged avatar beats a default avatar/.test(pageCode));
t('page: still no fetch/supabase in the page itself (the picker owns the network)',
  !/fetch\(/.test(pageCode) && !/supabase/i.test(pageCode));

// --- source: the forge save path + creations read (read-only verification) ---
const forge = readFileSync('components/world-engine/ForgeSector.jsx', 'utf8');
t('forge: Character builder saves a creation row with generation_params',
  /supabase\.from\('world_engine_assets'\)\.insert/.test(forge) &&
  /generation_params: finalParams/.test(forge) &&
  /category,/.test(forge));
const creationsRoute = readFileSync('app/api/profiles/[id]/creations/route.js', 'utf8');
t('creations route: returns generation_params for character rows',
  /generation_params/.test(creationsRoute) &&
  /category=.*character|normalizeCategory/.test(creationsRoute));
const mesh = readFileSync('lib/world-engine/creation-mesh.js', 'utf8');
t('creation-mesh: character params build a real mesh (capsule + badge)',
  /case 'character':/.test(mesh) && /CapsuleGeometry/.test(mesh));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
