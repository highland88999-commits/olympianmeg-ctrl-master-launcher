// lib/program-wraps.js — Shared graphic wrap system for programs (Merlin, 2026-11-02).
//
// Uses the SAME pool as the vortex transit system (lib/vortex/wraps-manifest.js —
// every image in public/). Each program gets a STABLE wrap: deterministic by
// program key, not random per load. Theme-aware: sports programs prefer sports
// imagery where the pool has it.
//
// Merlin's menu-dressing standard: illustrated art BEHIND the menus, everything
// works exactly as before, no layout change. Background image + readability
// scrim, controls untouched.
//
// "Within reason": if a page already has excellent custom art, don't replace
// good with random. Mark it null in PROGRAM_WRAPS to keep the custom art.

import { VORTEX_WRAP_FILES } from './vortex/wraps-manifest.js';

// FNV-1a hash — stable selection per program key.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Theme keywords for filtering the pool (lowercase match on file path).
const THEME_KEYWORDS = {
  sports: [
    'sport', 'ball', 'pong', 'tennis', 'soccer', 'football', 'hockey',
    'volley', 'dodge', 'court', 'field', 'stadium', 'arena', 'game',
    'basketball', 'pinball', 'race', 'run',
  ],
  attractions: [
    'ride', 'coaster', 'slide', 'mirror', 'carnival', 'park', 'attraction',
    'merry', 'water',
  ],
};

// Curated per-program wraps. null = keep existing custom art, do NOT wrap.
// A string path = use this specific file (overrides the deterministic pick).
const PROGRAM_WRAPS = {
  'beer-pong': null, // KEEP: full arena rebuild (Merlin, 2026-11-02)
  'dodgeball': null, // KEEP: custom arena menu art, Nov 1 art pass
  'hockey': null, // KEEP: custom ice-rink menu art, Nov 1 art pass
  'tennis': null, // KEEP: custom storm-sky court art, Nov 1 art pass
  'table-tennis': null, // KEEP: custom menu art, Nov 1 art pass
  'run-it-straight': null, // KEEP: custom menu art, Nov 1 art pass
  'soccer': null, // KEEP: floodlit-stadium menu art, Nov 1 art pass
  'volleyball': null, // KEEP: custom menu art, Nov 1 art pass
  'sports-complex': null, // KEEP: bespoke animated 3D stadium scene
  'attractions-complex': null, // KEEP: bespoke cosmic midway 3D scene
  // Everything else falls through to the deterministic themed pick.
};

export function pickProgramWrap(programKey, theme = null) {
  let pool = VORTEX_WRAP_FILES;
  if (theme && THEME_KEYWORDS[theme]) {
    const keywords = THEME_KEYWORDS[theme];
    const themed = pool.filter((f) => {
      const lower = f.toLowerCase();
      return keywords.some((k) => lower.includes(k));
    });
    if (themed.length > 0) pool = themed;
  }
  if (pool.length === 0) return null;
  return pool[hashStr(programKey) % pool.length];
}

// Main entry: returns the wrap image path for a program, or null to keep
// the page's existing art. Stable — same key always returns the same file.
export function getProgramWrap(programKey, theme = null) {
  if (Object.prototype.hasOwnProperty.call(PROGRAM_WRAPS, programKey)) {
    return PROGRAM_WRAPS[programKey]; // null or curated path
  }
  return pickProgramWrap(programKey, theme);
}

// React helper: the standard menu-dressing wrap (art + scrim, controls untouched).
// Usage in a page: {ProgramWrapArt programKey="soccer" theme="sports"}
// Renders two absolutely-positioned divs; the page's content goes after it.
export function wrapArtStyle(imagePath) {
  return imagePath
    ? { backgroundImage: `url(${imagePath})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};
}

export const WRAP_SCRIM =
  'linear-gradient(180deg, rgba(12,6,22,0.72) 0%, rgba(12,6,22,0.55) 50%, rgba(12,6,22,0.85) 100%)';
