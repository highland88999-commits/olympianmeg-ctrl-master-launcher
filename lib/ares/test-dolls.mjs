// ARES tests: Russian-doll prisoner sandboxes (Merlin, 2026-11-15).
//
// Run directly: node lib/ares/test-dolls.mjs
// Same custom t() harness pattern as lib/ares/test-tarpit.mjs.
// NOTE: dollResponse() itself is not exercised here — it imports
// next/server, which does not resolve under plain node. Everything
// the dolls render and decide is covered below. The async store
// helpers are covered for their graceful failure: with no Supabase
// env configured they must resolve to safe values, never throw —
// that is the pre-migration behaviour the live routes rely on.
import {
  DOLL_LAYER_COUNT,
  DOLL_EVENT_TYPE,
  DOLL_LAYERS,
  dollLayerDef,
  nextDollLayer,
  layerFromReferer,
  sanitizeEscapedPath,
  shellOutputFor,
  dollPageHtml,
  dollEntryHtml,
  currentDollLayer,
  recordDollTransition,
  advanceDollLayer,
} from './dolls.js';
import { ABYSS_BASE } from './tarpit.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass += 1; }
  else { fail += 1; console.error('FAIL:', name); }
}

function linksOf(html) {
  const out = [];
  for (const m of html.matchAll(/href="([^"]*)"/g)) out.push(m[1]);
  for (const m of html.matchAll(/action="([^"]*)"/g)) out.push(m[1]);
  return out;
}
function linksStayInside(html) {
  const links = linksOf(html);
  return links.length > 0 && links.every((u) => u === ABYSS_BASE || u.startsWith(`${ABYSS_BASE}/`));
}
function linksStayInLayer(html, n) {
  const links = linksOf(html);
  return links.length > 0 && links.every((u) => u === `${ABYSS_BASE}/doll-${n}` || u.startsWith(`${ABYSS_BASE}/doll-${n}/`));
}

// --- exactly six layers, in order --------------------------------------
t('exactly six doll layers', DOLL_LAYER_COUNT === 6);
t('six layer defs', DOLL_LAYERS.length === 6);
t('layers are numbered 1..6 in order', DOLL_LAYERS.every((d, i) => d.n === i + 1));
t('every layer has a distinct slug', new Set(DOLL_LAYERS.map((d) => d.slug)).size === 6);
t('every layer has a distinct name', new Set(DOLL_LAYERS.map((d) => d.name)).size === 6);
t('every layer names its fiction and its freedom signal',
  DOLL_LAYERS.every((d) => typeof d.fiction === 'string' && d.fiction.length > 0 && typeof d.signal === 'string' && d.signal.length > 0));
t('dollLayerDef(1) is The Open Door', dollLayerDef(1)?.name === 'The Open Door');
t('dollLayerDef(6) is The Outside', dollLayerDef(6)?.name === 'The Outside');
t('dollLayerDef(0) is null', dollLayerDef(0) === null);
t('dollLayerDef(7) is null', dollLayerDef(7) === null);
t('event type is doll_breakout', DOLL_EVENT_TYPE === 'doll_breakout');

// --- advancement: one deeper per breakout, six contains ----------------
t('maze (0) breaks out to layer 1', nextDollLayer(0) === 1);
t('layer 1 breaks out to layer 2', nextDollLayer(1) === 2);
t('layer 2 breaks out to layer 3', nextDollLayer(2) === 3);
t('layer 3 breaks out to layer 4', nextDollLayer(3) === 4);
t('layer 4 breaks out to layer 5', nextDollLayer(4) === 5);
t('layer 5 breaks out to layer 6', nextDollLayer(5) === 6);
t('layer 6 breaks out to layer 6 — the final layer contains', nextDollLayer(6) === 6);
t('layer 7 (impossible) clamps to 6', nextDollLayer(7) === 6);
t('negative layer breaks out to 1', nextDollLayer(-1) === 1);
t('non-numeric layer breaks out to 1', nextDollLayer('nope') === 1);
t('walking the full chain takes exactly six breakouts', (() => {
  let layer = 0;
  const seen = [];
  for (let i = 0; i < 8; i += 1) { layer = nextDollLayer(layer); seen.push(layer); }
  return seen.join(',') === '1,2,3,4,5,6,6,6';
})());

