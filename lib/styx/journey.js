// Styx journey state machine — pure functions, tested in tests/styx-journey.test.js.
export const LEGS = [
  {
    route: "/anti-life",
    numeral: "I",
    title: "The Decay",
    text: "First, the decay. Everything falls apart — watch it closely, so you can see what doesn't.",
  },
  {
    route: "/life",
    numeral: "II",
    title: "The Orbit",
    text: "Then, the orbit. Six rings holding their course through the dark.",
  },
  {
    route: "/meaning-of-life",
    numeral: "III",
    title: "The Question",
    text: "Then, the question. It doesn't need an answer today. Sit with it anyway.",
  },
  {
    route: "/the-afterlife",
    numeral: "IV",
    title: "The Beyond",
    text: "Then, the beyond. Whatever you believe is waiting — look at it straight.",
  },
];

export const STORAGE_KEY = "styx-leg";

/** Clamp any stored value to a valid leg index (0..LEGS.length). LEGS.length = complete. */
export function sanitizeLeg(value) {
  const n = typeof value === "number" ? value : parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(LEGS.length, Math.floor(n)));
}

/** Advance one station after the traveler returns from it. */
export function advanceLeg(leg) {
  return Math.min(LEGS.length, sanitizeLeg(leg) + 1);
}

export function isComplete(leg) {
  return sanitizeLeg(leg) >= LEGS.length;
}

/** The station URL for a leg, carrying the passage flag so the station shows a way back. */
export function stationUrl(leg) {
  const l = LEGS[sanitizeLeg(leg)];
  if (!l) return null;
  return `${l.route}?passage=1`;
}
