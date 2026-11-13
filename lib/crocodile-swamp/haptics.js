// lib/crocodile-swamp/haptics.js
// Tiny wrapper over the launcher's native haptic helper (lib/native.js ->
// patternHaptic: native Haptics in the Capacitor shell, navigator.vibrate
// on the web, silent elsewhere). Fire-and-forget by design.

import { patternHaptic } from '@/lib/native';

const PATTERNS = {
  paddle: null, // paddling is constant — sound only
  spotted: [0, 60, 60, 60], // double warning
  bump: [0, 150, 60, 100], // the boat goes over
  landfall: [0, 40, 40, 40, 40, 60], // scrambled ashore
  hunt: [0, 90, 50, 90], // it is coming
  caught: [0, 200, 100, 200], // heavy final
};

export function buzz(name) {
  const p = PATTERNS[name];
  if (!p) return;
  try {
    patternHaptic(p);
  } catch {
    // Haptics are decorative — never let them break the game.
  }
}