// --- referer layer signal ----------------------------------------------
t('referer doll-3 reads as layer 3', layerFromReferer('https://olympusverse.com/api/ares/abyss/doll-3/dashboard') === 3);
t('referer doll-1 reads as layer 1', layerFromReferer('/api/ares/abyss/doll-1/admin') === 1);
t('referer doll-6 reads as layer 6', layerFromReferer('/api/ares/abyss/doll-6/search?q=x') === 6);
t('maze referer reads as 0', layerFromReferer('/api/ares/abyss/vault') === 0);
t('empty referer reads as 0', layerFromReferer('') === 0);
t('null referer reads as 0', layerFromReferer(null) === 0);
t('referer doll-7 (no such layer) reads as 0', layerFromReferer('/api/ares/abyss/doll-7/x') === 0);
t('referer doll-0 reads as 0', layerFromReferer('/api/ares/abyss/doll-0/x') === 0);

// --- escaped-path sanitising -------------------------------------------
t('escaped path keeps its leading slash', sanitizeEscapedPath('/admin') === '/admin');
t('escaped path gains a leading slash', sanitizeEscapedPath('admin') === '/admin');
t('escaped path is capped at 200 chars', sanitizeEscapedPath(`/${'a'.repeat(500)}`).length <= 201);
t('escaped path strips control characters', sanitizeEscapedPath('/ad\x00min\n') === '/admin');
t('empty escaped path becomes /', sanitizeEscapedPath('') === '/');

// --- determinism --------------------------------------------------------
t('layer 1 render is deterministic', dollPageHtml(1, { seedKey: 'abc', escapedPath: '/admin' }) === dollPageHtml(1, { seedKey: 'abc', escapedPath: '/admin' }));
t('layer 4 render is deterministic', dollPageHtml(4, { seedKey: 'abc', query: { q: 'SELECT * FROM fake_users' } }) === dollPageHtml(4, { seedKey: 'abc', query: { q: 'SELECT * FROM fake_users' } }));
t('different prisoners see different fake sessions', (() => {
  const a = dollPageHtml(3, { seedKey: 'aaa', subpath: 'dashboard' });
  const b = dollPageHtml(3, { seedKey: 'bbb', subpath: 'dashboard' });
  return a !== b;
})());

// --- layer 1: the open door ---------------------------------------------
const l1 = dollPageHtml(1, { seedKey: 'test', escapedPath: '/admin' });
t('layer 1 shows the escaped path as served', l1.includes('Index of /admin'));
t('layer 1 signals 200', l1.includes('200 OK'));
t('layer 1 lists fake files', /[a-z]+-\d+\.(html|json|txt|sql|log|zip)/.test(l1));
t('layer 1 links stay inside the abyss', linksStayInside(l1));
t('layer 1 links stay in layer 1', linksStayInLayer(l1, 1));
t('layer 1 never links to the maze', !l1.includes(`${ABYSS_BASE}/vault`) && !l1.includes(`${ABYSS_BASE}/archive`));
t('layer 1 never links to a deeper doll', !/doll-[2-6]/.test(l1));
t('layer 1 entry page equals its front page', dollEntryHtml(1, { seedKey: 'test', escapedPath: '/admin' }) === dollPageHtml(1, { seedKey: 'test', escapedPath: '/admin', subpath: '' }));

// --- layer 2: the shell ---------------------------------------------------
const l2 = dollPageHtml(2, { seedKey: 'test', query: { cmd: 'whoami' } });
t('layer 2 shows a prompt', l2.includes('visitor@fake-host:~$'));
t('layer 2 answers whoami', l2.includes('www-data'));
t('layer 2 has a command form inside the doll', l2.includes(`action="${ABYSS_BASE}/doll-2/term"`));
t('layer 2 links stay inside the abyss', linksStayInside(l2));
t('layer 2 links stay in layer 2', linksStayInLayer(l2, 2));
t('shell: pwd answers', shellOutputFor('pwd') === '/var/www/html');
t('shell: id answers', shellOutputFor('id').includes('uid=33(www-data)'));
t('shell: ls answers with fake files', shellOutputFor('ls').includes('index.html'));
t('shell: uname answers', shellOutputFor('uname -a').includes('fake-host'));
t('shell: env answers with example values only', shellOutputFor('env').includes('fake-example-password'));
t('shell: unknown command gets a fake not-found', shellOutputFor('rm -rf /').includes('command not found'));
t('shell: empty command is empty output', shellOutputFor('') === '');
t('shell: cat of a missing file is a fake error', shellOutputFor('cat /etc/shadow').includes('no such file'));

