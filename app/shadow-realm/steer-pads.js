// app/shadow-realm/steer-pads.js — fallback steer-pad logic.
//
// Tilt is the steering. The pads rendered by page.jsx exist ONLY as an
// honest fallback for when tilt is not driving (e.g. iOS motion permission
// denied, or a device with no gyroscope): with no tilt and no pads, the
// bike cannot turn at all. Merlin's "steering arrows removed" preference
// stands — tilt riders never see these pads; they appear only while tilt
// is off and vanish the moment tilt starts driving.
//
// Everything here is pure and headless-testable; page.jsx owns the DOM.

export const STEER_LEFT = -1;
export const STEER_RIGHT = 1;

// Visibility rule: ride stage AND the tilt listener is not actively driving.
// motionOn is the useBikeMotion() flag — true only while deviceorientation
// events are flowing and writing the steering channel.
export function shouldShowTouchSteer(stage, motionOn) {
  return stage === 'ride' && !motionOn;
}

// held: array of directions in press order, most-recently-pressed last.
// Multi-touch: pressing an already-held pad is a no-op (no duplicates).
export function pressPad(held, dir) {
  if (!Array.isArray(held)) held = [];
  if (dir !== STEER_LEFT && dir !== STEER_RIGHT) return held.slice();
  if (held.includes(dir)) return held.slice();
  return [...held, dir];
}

// Release: remove the direction wherever it sits; order of the rest is kept.
export function releasePad(held, dir) {
  if (!Array.isArray(held)) return [];
  return held.filter((d) => d !== dir);
}

// Steering value: most-recently-pressed held direction wins; 0 when empty
// (bike stops turning — never a stale direction).
export function padSteer(held) {
  if (!Array.isArray(held) || held.length === 0) return 0;
  return held[held.length - 1];
}
