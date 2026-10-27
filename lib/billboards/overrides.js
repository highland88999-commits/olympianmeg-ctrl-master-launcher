// lib/billboards/overrides.js — Pure helpers mapping the live billboard
// manifest onto hub tower panels, plus the rotation math. Headless.
// No browser, no network.
//
// MODEL (Merlin's manager, 2026-10-27):
// - The LIVE store is a repo manifest: public/billboards/manifest.json,
//   written only by the builder via the push path (never by the manager
//   page). Shape: { version: 1, billboards: { "<1-44>": {
//   intervalSeconds, entries: [{ company, link, creativeType,
//   creativeUrl }] } } }.
// - The manager stages a queue in Supabase and Sends it; the builder
//   wires the queue into the manifest. Until then the hub keeps
//   showing its previous creative — never half-live.
// - A billboard's panel cycles its entries on its own timer when it
//   holds more than one entry; a single entry stays static.
// - An override replaces the rotating-inventory slot for that
//   billboard number, INCLUDING panel-0 (stake) numbers when Merlin
//   explicitly sets one — his manager order ("pick one number from
//   each billboard") supersedes the stake-always rule for numbers he
//   sets. Unset numbers keep the base assignment untouched, so
//   lib/tower-panels.js itself never changes.

import { billboardNumberFor, PANELS_PER_TOWER } from '../tower-panels.js';
import { ROTATION_DEFAULT_SECONDS } from './validate.js';

/**
 * Normalize a raw manifest object into a Map: billboard number →
 * { intervalSeconds, entries: [{ company, link, creativeType,
 * creativeUrl }] }. Drops malformed billboards and malformed
 * entries (a bad entry never takes a panel down); a billboard with
 * zero surviving entries is dropped entirely.
 */
export function manifestToOverrides(manifest) {
  const out = new Map();
  const boards = manifest && typeof manifest === 'object' ? manifest.billboards : null;
  if (!boards || typeof boards !== 'object') return out;
  for (const [key, board] of Object.entries(boards)) {
    const number = Number(key);
    if (!Number.isInteger(number) || number < 1 || number > 44) continue;
    const entries = Array.isArray(board?.entries) ? board.entries : [];
    const clean = [];
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      const company = String(e.company ?? '').trim();
      const link = String(e.link ?? '').trim();
      const creativeUrl = String(e.creativeUrl ?? '').trim();
      if (!company || !link || !creativeUrl) continue;
      if (e.creativeType !== 'image' && e.creativeType !== 'video') continue;
      clean.push({ company, link, creativeType: e.creativeType, creativeUrl });
    }
    if (clean.length === 0) continue;
    const interval = Number(board?.intervalSeconds);
    out.set(number, {
      intervalSeconds: Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : ROTATION_DEFAULT_SECONDS,
      entries: clean,
    });
  }
  return out;
}

/** Build the panel slot an override produces for one billboard number. */
export function overrideSlotFor(number, board) {
  const first = board.entries[0];
  return {
    key: `ad-${number}`,
    name: first.company,
    tagline: '',
    terms: 'Managed billboard',
    trackingUrl: first.link,
    accent: '#ffd700',
    kind: 'override',
    entries: board.entries,
    intervalSeconds: board.intervalSeconds,
    // Image entries paint through the existing cover-fit path.
    creatives: first.creativeType === 'image' ? [{ imageUrl: first.creativeUrl }] : [],
    creativeType: first.creativeType,
    creativeUrl: first.creativeUrl,
  };
}

/**
 * Apply overrides to one tower's base panels. basePanels is the
 * panelsForTower(towerIndex) array; towerIndex is 0-based. Returns a
 * NEW array; the base array is never mutated. A panel whose
 * billboard number has no override keeps its base slot.
 */
export function applyOverridesToTowerPanels(basePanels, towerIndex, overridesMap) {
  if (!overridesMap || overridesMap.size === 0) return basePanels;
  let changed = false;
  const next = basePanels.map((slot, panelIndex) => {
    const number = billboardNumberFor(towerIndex, panelIndex);
    const board = overridesMap.get(number);
    if (!board) return slot;
    changed = true;
    return overrideSlotFor(number, board);
  });
  return changed ? next : basePanels;
}

/**
 * Rotation: the next face index for a billboard holding `count`
 * entries. Single-entry billboards never advance (static). Removing
 * an entry just shortens the cycle: the modulo clamps any stale
 * index back into range, so the rest keep rotating undisturbed.
 */
export function nextRotationIndex(current, count) {
  if (!Number.isInteger(count) || count <= 1) return 0;
  const cur = Number.isInteger(current) ? current : 0;
  return (cur + 1) % count;
}

/** Clamp a rotation index into a billboard's current entry count. */
export function clampRotationIndex(index, count) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  if (!Number.isInteger(index) || index < 0) return 0;
  return index % count;
}

/** True when a billboard's panel rotates (more than one entry). */
export function billboardRotates(board) {
  return Array.isArray(board?.entries) && board.entries.length > 1;
}

export { PANELS_PER_TOWER };
