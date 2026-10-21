// lib/characters/tame-materials.js — the Tripo black-model fix.
//
// Tripo GLBs ship NO metallic/roughness factors, so glTF's
// defaults load them as metalness 1 / roughness 1 — and a metal
// with no environment map to reflect renders PITCH BLACK under
// plain lights. That one authoring gap blacked out the whole
// Earth street layer (the "T-Rex" massif, the trees, the rocks)
// AND the traveler's own character — whose hands then hung in
// the sky as black claws (Merlin, 2026-10-20).
//
// These are textured diffuse models: tame them back to the world
// kit's law (lib/worlds/environment.js) — metalness low,
// roughness high, texture does the talking. Idempotent and safe
// to re-apply: only materials still carrying the metal default
// are touched, so a surface may call it per frame until a late-
// loading model appears, and authored metals (a hub statue's
// deliberate metalness under an env map) are a caller's choice —
// only call this on Tripo-sourced subtrees.

/** Tame every over-metal Tripo material under a root object. */
export function tameTripoMaterials(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m.isMeshStandardMaterial && m.metalness > 0.5) {
        m.metalness = 0;
        m.roughness = Math.min(m.roughness, 0.92);
        m.needsUpdate = true;
      }
    }
  });
}
