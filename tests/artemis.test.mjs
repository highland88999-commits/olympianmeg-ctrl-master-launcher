/*
 * ARTEMIS migration tests — run with: node --test tests/artemis.test.mjs
 *
 * Covers the deduped ARTEMIS pocket universe migrated from Merlin's four
 * original repos (Architect-Artemis, artemis-hub, artemis-os, artemis-proxy):
 *   - lib/artemis/videos.js:   his video links stay VERBATIM
 *   - lib/artemis/personas.js: the six council personas + forge types
 *   - lib/artemis/os.js:       deduped OS config (themes, apps, allowlist)
 *   - static audits: no hardcoded secrets, no render.com, no telemetry
 *     phone-home, no Firebase, video URLs present verbatim in the pages
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const { ARTEMIS_VIDEOS, ECOSYSTEM_APPS } = await import(join(root, 'lib', 'artemis', 'videos.js'));
const { PERSONAS, PERSONA_KEYS, FORGE_TYPES, FORGE_TYPE_KEYS, parsePersonaPrefix } =
  await import(join(root, 'lib', 'artemis', 'personas.js'));
const { OS_THEMES, OS_THEME_KEYS, OS_APPS, OS_IFRAME_ALLOWLIST, isAllowedFrameUrl } =
  await import(join(root, 'lib', 'artemis', 'os.js'));

const read = (p) => readFileSync(join(root, p), 'utf8');
// Strip line/block comments so audits check code, not the comments that
// document what was stripped.
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
    .replace(/(^|\s)--[^\n]*/g, '$1'); // SQL line comments

/* ---------------- video links: verbatim ---------------- */

test('video URLs are verbatim from his original repos', () => {
  assert.equal(ARTEMIS_VIDEOS.landing, 'https://files.catbox.moe/ks3oum.mp4');
  assert.equal(ARTEMIS_VIDEOS.oracleCircle, 'https://files.catbox.moe/tuw4of.mp4');
  assert.equal(ARTEMIS_VIDEOS.forge, 'https://files.catbox.moe/juj3w9.mov');
  assert.equal(ARTEMIS_VIDEOS.holoBg, 'https://file.garden/alXjUY_coXedLaNA/gemini_generated_video_69CBAF0E.mp4');
  assert.equal(ARTEMIS_VIDEOS.boot, 'https://files.catbox.moe/5xh10y.mp4');
  assert.equal(ARTEMIS_VIDEOS.desktopBg, 'https://files.catbox.moe/f21cnc.mov');
  assert.equal(ARTEMIS_VIDEOS.authBg, 'https://cdn.pixabay.com/video/2021/08/20/85732-590457611_tiny.mp4');
  assert.equal(ARTEMIS_VIDEOS.novaBg, 'https://cdn.pixabay.com/video/2023/10/20/185834-876615024_tiny.mp4');
  assert.equal(ARTEMIS_VIDEOS.linuxBg, 'https://cdn.pixabay.com/video/2021/08/20/85732-590457611_tiny.mp4');
});

test('oracle view embeds the oracle video links verbatim', () => {
  const src = read('app/artemis/oracle/OracleView.jsx');
  assert.ok(src.includes("from '@/lib/artemis/videos'"), 'imports the verbatim video constants');
  for (const key of ['landing', 'oracleCircle', 'forge', 'holoBg']) {
    assert.ok(src.includes(`ARTEMIS_VIDEOS.${key}`), `${key} video wired from the verbatim constant in OracleView`);
  }
});

test('os view embeds the hub/os video links verbatim', () => {
  const src = read('app/artemis/os/OSView.jsx');
  const cfg = read('lib/artemis/os.js');
  assert.ok(src.includes("from '@/lib/artemis/videos'"), 'imports the verbatim video constants');
  for (const key of ['boot', 'authBg']) {
    assert.ok(src.includes(`ARTEMIS_VIDEOS.${key}`), `${key} video wired from the verbatim constant in OSView`);
  }
  // Desktop wallpapers flow through the deduped theme config in lib/artemis/os.js.
  for (const key of ['desktopBg', 'novaBg', 'linuxBg']) {
    assert.ok(cfg.includes(`ARTEMIS_VIDEOS.${key}`), `${key} video wired from the verbatim constant in os.js`);
  }
});

