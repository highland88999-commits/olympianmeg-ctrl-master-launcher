// tests/mars2-build-modes-item4.test.mjs
// MARS 2 BUILD + MINING MODES — DIVE ROUND ITEM 4 (Merlin, Nov 24, 2026).
// Pins the flows the dive verified end to end, and the three defects
// it found in the device-local design (there is no Mars 2 mining SQL
// in supabase/ and no /api/mars2 route — the loop is device-local by
// design, like the orb wallets; see STATE.md):
//   1. NO OFFLINE ACCRUAL: a load is a new session — the mines'
//      clocks restart at load, so a day closed pays nothing on the
//      first tick (before the fix the first tick credited the whole
//      absence, up to the tier cap).
//   2. FIRST-FREE LABEL: the MINE button shows the real cost —
//      FREE only for the first claim in an area, 20 iron ore after.
//   3. OCCUPIED PLOTS STAY TAPPABLE: tapping a built mine/barracks
//      in the 3D scene selects it (before the fix only empty plots
//      had raycast frames, so a built plot was dead ground).
//   4. FULLSCREEN CLEARANCE: in fullscreen the build panel caps
//      its height clear of the fullscreen controls strip (before
//      the fix a tall panel ran under it).
// Run: node --test tests/mars2-build-modes-item4.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMarsProfile } from '../lib/mars/engine.js';
import { MARS2_SEED } from '../lib/mars2/world.js';
import {
  plotsFor, buildMine, tickBuildings, emptyBuildState,
  loadBuildState, saveBuildState, BUILD_MODE_STORAGE_KEY,
  MINE_CAPACITY, MINE_OUTPUT_PER_MIN, EXTRA_MINE_COST,
} from '../lib/mars2/build-mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const profile = generateMarsProfile(MARS2_SEED);
const plots = plotsFor(profile);
const minePlot = plots.find((p) => p.kind === 'mine').id;

// A minimal localStorage stand-in: the engine only touches
// getItem/setItem under its own key.
function stubStorage(initial = {}) {
  const store = { ...initial };
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  return store;
}

describe('no offline accrual — a load is a new session', () => {
  it('loadBuildState restarts every mine clock at load', () => {
    const built = buildMine(emptyBuildState(), plots, minePlot, {}, 1_000_000);
    assert.ok(built.ok);
    const stale = {
      ...built.state,
      buildings: built.state.buildings.map((b) => ({ ...b, lastTickMs: 1_000_000 })),
    };
    const store = stubStorage({ [BUILD_MODE_STORAGE_KEY]: JSON.stringify(stale) });
    const before = Date.now();
    const loaded = loadBuildState(plots);
    const after = Date.now();
    assert.equal(loaded.buildings.length, 1, 'the building survives the load');
    assert.ok(loaded.buildings[0].lastTickMs >= before, 'clock restarted at load, not restored stale');
    assert.ok(loaded.buildings[0].lastTickMs <= after, 'clock is now, not the future');
    assert.equal(store[BUILD_MODE_STORAGE_KEY], JSON.stringify(stale), 'load does not rewrite storage');
  });

  it('a day closed pays nothing on the first tick after reopening', () => {
    const built = buildMine(emptyBuildState(), plots, minePlot, {}, 1_000_000);
    const stale = {
      ...built.state,
      buildings: built.state.buildings.map((b) => ({ ...b, lastTickMs: 1_000_000, accrued: 0 })),
    };
    stubStorage({ [BUILD_MODE_STORAGE_KEY]: JSON.stringify(stale) });
    const loaded = loadBuildState(plots);
    // Five seconds of open page: T1 makes 2/min, so 5 s is 1/6 of a
    // unit — nothing whole to collect yet.
    const ticked = tickBuildings(loaded, loaded.buildings[0].lastTickMs + 5_000);
    assert.ok(ticked.buildings[0].accrued < 1, `5 s open accrues <1, got ${ticked.buildings[0].accrued}`);
    // And the stale clock itself is gone: ticking from the ORIGINAL
    // stale stamp would have paid the whole day (capped at 60).
    const unleashed = tickBuildings(stale, 1_000_000 + 24 * 3600 * 1000);
    assert.equal(unleashed.buildings[0].accrued, MINE_CAPACITY[0], 'the stale-stamp path would pay the cap — the load must never hand it one');
  });

  it('the live tick still credits time while the page is open', () => {
    const built = buildMine(emptyBuildState(), plots, minePlot, {}, 1_000_000);
    const ticked = tickBuildings(built.state, 1_000_000 + 30 * 60 * 1000);
    assert.equal(ticked.buildings[0].accrued, MINE_OUTPUT_PER_MIN[0] * 30, '30 min open pays 30 min of T1 output');
  });

  it('save/load round-trips a fresh session without paying the gap', () => {
    const built = buildMine(emptyBuildState(), plots, minePlot, {}, Date.now());
    const store = stubStorage();
    saveBuildState(built.state);
    const loaded = loadBuildState(plots);
    assert.equal(loaded.buildings.length, 1);
    assert.ok(Math.abs(loaded.buildings[0].lastTickMs - Date.now()) < 5_000);
    assert.equal(store[BUILD_MODE_STORAGE_KEY] !== undefined, true);
  });
});

