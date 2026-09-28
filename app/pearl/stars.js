// Seeded starfield generation for The Pearl. Pure, deterministic, testable.

// Mulberry32 — small deterministic PRNG.
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

// Hash a short string into a 32-bit seed.
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Generate a starfield shell: positions on a sphere, colors with blue/white/warm
// variety, and per-star sizes. All deterministic for a given seed.
export function makeStarField(count, seed) {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Uniform point on sphere (upper hemisphere biased, radius 900–1400)
    const u = rng() * 2 - 1;
    const theta = rng() * Math.PI * 2;
    const r = 900 + rng() * 500;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = s * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.abs(u) * r * 0.9 + 20; // keep above horizon
    positions[i * 3 + 2] = s * Math.sin(theta) * r;

    // Star color temperature variety
    const t = rng();
    let cr, cg, cb;
    if (t < 0.25) { cr = 0.7; cg = 0.8; cb = 1.0; }        // blue-white
    else if (t < 0.7) { cr = 1.0; cg = 1.0; cb = 1.0; }    // white
    else { cr = 1.0; cg = 0.85; cb = 0.65; }               // warm
    const bright = 0.35 + rng() * 0.65;
    colors[i * 3] = cr * bright;
    colors[i * 3 + 1] = cg * bright;
    colors[i * 3 + 2] = cb * bright;

    sizes[i] = 1 + rng() * 3;
  }

  return { positions, colors, sizes, count };
}
