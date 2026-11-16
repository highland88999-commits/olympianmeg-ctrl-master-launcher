// lib/agora/operators.js
// AGORA — MARKET CROWD OPERATORS (Merlin, Nov 15, 2026).
// The agents that operate the living life of the market square,
// following the all-realms seven-agent pattern (lib/earth2/
// operators.js, app/star-wars/operators.js): birth, growth,
// death, decomposition, diet, habits + conductor `lifeFor` —
// a person's whole life a pure function of (place, kind, device
// clock), no stored state, no server.
//
// ENUMERATION — read from code, nothing invented: Agora carries
// NO character, animal, combat or hunt code anywhere
// (app/agora/, components/agora/, lib/agora/ hold only the feed:
// posts, people, profiles, likes, comments). So the crowd kinds
// are the market itself — the people a Greek market city needs:
//   * vendor — one per stall, standing behind their counter,
//     tending their goods (lib/agora/world.js STALL_TRADES).
//   * shopper — strollers looping the square, browsing stall
//     to stall.
//   * gull — Mediterranean gulls circling overhead, the sky's
//     own life.
//
// DEATH LAW — read from code, never invented: there is NO death,
// damage, hunt or combat code anywhere in Agora — the feed has
// no combat system at all. So death is null for every kind:
// operators PERSIST (death: null), never invent a death, a hunt,
// or a user-death outcome. Nothing decomposes, because nothing
// dies.
//
// DIET / HABITS — the vendors sell what their stall trades;
// shoppers browse; gulls scavenge the square. Diet is flagged
// 'default' wherever the code carries no diet at all — the
// market has no diet system, so every diet here is a labelled
// default, never passed off as coded.
//
// POPULATION RULE (Merlin, Nov 14 ~22:57): more than one copy
// per kind, spread out — except named singletons by design.
// Agora has no named figures, so every kind meets the minimum:
// 8 vendors (one per stall), 10 shoppers, 5 gulls.

import { hashString, mulberry32 } from '../earth4/creature-textures.js';
import { PLANET_CGI_EPOCH_MS } from '../planet-cgi/motion.js';
import { stallSites, STALL_COUNT, FOUNTAIN_POSITION } from './world.js';

// ── Population law ──────────────────────────────────────────
/** Minimum live copies per crowd kind. */
export const MIN_COPIES = 2;
/** No named singletons in the market — everyone is a crowd. */
export const SINGLETONS = Object.freeze([]);

// ── Death law (read from code — see header) ─────────────────
export const DEATH_LAW = Object.freeze({
  exists: false,
  causes: [],
  note: 'No death, damage, hunt or combat code exists anywhere in Agora — '
    + 'the feed is posts, people, profiles, likes and comments only — '
    + 'so every crowd member persists (death: null).',
});

// ── Counts ──────────────────────────────────────────────────
export const VENDOR_COUNT = STALL_COUNT; // one vendor per stall
export const SHOPPER_COUNT = 10;
export const GULL_COUNT = 5;

// ── Profiles ────────────────────────────────────────────────
export const CROWD_PROFILES = Object.freeze({
  vendor: {
    name: 'Vendor', kind: 'folk', labelH: 2.4,
    dayActivity: 'tending', moving: false,
    habit: 'Stands behind the stall, tending the goods, calling out to passers-by',
    diet: 'market fare', dietBasis: 'default',
    feeding: 'trade', feedingNote: 'Sells the stall trade (default — no diet in code)',
  },
  shopper: {
    name: 'Shopper', kind: 'folk', labelH: 2.4,
    dayActivity: 'strolling', moving: true,
    habit: 'Loops the square slowly, pausing at stalls to browse',
    diet: 'market fare', dietBasis: 'default',
    feeding: 'browse', feedingNote: 'Browses stall to stall (default — no diet in code)',
  },
  gull: {
    name: 'Gull', kind: 'animal', labelH: 1.2,
    dayActivity: 'circling', moving: true,
    habit: 'Circles high over the square on the Meltemi, crying now and then',
    diet: 'scavenger', dietBasis: 'default',
    feeding: 'scavenge', feedingNote: 'Picks over the square after market hours (default — no diet in code)',
  },
});

export const CROWD_KINDS = Object.keys(CROWD_PROFILES);

export function crowdCount(kind) {
  if (kind === 'vendor') return VENDOR_COUNT;
  if (kind === 'shopper') return SHOPPER_COUNT;
  if (kind === 'gull') return GULL_COUNT;
  return 0;
}

/** Local hour of the device clock — the crowd keeps market hours. */
export function crowdHour(nowMs = Date.now()) {
  return new Date(Number(nowMs)).getHours();
}

