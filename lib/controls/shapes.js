// lib/controls/shapes.js
//
// The Shape Law (Merlin, 2026-10-13): similar moves live under one
// shaped pad, and the pad's polygon sides EQUAL the number of controls
// in its group — per pad, never a global shape. 5 controls = pentagon,
// 6 = hexagon, 8 = octagon. This module is the pure geometry of that
// law: no DOM, no React — headless-testable.
//
// Angle convention (screen space, y down, matching SVG):
//   0 = right, +90deg = down, 180 = left, -90deg = up.
// Wedge 0 is always centered on UP and wedges run clockwise, so a
// pad's controls array reads clockwise from the top, exactly as drawn
// on Merlin's paper (labels ringed outside the rim, one per wedge).

export const SHAPE_NAMES = {
  1: 'circle',
  2: 'domino',
  3: 'triangle',
  4: 'square',
  5: 'pentagon',
  6: 'hexagon',
  7: 'heptagon',
  8: 'octagon',
  9: 'nonagon',
  10: 'decagon',
  11: 'hendecagon',
  12: 'dodecagon',
};

export function shapeNameFor(count) {
  return SHAPE_NAMES[count] || null;
}

export function wedgeStep(sides) {
  return (Math.PI * 2) / sides;
}

/** Rotation so wedge 0 is centered on UP (-90deg). */
export function padRotation(sides) {
  return -Math.PI / 2 - wedgeStep(sides) / 2;
}

/** Center angle of wedge `index` (screen convention, y down). */
export function wedgeCenterAngle(index, sides) {
  return padRotation(sides) + (index + 0.5) * wedgeStep(sides);
}

/** Which wedge contains `angle` (radians, screen convention). */
export function wedgeIndexForAngle(angle, sides) {
  const step = wedgeStep(sides);
  const TAU = Math.PI * 2;
  let a = (angle - padRotation(sides)) % TAU;
  if (a < 0) a += TAU;
  return Math.min(sides - 1, Math.floor(a / step));
}

/** Outer polygon vertices (at wedge boundaries), center (0,0). */
export function polygonPoints(sides, radius) {
  if (sides === 1) return [[0, -radius], [radius, 0], [0, radius], [-radius, 0]];
  if (sides === 2) {
    // a domino: two wedges split left/right of a vertical seam
    return [
      [0, -radius], [radius, 0], [0, radius], [-radius, 0],
    ];
  }
  const rot = padRotation(sides);
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + i * wedgeStep(sides);
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

/** SVG polygon points string for the pad outline. */
export function polygonPointsAttr(sides, radius) {
  return polygonPoints(sides, radius)
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
}

/** Wedge boundary angles (the spokes), for divider lines. */
export function wedgeBoundaryAngles(sides) {
  if (sides === 1) return [];
  if (sides === 2) return [-Math.PI / 2, Math.PI / 2];
  const rot = padRotation(sides);
  const out = [];
  for (let i = 0; i < sides; i++) out.push(rot + i * wedgeStep(sides));
  return out;
}

/** Point on the rim at an angle. */
export function rimPoint(angle, radius) {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/**
 * Wedge path (center -> rim arc -> center) as an SVG path string,
 * for fills (active wedge, cooldown shade). Radius in SVG units.
 */
export function wedgePath(index, sides, radius) {
  if (sides === 1) {
    return `M ${-radius} 0 A ${radius} ${radius} 0 1 1 ${radius} 0 A ${radius} ${radius} 0 1 1 ${-radius} 0 Z`;
  }
  if (sides === 2) {
    // domino: wedge 0 = right half-disc, wedge 1 = left half-disc
    return index === 0
      ? `M 0 ${-radius} A ${radius} ${radius} 0 0 1 0 ${radius} Z`
      : `M 0 ${-radius} A ${radius} ${radius} 0 0 0 0 ${radius} Z`;
  }
  const step = wedgeStep(sides);
  const a0 = padRotation(sides) + index * step;
  const a1 = a0 + step;
  const [x0, y0] = rimPoint(a0, radius);
  const [x1, y1] = rimPoint(a1, radius);
  const large = step > Math.PI ? 1 : 0;
  return `M 0 0 L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/**
 * Where a wedge's external label sits: outside the rim on the
 * wedge's center angle ("out the back", as drawn on the paper).
 * Returns { x, y, anchor } in SVG units for a given label radius.
 */
export function labelPosition(index, sides, labelRadius) {
  const a = wedgeCenterAngle(index, sides);
  const [x, y] = rimPoint(a, labelRadius);
  const c = Math.cos(a);
  const anchor = c > 0.35 ? 'start' : c < -0.35 ? 'end' : 'middle';
  return { x, y, anchor, angle: a };
}

/** Split a long label into at most two lines near the middle space. */
export function splitLabel(label) {
  const s = String(label || '');
  if (s.length <= 13 || !s.includes(' ')) return [s];
  const words = s.split(' ');
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l = words.slice(0, i).join(' ').length;
    const r = words.slice(i).join(' ').length;
    const d = Math.abs(l - r);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
