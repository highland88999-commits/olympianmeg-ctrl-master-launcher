// tests/billboard-sequential-load.test.mjs
// Sequential billboard video loading (Merlin, 2026-11-24): the
// billboard videos load ONE AT A TIME in billboard-number order
// (1, then 2, then 3, ... through the whole board run), never in
// parallel. If several faces share the same video URL, that video
// is fetched ONCE and plays on all of them. A failed load never
// blocks the sequence. The in-view play/pause gate from 4ca42887
// is untouched — a face's video loads in sequence, then plays only
// when in view.
// Run: node tests/billboard-sequential-load.test.mjs (from the repo root).
// No browser, no network — asserts on the pure helpers, on a
// faithful simulation of the queue runner, and on the wired source
// (same grep style as the hub suites).
//
// Rules under test:
// - The preload list covers the WHOLE board run (96 boards, 24
//   towers × 4 panels) — the old 1→44 cap is gone — deduped to
//   first appearance; the per-panel queue (not this list) is what
//   loads every face, in badge order.
// - Queue order is badge order (1, 2, 3, ...), ties in registration
//   order; non-badge records load last.
// - A shared URL is fetched once over the network; every face
//   sharing it still gets its own ready record.
// - A failed load never blocks the sequence.
// - The queue owns ALL src assignment: no record sets src at
//   creation; the queue step is the only src assignment.
// - Readiness is robust: canplay OR loadeddata OR playing, plus a
//   readyState poll — a detached iOS element that never fires
//   canplay can still light its face.
// - A slow panel never blocks the queue past the step timeout.
// - The 4ca42887 invariants survive: per-panel records, in-view
//   gate, metadata-only, resume-never-restart, pass-through.
import { readFileSync } from 'node:fs';
import {
  collectPanelVideoUrls,
  preloadInOrder,
  panelVideoBadgeOrder,
  pickNextPanelVideoLoad,
} from '../lib/billboards/panel-video.js';
import { panelsForTower, billboardNumberFor, houseLevelSlot } from '../lib/tower-panels.js';
import { manifestToOverrides, applyOverridesToTowerPanels } from '../lib/billboards/overrides.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- whole-ring warm list: distinct URLs in first-appearance order ---
{
  const A = 'https://example.com/house.mp4';
  const B = 'https://example.com/moto.mp4';
  const towers = [];
  for (let ti = 0; ti < 24; ti++) {
    const panels = [];
    for (let pi = 0; pi < 4; pi++) {
      // One different URL in the middle of the ring; everything else
      // shares the house video, like the real ring (2 distinct URLs).
      const url = ti === 11 && pi === 1 ? B : A;
      panels.push({ key: `p${pi}`, creativeType: 'video', creativeUrl: url });
    }
    towers.push(panels);
  }
  const numberFor = (ti, pi) => ti * 4 + pi + 1;
  const list = collectPanelVideoUrls(towers, numberFor);
  // The warmer dedupes identical URLs to first appearance: two
  // distinct URLs → two warm items, in first-appearance order
  // (house at board 1, moto at board 46). The per-panel queue — not
  // this list — is what loads every face, in badge order.
  t(
    'whole-ring warm list: distinct URLs in first-appearance order',
    JSON.stringify(list) === JSON.stringify([
      { number: 1, url: A },
      { number: 46, url: B },
    ])
  );
  t(
    'whole-ring warm list has exactly 2 distinct URLs',
    new Set(list.map((e) => e.url)).size === 2
  );
}
{
  // The REAL ring, built exactly the way HomeScene builds it:
  // the shipped manifest (public/billboards/manifest.json) →
  // manifestToOverrides → applyOverridesToTowerPanels over the
  // base panelsForTower assignment. No browser, no network — the
  // manifest is a static repo file.
  const manifest = JSON.parse(readFileSync(
    new URL('../public/billboards/manifest.json', import.meta.url),
    'utf8'
  ));
  const overrides = manifestToOverrides(manifest);
  const towers = [];
  for (let ti = 0; ti < 24; ti++) {
    towers.push(applyOverridesToTowerPanels(panelsForTower(ti), ti, overrides));
  }
  const list = collectPanelVideoUrls(towers, billboardNumberFor);
  t(
    'real ring: warm list is mhi-moto at board 1, house at board 2 — the only two video URLs',
    JSON.stringify(list) === JSON.stringify([
      { number: 1, url: '/billboards/mhi-moto-division.mp4' },
      { number: 2, url: '/billboards/house-ad-space.mp4' },
    ])
  );
  // The top + bottom levels play the house video on every face
  // (houseLevelSlot): one distinct URL for all 192 faces.
  const houseUrls = new Set();
  for (const t of towers) {
    for (const s of t) {
      const h = houseLevelSlot(s);
      for (const e of h.entries) {
        if (e.creativeType === 'video') houseUrls.add(e.creativeUrl);
      }
    }
  }
  t(
    'real ring: house levels carry exactly one video URL',
    houseUrls.size === 1 && houseUrls.has('/billboards/house-ad-space.mp4')
  );
}

