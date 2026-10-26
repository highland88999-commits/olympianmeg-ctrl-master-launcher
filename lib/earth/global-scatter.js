// lib/earth/global-scatter.js — planet-wide population for hub Earth
// (Earth 1 / NexusEarth) ONLY. Never imported by Earth 2 code.
//
// The anchor scatter in lib/earth/placements.js only populates
// pockets around surveyed anchors, so most of the planet read as
// bare. This module adds the everywhere layer, in two parts:
//
// 1. GLOBAL (orbit-visible): a deterministic coarse grid over the
//    whole globe — one candidate cell per species per grid step,
//    thinned by a per-species chance, terrain-filtered, and capped
//    per species. The cap is the performance call: every global
//    instance is drawn by the same single InstancedMesh its anchor
//    scatter already uses (EarthAssets appends these placements to
//    that mesh — no new draw calls), but instance triangles still
//    cost, so the global layer is deliberately coarse. Street-level
//    density comes from part 2, not from here.
// 2. LOCAL (street-level, streaming): a small deterministic disc of
//    placements around any lat/lon the traveler stands on. The
//    EarthLocalScatter component rebuilds it only when the traveler
//    crosses a cell boundary, so walking anywhere on Earth —
//    including the dry seabed — always has trees, rocks and shrubs
//    nearby, without paying for the whole planet at once.
//
// Water is gone on Earth 1 (2026-10-26): the former ocean floor is
// dry, walkable land. Terrain filters therefore treat it as ground
// to populate, not as water to avoid:
//   - 'any'    : every sampled height, seabed included.
//   - 'land'   : above the old sea level only (trees).
//   - 'seabed' : at/below the old sea level (former-water species
//     — icebergs, coral — keep their old-seabed sites, now dry).
//
// REDWATER GUARD (hard): nothing in either layer may land on, cover
// or block the Redwater quicksand journey. The pit sits ~100 m east
// and ~50 m north of the Redwater town centre (53.9486, -113.1067 —
// RedwaterMount's exact centre), i.e. about 53.9490, -113.1052.
// Both layers exclude a generous radius around it, so the pit
// mouth, the walk-up ground, the sink shaft below it and the
// surface above the 2 km tunnel and core stay clear. The tunnel
// and core are underground in any case — surface scatter cannot
// bury them — but the pit mouth itself must stay walkable, and
// it does: no placement is ever generated inside the exclusion.
//
// Pure math, no DOM, no THREE — headless-testable like
// placements.js. No swim, buoyancy or water behaviour anywhere
// in this module: there is no water left to swim in.
import { sampleHeight, TERRAIN_SEA_LEVEL } from '../terrain.js';
import { seededRandom } from './placements.js';

/** Redwater town centre (EarthConsole quick-travel, exact). */
export const REDWATER_TOWN = { lat: 53.9486, lon: -113.1067 };
/** The quicksand pit: town centre + 100 m east + 50 m north
 *  (RedwaterMount derives the same point by great-circle steps;
 *  this degree approximation is within a few metres of it, and
 *  the exclusion radius below is ~2 km, so the approximation
 *  cannot leak a placement onto the pit). */
export const REDWATER_PIT = { lat: 53.9490, lon: -113.1052 };
/** Global-layer exclusion around the pit, in degrees (~2 km). */
export const REDWATER_EXCLUSION_DEG = 0.02;
/** Local-layer exclusion around the pit, in metres. */
export const REDWATER_EXCLUSION_M = 150;

