// lib/characters/raptor-runners.js
//
// WAVE 5 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §2 + Wave 5) — the
// selectable Raptor Rush runners.
//
// Raptor Rush is a 2D canvas runner, so its character embodiment is
// 2D too: each runner's sprite is a TOP-DOWN render of the fighter's
// real hosted GLB (the same optimized model Kombat streams), drawn
// head-up — the runner's camera looks straight down on the canyon.
// The renders are one-time static assets under
// public/images/raptor-rush/ (generated headlessly from the local
// byte-identical copies of the hosted GLBs; see the Wave 5 build
// notes). Nothing here is hand-drawn or AI-substituted art.
//
// SCOPE, deliberately: Swift / Claw / Fang only. The T-Rex is NOT a
// runner — whether it is playable at boss scale, a rival, or absent
// is decision D8, still Merlin's call, so it does not appear here.
// A future D8 answer adds a row; nothing else changes.
//
// Pick model follows the platform pick chain (lib/characters/
// embodiment.js, plan §3): per-surface override
// (localStorage `olympus.characterPick.raptor-rush`) > profile
// character > native. readSurfaceRunner() runs the chain and then
// validates against this registry, so a profile default that isn't
// a raptor (Jason, Slimer, …) never leaks into the canyon — it
// simply means the native code-art runner, exactly as before
// Wave 5 — while a profile pick that IS Swift/Claw/Fang is
// honored as the default runner.
//
// Visual swap only: the sprite replaces the drawn runner; game.js
// logic (raptorBox hitbox, speeds, scoring) never sees this module.

import { getEmbodiment, resolveSurfaceCharacterId } from './embodiment.js';

export const RAPTOR_RUSH_SURFACE = 'raptor-rush';

// Display names stay the roster names ("Swift (raptor)"); the short
// name is what the picker + HUD use. Sprite files keep the roster
// queue numbers so the asset's provenance is obvious on disk.
export const RAPTOR_RUNNERS = [
  {
    characterId: 'q022-swift-raptor',
    kombatId: 'raptor-swift',
    shortName: 'Swift',
    sprite: '/images/raptor-rush/raptor-swift.png',
    accent: '#43d17c', // the native runner's green — Swift is the default look
  },
  {
    characterId: 'q023-claw-raptor',
    kombatId: 'raptor-claw',
    shortName: 'Claw',
    sprite: '/images/raptor-rush/raptor-claw.png',
    accent: '#e5484d',
  },
  {
    characterId: 'q024-fang-raptor',
    kombatId: 'raptor-fang',
    shortName: 'Fang',
    sprite: '/images/raptor-rush/raptor-fang.png',
    accent: '#7ac74f',
  },
];

const BY_CHARACTER_ID = new Map(RAPTOR_RUNNERS.map((r) => [r.characterId, r]));
const BY_KOMBAT_ID = new Map(RAPTOR_RUNNERS.map((r) => [r.kombatId, r]));

/** Runner record for a roster characterId, or null (incl. T-Rex). */
export function runnerForCharacter(characterId) {
  if (typeof characterId !== 'string') return null;
  return BY_CHARACTER_ID.get(characterId) || null;
}

/** Runner record for a Kombat bridge id ('raptor-swift'), or null. */
export function runnerForKombatId(kombatId) {
  if (typeof kombatId !== 'string') return null;
  return BY_KOMBAT_ID.get(kombatId) || null;
}

/** True when the id names a selectable Raptor Rush runner. */
export function isRaptorRunnerId(characterId) {
  return runnerForCharacter(characterId) !== null;
}

/**
 * Picker options for the Raptor Rush menu: every runner joined with
 * its roster record (full display name + preview for the card art).
 */
export function raptorRunnerOptions() {
  return RAPTOR_RUNNERS.map((r) => {
    const e = getEmbodiment(r.characterId);
    return {
      ...r,
      name: e ? e.name : r.shortName,
      preview: e ? e.preview : null,
    };
  });
}

/**
 * The runner for this device, or null (the native code-art
 * runner). Runs the platform pick chain (surface override >
 * profile character) and validates the result against the raptor
 * cast — a non-raptor resolution is the native runner, never a
 * forced embodiment.
 */
export function readSurfaceRunner(storage) {
  const id = resolveSurfaceCharacterId(RAPTOR_RUSH_SURFACE, { storage });
  return id ? runnerForCharacter(id) : null;
}
