/**
 * Infinity Drive — pure logic for an endless warp flight.
 * No DOM, no canvas. Stars live in a unit box; the ship flies toward -z.
 */

export const MIN_WARP = 1;
export const MAX_WARP = 9.9;
export const OVERDRIVE_WARP = 9.99;

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

export function clampWarp(w) {
  return Math.max(MIN_WARP, Math.min(MAX_WARP, w));
}

/** Forward speed in box-depths per second for a warp factor. */
export function speedForWarp(warp) {
  const w = clampWarp(warp);
  return 0.25 + Math.pow(w / MAX_WARP, 2.2) * 6;
}

/** Light-years crossed per second at a warp factor (warp-cubed fantasy scale). */
export function lightYearsPerSecond(warp) {
  const w = warp === OVERDRIVE_WARP ? warp : clampWarp(warp);
  return Math.pow(w, 3) * 0.5;
}

/** Time dilation felt aboard: 1/sqrt(1-(v/c)^2), capped for display. */
export function timeDilation(warp) {
  const frac = clampWarp(warp) / 10;
  const d = 1 / Math.sqrt(Math.max(1e-6, 1 - frac * frac));
  return Math.min(99.99, d);
}

export function formatLightYears(ly) {
  if (ly < 1000) return `${ly.toFixed(1)} ly`;
  if (ly < 1e6) return `${(ly / 1e3).toFixed(2)} thousand ly`;
  if (ly < 1e9) return `${(ly / 1e6).toFixed(2)} million ly`;
  return `${(ly / 1e9).toFixed(2)} billion ly`;
}

export function makeStars(seed, count) {
  const rand = mulberry32(seed);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * 2 - 1,
      y: rand() * 2 - 1,
      z: rand(),
      size: 0.5 + rand() * 1.6,
      tint: rand(), // 0 = white, 1 = cyan-blue
    });
  }
  return { stars, rand };
}

/** Respawn a star at the far edge of the box. */
export function respawnStar(s, rand) {
  s.x = rand() * 2 - 1;
  s.y = rand() * 2 - 1;
  s.z = 1;
}

export function makeNebulae(seed, count) {
  const rand = mulberry32(seed ^ 0x51ab);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: rand() * 2 - 1,
      y: rand() * 2 - 1,
      r: 0.25 + rand() * 0.5,
      hue: 210 + rand() * 90, // blue -> violet -> magenta
      depth: 0.3 + rand() * 0.7,
      drift: 0.008 + rand() * 0.02,
    });
  }
  return out;
}

/**
 * Advance stars. steerX/steerY in [-1,1] shift the starfield laterally.
 * Returns nothing; mutates stars in place. rand is the state's rng for respawns.
 */
export function stepStars(field, dt, warp, steerX, steerY) {
  const speed = speedForWarp(warp);
  for (const s of field.stars) {
    s.z -= speed * dt * (0.35 + s.size * 0.3);
    s.x += steerX * dt * 0.6 * (1.2 - s.z);
    s.y += steerY * dt * 0.6 * (1.2 - s.z);
    if (s.z <= 0.015 || Math.abs(s.x) > 1.6 || Math.abs(s.y) > 1.6) {
      respawnStar(s, field.rand);
    }
  }
}

/** Project a star to screen space. focal scales with canvas size. */
export function projectStar(s, cx, cy, focal, ox, oy) {
  const z = Math.max(0.02, s.z);
  return {
    x: cx + (s.x / z) * focal + ox,
    y: cy + (s.y / z) * focal + oy,
    near: 1 - z, // 0 far .. ~1 near
  };
}

export function createFlight() {
  return {
    warp: 5,
    overdrive: false,
    lightYears: 0,
    steerX: 0,
    steerY: 0,
  };
}

export function stepFlight(flight, dt) {
  const w = flight.overdrive ? OVERDRIVE_WARP : flight.warp;
  flight.lightYears += lightYearsPerSecond(w) * dt;
  // steering eases back to center when released
  flight.steerX *= Math.max(0, 1 - dt * 2.2);
  flight.steerY *= Math.max(0, 1 - dt * 2.2);
  return w;
}