test('ecosystem apps keep his deployment URLs verbatim', () => {
  assert.equal(ECOSYSTEM_APPS.length, 21);
  const urls = ECOSYSTEM_APPS.map((a) => a.url);
  assert.ok(urls.includes('https://architect-artemis-merlin-ambros-projects.vercel.app/'));
  assert.ok(urls.includes('https://multiverse-tracker-api.vercel.app/'));
  for (const u of urls) assert.match(u, /^https:\/\/[a-z0-9-]+\.vercel\.app\/$/);
});

/* ---------------- personas ---------------- */

test('six council personas, verbatim names', () => {
  assert.deepEqual(PERSONA_KEYS, ['ORACLE', 'WARDEN', 'WEAVER', 'MIDAS', 'ARCHIVIST', 'CURE']);
  for (const k of PERSONA_KEYS) {
    assert.ok(PERSONAS[k].systemPrompt.length > 50, `${k} needs its system prompt`);
    assert.ok(PERSONAS[k].epithet, `${k} needs an epithet`);
  }
});

test('parsePersonaPrefix: /persona prefixes route to the right council member', () => {
  assert.deepEqual(parsePersonaPrefix('/warden watch the gates'), { persona: 'WARDEN', prompt: 'watch the gates' });
  assert.deepEqual(parsePersonaPrefix('/CURE decide'), { persona: 'CURE', prompt: 'decide' });
  assert.deepEqual(parsePersonaPrefix('plain question'), { persona: 'ORACLE', prompt: 'plain question' });
  assert.deepEqual(parsePersonaPrefix('/oracle'), { persona: 'ORACLE', prompt: '' });
});

test('forge types cover his original six', () => {
  assert.deepEqual(FORGE_TYPE_KEYS, ['image', '3d', 'video', 'audio', 'code', 'shader']);
  assert.equal(FORGE_TYPES.image.systemPrompt, null); // images go to Pollinations
  for (const t of ['3d', 'video', 'audio', 'code', 'shader']) {
    assert.match(FORGE_TYPES[t].systemPrompt, /SINGLE self-contained HTML file/);
  }
});

/* ---------------- deduped OS config ---------------- */

test('os themes merge hub modes with the NOVA identity', () => {
  assert.ok(OS_THEME_KEYS.includes('ARTEMIS'));
  assert.ok(OS_THEME_KEYS.includes('APPLE'));
  assert.ok(OS_THEME_KEYS.includes('LINUX'));
  assert.ok(OS_THEME_KEYS.includes('MICROSOFT'));
  assert.ok(OS_THEME_KEYS.includes('NOVA'));
  assert.equal(OS_THEMES.NOVA.bg, ARTEMIS_VIDEOS.novaBg);
});

test('os apps point at launcher routes, not old deployments', () => {
  assert.ok(OS_APPS.length >= 5);
  for (const a of OS_APPS) {
    assert.ok(a.route.startsWith('/'), `${a.id} must be an in-launcher route`);
    assert.doesNotMatch(a.route, /^https?:/);
  }
  const byId = Object.fromEntries(OS_APPS.map((a) => [a.id, a]));
  assert.equal(byId.architect.route, '/artemis?view=oracle');
});

test('iframe allowlist: internal routes pass, render.com blocked', () => {
  assert.ok(isAllowedFrameUrl('/artemis?view=os'));
  assert.ok(isAllowedFrameUrl('https://architect-artemis.vercel.app/'));
  assert.ok(!isAllowedFrameUrl('https://architect-artemis.onrender.com/'));
  assert.ok(!isAllowedFrameUrl('https://evil.example.com/'));
  assert.ok(!isAllowedFrameUrl('http://insecure.vercel.app/'));
  assert.ok(!OS_IFRAME_ALLOWLIST.some((h) => h.includes('onrender')));
});

