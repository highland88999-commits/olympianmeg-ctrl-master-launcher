/**
 * The Big Bang — pure logic: cosmic timeline, particle field, solar system.
 * No DOM, no canvas. t is normalized time in [0, 1].
 */

export const UNIVERSE_AGE_YEARS = 13.8e9;

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

/** Years after the bang for normalized time t (cubic mapping for scrub feel). */
export function yearsAfterBang(t) {
  const c = Math.max(0, Math.min(1, t));
  return UNIVERSE_AGE_YEARS * c * c * c;
}

export function formatYears(years) {
  if (years < 2) return "the first instant";
  if (years < 1000) return `${Math.round(years).toLocaleString("en-US")} years`;
  if (years < 1e6) return `${(years / 1e3).toFixed(1)} thousand years`;
  if (years < 1e9) return `${(years / 1e6).toFixed(1)} million years`;
  return `${(years / 1e9).toFixed(2)} billion years`;
}

const STAGES = [
  {
    id: "flash",
    name: "The First Flash",
    until: 1e6,
    blurb: "Everything there is, smaller than an atom — then space itself stretches in a fraction of a second.",
  },
  {
    id: "dark",
    name: "The Dark Ages",
    until: 2e8,
    blurb: "Hot fog cools. For hundreds of millions of years there is no starlight at all.",
  },
  {
    id: "stars",
    name: "First Stars Ignite",
    until: 1e9,
    blurb: "Gravity wins. The first giant stars switch on and burn blue-hot.",
  },
  {
    id: "galaxies",
    name: "Galaxies Assemble",
    until: 9.2e9,
    blurb: "Stars gather into spirals. Collisions forge the heavy elements of future worlds.",
  },
  {
    id: "solar",
    name: "A Star Is Born",
    until: 12.5e9,
    blurb: "A cloud collapses 4.6 billion years ago. The Sun lights; planets settle into their orbits.",
  },
  {
    id: "present",
    name: "The Present",
    until: Infinity,
    blurb: "13.8 billion years later: the expansion continues, and here we are, looking back.",
  },
];

export function stageFor(t) {
  const y = yearsAfterBang(t);
  for (let i = 0; i < STAGES.length; i++) {
    if (y < STAGES[i].until) return { ...STAGES[i], index: i, years: y };
  }
  return { ...STAGES[STAGES.length - 1], index: STAGES.length - 1, years: y };
}

/** Expansion radius factor: violent early growth, gentler later. */
export function expansionFactor(t) {
  const c = Math.max(0, Math.min(1, t));
  return Math.pow(c, 0.62);
}

/**
 * Seeded particle field. Each particle: direction, speed, ignition time
 * (when its star turns on), temperature class.
 */
export function makeParticles(seed, count) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    parts.push({
      dx: s * Math.cos(th),
      dy: s * Math.sin(th),
      dz: u,
      speed: 0.35 + rand() * 0.65,
      ignite: Math.pow(rand(), 1.6) * 0.75, // most ignite early-ish
      temp: rand(), // 0 = blue young, 1 = red old
      size: 0.6 + rand() * 1.9,
    });
  }
  return parts;
}

/** Star color by age: blue-white young -> warm -> red giant. */
export function starColor(p, t) {
  const age = Math.max(0, t - p.ignite);
  const k = Math.min(1, age * 2.2);
  const blue = 1 - k;
  const r = Math.round(160 + 95 * k);
  const g = Math.round(190 - 70 * k);
  const b = Math.round(255 - 130 * k);
  void blue;
  return [r, g, b];
}

/** Brightness 0..1: dark before ignition, flash at birth, steady after. */
export function starBrightness(p, t) {
  if (t < p.ignite) return 0;
  const age = t - p.ignite;
  if (age < 0.02) return age / 0.02; // birth flash ramp
  return Math.max(0.25, 1 - age * 0.9);
}

/** 2D projected position of a particle at time t (orthographic, slight tilt). */
export function particlePos(p, t, radius, tiltX) {
  const r = radius * expansionFactor(t) * p.speed;
  const x = p.dx * r;
  const y0 = p.dy * r;
  const z = p.dz * r;
  const y = y0 * Math.cos(tiltX) - z * Math.sin(tiltX);
  return { x, y, z, r };
}

// Solar system (relative orbital radii + periods, scaled for display)
export const PLANETS = [
  { name: "Mercury", radius: 0.16, period: 0.24, size: 2.2, color: "#b5a48e" },
  { name: "Venus", radius: 0.22, period: 0.62, size: 3.2, color: "#e8c87e" },
  { name: "Earth", radius: 0.29, period: 1.0, size: 3.4, color: "#5ea8ff" },
  { name: "Mars", radius: 0.36, period: 1.88, size: 2.6, color: "#ff7a4d" },
  { name: "Jupiter", radius: 0.5, period: 11.86, size: 7.5, color: "#d8a86e" },
  { name: "Saturn", radius: 0.63, period: 29.45, size: 6.4, color: "#e8d8a8", ring: true },
  { name: "Uranus", radius: 0.75, period: 84.0, size: 4.6, color: "#9fe8e0" },
  { name: "Neptune", radius: 0.86, period: 164.8, size: 4.4, color: "#5e7dff" },
];

/** Planet angle at normalized late-time u (u in [0,1] across the solar stage). */
export function planetAngle(planet, u, seedOffset) {
  return seedOffset + u * Math.PI * 2 * (1 / planet.period) * 3;
}
