// lib/tetrus/haptics.js
// Tiny wrapper over the launcher's native haptic helper (lib/native.js ->
// patternHaptic: native Haptics in the Capacitor shell, navigator.vibrate
// on the web, silent elsewhere). Fire-and-forget by design.

import { patternHaptic } from '@/lib/native';

const PATTERNS = {
  move: null, // far too frequent to buzz — sound only
  rotate: [0, 12],
  lock: [0, 35], // stone settling
  hardDrop: [0, 20, 25, 55], // fall + impact
  clear: [0, 30, 40, 30, 40, 60], // the floor sings shut
  combo: [0, 45, 30, 45, 30, 70],
  levelClear: [0, 40, 40, 40, 40, 90],
  strain: [0, 90, 50, 90], // Kronos testing the lid
  gameOver: [0, 140, 60, 140, 60, 200],
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
