// Streetball — court dimensions & tuning constants (meters, plain numbers).
// Court runs along the Z axis. Rims at z = +/- RIM_Z.

export const COURT_W = 15; // x extent
export const COURT_L = 28; // z extent

export const RIM_Y = 3.05;
export const RIM_R = 0.2286; // rim ring radius
export const RIM_TUBE = 0.02; // rim metal thickness
export const RIM_Z = 12.65; // rim centers at z = -RIM_Z and +RIM_Z

export const BOARD_Z = 13.25; // backboard face plane |z|
export const BOARD_W = 1.8;
export const BOARD_BOTTOM = 2.95;
export const BOARD_TOP = 4.0;

export const BALL_R = 0.12;
export const GRAVITY = 9.82;

export const BALL_START_H = 1.7; // held ball height above floor

// Shooting spots for attacking the rim at z = -RIM_Z (end 0).
// End 1 mirrors these (z -> -z) to attack the rim at z = +RIM_Z.
export const SPOTS_END0 = [
  { x: -5.2, z: -4.6, label: 'Left corner' },
  { x: -3.0, z: -5.9, label: 'Left wing' },
  { x: 0.0, z: -6.3, label: 'Top' },
  { x: 3.0, z: -5.9, label: 'Right wing' },
  { x: 5.2, z: -4.6, label: 'Right corner' },
];

export function spotsForEnd(end) {
  if (end === 0) return SPOTS_END0;
  return SPOTS_END0.map((s) => ({ x: s.x, z: -s.z, label: s.label }));
}

export function rimForEnd(end) {
  // The rim the player is attacking.
  return { x: 0, y: RIM_Y, z: end === 0 ? -RIM_Z : RIM_Z };
}

// Shot tuning
export const SHOT = {
  minSpeed: 6.5,
  maxSpeed: 15.5,
  minElevDeg: 40,
  maxElevDeg: 66,
  defaultElevDeg: 52,
  maxAzimOffset: 0.38, // radians of left/right steer
  powerPerPx: 0.0026, // drag-down pixels -> power 0..1
  azimPerPx: 0.0016, // horizontal pixels -> radians
};

export const GAME = {
  shootoutSeconds: 60,
  basePoints: 2,
  maxStreakBonus: 3, // +1 per consecutive make beyond the first, capped
  swishBonus: 1,
  buzzerSlowMo: 0.3,
  maxFlightSeconds: 8,
};
