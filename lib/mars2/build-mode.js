// lib/mars2/build-mode.js
// MARS 2 — BUILD MODE (Merlin, Nov 17, 2026).
//
// Enter build mode and the land shows its plots: claimable squares
// you build on. Mines go ONLY in the designated mining areas —
// four seeded areas, one material each — barracks go anywhere else.
// Barracks recruit crew; crew work the mines and raise output.
// Every building upgrades: bigger, better output. The materials
// are the SHARED ones (lib/economy/materials.js) — the same ids
// the rest of the ecosystem collects — banked into the backpack,
// spent from the backpack. Costs are materials only (no server
// gold moves here); the loop is device-local, like the orb
// wallets, and honest about it: output accrues only while the
// page is open (no offline progress).
//
// Pure, node-safe: no DOM, no React, no THREE. The scene and the
// page share these numbers; tests drive the engine directly.

import { getTerrainHeight } from '../mars/engine.js';
import { monsSite, MONS_RADIUS } from '../mars/cgi.js';
import { outpostSite, WORLD_RADIUS, WALKER_SPAWN } from './world.js';
import { materialById } from '../economy/materials.js';

/** localStorage key for the build state (device-local). */
export const BUILD_MODE_STORAGE_KEY = 'mars2:build-mode:v1';

/** One plot is an 8×8 m square; one building per plot. */
export const PLOT_SIZE_M = 8;
/** A mining area is a 12 m radius disc of one material. */
export const MINING_AREA_RADIUS_M = 12;

// ── Mining areas ─────────────────────────────────────────────────
// Four seeded areas, one material each. Candidates are fixed
// angles/distances; the first clear slot per material wins —
// clear of the basins, the outpost, the walker spawn, Olympus
// Mons and the other areas, inside the world rim. Deterministic
// per profile, so the areas never move under a builder.
const MINING_AREA_CANDIDATES = Object.freeze([
  Object.freeze({
    id: 'iron-flats', name: 'Iron Flats', materialId: 'iron-ore',
    slots: Object.freeze([[3.9, 58], [4.2, 55], [3.5, 60], [4.5, 52]]),
  }),
  Object.freeze({
    id: 'silica-dunes', name: 'Silica Dunes', materialId: 'silicon',
    slots: Object.freeze([[5.5, 55], [5.9, 52], [0.3, 58], [5.2, 58]]),
  }),
  Object.freeze({
    id: 'titanium-ridge', name: 'Titanium Ridge', materialId: 'titanium-ore',
    slots: Object.freeze([[1.2, 56], [0.9, 58], [1.6, 54], [0.6, 60]]),
  }),
  Object.freeze({
    id: 'ice-cap', name: 'Ice Cap', materialId: 'water-ice',
    slots: Object.freeze([[2.2, 54], [2.6, 52], [1.9, 58], [2.9, 50]]),
  }),
]);

function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function slotClear(x, z, profile, outpost, mons, taken) {
  if (Math.hypot(x, z) + MINING_AREA_RADIUS_M > WORLD_RADIUS - 2) return false;
  if (dist2(x, z, outpost.x, outpost.z) < MINING_AREA_RADIUS_M + 22) return false;
  if (dist2(x, z, WALKER_SPAWN.x, WALKER_SPAWN.z) < MINING_AREA_RADIUS_M + 4) return false;
  if (dist2(x, z, mons.x, mons.z) < MONS_RADIUS + MINING_AREA_RADIUS_M) return false;
  for (const b of profile.basins || []) {
    if (dist2(x, z, b.x, b.z) < b.radius * 1.1 + MINING_AREA_RADIUS_M) return false;
  }
  for (const t of taken) {
    if (dist2(x, z, t.x, t.z) < MINING_AREA_RADIUS_M * 2 + 4) return false;
  }
  return true;
}

/** The four designated mining areas for one profile. */
export function miningAreasFor(profile) {
  const outpost = outpostSite(profile);
  const mons = monsSite(profile);
  const areas = [];
  for (const cand of MINING_AREA_CANDIDATES) {
    let placed = null;
    for (const [angle, dist] of cand.slots) {
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (slotClear(x, z, profile, outpost, mons, areas)) {
        placed = {
          id: cand.id, name: cand.name, materialId: cand.materialId,
          x, z, y: getTerrainHeight(x, z, profile),
          radius: MINING_AREA_RADIUS_M,
        };
        break;
      }
    }
    // A material with no clear slot still exists as an area at
    // its first slot — the world must always offer all four
    // materials; the slot is the least-bad ground, never a crash.
    if (!placed) {
      const [angle, dist] = cand.slots[0];
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      placed = {
        id: cand.id, name: cand.name, materialId: cand.materialId,
        x, z, y: getTerrainHeight(x, z, profile),
        radius: MINING_AREA_RADIUS_M,
      };
    }
    areas.push(placed);
  }
  return areas;
}

