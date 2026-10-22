// lib/earth/asset-anim.js — Earth construct ANIMATION (Merlin,
// 2026-10-22: "turn ON the windmills and the oil rigs").
//
// The honest constraint, found by inspecting the actual GLBs:
// every Tripo Earth model is ONE fused mesh — a single node, a
// single geometry, no named parts, no animation clips. There is no
// rotor object to spin. So animation here is VERTEX-level: a
// detector finds the moving part's vertices in the loaded geometry
// (the spinning disc at a windmill/turbine crown; the pumpjack's
// walking beam above its frame line), and a shared-clock driver
// (components/EarthAssets.jsx) re-poses just those vertices each
// frame from their stored base positions — cheap (a few thousand
// verts across three models), no per-mesh React state, and the
// base geometry is never deformed cumulatively.
//
// Works on any duck-typed position attribute ({ array, count }),
// which keeps the detectors unit-testable in plain Node. For
// instanced models (turbine, pumpjack) the registered geometry is
// the shared baked clone, so every instance animates together —
// a wind farm turning in the same wind; noted, accepted.

const animations = [];

function bandStats(arr, count, yCut) {
  let n = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const sum = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const y = arr[i * 3 + 1];
    if (y <= yCut) continue;
    n++;
    for (let a = 0; a < 3; a++) {
      const v = arr[i * 3 + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
      sum[a] += v;
    }
  }
  if (!n) return null;
  return {
    n,
    min,
    max,
    centroid: [sum[0] / n, sum[1] / n, sum[2] / n],
    spread: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

function bboxOf(arr, count) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      const v = arr[i * 3 + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

/**
 * Detect a spinning rotor (windmill fan / turbine rotor) in a
 * fused geometry. The signature, validated against the real
 * e024/e068 GLBs (2026-10-22):
 *  - the disc lives in the top band (above 60% of the height);
 *  - along its rotation axis (the horizontal axis the band is
 *    thinner along) the disc is a dense SLAB — a histogram peak,
 *    expanded while bins stay ≥20% of peak;
 *  - the hub is the slab's centroid, the radius its 97th-percentile
 *    in-plane radial distance;
 *  - fan verts are PLATES facing the axis: their normals point
 *    along it (|n·axis| ≥ 0.5). This is what separates blades from
 *    the crown lattice / nacelle sharing the slab — on the real
 *    models it excludes 21–35% of the naive mask that would have
 *    swung wrongly. Hub hardware (inner 30% of the radius) is
 *    included regardless of normals. Without a normal attribute
 *    the plate test is skipped (duck-typed unit tests).
 * Returns { indices, center, axis } or null when nothing disc-like
 * is found (the asset simply stays static — honest no-op).
 */
export function detectRotor(arr, count, normals = null) {
  const bb = bboxOf(arr, count);
  const H = bb.max[1] - bb.min[1];
  if (!(H > 0)) return null;
  const yCut = bb.min[1] + H * 0.6;
  const band = bandStats(arr, count, yCut);
  if (!band || band.n < 40) return null;
  const axis = band.spread[0] <= band.spread[2] ? 0 : 2;
  const planeAxis = axis === 0 ? 2 : 0;

  // The disc slab: histogram peak along the axis, expanded.
  const BINS = 32;
  const bins = new Array(BINS).fill(0);
  const range = bb.max[axis] - bb.min[axis];
  const binW = range / BINS || 1;
  for (let i = 0; i < count; i++) {
    if (arr[i * 3 + 1] <= yCut) continue;
    const b = Math.min(BINS - 1, Math.max(0, Math.floor((arr[i * 3 + axis] - bb.min[axis]) / binW)));
    bins[b]++;
  }
  let peak = 0;
  for (let b = 1; b < BINS; b++) if (bins[b] > bins[peak]) peak = b;
  if (bins[peak] < 40) return null;
  let lo = peak;
  let hi = peak;
  while (lo > 0 && bins[lo - 1] >= bins[peak] * 0.2) lo--;
  while (hi < BINS - 1 && bins[hi + 1] >= bins[peak] * 0.2) hi++;
  const slabMin = bb.min[axis] + lo * binW;
  const slabMax = bb.min[axis] + (hi + 1) * binW;

  // Slab members (with a small skirt below the band for the hub).
  const slab = [];
  for (let i = 0; i < count; i++) {
    if (arr[i * 3 + 1] <= yCut - H * 0.06) continue;
    const v = arr[i * 3 + axis];
    if (v < slabMin || v > slabMax) continue;
    slab.push(i);
  }
  if (slab.length < 40) return null;
  const center = [0, 0, 0];
  for (const i of slab) {
    center[0] += arr[i * 3];
    center[1] += arr[i * 3 + 1];
    center[2] += arr[i * 3 + 2];
  }
  center[0] /= slab.length;
  center[1] /= slab.length;
  center[2] /= slab.length;

  const rads = slab
    .map((i) => Math.hypot(arr[i * 3 + 1] - center[1], arr[i * 3 + planeAxis] - center[planeAxis]))
    .sort((a, b) => a - b);
  const radius = rads[Math.min(rads.length - 1, Math.floor(rads.length * 0.97))];
  if (!(radius > 0)) return null;

  const indices = [];
  for (const i of slab) {
    const r = Math.hypot(arr[i * 3 + 1] - center[1], arr[i * 3 + planeAxis] - center[planeAxis]);
    if (r > radius * 1.02) continue;
    if (normals && r > radius * 0.3 && Math.abs(normals[i * 3 + axis]) < 0.5) continue;
    indices.push(i);
  }
  if (indices.length < 40) return null;
  return { indices, center, axis };
}

/**
 * Detect a pumpjack walking beam: everything above the frame line
 * (beam, horse head, counterweight) swings around the tower pivot
 * (the band's centroid, at the cut height) about the Z axis — the
 * beam runs along X in the model's native frame.
 */
export function detectBeam(arr, count) {
  const bb = bboxOf(arr, count);
  const H = bb.max[1] - bb.min[1];
  if (!(H > 0)) return null;
  const yCut = bb.min[1] + H * 0.36;
  const band = bandStats(arr, count, yCut);
  if (!band || band.n < 40) return null;
  const indices = [];
  for (let i = 0; i < count; i++) {
    if (arr[i * 3 + 1] > yCut) indices.push(i);
  }
  if (indices.length < 40) return null;
  return { indices, center: [band.centroid[0], yCut, band.centroid[2]], axis: 2 };
}

function rotateMasked(anim, angle) {
  const { arr, base, indices, center, axis } = anim;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [cx, cy, cz] = center;
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    const bx = base[k * 3];
    const by = base[k * 3 + 1];
    const bz = base[k * 3 + 2];
    if (axis === 0) {
      // rotate in the ZY plane around (cz, cy)
      const dz = bz - cz;
      const dy = by - cy;
      arr[i * 3] = bx;
      arr[i * 3 + 1] = cy + dy * cos - dz * sin;
      arr[i * 3 + 2] = cz + dy * sin + dz * cos;
    } else {
      // rotate in the XY plane around (cx, cy)
      const dx = bx - cx;
      const dy = by - cy;
      arr[i * 3] = cx + dx * cos - dy * sin;
      arr[i * 3 + 1] = cy + dx * sin + dy * cos;
      arr[i * 3 + 2] = bz;
    }
  }
}

/**
 * Register a geometry for animation. kind: 'rotor' | 'beam'.
 * Returns the animation record, or null when detection failed.
 * Base positions are snapshotted NOW — call before first render
 * mutation, exactly once per geometry.
 */
export function registerVertexAnimation(geometry, kind) {
  const attr = geometry && geometry.attributes && geometry.attributes.position;
  if (!attr || !attr.array || !attr.count) return null;
  const arr = attr.array;
  const normalAttr = geometry.attributes.normal;
  const found = kind === 'beam'
    ? detectBeam(arr, attr.count)
    : detectRotor(arr, attr.count, normalAttr ? normalAttr.array : null);
  if (!found) return null;
  const base = new Float32Array(found.indices.length * 3);
  found.indices.forEach((vi, k) => {
    base[k * 3] = arr[vi * 3];
    base[k * 3 + 1] = arr[vi * 3 + 1];
    base[k * 3 + 2] = arr[vi * 3 + 2];
  });
  const anim = {
    geometry,
    arr,
    indices: found.indices,
    base,
    center: found.center,
    axis: found.axis,
    kind,
    angle: 0,
    phase: animations.length * 1.71,
    speed: kind === 'beam' ? 0 : 1.9, // rotors rad/s; beams oscillate in step
  };
  animations.push(anim);
  return anim;
}

/** Advance every registered animation to time t (seconds). */
export function stepVertexAnimations(t, dt) {
  for (const anim of animations) {
    if (anim.kind === 'beam') {
      // Pumpjack stroke: a slow nod, ~7 strokes a minute... at
      // diorama readability ~0.35 Hz reads as working machinery.
      rotateMasked(anim, Math.sin(t * 2.2 + anim.phase) * 0.15);
    } else {
      anim.angle = (anim.angle + dt * anim.speed) % (Math.PI * 2);
      rotateMasked(anim, anim.angle);
    }
    anim.geometry.attributes.position.needsUpdate = true;
  }
}

export function clearVertexAnimations() {
  animations.length = 0;
}

export function vertexAnimationCount() {
  return animations.length;
}
