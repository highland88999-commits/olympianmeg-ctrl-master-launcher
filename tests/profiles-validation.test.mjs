// tests/profiles-validation.test.mjs — headless tests for the profile system.
// Run: node tests/profiles-validation.test.mjs (from the repo root).
// No browser, no network — asserts on lib/profiles/validation.js pure logic.
import {
  isValidUsername,
  slugifyUsername,
  sanitizeText,
  sanitizeWebsites,
  validateProfileUpdate,
  validateArtPiece,
  validateProfilePost,
  validateUploadRequest,
  profileUrl,
} from '../lib/profiles/validation.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- usernames ---
t('valid username', isValidUsername('artemis-9'));
t('rejects uppercase', !isValidUsername('Artemis'));
t('rejects too short', !isValidUsername('a'));
t('rejects spaces', !isValidUsername('art emis'));
t('rejects leading dash', !isValidUsername('-art'));
t('slugify display name', slugifyUsername('Merlin Ambros') === 'merlin-ambros');
t('slugify fallback', slugifyUsername('!') === 'user');

// --- profile update ---
{
  const r = validateProfileUpdate({ display_name: '  Nova  ', bio: 'x'.repeat(9000), username: 'NOVA-1', website_urls: ['nova.art', 'notaurl://x', 'https://ok.com'] });
  t('profile update ok', r.ok === true);
  t('display name trimmed', r.value.display_name === 'Nova');
  t('bio capped', r.value.bio.length === 500);
  t('username lowercased', r.value.username === 'nova-1');
  t('websites cleaned', r.value.website_urls.length === 2 && r.value.website_urls[0] === 'https://nova.art/');
  t('unknown fields dropped', !('admin' in r.value));
  const bad = validateProfileUpdate({ username: 'no spaces!' });
  t('bad username rejected', bad.ok === false);
  const cover = validateProfileUpdate({ cover_kind: 'video' });
  t('cover_kind video kept', cover.value.cover_kind === 'video');
  const coverBad = validateProfileUpdate({ cover_kind: 'hologram' });
  t('cover_kind defaults to image', coverBad.value.cover_kind === 'image');
}

// --- art ---
{
  const r = validateArtPiece({ title: 'Sun', media_url: 'https://x/y.png', media_kind: 'image', for_sale: true, price_cents: 2500 });
  t('art ok', r.ok === true && r.value.price_cents === 2500);
  t('art rejects missing title', validateArtPiece({ title: '', media_url: 'x' }).ok === false);
  t('art rejects missing media', validateArtPiece({ title: 'x' }).ok === false);
  t('art rejects sub-dollar price', validateArtPiece({ title: 'x', media_url: 'y', for_sale: true, price_cents: 50 }).ok === false);
  t('art not-for-sale needs no price', validateArtPiece({ title: 'x', media_url: 'y' }).value.price_cents === null);
  t('art video kind kept', validateArtPiece({ title: 'x', media_url: 'y', media_kind: 'video' }).value.media_kind === 'video');
}

// --- posts ---
{
  t('post ok', validateProfilePost({ body: 'hello' }).ok === true);
  t('post rejects empty', validateProfilePost({ body: '   ' }).ok === false);
  t('media-only post ok', validateProfilePost({ body: '', media_url: 'https://x/y.mp4', media_kind: 'video' }).ok === true);
  t('post body capped', validateProfilePost({ body: 'x'.repeat(5000) }).value.body.length === 2000);
}

// --- uploads ---
{
  const img = validateUploadRequest({ kind: 'avatar', contentType: 'image/png', sizeBytes: 1024 });
  t('avatar png ok', img.ok === true && img.value.media_kind === 'image' && img.value.ext === 'png');
  t('avatar rejects video', validateUploadRequest({ kind: 'avatar', contentType: 'video/mp4', sizeBytes: 1024 }).ok === false);
  t('profile_video accepts mp4', validateUploadRequest({ kind: 'profile_video', contentType: 'video/mp4', sizeBytes: 1024 }).ok === true);
  t('rejects oversized', validateUploadRequest({ kind: 'avatar', contentType: 'image/png', sizeBytes: 99 * 1024 * 1024 }).ok === false);
  t('rejects unknown kind', validateUploadRequest({ kind: 'trojan', contentType: 'image/png', sizeBytes: 10 }).ok === false);
  t('rejects exe masquerade', validateUploadRequest({ kind: 'art', contentType: 'application/x-msdownload', sizeBytes: 10 }).ok === false);
}

// --- urls ---
t('profileUrl personal', profileUrl('nova', 'personal') === '/u/nova');
t('profileUrl business', profileUrl('nova', 'business') === '/u/nova?v=business');
t('sanitizeText trims', sanitizeText('  hi  ', 10) === 'hi');
t('sanitizeWebsites dedupes', sanitizeWebsites(['a.com', 'https://a.com/']).length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
