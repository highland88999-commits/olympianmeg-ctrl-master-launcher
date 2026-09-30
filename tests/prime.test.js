// tests/prime.test.js — Headless tests for the PRIME star-chart navigator.
// Run: node tests/prime.test.js (from the repo root).
// No browser, no network — asserts on lib/prime-chart.js + lib/prime-state.js
// logic plus source-level checks (menu wiring, no telemetry, music-bar
// boundary, reduced motion, per-account scoping).
import { readFileSync } from 'fs';
import {
  hashString,
  mulberry32,
  buildChart,
  allNodes,
  screenToWorld,
  worldToScreen,
  hitTest,
  searchChart,
  initialCamera,
  prettifyKey,
  sectionBlurb,
  ZOOM_MIN,
  ZOOM_MAX,
} from '../lib/prime-chart.js';
import {
  stateKey,
  emptyState,
  sanitizeState,
  loadState,
  saveState,
  togglePin,
  recordVisit,
  withCamera,
  resolveAccountId,
  PRIME_SCOPING,
  MAX_RECENTS,
} from '../lib/prime-state.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL:', name);
  }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// --- deterministic RNG -------------------------------------------------------
t('hashString: deterministic', hashString('prime') === hashString('prime'));
t('hashString: different strings differ', hashString('prime') !== hashString('nova'));
{
  const r1 = mulberry32(12345);
  const r2 = mulberry32(12345);
  const seq1 = [r1(), r1(), r1()];
  const seq2 = [r2(), r2(), r2()];
  t('mulberry32: same seed, same sequence', seq1.every((v, i) => approx(v, seq2[i])));
  t('mulberry32: values in [0,1)', seq1.every((v) => v >= 0 && v < 1));
}

// --- chart construction -------------------------------------------------------
const fakeSats = [
  { key: 'chess', route: '/chess', pos: 'ARES', section: 'GAMES', constellation: 'ZEUS' },
  { key: 'prime', route: '/prime', pos: 'HEPHAESTUS', section: 'TOOLS', constellation: 'ARES' },
  { key: 'forge', route: '/forge', pos: 'HEPHAESTUS', section: 'TOOLS', constellation: 'ARES' },
  { key: 'babel', route: '/babel', pos: 'APHRODITE', section: 'OBSERVATORY', constellation: 'ARGUS' },
];
const chartA = buildChart(fakeSats);
const chartB = buildChart(fakeSats);
t('buildChart: nodeCount matches input', chartA.nodeCount === fakeSats.length);
t('buildChart: one cluster per constellation', chartA.clusters.length === 3);
t('buildChart: deterministic across builds', JSON.stringify(chartA) === JSON.stringify(chartB));
t('buildChart: clusters alphabetical', chartA.clusters.map((c) => c.constellation).join(',') === 'ARES,ARGUS,ZEUS');
t('buildChart: every key present', fakeSats.every((s) => allNodes(chartA).some((n) => n.key === s.key)));
t('buildChart: prime node is an ARES tool', allNodes(chartA).some((n) => n.key === 'prime' && n.constellation === 'ARES' && n.section === 'TOOLS'));
t('buildChart: positions finite', allNodes(chartA).every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
{
  // Nodes never sit on top of each other.
  const nodes = allNodes(chartA);
  let minD2 = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d2 = (nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2;
      minD2 = Math.min(minD2, d2);
    }
  }
  t('buildChart: nodes separated', Math.sqrt(minD2) >= 48);
}
t('buildChart: ignores malformed entries', buildChart([null, {}, { key: 'x' }]).nodeCount === 0);
t('prettifyKey', prettifyKey('rogers-arena') === 'Rogers Arena');
t('sectionBlurb: games', /play/i.test(sectionBlurb('GAMES')));
t('sectionBlurb: fallback', typeof sectionBlurb('WHATEVER') === 'string');

// --- camera math --------------------------------------------------------------
{
  const cam = { x: 100, y: -50, zoom: 0.5 };
  const w = screenToWorld(400, 300, cam, 800, 600);
  const back = worldToScreen(w.x, w.y, cam, 800, 600);
  t('camera: world->screen->world roundtrip', approx(back.x, 400) && approx(back.y, 300));
  t('camera: center maps to camera origin', approx(screenToWorld(400, 300, cam, 800, 600).x, 100));
}

