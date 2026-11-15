// lib/nether-realm/fight-controls.js — MEDUSA'S LAIR FIGHT DOCK
// (Merlin, Nov 15 ~04:19): the lair fight controls are CIRCLES,
// not rectangles, and nothing overlaps anything — the standing
// Omega layout law. His first phone run showed the old pills
// ("Strike Medusa", "Use the Head", "Raise the head", the long
// upgrade pill) overlapping each other, the movement stick, and
// the Concourse Orb. This module is the single source of truth
// for the dock's geometry: the page renders from it, the tests
// assert on it. Pure functions, no React, no DOM.
//
// The boxes below are measured from the page's own classes —
// change a class, change the constant here to match:
//   · joystick:  absolute bottom-24 left-8 h-28 w-28
//     (app/nether-realm/page.jsx) → left 32, bottom 96, 112×112.
//   · Concourse Orb: SIZE 56, home right 18, bottom 96
//     (components/Concourse.jsx default). The orb is draggable
//     and the backpack icon is draggable — both are the accepted
//     exception to the no-overlap rule for user-draggable
//     controls, so this layout clears their HOME spots; if
//     Merlin drags one onto the dock, he can drag it away.
//   · backpack icon: BACKPACK_ICON_SIZE 56, home top-4 right-4
//     in-flow (components/backpack/BackpackHud.jsx, docked).
//   · notice: absolute inset-x-0 bottom-36 (page.jsx) → bottom
//     144, ~36 tall, centred, at most 340 wide.
// The dock lives in the free band between the stick and the orb,
// two rows at most, bottom row first (the thumb row). Every
// circle is FIGHT_CIRCLE_DIAMETER square, border-radius 50%.

export const FIGHT_CIRCLE_DIAMETER = 48;
export const FIGHT_CIRCLE_GAP = 8;
export const FIGHT_CIRCLE_DIAMETER_COMPACT = 40;
export const FIGHT_CIRCLE_GAP_COMPACT = 6;
export const FIGHT_DOCK_BOTTOM = 12; // px from the viewport bottom
export const FIGHT_DOCK_LEFT_CLEAR = 8; // clear of the stick's right edge
export const FIGHT_DOCK_RIGHT_CLEAR = 4; // clear of the orb's home left edge
export const FIGHT_DOCK_MAX_COLUMNS = 3;
export const FIGHT_REFORM_WIDTH = 150;
export const FIGHT_REFORM_HEIGHT = 16;

/** The HUD boxes the dock must clear, in { left, top, width, height } from the viewport's top-left. */
export function hudBoxes(viewportW, viewportH) {
  const joystick = { left: 32, top: viewportH - 96 - 112, width: 112, height: 112 };
  const orb = { left: viewportW - 18 - 56, top: viewportH - 96 - 56, width: 56, height: 56 };
  const backpack = { left: viewportW - 16 - 56, top: 16, width: 56, height: 56 };
  const noticeWidth = Math.min(340, viewportW - 32);
  // A long notice wraps to two lines on a narrow phone — model
  // the taller box there so the dock never plans under it.
  const noticeHeight = viewportW >= 360 ? 36 : 56;
  const notice = {
    left: (viewportW - noticeWidth) / 2,
    top: viewportH - 144 - noticeHeight,
    width: noticeWidth,
    height: noticeHeight,
  };
  return { joystick, orb, backpack, notice };
}

/** True when two { left, top, width, height } boxes share any area. Touching edges is not an overlap. */
export function boxesOverlap(a, b) {
  return (
    a.left < b.left + b.width
    && b.left < a.left + a.width
    && a.top < b.top + b.height
    && b.top < a.top + a.height
  );
}

/**
 * Where the fight circles go. `count` is how many buttons apply
 * right now (at most 6: strike, use-head, raise/lower, upgrade
 * head, use-chain, upgrade chain). `hasJoystick` is false on
 * desktop, where no stick is rendered. `showReform` adds the
 * "Medusa reforms in N s" caption above the dock. Returns the
 * circle boxes (bottom row first), the reform caption box (or
 * null), and the grid shape — all in viewport px from top-left.
 */
export function fightDockLayout({ viewportW, viewportH, count, hasJoystick = true, showReform = false }) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const { joystick, orb, notice } = hudBoxes(viewportW, viewportH);
  const bandLeft = hasJoystick ? joystick.left + joystick.width + FIGHT_DOCK_LEFT_CLEAR : 8;
  const bandRight = orb.left - FIGHT_DOCK_RIGHT_CLEAR;
  const bandWidth = Math.max(FIGHT_CIRCLE_DIAMETER, bandRight - bandLeft);
  // A narrow band cannot fit three full-size circles side by
  // side — the dock goes compact (40 px circles) instead of
  // growing tall into the notice.
  const compact = bandWidth < FIGHT_DOCK_MAX_COLUMNS * FIGHT_CIRCLE_DIAMETER
    + (FIGHT_DOCK_MAX_COLUMNS - 1) * FIGHT_CIRCLE_GAP;
  const diameter = compact ? FIGHT_CIRCLE_DIAMETER_COMPACT : FIGHT_CIRCLE_DIAMETER;
  const gap = compact ? FIGHT_CIRCLE_GAP_COMPACT : FIGHT_CIRCLE_GAP;
  const columns = Math.max(
    1,
    Math.min(
      FIGHT_DOCK_MAX_COLUMNS,
      Math.floor((bandWidth + gap) / (diameter + gap)),
    ),
  );
  const rows = n === 0 ? 0 : Math.ceil(n / columns);
  const circles = [];
  for (let i = 0; i < n; i += 1) {
    const row = Math.floor(i / columns); // 0 = bottom row (the thumb row)
    const inRow = Math.min(columns, n - row * columns);
    const rowWidth = inRow * diameter + (inRow - 1) * gap;
    const col = i % columns;
    const left = bandLeft + (bandWidth - rowWidth) / 2 + col * (diameter + gap);
    const bottom = FIGHT_DOCK_BOTTOM + row * (diameter + gap);
    circles.push({
      left,
      top: viewportH - bottom - diameter,
      width: diameter,
      height: diameter,
    });
  }
  let reform = null;
  if (showReform) {
    const dockTopFromBottom = rows === 0
      ? FIGHT_DOCK_BOTTOM
      : FIGHT_DOCK_BOTTOM + rows * diameter + (rows - 1) * gap;
    const reformWidth = Math.min(FIGHT_REFORM_WIDTH, bandWidth);
    const belowNoticeBottom = dockTopFromBottom + 8;
    const belowNotice = {
      left: bandLeft + (bandWidth - reformWidth) / 2,
      top: viewportH - belowNoticeBottom - FIGHT_REFORM_HEIGHT,
      width: reformWidth,
      height: FIGHT_REFORM_HEIGHT,
    };
    // Normally the caption sits just above the dock, below the
    // notice. On a narrow phone the tall dock leaves no room
    // there, so it goes above the notice instead — never on top
    // of it, either way.
    reform = boxesOverlap(belowNotice, notice)
      ? {
          left: belowNotice.left,
          top: notice.top - 8 - FIGHT_REFORM_HEIGHT,
          width: reformWidth,
          height: FIGHT_REFORM_HEIGHT,
        }
      : belowNotice;
  }
  return { diameter, gap, columns, rows, compact, circles, reform };
}
