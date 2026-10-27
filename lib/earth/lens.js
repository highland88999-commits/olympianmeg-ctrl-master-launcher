// lib/earth/lens.js — the satellite detail lens for the hub Earth,
// rebuilt 2026-10-15 (demo flaw E2).
//
// The old lens was a FLAT circle pinned at the focus point with an
// unregistered texture: the tile grid's imagery (a ~0.5° patch at
// zoom 12) was stretched across a ~10.8° disc, so it never matched
// the coastline beneath it, and the displaced terrain (up to ~2.5
// hub units of relief) poked through the flat disc in wedges —
// the "holes" in the demo footage.
//
// This module is the pure half of the fix, headless-testable:
//   - lensTilePlan(): which ESRI tiles to fetch and where each
//     lands on the composited canvas, sized so the grid COVERS
//     the disc's real angular extent at the chosen zoom;
//   - uvForLatLon(): every point of the disc is texture-mapped by
//     its true lat/lon through the slippy-map (mercator) transform,
//     so the imagery registers with the globe beneath it;
//   - buildLensGeometryData(): the disc is DRAPED over the real
//     terrain — every vertex's radius is the heightmap surface
//     radius at its own lat/lon plus a small lift — so terrain can
//     never poke through, and the rim follows the planet's curve.
// The component (NexusEarth) composites the canvas, bakes a radial
// feather into its alpha (no hard matte ring), and wraps the data
// in a BufferGeometry.
import { latLonToVec3, esriTileUrl, EARTH_RADIUS } from '../geo.js';
import { surfaceRadiusAt } from './placements.js';
import { tangentFrame } from './roam.js';

/** Lens presets. `radiusUnits` is the disc radius in globe-local
 *  units; zoom/grid are chosen so grid coverage (grid × tile
 *  degrees) meets or exceeds the disc's angular diameter:
 *  overlook 10.8° across ← 8 × 1.406° (z8) = 11.25°;
 *  street 3.0° across ← 36 × 0.088° (z12) = 3.16° of coverage, and
 *  the feather hides the last fraction at the rim. (Street widened
 *  2026-10-20: radius 0.34 → 0.48 hub units ≈ 30 display m, grid
 *  8 → 16 — Merlin: expand the tile rendering radius, and rendered
 *  sheets now persist instead of being disposed on recenter.
 *  TRIPLED 2026-10-22 — Merlin: "Increase the range of rendering
 *  around and under each player by 3": street radius 0.48 → 1.44
 *  hub units (≈90 display m). The grid grew 16 → 36 (still z12) so
 *  coverage keeps meeting the wider disc, and canvasPx 2048 →
 *  2160 keeps canvasPx % grid === 0 and per-sheet texture memory
 *  ≈ today's (~19 MB vs ~17 MB) instead of the ×9 a naive triple
 *  of the canvas would cost an iPhone. The overlook preset is the
 *  orbital focus sheet, not a per-player range — NOT tripled.)
 *
 *  `lift` is per preset because the two presets live at different
 *  scales: the overlook sheet floats 0.05 hub units (≈3 display
 *  metres) — invisible at globe scale, enough to clear sampling
 *  error. The street sheet is walked on: at 0.05 it would hover
 *  above the traveler's head like a ceiling (the street camera
 *  sits at 1.62 m), its underside backface-culled, so the
 *  photographic ground would vanish exactly when you arrive.
 *  The street lift is 0.004 hub units (≈0.25 display metres) —
 *  on the ground, still clear of z-fighting with the terrain. */
export const LENS_PRESETS = {
  overlook: { radiusUnits: 5.2, zoom: 8, grid: 8, canvasPx: 2048, lift: 0.05 },
  street: { radiusUnits: 1.44, zoom: 12, grid: 36, canvasPx: 2160, lift: 0.004 },
  // streetFar — the 15× reveal sheet (Merlin, 2026-10-26: "The
  // radius should be like 7-10x that size maybe closer to 15x").
  // radiusUnits 21.6 = 15 × the street 1.44 (≈1350 display m, 45°
  // across), so one position reveals ~225× the street sheet's
  // area — the Oblivion fast-track in concrete form. The zoom
  // drops four levels (z12 → z8) so the tile COUNT stays 1296:
  // 36 × 1.406° = 50.6° of coverage meets the 45° disc, at 16×
  // coarser imagery — the surroundings, not the ground under
  // your feet (the street sheet keeps that detail). canvasPx
  // 1440 (40 px/tile) halves the texture memory vs 2160² because
  // distant imagery needs no fine canvas. lift 0.003 sits
  // between the street patch (0.002) and the street sheet
  // (0.004): the far sheet never covers the near one.
  streetFar: { radiusUnits: 21.6, zoom: 8, grid: 36, canvasPx: 1440, lift: 0.003 },
};
/** Tiles flushed to the GPU the moment they resolve: the first
 *  CENTRE_FLUSH_TILES of the centre-first order are the tiles
 *  around the canvas centre — the ground under the traveler's
 *  feet (pinned in earth-mapping-progress tests). */
export const CENTRE_FLUSH_TILES = 9;
/** Default drape lift (hub units) when a preset names none —
 *  matches the overlook preset. */
export const LENS_LIFT = 0.05;

/** Tiles ordered centre-first for painting: the ground under and
 *  around the player paints in the first fetches instead of the
 *  plan's row-major order (which painted the north edge first
 *  and the player's own ground halfway through the build — at
 *  driving speed the player had already left before their ground
 *  arrived). Returns a NEW array; the plan's own order is
 *  untouched. Distance is measured from the tile's canvas centre
 *  to the canvas centre. */
