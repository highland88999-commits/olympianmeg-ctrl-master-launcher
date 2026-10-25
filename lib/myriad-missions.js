// lib/myriad-missions.js — MYRIAD missions.
//
// Missions are checked against the saved progress record (see
// lib/myriad-progress.js). Free Roam never checks missions off — the
// page only calls completeMission() in Missions mode — but places
// visited and sites found still save in both modes, so a collection
// grown while roaming still counts when the traveller returns to
// Missions mode. Pure logic — no DOM, no THREE imports.
//
// Goal shapes:
//   { kind: 'visits', count }            — different universes visited
//   { kind: 'wormholes', count }         — wormholes ridden
//   { kind: 'anomalyKinds', kinds: [] }  — visited one of each kind
//   { kind: 'foundKind', siteKind, count } — sites of one kind found
//   { kind: 'landings', count }          — landings made
//   { kind: 'wonderKinds', kinds: [] }   — one of each new wonder kind
//   { kind: 'allUniverses' }             — all 100 visited

import { UNIVERSE_COUNT, universeById } from './myriad-universes.js';
import { parseFoundKey } from './myriad-wonders.js';

export const MISSIONS = [
  {
    id: 'first-flight',
    title: 'First flight',
    desc: 'Fly your first universe.',
    goal: { kind: 'visits', count: 1 },
  },
  {
    id: 'atlas-ten',
    title: 'Ten worlds',
    desc: 'Visit 10 different universes.',
    goal: { kind: 'visits', count: 10 },
  },
  {
    id: 'atlas-quarter',
    title: 'Quarter of the atlas',
    desc: 'Visit 25 different universes.',
    goal: { kind: 'visits', count: 25 },
  },
  {
    id: 'wormhole-rider',
    title: 'Wormhole rider',
    desc: 'Ride a wormhole and wake up somewhere else.',
    goal: { kind: 'wormholes', count: 1 },
  },
  {
    id: 'anomaly-tour',
    title: 'Anomaly tour',
    desc: 'Visit a wormhole, a starforge, a voidbloom, and a crystalfield.',
    goal: { kind: 'anomalyKinds', kinds: ['wormhole', 'starforge', 'voidbloom', 'crystalfield'] },
  },
  {
    id: 'signal-hunter',
    title: 'Signal hunter',
    desc: 'Find 3 signal sources.',
    goal: { kind: 'foundKind', siteKind: 'signal', count: 3 },
  },
  {
    id: 'salvager',
    title: 'Salvager',
    desc: 'Board 2 derelict stations.',
    goal: { kind: 'foundKind', siteKind: 'derelict', count: 2 },
  },
  {
    id: 'phenomenon-witness',
    title: 'Phenomenon witness',
    desc: 'Witness 3 rare phenomena.',
    goal: { kind: 'foundKind', siteKind: 'phenomenon', count: 3 },
  },
  {
    id: 'grounded',
    title: 'Boots on the ground',
    desc: 'Land and walk at a wonder site.',
    goal: { kind: 'landings', count: 1 },
  },
  {
    id: 'wonder-seeker',
    title: 'Wonder seeker',
    desc: 'Find an aurora veil, a comet swarm, and an echo reef.',
    goal: { kind: 'wonderKinds', kinds: ['aurora-veil', 'comet-swarm', 'echo-reef'] },
  },
  {
    id: 'century',
    title: 'All one hundred',
    desc: 'Visit all 100 universes.',
    goal: { kind: 'allUniverses' },
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

// Kind of a found site, from its stored key '<universeId>:<siteId>'.
// Wonder sites are 'wonder-<kind>'; finds are '<kind>-<index>'.
export function foundSiteKind(key) {
  const parsed = parseFoundKey(key);
  if (!parsed) return null;
  const { siteId } = parsed;
  if (siteId.startsWith('wonder-')) return siteId.slice('wonder-'.length);
  const dash = siteId.indexOf('-');
  return dash > 0 ? siteId.slice(0, dash) : null;
}

// { current, target, done } for one mission against a progress record.
export function missionProgress(progress, mission) {
  const p = progress || {};
  const visited = Array.isArray(p.visited) ? p.visited : [];
  const found = Array.isArray(p.found) ? p.found : [];
  const landings = Array.isArray(p.landings) ? p.landings : [];
  const g = mission.goal;
  switch (g.kind) {
    case 'visits':
      return { current: visited.length, target: g.count, done: visited.length >= g.count };
    case 'wormholes': {
      const n = Number.isInteger(p.wormholes) ? p.wormholes : 0;
      return { current: n, target: g.count, done: n >= g.count };
    }
    case 'anomalyKinds': {
      const seen = new Set();
      for (const id of visited) {
        const u = universeById(id);
        if (u && g.kinds.includes(u.anomaly)) seen.add(u.anomaly);
      }
      return { current: seen.size, target: g.kinds.length, done: seen.size >= g.kinds.length };
    }
    case 'foundKind': {
      const n = found.filter((k) => foundSiteKind(k) === g.siteKind).length;
      return { current: n, target: g.count, done: n >= g.count };
    }
    case 'landings':
      return { current: landings.length, target: g.count, done: landings.length >= g.count };
    case 'wonderKinds': {
      const seen = new Set();
      for (const k of found) {
        const kind = foundSiteKind(k);
        if (kind && g.kinds.includes(kind)) seen.add(kind);
      }
      return { current: seen.size, target: g.kinds.length, done: seen.size >= g.kinds.length };
    }
    case 'allUniverses':
      return { current: visited.length, target: UNIVERSE_COUNT, done: visited.length >= UNIVERSE_COUNT };
    default:
      return { current: 0, target: 0, done: false };
  }
}

// Missions that are now complete but not yet recorded as done.
// The page calls this after every progress event (Missions mode only).
export function newlyCompleted(progress) {
  const done = Array.isArray(progress.completedMissions) ? progress.completedMissions : [];
  return MISSIONS.filter(
    (m) => !done.includes(m.id) && missionProgress(progress, m).done
  );
}

// First mission still open, for the HUD chip. Null when all are done.
export function nextMission(progress) {
  const done = Array.isArray(progress.completedMissions) ? progress.completedMissions : [];
  return MISSIONS.find((m) => !done.includes(m.id)) || null;
}
