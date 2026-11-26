// lib/hub-baseball/scoring.js
// The score rule for Hub Baseball — ISOLATED and swappable on purpose.
// Score = max straight-line distance from the plate reached during the
// flight, in whole metres. (Home-run reading of "distance flown": it
// prevents circle-farming. If Merlin corrects the rule, only this
// module changes — flight.js hands it maxDistanceM and nothing else.)

export const SERVER_DISTANCE_CAP = 100000;

/**
 * Score a finished flight: the furthest the ball ever got from the
 * plate, rounded to whole metres. Non-finite / negative input scores 0.
 */
export function scoreFlight({ maxDistanceM } = {}) {
  const m = Number(maxDistanceM);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.round(m);
}

/** "1,234 m" — whole metres, comma-grouped, en-US. */
export function formatDistance(m) {
  const n = Math.round(Number(m) || 0);
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} m`;
}