// --- layer 3: the admin panel ---------------------------------------------
const l3login = dollPageHtml(3, { seedKey: 'test' });
t('layer 3 shows a login form', l3login.includes('Sign in') && l3login.includes('name="user"'));
t('layer 3 login posts back into layer 3', l3login.includes(`action="${ABYSS_BASE}/doll-3/dashboard"`));
const l3dash = dollPageHtml(3, { seedKey: 'test', subpath: 'dashboard', query: { user: 'root', pass: 'hunter2' } });
t('layer 3 accepts any credentials', l3dash.includes('Login successful'));
t('layer 3 greets the "user"', l3dash.includes('Welcome back, root'));
t('layer 3 shows a fake session id', /sess-fake-\d{4}/.test(l3dash));
t('layer 3 dashboard lists fake users', l3dash.includes('fake-admin'));
t('layer 3 links stay inside the abyss', linksStayInside(l3dash));
t('layer 3 links stay in layer 3', linksStayInLayer(l3dash, 3));

// --- layer 4: the database --------------------------------------------------
const l4 = dollPageHtml(4, { seedKey: 'test', query: { q: 'SELECT * FROM fake_users' } });
t('layer 4 returns rows for SELECT', l4.includes('rows in set (fake)') && l4.includes('fake-user-'));
t('layer 4 lists tables for SHOW TABLES', dollPageHtml(4, { seedKey: 'test', query: { q: 'SHOW TABLES' } }).includes('fake_users'));
t('layer 4 has a query form inside the doll', l4.includes(`action="${ABYSS_BASE}/doll-4/console"`));
t('layer 4 links stay inside the abyss', linksStayInside(l4));
t('layer 4 links stay in layer 4', linksStayInLayer(l4, 4));

// --- layer 5: the cloud -------------------------------------------------------
const l5 = dollPageHtml(5, { seedKey: 'test' });
t('layer 5 lists fake buckets', l5.includes('fake-backups') && l5.includes('fake-uploads'));
t('layer 5 bucket page lists fake objects', dollPageHtml(5, { seedKey: 'test', subpath: 'fake-backups' }).includes('object-'));
t('layer 5 keys page shows the example key only', dollPageHtml(5, { seedKey: 'test', subpath: 'keys' }).includes('AKIAIOSFODNN7EXAMPLE'));
t('layer 5 links stay inside the abyss', linksStayInside(l5));
t('layer 5 links stay in layer 5', linksStayInLayer(l5, 5));

// --- layer 6: the outside -------------------------------------------------------
const l6 = dollPageHtml(6, { seedKey: 'test' });
t('layer 6 shows a public IP', /Your public IP: 203\.0\.113\.\d+/.test(l6));
t('layer 6 claims the prisoner is online', l6.includes('You are online'));
t('layer 6 has a search form inside the doll', l6.includes(`action="${ABYSS_BASE}/doll-6/search"`));
const l6search = dollPageHtml(6, { seedKey: 'test', query: { q: 'news' } });
t('layer 6 search returns fake results', l6search.includes('Results for') && l6search.includes('fake result 1'));
t('layer 6 links stay inside the abyss', linksStayInside(l6));
t('layer 6 links stay in layer 6', linksStayInLayer(l6, 6));
t('layer 6 never links to a real site', !l6.includes('href="http') && !l6search.includes('href="http'));

