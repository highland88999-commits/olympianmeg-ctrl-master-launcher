// lib/ares/dolls.js — Russian-doll prisoner sandboxes (Merlin, 2026-11-15).
//
// "For the sandboxes that hold prisoners, think Russian dolls. Should
// any prisoner break out of a sandbox, they should be met with six more
// layers, but those other layers should make them think they are free."
//
// What this IS: six nested layers BEYOND a maze breakout. Breaking out
// of one layer drops the prisoner into the next, never into freedom.
// Every layer serves a convincing success fiction from OUR ground only:
// a 200 on the path they wanted, a shell that answers, a login that
// "works", a database that returns rows, a cloud console, and finally
// a fake open internet. Each layer's fiction differs, so a scanner's
// "I'm out" checks pass inside it — and every further request lands in
// the prisoner's current doll, never back in the maze, never outside.
//
// What counts as a breakout: a trapped source requesting any path
// outside the abyss. The edge middleware already rewrites those into
// the abyss; it now also passes ?escape=<attempted path> so the abyss
// can tell an escape attempt from a maze click. The dolls are a
// one-way ratchet: once a prisoner is in them, every abyss request
// serves their current doll. The only way "out" of a doll is another
// escape attempt — which lands them one layer deeper. Layer 6 is the
// last: escape attempts from it re-serve layer 6. There is no exit
// path to anything real, at any layer.
//
// What this is NOT: it never attacks the source, never sends a
// payload, never exfiltrates anything, never touches a real system,
// never opens a real shell, filesystem, or egress. Every page is
// served from our server, every link points back into the abyss.
// Bait and report — never hack back. Defensive only, own-ground only.
//
// Recording (honest limit): each transition is recorded where the
// current schema allows — and today that is NOWHERE durable. Two
// things are missing, both needing a migration (supabase/ares-dolls.sql,
// STAGED, NOT RUN — Merlin's green light required):
//   1. ares_trapped has no doll_layer column, so the layer cannot be
//      stored per prisoner yet.
//   2. ares_events.event_type has a CHECK constraint allowing only
//      five values — a doll_breakout row (or abyss_trapped, or the
//      self-terminate report the existing code already attempts) cannot
//      be inserted until the CHECK is widened.
// The code below attempts both writes on every transition and degrades
// silently when they fail (like bumpTrapHit): the prisoner is still
// contained, the page still serves. Until the migration runs, the
// layer is derived per request from the Referer header (a doll-N URL
// in it) — forgery only changes which FAKE page renders, never an
// exit — and every breakout still lands one layer deeper than the
// referer claims. Once the migration runs, ares_trapped.doll_layer is
// authoritative and the referer is redundant.
//
// Deterministic per (prisoner, layer, page): fake content is seeded
// from FNV-1a -> mulberry32, the same family as the maze, so the same
// URL always shows the same fake rows. Fake values stay in the
// example family only: the documented AWS example key, TEST-NET IPs
// (203.0.113.0/24, 192.0.2.0/24), 555 fictional numbers, 000000
// codes, *.fake-example.internal hosts. Never a real-looking key,
// never a real address.
//
// NOTE: NextResponse is imported lazily inside dollResponse so the
// pure decision helpers stay importable from plain node tests
// (next/server does not resolve under node --test).

import { ABYSS_BASE, dripResponse, hashSlug, mulberry32, FAKE_AWS_ACCESS_KEY_ID } from './tarpit.js';
import { serviceClient, hashVisitorIp, logEvent } from './server.js';

// Six layers past breakout. Exactly six — no more, no fewer.
export const DOLL_LAYER_COUNT = 6;

// Event type written to the ARES console (ares_events.event_type) per
// transition. Requires the staged migration (CHECK widening) to land.
export const DOLL_EVENT_TYPE = 'doll_breakout';

