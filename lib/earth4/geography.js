// lib/earth4/geography.js
// EARTH 4 — TRUE EARTH SIZE, FULLY EXPLORABLE (Merlin, 2026-11-12):
// the real planet at real scale, walked on foot.
//
// WHAT IS GENUINELY TRUE HERE (read this before assuming more):
//   * SCALE — real metres. One degree of latitude is 111,195 m
//     everywhere; one degree of longitude is 111,195 m × cos(lat).
//     The walker moves in true metres and the HUD reads true lat/lon.
//   * LAND vs WATER — the repo's own topology PNG
//     (/textures/earth/earth-topology.png, 2048×1024) is a real
//     Earth elevation map: oceans read exactly 0, land reads > 0.
//     The coastline the walker meets IS Earth's coastline.
//   * RELATIVE RELIEF — the same PNG: Everest is the highest
//     point, Tibet and Greenland read high, the plains read low.
//   * TRUE COLOURS — the repo's earth-day.jpg (real satellite
//     colours) tints the ground, and the scene drapes real ESRI
//     World Imagery tiles over the patch under your feet.
// WHAT IS A STAND-IN (honest, not hidden):
//   * ELEVATION IN METRES is a linear fit to that PNG, calibrated
//     on two surveyed anchors — Everest 8,848 m (gray 242) and
//     Redwater, Alberta ~625 m (gray 26). It reads the shape right
//     and the anchors right, but the source map stretches high
//     ground for visual drama, so high plateaus read taller than
//     surveyed (Tibet ~7,300 m here vs ~4,500 m real). Lowlands
//     read 0 m (the Amazon's ~100 m, London's ~30 m) because the
//     PNG's low end is compressed. A surveyed DEM is the upgrade.
//   * The ground is a flat tangent plane around the walker
//     (equirectangular), NOT a curved sphere — curvature over a
//     640 m patch is 8 mm, far below the terrain's own relief, so
//     the flat patch is the right engineering call; the lat/lon
//     addressing underneath is exact, so walking 111 km north
//     really does move you 1° of latitude.
//
// Everything here is pure arithmetic (no three.js, no DOM, no
// Math.random, no clock), so the whole planet is unit-testable.

// ── The planet ────────────────────────────────────────────────
export const EARTH_RADIUS_M = 6371000; // mean radius, metres
export const EARTH_CIRCUMFERENCE_M = 40075016; // equatorial, metres
export const M_PER_DEG_LAT = (Math.PI * EARTH_RADIUS_M) / 180; // 111,194.93 m
export const M_PER_DEG_LON_AT_EQUATOR = M_PER_DEG_LAT;

