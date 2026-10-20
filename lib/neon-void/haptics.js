// lib/neon-void/haptics.js
// Tiny wrapper over the launcher's native haptic helper (lib/native.js ->
// patternHaptic: native Haptics in the Capacitor shell, navigator.vibrate
// on the web, silent elsewhere). Fire-and-forget by design.

import { patternHaptic } from '@/lib/native';

const PATTERNS = {
  shard: null, // shards are too frequent to buzz — sound only
  nova: [0, 30, 40, 50], // double-tap punch
  eatWraith: [0, 60, 30, 40], // punchy gulp
  bonus: [0, 25, 30, 25, 30, 45], // little fanfare
  death: [0, 120, 60, 120], // heavy fall
  extraLife: [0, 40, 40, 40, 40, 80],
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
