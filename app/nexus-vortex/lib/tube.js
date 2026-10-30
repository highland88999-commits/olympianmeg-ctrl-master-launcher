// app/nexus-vortex/lib/tube.js — pure vortex-tube ride math
// (Merlin, 2026-10-29). The tube spins around the rider; the rider
// does not spin; the camera auto-fixes forward down the tube.

export const VORTEX_RIDE_MS = 8000;
export const TUBE_SPIN_RAD_PER_SEC = 1.4;
export const TUBE_LENGTH = 120;
export const TUBE_RADIUS = 4;

// Tube rotation at a moment in the ride — steady, forward only.
export function tubeSpinAngle(elapsedMs, radPerSec = TUBE_SPIN_RAD_PER_SEC) {
  return (elapsedMs / 1000) * radPerSec;
}

// Camera depth down the tube for a ride progress 0..1 — the rider
// travels forward and stays inside the tube at the end.
export function tubeCameraZ(progress, tubeLength = TUBE_LENGTH) {
  return 8 - progress * (tubeLength - 30);
}
