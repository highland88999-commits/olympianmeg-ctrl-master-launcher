// lib/myriad-progress.js — MYRIAD saved progress.
//
// Local record only (no network, no account): which universes the
// traveller has visited, how many wormholes they have ridden, which
// sites they have found, where they have landed, and which missions
// they have completed. Same load/create/save shape as the other world
// programs: silent fallbacks, never throws.
//
// Record shape:
//   { v: 1, visited: [universeId...], wormholes: number,
//     found: ['<universeId>:<siteId>'...],
//     landings: [{ universeId, siteId }...],
//     completedMissions: [missionId...] }
// Pure logic — no DOM except the guarded localStorage access, no THREE.

export const PROGRESS_KEY = 'olympus:myriad:progress:v1';

export function createProgress() {
  return {
    v: 1,
    visited: [],
    wormholes: 0,
    found: [],
    landings: [],
    completedMissions: [],
  };
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return createProgress();
  return {
    v: 1,
    visited: asArray(raw.visited).filter((n) => Number.isInteger(n)),
    wormholes: Number.isInteger(raw.wormholes) && raw.wormholes > 0 ? raw.wormholes : 0,
    found: asArray(raw.found).filter((k) => typeof k === 'string'),
    landings: asArray(raw.landings).filter(
      (l) => l && Number.isInteger(l.universeId) && typeof l.siteId === 'string'
    ),
    completedMissions: asArray(raw.completedMissions).filter((m) => typeof m === 'string'),
  };
}

export function loadProgress() {
  try {
    if (typeof localStorage === 'undefined') return createProgress();
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return createProgress();
    return sanitize(JSON.parse(raw));
  } catch {
    return createProgress();
  }
}

export function saveProgress(value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(value));
  } catch {
    /* privacy mode / quota — progress stays in memory only */
  }
}

// --- pure updaters (each returns a fresh record, input untouched) ---

export function markVisited(progress, universeId) {
  const p = sanitize(progress);
  if (!p.visited.includes(universeId)) p.visited = [...p.visited, universeId];
  return p;
}

export function recordWormhole(progress) {
  const p = sanitize(progress);
  p.wormholes = p.wormholes + 1;
  return p;
}

export function markFound(progress, key) {
  const p = sanitize(progress);
  if (!p.found.includes(key)) p.found = [...p.found, key];
  return p;
}

export function markLanded(progress, universeId, siteId) {
  const p = sanitize(progress);
  const already = p.landings.some(
    (l) => l.universeId === universeId && l.siteId === siteId
  );
  if (!already) p.landings = [...p.landings, { universeId, siteId }];
  return p;
}

export function markMissionDone(progress, missionId) {
  const p = sanitize(progress);
  if (!p.completedMissions.includes(missionId)) {
    p.completedMissions = [...p.completedMissions, missionId];
  }
  return p;
}

// --- read helpers ---

export function visitedCount(progress) {
  return sanitize(progress).visited.length;
}

export function foundCount(progress) {
  return sanitize(progress).found.length;
}

export function landingCount(progress) {
  return sanitize(progress).landings.length;
}

export function hasFound(progress, key) {
  return sanitize(progress).found.includes(key);
}
