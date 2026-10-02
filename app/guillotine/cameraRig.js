// cameraRig.js — pure camera-control tuning for the Guillotine module.
// No three.js, no DOM: fully unit-testable in Node. scene.js applies these
// values to its OrbitControls.
//
// Eased up from the original (which had pan disabled, minDistance 1 and
// maxDistance 1500): the visitor can now pan, pull back further, and never
// loses the machine — the target is clamped to a box around the scene so a
// wild swipe can't strand the camera in empty fog. minDistance 180 keeps the
// camera out of the machine's own geometry (solid-geometry rule); damping
// 0.08 is softer than the original 0.05 while staying stable on iPhone.
export const CAMERA_LIMITS = Object.freeze({
  dampingFactor: 0.08,
  enablePan: true,
  panSpeed: 0.7,
  screenSpacePanning: false,
  minDistance: 180,
  maxDistance: 2200,
  minPolarAngle: 0.1,
  // Slightly below the horizon so the visitor can look up at the machine a
  // little, but never under the floor.
  maxPolarAngle: Math.PI / 2 + 0.03,
  targetClamp: Object.freeze({
    minX: -450, maxX: 450,
    minY: 120, maxY: 650,
    minZ: -450, maxZ: 450,
  }),
});

/**
 * Clamp an orbit target back into the allowed box. Returns a fresh
 * {x, y, z} object; never mutates the input. scene.js copies the result
 * onto controls.target each frame after controls.update().
 */
export function clampTarget(target, box = CAMERA_LIMITS.targetClamp) {
  const x = Math.min(box.maxX, Math.max(box.minX, target.x));
  const y = Math.min(box.maxY, Math.max(box.minY, target.y));
  const z = Math.min(box.maxZ, Math.max(box.minZ, target.z));
  return { x, y, z };
}
