// tour.js — Hercules mission-logic (pure, zero DOM, zero network).
// Port of highland88999-commits/Hercules ("Adaptive Solar Explorer").
//
// Hercules is NOT a free-fly explorer — Olympus already has one. Hercules is a
// mission-style voyage: pick a destination, fly there on a cinematic camera
// path, read the mission log as you arrive. The "adaptive" in the original
// title is honored honestly: render quality scales to the device.

// ── Mission states ──────────────────────────────────────────────────────────
export const STATES = Object.freeze({
  BRIEFING: 'briefing',     // picking a destination
  COUNTDOWN: 'countdown',   // 3-2-1 before a leg
  CRUISING: 'cruising',     // camera flying to the planet
  ARRIVED: 'arrived',       // at the planet, free look enabled
  COMPLETE: 'complete',     // voyage over
});

// ── Planet data ─────────────────────────────────────────────────────────────
// Distances must stay strictly ascending (asserted by tests). Facts are plain
// English summaries of well-known planetary science.
export const PLANETS = Object.freeze([
  {
    id: 'mercury', name: 'Mercury', radius: 2.2, distance: 60, color: 0xaaaaaa,
    speed: 0.0098,
    fact: 'The smallest planet and the closest to the Sun. It has no real atmosphere, so daytime heat and nighttime cold swing wildly, and its surface is covered in craters like our Moon.',
    moons: [],
  },
  {
    id: 'venus', name: 'Venus', radius: 3.8, distance: 90, color: 0xffcc66,
    speed: 0.0059,
    fact: 'The hottest planet in the solar system. Thick clouds of carbon dioxide trap heat in a runaway greenhouse effect, the air pressure would crush a submarine, and it spins backwards.',
    moons: [],
  },
  {
    id: 'earth', name: 'Earth', radius: 4.0, distance: 130, color: 0x3388ff,
    speed: 0.0043,
    fact: 'Home. The only known world with life, liquid-water oceans covering most of its surface, breathable air, and a magnetic field that shields us from the Sun\u2019s radiation.',
    moons: [{ name: 'Moon', radius: 1.15, dist: 19, speed: 0.078, color: 0xdddddd }],
  },
  {
    id: 'mars', name: 'Mars', radius: 3.0, distance: 180, color: 0xff5533,
    speed: 0.0029,
    fact: 'A cold desert world with a thin atmosphere. It holds the tallest volcano in the solar system, Olympus Mons, and dry riverbeds that show water once flowed there.',
    moons: [
      { name: 'Phobos', radius: 0.65, dist: 7.8, speed: 0.165, color: 0x777777 },
      { name: 'Deimos', radius: 0.45, dist: 12.5, speed: 0.062, color: 0x999999 },
    ],
  },
  {
    id: 'jupiter', name: 'Jupiter', radius: 10, distance: 300, color: 0xffbb77,
    speed: 0.00115,
    fact: 'The largest planet — more than a thousand Earths would fit inside. Its Great Red Spot is a storm wider than our whole planet, and it has at least 95 moons.',
    moons: [
      { name: 'Io', radius: 0.95, dist: 19, speed: 0.112, color: 0xffaa33 },
      { name: 'Europa', radius: 0.85, dist: 24, speed: 0.087, color: 0x99ccff },
      { name: 'Ganymede', radius: 1.35, dist: 32, speed: 0.058, color: 0xeeddbb },
      { name: 'Callisto', radius: 1.2, dist: 41, speed: 0.033, color: 0x888888 },
    ],
  },
  {
    id: 'saturn', name: 'Saturn', radius: 8.5, distance: 450, color: 0xffeebb,
    speed: 0.00068, rings: true,
    fact: 'Famous for its rings — countless chunks of ice and rock, some as small as grains of sand, some as big as houses. It is the least dense planet and has more than 145 known moons.',
    moons: [
      { name: 'Titan', radius: 1.85, dist: 26, speed: 0.046, color: 0xffeecc },
      { name: 'Rhea', radius: 0.75, dist: 16.5, speed: 0.125, color: 0xdddddd },
      { name: 'Enceladus', radius: 0.55, dist: 21, speed: 0.092, color: 0xaaaaaa },
    ],
  },
  {
    id: 'uranus', name: 'Uranus', radius: 6, distance: 650, color: 0xaaffff,
    speed: 0.00034,
    fact: 'An ice giant knocked on its side — it rolls around the Sun tilted about 98 degrees, so each pole gets decades of daylight then decades of darkness. It has faint rings and 28 known moons.',
    moons: [
      { name: 'Titania', radius: 1.12, dist: 17.5, speed: 0.071, color: 0x99ffff },
      { name: 'Oberon', radius: 1.05, dist: 23, speed: 0.053, color: 0x77ccff },
      { name: 'Ariel', radius: 0.85, dist: 14.5, speed: 0.098, color: 0x99dddd },
    ],
  },
  {
    id: 'neptune', name: 'Neptune', radius: 6, distance: 800, color: 0x3366dd,
    speed: 0.00019,
    fact: 'The farthest planet — a deep blue ice giant with the strongest winds in the solar system, up to 1,500 miles per hour. Astronomers found it with math before anyone saw it through a telescope.',
    moons: [
      // Triton orbits backwards (retrograde): negative speed.
      { name: 'Triton', radius: 1.45, dist: 22, speed: -0.042, color: 0x6688ff },
      { name: 'Nereid', radius: 0.65, dist: 29, speed: 0.029, color: 0x9999aa },
    ],
  },
]);

