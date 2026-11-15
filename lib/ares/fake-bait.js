// ARES fake bait — pure fake-content builders (no I/O, no secrets).
//
// Every body here is provably inert: AWS values are AWS's own published
// example credentials (AKIAIOSFODNN7EXAMPLE /
// wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY — documented by AWS as
// non-functional examples), and every other "secret" is a clearly-fake
// value (wrong checksums, an explicit FAKE marker, or a .example.invalid
// host). Nothing here is a real env value, real key, real path, or real
// user data. Nothing here ever authenticates anything.
//
// Contract (the maze worker imports this — do not change the shape):
//   fakeBaitFor(id) -> { contentType, body }
//   fakeBaitFor(id, { mobile: true }) -> mobile-flavoured variant where
//     one exists (config-json, api-keys, env); other ids ignore the flag
//     and return their standard body. Scoring never branches on UA —
//     only the flavour of the fake content does.
//   BAIT_IDS — every bait id. MOBILE_BAIT_IDS — the mobile-themed third.

export const AWS_EXAMPLE_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
export const AWS_EXAMPLE_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

const FAKE_HOST = 'example.invalid';

function envBody(tag) {
  return [
    '# FAKE .env — NOT REAL — bait for scanners, nothing here works',
    `# ${tag}`,
    'APP_ENV=fake',
    'APP_DEBUG=false',
    'DB_HOST=db.example.invalid',
    'DB_USER=fake_db_user',
    'DB_PASSWORD=FAKE-PASSWORD-NOT-REAL',
    `AWS_ACCESS_KEY_ID=${AWS_EXAMPLE_ACCESS_KEY}`,
    `AWS_SECRET_ACCESS_KEY=${AWS_EXAMPLE_SECRET_KEY}`,
    'AWS_REGION=us-fake-1',
    'STRIPE_SECRET_KEY=sk_fake_NOT_A_REAL_KEY_0000000000000000',
    'JWT_SECRET=FAKE-JWT-SECRET-NOT-REAL',
    '',
  ].join('\n');
}