// --- hit testing --------------------------------------------------------------
{
  const cam = { x: 0, y: 0, zoom: 1 };
  const nodes = allNodes(chartA);
  const target = nodes[0];
  const hit = hitTest(chartA, target.x, target.y, cam);
  t('hitTest: exact node hit', hit && hit.kind === 'node' && hit.node.key === target.key);
  t('hitTest: far away misses', hitTest(chartA, 1e7, -1e7, cam) === null);
  const cluster = chartA.clusters[0];
  const chit = hitTest(chartA, cluster.x + 300, cluster.y + 300, cam);
  t('hitTest: misses nodes, hits nothing near-ish', chit === null || chit.kind === 'cluster');
}

// --- search -------------------------------------------------------------------
t('searchChart: finds by name', searchChart(chartA, 'chess').length === 1);
t('searchChart: case-insensitive', searchChart(chartA, 'CHESS').length === 1);
t('searchChart: matches constellation', searchChart(chartA, 'ares').length === 2);
t('searchChart: empty query → []', searchChart(chartA, '   ').length === 0);
t('searchChart: no match → []', searchChart(chartA, 'zzz-nope').length === 0);

// --- initial camera -----------------------------------------------------------
{
  const cam = initialCamera(chartA, 800, 600);
  t('initialCamera: finite', Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.zoom));
  t('initialCamera: zoom in bounds', cam.zoom >= ZOOM_MIN && cam.zoom <= ZOOM_MAX);
  const empty = initialCamera({ clusters: [] }, 800, 600);
  t('initialCamera: empty chart safe', Number.isFinite(empty.zoom));
}

// --- prime-state: keys & scoping ----------------------------------------------
t('stateKey: account shape', stateKey('supabase:abc') === 'prime:v1:account:supabase:abc');
t('stateKey: device fallback', stateKey(null) === 'prime:v1:device');
t('stateKey: blank id → device', stateKey('   ') === 'prime:v1:device');
t('stateKey: accounts never collide', stateKey('A') !== stateKey('B'));
{
  const s = sanitizeState({ camera: { x: 'nope' }, pins: ['a', 'a', 42, 'b'], recents: null, junk: 1 });
  t('sanitizeState: bad camera dropped', s.camera === null);
  t('sanitizeState: pins deduped & strings only', JSON.stringify(s.pins) === JSON.stringify(['a', 'b']));
  t('sanitizeState: recents default', Array.isArray(s.recents) && s.recents.length === 0);
}
{
  const s1 = togglePin(emptyState(), 'chess');
  t('togglePin: pins', s1.pins.includes('chess'));
  const s2 = togglePin(s1, 'chess');
  t('togglePin: unpins', !s2.pins.includes('chess'));
  t('togglePin: immutable-ish (new object)', s1 !== s2);
}
{
  let s = emptyState();
  for (let i = 0; i < MAX_RECENTS + 5; i++) s = recordVisit(s, 'k' + i);
  t('recordVisit: capped at MAX_RECENTS', s.recents.length === MAX_RECENTS);
  s = recordVisit(s, 'k9');
  t('recordVisit: revisit bumps to front, no dupes', s.recents[0] === 'k9' && new Set(s.recents).size === s.recents.length);
}
{
  const ok = withCamera(emptyState(), { x: 1, y: 2, zoom: 0.5 });
  t('withCamera: stores good camera', ok.camera && approx(ok.camera.x, 1));
  const bad = withCamera(emptyState(), { x: 1, y: 2, zoom: -3 });
  t('withCamera: rejects bad zoom', bad.camera === null);
}
{
  // In-memory storage shim; no cross-user leakage in one storage.
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => void mem.set(k, v),
  };
  const a = togglePin(emptyState(), 'chess');
  const b = togglePin(emptyState(), 'nova');
  t('saveState: ok', saveState(storage, 'acct-A', a) === true);
  t('saveState: ok', saveState(storage, 'acct-B', b) === true);
  const la = loadState(storage, 'acct-A');
  const lb = loadState(storage, 'acct-B');
  t('per-account: A sees only its pins', la.pins.includes('chess') && !la.pins.includes('nova'));
  t('per-account: B sees only its pins', lb.pins.includes('nova') && !lb.pins.includes('chess'));
  const guest = loadState(storage, null);
  t('per-account: device fallback is empty', guest.pins.length === 0);
  t('loadState: corrupt json → empty', (() => {
    mem.set(stateKey('corrupt'), '{nope');
    return loadState(storage, 'corrupt').pins.length === 0;
  })());
}
{
  // Identity resolution: supabase uid > callsign > device.
  const mem = new Map([['nexus_user', 'merlin']]);
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: () => {} };
  const sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'uid-1' } } } }) } };
  const id1 = await resolveAccountId(sb, storage);
  t('resolveAccountId: supabase uid first', id1 === 'supabase:uid-1');
  const sbOff = { auth: { getSession: async () => ({ data: { session: null } }) } };
  const id2 = await resolveAccountId(sbOff, storage);
  t('resolveAccountId: falls back to callsign', id2 === 'callsign:MERLIN');
  const id3 = await resolveAccountId(null, { getItem: () => null, setItem: () => {} });
  t('resolveAccountId: no account → null (device key)', id3 === null);
  const id4 = await resolveAccountId({ auth: { getSession: async () => { throw new Error('down'); } } }, storage);
  t('resolveAccountId: session error → callsign fallback', id4 === 'callsign:MERLIN');
}