export const SUN = Object.freeze({
  id: 'sun', name: 'Sun', radius: 18, distance: 0, color: 0xffdd00,
  fact: 'A 4.6-billion-year-old star at the center of it all. It holds 99.8% of the solar system\u2019s mass, and its light takes about 8 minutes to reach Earth.',
});

export function getPlanet(id) {
  if (id === 'sun') return SUN;
  return PLANETS.find((p) => p.id === id) || null;
}

export function planetIds() {
  return PLANETS.map((p) => p.id);
}

// ── Adaptive quality tiers ──────────────────────────────────────────────────
// Honest scaling: fewer polygons, fewer stars, lower pixel ratio on weaker
// devices. Nothing here is a guess — it is just render budgets.
export const QUALITY = Object.freeze({
  low:    { label: 'low',    sphereSeg: 24, starCount: 2500,  maxPixelRatio: 1 },
  medium: { label: 'medium', sphereSeg: 32, starCount: 6000,  maxPixelRatio: 1.5 },
  high:   { label: 'high',   sphereSeg: 48, starCount: 12000, maxPixelRatio: 2 },
});

export function pickQualityTier({ isMobile, devicePixelRatio, reducedMotion }) {
  if (reducedMotion) return 'low';
  if (isMobile) return 'medium';
  if ((devicePixelRatio || 1) >= 2) return 'high';
  return 'medium';
}

// ── Mission state machine ───────────────────────────────────────────────────
export function createTour() {
  let state = STATES.BRIEFING;
  let legs = [];       // destination ids for this voyage
  let legIndex = -1;

  return {
    getState: () => state,
    getLegs: () => legs.slice(),
    getLegIndex: () => legIndex,
    currentDestination() {
      return legIndex >= 0 && legIndex < legs.length ? getPlanet(legs[legIndex]) : null;
    },
    legsRemaining() {
      return Math.max(0, legs.length - legIndex - 1);
    },

    // Start a voyage. destinationIds: array of planet ids, or ['grand-tour'].
    begin(destinationIds) {
      const ids = destinationIds.includes('grand-tour') ? planetIds() : destinationIds;
      const valid = ids.filter((id) => getPlanet(id));
      if (valid.length === 0) return false;
      legs = valid;
      legIndex = 0;
      state = STATES.COUNTDOWN;
      return true;
    },

    countdownDone() {
      if (state !== STATES.COUNTDOWN) return state;
      state = STATES.CRUISING;
      return state;
    },

    arrived() {
      if (state !== STATES.CRUISING) return state;
      state = STATES.ARRIVED;
      return state;
    },

    // Move to the next leg, or finish the voyage.
    nextLeg() {
      if (state !== STATES.ARRIVED) return state;
      if (legIndex + 1 < legs.length) {
        legIndex += 1;
        state = STATES.COUNTDOWN;
      } else {
        state = STATES.COMPLETE;
      }
      return state;
    },

    backToBriefing() {
      state = STATES.BRIEFING;
      legs = [];
      legIndex = -1;
      return state;
    },
  };
}

// Mission-log lines for each transition (plain English).
export function logFor(state, destination) {
  const name = destination ? destination.name : 'deep space';
  switch (state) {
    case STATES.COUNTDOWN:
      return [`Voyage plotted. Destination: ${name}.`, 'Engines ready — launching in 3… 2… 1…'];
    case STATES.CRUISING:
      return [`Cruising toward ${name}. Hold on.`];
    case STATES.ARRIVED:
      return [`Arrived at ${name}.`, 'Free look enabled — drag to look around.'];
    case STATES.COMPLETE:
      return ['Voyage complete. The crew thanks you for flying Hercules.'];
    default:
      return [];
  }
}