/** The market is open 06:00–22:00 local; at night the square quiets. */
export function marketOpen(nowMs = Date.now()) {
  const h = crowdHour(nowMs);
  return h >= 6 && h < 22;
}

function secondsSinceEpoch(nowMs) {
  return (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
}

/**
 * A crowd member's whole life at `nowMs`: { kind, index, x, y, z,
 * heading, activity, bob, alive, death }. Pure function of
 * (kind, index, device clock) — same instant, same square on
 * every phone. Vendors stand at their stall; shoppers loop the
 * square; gulls circle overhead. At night the vendors close
 * their stalls, the shoppers gather chatting at the fountain,
 * and the gulls roost on the temple roof.
 */
export function lifeFor(kind, index, nowMs = Date.now()) {
  const t = secondsSinceEpoch(nowMs);
  const open = marketOpen(nowMs);
  const rnd = mulberry32(hashString(`agora:life:${kind}:${index}`));
  const phase = rnd() * Math.PI * 2;

  if (kind === 'vendor') {
    const stalls = stallSites();
    const stall = stalls[((index % STALL_COUNT) + STALL_COUNT) % STALL_COUNT];
    // Behind the counter: 1.6 m out from the stall, away from
    // the square centre, facing the square.
    const away = Math.atan2(stall.z, stall.x);
    const x = stall.x + Math.cos(away) * 1.6;
    const z = stall.z + Math.sin(away) * 1.6;
    // Faces the square centre: forward is (-sin h, -cos h), so
    // h = π/2 - away puts the forward vector on -away.
    const heading = Math.PI / 2 - away;
    const bob = open ? Math.sin(t * 1.1 + phase) * 0.03 : 0;
    return {
      kind, index, x, y: 0, z, heading,
      activity: open ? 'tending' : 'closing',
      bob, alive: true, death: null,
      trade: stall.trade, stallLabel: stall.label,
    };
  }

  if (kind === 'shopper') {
    const radius = 12 + (index % 4) * 1.6;
    const speed = 0.045 + (index % 3) * 0.008; // slow market stroll
    if (!open) {
      // Night: gathered chatting around the fountain.
      const a = phase + (index % 5) * 0.5;
      return {
        kind, index,
        x: FOUNTAIN_POSITION.x + Math.cos(a) * 4.6,
        y: 0,
        z: FOUNTAIN_POSITION.z + Math.sin(a) * 4.6,
        heading: Math.PI / 2 - a, // faces the fountain
        activity: 'chatting', bob: 0, alive: true, death: null,
      };
    }
    const angle = phase + t * speed;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Heading tangent to the loop, facing the way they walk:
    // velocity (-sin a, cos a) is forward (-sin h, -cos h) at
    // h = π - a.
    const heading = Math.PI - angle;
    // A browsing pause: every shopper lingers near a stall for
    // ~20 s of each ~90 s circuit.
    const pause = Math.sin(t * 0.07 + phase) > 0.78;
    return {
      kind, index, x, y: 0, z, heading,
      activity: pause ? 'browsing' : 'strolling',
      bob: pause ? 0 : Math.abs(Math.sin(t * 3.2 + phase)) * 0.05,
      alive: true, death: null,
    };
  }

  if (kind === 'gull') {
    if (!open) {
      // Night: roosting on the temple roof (north end).
      return {
        kind, index,
        x: -2 + index * 1.1, y: 8.6, z: -44,
        heading: phase, activity: 'roosting', bob: 0,
        alive: true, death: null,
      };
    }
    const radius = 20 + (index % 3) * 4;
    const height = 14 + (index % 3) * 3;
    const speed = 0.11 + (index % 3) * 0.02;
    const angle = phase + t * speed;
    return {
      kind, index,
      x: Math.cos(angle) * radius,
      y: height + Math.sin(t * 0.4 + phase) * 1.2,
      z: Math.sin(angle) * radius,
      heading: Math.PI - angle, // tangent to the circle, like the shoppers
      activity: 'circling', bob: 0, alive: true, death: null,
    };
  }

  return { kind, index, x: 0, y: 0, z: 0, heading: 0, activity: 'idle', bob: 0, alive: false, death: null };
}

/** Every live crowd member at `nowMs` — the whole square, one call. */
export function crowdFor(nowMs = Date.now()) {
  const out = [];
  for (const kind of CROWD_KINDS) {
    for (let i = 0; i < crowdCount(kind); i++) out.push(lifeFor(kind, i, nowMs));
  }
  return out;
}
