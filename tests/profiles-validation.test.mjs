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
  BACKGROUND_VIDEO_PRESETS,
  isValidBackgroundVideo,
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

// --- background video presets ---
{
  t('presets include none + nebula', BACKGROUND_VIDEO_PRESETS.length >= 2
    && BACKGROUND_VIDEO_PRESETS[0].id === 'none'
    && BACKGROUND_VIDEO_PRESETS.some((p) => p.src === '/videos/menu-background.mp4'));
  t('empty/null means none', isValidBackgroundVideo('') && isValidBackgroundVideo(null));
  t('preset src accepted', isValidBackgroundVideo('/videos/menu-background.mp4'));
  t('arbitrary URL rejected', !isValidBackgroundVideo('https://evil.example/x.mp4'));
  const ok = validateProfileUpdate({ background_video: '/videos/menu-background.mp4' });
  t('whitelisted background video kept', ok.ok === true && ok.value.background_video === '/videos/menu-background.mp4');
  const cleared = validateProfileUpdate({ background_video: '' });
  t('empty clears to null', cleared.ok === true && cleared.value.background_video === null);
  const bad = validateProfileUpdate({ background_video: 'https://evil.example/x.mp4' });
  t('non-preset background video rejected', bad.ok === false);
}

// --- urls ---
t('profileUrl personal', profileUrl('nova', 'personal') === '/u/nova');
t('profileUrl business', profileUrl('nova', 'business') === '/u/nova?v=business');
t('sanitizeText trims', sanitizeText('  hi  ', 10) === 'hi');
t('sanitizeWebsites dedupes', sanitizeWebsites(['a.com', 'https://a.com/']).length === 1);

// --- source-level wiring checks ---
{
  const { readFileSync } = await import('fs');
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const edit = src('../app/u/[username]/edit/page.jsx');
  t('edit page has the background video preset picker', edit.includes('Background video (preset)')
    && edit.includes('BACKGROUND_VIDEO_PRESETS') && edit.includes('saveBackgroundVideo'));
  t('edit picker previews presets as playable video', edit.includes('onMouseOver'));
  const pub = src('../app/u/[username]/page.jsx');
  t('public profile renders the background video', pub.includes('pf-bgvideo')
    && pub.includes('p.background_video'));
  t('background video is muted/looping/playsinline', pub.includes('autoPlay muted loop playsInline'));
  t('background video hides under reduced motion', pub.includes('prefers-reduced-motion'));
  t('background video has a dark legibility scrim', pub.includes('pf-bgvideo-scrim'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