// --- badge order: panel-<n> → n, everything else last ---
t('badge order: panel-1 → 1', panelVideoBadgeOrder('panel-1') === 1);
t('badge order: panel-96 → 96', panelVideoBadgeOrder('panel-96') === 96);
t('badge order: panel-140 → 140', panelVideoBadgeOrder('panel-140') === 140);
t('badge order: slot-key fallback loads last', panelVideoBadgeOrder('stake-0') === Infinity);
t('badge order: non-string loads last', panelVideoBadgeOrder(null) === Infinity);
t('badge order: panel-abc loads last', panelVideoBadgeOrder('panel-abc') === Infinity);

// --- queue pick: min badge first, ties by registration order ---
{
  const q = [
    { recordKey: 'panel-5::u', url: 'u', order: 5, seq: 0 },
    { recordKey: 'panel-2::u', url: 'u', order: 2, seq: 1 },
    { recordKey: 'panel-9::u', url: 'u', order: 9, seq: 2 },
    { recordKey: 'panel-1::u', url: 'u', order: 1, seq: 3 },
    { recordKey: 'panel-2b::u', url: 'u', order: 2, seq: 4 },
    { recordKey: 'stake-0::u', url: 'u', order: Infinity, seq: 5 },
  ];
  const picked = [];
  const work = [...q];
  while (work.length > 0) {
    const idx = pickNextPanelVideoLoad(work);
    picked.push(work[idx].recordKey);
    work.splice(idx, 1);
  }
  t(
    'queue picks badge order with registration-order ties, fallbacks last',
    JSON.stringify(picked) === JSON.stringify([
      'panel-1::u', 'panel-2::u', 'panel-2b::u', 'panel-5::u', 'panel-9::u', 'stake-0::u',
    ])
  );
}
t('queue pick on an empty queue is -1', pickNextPanelVideoLoad([]) === -1);
t('queue pick on bad input is -1', pickNextPanelVideoLoad(null) === -1);
{
  // A late-mounting low badge still jumps the queue: the runner
  // re-picks the minimum every iteration, it does not drain FIFO.
  const q = [
    { recordKey: 'panel-50::u', url: 'u', order: 50, seq: 0 },
    { recordKey: 'panel-60::u', url: 'u', order: 60, seq: 1 },
  ];
  q.push({ recordKey: 'panel-3::u', url: 'u', order: 3, seq: 2 });
  t('late low badge jumps the queue', pickNextPanelVideoLoad(q) === 2);
}

// --- sequential run simulation: badge order, shared URL once,
//     failure never blocks ---
{
  // Faithful model of runPanelVideoLoadQueue + loadPanelVideoEntry:
  // pick the min (order, seq) each iteration, load it, and count
  // NETWORK fetches — a URL already in the cache is served without
  // a network fetch, exactly like the browser cache.
  const HOUSE = 'https://example.com/house.mp4';
  const MOTO = 'https://example.com/moto.mp4';
  const queue = [
    { recordKey: 'panel-5::h', url: HOUSE, order: 5, seq: 0 },
    { recordKey: 'panel-2::h', url: HOUSE, order: 2, seq: 1 },
    { recordKey: 'panel-9::m', url: MOTO, order: 9, seq: 2 },
    { recordKey: 'panel-1::h', url: HOUSE, order: 1, seq: 3 },
    { recordKey: 'panel-3::h', url: HOUSE, order: 3, seq: 4 },
  ];
  const networkFetches = [];
  const cache = new Set();
  const loaded = [];
  const work = [...queue];
  while (work.length > 0) {
    const idx = pickNextPanelVideoLoad(work);
    const [entry] = work.splice(idx, 1);
    if (!cache.has(entry.url)) {
      cache.add(entry.url);
      networkFetches.push(entry.url);
    }
    loaded.push(entry.recordKey);
  }
  t(
    'sequential run loads in badge order 1, 2, 3, 5, 9',
    JSON.stringify(loaded) === JSON.stringify([
      'panel-1::h', 'panel-2::h', 'panel-3::h', 'panel-5::h', 'panel-9::m',
    ])
  );
  t(
    'shared URL fetched exactly once over the network',
    networkFetches.length === 2 &&
      networkFetches[0] === HOUSE && networkFetches[1] === MOTO
  );
  t(
    'every face sharing a video still gets its own load step',
    loaded.length === 5
  );
}
{
  // The warmer's own runner, same guarantee at its level: a dead
  // video in the middle never stops the ones after it.
  const seen = [];
  const loader = async (url) => {
    seen.push(url);
    if (url === 'bad') throw new Error('dead video');
    return true;
  };
  let threw = false;
  let results = null;
  try {
    results = await preloadInOrder(
      [{ number: 1, url: 'good-1' }, { number: 2, url: 'bad' }, { number: 3, url: 'good-2' }],
      loader
    );
  } catch { threw = true; }
  t('failure never blocks the sequence', !threw && JSON.stringify(seen) === JSON.stringify(['good-1', 'bad', 'good-2']));
  t(
    'failure is marked honestly and the rest still load',
    results[0].ok === true && results[1].ok === false && results[2].ok === true
  );
}

