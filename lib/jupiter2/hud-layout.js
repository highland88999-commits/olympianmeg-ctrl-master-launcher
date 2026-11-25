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

// ── The full dock exclusion set (Merlin, Nov 24 — J2 riding
// overlap fix) ─────────────────────────────────────────────────
// Nov 16 the dock learned ONE exclusion: the backpack's home slot,
// because SUMMON and DISMOUNT had both been found parked on it.
// Nov 24 Merlin found the next one: while riding, DISMOUNT was
// overlapped by another button. The mounted defaults are clean by
// construction (probe-j2-riding-overlap.mjs: fresh riding at 390 px
// and 320 px, zero overlaps) — the overlap is a STORED spot. Any
// dragged dock orb (TRADE, SHOOT, BOOST, JUMP — each reproduced
// parked on DISMOUNT's home, 56–64 px of overlap) could sit on
// DISMOUNT forever, because nothing told the dock DISMOUNT's slot
// was taken. So the exclusion set is now EVERY control's slot on
// the stage, in BOTH modes (a stored spot survives a mount/dismount,
// so the walking homes count while riding and vice versa):
// the fixed controls (joystick, HP orb, ORBS tally, FULLSCREEN/EXIT
// orb, the ARMED lever orb in both modes) and every dock orb's CSS
// home slot in both modes. The dock's threefold enforcement (render
// fallback, prune, live-drag slide) then makes any overlap
// impossible: a stored spot covering a control is repaired back to
// its home, and a drag slides along the edge instead of parking.
//
// `owner` on a home-slot rect is the orb that OWNS that slot: the
// dock never applies the rect to its owner (lib/world/orb-dock.js
// `exclusionAppliesTo`), so an orb can always be dragged back onto
// its own home. Only the homes that overlap NO other control's slot
// carry an owner. The two shared slots carry none, on purpose:
// DISMOUNT's home (left 12, top 76) IS TRADE's walking home, and
// TRADE's riding home (left 12, top 148) overlaps the ARMED orb's
// walking slot (left 12, top 140) — so a stored spot on either slot
// is pruned and the orb falls back to its CSS home (the same pixels),
// and a live drag onto the slot slides off it. A dragged orb can
// therefore never cover DISMOUNT, TRADE, or the ARMED readout, in
// either mode. Known edge (documented, not a bug): once TRADE has
// been dragged away, dragging it back to exactly its riding home
// slides it ~48 px down — the slot is shared with the ARMED orb's
// walking seat, so the dock keeps it clear.
//
// Sizes are the dock's one map (lib/world/orb-dock.js reads them
// through the caller): jump 76, boost/shoot/fire 64, summon/trade
// 56, dismount 64. The page and the scene both use this map, so a
// prune in either dock instance measures every orb at its true size.

/** The dock's orb sizes on Jupiter 2 (one map, both instances). */
export const JUPITER2_ORB_SIZES = { jump: 76, boost: 64, shoot: 64, fire: 64, summon: 56, dismount: 64, trade: 56 };

/**
 * Every stage-px rect no dock orb may cover, on a vw x vh stage
 * (vw/vh are the stage's client size — the box the orbs position
 * against). Fixed controls first, then every dock orb's home slot
 * in both modes. A rect's `owner` is the orb that owns the slot
 * (see above); shared slots carry no owner.
 */
export function jupiter2DockExclusions(vw, vh) {
  return [
    // The backpack's fixed home slot, badge + clearance (Nov 16).
    backpackHomeExclusionRect(vw, vh),
    // Fixed controls: the joystick, the HP orb, the ORBS tally,
    // the FULLSCREEN / EXIT orb (top-right, both states).
    { x: 16, y: vh - 120, w: 104, h: 104 },
    { x: 76, y: 12, w: 56, h: 56 },
    { x: 140, y: 12, w: 56, h: 56 },
    { x: vw - 68, y: 12, w: 56, h: 56 },
    // The ARMED lever orb — a readout, not dock-owned — in both
    // modes: riding top 212, walking top 140.
    { x: 12, y: 212, w: 56, h: 56 },
    { x: 12, y: 140, w: 56, h: 56 },
    // Dock homes, walking mode: SUMMON top-left (its own slot).
    { x: 12, y: 12, w: 56, h: 56, owner: 'summon' },
    // The shared top-left slot: DISMOUNT's home while riding IS
    // TRADE's home on foot (64 px covers both). No owner — see above.
    { x: 12, y: 76, w: 64, h: 64 },
    // Dock homes, riding mode: TRADE below DISMOUNT (no owner —
    // it overlaps the ARMED orb's walking slot, see above).
    { x: 12, y: 148, w: 56, h: 56 },
    // Dock homes, right column: SHOOT / BOOST ride left of JUMP
    // (right 100, not 104 — Nov 24: at a 320 px viewport the 104
    // column sat exactly flush on the joystick and measured a 2 px
    // box overlap; 100 clears it by 2 px and keeps 12 px to JUMP).
    { x: vw - 164, y: vh - 76, w: 64, h: 64, owner: 'shoot' },
    { x: vw - 164, y: vh - 152, w: 64, h: 64, owner: 'boost' },
    // Dock homes, walking mode, right column: FIRE under JUMP.
    { x: vw - 76, y: vh - 76, w: 64, h: 64, owner: 'fire' },
    // JUMP, mid-column right (both modes — it renders while riding).
    { x: vw - 88, y: vh - 164, w: 76, h: 76, owner: 'jump' },
  ];
}