/* ---------------- static audits: secrets / telemetry / render ---------------- */

const ARTEMIS_FILES = [
  'app/artemis/page.jsx',
  'app/artemis/oracle/OracleView.jsx',
  'app/artemis/os/OSView.jsx',
  'app/api/artemis/transmit/route.js',
  'app/api/artemis/forge/route.js',
  'app/api/artemis/fetch/route.js',
  'lib/artemis/videos.js',
  'lib/artemis/personas.js',
  'lib/artemis/os.js',
  'lib/artemis/server.js',
  'supabase/artemis.sql',
];

test('no hardcoded secrets in any artemis file', () => {
  for (const f of ARTEMIS_FILES) {
    const src = codeOnly(read(f));
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}/, `${f}: no hardcoded Google API key`);
    assert.doesNotMatch(src, /sk-ant-|xox[bap]-|ghp_[0-9A-Za-z]{20,}/, `${f}: no hardcoded tokens`);
  }
});

test('no render.com reliance anywhere in artemis', () => {
  for (const f of ARTEMIS_FILES) {
    const src = codeOnly(read(f));
    assert.doesNotMatch(src, /onrender\.com|render\.com/i, `${f}: zero render.com reliance`);
    assert.doesNotMatch(src, /OMEGA_DATABASE_URL/, `${f}: no OMEGA database variable`);
  }
});

test('no telemetry phone-home in artemis', () => {
  for (const f of ARTEMIS_FILES) {
    const src = codeOnly(read(f));
    assert.doesNotMatch(src, /central_telemetry|connected_repos|track_ping|silentUplink|ipify/i,
      `${f}: telemetry stripped`);
  }
});

test('no firebase in artemis — supabase only', () => {
  for (const f of ARTEMIS_FILES) {
    const src = codeOnly(read(f));
    assert.doesNotMatch(src, /firebase/i, `${f}: firebase replaced by supabase`);
  }
});

test('gemini key only via process.env on the server', () => {
  // The key is read in lib/artemis/server.js (requireGeminiKey); routes use it.
  assert.ok(read('lib/artemis/server.js').includes('process.env.GEMINI_API_KEY'),
    'server helper reads GEMINI_API_KEY from env');
  for (const f of ['app/api/artemis/transmit/route.js', 'app/api/artemis/forge/route.js']) {
    assert.ok(read(f).includes('requireGeminiKey'), `${f} goes through the env-only key helper`);
    assert.doesNotMatch(codeOnly(read(f)), /['"]AIza/, `${f}: no key literal`);
  }
  for (const f of ['app/artemis/oracle/OracleView.jsx', 'app/artemis/os/OSView.jsx']) {
    assert.doesNotMatch(read(f), /GEMINI_API_KEY/, `${f}: key never in client bundle`);
  }
});

test('github pat only via process.env on the server', () => {
  assert.ok(read('app/api/artemis/transmit/route.js').includes('process.env.GITHUB_PAT'));
});

test('legacy routes redirect into the deduped universe', () => {
  assert.ok(read('app/architect-artemis/page.jsx').includes('/artemis?view=oracle'));
  assert.ok(read('app/artemis-hub/page.jsx').includes('/artemis?view=os'));
});

test('sql is idempotent with owner-only rls', () => {
  const sql = read('supabase/artemis.sql');
  const body = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const t of ['artemis_history', 'artemis_deployments', 'apex_sessions', 'apex_bookmarks', 'artemis_mail_log']) {
    assert.ok(sql.includes(`create table if not exists public.${t}`), `${t} created idempotently`);
    assert.ok(sql.includes('enable row level security'), 'rls enabled');
  }
  assert.equal((sql.match(/auth\.uid\(\) = user_id/g) || []).length, 10); // 5 tables x using+with check
  assert.doesNotMatch(body, /central_telemetry|connected_repos/); // comments explain the exclusion; body must not create them
});
