// lib/earth/aether.js — AETHER on Earth (Merlin, 2026-10-22):
// glowing pickups hidden INSIDE Earth's buildings and constructs.
//
// What Aether is here: the Aetheris line's visual identity — clean,
// bright cyan-white energy (the sleek purifier towers of
// app/aetheris) — rendered as a small glowing octahedron shard.
// There is NO server Aether ledger for Earth: the World Engine's
// Aether balance (lib/world-engine/economy.js) is a server-side
// credit ledger, and crediting it needs an API + migration, which
// is Merlin's green-light territory. So collection is LOCAL and
// honest: a persisted on-device collection (localStorage) with a
// live counter in the EarthConsole — the collect itself uses the
// standard pickup pattern (fx.coin: sparkle chime + haptic tick).
// Placements come from the interiors registry (lib/earth/
// interiors.js): deterministic (fixed per-interior seeds), inside
// buildings only, spread across classes and regions.
import { getInteriors } from './interiors.js';

/** Aetheris identity: bright cyan-white energy. */
export const AETHER_COLOR = '#aef4ff';
export const AETHER_CORE_COLOR = '#ffffff';

const STORAGE_KEY = 'olympus.earthAether.v1';

function loadCollected() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveCollected() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...aetherState.collected]));
  } catch { /* private mode etc. — collection still counts this session */ }
}

/** Live collection state, polled by the EarthConsole like the bike
 *  and swim singletons. `collected` holds aether placement ids. */
export const aetherState = {
  collected: null, // Set<string>, lazily loaded
  count: 0,
};

function ensureLoaded() {
  if (!aetherState.collected) {
    aetherState.collected = loadCollected();
    aetherState.count = aetherState.collected.size;
  }
}

/** Every aether placement on Earth (flat, registry order). */
export function allAetherPlacements() {
  const out = [];
  for (const spec of getInteriors()) out.push(...spec.aether);
  return out;
}

export function totalAether() {
  return allAetherPlacements().length;
}

export function isAetherCollected(id) {
  ensureLoaded();
  return aetherState.collected.has(id);
}

/** Collect a placement. Returns true when it is newly collected
 *  (the caller plays the pickup feedback only then). */
export function collectAether(id) {
  ensureLoaded();
  if (aetherState.collected.has(id)) return false;
  aetherState.collected.add(id);
  aetherState.count = aetherState.collected.size;
  saveCollected();
  return true;
}