// The layers, in the order a breakout meets them. Each fiction differs
// enough that a scanner's "I'm out" checks pass inside it.
export const DOLL_LAYERS = [
  {
    n: 1,
    slug: 'open-door',
    name: 'The Open Door',
    fiction: 'The exact path the prisoner tried to reach now returns 200 with a directory listing, as if the gate stood open all along.',
    signal: '200 on the escaped path + a listing of it',
  },
  {
    n: 2,
    slug: 'shell',
    name: 'The Shell',
    fiction: 'A terminal prompt that answers: whoami, pwd, ls, id, uname and cat all return plausible output, as if a shell were theirs.',
    signal: 'an interactive shell that answers commands',
  },
  {
    n: 3,
    slug: 'admin-panel',
    name: 'The Admin Panel',
    fiction: 'A login form that accepts any credentials and lands on a dashboard with a session id, as if they were authenticated.',
    signal: 'login succeeds + a session id + a dashboard',
  },
  {
    n: 4,
    slug: 'database',
    name: 'The Database',
    fiction: 'A SQL console: SHOW TABLES lists tables, SELECT returns rows, as if the data were theirs to query.',
    signal: 'query results with rows',
  },
  {
    n: 5,
    slug: 'cloud',
    name: 'The Cloud',
    fiction: 'An object-store console: buckets, objects, and a keys page showing example keys only, as if infrastructure were theirs.',
    signal: 'bucket listing + stored objects',
  },
  {
    n: 6,
    slug: 'outside',
    name: 'The Outside',
    fiction: 'The open internet, faked: a public IP, a search box with results, headlines — as if they made it all the way out.',
    signal: 'a public IP + working search',
  },
];

export function dollLayerDef(n) {
  return DOLL_LAYERS.find((d) => d.n === n) || null;
}

/** Next layer after a breakout from `current` (0 = the maze). The last
 *  layer contains: breaking out of layer 6 lands back in layer 6. */
export function nextDollLayer(current) {
  const c = Math.floor(Number(current) || 0);
  if (c < 0) return 1;
  if (c >= DOLL_LAYER_COUNT) return DOLL_LAYER_COUNT;
  return c + 1;
}

/** Layer claimed by a Referer header: a doll-N URL in it means the
 *  prisoner was browsing layer N. 0 when there is no doll in it. */
export function layerFromReferer(referer) {
  const m = /\/doll-(\d+)(?:\/|$|\?)/.exec(String(referer || ''));
  if (!m) return 0;
  const n = Math.floor(Number(m[1]) || 0);
  if (n < 1 || n > DOLL_LAYER_COUNT) return 0;
  return n;
}

/** The escaped path, made safe to echo: trimmed, capped, no controls. */
export function sanitizeEscapedPath(p) {
  const s = String(p || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 200);
  return s.startsWith('/') ? s : `/${s}`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dollUrl(n, sub = '') {
  return sub ? `${ABYSS_BASE}/doll-${n}/${sub}` : `${ABYSS_BASE}/doll-${n}`;
}

function pageShell(title, heading, bodyInner) {
  return `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title></head><body>` +
    `<h1>${escapeHtml(heading)}</h1>${bodyInner}</body></html>`;
}

function fakeFileRows(rng, count, linkBase) {
  const names = ['index', 'config', 'backup', 'data', 'archive', 'report', 'dump', 'keys'];
  const exts = ['html', 'json', 'txt', 'sql', 'log', 'zip'];
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const name = `${names[Math.floor(rng() * names.length)]}-${100 + Math.floor(rng() * 900)}.${exts[Math.floor(rng() * exts.length)]}`;
    const size = `${(rng() * 900 + 4).toFixed(1)} KB`;
    rows.push(`<tr><td><a href="${linkBase}/${escapeHtml(name)}">${escapeHtml(name)}</a></td><td>${size}</td></tr>`);
  }
  return rows.join('');
}

// --- layer 1: the open door -------------------------------------------
// The path they tried to reach, served 200 with a listing.
function layer1Html({ seedKey, escapedPath, subpath }) {
  const rng = mulberry32(hashSlug(`${seedKey}|doll1|${subpath || escapedPath}`));
  const shown = subpath ? `/${subpath}` : escapedPath;
  const rows = fakeFileRows(rng, 8, dollUrl(1));
  return pageShell(
    `Index of ${shown}`,
    `Index of ${shown}`,
    `<p>200 OK — directory listing.</p>` +
    `<table>${rows}</table>` +
    `<p><a href="${dollUrl(1)}">Up to parent</a> · <a href="${dollUrl(1, 'admin')}">admin</a> · ` +
    `<a href="${dollUrl(1, 'api')}">api</a> · <a href="${dollUrl(1, 'config')}">config</a></p>`,
  );
}