/** The mining area a point stands in, or null. */
export function miningAreaAt(x, z, areas) {
  for (const a of areas || []) {
    if (dist2(x, z, a.x, a.z) <= a.radius) return a;
  }
  return null;
}

// ── Plots ────────────────────────────────────────────────────────
// Mine plots live inside the mining areas (3 per area); barracks
// plots are the first clear ground on concentric candidate rings
// around the world centre — the outpost sits between two basins,
// so a ring around it leaves too little clear ground. Six plots,
// spread out, each clear of the basins, the Mons, the mining
// areas, the outpost and the spawn. One building per plot.
// Plots are deterministic per profile — the land never reshuffles.
const BARRACKS_PLOT_COUNT = 6;
const BARRACKS_RING_RADII_M = Object.freeze([24, 30, 36, 42, 48, 54]);

/** All build plots for one profile: mine plots + barracks plots. */
export function plotsFor(profile) {
  const areas = miningAreasFor(profile);
  const outpost = outpostSite(profile);
  const mons = monsSite(profile);
  const plots = [];
  for (const area of areas) {
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI / 2) + (i * (Math.PI * 2 / 3));
      const x = area.x + Math.cos(angle) * 6;
      const z = area.z + Math.sin(angle) * 6;
      plots.push({
        id: `mine-${area.materialId}-${i + 1}`,
        kind: 'mine', areaId: area.id,
        x, z, y: getTerrainHeight(x, z, profile),
        size: PLOT_SIZE_M,
      });
    }
  }
  const barracks = [];
  for (const ringR of BARRACKS_RING_RADII_M) {
    if (barracks.length >= BARRACKS_PLOT_COUNT) break;
    for (let step = 0; step < 12 && barracks.length < BARRACKS_PLOT_COUNT; step++) {
      const angle = step * (Math.PI * 2 / 12);
      const x = Math.cos(angle) * ringR;
      const z = Math.sin(angle) * ringR;
      if (Math.hypot(x, z) + PLOT_SIZE_M / 2 > WORLD_RADIUS - 2) continue;
      if (dist2(x, z, mons.x, mons.z) < MONS_RADIUS + PLOT_SIZE_M) continue;
      if (dist2(x, z, outpost.x, outpost.z) < 16) continue;
      if (dist2(x, z, WALKER_SPAWN.x, WALKER_SPAWN.z) < 6) continue;
      let inBasin = false;
      for (const b of profile.basins || []) {
        if (dist2(x, z, b.x, b.z) < b.radius * 1.1 + PLOT_SIZE_M / 2) { inBasin = true; break; }
      }
      if (inBasin) continue;
      if (miningAreaAt(x, z, areas)) continue;
      let tooClose = false;
      for (const p of [...plots, ...barracks]) {
        if (dist2(x, z, p.x, p.z) < 11) { tooClose = true; break; }
      }
      if (tooClose) continue;
      barracks.push({
        id: `barracks-${barracks.length + 1}`, kind: 'barracks', areaId: null,
        x, z, y: getTerrainHeight(x, z, profile),
        size: PLOT_SIZE_M,
      });
    }
  }
  return [...plots, ...barracks];
}

/** The plot a point stands on, or null. */
export function plotAt(x, z, plots) {
  for (const p of plots || []) {
    if (Math.abs(x - p.x) <= p.size / 2 && Math.abs(z - p.z) <= p.size / 2) return p;
  }
  return null;
}

// ── Buildings ────────────────────────────────────────────────────
// Mine output per minute by tier; capacity before it must be
// collected; crew slots per mine tier; barracks crew capacity
// per tier. Upgrades make the building bigger (scale) and raise
// output — the two numbers Merlin asked for.
export const MINE_OUTPUT_PER_MIN = Object.freeze([2, 5, 10]);
export const MINE_CAPACITY = Object.freeze([60, 150, 300]);
export const MINE_CREW_SLOTS = Object.freeze([2, 4, 6]);
export const BARRACKS_CREW_CAPACITY = Object.freeze([4, 8, 12]);
export const BUILDING_SCALE = Object.freeze({
  mine: Object.freeze([1, 1.35, 1.7]),
  barracks: Object.freeze([1, 1.3, 1.6]),
});
export const MAX_TIER = 3;
/** One crew member adds this much output per minute to its mine. */
export const CREW_OUTPUT_PER_MIN = 1;