/** Great-circle distance in metres (small-angle haversine). */
export function haversineDegM(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True when a lat/lon falls inside the Redwater guard. */
export function isRedwaterExcluded(lat, lon, radiusM = REDWATER_EXCLUSION_M) {
  return haversineDegM(lat, lon, REDWATER_PIT.lat, REDWATER_PIT.lon) < radiusM;
}

function terrainOk(terrain, heightData, w, h, lat, lon) {
  if (!terrain || terrain === 'any' || !heightData) return true;
  const s = sampleHeight(heightData, w, h, (lon + 180) / 360, (lat + 90) / 180);
  if (terrain === 'land') return s > TERRAIN_SEA_LEVEL;
  if (terrain === 'seabed') return s <= TERRAIN_SEA_LEVEL;
  return true;
}

/** All grid cells for one global pass: latitudes -80..80 (the
 *  polar caps stay bare ice, as the globe already renders them),
 *  longitudes stepped by stepDeg / cos(lat) so cells stay roughly
 *  square in metres. Deterministic order; callers thin by chance
 *  and cap, so the grid itself never needs to be dense. */
export function globalGridCells(stepDeg) {
  const cells = [];
  for (let lat = -80; lat <= 80; lat += stepDeg) {
    const lonStep = Math.max(stepDeg, stepDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    for (let lon = -180; lon < 180; lon += lonStep) {
      cells.push({ lat, lon });
    }
  }
  return cells;
}

/** Global placements for one species.
 *  assetId: seed text (deterministic across loads and visitors).
 *  opts: stepDeg, chance (0..1 keep probability), terrain
 *    ('any' | 'land' | 'seabed'), maxCount (hard cap),
 *    exclusions [{lat, lon, radiusDeg}] (landmark clear ground,
 *    same shape as placements.js).
 *  Returns [{ lat, lon, headingDeg, jitter }] — lat/lon only;
 *  EarthAssets grounds each one through displayPlacement, the
 *  same grounding law as every other placed asset. Seeded
 *  selection (partial Fisher–Yates over the surviving candidates)
 *  keeps the cap unbiased across the globe instead of filling
 *  from the south pole upward. */
export function globalPlacementsFor(assetId, heightData, w, h, opts = {}) {
  const stepDeg = opts.stepDeg ?? 6;
  const chance = opts.chance ?? 0.7;
  const maxCount = opts.maxCount ?? 200;
  const exclusions = opts.exclusions ?? null;
  const rand = seededRandom(`global:${assetId}`);
  const candidates = [];
  for (const cell of globalGridCells(stepDeg)) {
    // Jitter inside the cell so the grid never reads as a lattice.
    const la = cell.lat + (rand() - 0.5) * stepDeg * 0.8;
    const lo = cell.lon + (rand() - 0.5) * stepDeg * 0.8;
    if (la < -82 || la > 82) continue;
    if (rand() > chance) continue;
    if (isRedwaterExcluded(la, lo, REDWATER_EXCLUSION_DEG * 111320)) continue;
    if (exclusions) {
      let blocked = false;
      for (const ex of exclusions) {
        const dx = (lo - ex.lon) * Math.cos((ex.lat * Math.PI) / 180);
        const dy = la - ex.lat;
        if (dx * dx + dy * dy < ex.radiusDeg * ex.radiusDeg) { blocked = true; break; }
      }
      if (blocked) continue;
    }
    if (!terrainOk(opts.terrain ?? 'any', heightData, w, h, la, lo)) continue;
    candidates.push({
      lat: la,
      lon: lo,
      headingDeg: Math.floor(rand() * 360),
      jitter: 0.82 + rand() * 0.36,
    });
  }
  // Cap by seeded selection: unbiased across the whole planet.
  if (candidates.length > maxCount) {
    for (let i = 0; i < maxCount; i++) {
      const j = i + Math.floor(rand() * (candidates.length - i));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    return candidates.slice(0, maxCount);
  }
  return candidates;
}

/** The local disc's cell key: placements are stable while the
 *  traveler stays inside one cell (~280 m at the equator) and
 *  rebuild only on crossing — the same streaming beat as the
 *  street patch's 10 m recenter, coarser because props may pop
 *  less often than ground. */
export const LOCAL_CELL_DEG = 0.0025;
export function localCellKey(lat, lon) {
  return `${Math.floor(lat / LOCAL_CELL_DEG)}:${Math.floor(lon / LOCAL_CELL_DEG)}`;
}

/** Street-level placements around one centre: `count` points in
 *  a disc of `radiusM` metres, deterministic per cell + species
 *  (walking away and back restores the same props), jittered so
 *  no two props stack. The Redwater pit mouth stays clear, and
 *  nothing is placed inside the exclusion even if the traveler
 *  stands on the pit itself — the journey owns that ground.
 *  Returns [{ lat, lon, headingDeg, jitter, distM }]. */
export function localDiscPlacements(speciesId, centerLat, centerLon, count, radiusM) {
  const seed = `${localCellKey(centerLat, centerLon)}:${speciesId}`;
  const rand = seededRandom(seed);
  const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const out = [];
  let guard = 0;
  while (out.length < count && guard < count * 40) {
    guard += 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radiusM;
    const dLat = (r * Math.sin(a)) / 111320;
    const dLon = (r * Math.cos(a)) / (111320 * cosLat);
    const la = centerLat + dLat;
    const lo = centerLon + dLon;
    if (isRedwaterExcluded(la, lo, REDWATER_EXCLUSION_M)) continue;
    out.push({
      lat: la,
      lon: lo,
      headingDeg: Math.floor(rand() * 360),
      jitter: 0.82 + rand() * 0.36,
      distM: r,
    });
  }
  return out;
}