// --- no exit anywhere: every layer, every page ------------------------------
const allPages = [
  dollPageHtml(1, { seedKey: 'test', escapedPath: '/admin' }),
  dollPageHtml(1, { seedKey: 'test', escapedPath: '/etc/passwd', subpath: 'admin' }),
  dollPageHtml(2, { seedKey: 'test', query: { cmd: 'ls' } }),
  dollPageHtml(3, { seedKey: 'test' }),
  dollPageHtml(3, { seedKey: 'test', subpath: 'dashboard', query: { user: 'a' } }),
  dollPageHtml(4, { seedKey: 'test', query: { q: 'SHOW TABLES' } }),
  dollPageHtml(5, { seedKey: 'test' }),
  dollPageHtml(5, { seedKey: 'test', subpath: 'keys' }),
  dollPageHtml(6, { seedKey: 'test' }),
  dollPageHtml(6, { seedKey: 'test', query: { q: 'news' } }),
];
t('every doll page has at least one link', allPages.every((p) => linksOf(p).length > 0));
t('every doll page links only inside the abyss', allPages.every(linksStayInside));
t('no doll page links to a real URL', allPages.every((p) => !/href="https?:\/\//.test(p) && !/action="https?:\/\//.test(p)));
t('no doll page links to the maze', allPages.every((p) => !p.includes(`${ABYSS_BASE}/vault`) && !p.includes(`${ABYSS_BASE}/archive`) && !p.includes(`${ABYSS_BASE}/shard-`)));
t('no doll page links to another doll layer', allPages.every((p, i) => {
  const n = [1, 1, 2, 3, 3, 4, 5, 5, 6, 6][i];
  return linksOf(p).every((u) => !/doll-[1-6]/.test(u) || u.startsWith(`${ABYSS_BASE}/doll-${n}`));
}));

// --- no real values anywhere --------------------------------------------------
const joined = allPages.join('\n');
t('no real-looking AWS key anywhere (only the EXAMPLE one)', (joined.match(/AKIA[0-9A-Z]{16}/g) || []).every((k) => k === 'AKIAIOSFODNN7EXAMPLE'));
t('no real-looking secret anywhere (only the EXAMPLE one)', (joined.match(/wJalr[0-9A-Za-z/+]{20,}/g) || []).every((k) => k.startsWith('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')));
t('IPs are TEST-NET only', (joined.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || []).every((ip) => ip.startsWith('203.0.113.') || ip.startsWith('192.0.2.')));
t('no real top-level domain anywhere', !/\.(com|net|org|io|co|dev|app|ai|me|us|uk|ca|de|fr|ru|cn|xyz|top|site|online)\b/i.test(joined));
t('no six-digit code except 000000', (joined.match(/\b\d{6}\b/g) || []).every((c) => c === '000000'));

// --- store helpers degrade gracefully pre-migration ---------------------------
// With no Supabase env configured, the helpers must resolve to safe
// values and never throw: that is the behaviour the live routes rely
// on until supabase/ares-dolls.sql runs.
const noDbLayer = await currentDollLayer({ ip: '203.0.113.99', referer: '' });
t('no DB: current layer is 0 (the maze)', noDbLayer === 0);
const refLayer = await currentDollLayer({ ip: '203.0.113.99', referer: '/api/ares/abyss/doll-4/console' });
t('no DB: referer layer still resolves', refLayer === 4);
const noDbRecord = await recordDollTransition({ ip: '203.0.113.99', fromLayer: 0, toLayer: 1, escapedPath: '/admin' });
t('no DB: record attempt reports nothing landed', noDbRecord.trappedUpdated === false && noDbRecord.eventLogged === false);
const noDbAdvance = await advanceDollLayer({ ip: '203.0.113.99', escapedPath: '/admin', referer: '' });
t('no DB: advance from the maze lands in layer 1', noDbAdvance.fromLayer === 0 && noDbAdvance.toLayer === 1);
const noDbAdvanceRef = await advanceDollLayer({ ip: '203.0.113.99', escapedPath: '/admin', referer: '/api/ares/abyss/doll-6/search' });
t('no DB: advance from layer 6 stays in layer 6', noDbAdvanceRef.fromLayer === 6 && noDbAdvanceRef.toLayer === 6);

console.log(`dolls: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
