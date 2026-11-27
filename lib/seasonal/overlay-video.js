// lib/seasonal/overlay-video.js
//
// Date routing for the fullscreen holiday greeting overlays.
//
// LESSON OF NOV 27, 2026 (the Thanksgiving bug): the overlays used to run
// on fixed absolute-UTC windows ("Thanksgiving Day across all timezones" =
// Nov 25 10:00Z -> Nov 27 12:00Z). That window is still open at 07:31 UTC
// on Nov 27, so anyone loading the site on the morning of Nov 27 — already
// Christmas season locally, tree already live — still got the Thanksgiving
// video first. A UTC window can never end exactly on a local date for
// every viewer: Nov 26 alone spans 48 hours of UTC. So the overlays are
// now routed on the VIEWER'S LOCAL calendar date. A date is a date: Nov 26
// is Thanksgiving, Nov 27 is Christmas, and the two can never overlap.
//
// Christmas season videos (Merlin, Nov 27, 2026):
//   Nov 27 - Dec 24, 2026 : 2026-early.mp4 (60 s, vertical)
//   Dec 25, 2026 - Jan 6, 2027 : 2026-day.mp4 (1:04, landscape)
// The season ends with Twelfth Night (Jan 6); the tree is gone Jan 8.
// Pure functions — safe for tests. Pass a Date (defaults to now).

export const CHRISTMAS_EARLY_VIDEO = '/videos/holidays/christmas/2026-early.mp4';
export const CHRISTMAS_DAY_VIDEO = '/videos/holidays/christmas/2026-day.mp4';

// Local calendar day as a single comparable number: 20261127.
function dayNum(date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** True only when the viewer's local date is Thanksgiving Day, Nov 26, 2026. */
export function thanksgivingOverlayActive(date = new Date()) {
  return dayNum(date) === 20261126;
}

/**
 * The Christmas-season video for the viewer's local date, or null when no
 * seasonal video should play. Nov 27-Dec 24 -> the early video; Dec 25
 * through Jan 6 -> the Christmas Day video.
 */
export function seasonalOverlayVideo(date = new Date()) {
  const d = dayNum(date);
  if (d >= 20261127 && d <= 20261224) return CHRISTMAS_EARLY_VIDEO;
  if (d >= 20261225 && d <= 20270106) return CHRISTMAS_DAY_VIDEO;
  return null;
}
