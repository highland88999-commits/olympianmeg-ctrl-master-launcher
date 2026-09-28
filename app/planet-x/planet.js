/**
 * Planet X — pure logic: seeded procedural terrain, sphere math, flight.
 * No DOM, no canvas. The page renders a software-3D planet from this.
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

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Seeded 2D value-noise field with fbm. Returns function (x, y) -> [-1, 1]. */
export function makeNoise2D(seed, octaves = 4) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) grad[i] = rand() * 2 - 1;

  function lattice(ix, iy) {
    return grad[perm[(ix & 255) + perm[iy & 255]] & 255];
  }
  function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = lattice(ix, iy);
    const b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1);
    const d = lattice(ix + 1, iy + 1);
    const ux = smooth(fx);
    const uy = smooth(fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  return function (x, y) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };
}

/**
 * Build a heightmap over a lat/lon grid.
 * Returns { w, h, data } with data in [-1, 1]; "shard" continents via
 * ridged transform when roughness is high.
 */
export function buildHeightMap(seed, roughness, w = 110, h = 56) {
  const base = makeNoise2D(seed, 5);
  const detail = makeNoise2D(seed ^ 0x9e3779b9, 6);
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const lat = (j / (h - 1) - 0.5) * Math.PI; // -PI/2 .. PI/2
    for (let i = 0; i < w; i++) {
      const lon = (i / w) * Math.PI * 2;
      // sample on a cylinder to keep the seam continuous in longitude
      const cx = Math.cos(lon) * 2.2;
      const sx = Math.sin(lon) * 2.2;
      const cy = lat * 1.4;
      let n = base(cx + 7.3, cy + sx * 0.6) * 0.65 + base(sx * 1.7, cy * 1.7 + cx) * 0.35;
      // ridged "shard" transform, strength scales with roughness
      const ridge = 1 - Math.abs(detail(cx * 2.1, cy * 2.1 + sx));
      n = n * (1 - roughness * 0.45) + (ridge * ridge * 1.4 - 0.55) * roughness * 0.55;
      // polar ice caps
      const polar = Math.max(0, (Math.abs(lat) - 1.05) / (Math.PI / 2 - 1.05));
      n = n * (1 - polar * 0.5) + polar * 0.55;
      data[j * w + i] = Math.max(-1, Math.min(1, n));
    }
  }
  return { w, h, data };
}

export function heightAt(map, lat, lon) {
  const { w, h, data } = map;
  const fi = (((lon / (Math.PI * 2)) % 1 + 1) % 1) * w;
  const fj = ((lat / Math.PI + 0.5) * (h - 1));
  const i0 = Math.floor(fi) % w;
  const j0 = Math.max(0, Math.min(h - 2, Math.floor(fj)));
  const i1 = (i0 + 1) % w;
  const j1 = j0 + 1;
  const tx = fi - Math.floor(fi);
  const ty = Math.max(0, Math.min(1, fj - j0));
  const a = data[j0 * w + i0];
  const b = data[j0 * w + i1];
  const c = data[j1 * w + i0];
  const d = data[j1 * w + i1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** 3D point on the (displaced) sphere for lat/lon, then yaw/pitch rotation. */
export function spherePoint(map, lat, lon, yaw, pitch, radius, amp) {
  const h = heightAt(map, lat, lon);
  const r = radius + h * amp;
  const cp = Math.cos(lat);
  let x = r * cp * Math.cos(lon);
  let y = r * Math.sin(lat);
  let z = r * cp * Math.sin(lon);
  // yaw around Y
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let x1 = x * cy + z * sy;
  let z1 = -x * sy + z * cy;
  // pitch around X
  const cxp = Math.cos(pitch);
  const sxp = Math.sin(pitch);
  const y1 = y * cxp - z1 * sxp;
  const z2 = y * sxp + z1 * cxp;
  return { x: x1, y: y1, z: z2, h };
}

/** Height -> [r, g, b] terrain color. */
export function terrainColor(h) {
  if (h < -0.12) {
    const t = Math.max(0, Math.min(1, (-h - 0.12) / 0.6));
    return [8 + t * 10, 20 + t * 30, 60 + t * 70]; // deep ocean
  }
  if (h < 0.02) return [24, 68, 120]; // shallow sea
  if (h < 0.1) return [52, 96, 64]; // coast
  if (h < 0.35) {
    const t = (h - 0.1) / 0.25;
    return [46 + t * 30, 92 - t * 20, 52 - t * 10]; // lowlands
  }
  if (h < 0.62) {
    const t = (h - 0.35) / 0.27;
    return [96 + t * 60, 74 + t * 40, 58 + t * 30]; // highlands
  }
  const t = Math.max(0, Math.min(1, (h - 0.62) / 0.38));
  return [170 + t * 70, 165 + t * 70, 180 + t * 60]; // snowcaps
}

/** Lambert-ish shading factor from a light direction. */
export function shade(nx, ny, nz, lx, ly, lz) {
  const d = nx * lx + ny * ly + nz * lz;
  return 0.25 + 0.75 * Math.max(0, d);
}

/** Flight state machine: orbit -> descending -> surface -> ascending -> orbit */
export function createFlight() {
  return {
    mode: "orbit", // orbit | descending | surface | ascending
    progress: 0, // 0..1 along the current transition
    targetLat: 0,
    targetLon: 0,
    surfaceSeed: 1,
  };
}

export function startDescent(flight, lat, lon) {
  flight.mode = "descending";
  flight.progress = 0;
  flight.targetLat = Math.max(-1.2, Math.min(1.2, lat));
  flight.targetLon = lon;
  flight.surfaceSeed = Math.floor(Math.abs(lat * 1000 + lon * 777)) + 1;
}

export function stepFlight(flight, dt) {
  const SPEED = 0.55; // transitions take ~1.8s
  if (flight.mode === "descending" || flight.mode === "ascending") {
    flight.progress = Math.min(1, flight.progress + dt * SPEED);
    if (flight.progress >= 1) {
      flight.mode = flight.mode === "descending" ? "surface" : "orbit";
      flight.progress = 0;
    }
  }
}

/** Ease for the dive: slow start, fast middle, soft landing. */
export function diveEase(p) {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}
