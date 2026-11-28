// lib/portal-video-preload.js
// Warm a portal video BEFORE its suck-in overlay mounts (hub-video
// fixes, Nov 27, 2026 — fix 4: the Phone tile's black flash).
//
// Tapping a tile opens PortalSuckOverlay, which mounts a FRESH
// <video> for that tile's file — the grid face only preloads
// metadata (its first frame), so the overlay's element fetches +
// decodes from cold and the fullscreen overlay (bg-black) sits
// black for ~2 s (Merlin's Nov 27 video, f040–f041). Warming the file
// while the menu is open puts it in the browser's media cache with
// its first frame decoded, so the overlay's video starts from cache
// instead of cold.
//
// The Phone tile's video is phone.mp4 — the tile's key is 'phone'
// (lib/concourse-actions.js), and both its grid face and its suck-in
// play /videos/portals/phone.mp4 (14.2 MB, 10 s, faststart). The
// similarly named cloud-phone.mp4 is a DIFFERENT program (the
// "Cloud Phone" portal, a HEPHAESTUS satellite) and warming it does
// nothing for this tile — the first version of this fix warmed the
// wrong file (found by the headless probe, Nov 27: the suck-in
// element's src is phone.mp4).
//
// Only the Phone video is warmed here: preloading all 14 tile
// videos would be ~90 MB of speculative fetch. The caller keeps
// the returned element referenced while the menu is open —
// dropping the reference lets the browser drop the buffer.
//
// Pure except for the document it is handed, so node tests drive
// it with a stub document (tests/hub-video-fixes.test.mjs).

/** The Phone tile's suck-in video. */
export const PHONE_VIDEO = '/videos/portals/phone.mp4';

/**
 * Start loading `src` through a detached <video> with
 * preload="auto" and return the element (null when the document
 * cannot make one). The caller holds the reference until the
 * video is no longer needed.
 */
export function warmPortalVideo(doc, src) {
  if (!doc || typeof doc.createElement !== 'function' || !src) return null;
  try {
    const el = doc.createElement('video');
    el.preload = 'auto';
    el.src = src;
    if (typeof el.load === 'function') el.load();
    return el;
  } catch {
    return null;
  }
}