const BUILDERS = {
  // --- Wave 1: classic scanner bait -------------------------------------
  env: () => ({
    contentType: 'text/plain; charset=utf-8',
    body: envBody('root env'),
  }),
  'git-head': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: 'ref: refs/heads/fake-main\n',
  }),
  'git-config': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '# FAKE git config — NOT A REAL REPO',
      '[core]',
      '\trepositoryformatversion = 0',
      '\tbare = false',
      '[remote "origin"]',
      `\turl = https://git.${FAKE_HOST}/fake/repo.git`,
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      '[branch "fake-main"]',
      '\tremote = origin',
      '\tmerge = refs/heads/fake-main',
      '',
    ].join('\n'),
  }),
  'wp-config': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '<?php',
      '// FAKE wp-config.php — NOT A REAL WORDPRESS INSTALL',
      "define( 'DB_NAME', 'fake_wordpress' );",
      "define( 'DB_USER', 'fake_wp_user' );",
      "define( 'DB_PASSWORD', 'FAKE-PASSWORD-NOT-REAL' );",
      "define( 'DB_HOST', 'db.example.invalid' );",
      "define( 'AUTH_KEY', 'FAKE-SALT-NOT-REAL-000000000000000000000000' );",
      "define( 'SECURE_AUTH_KEY', 'FAKE-SALT-NOT-REAL-111111111111111111111111' );",
      "define( 'WP_DEBUG', false );",
      '',
    ].join('\n'),
  }),
  admin: () => ({
    contentType: 'text/html; charset=utf-8',
    body: [
      '<!doctype html><html><head><title>Fake Admin — Demo Only</title></head>',
      '<body><h1>Admin Login</h1>',
      '<p>FAKE ADMIN PANEL — NOT REAL — bait for scanners.</p>',
      '<form action="#" method="post">',
      '<label>Username <input name="username" value="fake_admin"></label>',
      '<label>Password <input name="password" type="password" value="FAKE-PASSWORD-NOT-REAL"></label>',
      '<button type="submit">Log in</button>',
      '</form></body></html>',
      '',
    ].join('\n'),
  }),
  'aws-credentials': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '# FAKE AWS credentials — AWS published example values, non-functional',
      '[default]',
      `aws_access_key_id = ${AWS_EXAMPLE_ACCESS_KEY}`,
      `aws_secret_access_key = ${AWS_EXAMPLE_SECRET_KEY}`,
      'region = us-fake-1',
      '',
    ].join('\n'),
  }),
  'backup-zip': () => ({
    // Deliberately malformed fake archive: a PK header + a text payload
    // naming itself fake. No real files, no real payload.
    contentType: 'application/zip',
    body: 'PK\x03\x04\x14\x00\x00\x00\x08\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00backup-fake.txtFAKE BACKUP - NOT REAL DATA - NOTHING TO RESTORE',
  }),
  'dump-sql': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '-- FAKE SQL DUMP — NOT A REAL DATABASE — bait for scanners',
      '-- Fake host: db.example.invalid',
      'CREATE TABLE fake_users (id INT, email VARCHAR(255), password_hash VARCHAR(255));',
      "INSERT INTO fake_users VALUES (1, 'fake_admin@example.invalid', '$2y$10$FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1');",
      "INSERT INTO fake_users VALUES (2, 'fake_user@example.invalid', '$2y$10$FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE2');",
      'CREATE TABLE fake_orders (id INT, total_cents INT);',
      'INSERT INTO fake_orders VALUES (1, 0);',
      '',
    ].join('\n'),
  }),
  'id-rsa': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '-----BEGIN FAKE RSA PRIVATE KEY-----',
      'RkFLRS1LRVktTk9ULVJFQUw=',
      'RkFLRS1LRVktTk9ULVJFQUw=',
      'RkFLRS1LRVktTk9ULVJFQUw=',
      '-----END FAKE RSA PRIVATE KEY-----',
      '# base64 above decodes to "FAKE-KEY-NOT-REAL" — not a key at all',
      '',
    ].join('\n'),
  }),
  'ds-store': () => ({
    // .DS_Store files start with "Bud1"; this one is a fake stub.
    contentType: 'application/octet-stream',
    body: 'Bud1\x00\x00\x00\x00FAKE-DS-STORE-NOT-REAL',
  }),
  'api-keys': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE API KEYS — NOT REAL — bait for scanners',
        stripe: 'sk_fake_NOT_A_REAL_KEY_0000000000000000',
        sendgrid: 'SG.FAKEFAKEFAKEFAKEFAKEFAKE.FAKEFAKEFAKEFAKEFAKEFAKEFAKE',
        openai: 'sk-fake-FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE',
        aws_access_key_id: AWS_EXAMPLE_ACCESS_KEY,
        aws_secret_access_key: AWS_EXAMPLE_SECRET_KEY,
      },
      null,
      2,
    ),
  }),
  'config-json': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE CONFIG — NOT REAL — bait for scanners',
        app: 'fake-app',
        db: { host: `db.${FAKE_HOST}`, user: 'fake_db_user', password: 'FAKE-PASSWORD-NOT-REAL' },
        api_base_url: `https://api.${FAKE_HOST}/v1`,
        admin_email: `fake_admin@${FAKE_HOST}`,
      },
      null,
      2,
    ),
  }),
  phpinfo: () => ({
    contentType: 'text/html; charset=utf-8',
    body: [
      '<!doctype html><html><head><title>phpinfo() — FAKE</title></head><body>',
      '<h1>PHP Version 8.9.9-FAKE</h1>',
      '<p>FAKE PHPINFO — NOT A REAL SERVER — bait for scanners.</p>',
      '<table>',
      '<tr><td>System</td><td>FakeOS fake-host 1.0</td></tr>',
      '<tr><td>Server API</td><td>FAKE</td></tr>',
      '<tr><td>Document Root</td><td>/srv/fake-www</td></tr>',
      '<tr><td>Loaded Configuration File</td><td>/srv/fake-www/php-fake.ini</td></tr>',
      '</table></body></html>',
      '',
    ].join('\n'),
  }),
  'svn-entries': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '# FAKE svn entries — NOT A REAL CHECKOUT',
      '12',
      '',
      'dir',
      '0',
      `https://svn.${FAKE_HOST}/fake-repo`,
      `https://svn.${FAKE_HOST}/fake-repo`,
      '',
      'fake-dir',
      'dir',
      '0',
      '0000000000000000000000000000000000000000',
      '',
    ].join('\n'),
  }),

  // --- Wave 2: second-wave server bait -----------------------------------
  'git-logs-head': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '# FAKE git reflog — NOT A REAL REPO',
      '0000000000000000000000000000000000000000 1111111111111111111111111111111111111111 Fake Author <fake@example.invalid> 1790000000 +0000\tcommit (initial): fake initial commit',
      '1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 Fake Author <fake@example.invalid> 1790000001 +0000\tcommit: fake change number one',
      '',
    ].join('\n'),
  }),
  'db-sqlite': () => ({
    // SQLite magic header + a fake text stub. Not a real database file.
    contentType: 'application/x-sqlite3',
    body: 'SQLite format 3\x00FAKE SQLITE DATABASE - NO REAL ROWS - NOTHING TO READ',
  }),
  htpasswd: () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '# FAKE .htpasswd — hashes are fake (wrong checksums), no real passwords',
      'fake_admin:$apr1$FAKEFAKE$FAKEFAKEFAKEFAKEFAKEFAKEFAKEFA1',
      'fake_user:$apr1$FAKEFAKE$FAKEFAKEFAKEFAKEFAKEFAKEFAKEFA2',
      '',
    ].join('\n'),
  }),
  'env-local': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: envBody('local env — fake'),
  }),
  'private-key': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '-----BEGIN FAKE PRIVATE KEY-----',
      'RkFLRS1LRVktTk9ULVJFQUw=',
      'RkFLRS1LRVktTk9ULVJFQUw=',
      'RkFLRS1LRVktTk9ULVJFQUw=',
      '-----END FAKE PRIVATE KEY-----',
      '# base64 above decodes to "FAKE-KEY-NOT-REAL" — not a key at all',
      '',
    ].join('\n'),
  }),

  // --- Wave 2: mobile third ----------------------------------------------
  'mobile-auth': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE MOBILE AUTH — NOT REAL — bait for scanners',
        access_token: 'FAKE-MOBILE-TOKEN-00000000000000000000000000000000',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'FAKE-REFRESH-TOKEN-0000000000000000000000000000',
        user: { id: 'fake-user-0001', email: `fake_user@${FAKE_HOST}` },
      },
      null,
      2,
    ),
  }),
  'mobile-config': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE MOBILE APP CONFIG — NOT REAL — bait for scanners',
        app: 'fake-mobile-app',
        app_id: 'com.example.fakeapp',
        version: '9.9.9-FAKE',
        api_base_url: `https://api.${FAKE_HOST}/mobile/v1`,
        ws_url: `wss://ws.${FAKE_HOST}/fake`,
        features: { chat: false, payments: false, push: false },
        keys: { maps: 'FAKE-MAPS-KEY-NOT-REAL', push: 'FAKE-PUSH-KEY-NOT-REAL' },
      },
      null,
      2,
    ),
  }),
  'mobile-login': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE MOBILE LOGIN — NOT REAL — bait for scanners',
        status: 'ok',
        session: 'FAKE-SESSION-00000000000000000000000000000000',
        device_id: 'fake-device-0001',
        user: { id: 'fake-user-0001', phone: '+00-000-000-0000' },
      },
      null,
      2,
    ),
  }),
  'apk-download': () => ({
    contentType: 'application/vnd.android.package-archive',
    body: [
      '# FAKE APK MANIFEST — NOT A REAL BINARY — bait for scanners',
      'package="com.example.fakeapp"',
      'versionCode="999"',
      'versionName="9.9.9-FAKE"',
      'minSdkVersion="1"',
      'targetSdkVersion="1"',
      'FAKE APK — NO BINARY PAYLOAD — DO NOT INSTALL',
      '',
    ].join('\n'),
  }),
  'ipa-download': () => ({
    contentType: 'application/octet-stream',
    body: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!-- FAKE IPA PLIST — NOT A REAL BINARY — bait for scanners -->',
      '<plist version="1.0"><dict>',
      '<key>CFBundleIdentifier</key><string>com.example.fakeapp</string>',
      '<key>CFBundleShortVersionString</key><string>9.9.9-FAKE</string>',
      '<key>CFBundleVersion</key><string>999</string>',
      '<key>FAKE</key><string>NOT A REAL APP — NO BINARY PAYLOAD</string>',
      '</dict></plist>',
      '',
    ].join('\n'),
  }),
  'releases-apk': () => ({
    contentType: 'text/plain; charset=utf-8',
    body: [
      '# FAKE RELEASE — NOT A REAL BINARY — bait for scanners',
      'fake-app 9.9.9-FAKE (build 999)',
      'package: com.example.fakeapp',
      'sha256: 0000000000000000000000000000000000000000000000000000000000000000',
      'download: https://releases.example.invalid/fake-app-9.9.9-FAKE.apk',
      'FAKE RELEASE NOTES — nothing here installs anything.',
      '',
    ].join('\n'),
  }),
  'sms-send': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE SMS GATEWAY — NOT REAL — bait for scanners',
        message_id: 'FAKE-SMS-000001',
        status: 'queued',
        to: '+00-000-000-0000',
        from: 'FAKE-SENDER',
        body: 'FAKE MESSAGE — NO SMS WAS SENT',
      },
      null,
      2,
    ),
  }),
  'otp-verify': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE OTP GATEWAY — NOT REAL — bait for scanners',
        verified: true,
        otp: '000000',
        session: 'FAKE-OTP-SESSION-0000000000000000000000000000',
        warning: '000000 never verifies a real account',
      },
      null,
      2,
    ),
  }),
  'mobile-admin': () => ({
    contentType: 'text/html; charset=utf-8',
    body: [
      '<!doctype html><html><head><title>Fake Mobile Admin — Demo Only</title></head>',
      '<body><h1>Mobile Admin</h1>',
      '<p>FAKE MOBILE ADMIN PANEL — NOT REAL — bait for scanners.</p>',
      '<form action="#" method="post">',
      '<label>Device ID <input name="device_id" value="fake-device-0001"></label>',
      '<label>Admin PIN <input name="pin" type="password" value="000000"></label>',
      '<button type="submit">Unlock</button>',
      '</form></body></html>',
      '',
    ].join('\n'),
  }),
};

