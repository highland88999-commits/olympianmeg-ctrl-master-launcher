// tests/mars2-build-mode.test.mjs
// MARS 2 BUILD MODE (Merlin, Nov 17, 2026 — "add land plots that
// appear during build mode... add a build mode. For build mode,
// we add buildings... mining related and crew recruitment
// (barracks) upgrades... makes them bigger, better output. The
// materials one can mine in mars should be the same materials
// they can collect throughout our ecosystem and different
// worlds. Designated mining areas that users must go to to mine,
// they have to build the mines").
// Run: node --test tests/mars2-build-mode.test.mjs
//
// Covers the contract, not the pixels: the shared materials
// registry (existing materials registered, Mars materials defined
// once, backpack-shaped), the four designated mining areas, the
// plots (mine plots inside areas, barracks plots outside), the
// build rules (mines only in areas, barracks only outside),
// upgrades (bigger scale, better output), crew (recruit at
// barracks, assign to mines, output rises), mining accrual +
// collect, and the page/scene wiring.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMarsProfile } from '../lib/mars/engine.js';
import { monsSite, MONS_RADIUS } from '../lib/mars/cgi.js';
import { MARS2_SEED, WORLD_RADIUS } from '../lib/mars2/world.js';
import {
  MATERIALS, materialById, isMaterialId, MARS_MINE_MATERIAL_IDS,
  materialItemFor,
} from '../lib/economy/materials.js';
import {
  BUILD_MODE_STORAGE_KEY, PLOT_SIZE_M,
  miningAreasFor, miningAreaAt, plotsFor, plotAt,
  MINE_OUTPUT_PER_MIN, MINE_CAPACITY, MINE_CREW_SLOTS,
  BARRACKS_CREW_CAPACITY, BUILDING_SCALE, MAX_TIER, CREW_OUTPUT_PER_MIN,
  buildCost, upgradeCost, CREW_RECRUIT_COST, EXTRA_MINE_COST,
  walletHas, walletSpend, walletAdd,
  emptyBuildState, sanitizeBuildState,
  buildingById, minesInArea, barracksCapacity,
  crewIdle, mineOutputPerMin,
  buildMine, buildBarracks, upgradeBuilding, recruitCrew, assignCrew,
  tickBuildings, collectBuilding, mineMaterialId,
} from '../lib/mars2/build-mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const profile = generateMarsProfile(MARS2_SEED);
const areas = miningAreasFor(profile);
const plots = plotsFor(profile);

// A wallet rich enough for every test (materials are the currency).
function richWallet() {
  return { 'iron-ore': 1000, silicon: 1000, 'titanium-ore': 1000, 'water-ice': 1000 };
}

describe('shared materials registry (lib/economy/materials.js)', () => {
  it('registers the materials the ecosystem already collects', () => {
    assert.equal(materialById('blood-sac').name, 'Blood sac');
    assert.equal(materialById('fossil').name, 'Fossil');
    assert.equal(materialById('orc-shard').name, 'Orc Shard');
  });

  it('defines the Mars-mined materials once, with distinct ids', () => {
    const ids = MATERIALS.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate material id');
    for (const id of MARS_MINE_MATERIAL_IDS) {
      assert.ok(isMaterialId(id), `${id} is registered`);
    }
    assert.deepEqual([...MARS_MINE_MATERIAL_IDS].sort(), ['iron-ore', 'silicon', 'titanium-ore', 'water-ice']);
  });

  it('materialItemFor returns the shared backpack shape (kind material)', () => {
    const item = materialItemFor('iron-ore', 5, 'mars-2-mine');
    assert.deepEqual(item, {
      id: 'iron-ore', kind: 'material', name: 'Iron Ore', qty: 5,
      meta: { source: 'mars-2-mine' },
    });
    assert.equal(materialItemFor('no-such-material', 5), null);
    assert.equal(materialItemFor('iron-ore', 0), null);
  });
});