/** The build cost of a building at a tier (materials only). */
export function buildCost(kind, tier) {
  if (kind === 'mine') {
    if (tier === 1) return []; // the first mine in an area stakes a free claim
    if (tier === 2) return [{ id: 'iron-ore', qty: 40 }, { id: 'silicon', qty: 20 }];
    return [{ id: 'iron-ore', qty: 100 }, { id: 'silicon', qty: 50 }, { id: 'titanium-ore', qty: 25 }];
  }
  if (kind === 'barracks') {
    if (tier === 1) return [{ id: 'iron-ore', qty: 30 }, { id: 'silicon', qty: 15 }];
    if (tier === 2) return [{ id: 'iron-ore', qty: 40 }, { id: 'water-ice', qty: 20 }];
    return [{ id: 'iron-ore', qty: 80 }, { id: 'silicon', qty: 40 }, { id: 'titanium-ore', qty: 20 }];
  }
  return null;
}

/** The cost of an extra mine in an area that already has one. */
export const EXTRA_MINE_COST = Object.freeze([{ id: 'iron-ore', qty: 20 }]);

/** The cost of recruiting one crew member. */
export const CREW_RECRUIT_COST = Object.freeze([
  { id: 'water-ice', qty: 10 }, { id: 'iron-ore', qty: 5 },
]);

/** The cost of upgrading a building from its current tier. */
export function upgradeCost(building) {
  if (!building || building.tier >= MAX_TIER) return null;
  return buildCost(building.kind, building.tier + 1);
}

// ── Wallet helpers (plain { materialId: qty } maps) ─────────────
export function walletHas(wallet, costs) {
  const w = wallet || {};
  return (costs || []).every((c) => (w[c.id] || 0) >= c.qty);
}

export function walletSpend(wallet, costs) {
  if (!walletHas(wallet, costs)) return null;
  const next = { ...(wallet || {}) };
  for (const c of costs || []) next[c.id] = (next[c.id] || 0) - c.qty;
  return next;
}

export function walletAdd(wallet, yields) {
  const next = { ...(wallet || {}) };
  for (const y of yields || []) {
    if (!y || !materialById(y.id) || !(y.qty > 0)) continue;
    next[y.id] = (next[y.id] || 0) + y.qty;
  }
  return next;
}

// ── State ────────────────────────────────────────────────────────
export function emptyBuildState() {
  return { v: 1, buildings: [], crewTotal: 0, nextBuilding: 1 };
}

export function sanitizeBuildState(raw, plots) {
  const st = (raw && typeof raw === 'object') ? raw : {};
  const buildings = Array.isArray(st.buildings) ? st.buildings : [];
  const clean = [];
  for (const b of buildings) {
    if (!b || typeof b !== 'object') continue;
    if (b.kind !== 'mine' && b.kind !== 'barracks') continue;
    if (typeof b.plotId !== 'string' || typeof b.id !== 'string') continue;
    // When the land is known, a building on a plot that no longer
    // exists (or of the wrong kind for that plot) is stale data —
    // drop it, or a mine with no plot would accrue yield that can
    // never be banked.
    if (plots) {
      const plot = plots.find((p) => p.id === b.plotId);
      if (!plot || plot.kind !== b.kind) continue;
    }
    const tier = [1, 2, 3].includes(b.tier) ? b.tier : 1;
    clean.push({
      id: b.id, plotId: b.plotId, kind: b.kind, tier,
      crew: Math.max(0, Math.floor(b.crew || 0)),
      accrued: Math.max(0, Number(b.accrued) || 0),
      lastTickMs: Number.isFinite(b.lastTickMs) ? b.lastTickMs : Date.now(),
    });
  }
  return {
    v: 1,
    buildings: clean,
    crewTotal: Math.max(0, Math.floor(st.crewTotal || 0)),
    nextBuilding: Math.max(1, Math.floor(st.nextBuilding || 1)),
  };
}