/** Metres per degree of longitude at a latitude. */
export function metresPerDegLon(lat) {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

// ── The anchor ────────────────────────────────────────────────
// The walker starts at Redwater, Alberta — Merlin's home town
// (geocoded 2026-11-14: 53.95235, -113.11636).
export const START_PLACE = Object.freeze({
  name: 'Redwater, Alberta',
  lat: 53.95235,
  lon: -113.11636,
});

/** Normalise a longitude into [-180, 180). */
export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Local metres (x east, z south — north is -z, the three.js
 * convention the Earth 3 showcase uses) for a lat/lon, measured
 * from an origin { lat, lon }. Exact at the origin, true-scale
 * for kilometres around it.
 */
export function localFromLatLon(lat, lon, origin) {
  return {
    x: (wrapLon(lon - origin.lon)) * metresPerDegLon(origin.lat),
    z: -(lat - origin.lat) * M_PER_DEG_LAT,
  };
}

/** The inverse of localFromLatLon: lat/lon for local metres. */
export function latLonFromLocal(x, z, origin) {
  return {
    lat: origin.lat - z / M_PER_DEG_LAT,
    lon: wrapLon(origin.lon + x / metresPerDegLon(origin.lat)),
  };
}

/** Great-circle distance in metres (haversine, exact sphere). */
export function haversineM(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── Real elevation from the repo's topology PNG ───────────────
// The PNG is 2048×1024, equirectangular, row 0 = north edge.
// Oceans read exactly 0; land reads 1..255. The elevation fit is
// linear through the two surveyed anchors:
//   Everest  8,848 m at gray 242  (sampled 2026-11-14)
//   Redwater   ~625 m at gray 26  (sampled 2026-11-14)
// slope = (8848 - 625) / (242 - 26) ≈ 38.07 m per gray step;
// sea level (0 m) falls at gray ≈ 9.6. High plateaus read tall
// (see the header) — the shape is real, the absolute metres are
// a fit, and the code never claims otherwise.
export const TOPOLOGY_W = 2048;
export const TOPOLOGY_H = 1024;
export const ELEV_M_PER_GRAY = 38.07;
export const ELEV_GRAY_ZERO = 9.58; // gray at 0 m on the fit
export const WATER_GRAY_MAX = 1; // sampled gray below this is ocean
export const SEABED_M = -3; // the sea floor the ocean plane covers

/** Elevation in metres for one sampled gray value (0..255). */
export function elevationForGray(gray) {
  if (gray < WATER_GRAY_MAX) return SEABED_M;
  return Math.max(0, (gray - ELEV_GRAY_ZERO) * ELEV_M_PER_GRAY);
}

/** True when a sampled gray value is ocean. */
export function isWaterGray(gray) {
  return gray < WATER_GRAY_MAX;
}

// Bilinear sample of a grayscale heightmap, returned 0..255.
// data is a row-major Uint8Array, row 0 = north edge — the same
// sampling lib/terrain.js sampleHeight does (re-implemented here
// so this module stays free of the three.js import).
export function sampleGray(data, w, h, u, v) {
  const x = Math.min(Math.max(u, 0), 1) * (w - 1);
  const y = Math.min(Math.max(1 - v, 0), 1) * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = data[y0 * w + x0];
  const i10 = data[y0 * w + x1];
  const i01 = data[y1 * w + x0];
  const i11 = data[y1 * w + x1];
  return (i00 * (1 - fx) + i10 * fx) * (1 - fy) + (i01 * (1 - fx) + i11 * fx) * fy;
}

/** The sampled gray (0..255) at a lat/lon from a decoded heightmap. */
export function grayAtLatLon(lat, lon, height) {
  if (!height || !height.data || !height.w || !height.h) return 0;
  return sampleGray(
    height.data, height.w, height.h,
    (wrapLon(lon) + 180) / 360,
    (Math.max(-90, Math.min(90, lat)) + 90) / 180,
  );
}

/** Ground height in metres at a lat/lon (real relief, fitted). */
export function heightAtLatLon(lat, lon, height) {
  return elevationForGray(grayAtLatLon(lat, lon, height));
}

/** True when the ground at a lat/lon is ocean. */
export function isWaterAtLatLon(lat, lon, height) {
  return isWaterGray(grayAtLatLon(lat, lon, height));
}

// ── True colours from the repo's earth-day.jpg ────────────────
// Bilinear sample of a decoded RGBA image (row 0 = north edge),
// returned as { r, g, b } 0..1. The day texture is 1600×800 —
// coarse (~25 km/px at the equator) but it IS the real colour
// of the place: green jungle, tan desert, blue ocean.
export function sampleDayColor(lat, lon, dayTex) {
  if (!dayTex || !dayTex.data || !dayTex.w || !dayTex.h) return null;
  const u = Math.min(Math.max((wrapLon(lon) + 180) / 360, 0), 1) * (dayTex.w - 1);
  const v = Math.min(Math.max(1 - (Math.max(-90, Math.min(90, lat)) + 90) / 180, 0), 1) * (dayTex.h - 1);
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, dayTex.w - 1);
  const y1 = Math.min(y0 + 1, dayTex.h - 1);
  const fx = u - x0;
  const fy = v - y0;
  const at = (x, y) => {
    const i = (y * dayTex.w + x) * 4;
    return [dayTex.data[i] / 255, dayTex.data[i + 1] / 255, dayTex.data[i + 2] / 255];
  };
  const c00 = at(x0, y0);
  const c10 = at(x1, y0);
  const c01 = at(x0, y1);
  const c11 = at(x1, y1);
  const mix = (a, b, t) => a + (b - a) * t;
  return {
    r: mix(mix(c00[0], c10[0], fx), mix(c01[0], c11[0], fx), fy),
    g: mix(mix(c00[1], c10[1], fx), mix(c01[1], c11[1], fx), fy),
    b: mix(mix(c00[2], c10[2], fx), mix(c01[2], c11[2], fx), fy),
  };
}

// ── ESRI satellite tiles (the close-up true texture) ──────────
// lib/geo.js already blesses this source: ESRI World Imagery,
// open CORS, no key. Zoom 16 (≈1.4–2.4 m/px) is the close-up
// layer over the walker's patch; the day texture is the fallback
// underneath it, so a failed tile fetch never leaves bare ground.
/** Ground metres per pixel of a slippy-map tile at (lat, zoom). */
export function tileMetresPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Ground metres across one 256 px tile at (lat, zoom). */
export function tileMetres(lat, zoom) {
  return tileMetresPerPixel(lat, zoom) * 256;
}

/**
 * How many tiles across cover a patch of `patchM` metres at
 * (lat, zoom): the grid is square, centred on the patch.
 */
export function tileGridSize(patchM, lat, zoom) {
  return Math.min(9, Math.max(1, Math.ceil(patchM / tileMetres(lat, zoom)) + 1));
}

/** Format a lat/lon the way the HUD reads it. */
export function formatLatLon(lat, lon) {
  const la = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${la}, ${lo}`;
}

// ── ESRI patch UVs (the close-up true texture) ─────────────────
// The scene drapes a grid of ESRI tiles over the terrain patch.
// The canvas holds `grid`×`grid` tiles starting at the tile that
// contains the patch's north-west corner; the patch is a smaller
// square inside that canvas. This returns the texture repeat /
// offset that crops the canvas to exactly the patch (three.js
// CanvasTexture, flipY on: v=1 is the canvas's north/top row),
// plus the tile coordinates the scene must fetch.
/** Latitude of a slippy-map tile row's north edge (inverse Mercator). */
export function mercatorLat(tileY, zoom) {
  const n = 2 ** zoom;
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n))) * 180) / Math.PI;
}

export function esriPatchUV(patchHalfM, origin, zoom, grid) {
  const nw = latLonFromLocal(-patchHalfM, -patchHalfM, origin);
  const n = 2 ** zoom;
  const tx = Math.floor(((wrapLon(nw.lon) + 180) / 360) * n);
  const latRad = (nw.lat * Math.PI) / 180;
  const ty = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  const westLon = (tx / n) * 360 - 180;
  const eastLon = ((tx + grid) / n) * 360 - 180;
  const northLat = mercatorLat(ty, zoom);
  const southLat = mercatorLat(ty + grid, zoom);
  const cNW = localFromLatLon(northLat, westLon, origin);
  const cSE = localFromLatLon(southLat, eastLon, origin);
  const uMin = (-patchHalfM - cNW.x) / (cSE.x - cNW.x);
  const uMax = (patchHalfM - cNW.x) / (cSE.x - cNW.x);
  // v=1 is the canvas's north row (z = cNW.z, the most negative z).
  const vMax = 1 - (-patchHalfM - cNW.z) / (cSE.z - cNW.z);
  const vMin = 1 - (patchHalfM - cNW.z) / (cSE.z - cNW.z);
  return {
    repeatX: uMax - uMin,
    repeatY: vMax - vMin,
    offsetX: uMin,
    offsetY: vMin,
    tileX: tx,
    tileY: ty,
  };
}
