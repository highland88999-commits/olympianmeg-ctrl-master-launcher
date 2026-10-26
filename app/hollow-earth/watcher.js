// OLYMPIAN MONSTERVERSE — Ghorrum, the Mountain's Grin (pure data
// + behavior helpers; the zone renders him from ghorrum.glb only
// and wires gaze/blink/laugh per frame where the GLB allows).
//
// GHORRUM (Merlin's spec, mountain-watcher-spec.md; artifact id
// 42, SHA-256-identical to his direct upload monster_3d_model.glb
// — wired ONCE, never twice):
//   - blended into the mountain ranges (seat below, beside the
//     peak-shrine, inside the Mountain Reaches band, NOT on it)
//   - his gaze follows passersby (yaw toward the observer)
//   - he blinks (slow, mountain-patient blink cycle)
//   - occasional deep laughter (roughly every 25–45 s)
//   - NON-HOSTILE watcher: excluded from combat AND from the
//     hunt — he never blocks the path (no collider), never
//     attacks, never counts as a monster, never pays rewards.
import { GHORRUM_MODEL } from './models.js';

export const WATCHER = {
  name: 'Ghorrum, the Mountain’s Grin',
  artifactId: 42,
  model: GHORRUM_MODEL,
  // Mountain Reaches seat: near the peak-shrine (210, -150) but
  // offset so he reads as part of the range, not the shrine.
  pos: { x: 198, z: -132 },
  scaleM: 8,
  nonHostile: true,
  excludedFromCombat: true,
  excludedFromHunt: true,
  colliderR: 0, // never blocks the path
};

// Yaw (three.js rotation.y convention, same as faceYaw) that
// turns the watcher to face a point. Returns null when the
// observer is exactly on top of the watcher (no defined facing).
export function watcherGazeYaw(watcherPos, observerPos) {
  const dx = (observerPos?.x ?? 0) - watcherPos.x;
  const dz = (observerPos?.z ?? 0) - watcherPos.z;
  if (Math.hypot(dx, dz) < 0.001) return null;
  return Math.atan2(dx, dz);
}

// Slow blink: mostly open, a long slow close every ~6 s.
export function watcherBlinkOpen(t, seed = 0) {
  const cycle = 6.0 + ((seed * 3) % 1.0);
  const local = (t + seed * 11.3) % cycle;
  if (local < 0.3) return 1 - (local / 0.3) * 0.85;
  if (local < 0.6) return 0.15 + ((local - 0.3) / 0.3) * 0.85;
  return 1;
}

// Laugh schedule: true during a ~2.5 s laugh window, with the
// window opening every 25–45 s (seeded, deterministic per watcher).
export function watcherLaughing(t, seed = 42) {
  const period = 25 + ((seed * 13) % 20); // 25–45 s
  return (t % period) < 2.5;
}

// NOTE (2026-10-26 rework): the procedural watcher stand-in
// (buildWatcherFigure) was REMOVED — Ghorrum renders if and
// only if ghorrum.glb loads (model-loader.js). His gaze/blink
// helpers above stay: they drive the GLB figure once its head
// and eye bones are mapped (pose test still owed — the swap
// already nulled userData.head/eyes, so gaze/blink are no-ops
// on the GLB today, exactly as before this rework).
