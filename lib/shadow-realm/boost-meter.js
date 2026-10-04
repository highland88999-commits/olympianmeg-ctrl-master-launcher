// lib/shadow-realm/boost-meter.js — pure presentation math for the BOOST
// charge ring around the boost button (page.jsx renders the SVG from this).
// Headless-testable: charge 0..1 -> arc geometry + percentage.

/** Radius (px) of the charge ring around the 76px BOOST button. */
export const BOOST_RING_R = 40;

/**
 * boostMeter(charge) -> { charge, pct, circumference, dashoffset }.
 * charge is clamped to [0,1]; non-finite -> 0 (a lying HUD never fills it).
 * dashoffset drives the SVG arc: full ring at 1, empty at 0.
 */
export function boostMeter(charge) {
  const c = Number.isFinite(charge) ? Math.min(1, Math.max(0, charge)) : 0;
  const circumference = 2 * Math.PI * BOOST_RING_R;
  return {
    charge: c,
    pct: Math.round(c * 100),
    circumference,
    dashoffset: circumference * (1 - c),
  };
}
