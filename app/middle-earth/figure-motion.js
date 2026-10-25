// app/middle-earth/figure-motion.js — PURE procedural motion math for
// Middle-earth figures. No DOM, no three.js: safe to import in node
// for headless testing and in the page/zone render loops.
//
// WHY THIS EXISTS (round 2, 2026-10-25): neither the heroes nor the
// orcs are rigged. The heroes are staged UNRIGGED GLB models (the
// wizard's staff is baked into his model), and the orcs are procedural
// brutes built from boxes (their rigged GLB twins have not landed).
// There is no skeleton to pose — so all motion is whole-figure or
// pivot-group math, computed here and applied by the render loops.
// Nothing here changes damage, speed, health, spawn rules, or hunt
// behaviour: it only moves what the player sees.

/** Rest angle of an orc arm pivot (radians, x-axis) — the old static lean. */
export const ORC_ARM_REST = -0.35;
/** Orc attack wind-up length, seconds — the warning before a hit lands. */
export const ORC_WINDUP_S = 0.35;

/**
 * Orc limb angles for one frame. All angles are pivot rotations about
 * the x-axis (positive = swings forward).
 *   moveSpeed: metres/second the orc is actually travelling (0 = standing)
 *   phase: walk-cycle phase in radians, advanced by the caller with speed
 *   windupP: 0..1 attack wind-up progress (0 = not winding up)
 *   swingP: 0..1 strike sweep envelope (0 = not swinging; 1 = mid-sweep)
 *   idleT: seconds, for the standing micro-sway
 * Returns { legL, legR, armBlade, armFree } — armBlade is the crude-blade
 * arm (the figure's side -1, where the blade mesh lives).
 */
export function orcLimbAngles({ moveSpeed = 0, phase = 0, windupP = 0, swingP = 0, idleT = 0 } = {}) {
  const moving = moveSpeed > 0.05;
  const amp = moving ? Math.min(0.55, 0.15 + moveSpeed * 0.1) : 0;
  const s = Math.sin(phase);
  let legL = s * amp;
  let legR = -s * amp;
  let armBlade = ORC_ARM_REST - s * amp * 0.6;
  let armFree = ORC_ARM_REST + s * amp * 0.6;
  if (!moving) {
    // Standing: a faint sway so the brute never reads as a statue.
    const sway = Math.sin(idleT * 1.3) * 0.05;
    armBlade = ORC_ARM_REST + sway;
    armFree = ORC_ARM_REST - sway;
    legL = 0;
    legR = 0;
  }
  if (windupP > 0) {
    // Wind-up: the blade arm rises back over the shoulder so the hit
    // can be SEEN coming; the legs plant.
    const w = Math.min(1, Math.max(0, windupP));
    armBlade = ORC_ARM_REST - w * 1.75;
    armFree = ORC_ARM_REST + w * 0.3;
    legL = 0;
    legR = 0;
  }
  if (swingP > 0) {
    // Sweep: the blade arm drives forward past rest, then settles.
    const p = Math.min(1, Math.max(0, swingP));
    armBlade = ORC_ARM_REST + p * 1.1;
  }
  return { legL, legR, armBlade, armFree };
}

/**
 * Hero whole-figure motion for one frame. The hero is an unrigged GLB,
 * so legs and arms cannot move separately — the body group bobs, leans,
 * rolls, and twists instead. Applied ON TOP of the figure's own
 * breathing (buildFigure.update owns position.y and rotation.y
 * absolutely, so the caller adds these values after calling update).
 *   speed: metres/second the hero is actually travelling
 *   phase: walk-cycle phase in radians, advanced by the caller with speed
 *   swingP: 0..1 strike envelope (0 = not striking; 1 = mid-strike)
 *   kind: 'melee' | 'ranged' — a blade/staff-blow twists through, a
 *     staff blast/blast raises back before the shot leaves
 * Returns { bobY, leanX, twistY, rollZ } — added to the body group.
 */
export function heroMotionPose({ speed = 0, phase = 0, swingP = 0, kind = 'melee' } = {}) {
  const moving = speed > 0.5;
  let bobY = 0;
  let leanX = 0;
  let twistY = 0;
  let rollZ = 0;
  if (moving) {
    bobY = Math.sin(phase * 2) * 0.045;
    leanX = -0.06; // a slight forward lean at stride
    rollZ = Math.sin(phase) * 0.05;
  }
  if (swingP > 0) {
    const p = Math.min(1, Math.max(0, swingP));
    if (kind === 'ranged') {
      // Staff/blast raise: lean back as the shot leaves the tip.
      leanX += 0.2 * p;
      twistY += 0.15 * p;
      bobY += 0.03 * p;
    } else {
      // Melee swing: twist through the blow, lean into it.
      twistY += 0.55 * p;
      leanX += -0.35 * p;
    }
  }
  return { bobY, leanX, twistY, rollZ };
}

/** Mission card law: full card on entry, then it tucks to one line. */
export const MISSION_TUCK_AFTER_S = 6;
/** After the player re-opens the tucked card, it re-tucks this long after. */
export const MISSION_RETUCK_AFTER_S = 8;

/**
 * Should the mission card be tucked right now? Pure function of the
 * mission clock (the one clock proven to advance in real play):
 *   elapsed: mission seconds on the HUD clock
 *   expandedAt: mission seconds when the player last tapped the tucked
 *     chip open, or -MISSION_RETUCK_AFTER_S when never expanded
 * The card tucks once the clock passes the tuck time, and stays open
 * for the re-tuck window after a manual expand.
 */
export function shouldTuckMissionCard(elapsed, expandedAt) {
  const exp = expandedAt == null ? -MISSION_RETUCK_AFTER_S : expandedAt;
  return elapsed >= MISSION_TUCK_AFTER_S && elapsed >= exp + MISSION_RETUCK_AFTER_S;
}
