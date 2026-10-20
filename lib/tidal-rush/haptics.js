// lib/tidal-rush/haptics.js
// Tiny wrapper over the launcher's native haptic helper (lib/native.js ->
// patternHaptic: native Haptics in the Capacitor shell, navigator.vibrate
// on the web, silent elsewhere). Fire-and-forget by design.

import { patternHaptic } from '@/lib/native';

const PATTERNS = {
  buoyPass: [0, 18], // quick tick through the gate
  missedGate: [0, 50, 40, 50], // unhappy double-buzz
  orb: [0, 15, 25, 20], // little pickup sparkle
  boost: [0, 30, 30, 20], // boost kick
  collision: [0, 70, 40, 60], // solid thump
  splash: [0, 25], // landing slap
  finish: [0, 40, 40, 40, 40, 90], // fanfare
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
