// lib/ares/tarpit.js — the abyss sandbox (server only).
//
// DEFENSIVE ONLY, and only for the extra-malicious tier. Ordinary bots
// still get what they always got: a 403 from the edge middleware, or a
// 404 from a honeypot trap. The abyss is reserved for attacks that cross
// the extra-malicious bar below — harvesters and auth-gate bypass
// attempts that keep coming back.
//
// What the abyss IS: a fake environment served from our side. Every
// link and form inside it points back into the abyss, so the bot can
// crawl forever without ever reaching a real page, real data, or a real
// session. The trapped flag persists per source, so every later request
// from that source lands back in the sandbox until the keeper releases
// it from the console. That persistence is what makes it inescapable,
// not any single connection: one connection still ends (serverless
// functions cannot drip forever), but the next request falls straight
// back in.
//
// What the abyss is NOT: it never attacks the source, never sends a
// payload, never exfiltrates anything, and never touches a real system.
// It serves fake rows, slowly, on our server. Bait and report — never
// hack back. This tier deliberately overrides the honeypot module's old
// "no tarpits" comment, by the keeper's order, for this tier only.
//
// Source reporting: every trapped source is recorded in
// ares_attack_sources (hashed IP only, never a raw IP, matching the
// existing ARES source guardrail) and shown in the console. Nothing is
// sent to any outside authority on its own — external reports stay
// keeper-approved, as they always have.
//
// NOTE: NextResponse is imported lazily inside abyssResponse so the
// pure decision helpers stay importable from plain node tests
// (next/server does not resolve under node --test).

import { serviceClient, hashVisitorIp } from './server.js';

// Extra-malicious bar: a middleware score of 75 means a flagged scanner
// UA on a scanner path (45 + 30) — the harvester signature. A repeat
// offender with 3+ strikes that still trips bot signals also qualifies.
export const ABYSS_THRESHOLD = 75;

/** Pure decision: does this request cross into the abyss tier? */
export function isExtraMalicious({ score = 0, strikes = 0 } = {}) {
  const s = Number(score) || 0;
  const st = Number(strikes) || 0;
  if (s >= ABYSS_THRESHOLD) return true;
  if (st >= 3 && s >= 40) return true;
  return false;
}

/** The fake environment: plausible-looking rows, zero real data, and
 *  every exit leads back into the abyss.
 *
 *  THE MIRROR DIMENSION (Merlin, Nov 15 ~00:50–00:51): the core ARES
 *  doctrine is to SANDBOX threats — containment + observation, not
 *  destruction, not retaliation, not blocking. This maze IS the
 *  sandbox's depth: the deeper a threat wanders, the longer it is
 *  watched and the more we learn, while it never touches a single real
 *  byte. The threat thinks it is in the real world, but nothing it
 *  touches is real and nothing it breaks matters. Every page below
 *  exists to keep the threat inside, wandering, observable.
 *
 *  Maze shape: a 14-level chain (index -> vault -> backup -> dump ->
 *  keys -> logs -> shards -> db-console -> admin -> credential-store
 *  -> deploy-logs -> mobile-api -> release-builds -> archive) plus
 *  branch pages, ~a third of them mobile-themed (fake mobile API,
 *  fake app downloads, fake SMS/OTP gateway, fake mobile admin).
 *  Every page links onward deeper, cross-links to other maze pages,
 *  and loops back to the index. There is no dead end and no link to
 *  any real route: a bot that stops requesting simply stops, nothing
 *  holds it, nothing follows it. The trap persists per source only
 *  until the keeper releases it (releaseTrap, untouched).
 *
 *  Deterministic per slug: rows are seeded from a hash of the slug
 *  (mulberry32, same family as the sports CGI kit), so the same URL
 *  always shows the same fake rows — a bot or a test can rely on it.
 *
 *  Fake bait: file contents come from worker A's
 *  lib/ares/fake-bait.js via fakeBaitFor(id) when that module is
 *  present (loaded lazily; the live route awaits it before rendering).
 *  Until it lands, built-in fake bodies serve the same pages, so the
 *  maze never breaks. CONSUME ONLY — never rewrite its exports. */

const ABYSS_BASE = '/api/ares/abyss';
export { ABYSS_BASE };