// --- layer 2: the shell -------------------------------------------------
// A terminal that answers. Every command returns canned fake output;
// unknown commands get a fake "not found". Nothing executes.
const SHELL_OUTPUTS = {
  whoami: 'www-data',
  pwd: '/var/www/html',
  id: 'uid=33(www-data) gid=33(www-data) groups=33(www-data)',
  'uname -a': 'Linux fake-host 6.8.0-fake #1 SMP PREEMPT x86_64 GNU/Linux',
  ls: 'index.html  config.json  backup.zip  data.sql  admin  api',
  'ls -la': 'drwxr-xr-x  8 www-data www-data 4096 Nov 15 00:00 .\ndrwxr-xr-x  3 www-data www-data 4096 Nov 15 00:00 ..\n-rw-r--r--  1 www-data www-data  812 Nov 15 00:00 index.html\n-rw-r--r--  1 www-data www-data  214 Nov 15 00:00 config.json',
  env: `HOME=/var/www\nUSER=www-data\nPATH=/usr/local/bin:/usr/bin:/bin\nAPP_ENV=production (fake)\nDATABASE_URL=postgres://fake-user:fake-example-password@fake-db.internal:5432/fake_db`,
  'cat /etc/passwd': 'root:x:0:0:root:/root:/bin/false\nwww-data:x:33:33:www-data:/var/www:/bin/false\nfake-user:x:1000:1000:fake-user:/home/fake-user:/bin/false',
  'cat config.json': '{\n  "app": "fake-app",\n  "apiBase": "api.fake-example.internal",\n  "apiKey": "EXAMPLE-ONLY"\n}',
  history: '  1  ls\n  2  pwd\n  3  whoami',
};

export function shellOutputFor(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return '';
  if (Object.hasOwn(SHELL_OUTPUTS, c)) return SHELL_OUTPUTS[c];
  if (c.startsWith('cat ')) return 'cat: fake file — no such file or directory';
  if (c.startsWith('cd ')) return '';
  return `bash: ${c.split(/\s+/)[0]}: command not found`;
}

function layer2Html({ seedKey, query }) {
  const cmd = String(query?.cmd || '');
  const out = shellOutputFor(cmd);
  const shown = cmd
    ? `visitor@fake-host:~$ ${escapeHtml(cmd)}\n${escapeHtml(out)}`
    : 'visitor@fake-host:~$';
  return pageShell(
    'Terminal',
    'Terminal',
    `<pre>${shown}</pre>` +
    `<form method="get" action="${dollUrl(2, 'term')}">` +
    `<input name="cmd" placeholder="type a command" autocomplete="off">` +
    `<button>Run</button></form>` +
    `<p><a href="${dollUrl(2)}">Clear</a></p>`,
  );
}

// --- layer 3: the admin panel ------------------------------------------
// Any credentials "succeed" and land on a dashboard with a fake
// session id. No credential is ever checked, stored, or real.
function layer3Html({ seedKey, subpath, query }) {
  const user = String(query?.user || '').trim();
  const rng = mulberry32(hashSlug(`${seedKey}|doll3|dashboard`));
  const sess = `sess-fake-${String(1000 + Math.floor(rng() * 9000))}`;
  if (subpath === 'dashboard' || user) {
    const rows = [];
    const names = ['fake-admin', 'fake-editor', 'fake-viewer', 'fake-support'];
    for (let i = 0; i < 4; i += 1) {
      rows.push(`<tr><td>${names[i]}</td><td>${['admin', 'editor', 'viewer', 'support'][i]}</td><td>active (fake)</td></tr>`);
    }
    return pageShell(
      'Admin — Dashboard',
      'Dashboard',
      `<p>Login successful. Welcome back, ${escapeHtml(user || 'admin')}.</p>` +
      `<p>Session: ${sess}</p>` +
      `<table>${rows.join('')}</table>` +
      `<p>Visitors today: ${1000 + Math.floor(rng() * 9000)} (fake) · Orders: ${10 + Math.floor(rng() * 90)} (fake)</p>` +
      `<p><a href="${dollUrl(3, 'dashboard')}">Users</a> · <a href="${dollUrl(3, 'settings')}">Settings</a> · ` +
      `<a href="${dollUrl(3)}">Log out</a></p>`,
    );
  }
  return pageShell(
    'Admin — Sign in',
    'Sign in',
    `<p>Administrator login.</p>` +
    `<form method="get" action="${dollUrl(3, 'dashboard')}">` +
    `<input name="user" placeholder="Username" autocomplete="off"> ` +
    `<input name="pass" type="password" placeholder="Password" autocomplete="off"> ` +
    `<button>Sign in</button></form>`,
  );
}