describe('designated mining areas', () => {
  it('four areas, one material each, all from the shared registry', () => {
    assert.equal(areas.length, 4);
    const mats = areas.map((a) => a.materialId).sort();
    assert.deepEqual(mats, [...MARS_MINE_MATERIAL_IDS].sort());
    for (const a of areas) assert.ok(isMaterialId(a.materialId));
  });

  it('every area sits inside the world rim, clear of the Mons and the basins', () => {
    const mons = monsSite(profile);
    for (const a of areas) {
      assert.ok(Math.hypot(a.x, a.z) + a.radius <= WORLD_RADIUS, `${a.id} inside the rim`);
      assert.ok(Math.hypot(a.x, a.z) > 20, `${a.id} clear of the spawn flats`);
      assert.ok(
        Math.hypot(a.x - mons.x, a.z - mons.z) > MONS_RADIUS + a.radius,
        `${a.id} clear of Olympus Mons`,
      );
      for (const b of profile.basins) {
        assert.ok(
          Math.hypot(a.x - b.x, a.z - b.z) > b.radius * 1.1 + a.radius,
          `${a.id} clear of basin ${b.id}`,
        );
      }
    }
    // Areas never overlap each other.
    for (let i = 0; i < areas.length; i++) {
      for (let j = i + 1; j < areas.length; j++) {
        const d = Math.hypot(areas[i].x - areas[j].x, areas[i].z - areas[j].z);
        assert.ok(d > areas[i].radius + areas[j].radius + 4, `${areas[i].id} clear of ${areas[j].id}`);
      }
    }
  });

  it('miningAreaAt finds the area a point stands in', () => {
    const a = areas[0];
    assert.equal(miningAreaAt(a.x, a.z, areas).id, a.id);
    assert.equal(miningAreaAt(0, 0, areas), null);
  });

  it('areas are deterministic per seed', () => {
    const again = miningAreasFor(generateMarsProfile(MARS2_SEED));
    assert.deepEqual(again, areas);
  });
});

describe('land plots', () => {
  it('three mine plots inside every mining area', () => {
    for (const a of areas) {
      const minePlots = plots.filter((p) => p.areaId === a.id);
      assert.equal(minePlots.length, 3, `${a.id} has 3 mine plots`);
      for (const p of minePlots) {
        assert.equal(p.kind, 'mine');
        assert.ok(Math.hypot(p.x - a.x, p.z - a.z) < a.radius, 'plot inside its area');
      }
    }
  });

  it('barracks plots ring the outpost, outside every mining area', () => {
    const barracks = plots.filter((p) => p.kind === 'barracks');
    assert.ok(barracks.length >= 4, `${barracks.length} barracks plots`);
    for (const p of barracks) {
      assert.equal(miningAreaAt(p.x, p.z, areas), null, 'barracks plot outside mining areas');
      assert.ok(Math.hypot(p.x, p.z) + PLOT_SIZE_M / 2 <= WORLD_RADIUS, 'inside the rim');
    }
  });

  it('plots never overlap each other', () => {
    for (let i = 0; i < plots.length; i++) {
      for (let j = i + 1; j < plots.length; j++) {
        const dx = Math.abs(plots[i].x - plots[j].x);
        const dz = Math.abs(plots[i].z - plots[j].z);
        assert.ok(dx >= PLOT_SIZE_M || dz >= PLOT_SIZE_M, `${plots[i].id} clear of ${plots[j].id}`);
      }
    }
  });

  it('plots are deterministic per seed', () => {
    assert.deepEqual(plotsFor(generateMarsProfile(MARS2_SEED)), plots);
  });

  it('plotAt finds the plot a point stands on', () => {
    const p = plots[0];
    assert.equal(plotAt(p.x, p.z, plots).id, p.id);
    assert.equal(plotAt(0, 0, plots), null);
  });
});

