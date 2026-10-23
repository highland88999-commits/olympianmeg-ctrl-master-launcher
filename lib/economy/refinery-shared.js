// lib/economy/refinery-shared.js
// Liquid Gold Refinery — pure helpers shared by the client page, the
// server claim/state routes, and headless tests. No imports beyond the
// economy config, no DOM, no network, no node:crypto — safe to bundle
// into the browser.
//
// The refinery's conversion outputs (Merlin's corrected model,
// 2026-10-22): the refinery's molten gold converts to —
//   'bars'   — gold bars, the refinery's upgrade currency (internal), or
//   'aether' — the platform's true currency, credited to the server
//              aether balance (lib/economy/aether.js).

import { ECONOMY } from './config.js';

export const REFINERY_OUTPUT_BARS = 'bars';
export const REFINERY_OUTPUT_AETHER = 'aether';
export const REFINERY_OUTPUTS = new Set([REFINERY_OUTPUT_BARS, REFINERY_OUTPUT_AETHER]);

/** Normalize a mode action's chosen output; anything unknown -> 'bars'. */
export function cleanOutput(v) {
  return v === REFINERY_OUTPUT_AETHER ? REFINERY_OUTPUT_AETHER : REFINERY_OUTPUT_BARS;
}

/** Gold value of refinery batches: batch count at the economy's bar rate. */
export function refineryGoldValue(batches) {
  const b = Math.max(0, Math.floor(Number(batches) || 0));
  return b * ECONOMY.MINE_GOLD_PER_BAR;
}

// --- Game-state (de)serialization ---------------------------------------
// The engine state (app/liquid-gold/engine.js newState()) is plain data
// except lastMintAt, which starts at -Infinity (not JSON-safe). Stored
// form maps lastMintAt to null; engine form maps null back to -Infinity.
// Sanitizing clamps every field to sane ranges so a corrupted or
// hand-edited save can never resurrect impossible physics — and saves
// are cosmetic anyway: aether is only ever credited from a server replay.

function num(v, { min = 0, max = Number.MAX_SAFE_INTEGER, int = false } = {}) {
  let n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (int) n = Math.floor(n);
  if (n < min || n > max) return null;
  return n;
}

function sanitizeUpgrades(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
  const out = {};
  for (const k of ['pump', 'filter', 'vat']) {
    const lvl = num(u[k], { min: 0, max: 200, int: true });
    if (lvl === null) return null;
    out[k] = lvl;
  }
  return out;
}

/**
 * Validate + normalize a game state into its STORED (JSON-safe) form.
 * Returns null when the shape is wrong beyond repair.
 */
export function toStoredState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const upgrades = sanitizeUpgrades(input.upgrades);
  if (!upgrades) return null;
  const crude = num(input.crude, { min: 0, max: 1e7 });
  const purity = num(input.purity, { min: 0, max: 1 });
  const bars = num(input.bars, { min: 0, max: 1e7, int: true });
  const credits = num(input.credits, { min: 0, max: 1e12, int: true });
  const now = num(input.now, { min: 0, max: 1e12 });
  const pouredTotal = num(input.pouredTotal, { min: 0, max: 1e12 });
  const barsMinted = num(input.barsMinted, { min: 0, max: 1e9, int: true });
  const surgeUntil = num(input.surgeUntil, { min: 0, max: 1e12 });
  const surgeCooldownUntil = num(input.surgeCooldownUntil, { min: 0, max: 1e12 });
  if ([crude, purity, bars, credits, now, pouredTotal, barsMinted, surgeUntil, surgeCooldownUntil].some((v) => v === null)) {
    return null;
  }
  // lastMintAt: a game-time (>= 0) or null (never minted / not JSON-safe).
  let lastMintAt = null;
  if (input.lastMintAt !== null && input.lastMintAt !== undefined && Number.isFinite(input.lastMintAt)) {
    lastMintAt = num(input.lastMintAt, { min: 0, max: 1e12 });
    if (lastMintAt === null) return null;
  }
  // Conversion output + lifetime aether batches. Absent on saves written
  // before the corrected model — default to bars / 0 rather than refuse.
  let output = REFINERY_OUTPUT_BARS;
  if (input.output !== undefined) {
    if (!REFINERY_OUTPUTS.has(input.output)) return null;
    output = input.output;
  }
  let aetherMinted = 0;
  if (input.aetherMinted !== undefined) {
    aetherMinted = num(input.aetherMinted, { min: 0, max: 1e9, int: true });
    if (aetherMinted === null) return null;
  }
  return {
    crude, purity, bars, credits, output,
    pouring: input.pouring === true,
    surgeUntil, surgeCooldownUntil,
    upgrades, now, pouredTotal, barsMinted, aetherMinted, lastMintAt,
  };
}

/** Stored form -> engine form (lastMintAt null becomes -Infinity). */
export function toEngineState(stored) {
  const s = toStoredState(stored);
  if (!s) return null;
  return { ...s, lastMintAt: s.lastMintAt === null ? -Infinity : s.lastMintAt };
}

/**
 * Validate + normalize one logged game action for STORAGE. The
 * refinery's vocabulary: pour / surge / buy (bar-spend) / mode (the
 * conversion output pick), plus the absolute sequence number `i`.
 * Returns null for entries that can never be part of an honest log.
 */
export function cleanLogAction(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const t = num(a.t, { min: 0, max: 1e9, int: true });
  if (t === null) return null;
  if (a.a !== 'pour' && a.a !== 'surge' && a.a !== 'buy' && a.a !== 'mode') return null;
  const out = { t, a: a.a };
  if (a.i !== undefined) {
    const i = num(a.i, { min: 0, max: 1e9, int: true });
    if (i === null) return null;
    out.i = i;
  }
  if (a.a === 'pour') {
    if (typeof a.on !== 'boolean') return null;
    out.on = a.on;
  }
  if (a.a === 'buy') {
    if (a.kind !== 'pump' && a.kind !== 'filter' && a.kind !== 'vat') return null;
    out.kind = a.kind;
  }
  if (a.a === 'mode') {
    if (!REFINERY_OUTPUTS.has(a.out)) return null;
    out.out = a.out;
  }
  return out;
}
