// app/middle-earth/goal-compass.js — mission-goal direction arrow.
//
// Pure math, no DOM: safe to import in node for headless testing.
// A travel mission's goal (next checkpoint, else the target) sits up
// to ~320 m away with no marker on screen — the player cannot find
// it. The HUD arrow closes that gap: it points at the goal relative
// to where the walker faces, so a first-time player can walk toward
// it without guessing.
//
// Angle frame: the walker's forward vector is (-sin yaw, -cos yaw),
// so facing north is yaw 0, and a goal's compass bearing in the same
// frame is atan2(dx, -dz). The arrow rotation is bearing + yaw,
// normalised to -180..180: 0 means dead ahead, +90 means hard right,
// 180 (or -180) means directly behind. The page renders an up-arrow
// rotated by this many degrees clockwise (CSS rotate).

/**
 * Degrees to rotate an up-arrow so it points at a goal.
 * dx/dz: goal minus walker position; yaw: the walker's yaw in radians.
 */
export function goalArrowDeg(dx, dz, yaw) {
  const bearing = Math.atan2(dx, -dz);
  let rel = bearing + yaw;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  return (rel * 180) / Math.PI;
}
