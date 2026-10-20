// lib/swamp-run/haptics.js
// Tiny wrapper over the launcher's native haptic helper (lib/native.js ->
// patternHaptic: native Haptics in the Capacitor shell, navigator.vibrate
// on the web, silent elsewhere). Fire-and-forget by design.

import { patternHaptic } from '@/lib/native';

const PATTERNS = {
  spotted: [0, 90, 50, 90], // double thump — it SEES you
  ram: [0, 220, 60, 220], // the hit that dumps you in the water
  splash: [0, 60, 30, 40],
  beach: [0, 40, 30, 40],
  tick: [0, 18], // one per second of the swim countdown
  graceEnd: [0, 140, 60, 140], // grace is over — it hunts now
  death: [0, 320, 80, 320], // chomp
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
