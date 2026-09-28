/**
 * Bearth — procedural planet logic (no DOM, no network).
 * Seeded value-noise continents, sphere scanline math, orbit/surface camera.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise2(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x, y, seed, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm; // 0..1
}

/**
 * Continent field over an equirectangular grid.
 * Wraps horizontally so rotation is seamless: sample x in [0, baseFreq] cycles.
 */
export function makeContinentField(W, H, seed) {
  const field = new Float32Array(W * H);
  const base = 3.0; // cycles across the map -> seamless wrap
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const lat = (v - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // sample noise on a cylinder so left/right edges join
      const ang = u * Math.PI * 2;
      const nx = Math.cos(ang) * base;
      const ny = Math.sin(ang) * base;
      const nz = v * base * 1.4;
      let n = fbm2(nx + nz * 0.7, ny - nz * 0.5, seed, 5);
      // boost toward equator, ice caps near poles
      const latBoost = Math.cos(lat) * 0.08;
      field[y * W + x] = n + latBoost - 0.08;
    }
  }
  return field;
}

export function heightColor(h, latAbs) {
  // returns [r,g,b]
  const polar = Math.min(1, Math.max(0, (latAbs - 1.05) / 0.35)); // 0..1 near poles
  if (h < 0.44) {
    const d = h / 0.44;
    return [8 + 20 * d, 30 + 60 * d, 70 + 90 * d]; // deep -> shallow ocean
  }
  if (h < 0.5) return [210, 190, 130]; // beach
  const e = (h - 0.5) / 0.5;
  const g = [34 + 40 * (1 - e), 110 + 40 * (1 - e), 60 + 20 * (1 - e)];
  const rock = [90 + 60 * e, 80 + 50 * e, 70 + 40 * e];
  const m = Math.min(1, Math.max(0, (e - 0.55) / 0.3));
  const land = g.map((v, i) => v + (rock[i] - v) * m);
  return land.map((v) => v * (1 - polar) + 235 * polar);
}

export function sampleField(field, W, H, u, v) {
  u = ((u % 1) + 1) % 1;
  v = Math.max(0, Math.min(0.9999, v));
  const x = u * W;
  const y = v * H;
  const xi = Math.floor(x) % W;
  const yi = Math.floor(y);
  const xf = x - Math.floor(x);
  const yf = y - yi;
  const x2 = (xi + 1) % W;
  const a = field[yi * W + xi];
  const b = field[yi * W + x2];
  const c = field[Math.min(H - 1, yi + 1) * W + xi];
  const d = field[Math.min(H - 1, yi + 1) * W + x2];
  const u2 = smooth(xf);
  const v2 = smooth(yf);
  return a + (b - a) * u2 + (c - a) * v2 + (a - b - c + d) * u2 * v2;
}

/** Sphere scanline: given row offset dy in [-R, R], return half-chord width. */
export function chordHalfWidth(R, dy) {
  const d = Math.abs(dy);
  if (d >= R) return 0;
  return Math.sqrt(R * R - d * d);
}

/** Longitude (radians, -π/2..π/2 visible) for a screen-x within the chord. */
export function lonForScreenX(px, halfChord) {
  return Math.asin(Math.max(-1, Math.min(1, px / halfChord)));
}

/** Camera state for the two modes. */
export function createCamera() {
  return {
    mode: "orbit", // orbit | surface
    lon: 0.6, // rotation offset (radians)
    tilt: 0.35, // latitude of view center
    radius: 150,
    fly: 0, // 0 = orbit, 1 = surface (transition progress)
    surfU: 0.5, // surface pan center in texture uv
    surfV: 0.5,
    surfZoom: 1,
  };
}

export function panSurface(cam, du, dv) {
  cam.surfU = ((cam.surfU + du) % 1 + 1) % 1;
  cam.surfV = Math.max(0.05, Math.min(0.95, cam.surfV + dv));
  return cam;
}

export function pointInPlanet(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

export function clampRadius(r) {
  return Math.max(90, Math.min(320, r));
}