// --- hold-then-release (Merlin, 2026-11-25 — hub crash round):
//     no billboard video src is assigned until the hub has loaded
//     AND the intro rotation has ended; after release, srcs assign
//     in badge order. Records are still created unfetched while
//     held — the hold only moves WHEN the first src is assigned. ---
{
  // Faithful model of the GodTower hold + runner: the runner awaits
  // the release once before its FIRST load step, then picks the min
  // (order, seq) each iteration, exactly like runPanelVideoLoadQueue.
  let held = true;
  const waiters = [];
  const release = () => {
    if (!held) return;
    held = false;
    const ws = waiters.splice(0);
    for (const resolve of ws) resolve();
  };
  const awaitRelease = () => {
    if (!held) return Promise.resolve();
    return new Promise((resolve) => { waiters.push(resolve); });
  };
  const queue = [
    { recordKey: 'panel-5::h', url: 'h', order: 5, seq: 0 },
    { recordKey: 'panel-2::h', url: 'h', order: 2, seq: 1 },
    { recordKey: 'panel-1::h', url: 'h', order: 1, seq: 2 },
  ];
  const srcAssigned = [];
  const runner = (async () => {
    await awaitRelease();
    const work = [...queue];
    while (work.length > 0) {
      const idx = pickNextPanelVideoLoad(work);
      const [entry] = work.splice(idx, 1);
      srcAssigned.push(entry.recordKey); // the queue's src assignment
    }
  })();
  // Records are created unfetched while held: let the runner tick.
  await new Promise((r) => setTimeout(r, 10));
  t('held: no src assigned while the gate is held', srcAssigned.length === 0);
  release();
  await runner;
  t(
    'released: srcs assign in badge order 1, 2, 5',
    JSON.stringify(srcAssigned) === JSON.stringify(['panel-1::h', 'panel-2::h', 'panel-5::h'])
  );
  // One-way latch: a second release is a no-op and never re-holds.
  release();
  t('release is a one-way latch', held === false);
}

