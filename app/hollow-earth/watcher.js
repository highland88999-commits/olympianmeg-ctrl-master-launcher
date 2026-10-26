// OLYMPIAN MONSTERVERSE — Ghorrum, the Mountain's Grin (pure data
// + figure + behavior helpers; the three.js group is built by
// buildWatcherFigure, the zone wires gaze/blink/laugh per frame).
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

// Procedural stand-in: a rock bulk with a warty green head, a
// huge grin, and yellow eyes — the GLB swaps in over it via the
// model loader when ghorrum.glb loads; the stand-in stays if
// the load fails. userData.eyes carries the two eye meshes for
// the blink pass; userData.head carries the head group for gaze.
export function buildWatcherFigure(R) {
  const g = new R.Group();
  const M = (geo, m, x, y, z) => {
    const o = new R.Mesh(geo, new R.MeshStandardMaterial(m));
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  // Mountain bulk he blends into.
  const bulk = M(new R.SphereGeometry(3.2, 12, 10), { color: 0x5a5a60, roughness: 1 }, 0, 1.8, 0);
  bulk.scale.set(1.3, 0.9, 1.1);
  M(new R.ConeGeometry(1.6, 3.4, 6), { color: 0x6e6e78, roughness: 1 }, -2.4, 2.2, -0.8);
  M(new R.ConeGeometry(1.2, 2.6, 6), { color: 0x6e6e78, roughness: 1 }, 2.6, 1.8, -0.6);
  // Head group (gaze turns this, not the whole mountain).
  const head = new R.Group();
  head.position.set(0, 5.6, 1.6);
  g.add(head);
  const H = (geo, m, x, y, z) => {
    const o = new R.Mesh(geo, new R.MeshStandardMaterial(m));
    o.position.set(x, y, z);
    head.add(o);
    return o;
  };
  H(new R.SphereGeometry(1.5, 12, 10), { color: 0x4a7a3a, roughness: 0.9 }, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    H(new R.SphereGeometry(0.22, 6, 5), { color: 0x3a6a2e, roughness: 0.9 }, Math.cos(a) * 1.1, Math.sin(a) * 0.9 + 0.3, 0.9);
  }
  const eyeL = H(new R.SphereGeometry(0.22, 8, 6), { color: 0xffe14d, emissive: 0xcc9900, emissiveIntensity: 1.2 }, -0.55, 0.35, 1.35);
  const eyeR = H(new R.SphereGeometry(0.22, 8, 6), { color: 0xffe14d, emissive: 0xcc9900, emissiveIntensity: 1.2 }, 0.55, 0.35, 1.35);
  // The grin: a wide dark arc suggested by a flattened torus.
  const grin = H(new R.TorusGeometry(0.85, 0.09, 6, 16, Math.PI), { color: 0x1c2a18, roughness: 0.9 }, 0, -0.35, 1.3);
  grin.rotation.z = Math.PI;
  g.userData.watcher = true;
  g.userData.head = head;
  g.userData.eyes = [eyeL, eyeR];
  g.userData.modelPath = GHORRUM_MODEL.url;
  return g;
}