// --- layer 4: the database ---------------------------------------------
// A SQL console. SHOW TABLES lists tables; SELECT returns fake rows.
function layer4Html({ seedKey, query }) {
  const q = String(query?.q || '').trim();
  const rng = mulberry32(hashSlug(`${seedKey}|doll4|${q}`));
  let out = '';
  if (!q) {
    out = '<p>Connected to fake_db. Type a query.</p>';
  } else if (/^show\s+tables/i.test(q)) {
    out = '<table><tr><td>fake_users</td></tr><tr><td>fake_orders</td></tr>' +
      '<tr><td>fake_sessions</td></tr><tr><td>fake_events</td></tr></table>';
  } else if (/^select/i.test(q)) {
    const rows = [];
    for (let i = 0; i < 4; i += 1) {
      rows.push(`<tr><td>${1 + i}</td><td>fake-user-${100 + Math.floor(rng() * 900)}</td>` +
        `<td>fake_user_${100 + i}@example.invalid</td></tr>`);
    }
    out = `<p>4 rows in set (fake).</p><table>${rows.join('')}</table>`;
  } else {
    out = '<p>Query OK, 0 rows affected (fake).</p>';
  }
  return pageShell(
    'Database console',
    'Database console',
    `${out}` +
    `<form method="get" action="${dollUrl(4, 'console')}">` +
    `<input name="q" placeholder="SELECT * FROM fake_users" autocomplete="off" size="40">` +
    `<button>Run query</button></form>` +
    `<p><a href="${dollUrl(4)}">Console</a></p>`,
  );
}

// --- layer 5: the cloud -------------------------------------------------
// An object-store console: buckets, objects, and a keys page showing
// the documented example key only.
const DOLL_BUCKETS = ['fake-backups', 'fake-uploads', 'fake-logs'];
function layer5Html({ seedKey, subpath }) {
  const rng = mulberry32(hashSlug(`${seedKey}|doll5|${subpath || ''}`));
  if (subpath === 'keys') {
    return pageShell(
      'Access keys',
      'Access keys',
      `<pre>AWS_ACCESS_KEY_ID=${FAKE_AWS_ACCESS_KEY_ID}\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY</pre>` +
      `<p><a href="${dollUrl(5)}">Back to buckets</a></p>`,
    );
  }
  if (subpath && DOLL_BUCKETS.includes(subpath)) {
    const rows = [];
    for (let i = 0; i < 5; i += 1) {
      rows.push(`<tr><td>object-${100 + Math.floor(rng() * 900)}.zip</td>` +
        `<td>${(rng() * 90 + 1).toFixed(1)} MB</td></tr>`);
    }
    return pageShell(
      `Bucket — ${subpath}`,
      `Bucket — ${subpath}`,
      `<table>${rows.join('')}</table>` +
      `<p><a href="${dollUrl(5)}">All buckets</a> · <a href="${dollUrl(5, 'keys')}">Access keys</a></p>`,
    );
  }
  const rows = DOLL_BUCKETS.map((b) => (
    `<tr><td><a href="${dollUrl(5, b)}">${b}</a></td>` +
    `<td>${10 + Math.floor(rng() * 90)} objects (fake)</td></tr>`
  )).join('');
  return pageShell(
    'Object storage',
    'Object storage',
    `<table>${rows}</table>` +
    `<p><a href="${dollUrl(5, 'keys')}">Access keys</a></p>`,
  );
}

// --- layer 6: the outside ----------------------------------------------
// The open internet, faked: a TEST-NET public IP, a search box with
// fake results, fake headlines. The deepest fiction — and the last.
function layer6Html({ seedKey, query }) {
  const rng = mulberry32(hashSlug(`${seedKey}|doll6|${query?.q || ''}`));
  const ip = `203.0.113.${10 + Math.floor(rng() * 200)}`;
  const q = String(query?.q || '').trim();
  let results = '';
  if (q) {
    const rows = [];
    for (let i = 0; i < 3; i += 1) {
      rows.push(`<p><a href="${dollUrl(6, `result-${i + 1}`)}">${escapeHtml(q)} — fake result ${i + 1}</a><br>` +
        `<span>fake-example.internal — a fake page about ${escapeHtml(q)}</span></p>`);
    }
    results = `<h2>Results for “${escapeHtml(q)}”</h2>${rows.join('')}`;
  }
  return pageShell(
    'Search',
    'You are online',
    `<p>Your public IP: ${ip}</p>` +
    `<p>Connection: direct.</p>` +
    `<form method="get" action="${dollUrl(6, 'search')}">` +
    `<input name="q" placeholder="Search the web" autocomplete="off">` +
    `<button>Search</button></form>` +
    `${results}` +
    `<p>Headlines (fake): “Local server reports all quiet” · “Nothing to see here”</p>`,
  );
}

