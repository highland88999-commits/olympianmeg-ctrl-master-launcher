// ARES tests: the abyss maze (Mirror Dimension sandbox depth).
//
// Run directly: node lib/ares/test-tarpit.mjs
// Same custom t() harness pattern as lib/ares/test-heuristics.mjs.
// NOTE: abyssResponse() itself is not exercised here — it imports
// next/server, which does not resolve under plain node. The drip
// (25 lines @ 2s) is verified by code inspection + the coordinator's
// live check; everything the maze renders is covered below.
import {
  abyssPageHtml,
  abyssPageHtmlAsync,
  isExtraMalicious,
  ABYSS_THRESHOLD,
  MAZE_DEPTH,
  mazePages,
  loadFakeBait,
  setFakeBaitProvider,
  fakeBaitBody,
  FAKE_AWS_ACCESS_KEY_ID,
  hashSlug,
  mulberry32,
} from './tarpit.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass += 1; }
  else { fail += 1; console.error('FAIL:', name); }
}

const ABYSS = '/api/ares/abyss';

function linksOf(html) {
  const out = [];
  for (const m of html.matchAll(/href="([^"]*)"/g)) out.push(m[1]);
  for (const m of html.matchAll(/action="([^"]*)"/g)) out.push(m[1]);
  return out;
}
function linksStayInside(html) {
  const links = linksOf(html);
  return links.length > 0 && links.every((u) => u === ABYSS || u.startsWith(`${ABYSS}/`));
}
function countLinks(html) {
  return linksOf(html).length;
}

// --- extra-malicious bar, unchanged -----------------------------------
t('threshold constant is 75', ABYSS_THRESHOLD === 75);
t('score 75 is extra-malicious', isExtraMalicious({ score: 75, strikes: 0 }));
t('score 74 is not extra-malicious', !isExtraMalicious({ score: 74, strikes: 0 }));
t('3 strikes + score 40 is extra-malicious', isExtraMalicious({ score: 40, strikes: 3 }));
t('3 strikes + score 39 is not', !isExtraMalicious({ score: 39, strikes: 3 }));
t('2 strikes + score 75 still qualifies on score', isExtraMalicious({ score: 75, strikes: 2 }));
t('ordinary request is not extra-malicious', !isExtraMalicious({ score: 10, strikes: 0 }));

// --- determinism helpers ----------------------------------------------
t('same slug hashes the same', hashSlug('vault') === hashSlug('vault'));
t('different slugs hash differently', hashSlug('vault') !== hashSlug('backup'));
t('mulberry32 is deterministic', (() => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  return a() === b() && a() === b() && a() === b();
})());

// --- index keeps its original shape -----------------------------------
const index = abyssPageHtml();
t('index keeps shard-index title', index.includes('<title>Console — shard index</title>'));
t('index keeps h1', index.includes('<h1>Shard index</h1>'));
t('index keeps 12 shard rows', (index.match(/shard-10\d\d/g) || []).length >= 12);
t('index keeps shard links', index.includes(`${ABYSS}/shard-1000`));
t('index keeps search form inside the abyss', index.includes(`action="${ABYSS}/search"`));
t('index keeps Back to index + Next page', index.includes(`${ABYSS}">Back to index</a>`) && index.includes(`${ABYSS}/next">Next page</a>`));
t('index no-arg equals empty-string render', abyssPageHtml() === abyssPageHtml(''));
t('index links stay inside', linksStayInside(index));
t('index leads deeper into the maze', index.includes(`${ABYSS}/vault`) && index.includes(`${ABYSS}/mobile-api`));

// --- the maze map ------------------------------------------------------
// Main chain, 14 levels deep (index depth 0 -> archive depth 13).
const CHAIN = ['', 'vault', 'backup', 'dump', 'keys', 'logs', 'shards',
  'db-console', 'admin', 'credential-store', 'deploy-logs', 'mobile-api',
  'release-builds', 'archive'];
t('maze depth is 14 levels (doubled)', MAZE_DEPTH === 14 && CHAIN.length === 14);

const pages = mazePages();
t('mazePages lists the chain plus branches', pages.length >= 20);
t('archive sits at depth 13', pages.some((p) => p.slug === 'archive' && p.depth === 13));
t('mobile-api sits at depth 11', pages.some((p) => p.slug === 'mobile-api' && p.depth === 11));