describe('first-free label — the MINE button shows the real cost', () => {
  it('the panel prices the mine from whether the area already has one', () => {
    const panel = read('components/mars2/BuildPanel.jsx');
    assert.ok(panel.includes('EXTRA_MINE_COST'), 'the panel knows the second-mine cost');
    // The MINE button row prices from the area state, not a constant FREE.
    assert.ok(!panel.includes("costText([])"), 'no hard FREE label on the mine button row');
    assert.ok(panel.includes('areaHasMine'), 'the panel tracks whether the area already has a mine');
  });

  it('the engine charges the second mine in an area 20 iron ore', () => {
    const rich = { 'iron-ore': 1000, silicon: 1000, 'titanium-ore': 1000, 'water-ice': 1000 };
    const first = buildMine(emptyBuildState(), plots, minePlot, rich, 1_000_000);
    assert.ok(first.ok);
    assert.deepEqual(first.wallet['iron-ore'], 1000, 'first claim in an area is free');
    const secondPlot = plots.find((p) => p.kind === 'mine' && p.areaId === plots.find((q) => q.id === minePlot).areaId && p.id !== minePlot).id;
    const second = buildMine(first.state, plots, secondPlot, first.wallet, 1_000_000);
    assert.ok(second.ok);
    assert.equal(second.wallet['iron-ore'], 1000 - EXTRA_MINE_COST[0].qty, 'second mine costs the extra-mine price');
  });
});

describe('occupied plots stay tappable in the 3D scene', () => {
  it('the layer registers a tap target for occupied plots too', () => {
    const layer = read('components/mars2/BuildModeLayer.jsx');
    // Occupied plots used to render nothing (no frame, no raycast
    // target), so tapping a built mine selected nothing.
    assert.ok(layer.includes('occupied'), 'the layer branches on occupied plots');
    assert.ok(/opacity=\{0\}/.test(layer), 'the occupied tap target is invisible, not a visible frame');
    assert.ok(layer.includes('plotMeshes.current.set(plot.id'), 'the occupied target registers in the raycast map');
  });

  it('the occupied target still carries the plot id for the tap walk-up', () => {
    const layer = read('components/mars2/BuildModeLayer.jsx');
    const idx = layer.indexOf('opacity={0}');
    assert.ok(idx !== -1);
    const window = layer.slice(Math.max(0, idx - 1200), idx + 600);
    assert.ok(window.includes('userData.plotId'), 'the invisible target names its plot');
  });
});

describe('fullscreen clearance — the controls strip steps aside while building', () => {
  it('the page hides the fullscreen controls strip while build mode is on', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('{fullscreen && !buildMode && ('), 'the fs-controls block is gated on build mode off');
    assert.ok(page.includes('className="fs-controls"'), 'the strip itself is kept, only gated');
  });

  it('the strip comes back when build mode exits — the panel owns the exit', () => {
    const page = read('app/mars-2/page.jsx');
    const panel = read('components/mars2/BuildPanel.jsx');
    // The BUILD orb lives in the strip, so while it hides, the
    // panel's own ✕ is the way out: collapse, then the chip's ✕.
    assert.ok(page.includes('onCollapse={() => setBuildPanelCollapsed(true)}'), 'panel ✕ collapses to the chip');
    assert.ok(page.includes('onClose={() => { setBuildMode(false);'), 'chip ✕ exits build mode, which un-hides the strip');
    assert.ok(panel.includes('ariaLabel="Exit build mode"'), 'the collapsed chip carries the build-mode exit');
  });

  it('the panel keeps its boxed cap — the joystick row stays clear', () => {
    const panel = read('components/mars2/BuildPanel.jsx');
    assert.ok(panel.includes("maxHeight: 'calc(100% - 300px)'"), 'boxed cap kept');
  });
});

describe('wiring — no API route is needed (device-local by design)', () => {
  it('the page never fetches a mars2 mining route', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(!page.includes('/api/mars2'), 'no mars2 API route is called');
    assert.ok(!page.includes('fetch('), 'the build loop makes no network calls at all');
  });

  it('there is no mars2 mining table to read — the loop is localStorage + backpack', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('loadBuildState'), 'build state loads from localStorage');
    assert.ok(page.includes('saveBuildState'), 'build state saves to localStorage');
    assert.ok(page.includes('updateBackpack'), 'materials land in the backpack');
    assert.ok(!fs.existsSync(path.join(repo, 'app/api/mars2')), 'no /api/mars2 route dir exists');
  });
});