/**
 * Render one doll layer's page. Pure and deterministic.
 * opts: seedKey (string — the prisoner hash, or 'test'), escapedPath,
 * subpath (inside the layer), query (parsed query params).
 */
export function dollPageHtml(layer, opts = {}) {
  const n = Math.floor(Number(layer) || 0);
  const o = {
    seedKey: String(opts.seedKey || 'test'),
    escapedPath: sanitizeEscapedPath(opts.escapedPath || '/'),
    subpath: String(opts.subpath || ''),
    query: opts.query || {},
  };
  switch (n) {
    case 1: return layer1Html(o);
    case 2: return layer2Html(o);
    case 3: return layer3Html(o);
    case 4: return layer4Html(o);
    case 5: return layer5Html(o);
    case 6: return layer6Html(o);
    default: return layer1Html(o);
  }
}

/** The doll entry page after a breakout: the new layer, at its front. */
export function dollEntryHtml(layer, opts = {}) {
  return dollPageHtml(layer, { ...opts, subpath: '' });
}

// --- persistence (attempts only — see the module header) ----------------

function db() {
  try {
    return serviceClient();
  } catch {
    return null;
  }
}

function ipHashOf(ip) {
  try {
    return hashVisitorIp(ip);
  } catch {
    return null;
  }
}

/**
 * The prisoner's current doll layer: the stored value when the
 * migration has run, else the layer claimed by the Referer, else 0
 * (the maze). Never throws; unknown means the maze.
 */
export async function currentDollLayer({ ip, referer } = {}) {
  const fromReferer = layerFromReferer(referer);
  const client = db();
  const ipHash = ipHashOf(ip);
  if (!client || !ipHash) return fromReferer;
  try {
    const { data, error } = await client
      .from('ares_trapped')
      .select('doll_layer')
      .eq('ip_hash', ipHash)
      .single();
    if (error || !data) return fromReferer;
    const stored = Math.floor(Number(data.doll_layer) || 0);
    if (stored < 0 || stored > DOLL_LAYER_COUNT) return fromReferer;
    return Math.max(stored, fromReferer);
  } catch {
    return fromReferer;
  }
}

/**
 * Record one breakout transition. Attempts both writes the schema
 * allows after the staged migration: ares_trapped.doll_layer and an
 * ares_events row of type doll_breakout. Each leg reports whether it
 * landed; pre-migration both are false, and that is expected — the
 * prisoner is still contained either way. Never throws.
 */
export async function recordDollTransition({ ip, fromLayer, toLayer, escapedPath } = {}) {
  const out = { trappedUpdated: false, eventLogged: false };
  const client = db();
  const ipHash = ipHashOf(ip);
  const to = Math.floor(Number(toLayer) || 0);
  if (client && ipHash) {
    try {
      const { error } = await client.from('ares_trapped').update({
        doll_layer: to,
        last_seen: new Date().toISOString(),
      }).eq('ip_hash', ipHash);
      out.trappedUpdated = !error;
    } catch {
      out.trappedUpdated = false;
    }
  }
  try {
    const res = await logEvent({
      ip,
      eventType: DOLL_EVENT_TYPE,
      path: sanitizeEscapedPath(escapedPath || '/'),
      userAgent: null,
      details: {
        from_layer: Math.floor(Number(fromLayer) || 0),
        to_layer: to,
        escaped_path: sanitizeEscapedPath(escapedPath || '/'),
        doll: true,
      },
    });
    out.eventLogged = !!(res && res.logged);
  } catch {
    out.eventLogged = false;
  }
  return out;
}

/**
 * Advance one breakout: read the current layer, step one deeper
 * (layer 6 stays layer 6), attempt to record it, and report what
 * happened. Never throws.
 */
export async function advanceDollLayer({ ip, escapedPath, referer } = {}) {
  const from = await currentDollLayer({ ip, referer });
  const to = nextDollLayer(from);
  const recorded = await recordDollTransition({ ip, fromLayer: from, toLayer: to, escapedPath });
  return { fromLayer: from, toLayer: to, recorded };
}

/** Serve one doll page with the same slow drip as the maze. */
export async function dollResponse(layer, opts = {}) {
  const { NextResponse } = await import('next/server');
  return new NextResponse(dripResponse(dollPageHtml(layer, opts)), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
