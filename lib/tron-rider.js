// lib/tron-rider.js — Shared rider logic for the TRON bike garage.
//
// Pure JavaScript (no JSX, no Three.js imports) so the headless test suite
// can import it directly. TronRider.jsx does the 3D rendering; this module
// carries the fit constants and tag-text rule the tests pin down.
//
// RIDER_FIT: per-bike rider placement. The three bikes have different
// canopies and frame heights, so the same procedural rider needs a small
// scale + offset per bike to sit on the seat behind the canopy instead of
// floating above it or clipping through the glass.
//   scale — overall rider size multiplier
//   dy    — vertical lift of the rider group
//   dz    — forward/back shift of the rider group (nose is +Z)

export const RIDER_FIT = {
  wisp:  { scale: 1.0,  dy: 0.0,  dz: 0.0 },
  comet: { scale: 1.06, dy: 0.03, dz: 0.02 },
  atlas: { scale: 1.18, dy: 0.16, dz: -0.14 },
};

export function riderFitFor(bikeKey) {
  return RIDER_FIT[bikeKey] || RIDER_FIT.wisp;
}

// riderTagText(profile) -> string.
// The floating name tag above the rider's helmet: the rider's display name
// wins, then the callsign, then nothing (no tag at all — never a placeholder
// like "Unknown rider", which would read as a fake identity).
export function riderTagText(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const name = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
  if (name) return name;
  const callsign = typeof profile.callsign === 'string' ? profile.callsign.trim() : '';
  return callsign;
}

// DEFAULT_RIDER_THEME: the tasteful fallback when /profile has no character
// yet — teal suit, dark helmet, cyan neon trim. A real profile's
// suit/helmet/glow colors (lib/profile riderTheme) always win.
export const DEFAULT_RIDER_THEME = {
  suit: '#0e7490',
  helmet: '#1f2937',
  glow: '#22d3ee',
};