describe('build rules', () => {
  it('a mine builds on a mine plot — and only there', () => {
    const st = emptyBuildState();
    const minePlot = plots.find((p) => p.kind === 'mine');
    const res = buildMine(st, plots, minePlot.id, richWallet(), 1000);
    assert.equal(res.ok, true);
    assert.equal(res.state.buildings.length, 1);
    assert.equal(res.state.buildings[0].kind, 'mine');
    assert.equal(res.state.buildings[0].tier, 1);
    // The first mine in an area stakes a free claim.
    assert.deepEqual(res.wallet, richWallet());
  });

  it('a mine refuses a barracks plot', () => {
    const st = emptyBuildState();
    const bp = plots.find((p) => p.kind === 'barracks');
    const res = buildMine(st, plots, bp.id, richWallet(), 1000);
    assert.equal(res.ok, false);
    assert.match(res.reason, /mining area/);
  });

  it('a second mine in the same area costs 20 iron ore', () => {
    let st = emptyBuildState();
    const areaPlots = plots.filter((p) => p.kind === 'mine' && p.areaId === areas[0].id);
    const first = buildMine(st, plots, areaPlots[0].id, richWallet(), 1000);
    assert.equal(first.ok, true);
    st = first.state;
    const second = buildMine(st, plots, areaPlots[1].id, richWallet(), 2000);
    assert.equal(second.ok, true);
    assert.equal(second.wallet['iron-ore'], 1000 - EXTRA_MINE_COST[0].qty);
  });

  it('a second mine in the same area refuses a broke wallet', () => {
    let st = emptyBuildState();
    const areaPlots = plots.filter((p) => p.kind === 'mine' && p.areaId === areas[0].id);
    st = buildMine(st, plots, areaPlots[0].id, richWallet(), 1000).state;
    const res = buildMine(st, plots, areaPlots[1].id, {}, 2000);
    assert.equal(res.ok, false);
    assert.equal(res.state.buildings.length, 1);
  });

  it('barracks build on a barracks plot — and only there', () => {
    const st = emptyBuildState();
    const bp = plots.find((p) => p.kind === 'barracks');
    const res = buildBarracks(st, plots, bp.id, richWallet(), 1000);
    assert.equal(res.ok, true);
    assert.equal(res.wallet['iron-ore'], 1000 - 30);
    assert.equal(res.wallet.silicon, 1000 - 15);
    const wrong = buildBarracks(emptyBuildState(), plots, plots.find((p) => p.kind === 'mine').id, richWallet(), 1000);
    assert.equal(wrong.ok, false);
    assert.match(wrong.reason, /mining areas/);
  });

  it('one building per plot — a second build on the same plot refuses', () => {
    let st = emptyBuildState();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 1000).state;
    const res = buildMine(st, plots, minePlot.id, richWallet(), 2000);
    assert.equal(res.ok, false);
    assert.equal(st.buildings.length, 1);
  });
});

describe('upgrades — bigger, better output', () => {
  it('upgrade costs materials and raises tier, scale and output', () => {
    let st = emptyBuildState();
    const minePlot = plots.find((p) => p.kind === 'mine');
    const built = buildMine(st, plots, minePlot.id, richWallet(), 1000);
    st = built.state;
    const b = st.buildings[0];
    assert.equal(mineOutputPerMin(b), MINE_OUTPUT_PER_MIN[0]);
    const up = upgradeBuilding(st, b.id, richWallet(), 2000);
    assert.equal(up.ok, true);
    const upB = buildingById(up.state, b.id);
    assert.equal(upB.tier, 2);
    assert.ok(MINE_OUTPUT_PER_MIN[1] > MINE_OUTPUT_PER_MIN[0]);
    assert.ok(BUILDING_SCALE.mine[1] > BUILDING_SCALE.mine[0]);
    assert.equal(up.wallet['iron-ore'], 1000 - 40);
    assert.equal(up.wallet.silicon, 1000 - 20);
  });

  it('a mine tops out at tier 3', () => {
    let st = emptyBuildState();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 1000).state;
    const b = st.buildings[0];
    st = upgradeBuilding(st, b.id, richWallet(), 2000).state;
    st = upgradeBuilding(st, b.id, richWallet(), 3000).state;
    assert.equal(buildingById(st, b.id).tier, MAX_TIER);
    const top = upgradeBuilding(st, b.id, richWallet(), 4000);
    assert.equal(top.ok, false);
    assert.match(top.reason, /top tier/);
  });

  it('upgrade refuses a broke wallet and leaves the building alone', () => {
    let st = emptyBuildState();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 1000).state;
    const b = st.buildings[0];
    const res = upgradeBuilding(st, b.id, {}, 2000);
    assert.equal(res.ok, false);
    assert.equal(buildingById(res.state, b.id).tier, 1);
  });
});