// --- source-level checks ------------------------------------------------------
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');

  const page = readFileSync('app/prime/page.jsx', 'utf8');
  const pageCode = strip(page);
  t('page: use client', page.includes("'use client'"));
  t('page: imports SATELLITES registry', /from '@\/lib\/i18n\/satellites'/.test(pageCode));
  t('page: travel pushes route', /router\.push\(node\.route\)/.test(pageCode));
  t('page: launch fanfare via central fx', /fx\.routeLaunch\(node\.route\)/.test(pageCode));
  t('page: reduced motion respected', /prefers-reduced-motion/.test(pageCode));
  t('page: music-bar clearance token', /--player-clear/.test(pageCode));
  t('page: safe-area-inset-bottom respected', /env\(safe-area-inset-bottom\)/.test(pageCode));
  t('page: no telemetry/fetch', !/fetch\(|central_telemetry|phone.?home|supabase\.from|https?:\/\//i.test(pageCode));
  t('page: no external assets', !/['"`]\S+\.(mp4|mov|glb|fbx|gltf)\b/i.test(pageCode));
  t('page: honest labels (no fake live)', !/live map tiles/i.test(pageCode));
  t('page: per-account state wiring', /resolveAccountId|subscribeAccountChanges/.test(pageCode));

  const chartSrc = strip(readFileSync('components/prime/PrimeChart.jsx', 'utf8'));
  t('chart: use client', chartSrc.includes("'use client'"));
  t('chart: DPR capped', /Math\.min\(window\.devicePixelRatio[^,]*,\s*2\)/.test(chartSrc));
  t('chart: debounced resize', /setTimeout\(resize,\s*\d+\)/.test(chartSrc));
  t('chart: dirty-only render loop', /dirty\.current/.test(chartSrc));
  t('chart: reduced motion', /prefers-reduced-motion/.test(chartSrc));
  t('chart: no telemetry/fetch', !/fetch\(|telemetry|supabase|https?:\/\//i.test(chartSrc));
  t('chart: pinch + wheel zoom', /pinch/.test(chartSrc) && /wheel/.test(chartSrc));

  const lib = strip(readFileSync('lib/prime-chart.js', 'utf8'));
  t('lib/chart: no telemetry/fetch', !/fetch\(|telemetry|supabase|https?:\/\//i.test(lib));

  const state = strip(readFileSync('lib/prime-state.js', 'utf8'));
  t('lib/state: no telemetry/fetch', !/fetch\(|telemetry|https?:\/\//i.test(state));
  t('lib/state: leaderboard rule recorded', /leaderboard/i.test(state));
  t('lib/state: scoping encoded as data', PRIME_SCOPING.personal === 'per-account' && PRIME_SCOPING.leaderboards === 'universal');

  const reg = readFileSync('lib/i18n/satellites.ts', 'utf8');
  t(
    'registry: prime entry exact shape',
    reg.includes('{ key: "prime", route: "/prime", pos: "HEPHAESTUS", section: "TOOLS", constellation: "ARES" }')
  );

  const tools = readFileSync('app/tools/page.jsx', 'utf8');
  t('tools deck: prime listed', /'prime'/.test(tools) && /Navigate/.test(tools));
  t('tools deck: prime description', /star chart of every destination/i.test(tools));

  const godMenus = readFileSync('lib/god-menus.js', 'utf8');
  t('god menus: prime claimed once', (godMenus.match(/'prime'/g) || []).length === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