export function loadBuildState(plots) {
  try {
    if (typeof localStorage === 'undefined') return emptyBuildState();
    const raw = localStorage.getItem(BUILD_MODE_STORAGE_KEY);
    return raw ? sanitizeBuildState(JSON.parse(raw), plots) : emptyBuildState();
  } catch {
    return emptyBuildState();
  }
}

export function saveBuildState(state) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(BUILD_MODE_STORAGE_KEY, JSON.stringify(sanitizeBuildState(state)));
  } catch {
    // storage unavailable — the build just won't persist on-device
  }
}

// ── Queries ──────────────────────────────────────────────────────
export function buildingById(state, id) {
  return (state.buildings || []).find((b) => b.id === id) || null;
}

export function buildingOnPlot(state, plotId) {
  return (state.buildings || []).find((b) => b.plotId === plotId) || null;
}

export function minesInArea(state, plots, areaId) {
  const plotIds = new Set((plots || []).filter((p) => p.areaId === areaId).map((p) => p.id));
  return (state.buildings || []).filter((b) => b.kind === 'mine' && plotIds.has(b.plotId));
}

export function barracksCapacity(state) {
  return (state.buildings || [])
    .filter((b) => b.kind === 'barracks')
    .reduce((sum, b) => sum + BARRACKS_CREW_CAPACITY[b.tier - 1], 0);
}

export function crewAssignedTotal(state) {
  return (state.buildings || []).reduce((sum, b) => sum + (b.crew || 0), 0);
}

export function crewIdle(state) {
  return Math.max(0, (state.crewTotal || 0) - crewAssignedTotal(state));
}

export function mineOutputPerMin(building) {
  if (!building || building.kind !== 'mine') return 0;
  return MINE_OUTPUT_PER_MIN[building.tier - 1] + (building.crew || 0) * CREW_OUTPUT_PER_MIN;
}

// ── Actions (pure: each returns { ok, reason?, state, wallet? }) ─
function fail(reason, state, wallet) {
  return { ok: false, reason, state, wallet };
}

/** Place a mine on a plot inside a mining area. */
export function buildMine(state, plots, plotId, wallet, nowMs = Date.now()) {
  const st = sanitizeBuildState(state);
  const plot = (plots || []).find((p) => p.id === plotId);
  if (!plot) return fail('No such plot.', st, wallet);
  if (plot.kind !== 'mine') return fail('Mines go in a mining area — this plot is for barracks.', st, wallet);
  if (buildingOnPlot(st, plotId)) return fail('That plot already has a building.', st, wallet);
  const existing = minesInArea(st, plots, plot.areaId);
  const cost = existing.length === 0 ? [] : [...EXTRA_MINE_COST];
  if (!walletHas(wallet, cost)) {
    return fail('Not enough iron ore for another mine here — the first claim in an area is free.', st, wallet);
  }
  const nextWallet = walletSpend(wallet, cost);
  const building = {
    id: `b-${st.nextBuilding}`, plotId, kind: 'mine', tier: 1,
    crew: 0, accrued: 0, lastTickMs: nowMs,
  };
  return {
    ok: true, state: { ...st, buildings: [...st.buildings, building], nextBuilding: st.nextBuilding + 1 },
    wallet: nextWallet, building,
  };
}

/** Place barracks on a non-mining plot. */
export function buildBarracks(state, plots, plotId, wallet, nowMs = Date.now()) {
  const st = sanitizeBuildState(state);
  const plot = (plots || []).find((p) => p.id === plotId);
  if (!plot) return fail('No such plot.', st, wallet);
  if (plot.kind !== 'barracks') return fail('Barracks go outside the mining areas — this plot is for a mine.', st, wallet);
  if (buildingOnPlot(st, plotId)) return fail('That plot already has a building.', st, wallet);
  const cost = buildCost('barracks', 1);
  if (!walletHas(wallet, cost)) return fail('Not enough materials for barracks — 30 iron ore and 15 silicon.', st, wallet);
  const nextWallet = walletSpend(wallet, cost);
  const building = {
    id: `b-${st.nextBuilding}`, plotId, kind: 'barracks', tier: 1,
    crew: 0, accrued: 0, lastTickMs: nowMs,
  };
  return {
    ok: true, state: { ...st, buildings: [...st.buildings, building], nextBuilding: st.nextBuilding + 1 },
    wallet: nextWallet, building,
  };
}

