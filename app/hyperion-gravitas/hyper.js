/**
 * Hyperion Gravitas — pure N-dimensional rotation + projection math.
 * No DOM, no canvas. Points are plain arrays of N numbers.
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

/** All coordinate planes for N dimensions: [[0,1],[0,2],...]. */
export function rotationPlanes(n) {
  const planes = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) planes.push([i, j]);
  }
  return planes;
}

/** Rotate points in-place in the given planes by the given angles (radians). */
export function rotateND(points, planes, angles) {
  for (let pi = 0; pi < planes.length; pi++) {
    const [i, j] = planes[pi];
    const a = angles[pi];
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const p of points) {
      const xi = p[i];
      const xj = p[j];
      p[i] = xi * c - xj * s;
      p[j] = xi * s + xj * c;
    }
  }
  return points;
}

/** Build a point cloud in N dimensions. kind: 'cube' | 'cross' | 'shell'. */
export function buildPointCloud(n, kind, count, seed) {
  const rand = mulberry32(seed);
  const points = [];
  const edges = [];
  if (kind === "cube") {
    const total = 1 << n;
    for (let v = 0; v < total; v++) {
      const p = [];
      for (let d = 0; d < n; d++) p.push(v & (1 << d) ? 0.8 : -0.8);
      points.push(p);
    }
    for (let a = 0; a < total; a++) {
      for (let b = a + 1; b < total; b++) {
        const diff = a ^ b;
        if (diff && (diff & (diff - 1)) === 0) edges.push([a, b]);
      }
    }
  } else if (kind === "cross") {
    for (let d = 0; d < n; d++) {
      const p1 = new Array(n).fill(0);
      const p2 = new Array(n).fill(0);
      p1[d] = 1.1;
      p2[d] = -1.1;
      points.push(p1, p2);
    }
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        // every pair except opposites
        if (Math.floor(a / 2) !== Math.floor(b / 2)) edges.push([a, b]);
      }
    }
  } else {
    // shell: random points on the N-sphere
    for (let k = 0; k < count; k++) {
      const p = [];
      let norm = 0;
      for (let d = 0; d < n; d++) {
        const v = rand() * 2 - 1;
        p.push(v);
        norm += v * v;
      }
      norm = Math.sqrt(norm) || 1;
      const r = 0.9 + rand() * 0.25;
      points.push(p.map((v) => (v / norm) * r));
    }
  }
  return { points, edges };
}

/**
 * Project an N-D point to 3-D with perspective divide.
 * squash: how strongly hidden axes pull the projection (0 = orthographic).
 * dist: camera distance in the hidden axes.
 */
export function projectNDto3D(pt, squash, dist = 3) {
  let coords = pt.slice();
  for (let k = coords.length; k > 3; k--) {
    const w = dist / Math.max(0.4, dist - coords[k - 1] * squash);
    coords = coords.slice(0, k - 1).map((v) => v * w);
  }
  return coords;
}

/** Project a 3-D point to 2-D with a yaw/pitch camera. Returns {x, y, z}. */
export function project3Dto2D(p3, yaw, pitch) {
  const [x, y, z] = p3;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
}

/** Squared norm of a point (rotation must preserve it). */
export function norm2(p) {
  let s = 0;
  for (const v of p) s += v * v;
  return s;
}

/** Hex color -> [r, g, b]. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 243, 255];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Point color for a mode: 'tint' | 'rainbow' | 'pulse'.
 * energy: 0..1 extra brightness (e.g. from the sonic core).
 */
export function pointColor(mode, tintRgb, index, total, radius, energy) {
  const boost = 1 + energy * 0.9;
  if (mode === "rainbow") {
    const hue = (index / Math.max(1, total)) * 360;
    return `hsla(${hue.toFixed(1)},85%,${Math.min(75, 55 + energy * 25).toFixed(1)}%,0.95)`;
  }
  if (mode === "pulse") {
    const k = Math.max(0.15, Math.min(1, radius));
    const v = Math.min(255, Math.round(90 + k * 165 * boost));
    return `rgba(${v},${Math.round(v * 0.85)},${Math.round(v * 0.6)},0.95)`;
  }
  const [r, g, b] = tintRgb;
  const m = Math.min(1.6, 0.55 + radius * 0.6 + energy * 0.5);
  return `rgba(${Math.min(255, Math.round(r * m))},${Math.min(255, Math.round(g * m))},${Math.min(255, Math.round(b * m))},0.95)`;
}

/** Average normalized energy (0..1) from analyser frequency bins. */
export function analyserEnergy(freqData) {
  if (!freqData || freqData.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) sum += freqData[i];
  return Math.max(0, Math.min(1, sum / freqData.length / 255));
}