describe('crew — barracks recruit, mines put them to work', () => {
  function withBarracks() {
    let st = emptyBuildState();
    const bp = plots.find((p) => p.kind === 'barracks');
    st = buildBarracks(st, plots, bp.id, richWallet(), 1000).state;
    return st;
  }

  it('no barracks, no crew', () => {
    const res = recruitCrew(emptyBuildState(), richWallet());
    assert.equal(res.ok, false);
    assert.match(res.reason, /barracks first/);
  });

  it('recruit costs materials and raises the crew total', () => {
    const st = withBarracks();
    const res = recruitCrew(st, richWallet());
    assert.equal(res.ok, true);
    assert.equal(res.state.crewTotal, 1);
    assert.equal(res.wallet['water-ice'], 1000 - CREW_RECRUIT_COST[0].qty);
    assert.equal(res.wallet['iron-ore'], 1000 - CREW_RECRUIT_COST[1].qty);
  });

  it('crew cap is the barracks capacity — a tier-1 barracks houses 4', () => {
    let st = withBarracks();
    assert.equal(barracksCapacity(st), BARRACKS_CREW_CAPACITY[0]);
    for (let i = 0; i < 4; i++) {
      const res = recruitCrew(st, richWallet());
      assert.equal(res.ok, true);
      st = res.state;
    }
    const full = recruitCrew(st, richWallet());
    assert.equal(full.ok, false);
    assert.match(full.reason, /full/);
  });

  it('assigned crew raise a mine’s output by 1/min each', () => {
    let st = withBarracks();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 1000).state;
    st = recruitCrew(st, richWallet()).state;
    st = recruitCrew(st, richWallet()).state;
    const b = st.buildings.find((x) => x.kind === 'mine');
    const base = mineOutputPerMin(b);
    const assigned = assignCrew(st, b.id, 2);
    assert.equal(assigned.ok, true);
    assert.equal(mineOutputPerMin(buildingById(assigned.state, b.id)), base + 2 * CREW_OUTPUT_PER_MIN);
    assert.equal(crewIdle(assigned.state), 0);
  });

  it('a mine’s crew slots cap the assignment — tier 1 holds 2', () => {
    let st = withBarracks();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 1000).state;
    for (let i = 0; i < 4; i++) st = recruitCrew(st, richWallet()).state;
    const b = st.buildings.find((x) => x.kind === 'mine');
    const res = assignCrew(st, b.id, 3);
    assert.equal(res.ok, false);
    assert.match(res.reason, /holds 2/);
  });

  it('crew can be pulled off a mine', () => {
    let st = withBarracks();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 1000).state;
    st = recruitCrew(st, richWallet()).state;
    const b = st.buildings.find((x) => x.kind === 'mine');
    st = assignCrew(st, b.id, 1).state;
    const off = assignCrew(st, b.id, -1);
    assert.equal(off.ok, true);
    assert.equal(buildingById(off.state, b.id).crew, 0);
    assert.equal(crewIdle(off.state), 1);
  });
});

describe('mining — accrue and collect the shared materials', () => {
  it('a mine accrues its area’s material over time, capped at capacity', () => {
    let st = emptyBuildState();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 0).state;
    const b = st.buildings[0];
    const after = tickBuildings(st, 30 * 60000); // 30 minutes
    const ticked = buildingById(after, b.id);
    assert.equal(ticked.accrued, Math.min(MINE_CAPACITY[0], MINE_OUTPUT_PER_MIN[0] * 30));
    const capped = tickBuildings(st, 1000 * 60000); // far future
    assert.equal(buildingById(capped, b.id).accrued, MINE_CAPACITY[0]);
  });

  it('collect banks the accrued yield as the area’s material and resets', () => {
    let st = emptyBuildState();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 0).state;
    const b = st.buildings[0];
    st = tickBuildings(st, 10 * 60000);
    const res = collectBuilding(st, b.id);
    assert.equal(res.ok, true);
    assert.equal(res.qty, MINE_OUTPUT_PER_MIN[0] * 10);
    assert.equal(mineMaterialId(b, plots), miningAreaAt(minePlot.x, minePlot.z, areas).materialId);
    assert.equal(buildingById(res.state, b.id).accrued, 0);
    // The yield banks as a shared backpack material.
    const item = materialItemFor(mineMaterialId(b, plots), res.qty, 'mars-2-mine');
    assert.equal(item.kind, 'material');
  });

  it('collect with nothing accrued refuses', () => {
    let st = emptyBuildState();
    const minePlot = plots.find((p) => p.kind === 'mine');
    st = buildMine(st, plots, minePlot.id, richWallet(), 0).state;
    const res = collectBuilding(st, st.buildings[0].id);
    assert.equal(res.ok, false);
  });

  it('wallet helpers spend and add only registered materials', () => {
    assert.equal(walletHas({ 'iron-ore': 5 }, [{ id: 'iron-ore', qty: 5 }]), true);
    assert.equal(walletHas({ 'iron-ore': 4 }, [{ id: 'iron-ore', qty: 5 }]), false);
    assert.equal(walletSpend({ 'iron-ore': 5 }, [{ id: 'iron-ore', qty: 5 }])['iron-ore'], 0);
    assert.equal(walletSpend({ 'iron-ore': 4 }, [{ id: 'iron-ore', qty: 5 }]), null);
    const added = walletAdd({}, [{ id: 'iron-ore', qty: 3 }, { id: 'nope', qty: 9 }]);
    assert.deepEqual(added, { 'iron-ore': 3 });
  });
});

