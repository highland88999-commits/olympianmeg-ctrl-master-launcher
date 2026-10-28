// lib/broadcast/intercom-mute.js — the intercom duck.
//
// While the keeper speaks, every other sound quiets; when the voice ends,
// sounds return. What this covers, honestly:
//   - page media (<audio>/<video> elements) — paused, then resumed, except
//     the broadcast itself, which is passed in as the exception;
//   - hub FX (lib/fx) — silenced, then restored to whatever it was;
//   - the site radio — paused if it was playing, resumed only if it is
//     still paused when the voice ends (a user pressing play mid-voice
//     keeps their choice; the duck never overrides them).
// What it cannot cover: a world's own private audio engine that bypasses
// the hub FX bus and page media. Those keep playing — that boundary is
// stated in the UI copy, not hidden.

/** Pause every playing page-media element except `exceptEl`. Returns the paused list. */
export function collectPlayingMedia(exceptEl) {
  if (typeof document === 'undefined') return [];
  const paused = [];
  try {
    document.querySelectorAll('audio, video').forEach((el) => {
      if (el === exceptEl) return;
      try {
        if (!el.paused) {
          paused.push(el);
          el.pause();
        }
      } catch {}
    });
  } catch {}
  return paused;
}

/** Resume only the elements that are still paused (never force-play). */
export function resumeMedia(list) {
  (list || []).forEach((el) => {
    try {
      if (el.paused) {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {}
  });
}
