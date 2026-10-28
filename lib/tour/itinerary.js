// lib/tour/itinerary.js — the Travelator's gate lists (pure, headless).
//
// Gates come straight from the program registry (lib/i18n/satellites):
// nothing invented, no program added or skipped by hand. Two rides:
//   - grand: one gate per section (the section's first program in
//     registry order) — the short ride, about a minute;
//   - full: every program in registry order — the whole wall, 179 gates.
// The travelator never waits: GATE_SECONDS per gate, then it moves on.

export const GATE_SECONDS = 5;

export function prettifyKey(key) {
  return String(key || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Sections in first-seen registry order, or preferredOrder first when given. */
export function sectionOrder(entries, preferredOrder) {
  const seen = [];
  const has = new Set();
  const push = (s) => {
    if (s && !has.has(s)) {
      has.add(s);
      seen.push(s);
    }
  };
  (preferredOrder || []).forEach(push);
  (entries || []).forEach((e) => push(e.section));
  return seen;
}

/** One gate per section: the section's first program in registry order. */
export function buildGrandTour(entries, preferredOrder) {
  const gates = [];
  const taken = new Set();
  for (const e of entries || []) {
    if (!e || !e.section || taken.has(e.section)) continue;
    taken.add(e.section);
    gates.push({ key: e.key, route: e.route, section: e.section, constellation: e.constellation });
  }
  const order = sectionOrder(entries, preferredOrder);
  gates.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
  return gates;
}

/** Every program, in registry order. */
export function buildFullTour(entries) {
  return (entries || [])
    .filter((e) => e && e.key && e.route)
    .map((e) => ({ key: e.key, route: e.route, section: e.section, constellation: e.constellation }));
}

export function buildTour(entries, mode, preferredOrder) {
  return mode === 'full' ? buildFullTour(entries) : buildGrandTour(entries, preferredOrder);
}