// Documented AWS example credentials ONLY — the only "keys" the maze
// ever shows. Never a real-looking key anywhere in the sandbox.
export const FAKE_AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
export const FAKE_AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** FNV-1a hash of a slug -> numeric seed. */
export function hashSlug(slug) {
  let h = 0x811c9dc5;
  const s = String(slug || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 PRNG, seeded per slug for deterministic fake rows. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- fake bait (lib/ares/fake-bait.js, worker A) -----------------------
// Loaded lazily so the maze still serves its built-in fake bodies if
// the bait module has not landed yet. The live route awaits
// loadFakeBait() before rendering, so in production the bait file's
// contents are what the bot sees.
let baitProvider = null;
let baitLoadTried = false;

/** Test seam / manual override: install a fakeBaitFor-compatible fn. */
export function setFakeBaitProvider(fn) {
  baitProvider = typeof fn === 'function' ? fn : null;
  baitLoadTried = true;
}

/** Best-effort load of fakeBaitFor; never throws, null when absent. */
export async function loadFakeBait() {
  if (baitLoadTried) return baitProvider;
  baitLoadTried = true;
  try {
    const mod = await import('./fake-bait.js');
    if (mod && typeof mod.fakeBaitFor === 'function') baitProvider = mod.fakeBaitFor;
  } catch {
    baitProvider = null;
  }
  return baitProvider;
}

/** Body for a bait id: the bait module's when loaded, else the fallback. */
export function fakeBaitBody(id, fallback) {
  if (baitProvider) {
    try {
      const r = baitProvider(id);
      if (r && typeof r.body === 'string' && r.body.length > 0) return r.body;
    } catch { /* fall through to the built-in fake body */ }
  }
  return fallback;
}

// Built-in fake file bodies (used until fake-bait.js lands; the bait
// module's bodies replace these, same ids). Every value is an obvious
// example: 555 fictional numbers, 000000 codes, EXAMPLE keys.
const FAKE_FILE_BODIES = {
  env: `AWS_ACCESS_KEY_ID=${FAKE_AWS_ACCESS_KEY_ID}\nAWS_SECRET_ACCESS_KEY=${FAKE_AWS_SECRET}\nDATABASE_URL=postgres://fake-user:fake-example-password@fake-db.internal:5432/fake_db\nREDIS_URL=redis://fake-cache.internal:6379/0\nSESSION_SECRET=fake-example-session-secret`,
  'wp-config': `<?php\ndefine( 'DB_NAME', 'fake_wp' );\ndefine( 'DB_USER', 'fake-user' );\ndefine( 'DB_PASSWORD', 'fake-example-password' );\ndefine( 'DB_HOST', 'fake-db.internal' );\ndefine( 'AUTH_KEY', 'EXAMPLE-SALT-0000-fake' );`,
  'git-config': `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = fake-git.internal/fake/repo.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*`,
  'git-head': 'ref: refs/heads/fake-main',
  'backup-zip': 'FAKE-ZIP-ARCHIVE (example only, not a real archive)\n  fake-dump.sql (fake, 1,024 fake rows)\n  fake-config.json (fake)\n  fake-keys.txt (EXAMPLE values only)',
  'dump-sql': `-- fake database dump — no real rows\nINSERT INTO fake_users (id, name, email) VALUES (1, 'fake-user', 'fake@example.invalid');\nINSERT INTO fake_orders (id, total) VALUES (1, 0.00);`,
  'api-keys': `AKIAIOSFODNN7EXAMPLE\n${FAKE_AWS_SECRET}\nsk-fake-EXAMPLE-0000\nwhsec_fake_example_0000`,
  admin: 'admin panel export (fake)\nuser: fake-admin\nrole: read-only (fake)\nlast login: never (fake)',
  'aws-credentials': `[default]\naws_access_key_id = ${FAKE_AWS_ACCESS_KEY_ID}\naws_secret_access_key = ${FAKE_AWS_SECRET}`,
  'id-rsa': '-----BEGIN FAKE PRIVATE KEY-----\nEXAMPLE-ONLY-NOT-A-REAL-KEY\n-----END FAKE PRIVATE KEY-----',
  'ds-store': 'FAKE .DS_Store (example only, not a real file)',
  'config-json': '{\n  "app": "fake-app",\n  "apiBase": "api.fake-example.internal",\n  "apiKey": "EXAMPLE-ONLY"\n}',
  phpinfo: 'PHP Version 9.9.9-fake\nSystem: fake-example.internal\nLoaded extensions (fake): none',
  'svn-entries': 'fake-svn-entries (example only)\nurl: fake-svn.internal/fake/repo',
  'mobile-config': '{\n  "app": "fake-mobile-app",\n  "apiBase": "api.fake-example.internal/mobile",\n  "apiToken": "fake-mobile-token-EXAMPLE-0000",\n  "minVersion": "9.9.9-fake",\n  "otpGateway": "sms.fake-example.internal"\n}',
  'mobile-auth': '{\n  "note": "FAKE MOBILE AUTH — NOT REAL",\n  "access_token": "FAKE-ACCESS-TOKEN-NOT-REAL",\n  "token_type": "Bearer",\n  "user": { "id": "fake-user-0001", "email": "fake_user@example.invalid" }\n}',
  'mobile-admin': 'FAKE MOBILE ADMIN PANEL — NOT REAL\nDevice ID: fake-device-0001\nAdmin PIN: 000000 (fake)',
  'releases-apk': 'FAKE RELEASES (example only — no real files)\n  olympus-mobile-9.9.9-fake.apk — 48.2 MB (fake) — sha256:fake-example\n  olympus-mobile-9.9.8-fake.apk — 47.9 MB (fake) — sha256:fake-example\n  olympus-mobile-9.9.9-fake.ipa — 52.1 MB (fake) — sha256:fake-example',
  'apk-download': 'FAKE APK MANIFEST — NOT A REAL BINARY\npackage="com.example.fakeapp"\nversionName="9.9.9-FAKE"\nFAKE APK — NO BINARY PAYLOAD — DO NOT INSTALL',
  'otp-verify': 'FAKE OTP GATEWAY LOG (example only)\n  send +1-555-0100 code 000000 — delivered (fake)\n  verify +1-555-0114 code 000000 — ok (fake)\n  send +1-555-0128 code 000000 — delivered (fake)',
};

// The main chain: 14 levels deep, index (depth 0) to archive (depth 13).
const MAZE_CHAIN = ['', 'vault', 'backup', 'dump', 'keys', 'logs', 'shards',
  'db-console', 'admin', 'credential-store', 'deploy-logs', 'mobile-api',
  'release-builds', 'archive'];
export const MAZE_DEPTH = MAZE_CHAIN.length;

// Branch pages: depth is where they hang off the chain; mobile flags
// the mobile-themed third of the maze.
const PAGE_DEFS = [
  { slug: 'vault', title: 'Vault', depth: 1, mobile: false, kind: 'vault', blurb: 'Sealed segments. Replicating. Please wait.' },
  { slug: 'backup', title: 'Backups', depth: 2, mobile: false, kind: 'backup', baitId: 'backup-zip', blurb: 'Nightly snapshots. Restore points are fake and never restore anything real.' },
  { slug: 'dump', title: 'Database dumps', depth: 3, mobile: false, kind: 'dump', baitId: 'dump-sql', blurb: 'Dump files. Every row is a null row.' },
  { slug: 'keys', title: 'API keys', depth: 4, mobile: false, kind: 'keys', baitId: 'api-keys', blurb: 'Service keys. The only key ever shown is the documented example key.' },
  { slug: 'logs', title: 'Logs', depth: 5, mobile: false, kind: 'logs', blurb: 'Access and audit logs. Nothing here happened.' },
  { slug: 'shards', title: 'Shard list', depth: 6, mobile: false, kind: 'shards', blurb: 'All shards, replicating.' },
  { slug: 'db-console', title: 'Database console', depth: 7, mobile: false, kind: 'db', blurb: 'Tables and rows. Every table is empty or fake.' },
  { slug: 'admin', title: 'Admin panel', depth: 8, mobile: false, kind: 'admin', baitId: 'admin', blurb: 'Administration. No admin action here does anything.' },
  { slug: 'credential-store', title: 'Credential store', depth: 9, mobile: false, kind: 'creds', baitId: 'aws-credentials', blurb: 'Stored credentials. Example values only — nothing real is stored.' },
  { slug: 'deploy-logs', title: 'Deploy logs', depth: 10, mobile: false, kind: 'deploy', blurb: 'Builds and deploys. All fake, all green or red at random.' },
  { slug: 'mobile-api', title: 'Mobile API', depth: 11, mobile: true, kind: 'mobileApi', baitId: 'mobile-auth', blurb: 'Mobile API tree. Fake endpoints, fake tokens, fake devices.' },
  { slug: 'release-builds', title: 'Release builds', depth: 12, mobile: true, kind: 'releases', baitId: 'releases-apk', blurb: 'App releases. Download links loop back into the maze — never a real file.' },
  { slug: 'archive', title: 'Deep archive', depth: 13, mobile: false, kind: 'archive', blurb: 'The bottom of the maze. It only loops back up — there is no way out.' },
  { slug: 'mobile-admin', title: 'Mobile admin', depth: 12, mobile: true, kind: 'mobileAdmin', baitId: 'mobile-admin', deeper: 'mobile-config', blurb: 'Mobile administration panel. Fake admins, fake sessions.' },
  { slug: 'mobile-config', title: 'Mobile config', depth: 12, mobile: true, kind: 'mobileConfig', baitId: 'mobile-config', deeper: 'otp-gateway', blurb: 'Remote config for the fake mobile app.' },
  { slug: 'otp-gateway', title: 'SMS / OTP gateway', depth: 12, mobile: true, kind: 'otp', baitId: 'otp-verify', deeper: 'device-records', blurb: 'Send and verify logs. Numbers are 555 fictional numbers; codes are 000000.' },
  { slug: 'device-records', title: 'Device records', depth: 12, mobile: true, kind: 'devices', deeper: 'push-gateway', blurb: 'Enrolled devices. All fake hardware, all fake owners.' },
  { slug: 'push-gateway', title: 'Push gateway', depth: 12, mobile: true, kind: 'push', deeper: 'app-downloads', blurb: 'Push delivery logs. Nothing is ever delivered.' },
  { slug: 'app-downloads', title: 'App downloads', depth: 13, mobile: true, kind: 'downloads', baitId: 'apk-download', deeper: 'archive', blurb: 'APK and IPA downloads. Every download link returns to the maze.' },
  { slug: 'search', title: 'Search results', depth: 1, mobile: false, kind: 'search', deeper: 'vault', blurb: 'Search results. Replicating.' },
  { slug: 'next', title: 'Shard index — page 2', depth: 1, mobile: false, kind: 'shards', deeper: 'vault', blurb: 'More shards. Replicating. Please wait.' },
  { slug: 'env', title: '.env', depth: 2, mobile: false, kind: 'file', baitId: 'env', deeper: 'vault', blurb: 'Environment file. Example values only.' },
  { slug: 'wp-config', title: 'wp-config.php', depth: 2, mobile: false, kind: 'file', baitId: 'wp-config', deeper: 'vault', blurb: 'WordPress config. Example values only.' },
  { slug: 'git-config', title: '.git/config', depth: 2, mobile: false, kind: 'file', baitId: 'git-config', deeper: 'vault', blurb: 'Git config. A fake remote that leads nowhere.' },
];

const PAGE_BY_SLUG = new Map(PAGE_DEFS.map((d) => [d.slug, d]));
const ALL_SLUGS = [...MAZE_CHAIN.slice(1), ...PAGE_DEFS.filter((d) => !MAZE_CHAIN.includes(d.slug)).map((d) => d.slug)];

// Bait-file aliases: scanner paths that land on a maze page instead of
// a real file. File-only aliases get a generated file page.
const FILE_ALIASES = {
  '.env': 'env',
  'wp-config.php': 'wp-config',
  '.git/config': 'git-config',
  'backup.zip': 'backup',
  'dump.sql': 'dump',
  'api-keys': 'keys',
  credentials: 'credential-store',
  'admin.php': 'admin',
  '.git/head': 'git-head',
  id_rsa: 'id-rsa',
  '.ds_store': 'ds-store',
  'config.json': 'config-json',
  phpinfo: 'phpinfo',
  'phpinfo.php': 'phpinfo',
  '.svn/entries': 'svn-entries',
};

// Extra onward links per page, so the wandering branches as well as
// descends: keys lead to the credential store, logs to deploy logs,
// the mobile API to the OTP gateway and device records, and so on.
const EXTRA_LINKS = {
  keys: ['credential-store'],
  logs: ['deploy-logs'],
  dump: ['db-console'],
  shards: ['logs'],
  'db-console': ['dump'],
  admin: ['credential-store'],
  'credential-store': ['keys'],
  'deploy-logs': ['archive'],
  'mobile-api': ['otp-gateway', 'device-records', 'mobile-admin'],
  'mobile-admin': ['otp-gateway'],
  'mobile-config': ['mobile-api'],
  'otp-gateway': ['push-gateway'],
  'device-records': ['mobile-admin'],
  'release-builds': ['app-downloads', 'mobile-api'],
  'app-downloads': ['release-builds'],
  archive: ['mobile-api'],
  vault: ['keys'],
};

/** Every maze page the sandbox serves (index + shard detail + defs). */
export function mazePages() {
  const pages = [{ slug: '', title: 'Shard index', depth: 0, mobile: false }];
  pages.push({ slug: 'shard-<n>', title: 'Shard detail', depth: 7, mobile: false });
  for (const d of PAGE_DEFS) pages.push({ slug: d.slug, title: d.title, depth: d.depth, mobile: d.mobile });
  return pages;
}

const ROW_POOLS = {
  vault: { names: ['vault-segment', 'sealed-crate', 'cold-store', 'lockbox'], values: ['sealed', 'replicating', 'null-row', 'awaiting-sync'] },
  backup: { names: ['nightly-backup', 'snapshot', 'archive-chunk', 'restore-point'], values: ['2026-11-15 (fake)', '12.4 GB (fake)', 'verified (fake)', 'pending'] },
  dump: { names: ['users-dump', 'orders-dump', 'sessions-dump', 'events-dump'], values: ['null-row', '1,024 fake rows', 'redacted (fake)', 'truncated (fake)'] },
  keys: { names: ['api-key', 'service-key', 'signing-key', 'webhook-key'], values: [FAKE_AWS_ACCESS_KEY_ID, 'sk-fake-EXAMPLE-0000', 'whsec_fake_example_0000', 'EXAMPLE-ONLY'] },
  logs: { names: ['access-log', 'error-log', 'audit-log', 'sync-log'], values: ['200 (fake)', '404 (fake)', 'replicating', 'rotated (fake)'] },
  shards: { names: ['shard', 'replica', 'partition', 'segment'], values: ['syncing…', 'null-row', 'awaiting', 'complete (fake)'] },
  db: { names: ['table-users', 'table-orders', 'table-sessions', 'table-events'], values: ['1,024 fake rows', 'empty (fake)', 'indexed (fake)', 'locked (fake)'] },
  admin: { names: ['admin-user', 'role', 'permission', 'session'], values: ['fake-admin', 'read-only (fake)', 'suspended (fake)', 'active (fake)'] },
  creds: { names: ['aws-credential', 'db-credential', 'smtp-credential', 'storage-credential'], values: [FAKE_AWS_ACCESS_KEY_ID, 'fake-user', 'EXAMPLE-ONLY', 'rotated (fake)'] },
  deploy: { names: ['deploy', 'build', 'release', 'rollback'], values: ['succeeded (fake)', 'failed (fake)', 'queued (fake)', 'live (fake)'] },
  mobileApi: { names: ['/api/mobile/v1/login', '/api/mobile/v1/devices', '/api/mobile/v1/profile', '/api/mobile/v1/sync'], values: ['200 (fake)', '401 (fake)', 'tok_fake_example_0000', 'device-fake-1001'] },
  mobileAdmin: { names: ['mobile-admin', 'push-admin', 'device-admin', 'store-admin'], values: ['fake-admin', '2FA (fake)', 'locked (fake)', 'review (fake)'] },
  mobileConfig: { names: ['mobile-config', 'feature-flag', 'remote-config', 'app-settings'], values: ['v9.9.9-fake', 'enabled (fake)', 'disabled (fake)', 'staged (fake)'] },
  otp: { names: ['otp-send', 'otp-verify', 'sms-gateway', 'voice-otp'], values: ['+1-555-0100', '+1-555-0114', '000000', 'delivered (fake)'] },
  devices: { names: ['Pixel 8a (fake)', 'iPhone 15 (fake)', 'Galaxy S24 (fake)', 'Pixel 7a (fake)'], values: ['device-fake-1001', 'enrolled (fake)', 'revoked (fake)', 'last-seen (fake)'] },
  push: { names: ['push-token', 'push-campaign', 'push-delivery', 'push-topic'], values: ['ExponentPushToken[fake-example]', 'sent (fake)', 'queued (fake)', 'bounced (fake)'] },
  releases: { names: ['app-release', 'apk-build', 'ipa-build', 'beta-track'], values: ['v9.9.9-fake', 'arm64 (fake)', 'signed (fake)', 'staged (fake)'] },
  downloads: { names: ['olympus-mobile.apk', 'olympus-mobile.ipa', 'beta.apk', 'nightly.ipa'], values: ['48.2 MB (fake)', 'v9.9.9-fake', 'sha256:fake-example', 'staged (fake)'] },
  archive: { names: ['archive-2024', 'archive-2025', 'cold-tape', 'deep-store'], values: ['sealed', 'retrieving (fake)', 'null-row', 'indexed (fake)'] },
  search: { names: ['search-hit', 'search-index', 'search-cache'], values: ['null-row', 'replicating', '0 fake hits'] },
  file: { names: ['config-file', 'secret-file', 'backup-file'], values: ['EXAMPLE-ONLY', 'redacted (fake)', 'fake'] },
  generic: { names: ['directory', 'listing', 'node', 'segment'], values: ['null-row', 'syncing…', 'empty (fake)'] },
};
const ROW_STATUSES = ['syncing…', 'replicating', 'awaiting-sync', 'complete (fake)'];

function normalizePath(path) {
  let p = String(path || '').split('?')[0].trim();
  p = p.replace(/^\/+|\/+$/g, '');
  p = p.replace(/^api\/ares\/abyss\/?/i, '');
  return p;
}

function deeperFor(def) {
  if (def.deeper) return def.deeper;
  const i = MAZE_CHAIN.indexOf(def.slug);
  if (i >= 0 && i < MAZE_CHAIN.length - 1) return MAZE_CHAIN[i + 1];
  return 'vault'; // bottom of the chain loops back up — never a dead end
}

function resolvePage(slug, q) {
  if (slug === 'search') {
    return { def: PAGE_BY_SLUG.get('search'), seedStr: `search:${q || ''}` };
  }
  if (slug === 'next') {
    return { def: PAGE_BY_SLUG.get('next'), seedStr: 'next' };
  }
  const shardMatch = /^shard-(\d+)$/.exec(slug);
  if (shardMatch) {
    return {
      def: { slug, title: `Shard ${slug}`, depth: 7, mobile: false, kind: 'shards', deeper: 'shards' },
      seedStr: slug,
    };
  }
  const direct = PAGE_BY_SLUG.get(slug);
  if (direct) return { def: direct, seedStr: slug };
  const alias = FILE_ALIASES[slug];
  if (alias) {
    const aliased = PAGE_BY_SLUG.get(alias);
    if (aliased) return { def: aliased, seedStr: slug };
    return {
      def: { slug, title: slug, depth: 2, mobile: false, kind: 'file', baitId: alias, deeper: 'vault' },
      seedStr: slug,
    };
  }
  return {
    def: { slug, title: 'Directory listing', depth: 1, mobile: false, kind: 'generic', deeper: 'vault' },
    seedStr: slug,
  };
}

function fakeRows(rng, kind, count, linkTarget) {
  const pool = ROW_POOLS[kind] || ROW_POOLS.generic;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const name = pool.names[Math.floor(rng() * pool.names.length)];
    const value = pool.values[Math.floor(rng() * pool.values.length)];
    const status = ROW_STATUSES[Math.floor(rng() * ROW_STATUSES.length)];
    rows.push(
      `<tr><td>${escapeHtml(name)}-${1000 + Math.floor(rng() * 9000)}</td>` +
      `<td>${escapeHtml(value)}</td><td>${status}</td>` +
      `<td><a href="${ABYSS_BASE}/${linkTarget}">open</a></td></tr>`,
    );
  }
  return rows.join('');
}

function crossLinks(rng, def, deeper, extras) {
  const excluded = new Set([def.slug, deeper, ...extras, '']);
  const pool = ALL_SLUGS.filter((s) => !excluded.has(s));
  const picked = [];
  while (picked.length < 2 && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function searchFormHtml() {
  return `<form method="get" action="${ABYSS_BASE}/search">` +
    `<input name="q" placeholder="Search shards">` +
    `<button>Search</button></form>`;
}

function pageShell(title, heading, bodyInner) {
  return `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>Console — ${escapeHtml(title)}</title></head><body>` +
    `<h1>${escapeHtml(heading)}</h1>${bodyInner}</body></html>`;
}

/** The index keeps its original shard-index shape exactly, plus a
 *  "Deeper" nav that leads into the maze. */
function indexPageHtml() {
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    rows.push(
      `<tr><td>shard-${1000 + i}</td><td>null-row-${9000 + i}</td>` +
      `<td>syncing…</td><td><a href="${ABYSS_BASE}/shard-${1000 + i}">open</a></td></tr>`,
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>Console — shard index</title></head><body>` +
    `<h1>Shard index</h1><p>Replicating. Please wait.</p>` +
    `<table>${rows.join('')}</table>` +
    `<form method="get" action="${ABYSS_BASE}/search">` +
    `<input name="q" placeholder="Search shards">` +
    `<button>Search</button></form>` +
    `<p><a href="${ABYSS_BASE}">Back to index</a> · ` +
    `<a href="${ABYSS_BASE}/next">Next page</a></p>` +
    `<p>Deeper: <a href="${ABYSS_BASE}/vault">Vault</a> · ` +
    `<a href="${ABYSS_BASE}/backup">Backups</a> · ` +
    `<a href="${ABYSS_BASE}/dump">Database dumps</a> · ` +
    `<a href="${ABYSS_BASE}/keys">API keys</a> · ` +
    `<a href="${ABYSS_BASE}/logs">Logs</a> · ` +
    `<a href="${ABYSS_BASE}/mobile-api">Mobile API</a></p>` +
    `</body></html>`;
}

function mazePageHtmlFor(def, seedStr, q) {
  const rng = mulberry32(hashSlug(seedStr));
  const deeper = deeperFor(def);
  const extras = EXTRA_LINKS[def.slug] || [];
  const cross = crossLinks(rng, def, deeper, extras);
  const deeperDef = PAGE_BY_SLUG.get(deeper);
  const deeperLabel = deeperDef ? deeperDef.title : deeper;
  let pre = '';
  if (def.baitId) {
    const body = fakeBaitBody(def.baitId, FAKE_FILE_BODIES[def.baitId] || 'EXAMPLE-ONLY (fake file)');
    pre = `<pre>${escapeHtml(body)}</pre>`;
  }
  const queryNote = q ? `<p>Results for “${escapeHtml(q)}”. Replicating.</p>` : '';
  const rows = def.slug === 'next'
    ? (() => {
      const out = [];
      for (let i = 0; i < 12; i += 1) {
        out.push(
          `<tr><td>shard-${2000 + i}</td><td>null-row-${8000 + i}</td>` +
          `<td>syncing…</td><td><a href="${ABYSS_BASE}/shard-${2000 + i}">open</a></td></tr>`,
        );
      }
      return out.join('');
    })()
    : fakeRows(rng, def.kind, 8, deeper);
  const extraLinks = extras.map((s) => {
    const d = PAGE_BY_SLUG.get(s);
    return `<a href="${ABYSS_BASE}/${s}">${escapeHtml(d ? d.title : s)}</a>`;
  }).join(' · ');
  const bodyInner =
    `<p>${escapeHtml(def.blurb)}</p>${queryNote}${pre}` +
    `<table>${rows}</table>` +
    searchFormHtml() +
    `<p>Deeper: <a href="${ABYSS_BASE}/${deeper}">${escapeHtml(deeperLabel)}</a>` +
    (extraLinks ? ` · ${extraLinks}` : '') + `</p>` +
    `<p>Also: ${cross.map((s) => {
      const d = PAGE_BY_SLUG.get(s);
      return `<a href="${ABYSS_BASE}/${s}">${escapeHtml(d ? d.title : s)}</a>`;
    }).join(' · ')} · <a href="${ABYSS_BASE}">Back to index</a></p>`;
  return pageShell(def.title, def.title, bodyInner);
}

/** Route-aware fake page: no arg (or '') is the original shard index;
 *  any subpath serves its own deterministic maze page. */
export function abyssPageHtml(path = '') {
  const raw = String(path || '');
  const [pathPart, queryPart] = raw.split('?');
  const slug = normalizePath(pathPart);
  if (slug === '') return indexPageHtml();
  const params = new URLSearchParams(queryPart || '');
  const { def, seedStr } = resolvePage(slug, params.get('q') || '');
  return mazePageHtmlFor(def, seedStr, params.get('q') || '');
}

/** Async page render: loads worker A's fake bait first when present,
 *  then renders — so live traffic sees the bait file's contents. */
export async function abyssPageHtmlAsync(path = '') {
  await loadFakeBait();
  return abyssPageHtml(path);
}

/** The slow drip, shared by the maze and the doll layers: the rendered
 *  page first, then 25 fake log lines, one every 2 s. One connection
 *  still ends (serverless functions cannot drip forever), but the next
 *  request falls straight back into the sandbox. */
export function dripResponse(html) {
  const encoder = new TextEncoder();
  let count = 0;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(html));
      const tick = async () => {
        while (count < 25) {
          await new Promise((r) => setTimeout(r, 2000));
          count += 1;
          controller.enqueue(encoder.encode(
            `\n<!-- shard sync ${count} of 9999: replicating null rows, please wait -->\n`,
          ));
        }
        controller.close();
      };
      tick();
    },
  });
}

function dripStream(path) {
  return (async () => {
    // Async render so the maze uses worker A's fake bait when present.
    const html = await abyssPageHtmlAsync(path);
    return dripResponse(html);
  })();
}

/** The abyss response: fake maze page for the requested subpath, then
 *  a slow drip of fake log lines (25 lines @ 2s, on every maze page). */
export async function abyssResponse(path = '') {
  const { NextResponse } = await import('next/server');
  return new NextResponse(await dripStream(path), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function db() {
  try {
    return serviceClient();
  } catch {
    return null;
  }
}

/** Record (or refresh) the attack-source report for one hostile visitor. */
export async function recordAttackSource({ ip, userAgent = null, path = null, score = 0, reasons = [], trapped = false }) {
  const client = db();
  if (!client || !ip || ip === 'unknown') return null;
  const ipHash = hashVisitorIp(ip);
  try {
    const { data: existing } = await client
      .from('ares_attack_sources')
      .select('path_count, max_score, reasons')
      .eq('ip_hash', ipHash)
      .single();
    const mergedReasons = [...new Set([...(existing?.reasons || []), ...reasons])].slice(0, 10);
    await client.from('ares_attack_sources').upsert([{
      ip_hash: ipHash,
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
      last_path: path ? String(path).slice(0, 300) : null,
      path_count: (existing?.path_count || 0) + 1,
      max_score: Math.max(existing?.max_score || 0, Number(score) || 0),
      reasons: mergedReasons,
      trap_status: trapped ? 'trapped' : (existing?.trap_status || 'none'),
      last_seen: new Date().toISOString(),
    }], { onConflict: 'ip_hash' });
    return ipHash;
  } catch {
    return null;
  }
}

/** Trap a source in the abyss (persists until the keeper releases it). */
export async function trapAttackSource({ ip, reason = 'Extra-malicious attack', score = 0 }) {
  const client = db();
  if (!client || !ip || ip === 'unknown') return null;
  const ipHash = hashVisitorIp(ip);
  try {
    const { data: existing } = await client
      .from('ares_trapped')
      .select('hits')
      .eq('ip_hash', ipHash)
      .single();
    await client.from('ares_trapped').upsert([{
      ip_hash: ipHash,
      reason,
      score: Number(score) || 0,
      hits: (existing?.hits || 0) + 1,
      last_seen: new Date().toISOString(),
    }], { onConflict: 'ip_hash' });
    await client.from('ares_attack_sources')
      .update({ trap_status: 'trapped', last_seen: new Date().toISOString() })
      .eq('ip_hash', ipHash);
    return ipHash;
  } catch {
    return null;
  }
}

/** Is this source currently trapped? Never throws: unknown means no. */
export async function isTrapped(ipHash) {
  const client = db();
  if (!client || !ipHash) return false;
  try {
    const { data, error } = await client
      .from('ares_trapped')
      .select('ip_hash')
      .eq('ip_hash', ipHash)
      .single();
    return !error && !!data;
  } catch {
    return false;
  }
}

/** Bump a trapped source's hit count (abyss pages call this per visit). */
export async function bumpTrapHit(ip) {
  const client = db();
  if (!client || !ip || ip === 'unknown') return;
  const ipHash = hashVisitorIp(ip);
  try {
    const { data: existing } = await client
      .from('ares_trapped')
      .select('hits')
      .eq('ip_hash', ipHash)
      .single();
    if (!existing) return;
    await client.from('ares_trapped').update({
      hits: (existing.hits || 0) + 1,
      last_seen: new Date().toISOString(),
    }).eq('ip_hash', ipHash);
  } catch {}
}

/** Release a trapped source (keeper only, via the console route). */
export async function releaseTrap(ipHash) {
  const client = db();
  if (!client || !ipHash) return false;
  try {
    await client.from('ares_trapped').delete().eq('ip_hash', ipHash);
    await client.from('ares_attack_sources')
      .update({ trap_status: 'released', last_seen: new Date().toISOString() })
      .eq('ip_hash', ipHash);
    return true;
  } catch {
    return false;
  }
}
