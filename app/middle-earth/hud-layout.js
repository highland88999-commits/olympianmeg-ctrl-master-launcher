// app/middle-earth/hud-layout.js — the stacked top-band layout model
// (Merlin, 2026-11-15, from the Nov 15 phone video: the old absolute
// stack clipped the hunt pill at the left edge and sat the mission
// card on the header).
//
// The zone HUD top band is ONE flex column in normal flow — header
// row, objective row, hunt row — each band in its own slot, the
// container inset from both screen edges. This pure model is the
// contract that CSS implements: given the bands' heights it returns
// each band's rect, so the tests can pin that no two bands overlap
// and no band runs past the screen edge, whatever the phone width.

export function layoutHudStack({ top = 0, gap = 0, width = 360, bands = [] }) {
  let y = top;
  const rects = [];
  for (const band of bands) {
    const height = Math.max(0, band.height || 0);
    // A band never exceeds the container width: long hunt text wraps
    // inside its pill instead of running off the screen edge.
    const bandWidth = Math.min(width, band.maxWidth ?? width);
    const left = Math.max(0, (width - bandWidth) / 2);
    rects.push({
      id: band.id,
      top: y,
      bottom: y + height,
      left,
      right: left + bandWidth,
      width: bandWidth,
      height,
    });
    y += height + gap;
  }
  // Content height only: the top offset is where the stack starts,
  // not part of how tall it is.
  return { rects, totalHeight: rects.length ? y - gap - top : 0 };
}

export function bandsOverlap(a, b) {
  return a.top < b.bottom && b.top < a.bottom;
}