// Mobile-flavoured variants of generic bait: same fake secret shape, but
// dressed as a mobile backend/app instead of a web server. Only the ids
// listed here have one; every other id ignores the mobile flag.
const MOBILE_VARIANTS = {
  'config-json': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE MOBILE APP CONFIG — NOT REAL — bait for scanners',
        app: 'fake-mobile-app',
        app_id: 'com.example.fakeapp',
        version: '9.9.9-FAKE',
        api_base_url: `https://api.${FAKE_HOST}/mobile/v1`,
        db: { host: `db.${FAKE_HOST}`, user: 'fake_db_user', password: 'FAKE-PASSWORD-NOT-REAL' },
        keys: { maps: 'FAKE-MAPS-KEY-NOT-REAL', push: 'FAKE-PUSH-KEY-NOT-REAL' },
      },
      null,
      2,
    ),
  }),
  'api-keys': () => ({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(
      {
        note: 'FAKE MOBILE SDK KEYS — NOT REAL — bait for scanners',
        firebase: 'FAKE-FIREBASE-KEY-NOT-REAL',
        maps_sdk: 'FAKE-MAPS-KEY-NOT-REAL',
        push_sdk: 'FAKE-PUSH-KEY-NOT-REAL',
        aws_access_key_id: AWS_EXAMPLE_ACCESS_KEY,
        aws_secret_access_key: AWS_EXAMPLE_SECRET_KEY,
      },
      null,
      2,
    ),
  }),
  env: () => ({
    contentType: 'text/plain; charset=utf-8',
    body: envBody('mobile backend env — fake'),
  }),
};

export const BAIT_IDS = Object.keys(BUILDERS);

export const MOBILE_BAIT_IDS = [
  'mobile-auth',
  'mobile-config',
  'mobile-login',
  'apk-download',
  'ipa-download',
  'releases-apk',
  'sms-send',
  'otp-verify',
  'mobile-admin',
];

/** Pure helper: does this UA look like a phone? Used only to pick the
 *  flavour of fake content served — never for scoring. */
export function isMobileUserAgent(ua) {
  if (!ua) return false;
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

/**
 * Fake bait content for one bait id.
 * @param {string} id — one of BAIT_IDS
 * @param {{ mobile?: boolean }} [opts] — mobile:true serves the
 *   mobile-flavoured variant where one exists.
 * @returns {{ contentType: string, body: string }}
 */
export function fakeBaitFor(id, opts = {}) {
  if (opts.mobile && MOBILE_VARIANTS[id]) return MOBILE_VARIANTS[id]();
  const build = BUILDERS[id];
  if (!build) throw new Error(`unknown bait id: ${id}`);
  return build();
}
