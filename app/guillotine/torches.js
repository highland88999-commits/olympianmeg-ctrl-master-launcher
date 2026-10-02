// torches.js — pure torch tuning + flicker math for the Guillotine module.
// No three.js, no DOM: fully unit-testable in Node. The scene consumes
// these values when it builds the torch stands.

// 3 torches — the scene has no wall meshes, so these are free-standing
// braziers on the floor around the machine: two flanking the deck, one
// behind it. [x, z] pairs; the stand rises from the floor (y = 0).
export const TORCH_POSITIONS = [
  [-330, 200],
  [330, 200],
  [0, -380],
];

// Base intensity (physical units, matching the scene's other point lights:
// the blade glow is 300 and the core lights are 400 — torches stay dimmer
// so they warm the scene without drowning out texture wraps).
export const TORCH_BASE_INTENSITY = 220;
// Flicker stays within +/-28% of base — visible flame movement, never a flash.
export const TORCH_FLICKER_RANGE = 0.28;

/**
 * Flicker curve: sum of three incommensurate sines with a per-torch phase
 * seed. Returns an intensity multiplier in [0.72, 1.28] with mean ~1.
 * Cheap (3 sin calls) and deterministic for a given (seed, t) — the scene
 * just multiplies TORCH_BASE_INTENSITY by this each frame.
 */
export function torchFlicker(seed, t) {
  const a = Math.sin(t * 11.3 + seed * 1.7);
  const b = Math.sin(t * 23.7 + seed * 3.1);
  const c = Math.sin(t * 5.9 + seed * 0.6);
  return 1 + 0.14 * a + 0.09 * b + 0.05 * c;
}