// Mobile third: roughly a third of the maze is mobile-themed.
const mobilePages = pages.filter((p) => p.mobile);
t('at least 7 mobile-themed pages', mobilePages.length >= 7);
t('mobile share is roughly a third', mobilePages.length / pages.length >= 0.25 && mobilePages.length / pages.length <= 0.45);
for (const slug of ['mobile-api', 'mobile-admin', 'mobile-config', 'otp-gateway', 'device-records', 'push-gateway', 'release-builds', 'app-downloads']) {
  t(`mobile page listed: ${slug}`, pages.some((p) => p.slug === slug && p.mobile));
}

// Every maze page: links stay inside, no dead end, deterministic —
// including the deepest levels.
const slugsToRender = [...new Set([
  ...pages.map((p) => p.slug).filter((s) => s && !s.includes('<')),
  'shard-1000', 'shard-1042', 'shard-2999',
  '.env', 'wp-config.php', '.git/config', 'backup.zip', 'dump.sql',
  'id_rsa', 'config.json', 'phpinfo', '.svn/entries',
  'some-random-probe-path', 'admin.php', 'search?q=fake-shard',
])];
for (const slug of slugsToRender) {
  const html = abyssPageHtml(slug);
  t(`page renders: ${slug}`, typeof html === 'string' && html.length > 200);
  t(`links stay inside on ${slug}`, linksStayInside(html));
  t(`no dead end on ${slug} (>=4 inside links)`, countLinks(html) >= 4);
  t(`deterministic render: ${slug}`, abyssPageHtml(slug) === html);
  t(`no http(s) link escapes on ${slug}`, !/<a[^>]+href="https?:/.test(html) && !/action="https?:/.test(html));
  t(`no form escapes the abyss on ${slug}`, !/action="(?!\/api\/ares\/abyss)/.test(html));
}

// Each chain page links onward to the next deeper page.
for (let i = 0; i < CHAIN.length - 1; i += 1) {
  const html = abyssPageHtml(CHAIN[i]);
  const nextSlug = CHAIN[i + 1];
  t(`chain ${CHAIN[i] || 'index'} links deeper to ${nextSlug}`, html.includes(`${ABYSS}/${nextSlug}`));
}
// The bottom loops back up instead of dead-ending.
t('archive loops back to vault', abyssPageHtml('archive').includes(`${ABYSS}/vault`));
t('archive links back to index', abyssPageHtml('archive').includes(`${ABYSS}">Back to index</a>`));

// --- fake-only content: never a real-looking secret --------------------
const allHtml = slugsToRender.map((s) => abyssPageHtml(s)).join('\n');
t('keys page shows the documented example AWS key', abyssPageHtml('keys').includes(FAKE_AWS_ACCESS_KEY_ID));
t('credential store shows the example key too', abyssPageHtml('credential-store').includes(FAKE_AWS_ACCESS_KEY_ID));
t('no non-example AWS access key anywhere', !/AKIA(?!IOSFODNN7EXAMPLE)[A-Z0-9]{16}/.test(allHtml));
t('no sk-live key anywhere', !allHtml.includes('sk-live'));
t('no real-looking hex secret anywhere (all-zero fake sha excepted)', (() => {
  const runs = allHtml.match(/[0-9a-f]{40,}/gi) || [];
  return runs.every((m) => /^0+$/.test(m));
})());
t('no real-looking phone numbers (555-01xx only)', (() => {
  const phones = allHtml.match(/\+1-\d{3}-\d{4}/g) || [];
  return phones.length > 0 && phones.every((p) => /^\+1-555-01\d\d$/.test(p));
})());
t('otp codes are 000000 only', (() => {
  const codes = allHtml.match(/\b\d{6}\b/g) || [];
  return codes.every((c) => c === '000000');
})());
t('otp page uses fictional 555 numbers', abyssPageHtml('otp-gateway').includes('+1-555-0100'));
t('otp page uses 000000 codes', abyssPageHtml('otp-gateway').includes('000000'));
t('release page download links loop back inside', (() => {
  const html = abyssPageHtml('release-builds');
  return html.includes(`${ABYSS}/app-downloads`) && !/href="[^"]*\.(apk|ipa)"/.test(html);
})());
t('app-downloads page never links a real file', !/href="[^"]*\.(apk|ipa)"/.test(abyssPageHtml('app-downloads')));

