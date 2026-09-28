// Pure logic for the OMEGA Arch scene — no DOM, no network, fully testable.
// The source was a Three.js cinematic of a giant glowing Omega (Ω) monument
// with a vortex portal. This engine reproduces the same beats procedurally
// on a 2D canvas: LANDING -> OUTSIDE (orbit) -> ENTERING (zoom) -> INSIDE.

// --- Seeded RNG ------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Starfield --------------------------------------------------------------
export function createStarfield(seed, count, w, h) {
  const rand = mulberry32(seed);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * w,
      y: rand() * h,
      r: 0.4 + rand() * 1.6,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 1.2,
    });
  }
  return stars;
}

// Advance twinkle phases. Returns nothing; mutates in place.
export function stepStars(stars, dt) {
  for (const s of stars) s.phase += dt * s.speed;
}

// --- Omega arch geometry (mirrors the source's torus math) -------------------
export const ARCH_SWEEP = Math.PI * 1.6; // torus spans 288 degrees
export const ARCH_ROT = -Math.PI * 0.3;  // rotated so the gap sits at the bottom

// Endpoint offsets of the arch gap, exactly as the source computed them.
export function omegaFootOffsets(radius) {
  return {
    offsetX: radius * Math.cos(-Math.PI * 0.3),
    offsetY: radius * Math.sin(-Math.PI * 0.3),
  };
}

// Full arch layout for a canvas of (w, h). Returns arch center, radius in px,
// foot rectangles and the baseline y where the feet rest on the "floor".
export function omegaLayout(w, h) {
  const radius = Math.min(w, h) * 0.30;
  const tube = radius * 0.19;
  const { offsetX, offsetY } = omegaFootOffsets(radius);
  const baseY = h * 0.78;
  const centerY = baseY - Math.abs(offsetY) - tube;
  return {
    radius,
    tube,
    centerX: w / 2,
    centerY,
    baseY,
    feet: [
      { x: w / 2 + offsetX + 20 * (radius / 80), y: baseY - tube, w: 40 * (radius / 80), side: 1 },
      { x: w / 2 - offsetX - 20 * (radius / 80), y: baseY - tube, w: 40 * (radius / 80), side: -1 },
    ],
  };
}

// --- Vortex portal particles -------------------------------------------------
export function createVortex(count, seed) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      angle: rand() * Math.PI * 2,
      radius: 0.15 + rand() * 0.85, // fraction of portal radius
      speed: 0.6 + rand() * 1.8,
      size: 1 + rand() * 2.4,
      hue: 180 + rand() * 120, // cyan -> magenta
    });
  }
  return parts;
}

// Swirl the particles; pull shrinks radii toward the center (portal suction).
export function stepVortex(parts, dt, pull) {
  for (const p of parts) {
    p.angle += dt * p.speed * (1.6 - p.radius);
    p.radius -= dt * pull * 0.12 * p.radius;
    if (p.radius < 0.08) p.radius = 0.9 + Math.random() * 0.1;
  }
}

// --- Scene state machine -------------------------------------------------------
export const ARCH_STATES = ['LANDING', 'OUTSIDE', 'ENTERING', 'INSIDE'];

export function nextArchState(state) {
  switch (state) {
    case 'LANDING': return 'OUTSIDE';
    case 'OUTSIDE': return 'ENTERING';
    case 'ENTERING': return 'INSIDE';
    case 'INSIDE': return 'OUTSIDE'; // step back out through the portal
    default: return 'LANDING';
  }
}

export const STATE_HINT = {
  LANDING: 'TAP TO INITIALIZE',
  OUTSIDE: 'TAP TO APPROACH',
  ENTERING: 'ENTERING THE ARCH',
  INSIDE: 'TAP TO STEP BACK OUT',
};

// Zoom factor applied to the whole scene per state (0..1 progress eased in page).
export function stateZoom(state, progress) {
  if (state === 'ENTERING') return 1 + progress * 2.2;
  if (state === 'INSIDE') return 3.2;
  return 1;
}

// Horizontal orbit offset for the OUTSIDE state (slow cinematic drift).
export function orbitOffset(t, w) {
  return Math.sin(t * 0.18) * w * 0.06;
}
