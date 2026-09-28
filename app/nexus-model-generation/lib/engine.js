// Nexus Model Generation — honest local procedural engine.
// The original repo called cloud APIs (database job tables, worker backends,
// secret keys in a local env file). This rebuild does everything on-device: the "prompt" seeds a deterministic PRNG,
// which drives parametric geometry rendered as wireframes on canvas.
// Nothing is uploaded, no keys exist, no backend is called. Ever.

const SHAPES = ['orb', 'torus', 'knot', 'column', 'disc', 'spire'];

// FNV-1a 32-bit hash: prompt text -> deterministic seed.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Mulberry32 PRNG — fast, deterministic.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickShape(prompt) {
  const seed = hashSeed(prompt);
  return SHAPES[seed % SHAPES.length];
}

// Describe a "generation" plan derived from the prompt. The shape, size
// wobble, twist and color are all deterministic functions of the prompt.
export function planGeneration(prompt) {
  const text = String(prompt ?? '').trim();
  const seed = hashSeed(text);
  const rng = makeRng(seed);
  const shape = SHAPES[seed % SHAPES.length];
  const wobble = 0.15 + rng() * 0.55;       // 0.15..0.70
  const twist = rng() * Math.PI * 2;        // 0..2π
  const hue = Math.floor(rng() * 360);
  const lobes = 3 + Math.floor(rng() * 6);  // 3..8
  const scale = 0.7 + rng() * 0.6;          // 0.7..1.3
  return { seed, shape, wobble, twist, hue, lobes, scale, prompt: text };
}

// Parametric surface point for a plan. u,v in [0,1). Returns [x,y,z].
export function surfacePoint(plan, u, v) {
  const { shape, wobble, twist, lobes, scale } = plan;
  const th = u * Math.PI * 2;
  const ph = v * Math.PI;
  const w = Math.sin(th * lobes + twist) * Math.cos(ph * lobes * 0.5 + twist * 0.5) * wobble + 1;
  let x = 0, y = 0, z = 0;
  switch (shape) {
    case 'torus': {
      const R = 1.1 * scale, r = 0.45 * scale * w;
      x = (R + r * Math.cos(th)) * Math.cos(ph * 2);
      y = r * Math.sin(th);
      z = (R + r * Math.cos(th)) * Math.sin(ph * 2);
      break;
    }
    case 'knot': {
      const t = th * lobes * 0.5;
      x = Math.cos(t) * (1.2 + 0.4 * Math.cos(t * 1.5)) * scale * w;
      y = Math.sin(t * 1.5) * 0.9 * scale * w;
      z = Math.sin(t) * (1.2 + 0.4 * Math.sin(t * 1.5)) * scale * w;
      break;
    }
    case 'column': {
      x = Math.cos(th) * 0.8 * scale * w;
      z = Math.sin(th) * 0.8 * scale * w;
      y = (v - 0.5) * 3 * scale;
      break;
    }
    case 'disc': {
      x = Math.cos(th) * u * 1.8 * scale;
      z = Math.sin(th) * u * 1.8 * scale;
      y = Math.sin(u * Math.PI * lobes + twist) * 0.35 * scale * w;
      break;
    }
    case 'spire': {
      const r = (1 - v) * 1.2 * scale * w;
      x = Math.cos(th + v * twist) * r;
      z = Math.sin(th + v * twist) * r;
      y = (v - 0.5) * 3 * scale;
      break;
    }
    case 'orb':
    default: {
      const r = 1.3 * scale * w;
      x = r * Math.sin(ph) * Math.cos(th);
      y = r * Math.cos(ph);
      z = r * Math.sin(ph) * Math.sin(th);
      break;
    }
  }
  return [x, y, z];
}

// Build a wireframe grid (nu x nv points) from a plan.
export function buildMesh(plan, nu = 28, nv = 18) {
  const pts = [];
  for (let j = 0; j <= nv; j++) {
    const row = [];
    for (let i = 0; i <= nu; i++) {
      row.push(surfacePoint(plan, i / nu, j / nv));
    }
    pts.push(row);
  }
  return { plan, nu, nv, pts };
}

// Rotate a point around Y then X by angle t.
export function rotatePoint([x, y, z], t) {
  const cy = Math.cos(t), sy = Math.sin(t);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const cx = Math.cos(t * 0.6), sx = Math.sin(t * 0.6);
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  return [x1, y1, z2];
}

// Simple perspective projection of a 3D point onto canvas coords.
export function project([x, y, z], cx, cy, f, dist) {
  const d = dist + z;
  const s = f / Math.max(0.5, d);
  return [cx + x * s, cy + y * s, s];
}

// Export the mesh as an OBJ file (text) — the only "output" of the generator,
// created entirely on-device.
export function meshToObj(mesh) {
  const lines = ['# nexus-model-generation — procedural local output', `# seed ${mesh.plan.seed} shape ${mesh.plan.shape}`];
  for (const row of mesh.pts) {
    for (const [x, y, z] of row) {
      lines.push(`v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
    }
  }
  const { nu, nv } = mesh;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i + 1;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      lines.push(`f ${a} ${b} ${d} ${c}`);
    }
  }
  return lines.join('\n');
}

export const SHAPE_NAMES = SHAPES;
