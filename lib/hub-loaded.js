// lib/hub-loaded.js
// HUB-LOADED SIGNAL — the main hub 3D scene telling the rest of the
// page it finished loading (Merlin, 2026-11-19: "Maybe don't load
// concourse until after the main hub finishes loading" — "That might
// help with the crash"; his diagnosis: "I'm pretty sure it's a
// graphics overload").
//
// The hub scene (components/HomeScene.jsx) fires this once — when its
// Canvas has rendered its first frame, or when the scene cannot start
// at all (WebGL unavailable / context lost / mount error), so the
// gate never dead-locks the menu on a device without 3D. The
// Concourse (components/Concourse.jsx, layout-level) listens and
// mounts the portal menu only after the signal on the hub; anywhere
// else the menu mounts as before (there is no hub to wait for).
//
// A window CustomEvent is the bridge because the two live in
// different trees (layout vs page) — the same pattern as
// `olympus:concourse-open` and UI_SETTINGS_EVENT. Pure helpers, no
// imports, so node tests exercise them directly.

export const HUB_LOADED_EVENT = 'olympus:hub-loaded';

// Fire the signal. Safe to call when window is absent (SSR) — no-op.
// Dispatching twice is harmless: listeners set the same true state.
export function fireHubLoaded() {
  try {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    if (typeof CustomEvent === 'undefined') return;
    window.dispatchEvent(new CustomEvent(HUB_LOADED_EVENT));
  } catch {}
}

// Should the Concourse portal menu mount yet? On the hub, only after
// the hub-loaded signal; off the hub, immediately (no hub to wait
// for). Pure, so tests pin it directly.
export function shouldMountConcoursePortals({ hubLoaded, onHub }) {
  if (!onHub) return true;
  return !!hubLoaded;
}