export function sortTilesCenterFirst(tiles, canvasPx, tilePx) {
  const c = canvasPx / 2;
  const withDist = tiles.map((t) => {
    const dx = (t.px + tilePx / 2) - c;
    const dy = (t.py + tilePx / 2) - c;
    return { t, d: dx * dx + dy * dy };
  });
  withDist.sort((a, b) => a.d - b.d);
  return withDist.map((w) => w.t);
}

/** Fractional slippy-map tile coordinates for a lat/lon. */
export function tileFloat(lat, lon, z) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { fx, fy };
}

/** The fetch/composite plan for one lens position. Tiles are
 *  listed row-major, north row first — the order the component
 *  paints them (px, py = canvas pixel position of the tile's
 *  top-left corner). gridLeft/gridTop are the fractional tile
 *  coordinates of the canvas's top-left corner. */
export function lensTilePlan(lat, lon, zoom, grid, canvasPx) {
  const n = 2 ** zoom;
  const c = tileFloat(lat, lon, zoom);
  const cx = Math.floor(c.fx);
  const cy = Math.floor(c.fy);
  const half = Math.floor(grid / 2);
  const gridLeft = cx - half;
  const gridTop = cy - half;
  const tilePx = canvasPx / grid;
  const tiles = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const rawX = gridLeft + col;
      const y = gridTop + row;
      // Wrap x around the antimeridian for the URL; y off the
      // world (poles) simply has no tile — the canvas stays
      // transparent there and the globe shows through.
      const x = ((rawX % n) + n) % n;
      tiles.push({
        x, y, z: zoom,
        url: y >= 0 && y < n ? esriTileUrl(x, y, zoom) : null,
        px: col * tilePx,
        py: row * tilePx,
      });
    }
  }
  return { tiles, gridLeft, gridTop, grid, zoom, canvasPx, tilePx };
}

/** Texture UV (THREE convention: v = 1 at the canvas top) for a
 *  lat/lon under a plan. Handles the antimeridian by unwrapping
 *  the fractional x against the plan's left edge. */
export function uvForLatLon(lat, lon, plan) {
  const n = 2 ** plan.zoom;
  const { fx, fy } = tileFloat(lat, lon, plan.zoom);
  let relX = fx - plan.gridLeft;
  while (relX > plan.grid) relX -= n;
  while (relX < 0) relX += n;
  const u = relX / plan.grid;
  const v = 1 - (fy - plan.gridTop) / plan.grid;
  return { u, v };
}

/** Inverse of latLonToVec3 for a unit direction. */
export function latLonFromDir(dir) {
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI;
  let lon = (Math.atan2(dir.z, -dir.x) * 180) / Math.PI - 180;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return { lat, lon };
}

/** Draped disc geometry as plain arrays (positions, uvs, indices)
 *  centered on (centerLat, centerLon). Every vertex sits at the
 *  heightmap surface radius for ITS OWN lat/lon + LENS_LIFT, so
 *  the sheet hugs the terrain. Flat mode (street-flat.js): the
 *  surface radius is the constant sea-level radius, so the sheet
 *  is a true plane at the patch level + lift — no hills under
 *  the photographic ground. Winding faces away from the globe
 *  center (verified in tests). */
export function buildLensGeometryData(heightData, w, h, centerLat, centerLon,
                                      radiusUnits, plan, opts = {}) {
  const rings = opts.rings ?? 20;
  const sectors = opts.sectors ?? 48;
  const lift = opts.lift ?? LENS_LIFT;
  const frame = tangentFrame(centerLat, centerLon);
  const centerDir = frame.normal;

  const positions = [];
  const uvs = [];
  const indices = [];

  const pushVertex = (dir) => {
    const { lat, lon } = latLonFromDir(dir);
    const r = surfaceRadiusAt(heightData, w, h, lat, lon) + lift;
    positions.push(dir.x * r, dir.y * r, dir.z * r);
    const { u, v } = uvForLatLon(lat, lon, plan);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };

  // Center vertex, then rings 1..rings × sectors.
  pushVertex(centerDir);
  for (let i = 1; i <= rings; i++) {
    const frac = i / rings;
    const ang = (frac * radiusUnits) / EARTH_RADIUS; // arc radians from center
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2;
      const tx = frame.north.x * Math.cos(a) + frame.east.x * Math.sin(a);
      const ty = frame.north.y * Math.cos(a) + frame.east.y * Math.sin(a);
      const tz = frame.north.z * Math.cos(a) + frame.east.z * Math.sin(a);
      const dir = {
        x: centerDir.x * cosA + tx * sinA,
        y: centerDir.y * cosA + ty * sinA,
        z: centerDir.z * cosA + tz * sinA,
      };
      const m = Math.hypot(dir.x, dir.y, dir.z) || 1;
      pushVertex({ x: dir.x / m, y: dir.y / m, z: dir.z / m });
    }
  }
  const ringStart = (i) => 1 + (i - 1) * sectors;
  // Center fan — wound to face outward (see module tests).
  for (let j = 0; j < sectors; j++) {
    const a = ringStart(1) + j;
    const b = ringStart(1) + ((j + 1) % sectors);
    indices.push(0, b, a);
  }
  // Ring quads: (a, b, d) + (a, d, c) faces outward.
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const jn = (j + 1) % sectors;
      const a = ringStart(i) + j;
      const b = ringStart(i) + jn;
      const c = ringStart(i + 1) + j;
      const d = ringStart(i + 1) + jn;
      indices.push(a, b, d, a, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    vertexCount: positions.length / 3,
  };
}
