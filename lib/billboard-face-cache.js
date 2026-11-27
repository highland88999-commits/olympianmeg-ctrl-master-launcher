// lib/billboard-face-cache.js — Shared canvas-face texture cache for the
// hub god-tower billboards (Merlin, Nov 26, 2026 — hub crash return path).
//
// WHY: every tower panel used to paint its OWN 1264x700 canvas face
// (usePanelFaceTexture in components/GodTower.jsx): 249 canvases,
// 881.3 MB CPU backing + ~1,175 MB GPU with mipmaps = ~2,056 MB worst
// case, past the ~1.5 GB iPhone soft limit — the hub kill. Measured by
// executing the real modules (lib/tower-panels.js + lib/billboards/
// overrides.js + public/billboards/manifest.json) over all 288 faces:
// only 6 distinct paints exist, so 249 canvases collapse to 6 shared
// textures: 21.24 MB CPU + 28.31 MB GPU = 49.55 MB total.
//
// WHAT DIFFERS from one face's paint to another (read off
// paintBillboardFace in lib/billboard-face.js, the only painter):
//   - kind (the honest label: PARTNER / MERLIN'S / VIDEO · 19+ / AD SPACE)
//   - name, uppercased on the face
//   - tagline
//   - accent (the bottom bar)
//   - whether a trackingUrl exists (CTA reads "TAP TO VISIT →" vs
//     "YOUR BRAND COULD BE HERE" — the URL itself is never painted)
//   - slot.key.length (the starfield seed is key.length * 7919 — two
//     faces with the same paint but different-length keys get different
//     dust; ad-1..ad-9 vs ad-10..ad-44 split the house paint in two)
//   - OR the image creative URL (an image creative paints cover-fit
//     instead of the branded face)
// Board number, god name, level, and the tracking URL itself are NEVER
// painted, so they are NOT in the key: ad-1 and ad-2 house faces share
// one texture, as do all 42 middle-level house faces with 4-char keys.
//
// LIFECYCLE: refcounted. A panel acquires its paint's texture on mount
// (or slot change) and releases it on cleanup. The texture is disposed
// only when the last panel using it releases — never while another
// panel still shows it. The old code disposed its per-panel texture on
// every cleanup; with sharing that would blank every other panel
// showing the same paint.
//
// iOS CANVAS EXHAUSTION: when getContext('2d') returns null under
// memory pressure the factory returns null — and a null texture is
// NOT cached, so the next panel retries a fresh canvas instead of
// inheriting the failure. A null return means "no face texture" and
// the caller falls back to the flat face color, exactly as before.
//
// Headless: no document, no THREE here — the caller supplies the
// texture factory (makeTexture) per acquire, so node tests exercise
// the key and the refcounting directly.

/**
 * The cache key for a slot's painted face: a JSON string over exactly
 * the fields paintBillboardFace reads (plus the image-creative URL
 * when the slot paints an image instead). Two slots share a texture
 * if and only if they paint identically. Returns null for a missing
 * or non-object slot.
 */
export function billboardFaceCacheKey(slot) {
  if (!slot || typeof slot !== 'object') return null;
  const creative = slot.creatives && slot.creatives[0];
  if (creative && creative.imageUrl) {
    return JSON.stringify(['image', creative.imageUrl]);
  }
  return JSON.stringify([
    'paint',
    slot.kind || '',
    typeof slot.name === 'string' ? slot.name.toUpperCase() : '',
    slot.tagline || '',
    slot.accent || '#ffd700',
    slot.trackingUrl ? 1 : 0,
    typeof slot.key === 'string' ? slot.key.length : 0,
  ]);
}

/**
 * A refcounted cache of face textures, keyed by billboardFaceCacheKey.
 * makeTexture is the caller's factory (it paints the canvas and wraps
 * it in a texture); it is called once per distinct key, on first
 * acquire. A factory returning null (iOS canvas exhaustion) is not
 * cached — every acquire retries.
 *
 * acquire(key, makeTexture) -> the shared texture (or null); the
 * caller must release(key) exactly once per successful (non-null)
 * acquire, on unmount or slot change. release(key) -> true when the
 * last holder released and the texture was disposed.
 */
export function createFaceTextureCache() {
  const entries = new Map();
  return {
    size() {
      return entries.size;
    },
    refs(key) {
      const entry = entries.get(key);
      return entry ? entry.refs : 0;
    },
    has(key) {
      return entries.has(key);
    },
    acquire(key, makeTexture) {
      if (typeof key !== 'string' || typeof makeTexture !== 'function') return null;
      const existing = entries.get(key);
      if (existing) {
        existing.refs += 1;
        return existing.texture;
      }
      const texture = makeTexture();
      if (!texture) return null;
      entries.set(key, { texture, refs: 1 });
      return texture;
    },
    release(key) {
      const entry = entries.get(key);
      if (!entry) return false;
      entry.refs -= 1;
      if (entry.refs > 0) return false;
      entries.delete(key);
      if (entry.texture && typeof entry.texture.dispose === 'function') {
        entry.texture.dispose();
      }
      return true;
    },
  };
}