/** Upgrade a building one tier — bigger, better output. */
export function upgradeBuilding(state, buildingId, wallet, nowMs = Date.now()) {
  const st = sanitizeBuildState(state);
  const building = buildingById(st, buildingId);
  if (!building) return fail('No such building.', st, wallet);
  const cost = upgradeCost(building);
  if (!cost) return fail('Already at the top tier.', st, wallet);
  if (!walletHas(wallet, cost)) return fail('Not enough materials for that upgrade.', st, wallet);
  const nextWallet = walletSpend(wallet, cost);
  const next = {
    ...st,
    buildings: st.buildings.map((b) => (b.id === buildingId ? { ...b, tier: b.tier + 1, lastTickMs: nowMs } : b)),
  };
  return { ok: true, state: next, wallet: nextWallet };
}

/** Recruit one crew member at the barracks. */
export function recruitCrew(state, wallet) {
  const st = sanitizeBuildState(state);
  if (barracksCapacity(st) <= 0) return fail('Build barracks first — crew need somewhere to live.', st, wallet);
  if (st.crewTotal >= barracksCapacity(st)) return fail('The barracks are full — upgrade them for more crew.', st, wallet);
  if (!walletHas(wallet, CREW_RECRUIT_COST)) return fail('Not enough materials to recruit — 10 water ice and 5 iron ore per crew.', st, wallet);
  const nextWallet = walletSpend(wallet, CREW_RECRUIT_COST);
  return { ok: true, state: { ...st, crewTotal: st.crewTotal + 1 }, wallet: nextWallet };
}

/** Assign idle crew to a mine (+1 output/min each) or pull them off. */
export function assignCrew(state, buildingId, delta) {
  const st = sanitizeBuildState(state);
  const building = buildingById(st, buildingId);
  if (!building) return fail('No such building.', st);
  if (building.kind !== 'mine') return fail('Crew work the mines — barracks only house them.', st);
  const want = (building.crew || 0) + delta;
  if (want < 0) return fail('No crew to pull off that mine.', st);
  if (want > MINE_CREW_SLOTS[building.tier - 1]) {
    return fail(`That mine holds ${MINE_CREW_SLOTS[building.tier - 1]} crew — upgrade it for more hands.`, st);
  }
  if (delta > 0 && crewIdle(st) < delta) return fail('No idle crew — recruit more at the barracks.', st);
  const next = {
    ...st,
    buildings: st.buildings.map((b) => (b.id === buildingId ? { ...b, crew: want } : b)),
  };
  return { ok: true, state: next };
}

/**
 * Advance every mine's accrued output to nowMs. Output accrues
 * only while the page is open — the tick runs on the live page,
 * never offline.
 */
export function tickBuildings(state, nowMs = Date.now()) {
  const st = sanitizeBuildState(state);
  const buildings = st.buildings.map((b) => {
    if (b.kind !== 'mine') return b;
    const elapsedMin = Math.max(0, (nowMs - (Number.isFinite(b.lastTickMs) ? b.lastTickMs : nowMs)) / 60000);
    const cap = MINE_CAPACITY[b.tier - 1];
    return {
      ...b,
      accrued: Math.min(cap, b.accrued + mineOutputPerMin(b) * elapsedMin),
      lastTickMs: nowMs,
    };
  });
  return { ...st, buildings };
}

/** Collect a mine's accrued output into yields (backpack-bound). */
export function collectBuilding(state, buildingId) {
  const st = sanitizeBuildState(state);
  const building = buildingById(st, buildingId);
  if (!building) return fail('No such building.', st);
  if (building.kind !== 'mine') return fail('Only mines hold materials to collect.', st);
  const qty = Math.floor(building.accrued || 0);
  if (qty < 1) return fail('Nothing to collect yet — give the mine time to work.', st);
  const next = {
    ...st,
    buildings: st.buildings.map((b) => (b.id === buildingId ? { ...b, accrued: (b.accrued || 0) - qty } : b)),
  };
  return { ok: true, state: next, qty };
}

/** The material a mine yields — from its plot's mining area. */
export function mineMaterialId(building, plots) {
  if (!building || building.kind !== 'mine') return null;
  const plot = (plots || []).find((p) => p.id === building.plotId);
  if (!plot || !plot.areaId) return null;
  const area = MINING_AREA_CANDIDATES.find((a) => a.id === plot.areaId);
  return area ? area.materialId : null;
}