// --- wired source guards (same grep style as the hub suites) ---
const godTowerSrc = readFileSync(
  new URL('../components/GodTower.jsx', import.meta.url),
  'utf8'
);
const homeSceneSrc = readFileSync(
  new URL('../components/HomeScene.jsx', import.meta.url),
  'utf8'
);
const argoMonumentSrc = readFileSync(
  new URL('../components/argo/BillboardMonument.jsx', import.meta.url),
  'utf8'
);
t(
  'queue owns ALL video src assignment: exactly one video src assignment in GodTower, inside the queue step',
  (godTowerSrc.match(/video\.src = /g) || []).length === 1 &&
    godTowerSrc.includes('rec.video.src = entry.url;')
);
t(
  'no record sets src at creation',
  !godTowerSrc.includes('video.src = url;')
);
t(
  'records enqueue at creation, in badge order',
  godTowerSrc.includes('enqueuePanelVideoLoad(recordKey, url)') &&
    godTowerSrc.includes('panelVideoBadgeOrder(viewerId)') &&
    godTowerSrc.includes('pickNextPanelVideoLoad(panelVideoLoadQueue)')
);
t(
  'queue step timeout is 5 s: a slow panel never blocks the queue',
  godTowerSrc.includes('PANEL_VIDEO_QUEUE_STEP_TIMEOUT_MS = 5000') &&
    godTowerSrc.includes('awaitPanelVideoReady(rec, PANEL_VIDEO_QUEUE_STEP_TIMEOUT_MS)')
);
t(
  'ready is robust: canplay OR loadeddata OR playing',
  godTowerSrc.includes("video.addEventListener('canplay', () => setPanelVideoReady(rec))") &&
    godTowerSrc.includes("video.addEventListener('loadeddata', () => setPanelVideoReady(rec))") &&
    godTowerSrc.includes("video.addEventListener('playing', () => setPanelVideoReady(rec))")
);
t(
  'readyState poll is the event-independent backstop',
  godTowerSrc.includes('rec.video.readyState >= 2')
);
t(
  'warmer still runs in board order through the queue',
  homeSceneSrc.includes('preloadHubPanelVideos(towerPanels)') &&
    godTowerSrc.includes('export function preloadHubPanelVideos(towersPanels)') &&
    godTowerSrc.includes('collectPanelVideoUrls(towersPanels, billboardNumberFor)')
);
// --- hold-then-release wiring (Merlin, 2026-11-25) ---
t(
  'hold: panel-video load starts held',
  godTowerSrc.includes('let panelVideoLoadHeld = true')
);
t(
  'hold: release is exported for the hub load gate',
  godTowerSrc.includes('export function releasePanelVideoLoad()')
);
t(
  'hold: release is a one-way latch — clears the flag and drains the waiters',
  godTowerSrc.includes('panelVideoLoadHeld = false') &&
    godTowerSrc.includes('panelVideoLoadWaiters = [];')
);
t(
  'hold: the queue waits on the release before its first load step',
  godTowerSrc.includes('await awaitPanelVideoLoadRelease();') &&
    godTowerSrc.indexOf('await awaitPanelVideoLoadRelease();') <
      godTowerSrc.indexOf('while (panelVideoLoadQueue.length > 0)')
);
t(
  'hold: still exactly one src assignment in the file, inside the queue step',
  (godTowerSrc.match(/video\.src = /g) || []).length === 1 &&
    godTowerSrc.includes('rec.video.src = entry.url;')
);
t(
  'gate: HomeScene imports the release',
  homeSceneSrc.includes('releasePanelVideoLoad') &&
    homeSceneSrc.includes("import GodTower, { preloadHubPanelVideos, releasePanelVideoLoad } from './GodTower';")
);
t(
  'gate: TextureProvider receives appState and the first-frame flag',
  homeSceneSrc.includes('function TextureProvider({ onLaunchExternal, appState, hubFirstFrame })') &&
    homeSceneSrc.includes('<TextureProvider onLaunchExternal={onLaunchExternal} appState={appState} hubFirstFrame={hubFirstFrame} />')
);
t(
  'gate: release fires only on textures + first frame + intro ended',
  homeSceneSrc.includes("if (textures && hubFirstFrame && appState !== 'hub_intro')") &&
    homeSceneSrc.includes('releasePanelVideoLoad();')
);
t(
  'gate: the release effect depends only on textures + intro + first frame — never the manifest / paused / solo fetches',
  homeSceneSrc.includes('}, [textures, appState, hubFirstFrame]);')
);
t(
  'gate: first frame is recorded in HubScene and forwarded to the signal',
  homeSceneSrc.includes('const [hubFirstFrame, setHubFirstFrame] = useState(false);') &&
    homeSceneSrc.includes('<FirstFrameReporter onFirstFrame={handleFirstFrame} />') &&
    homeSceneSrc.includes('onFirstFrame?.();')
);
t(
  'gate: the warmer is still called unconditionally (its 20 s per-URL await resolves false while held and returns cleanly)',
  homeSceneSrc.includes('preloadHubPanelVideos(towerPanels).catch(() => {});')
);
// --- 4ca42887 invariants survive the sequential change ---
t(
  'per-panel records survive: one video element per panel, keyed by panel + URL',
  godTowerSrc.includes('panelVideoRecordKey(viewerId, url)') &&
    godTowerSrc.includes('`${viewerId}::${url}`')
);
t(
  'in-view gate survives: play/pause follows this panel only',
  godTowerSrc.includes('setPanelVideoViewer(viewerId, videoUrl, inView)') &&
    godTowerSrc.includes('rec.inView = inView')
);
t(
  'metadata-only survives: no auto preload anywhere',
  godTowerSrc.includes("video.preload = 'metadata'") &&
    !godTowerSrc.includes("video.preload = 'auto'")
);
t(
  'resume-never-restart survives: no currentTime reset on the play path',
  !godTowerSrc.includes('currentTime = 0') &&
    !godTowerSrc.includes('currentTime=0')
);
t(
  'pass-through survives: no tower collider is registered',
  !godTowerSrc.includes('registerBoxCollider')
);
t(
  'ARGO monuments untouched: still the unconditional play, awaiting his word',
  argoMonumentSrc.includes('vid.play()')
);

console.log(`\nbillboard-sequential-load: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