describe('state persistence', () => {
  it('sanitize drops junk and keeps real buildings', () => {
    const st = sanitizeBuildState({
      buildings: [
        { id: 'b-1', plotId: 'mine-iron-ore-1', kind: 'mine', tier: 2, crew: 1, accrued: 12.5, lastTickMs: 123 },
        { id: 'b-2', plotId: 'x', kind: 'castle', tier: 9 },
        null,
      ],
      crewTotal: 3, nextBuilding: 2,
    });
    assert.equal(st.buildings.length, 1);
    assert.equal(st.buildings[0].tier, 2);
    assert.equal(st.crewTotal, 3);
  });

  it('sanitize drops buildings on plots that no longer exist', () => {
    const st = sanitizeBuildState({
      buildings: [
        { id: 'b-1', plotId: 'mine-iron-ore-1', kind: 'mine', tier: 1, crew: 0, accrued: 5, lastTickMs: 123 },
        { id: 'b-2', plotId: 'mine-iron-flats-1', kind: 'mine', tier: 1, crew: 0, accrued: 60, lastTickMs: 123 },
        { id: 'b-3', plotId: 'barracks-1', kind: 'mine', tier: 1, crew: 0, accrued: 0, lastTickMs: 123 },
      ],
    }, plots);
    // b-1 is a real mine plot, b-2 names a plot that never existed,
    // b-3 is a mine on a barracks plot — only b-1 survives.
    assert.equal(st.buildings.length, 1);
    assert.equal(st.buildings[0].id, 'b-1');
  });

  it('storage key is the Mars 2 build-mode key', () => {
    assert.equal(BUILD_MODE_STORAGE_KEY, 'mars2:build-mode:v1');
  });
});

describe('wiring — page + scene', () => {
  it('the page has a BUILD orb, build state, and the panel in the stage', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('BUILD'), 'BUILD orb label');
    assert.ok(page.includes('buildMode'), 'buildMode state');
    assert.ok(page.includes('BuildPanel'), 'BuildPanel rendered');
    assert.ok(page.includes('loadBuildState'), 'build state loads');
    assert.ok(page.includes('tickBuildings'), 'mines tick on the page');
    assert.ok(page.includes('updateBackpack'), 'materials bank into the backpack');
    assert.ok(page.includes('buildMine(') || page.includes('handleBuildMine'), 'mine build handler');
    assert.ok(page.includes('onSelectPlot'), 'plot selection wired');
  });

  it('the scene renders the build layer with the build props', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('BuildModeLayer'), 'BuildModeLayer imported + rendered');
    assert.ok(scene.includes('buildMode={'), 'buildMode prop passed through');
    assert.ok(scene.includes('buildPlots'), 'plots passed through');
    assert.ok(scene.includes('buildAreas'), 'areas passed through');
  });

  it('the layer draws plots only in build mode and buildings always', () => {
    const layer = read('components/mars2/BuildModeLayer.jsx');
    assert.ok(layer.includes('buildMode &&'), 'plots/areas gated on buildMode');
    assert.ok(layer.includes('MineMesh'), 'mine mesh');
    assert.ok(layer.includes('BarracksMesh'), 'barracks mesh');
    assert.ok(layer.includes('BUILDING_SCALE'), 'tier scale applied');
  });

  it('the panel shows the shared wallet, crew, and all actions', () => {
    const panel = read('components/mars2/BuildPanel.jsx');
    assert.ok(panel.includes('MATERIALS'), 'wallet shown');
    assert.ok(panel.includes('RECRUIT'), 'recruit action');
    assert.ok(panel.includes('COLLECT'), 'collect action');
    assert.ok(panel.includes('UPGRADE'), 'upgrade action');
    assert.ok(panel.includes('OrbButton'), 'circle orbs for actions');
  });

  it('the panel collapses to a chip so the plots stay visible', () => {
    const panel = read('components/mars2/BuildPanel.jsx');
    assert.ok(panel.includes('collapsed'), 'collapsed prop read');
    assert.ok(panel.includes('Open build panel'), 'chip reopens the panel');
    assert.ok(panel.includes('Collapse build panel'), 'full panel collapses, not exits');
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('buildPanelCollapsed'), 'page owns the collapse state');
    assert.ok(page.includes('onCollapse'), 'page wires collapse');
    assert.ok(page.includes('handleSelectPlot'), 'tapping a plot reopens the panel');
  });
});
