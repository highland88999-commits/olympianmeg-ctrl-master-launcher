// lib/jupiter2/hud-layout.js — Jupiter 2 HUD geometry, pure logic.
//
// The backpack's fixed home slot (components/jupiter2/
// Jupiter2Scene.jsx — right 12, bottom 176, 56 px circle) is the
// ONE control on J2 the shared orb dock does not own, so the dock
// never knew to keep clear of it — and SUMMON and DISMOUNT were
// both found parked on top of it in Merlin's Nov 16 videos (the
// backpack circle sitting on SUMMON's lower half on foot, and on
// DISMOUNT's in the speeder). The exclusion below is that slot,
// badge + clearance included, in stage px; the scene and the page
// pass it to their orb-dock instances (components/world/
// useOrbDock.js `exclusions`), which keep every dragged orb off it,
// repair a stored spot that already covers it, and never render
// one there. Pure functions only — node tests drive this module
// directly (tests/jupiter2-layout.test.mjs).

/** The backpack's fixed home slot on the J2 stage (stage px). */
export const JUPITER2_BACKPACK_HOME = { right: 12, bottom: 176, size: 56 };
/** Clearance around the backpack home no dock orb may enter (px). */
export const JUPITER2_BACKPACK_EXCLUSION_CLEARANCE_PX = 8;
/** The count badge overhangs the circle by this much (top + right). */
export const JUPITER2_BACKPACK_BADGE_OVERHANG_PX = 4;

/** The backpack circle's own rect on a vw x vh stage. */
export function backpackHomeRect(vw, vh) {
  const { right, bottom, size } = JUPITER2_BACKPACK_HOME;
  return { x: vw - right - size, y: vh - bottom - size, w: size, h: size };
}

/**
 * The exclusion rect on a vw x vh stage: the circle + the badge
 * overhang (4 px top + right) + 8 px clearance on every side.
 * A dock orb's rect may never overlap this box.
 */
export function backpackHomeExclusionRect(vw, vh) {
  const c = JUPITER2_BACKPACK_EXCLUSION_CLEARANCE_PX;
  const b = JUPITER2_BACKPACK_BADGE_OVERHANG_PX;
  const { right, bottom, size } = JUPITER2_BACKPACK_HOME;
  return {
    x: vw - right - size - c,
    y: vh - bottom - size - b - c,
    w: size + b + c * 2,
    h: size + b + c * 2,
  };
}
