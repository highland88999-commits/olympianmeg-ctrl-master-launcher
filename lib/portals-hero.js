// lib/portals-hero.js
// THE PORTALS HERO VIDEO — the big box at the top of the Portals
// menu (Merlin, Nov 27, 2026 — hub-video-fixes round). The hero is
// his Marvel/Olympus fan edit (Deadpool, Ant-Man, Iron Man, Winter
// Soldier, Wolverine composited over Olympus scenes), kept as a
// web copy at PORTALS_HERO_VIDEO — h264 720x1280 with the AAC
// audio track kept, transcoded from his HEVC original (desktop
// Chrome/Firefox do not reliably play HEVC).
//
// EXACT BEHAVIOUR (the component in components/ConcoursePortals.jsx
// drives this state machine):
//   (1) it starts with the Ω LOGO showing — the video itself has
//       NO gold-Ω frame (1 fps scan of the whole video + 10 fps
//       scan of the first 2 s: Deadpool over Olympus, fading in
//       from black), so the logo-first state is the box's own Ω
//       over the paused first frame;
//   (2) after 1 SECOND it AUTOPLAYS (PORTALS_HERO_AUTOPLAY_DELAY_MS);
//   (3) it plays UNMUTED (with sound);
//   (4) tapping the video MUTES it; tapping again unmutes;
//   (5) when the Portals menu is minimized/closed, the panel flips
//       to the Concourse tiles, or the tab hides, the video PAUSES
//       and resets to the logo;
//   (6) opening again does THE SAME THING: logo first, then
//       autoplay after 1 second.
// The video LOOPS (a menu hero, like the old wrap strip).
//
// BROWSER-POLICY NOTE: unmuted autoplay is restricted on phones —
// a play() with sound generally needs a user gesture. The Portals
// menu opens from a tap, which IS a gesture; the attempt runs 1 s
// after that open. If the browser rejects the unmuted play,
// attemptUnmutedPlay reports the rejection and the video does NOT
// silently fall back to muted — it stays paused on the logo frame
// and waits for a tap, which IS a gesture, so tap-to-play starts
// it with sound.
//
// Pure — no DOM, no imports — so node tests exercise it directly
// (tests/hub-video-fixes.test.mjs).

/** The h264 web copy of the hero video (AAC audio kept). */
export const PORTALS_HERO_VIDEO = '/videos/portals/portals-hero.mp4';

/** Logo-first hold before the autoplay attempt (ms). */
export const PORTALS_HERO_AUTOPLAY_DELAY_MS = 1000;

/**
 * Fresh hero state: logo showing, unmuted, nothing blocked.
 * Phases: 'logo' (Ω showing, video paused at the first frame) |
 * 'playing' (video running) | 'blocked' (the browser refused the
 * unmuted play — logo showing, waiting for a tap).
 */
export function createPortalsHeroState() {
  return { phase: 'logo', muted: false, playBlocked: false };
}

/**
 * The hero state machine. Events:
 *   'activate' — the Portals panel became visible (menu opened,
 *     panel flipped back, tab visible again): logo first, unmuted.
 *   'deactivate' — minimized / closed / panel flipped away / tab
 *     hidden: pause + reset to the logo (reopen replays from (1)).
 *   'play-confirmed' — the unmuted play() resolved: playing.
 *   'play-rejected' — the browser refused the unmuted play: stay
 *     on the logo frame, blocked, waiting for a tap. The muted
 *     flag is left alone — never a silent muted fallback.
 *   'toggle-mute' — tap: flip muted (while playing, or while the
 *     logo is showing, where it sets what the scheduled autoplay
 *     will use).
 */
export function portalsHeroNext(state, event) {
  const s = state || createPortalsHeroState();
  switch (event) {
    case 'activate':
    case 'deactivate':
      return createPortalsHeroState();
    case 'play-confirmed':
      return { ...s, phase: 'playing', playBlocked: false };
    case 'play-rejected':
      return { ...s, phase: 'blocked', playBlocked: true };
    case 'toggle-mute':
      return { ...s, muted: !s.muted };
    default:
      return s;
  }
}

/**
 * Attempt the hero play with the given muted flag (default false —
 * the attempt plays WITH sound). Returns { ok, name }: ok is true
 * when play() resolved; on rejection name is the DOMException
 * name ('NotAllowedError' when the browser wants a gesture) and
 * the video is left paused — the caller keeps the logo showing
 * and waits for a tap. NEVER falls back to muted autoplay.
 */
export async function attemptUnmutedPlay(video, { muted = false } = {}) {
  if (!video || typeof video.play !== 'function') return { ok: false, name: 'NoVideo' };
  try {
    video.muted = muted;
    await video.play();
    return { ok: true, name: null };
  } catch (err) {
    return { ok: false, name: (err && err.name) || 'Error' };
  }
}
