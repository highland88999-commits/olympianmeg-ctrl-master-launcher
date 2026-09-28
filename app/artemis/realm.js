// Artemis realm — pure logic for Merlin's personal command deck.
// No DOM, no network. Everything here is derivable/testable headless.
//
// The realm shows honest, live counts from the launcher satellite registry
// (SATELLITES in lib/i18n/satellites.ts) — never invented numbers — and offers
// quick-launch cards for Merlin's key realms.

export const REALM_NAME = 'Artemis';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// Quick-launch targets: registry keys plus a plain-English label and blurb.
// Labels describe what the realm is; no slogans, no invented lore.
export const QUICK_LAUNCH = [
  { key: 'chess', label: 'Chess', blurb: 'Play a friend or the machine.' },
  { key: 'olympus', label: 'Olympus', blurb: 'The grand store.' },
  { key: 'babel', label: 'Babel', blurb: 'The tower of pocket universes.' },
  { key: 'agora', label: 'Agora', blurb: 'The town square.' },
  { key: 'world-engine', label: 'World Engine', blurb: 'Build living 3D worlds.' },
  { key: 'hephaestus', label: 'Hephaestus', blurb: 'The forge — ideas and making.' },
  { key: 'ares', label: 'Ares', blurb: 'The security console.' },
  { key: 'alexandria', label: 'Alexandria', blurb: 'The library.' },
];

// Plain-English descriptions of each launcher section, in first-seen order
// when no registry is available. Derived order wins at runtime.
export const SECTION_DESCRIPTIONS = {
  SANCTUM: "Merlin's own realm.",
  GAMES: 'Games and play.',
  UTILITIES: 'Tools and workshops.',
  TOOLS: 'Work instruments.',
  'AI PROGRAMS': 'AI-assisted programs.',
  OBSERVATORY: 'Worlds and gathering places.',
  THERAPY: 'Quiet spaces.',
};

// Look up a registry entry by key. Returns null when absent (never throws,
// never fabricates an entry).
export function resolveTarget(satellites, key) {
  if (!Array.isArray(satellites)) return null;
  return satellites.find((s) => s && s.key === key) || null;
}

// Resolve every quick-launch card against the registry, dropping any key
// that no longer exists. Returned cards carry the registry route and pos.
export function resolveQuickLaunch(satellites) {
  return QUICK_LAUNCH.map((q) => {
    const entry = resolveTarget(satellites, q.key);
    if (!entry) return null;
    return { ...q, route: entry.route, pos: entry.pos };
  }).filter(Boolean);
}

// Count registry entries by a field, preserving first-seen order.
export function countBy(satellites, field) {
  const out = [];
  const index = new Map();
  for (const s of satellites || []) {
    const name = s && s[field];
    if (!name) continue;
    if (!index.has(name)) {
      index.set(name, out.length);
      out.push({ name, count: 0 });
    }
    out[index.get(name)].count += 1;
  }
  return out;
}

export function constellationCounts(satellites) {
  return countBy(satellites, 'constellation');
}

export function sectionCounts(satellites) {
  return countBy(satellites, 'section');
}

// Fleet summary: total satellites plus per-constellation and per-section
// breakdowns, all derived from the real registry.
export function fleetSummary(satellites) {
  const list = Array.isArray(satellites) ? satellites : [];
  return {
    total: list.length,
    constellations: constellationCounts(list),
    sections: sectionCounts(list).map((s) => ({
      ...s,
      blurb: SECTION_DESCRIPTIONS[s.name] || '',
    })),
  };
}

// --- Deterministic procedural starfield -----------------------------------
// mulberry32 PRNG so the first paint is stable between loads.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createStarfield(seed = 20260928, count = 140) {
  const rand = mulberry32(seed);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand(), // 0..1 across the canvas
      y: rand(), // 0..1 down the canvas
      r: 0.4 + rand() * 1.3, // radius in px
      phase: rand() * Math.PI * 2, // twinkle phase
      speed: 0.3 + rand() * 0.9, // twinkle speed
      warm: rand() < 0.14, // a few warm-tinted stars
    });
  }
  return stars;
}

// Twinkle factor for a star at time t (seconds). Kept subtle: 0.55..1.
export function twinkle(star, t) {
  return 0.775 + 0.225 * Math.sin(t * star.speed + star.phase);
}

// Format a date as a plain local date line for the header. Pure.
export function formatRealmDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