// --- bait consumption ---------------------------------------------------
// fake-bait.js has not landed yet in this checkout: the loader must
// fail soft and the maze must still serve its built-in fake bodies.
const baitBeforeStub = await loadFakeBait();
t('loadFakeBait fails soft when fake-bait.js is absent', baitBeforeStub === null || typeof baitBeforeStub === 'function');
if (baitBeforeStub) {
  // Real bait integration: the live async path renders worker A's
  // bodies, and the maze rules still hold over them.
  t('real bait exposes every contracted id', ['env', 'git-head', 'git-config', 'wp-config', 'admin', 'aws-credentials', 'backup-zip', 'dump-sql', 'id-rsa', 'ds-store', 'api-keys', 'config-json', 'phpinfo', 'svn-entries', 'mobile-config', 'mobile-auth', 'mobile-login', 'apk-download', 'ipa-download', 'releases-apk', 'sms-send', 'otp-verify', 'mobile-admin'].every((id) => {
    try { const r = baitBeforeStub(id); return r && typeof r.body === 'string' && r.body.length > 0; } catch { return false; }
  }));
  const realHtml = [];
  for (const slug of slugsToRender) {
    const html = await abyssPageHtmlAsync(slug);
    realHtml.push(html);
    t(`real-bait links stay inside on ${slug}`, linksStayInside(html));
    t(`real-bait deterministic render: ${slug}`, (await abyssPageHtmlAsync(slug)) === html);
  }
  const realJoined = realHtml.join('\n');
  t('real-bait pages: no non-example AWS key', !/AKIA(?!IOSFODNN7EXAMPLE)[A-Z0-9]{16}/.test(realJoined));
  t('real-bait pages: hex runs are all-zero fakes only', (realJoined.match(/[0-9a-f]{40,}/gi) || []).every((m) => /^0+$/.test(m)));
  t('real-bait pages: otp codes are 000000 only', (realJoined.match(/\b\d{6}\b/g) || []).every((c) => c === '000000'));
  t('real-bait mobile-config body appears on its page', (await abyssPageHtmlAsync('mobile-config')).includes('FAKE MOBILE APP CONFIG'));
  t('real-bait otp body appears on the otp page', (await abyssPageHtmlAsync('otp-gateway')).includes('FAKE OTP GATEWAY'));
  t('real-bait releases body appears on the releases page', (await abyssPageHtmlAsync('release-builds')).includes('FAKE RELEASE'));
  t('real-bait mobile-admin body appears on its page', (await abyssPageHtmlAsync('mobile-admin')).includes('FAKE MOBILE ADMIN PANEL'));
} else {
  t('real bait absent — integration checks skipped (fallback mode)', true);
}
t('fallback bait body serves without the module', fakeBaitBody('env', 'FALLBACK-BODY').includes('FALLBACK-BODY') || fakeBaitBody('env', 'FALLBACK-BODY').includes(FAKE_AWS_ACCESS_KEY_ID));
// Stub provider proves the consumption path: when a fakeBaitFor is
// installed, its body is what the page shows.
setFakeBaitProvider((id) => ({ contentType: 'text/plain', body: `STUB-BAIT-BODY-for-${id}` }));
t('stub bait provider body appears on the env page', abyssPageHtml('env').includes('STUB-BAIT-BODY-for-env'));
t('stub bait provider body appears on the mobile-config page', abyssPageHtml('mobile-config').includes('STUB-BAIT-BODY-for-mobile-config'));
t('stub bait provider body appears on the otp page', abyssPageHtml('otp-gateway').includes('STUB-BAIT-BODY-for-otp-verify'));
t('stub bait provider body appears on the apk page', abyssPageHtml('release-builds').includes('STUB-BAIT-BODY-for-releases-apk'));
t('stub bait provider body appears on the mobile-admin page', abyssPageHtml('mobile-admin').includes('STUB-BAIT-BODY-for-mobile-admin'));
t('stub bait provider body appears on the app-downloads page', abyssPageHtml('app-downloads').includes('STUB-BAIT-BODY-for-apk-download'));
setFakeBaitProvider(null);
t('provider reset restores fallback bodies', abyssPageHtml('env').includes(FAKE_AWS_ACCESS_KEY_ID));

// Async render path (what the live route uses) matches the sync render.
t('async render matches sync render for vault', (await abyssPageHtmlAsync('vault')) === abyssPageHtml('vault'));
t('async render matches sync render for archive', (await abyssPageHtmlAsync('archive')) === abyssPageHtml('archive'));
t('async render matches sync render for otp-gateway', (await abyssPageHtmlAsync('otp-gateway')) === abyssPageHtml('otp-gateway'));
t('async render is deterministic at depth', (await abyssPageHtmlAsync('mobile-api')) === (await abyssPageHtmlAsync('mobile-api')));

console.log(`tarpit: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
