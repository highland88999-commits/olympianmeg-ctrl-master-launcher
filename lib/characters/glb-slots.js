// lib/characters/glb-slots.js
//
// The presence cap for live character GLBs (characters-everywhere
// plan §3/§5): one streamed model is ~0.94 MB plus a skinned mesh on
// a phone GPU. Single-character surfaces are Kombat-proven, but a
// presence scene (a hall of 20 users) must NOT mean 20 live models.
// A slot registry meters how many embodiments in a scene may be
// live GLBs; everyone beyond the cap renders as a preview billboard
// (components/characters/CharacterGlb.jsx) — visible, named, honest,
// and cheap.
//
// Pure bookkeeping — no three.js, no DOM — so the cap logic is
// headless-testable. A registry is per scene: presence surfaces
// create one for their scene and hand it to every attach; simple
// one-character surfaces use the shared default registry.

/** Default live-GLB cap per scene. */
export const DEFAULT_MAX_LIVE_GLB = 4;

function normalizeCap(maxLiveGlb) {
  return Number.isInteger(maxLiveGlb) && maxLiveGlb >= 0
    ? maxLiveGlb
    : DEFAULT_MAX_LIVE_GLB;
}

/**
 * Create a slot registry.
 * @param maxLiveGlb  cap for this scene (default 4; 0 = billboards
 *   only). Slots are keyed by an opaque caller-chosen key (usually
 *   the characterId or a per-instance id); acquiring the same key
 *   twice is idempotent and never double-counts.
 */
export function createGlbSlotRegistry(maxLiveGlb) {
  const cap = normalizeCap(maxLiveGlb);
  const held = new Set();
  return {
    maxLive: cap,
    /** Try to claim a live-GLB slot. True = render the real model. */
    acquire(key) {
      if (typeof key !== 'string' || key.length === 0) return false;
      if (held.has(key)) return true;
      if (held.size >= cap) return false;
      held.add(key);
      return true;
    },
    /** Give a slot back (dispose). Unknown keys are a no-op. */
    release(key) {
      held.delete(key);
    },
    has(key) {
      return held.has(key);
    },
    liveCount() {
      return held.size;
    },
    /** Snapshot of held keys (diagnostics/tests). */
    keys() {
      return [...held];
    },
  };
}

/** Shared registry for simple surfaces that don't manage their own. */
export const sharedGlbSlots = createGlbSlotRegistry(DEFAULT_MAX_LIVE_GLB);
