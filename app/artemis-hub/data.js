/*
 * Artemis Hub — content and simulated readouts (pure logic, no DOM, no network).
 *
 * All readouts on the hub are LOCAL DEMOS: static, illustrative values labeled
 * as such. Nothing is measured, fetched, or uploaded.
 */

export const HUB_TITLE = 'Artemis Hub';
export const HUB_TAGLINE = 'The front door to the Artemis pocket universes.';
export const SIMULATED_NOTE = 'Simulated — shown locally, nothing is measured or sent anywhere.';

/* In-launcher routes only. Keep in sync with modules actually staged. */
export const MODULE_CARDS = [
  {
    id: 'artemis',
    route: '/artemis',
    name: 'Artemis',
    kind: 'Environment',
    blurb: 'The Artemis desktop environment: windows, apps, and a terminal in one screen.',
    status: 'live',
  },
  {
    id: 'architect-artemis',
    route: '/architect-artemis',
    name: 'Architect Artemis',
    kind: 'Console',
    blurb: 'A voice-assistant console. Type or speak commands; everything runs on your device.',
    status: 'live',
  },
  {
    id: 'babel',
    route: '/babel',
    name: 'Babel',
    kind: 'Pocket universe',
    blurb: 'A tower of pocket universes — and the vault at its base.',
    status: 'live',
  },
  {
    id: 'oasis',
    route: '/oasis',
    name: 'Oasis',
    kind: 'Multiplayer',
    blurb: 'Party rooms, NPC rivals, and gamer profiles across the launcher.',
    status: 'live',
  },
  {
    id: 'agora',
    route: '/agora',
    name: 'Agora',
    kind: 'Community',
    blurb: 'The community town square: posts, profiles, and conversation.',
    status: 'live',
  },
  {
    id: 'underworld',
    route: '/underworld',
    name: 'Underworld',
    kind: 'Catalog',
    blurb: 'A browsable catalog of games across platforms.',
    status: 'live',
  },
];

/* Fixed illustrative readouts. Deterministic so tests stay stable. */
export const STATUS_READOUTS = [
  { label: 'Console link', value: 'Local', detail: 'All hub actions stay in this launcher.' },
  { label: 'Network calls', value: 'None', detail: 'Zero external requests by design.' },
  { label: 'Telemetry', value: 'Off', detail: 'The old phone-home code was removed, not ported.' },
  { label: 'Media', value: 'Procedural', detail: 'Canvas visuals replace the shipped MP4s.' },
];

export function cardById(id) {
  return MODULE_CARDS.find((c) => c.id === id) || null;
}

export function cardByRoute(route) {
  return MODULE_CARDS.find((c) => c.route === route) || null;
}

/** Every card must carry the fields the hub renders. */
export function validateCards() {
  const problems = [];
  const seen = new Set();
  for (const c of MODULE_CARDS) {
    for (const k of ['id', 'route', 'name', 'kind', 'blurb', 'status']) {
      if (!c[k] || typeof c[k] !== 'string') problems.push(`card ${c.id || '?'}: missing ${k}`);
    }
    if (c.route && !c.route.startsWith('/')) problems.push(`card ${c.id}: route must be in-launcher`);
    if (c.route && /^https?:/i.test(c.route)) problems.push(`card ${c.id}: route must not be remote`);
    if (seen.has(c.id)) problems.push(`duplicate card id: ${c.id}`);
    seen.add(c.id);
  }
  return problems;
}
