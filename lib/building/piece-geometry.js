// lib/building/piece-geometry.js
// THE BUILDING TOOLKIT — PROCEDURAL PIECE GEOMETRY (shared, pure).
//
// The catalog (lib/building/catalog.js) says what pieces exist and
// how big they are; it deliberately carries no rendering shape.
// This module is the shape vocabulary: for every catalog piece it
// produces a MESH SPEC — a list of primitive parts in piece-local
// space (origin at the piece's ground centre, +y up, metres) —
// which the renderer (lib/building/piece-render.js) turns into
// three.js meshes. Pure data in, pure data out: no three.js, no
// DOM, so the whole catalog's renderability is unit-testable.
//
// A part is:
//   { shape, offset: [x, y, z], rot?: [rx, ry, rz] (degrees),
//     material?: 'finish' | 'finishGlass' | 'glow' | 'water' |
//                'foliage' | 'dark', ...shapeParams }
// offset is the part's centre, except prism parts (whose profile
// carries absolute local coordinates; offset then defaults to 0)
// and sphere parts (offset is the sphere's centre; a hemisphere
// part sits with its flat side on the offset plane).
//
// Shape vocabulary (PIECE_SHAPES):
//   box      — size: [w, h, d]
//   cylinder — radius (mesh scale x/z), height (scale y),
//              rTop/rBottom (taper fractions of radius),
//              segments, thetaStart/thetaLength (radians),
//              openEnded
//   cone     — radius, height, segments
//   pyramid  — w, d, height, top (top width fraction 0..1): a
//              4-sided tapered form whose base corners land
//              exactly on the footprint corners
//   sphere   — radius, scaleY (vertical squash), thetaLength
//              (π = hemisphere, 2π = full ball)
//   prism    — profile: [[x, y], ...] closed polygon extruded
//              along z by depth
//   torus    — radius, tube, arc (radians)
//   arcwall  — radius, height, angleDeg: an open curved shell
//              centred on its chord, for the curved wall
//   wedge    — size: [w, h, d]: a right-triangle ramp whose high
//              edge stands at local −x, sloping down to +x; the
//              part's offset is its BASE (y = footprint), not a
//              centre — see piece-render.js

import { pieceById, BUILDING_PIECES } from './catalog.js';

export const PIECE_SHAPES = Object.freeze([
  'box', 'cylinder', 'cone', 'pyramid', 'sphere', 'prism', 'torus', 'arcwall',
  'wedge',
]);

const DEG = Math.PI / 180;

// ── Part helpers (offset y defaults to the part's centre) ───────
const box = (w, h, d, x = 0, y = null, z = 0, extra = {}) => ({
  shape: 'box', size: [w, h, d], offset: [x, y === null ? h / 2 : y, z], ...extra,
});
const cyl = (radius, height, x = 0, y = null, z = 0, extra = {}) => ({
  shape: 'cylinder', radius, height, offset: [x, y === null ? height / 2 : y, z], ...extra,
});
const cone = (radius, height, x = 0, y = null, z = 0, extra = {}) => ({
  shape: 'cone', radius, height, offset: [x, y === null ? height / 2 : y, z], ...extra,
});
const pyramid = (w, h, d, top = 0, y = null, extra = {}) => ({
  shape: 'pyramid', w, h, d, top, offset: [0, y === null ? h / 2 : y, 0], ...extra,
});
const dome = (radius, scaleY, x = 0, y = 0, z = 0, extra = {}) => ({
  shape: 'sphere', radius, scaleY, thetaLength: Math.PI, offset: [x, y, z], ...extra,
});
const ball = (radius, scaleY, x = 0, y = null, z = 0, extra = {}) => ({
  shape: 'sphere', radius, scaleY, thetaLength: Math.PI * 2,
  offset: [x, y === null ? radius * scaleY : y, z], ...extra,
});
const prism = (profile, depth, extra = {}) => ({
  shape: 'prism', profile, depth, offset: [0, 0, 0], ...extra,
});
const torus = (radius, tube, x = 0, y = 0, z = 0, extra = {}) => ({
  shape: 'torus', radius, tube, arc: Math.PI * 2, offset: [x, y, z], ...extra,
});
const glow = { material: 'glow' };
const glassy = { material: 'finishGlass' };
const dark = { material: 'dark' };
const foliage = { material: 'foliage' };

// A wall with a rectangular opening: four boxes around a hole of
// (ow × oh) whose sill sits at sillY. Total size w × h × d.
function wallWithOpening(w, h, d, ow, oh, sillY) {
  const sideW = (w - ow) / 2;
  const parts = [];
  if (sillY > 0) parts.push(box(w, sillY, d, 0, sillY / 2, 0));
  const topY = sillY + oh;
  if (topY < h) parts.push(box(w, h - topY, d, 0, (h + topY) / 2, 0));
  parts.push(box(sideW, oh, d, -(ow / 2 + sideW / 2), sillY + oh / 2, 0));
  parts.push(box(sideW, oh, d, ow / 2 + sideW / 2, sillY + oh / 2, 0));
  return parts;
}

// A half-annulus arch band as a prism profile: outer arc sampled
// 0..π, inner arc back π..0, around centre (0, cy).
function archBandProfile(rOut, rIn, cy, steps = 10) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    pts.push([rOut * Math.cos(a), cy + rOut * Math.sin(a)]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = (i / steps) * Math.PI;
    pts.push([rIn * Math.cos(a), cy + rIn * Math.sin(a)]);
  }
  return pts;
}

// A run of solid steps: `count` boxes climbing +z, each `rise`
// taller, spanning the piece width w over depth d.
function solidSteps(w, d, count, rise, x = 0, z0 = null) {
  const stepD = d / count;
  const start = z0 === null ? -d / 2 : z0;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const h = rise * (i + 1);
    parts.push(box(w, h, stepD, x, h / 2, start + stepD * (i + 0.5)));
  }
  return parts;
}

// ── Composition helpers for the generated builders ───────────────
// The Phase 3 expansion (418 pieces) is covered systematically:
// per-category generator functions dispatch on id patterns and
// compose silhouettes from these helpers + the primitives above,
// with hand-tuned overrides for hero pieces. Every helper returns
// parts in the same vocabulary — no new shapes beyond 'wedge'.

const watery = { material: 'water' };

// A wedge/ramp part: base at (x, y, z), rising toward local −x.
const wedge = (w, h, d, x = 0, y = 0, z = 0, extra = {}) => ({
  shape: 'wedge', size: [w, h, d], offset: [x, y, z], ...extra,
});

// A flat disc (a cylinder of the piece's own height), centred.
const disc = (r, h, x = 0, y = null, z = 0, extra = {}) => cyl(r, h, x, y, z, extra);

// A lattice panel in the x/y plane: outer frame + two families of
// diagonal slats, thickness t along z, centred at (cx, cy, cz).
function latticePanel(w, h, t, cx = 0, cy = null, cz = 0, slat = 0.06) {
  const cyy = cy === null ? h / 2 : cy;
  const parts = [
    box(w, slat * 1.6, t, cx, cyy + h / 2 - slat * 0.8, cz),
    box(w, slat * 1.6, t, cx, cyy - h / 2 + slat * 0.8, cz),
    box(slat * 1.6, h, t, cx - w / 2 + slat * 0.8, cyy, cz),
    box(slat * 1.6, h, t, cx + w / 2 - slat * 0.8, cyy, cz),
  ];
  const diag = Math.hypot(w, h) * 0.78;
  const ang = Math.atan2(h, w) / DEG;
  for (const s of [-1, 1]) {
    for (const off of [-0.26, 0.26]) {
      parts.push(box(diag, slat, t * 0.7,
        cx + off * h * s * 0.5, cyy + off * w * 0.5, cz,
        { rot: [0, 0, s * ang] }));
    }
  }
  return parts;
}

// A run of vertical slats across width w (a slatted wall / fence /
// vent face): n slats of width sw with rails top and bottom.
function slatRun(w, h, t, n, sw = 0.16, cz = 0) {
  const parts = [
    box(w, 0.09, t, 0, h - 0.05, cz),
    box(w, 0.09, t, 0, 0.05, cz),
  ];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -w / 2 + (w / (n)) * (i + 0.5);
    parts.push(box(sw, h - 0.14, t * 0.8, x, h / 2, cz));
  }
  return parts;
}

// A wall with TWO rectangular window openings side by side.
function wallWithTwoWindows(w, h, d, ow, oh, sillY, glass = false) {
  const gap = (w - 2 * ow) / 3;
  const parts = [];
  if (sillY > 0) parts.push(box(w, sillY, d, 0, sillY / 2, 0));
  const topY = sillY + oh;
  if (topY < h) parts.push(box(w, h - topY, d, 0, (h + topY) / 2, 0));
  const cols = [-w / 2 + gap / 2, 0, w / 2 - gap / 2];
  const colW = [gap, gap, gap];
  cols.forEach((cx, i) => parts.push(box(colW[i], oh, d, cx, sillY + oh / 2, 0)));
  if (glass) {
    for (const s of [-1, 1]) {
      parts.push(box(ow, oh, 0.04, s * (gap / 2 + ow / 2), sillY + oh / 2, 0, glassy));
    }
  }
  return parts;
}

// A filled arch-top outline (a door/panel silhouette): rectangle
// rising to springY, then a semicircular cap of radius w/2.
function archTopProfile(w, springY, steps = 8) {
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, springY]];
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    pts.push([w / 2 * Math.cos(a), springY + w / 2 * Math.sin(a)]);
  }
  pts.push([-w / 2, springY]);
  return pts;
}

// A shallow steps run of boxes climbing +z within (w × d): each
// step `rise` taller — a solidSteps variant with a custom count.
const stepsRun = (w, d, count, rise, x = 0, z0 = null) =>
  solidSteps(w, d, count, rise, x, z0);

// A sagging rope/chain/cable: a torus arc whose chord spans
// `span` metres at height y (the attach line), dipping `sag`
// metres at its centre. The torus centre rides high above —
// only the arc segment is ever drawn.
function sagArc(span, sag, y, tube, cx = 0, extra = {}) {
  const R = ((span / 2) ** 2 + sag ** 2) / (2 * sag);
  const arc = 2 * Math.asin((span / 2) / R);
  return {
    shape: 'torus', radius: R, tube, arc,
    offset: [cx, y + R - sag, 0],
    rot: [0, 0, -(90 + (arc / DEG) / 2)],
    ...extra,
  };
}

// ── The per-piece spec builders ──────────────────────────────────
// Each receives the catalog piece (for its size) and returns the
// parts list. Silhouettes are honest approximations at the piece's
// catalogued bounding size — the renderer's job is recognition,
// not architecture.
const SPEC_BUILDERS = {
  'foundation-block': (p) => [box(p.size.w, p.size.h, p.size.d)],
  'floor-panel': (p) => [box(p.size.w, p.size.h, p.size.d)],
  'wall': (p) => [box(p.size.w, p.size.h, p.size.d)],
  'wall-door': (p) => wallWithOpening(p.size.w, p.size.h, p.size.d, 1.3, 2.25, 0),
  'wall-window': (p) => wallWithOpening(p.size.w, p.size.h, p.size.d, 1.8, 1.25, 0.95),
  'wall-gable': (p) => [
    box(p.size.w, 1, p.size.d, 0, 0.5, 0),
    prism([[-p.size.w / 2, 0], [p.size.w / 2, 0], [0, p.size.h - 1]], p.size.d, { offset: [0, 1, 0] }),
  ],
  'half-wall': (p) => [box(p.size.w, p.size.h, p.size.d)],
  'roof-flat': (p) => [box(p.size.w, p.size.h, p.size.d)],
  'roof-pitched': (p) => [
    prism([[-p.size.w / 2, 0], [p.size.w / 2, 0], [0, p.size.h]], p.size.d),
  ],
  'ramp': (p) => [
    prism([[-p.size.d / 2, 0], [p.size.d / 2, 0], [-p.size.d / 2, p.size.h]], p.size.w, { rot: [0, 90, 0] }),
  ],
  'stairs': (p) => solidSteps(p.size.w, p.size.d, 6, p.size.h / 6),
  'pillar': (p) => [
    box(0.7, 0.18, 0.7, 0, 0.09, 0),
    cyl(0.25, p.size.h - 0.36, 0, p.size.h / 2, 0),
    box(0.7, 0.18, 0.7, 0, p.size.h - 0.09, 0),
  ],
  'beam': (p) => [box(p.size.w, p.size.h, p.size.d)],
  'platform': (p) => [box(p.size.w, p.size.h, p.size.d)],
  'door-panel': (p) => [
    box(p.size.w, p.size.h, p.size.d),
    ball(0.07, 1, p.size.w / 2 - 0.22, 1.2, 0.12, dark),
  ],
  'window-pane': (p) => {
    const { w, h, d } = p.size;
    return [
      box(w, h, d * 0.6, 0, h / 2, 0, glassy),
      box(w, 0.09, d, 0, 0.045, 0), box(w, 0.09, d, 0, h - 0.045, 0),
      box(0.09, h, d, -w / 2 + 0.045, h / 2, 0), box(0.09, h, d, w / 2 - 0.045, h / 2, 0),
      box(0.07, h, d * 0.8, 0, h / 2, 0),
    ];
  },

  // SPANS & SKY
  'bridge-plank': (p) => {
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push(box(1.22, 0.1, p.size.d, -3.32 + i * 1.33, 0.25, 0));
    parts.push(box(p.size.w, 0.16, 0.16, 0, 0.12, p.size.d / 2 - 0.1));
    parts.push(box(p.size.w, 0.16, 0.16, 0, 0.12, -p.size.d / 2 + 0.1));
    return parts;
  },
  'bridge-rope': (p) => {
    const parts = [box(p.size.w, 0.16, p.size.d, 0, 0.32, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(cyl(0.07, 1, sx * (p.size.w / 2 - 0.25), 0.5, sz * (p.size.d / 2 - 0.08)));
    }
    parts.push(box(p.size.w - 0.4, 0.05, 0.05, 0, 0.98, p.size.d / 2 - 0.08));
    parts.push(box(p.size.w - 0.4, 0.05, 0.05, 0, 0.98, -p.size.d / 2 + 0.08));
    return parts;
  },
  'bridge-stone-arch': (p) => [
    box(p.size.w, 0.35, p.size.d, 0, p.size.h - 0.175, 0),
    box(1.2, 1.3, p.size.d, -(p.size.w / 2 - 0.7), 0.65, 0),
    box(1.2, 1.3, p.size.d, p.size.w / 2 - 0.7, 0.65, 0),
    prism(archBandProfile(3.3, 2.75, -1.3), p.size.d + 0.04),
  ],
  'sky-walkway': (p) => [
    box(p.size.w, p.size.h, p.size.d, 0, p.size.h / 2, 0, glassy),
    box(p.size.w, 0.07, 0.09, 0, p.size.h + 0.02, p.size.d / 2 - 0.05),
    box(p.size.w, 0.07, 0.09, 0, p.size.h + 0.02, -p.size.d / 2 + 0.05),
  ],
  'arch-roman': (p) => [
    box(0.5, 1.5, p.size.d, -(p.size.w / 2 - 0.28), 0.75, 0),
    box(0.5, 1.5, p.size.d, p.size.w / 2 - 0.28, 0.75, 0),
    prism(archBandProfile(2, 1.5, 1.4), p.size.d + 0.04),
  ],
  'arch-gothic': (p) => {
    const outer = [[-2, 1.9], [-1.92, 2.9], [-1.35, 3.65], [-0.55, 4.05], [0, 4.2],
      [0.55, 4.05], [1.35, 3.65], [1.92, 2.9], [2, 1.9]];
    const inner = outer.map(([x, y]) => [x * 0.76, 1.9 + (y - 1.9) * 0.76]).reverse();
    return [
      box(0.5, 1.9, p.size.d, -(p.size.w / 2 - 0.28), 0.95, 0),
      box(0.5, 1.9, p.size.d, p.size.w / 2 - 0.28, 0.95, 0),
      prism([...outer, ...inner], p.size.d + 0.04),
    ];
  },
  'beam-long': (p) => [box(p.size.w, p.size.h, p.size.d)],

  // ROOFS & CROWNS
  'roof-hip': (p) => [pyramid(p.size.w, p.size.h, p.size.d, 0.35)],
  'roof-pyramid': (p) => [pyramid(p.size.w, p.size.h, p.size.d, 0)],
  'roof-cone-spire': (p) => [
    cone(p.size.w / 2, p.size.h - 0.25, 0, (p.size.h - 0.25) / 2, 0),
    ball(0.14, 1, 0, p.size.h - 0.12, 0, glow),
  ],
  'roof-dome': (p) => [dome(p.size.w / 2, p.size.h / (p.size.w / 2))],
  'roof-onion-dome': (p) => [
    ball(p.size.w / 2, 1.05, 0, 1.32, 0),
    cone(0.3, 0.55, 0, 2.85, 0),
    ball(0.09, 1, 0, 3.05, 0, glow),
  ],
  'roof-mushroom-cap': (p) => [
    dome(p.size.w / 2, 0.62),
    cyl(p.size.w / 2 + 0.03, 0.14, 0, 0.07, 0),
  ],
  'roof-canopy': (p) => {
    const parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(cyl(0.05, 0.55, sx * (p.size.w / 2 - 0.2), 0.275, sz * (p.size.d / 2 - 0.2)));
    }
    parts.push(prism(
      [[-p.size.w / 2, 0], [p.size.w / 2, 0], [0, p.size.h - 0.55]], p.size.d,
      { offset: [0, 0.55, 0] }
    ));
    return parts;
  },
  'skylight-dome': (p) => [dome(p.size.w / 2, p.size.h / (p.size.w / 2), 0, 0, 0, glassy)],

  // WALLS & OPENINGS
  'wall-curved': (p) => {
    // Chord = size.w at the catalogued 22.5° arc step, so sixteen
    // segments close a ring: R = chord / (2 sin(step/2)).
    const step = 22.5 * DEG;
    const radius = p.size.w / (2 * Math.sin(step / 2));
    return [{
      shape: 'arcwall', radius, height: p.size.h, angleDeg: 22.5,
      offset: [0, p.size.h / 2, 0],
    }];
  },
  'wall-round-window': (p) => {
    const parts = wallWithOpening(p.size.w, p.size.h, p.size.d, 1.45, 1.45, 0.9);
    parts.push(torus(0.72, 0.07, 0, 1.62, 0));
    parts.push(cyl(0.68, 0.05, 0, 1.62, 0, { rot: [90, 0, 0], ...glassy }));
    return parts;
  },
  'wall-battlement': (p) => {
    const parts = [box(p.size.w, 3, p.size.d, 0, 1.5, 0)];
    for (let i = 0; i < 5; i++) parts.push(box(0.55, 0.6, p.size.d + 0.02, -1.6 + i * 0.8, 3.3, 0));
    return parts;
  },
  'wall-glass-pane': (p) => [box(p.size.w, p.size.h, p.size.d, 0, p.size.h / 2, 0, glassy)],
  'wall-gate-arch': (p) => [
    ...wallWithOpening(p.size.w, p.size.h, p.size.d, 3.6, 2.8, 0),
    prism(archBandProfile(2.35, 1.85, 1.25, 8), p.size.d + 0.04),
  ],
  'door-double': (p) => [
    box(p.size.w / 2 - 0.03, p.size.h, p.size.d, -(p.size.w / 4), p.size.h / 2, 0),
    box(p.size.w / 2 - 0.03, p.size.h, p.size.d, p.size.w / 4, p.size.h / 2, 0),
    ball(0.06, 1, -0.16, 1.25, 0.11, dark),
    ball(0.06, 1, 0.16, 1.25, 0.11, dark),
  ],
  'window-bay': (p) => [
    box(1.2, 1.4, 0.08, 0, 0.8, 0.26, glassy),
    box(0.85, 1.4, 0.08, -0.88, 0.8, 0.1, { rot: [0, 42, 0], ...glassy }),
    box(0.85, 1.4, 0.08, 0.88, 0.8, 0.1, { rot: [0, -42, 0], ...glassy }),
    box(2.4, 0.12, 0.65, 0, 1.56, 0.05),
    box(2.4, 0.12, 0.65, 0, 0.06, 0.05),
  ],
  'gate-double': (p) => [
    box(1.72, p.size.h, 0.07, -0.9, p.size.h / 2, 0),
    box(1.72, p.size.h, 0.07, 0.9, p.size.h / 2, 0),
    box(1.6, 0.14, 0.1, -0.9, p.size.h / 2, 0.02, { rot: [0, 0, 38] }),
    box(1.6, 0.14, 0.1, 0.9, p.size.h / 2, 0.02, { rot: [0, 0, -38] }),
  ],
  'portcullis': (p) => {
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push(box(0.09, p.size.h, 0.06, -1.25 + i * 0.5, p.size.h / 2, 0));
    for (let i = 0; i < 4; i++) parts.push(box(p.size.w, 0.09, 0.06, 0, 0.4 + i * 0.8, 0));
    parts.push(box(p.size.w, 0.16, 0.09, 0, p.size.h - 0.08, 0));
    return parts;
  },

  // CLIMB
  'stairs-l': (p) => {
    const parts = solidSteps(2, 2.6, 3, 0.5, -1, -2);
    parts.push(box(4, 0.28, 2, 0, 1.36, 1));
    for (let i = 0; i < 3; i++) {
      const h = 0.5 * (i + 1);
      parts.push(box(1.3, h, 1.8, 0.68 + i * 1.32, 1.5 + h / 2, 1));
    }
    return parts;
  },
  'stairs-spiral': (p) => {
    const parts = [cyl(0.13, p.size.h, 0, p.size.h / 2, 0)];
    for (let i = 0; i < 8; i++) {
      const a = i * 45 * DEG;
      parts.push(box(1.15, 0.09, 0.52,
        Math.sin(a) * 0.58, 0.35 + i * 0.33, Math.cos(a) * 0.58,
        { rot: [0, i * 45, 0] }));
    }
    return parts;
  },
  'stairs-floating': (p) => {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      parts.push(box(p.size.w, 0.12, 0.62, 0, 0.3 + i * 0.5, -p.size.d / 2 + 0.35 + i * 0.66));
    }
    return parts;
  },
  'ladder': (p) => {
    const parts = [
      box(0.07, p.size.h, 0.07, -0.27, p.size.h / 2, 0),
      box(0.07, p.size.h, 0.07, 0.27, p.size.h / 2, 0),
    ];
    for (let i = 0; i < 6; i++) {
      parts.push(cyl(0.03, 0.54, 0, 0.32 + i * 0.47, 0, { rot: [0, 0, 90] }));
    }
    return parts;
  },
  'elevator-pad': (p) => [
    cyl(p.size.w / 2, p.size.h, 0, p.size.h / 2, 0),
    torus(0.78, 0.05, 0, p.size.h + 0.02, 0, { rot: [90, 0, 0], ...glow }),
    cyl(0.5, 0.06, 0, p.size.h + 0.02, 0, glow),
  ],

  // WATER & EDGE
  'dock-jetty': (p) => {
    const parts = [box(p.size.w, 0.25, p.size.d, 0, 0.3, 0)];
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
      parts.push(cyl(0.09, 0.55, sx * (p.size.w / 2 - 0.4), 0.02, sz * (p.size.d / 2 - 0.25)));
    }
    return parts;
  },
  'platform-round': (p) => [cyl(p.size.w / 2, p.size.h, 0, p.size.h / 2, 0)],
  'railing': (p) => {
    const parts = [
      box(p.size.w, 0.09, 0.12, 0, 0.97, 0),
      box(p.size.w, 0.06, 0.08, 0, 0.52, 0),
    ];
    for (let i = 0; i < 5; i++) parts.push(box(0.07, 1, 0.07, -p.size.w / 2 + 0.2 + i * 0.9, 0.5, 0));
    return parts;
  },
  'fence-picket': (p) => {
    const parts = [
      box(p.size.w, 0.09, 0.05, 0, 0.32, -0.02),
      box(p.size.w, 0.09, 0.05, 0, 0.82, -0.02),
    ];
    for (let i = 0; i < 9; i++) {
      const x = -p.size.w / 2 + 0.25 + i * 0.44;
      parts.push(box(0.17, 1.02, 0.05, x, 0.51, 0.02));
      parts.push(pyramid(0.17, 0.16, 0.05, 0, 1.1, { offset: [x, 1.1, 0.02] }));
    }
    return parts;
  },

  // LIFE & WHIMSY
  'chimney': (p) => [
    box(p.size.w, p.size.h - 0.18, p.size.d, 0, (p.size.h - 0.18) / 2, 0),
    box(p.size.w + 0.22, 0.18, p.size.d + 0.22, 0, p.size.h - 0.09, 0),
  ],
  'fireplace': (p) => [
    box(p.size.w, p.size.h, p.size.d),
    box(0.95, 0.72, 0.1, 0, 0.42, p.size.d / 2 - 0.02, dark),
    box(0.68, 0.14, 0.3, 0, 0.1, p.size.d / 2 - 0.12, glow),
    box(p.size.w + 0.2, 0.12, p.size.d + 0.16, 0, p.size.h - 0.2, 0),
  ],
  'lantern-post': (p) => [
    cyl(0.06, 2.2, 0, 1.1, 0),
    box(0.36, 0.44, 0.36, 0, 2.38, 0),
    ball(0.11, 1, 0, 2.38, 0, glow),
    cone(0.3, 0.2, 0, 2.68, 0),
  ],
  'banner-pole': (p) => [
    cyl(0.07, p.size.h, 0, p.size.h / 2, 0),
    box(0.95, 0.06, 0.06, 0.45, p.size.h - 0.18, 0),
    box(0.85, 1.25, 0.04, 0.45, p.size.h - 0.85, 0),
    ball(0.09, 1, 0, p.size.h + 0.02, 0, glow),
  ],
  'fountain-base': (p) => [
    cyl(p.size.w / 2, 0.58, 0, 0.29, 0),
    torus(p.size.w / 2 - 0.05, 0.07, 0, 0.58, 0, { rot: [90, 0, 0] }),
    cyl(p.size.w / 2 - 0.22, 0.07, 0, 0.5, 0, { material: 'water' }),
    cyl(0.16, 0.34, 0, 0.72, 0),
    cyl(0.52, 0.09, 0, 0.88, 0),
  ],
  'statue-plinth': (p) => [
    box(p.size.w, 0.25, p.size.d, 0, 0.125, 0),
    box(p.size.w - 0.3, 0.6, p.size.d - 0.3, 0, 0.55, 0),
    box(p.size.w - 0.1, 0.25, p.size.d - 0.1, 0, 0.975, 0),
  ],
  'market-stall': (p) => {
    const parts = [
      box(p.size.w, 0.85, 0.6, 0, 0.425, 0.65),
      box(0.7, 0.5, 0.55, -0.9, 0.25, -0.5),
      box(0.7, 0.5, 0.55, 0.85, 0.25, -0.55),
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(cyl(0.05, 2.45, sx * (p.size.w / 2 - 0.12), 1.225, sz * (p.size.d / 2 - 0.12)));
    }
    parts.push(box(p.size.w + 0.3, 0.07, p.size.d + 0.5, 0, 2.5, 0, { rot: [-9, 0, 0] }));
    return parts;
  },
  'crystal-cluster': (p) => [
    cone(0.5, p.size.h, 0, p.size.h / 2, 0, glow),
    cone(0.32, 1.1, 0.45, 0.55, 0.1, { rot: [0, 0, -16], ...glow }),
    cone(0.27, 0.9, -0.42, 0.45, -0.08, { rot: [0, 0, 17], ...glow }),
    cone(0.2, 0.62, 0.08, 0.31, 0.4, { rot: [14, 0, 0], ...glow }),
    cyl(0.62, 0.18, 0, 0.09, 0, dark),
  ],
  'rune-pillar': (p) => [
    box(p.size.w + 0.2, 0.3, p.size.d + 0.2, 0, 0.15, 0),
    box(p.size.w, p.size.h - 0.55, p.size.d, 0, (p.size.h - 0.55) / 2 + 0.15, 0),
    box(p.size.w + 0.05, 0.5, p.size.d + 0.05, 0, 2.15, 0, glow),
    box(p.size.w + 0.2, 0.25, p.size.d + 0.2, 0, p.size.h - 0.125, 0),
  ],

  // ORGANIC
  'tree-column': (p) => [
    cyl(0.34, p.size.h - 1.1, 0, (p.size.h - 1.1) / 2, 0, { rTop: 0.62 }),
    ball(1.55, 0.72, 0, p.size.h - 0.75, 0, foliage),
    ball(1.05, 0.7, 0.85, p.size.h - 1.25, 0.4, foliage),
  ],
  'hedge-block': (p) => [
    box(p.size.w + 0.06, p.size.h, p.size.d + 0.06, 0, p.size.h / 2, 0, foliage),
    box(p.size.w + 0.12, 0.14, p.size.d + 0.12, 0, 0.07, 0),
  ],
  'mushroom-platform': (p) => [
    cyl(0.34, 0.24, 0, 0.1, 0),
    dome(p.size.w / 2, 0.3, 0, 0.04, 0),
  ],
  'vine-arch': (p) => [
    box(0.2, p.size.h, 0.2, -(p.size.w / 2 - 0.12), p.size.h / 2, 0),
    box(0.2, p.size.h, 0.2, p.size.w / 2 - 0.12, p.size.h / 2, 0),
    box(p.size.w, 0.2, 0.22, 0, p.size.h - 0.1, 0),
    box(1.25, 0.55, 0.62, -1.15, p.size.h - 0.05, 0, foliage),
    box(1.1, 0.5, 0.6, 0.35, p.size.h + 0.02, 0, foliage),
    box(1.15, 0.55, 0.62, 1.25, p.size.h - 0.08, 0, foliage),
    box(0.5, 0.85, 0.5, -(p.size.w / 2 - 0.12), p.size.h - 0.75, 0, foliage),
  ],
};

// ── Generated spec builders — the Phase 3 expansion ──────────────
// One generator per catalog category; each dispatches on id
// patterns (most specific first) and always ends at a category
// default, so no catalog piece can fall through unspecced. The
// original 62 keep their hand-written builders above, untouched.

const GEN_FOUNDATIONS = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'foundation-pier':
      return [
        box(w, 0.22, d, 0, 0.11, 0),
        cyl(0.36, h - 0.4, 0, h / 2, 0),
        box(w * 1.15, 0.2, d * 1.15, 0, h - 0.1, 0),
      ];
    case 'foundation-round': return [disc(w / 2, h)];
    case 'foundation-round-tall':
      return [disc(w / 2, h), disc(w / 2 + 0.12, 0.16, 0, h - 0.08, 0)];
    case 'foundation-stepped': {
      const parts = [];
      const tiers = 3;
      for (let i = 0; i < tiers; i++) {
        const s = 1 - i * 0.24;
        parts.push(box(w * s, h / tiers, d * s, 0, (h / tiers) * (i + 0.5), 0));
      }
      return parts;
    }
    case 'foundation-corner': {
      const t = 0.55;
      return [
        box(w, h, t, 0, h / 2, -d / 2 + t / 2),
        box(t, h, d, -w / 2 + t / 2, h / 2, 0),
      ];
    }
    case 'foundation-tall':
      return [box(w, h - 0.18, d), box(w + 0.3, 0.18, d + 0.3, 0, h - 0.09, 0)];
    case 'foundation-piling': {
      const parts = [box(w, 0.22, d, 0, h - 0.11, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(cyl(0.14, h - 0.2, sx * (w / 2 - 0.3), (h - 0.2) / 2, sz * (d / 2 - 0.3)));
      }
      return parts;
    }
    case 'foundation-hex': return [cyl(w / 2, h, 0, h / 2, 0, { segments: 6 })];
    case 'foundation-rubble':
      return [
        ball(w * 0.34, 0.55, -w * 0.18, 0, -d * 0.1),
        ball(w * 0.28, 0.6, w * 0.22, 0, d * 0.14),
        ball(w * 0.2, 0.55, w * 0.05, 0, -d * 0.26),
        box(w * 0.5, h * 0.4, d * 0.5, 0, h * 0.62, 0),
      ];
    case 'foundation-post-grid': {
      const parts = [box(w, 0.2, d, 0, h - 0.1, 0)];
      for (const fx of [-1, 0, 1]) for (const fz of [-1, 0, 1]) {
        parts.push(cyl(0.13, h - 0.2, fx * (w / 2 - 0.45), (h - 0.2) / 2, fz * (d / 2 - 0.45)));
      }
      return parts;
    }
    case 'foundation-boulder': return [ball(w / 2, h / (w / 2))];
    case 'foundation-raft':
      return [
        box(w, h, d),
        box(w, 0.14, 0.3, 0, h + 0.05, d / 2 - 0.15), box(w, 0.14, 0.3, 0, h + 0.05, -d / 2 + 0.15),
        box(0.3, 0.14, d, w / 2 - 0.15, h + 0.05, 0), box(0.3, 0.14, d, -w / 2 + 0.15, h + 0.05, 0),
      ];
    default: return [box(w, h, d)]; // slabs, wide and narrow
  }
};

const GEN_FLOORS = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'floor-planks': {
      const parts = [];
      const n = 5;
      for (let i = 0; i < n; i++) {
        parts.push(box(w / n - 0.05, h, d, -w / 2 + (w / n) * (i + 0.5), h / 2, 0));
      }
      return parts;
    }
    case 'floor-stone-tiles': case 'floor-checker': {
      const parts = [box(w, h * 0.6, d, 0, h * 0.3, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const lift = p.id === 'floor-checker' && ((sx + sz) % 4 === 0) ? 0.045 : 0.02;
        parts.push(box(w / 2 - 0.08, h * 0.4 + lift, d / 2 - 0.08,
          sx * w / 4, h * 0.6 + (h * 0.4 + lift) / 2, sz * d / 4));
      }
      return parts;
    }
    case 'floor-round': return [disc(w / 2, h)];
    case 'floor-round-small': return [disc(w / 2, h)];
    case 'floor-glass': return [box(w, h, d, 0, h / 2, 0, glassy)];
    case 'floor-grate': {
      const parts = [
        box(w, h, 0.18, 0, h / 2, d / 2 - 0.09), box(w, h, 0.18, 0, h / 2, -d / 2 + 0.09),
        box(0.18, h, d, w / 2 - 0.09, h / 2, 0), box(0.18, h, d, -w / 2 + 0.09, h / 2, 0),
      ];
      for (let i = 0; i < 6; i++) parts.push(box(0.12, h * 0.8, d - 0.3, -w / 2 + 0.5 + i * ((w - 1) / 5), h / 2, 0));
      return parts;
    }
    case 'floor-octagon': return [cyl(w / 2, h, 0, h / 2, 0, { segments: 8 })];
    case 'floor-metal-plate': {
      const parts = [box(w, h, d)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(ball(0.06, 0.6, sx * (w / 2 - 0.22), h + 0.01, sz * (d / 2 - 0.22), dark));
      }
      return parts;
    }
    case 'floor-mosaic':
      return [
        box(w, h, d),
        disc(w * 0.32, 0.03, 0, h + 0.015, 0),
        disc(w * 0.16, 0.04, 0, h + 0.02, 0, dark),
      ];
    case 'floor-deck-narrow': {
      const parts = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        parts.push(box(w, h, d / n - 0.05, 0, h / 2, -d / 2 + (d / n) * (i + 0.5)));
      }
      return parts;
    }
    case 'floor-trap-frame': {
      const parts = [
        box(w, h, 0.5, 0, h / 2, d / 2 - 0.25), box(w, h, 0.5, 0, h / 2, -d / 2 + 0.25),
        box(0.5, h, d - 1, w / 2 - 0.25, h / 2, 0), box(0.5, h, d - 1, -w / 2 + 0.25, h / 2, 0),
        box(w - 1.2, h * 0.45, d - 1.2, 0, h * 0.22, 0, dark),
      ];
      return parts;
    }
    case 'floor-pier-deck': {
      const parts = [box(w, 0.18, d, 0, h - 0.09, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(cyl(0.13, h - 0.18, sx * (w / 2 - 0.35), (h - 0.18) / 2, sz * (d / 2 - 0.35)));
      }
      parts.push(box(w - 0.4, 0.14, 0.14, 0, (h - 0.18) / 2, d / 2 - 0.35));
      parts.push(box(w - 0.4, 0.14, 0.14, 0, (h - 0.18) / 2, -d / 2 + 0.35));
      return parts;
    }
    default: return [box(w, h, d)]; // floor-half and friends
  }
};

const GEN_WALLS = (p) => {
  const { w, h, d } = p.size;
  const corner = (t) => [
    box(w, h, t, 0, h / 2, -d / 2 + t / 2),
    box(t, h, d, -w / 2 + t / 2, h / 2, 0),
    box(t * 1.4, 0.22, t * 1.4, -w / 2 + t / 2, h + 0.08, -d / 2 + t / 2),
  ];
  switch (p.id) {
    case 'wall-corner': return corner(0.3);
    case 'wall-corner-tall': return corner(0.35);
    case 'wall-tee':
      return [
        box(w, h, 0.3, 0, h / 2, d / 2 - 0.15),
        box(0.3, h, d - 0.3, 0, h / 2, -0.15),
      ];
    case 'wall-ruined':
      return [
        box(w, h * 0.72, d, 0, h * 0.36, 0),
        box(w * 0.34, h * 0.28, d, -w * 0.3, h * 0.86, 0),
        box(w * 0.2, h * 0.16, d, w * 0.34, h * 0.8, 0),
        box(0.8, 0.45, 0.6, w * 0.22, 0.22, d + 0.35, { rot: [8, 20, 12] }),
      ];
    case 'wall-ruined-half':
      return [
        box(w, h * 0.68, d, 0, h * 0.34, 0),
        box(w * 0.4, h * 0.32, d, -w * 0.26, h * 0.84, 0),
        box(0.55, 0.35, 0.5, w * 0.3, 0.17, d + 0.3, { rot: [-6, 0, 14] }),
      ];
    case 'wall-lancet-window': {
      const parts = wallWithOpening(w, h, d, 1.0, 2.0, 0.65);
      parts.push(box(1.0, 2.0, 0.04, 0, 1.65, 0, glassy));
      parts.push(prism([[0, 0], [0.5, 0], [0, 0.62]], 0.05, { offset: [-0.5, 2.65, 0], ...glassy }));
      parts.push(prism([[0, 0], [0.5, 0], [0, 0.62]], 0.05, { offset: [0.5, 2.65, 0], rot: [0, 180, 0], ...glassy }));
      return parts;
    }
    case 'wall-shutter-window': {
      const parts = wallWithOpening(w, h, d, 1.6, 1.3, 0.95);
      parts.push(box(1.6, 1.3, 0.04, 0, 1.6, 0, glassy));
      parts.push(box(0.78, 1.3, 0.05, -1.22, 1.6, 0.12, { rot: [0, 28, 0] }));
      parts.push(box(0.78, 1.3, 0.05, 1.22, 1.6, 0.12, { rot: [0, -28, 0] }));
      return parts;
    }
    case 'wall-arrow-slit': return wallWithOpening(w, h, d, 0.35, 1.6, 0.8);
    case 'wall-double-window': return wallWithTwoWindows(w, h, d, 1.15, 1.3, 0.9, true);
    case 'wall-clerestory': {
      const parts = wallWithOpening(w, h, d, 3.2, 0.8, h - 1.15);
      parts.push(box(3.2, 0.8, 0.04, 0, h - 0.75, 0, glassy));
      return parts;
    }
    case 'wall-round-window-tall': {
      const parts = wallWithOpening(w, h, d, 1.5, 1.5, 1.35);
      parts.push(torus(0.75, 0.07, 0, 2.1, 0));
      parts.push(cyl(0.7, 0.05, 0, 2.1, 0, { rot: [90, 0, 0], ...glassy }));
      return parts;
    }
    case 'wall-arch-door': {
      const parts = wallWithOpening(w, h, d, 1.8, 1.7, 0);
      parts.push(prism(archBandProfile(1.16, 0.9, 1.7, 8), d + 0.04));
      return parts;
    }
    case 'wall-round-door': {
      const parts = wallWithOpening(w, h, d, 1.7, 2.2, 0);
      parts.push(torus(0.85, 0.07, 0, 2.2, 0, { arc: Math.PI }));
      return parts;
    }
    case 'wall-half-door': return wallWithOpening(w, h, d, 1.2, 1.1, 0);
    case 'wall-curved-window': {
      const step = (p.snap && p.snap.rotation) || 22.5;
      const radius = w / (2 * Math.sin((step * DEG) / 2));
      return [
        { shape: 'arcwall', radius, height: h, angleDeg: step, offset: [0, h / 2, 0] },
        { shape: 'arcwall', radius: radius - 0.03, height: h * 0.36, angleDeg: step * 0.44, offset: [0, h * 0.55, 0], ...glassy },
      ];
    }
    case 'wall-timber-frame': {
      const parts = [box(w, h, d)];
      const proud = d + 0.08;
      parts.push(box(0.22, h, proud, -w / 2 + 0.3, h / 2, 0));
      parts.push(box(0.22, h, proud, w / 2 - 0.3, h / 2, 0));
      parts.push(box(w, 0.22, proud, 0, h - 0.15, 0));
      parts.push(box(w, 0.22, proud, 0, 0.15, 0));
      parts.push(box(w * 0.62, 0.18, proud, 0, h / 2, 0, { rot: [0, 0, 32] }));
      parts.push(box(w * 0.62, 0.18, proud, 0, h / 2, 0, { rot: [0, 0, -32] }));
      return parts;
    }
    case 'wall-wattle': {
      const parts = [box(w, h, d)];
      for (let i = 0; i < 5; i++) {
        parts.push(cyl(0.045, w - 0.2, 0, 0.35 + i * 0.5, d / 2 + 0.05, { rot: [0, 0, 90] }));
      }
      for (const fx of [-0.3, 0.05, 0.4]) {
        parts.push(cyl(0.05, h, fx * w, h / 2, d / 2 + 0.02));
      }
      return parts;
    }
    case 'wall-ice': return [box(w, h, d, 0, h / 2, 0, glassy), box(w * 0.9, 0.14, d + 0.1, 0, h + 0.04, 0)];
    case 'wall-garden':
      return [
        box(w, h, d),
        box(w + 0.1, 0.12, d + 0.12, 0, h + 0.04, 0),
        box(w - 0.3, 0.22, d - 0.05, 0, h + 0.18, 0, foliage),
      ];
    case 'wall-retaining':
      return [
        box(w, h, d),
        wedge(w * 0.24, h * 0.85, 0.5, -w * 0.3, 0, d / 2 + 0.2, { rot: [0, 90, 0] }),
        wedge(w * 0.24, h * 0.85, 0.5, w * 0.3, 0, d / 2 + 0.2, { rot: [0, 90, 0] }),
        box(w + 0.15, 0.14, d + 0.2, 0, h + 0.05, 0),
      ];
    case 'wall-fortified': {
      const parts = wallWithOpening(w, h, d, 0.3, 1.2, 1.0);
      for (let i = 0; i < 5; i++) parts.push(box(0.5, 0.45, d + 0.04, -1.6 + i * 0.8, h + 0.2, 0));
      return parts;
    }
    case 'wall-buttress':
      return [
        wedge(w, h, d * 0.85, 0, 0, 0, { rot: [0, 90, 0] }),
        box(w * 0.8, 0.35, d * 0.5, 0, h + 0.1, -d * 0.22),
      ];
    case 'wall-slat': return slatRun(w, h, d, 9, 0.2);
    case 'wall-mosaic': {
      const parts = [box(w, h, d)];
      parts.push(box(w * 0.62, h * 0.62, 0.06, 0, h / 2, d / 2 + 0.03));
      parts.push(cyl(0.42, 0.07, 0, h / 2, d / 2 + 0.05, { rot: [90, 0, 0] }));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        parts.push(cyl(0.13, 0.07, sx * (w / 2 - 0.45), h / 2 + sy * (h / 2 - 0.45), d / 2 + 0.05, { rot: [90, 0, 0], ...dark }));
      }
      return parts;
    }
    case 'wall-crenel-low': {
      const parts = [box(w, h * 0.72, d, 0, h * 0.36, 0)];
      for (let i = 0; i < 5; i++) parts.push(box(0.5, h * 0.28, d + 0.03, -1.6 + i * 0.8, h * 0.86, 0));
      return parts;
    }
    case 'wall-tall':
      return [box(w, h - 0.25, d, 0, (h - 0.25) / 2, 0), box(w + 0.2, 0.25, d + 0.18, 0, h - 0.12, 0)];
    default:
      // Curved family + the plain wall run (panel, short, long,
      // low, panel-half).
      if (p.id.startsWith('wall-curved')) {
        const step = (p.snap && p.snap.rotation) || 22.5;
        const radius = w / (2 * Math.sin((step * DEG) / 2));
        return [{ shape: 'arcwall', radius, height: h, angleDeg: step, offset: [0, h / 2, 0] }];
      }
      return [box(w, h, d)];
  }
};

const GEN_ROOFS = (p) => {
  const { w, h, d } = p.size;
  const gable = (hh = h) => prism([[-w / 2, 0], [w / 2, 0], [0, hh]], d);
  switch (p.id) {
    case 'roof-gable-low': case 'roof-gable-steep': return [gable()];
    case 'roof-thatch':
      return [
        prism([[-w / 2, 0], [w / 2, 0], [0, h]], d),
        cyl(0.17, d + 0.1, 0, h - 0.02, 0, { rot: [90, 0, 0] }),
        box(w * 0.7, 0.1, d * 0.7, 0, h * 0.45, 0),
      ];
    case 'roof-mansard':
      return [
        prism([[-w / 2, 0], [w / 2, 0], [w * 0.27, h * 0.62], [-w * 0.27, h * 0.62]], d),
        prism([[-w * 0.27, h * 0.62], [w * 0.27, h * 0.62], [w * 0.09, h], [-w * 0.09, h]], d),
      ];
    case 'roof-shed':
      return [prism([[-w / 2, 0], [w / 2, 0], [w / 2, h * 0.42], [-w / 2, h]], d)];
    case 'roof-flat-parapet': {
      const parts = [box(w, 0.22, d, 0, h - 0.11, 0)];
      const pw = 0.18;
      parts.push(box(w, h - 0.2, pw, 0, (h - 0.2) / 2, d / 2 - pw / 2));
      parts.push(box(w, h - 0.2, pw, 0, (h - 0.2) / 2, -d / 2 + pw / 2));
      parts.push(box(pw, h - 0.2, d, w / 2 - pw / 2, (h - 0.2) / 2, 0));
      parts.push(box(pw, h - 0.2, d, -w / 2 + pw / 2, (h - 0.2) / 2, 0));
      return parts;
    }
    case 'roof-clerestory':
      return [
        prism([[-w / 2, 0], [w / 2, 0], [0, h * 0.45]], d),
        box(w * 0.46, h * 0.34, d * 0.62, 0, h * 0.45 + h * 0.17, 0, glassy),
        box(w * 0.56, 0.12, d * 0.72, 0, h * 0.45 + h * 0.34 + 0.06, 0),
        prism([[-w * 0.28, 0], [w * 0.28, 0], [0, h * 0.2]], d * 0.72, { offset: [0, h * 0.45 + h * 0.34 + 0.12, 0] }),
      ];
    case 'roof-barrel':
      return [
        cyl(w / 2, d, 0, 0, 0, { rot: [-90, 0, 0], thetaLength: Math.PI, openEnded: true }),
        box(0.25, 0.3, d, -w / 2 + 0.1, 0.15, 0),
        box(0.25, 0.3, d, w / 2 - 0.1, 0.15, 0),
      ];
    case 'roof-dome-small': return [dome(w / 2, h / (w / 2))];
    case 'roof-dome-grand':
      return [
        disc(w / 2, 0.45, 0, 0.22, 0),
        dome(w / 2 - 0.1, (h - 0.45) / (w / 2 - 0.1), 0, 0.45, 0),
        ball(0.22, 1, 0, h - 0.05, 0),
      ];
    case 'roof-dome-ribbed': {
      const parts = [dome(w / 2, h / (w / 2))];
      parts.push(torus(w / 2, 0.05, 0, 0, 0, { arc: Math.PI }));
      parts.push(torus(w / 2, 0.05, 0, 0, 0, { arc: Math.PI, rot: [0, 90, 0] }));
      return parts;
    }
    case 'roof-spire-short': return [cone(w / 2, h)];
    case 'roof-spire-tall':
      return [
        box(w * 0.8, 0.3, d * 0.8, 0, 0.15, 0),
        cone(w / 2, h - 0.5, 0, (h - 0.5) / 2 + 0.3, 0),
        ball(0.13, 1, 0, h - 0.28, 0, glow),
      ];
    case 'roof-turret':
      return [
        cyl(w / 2, h * 0.55, 0, h * 0.275, 0),
        cone(w / 2 + 0.18, h * 0.45, 0, h * 0.55 + h * 0.225, 0),
      ];
    case 'roof-awning':
      return [
        box(w, 0.07, d + 0.35, 0, h - 0.05, 0.12, { rot: [-16, 0, 0] }),
        box(0.09, h * 0.55, 0.09, -w / 2 + 0.15, h * 0.27, d / 2 - 0.05, { rot: [18, 0, 0] }),
        box(0.09, h * 0.55, 0.09, w / 2 - 0.15, h * 0.27, d / 2 - 0.05, { rot: [18, 0, 0] }),
      ];
    case 'roof-cross-gable':
      return [
        gable(),
        prism([[-d / 2, 0], [d / 2, 0], [0, h]], w, { rot: [0, 90, 0] }),
      ];
    case 'roof-cross-hip': {
      const parts = [pyramid(w, h, d, 0.3)];
      for (const s of [-1, 1]) {
        parts.push(prism([[-0.85, 0], [0.85, 0], [0, 0.75]], 1.1, { offset: [0, h * 0.3, s * (d / 2 - 0.35)] }));
        parts.push(prism([[-0.85, 0], [0.85, 0], [0, 0.75]], 1.1, { offset: [s * (w / 2 - 0.35), h * 0.3, 0], rot: [0, 90, 0] }));
      }
      return parts;
    }
    case 'roof-pagoda': {
      const parts = [];
      const tiers = [[1, 0], [0.72, 0.42], [0.46, 0.78]];
      for (const [s, yf] of tiers) {
        parts.push(pyramid(w * s, h * 0.4, d * s, 0.22, yf * h + h * 0.2, {}));
      }
      parts.push(cone(0.09, 0.5, 0, h + 0.2, 0));
      parts.push(ball(0.09, 1, 0, h + 0.42, 0, glow));
      return parts;
    }
    case 'roof-gazebo': {
      const parts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(cyl(0.06, h * 0.55, Math.sin(a) * (w / 2 - 0.3), h * 0.275, Math.cos(a) * (w / 2 - 0.3)));
      }
      parts.push(cone(w / 2 + 0.25, h * 0.45, 0, h * 0.55 + h * 0.225, 0, { segments: 6 }));
      parts.push(ball(0.11, 1, 0, h + 0.02, 0, glow));
      return parts;
    }
    case 'roof-veranda': {
      const parts = [
        prism([[-w / 2, 0], [w / 2, 0], [w / 2, h * 0.3], [-w / 2, h * 0.62]], d),
      ];
      for (const fx of [-0.42, 0, 0.42]) {
        parts.push(cyl(0.06, h * 0.3, fx * w, h * 0.15, d / 2 - 0.1));
      }
      return parts;
    }
    case 'roof-leaf':
      return [
        dome(w / 2, 0.32, 0, 0.1, 0, foliage),
        cyl(0.07, 0.5, 0, 0.2, -d / 2 + 0.3, { rot: [24, 0, 0], ...foliage }),
      ];
    case 'roof-crystal':
      return [
        pyramid(w, h, d, 0, null, glow),
        cone(w * 0.2, h * 0.5, 0, h + h * 0.2, 0, glow),
      ];
    case 'roof-eave-wide':
      return [
        box(w, 0.14, d, 0, 0.07, 0),
        prism([[-w / 2 + 0.5, 0], [w / 2 - 0.5, 0], [0, h - 0.14]], d - 1),
      ];
    default: return [gable()];
  }
};

const GEN_ACCESS = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'wedge-block': case 'wedge-long': return [wedge(w, h, d)];
    case 'ramp-double':
      return [
        wedge(w / 2 - 0.04, h, d, -w / 4, 0, 0, { rot: [0, 180, 0] }),
        wedge(w / 2 - 0.04, h, d, w / 4, 0, 0),
      ];
    case 'step-block':
      return [box(w, h * 0.5, d), box(w * 0.66, h * 0.5, d * 0.7, 0, h * 0.75, -d * 0.12)];
    case 'step-round':
      return [disc(w / 2, h * 0.5, 0, h * 0.25, 0), disc(w * 0.36, h * 0.5, 0, h * 0.75, 0)];
    case 'stoop': case 'stoop-wide': return stepsRun(w, d, 3, h / 3);
    default: // ramp-short / ramp-long / ramp-wide — the prism ramp
      return [prism([[-d / 2, 0], [d / 2, 0], [-d / 2, h]], w, { rot: [0, 90, 0] })];
  }
};

const GEN_STRUCTURE = (p) => {
  const { w, h, d } = p.size;
  const column = (shaft, cap = true) => {
    const parts = [box(w * 1.25, 0.18, d * 1.25, 0, 0.09, 0)];
    parts.push(shaft);
    if (cap) parts.push(box(w * 1.25, 0.18, d * 1.25, 0, h - 0.09, 0));
    return parts;
  };
  switch (p.id) {
    case 'pillar-short': case 'pillar-tall':
      return column(cyl(0.21, h - 0.36, 0, h / 2, 0));
    case 'pillar-broken':
      return [
        box(w * 1.2, 0.16, d * 1.2, 0, 0.08, 0),
        cyl(0.23, h - 0.15, 0, (h - 0.15) / 2 + 0.12, 0, { rot: [0, 0, 3] }),
        ball(0.2, 0.7, 0.45, 0, 0.3),
      ];
    case 'column-classic':
      return column(cyl(0.27, h - 0.5, 0, h / 2, 0, { segments: 12 }));
    case 'column-ionic': {
      const parts = column(cyl(0.27, h - 0.55, 0, h / 2, 0, { segments: 12 }));
      parts.push(ball(0.13, 1, -0.3, h - 0.32, 0));
      parts.push(ball(0.13, 1, 0.3, h - 0.32, 0));
      return parts;
    }
    case 'column-twisted': {
      const parts = [box(w * 1.25, 0.18, d * 1.25, 0, 0.09, 0), box(w * 1.25, 0.18, d * 1.25, 0, h - 0.09, 0)];
      const segs = 5;
      const sh = (h - 0.36) / segs;
      for (let i = 0; i < segs; i++) {
        parts.push(box(0.42, sh + 0.02, 0.42, 0, 0.18 + sh * (i + 0.5), 0, { rot: [0, i * 24, 0] }));
      }
      return parts;
    }
    case 'column-square':
      return column(box(w * 0.72, h - 0.36, d * 0.72, 0, h / 2, 0));
    case 'column-double': {
      const parts = [box(w, 0.2, d, 0, 0.1, 0), box(w, 0.22, d, 0, h - 0.11, 0)];
      parts.push(cyl(0.24, h - 0.42, -w / 4 - 0.1, h / 2, 0));
      parts.push(cyl(0.24, h - 0.42, w / 4 + 0.1, h / 2, 0));
      return parts;
    }
    case 'column-broken-tall':
      return [
        box(w * 1.25, 0.18, d * 1.25, 0, 0.09, 0),
        cyl(0.27, h * 0.72, 0, h * 0.36 + 0.15, 0),
        cyl(0.25, h * 0.3, 0.28, h * 0.72 + 0.3, 0.1, { rot: [0, 0, -24] }),
        ball(0.22, 0.65, -0.5, 0, 0.42),
      ];
    case 'beam-cross':
      return [box(w, h, 0.3), box(0.3, h, d)];
    case 'beam-t':
      return [box(0.32, h - 0.35, 0.32, 0, (h - 0.35) / 2, 0), box(w, 0.35, d, 0, h - 0.175, 0)];
    case 'beam-corner-brace':
      return [
        box(0.28, h, 0.28, -w / 2 + 0.2, h / 2, 0),
        box(w, 0.28, 0.28, 0, h - 0.14, 0),
        box(w * 0.78, 0.2, 0.24, -w * 0.18, h * 0.52, 0, { rot: [0, 0, 45] }),
      ];
    case 'truss': {
      const parts = [box(w, 0.16, d, 0, 0.08, 0), box(w, 0.16, d, 0, h - 0.08, 0)];
      parts.push(box(w * 0.42, 0.12, d * 0.8, -w * 0.22, h / 2, 0, { rot: [0, 0, 38] }));
      parts.push(box(w * 0.42, 0.12, d * 0.8, w * 0.22, h / 2, 0, { rot: [0, 0, -38] }));
      parts.push(box(0.12, h - 0.3, d * 0.8, 0, h / 2, 0));
      return parts;
    }
    case 'truss-arch': {
      const parts = [box(w, 0.16, d, 0, 0.08, 0)];
      parts.push(prism(archBandProfile(h - 0.25, h - 0.43, 0.12, 12), d));
      parts.push(box(0.14, h * 0.55, d * 0.8, 0, h * 0.32, 0));
      parts.push(box(0.14, h * 0.55, d * 0.8, -w * 0.3, h * 0.32, 0));
      parts.push(box(0.14, h * 0.55, d * 0.8, w * 0.3, h * 0.32, 0));
      return parts;
    }
    case 'corbel':
      return [
        box(w, h * 0.34, d, 0, h * 0.17, 0),
        box(w * 1.2, h * 0.33, d * 1.35, 0, h * 0.5, d * 0.16),
        box(w * 1.4, h * 0.33, d * 1.7, 0, h * 0.83, d * 0.32),
      ];
    case 'capital-block':
      return [
        box(w * 0.7, 0.14, d * 0.7, 0, 0.07, 0),
        pyramid(w, h - 0.28, d, 0.55, null, { rot: [0, 0, 180] }),
        box(w * 1.12, 0.14, d * 1.12, 0, h - 0.07, 0),
      ];
    case 'architrave':
      return [box(w, h * 0.55, d, 0, h * 0.72, 0), box(w * 0.96, h * 0.45, d * 0.8, 0, h * 0.22, 0)];
    case 'post': return [box(w, h, d)];
    case 'post-braced': {
      const parts = [
        box(0.3, h, 0.3),
        box(w * 0.8, 0.18, d * 0.8, 0, 0.09, 0),
      ];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(box(0.12, h * 0.52, 0.12, sx * w * 0.26, h * 0.24, sz * d * 0.26,
          { rot: [sz * 38, 0, -sx * 38] }));
      }
      return parts;
    }
    case 'frame-portal':
      return [
        box(0.26, h, 0.3, -w / 2 + 0.2, h / 2, 0),
        box(0.26, h, 0.3, w / 2 - 0.2, h / 2, 0),
        box(w, 0.3, d, 0, h - 0.15, 0),
        box(0.7, 0.16, 0.26, -w / 2 + 0.55, h - 0.55, 0, { rot: [0, 0, -45] }),
        box(0.7, 0.16, 0.26, w / 2 - 0.55, h - 0.55, 0, { rot: [0, 0, 45] }),
      ];
    case 'buttress-flying':
      return [
        box(0.5, h, d, w / 2 - 0.25, h / 2, 0),
        box(0.55, 0.3, d, w / 2 - 0.27, h + 0.1, 0),
        box(w * 0.78, 0.22, d * 0.7, w * 0.1, h * 0.68, 0, { rot: [0, 0, 38] }),
        box(w * 0.4, 0.24, d * 0.7, -w / 2 + w * 0.2, h - 0.12, 0),
      ];
    case 'joist-row': {
      const parts = [
        box(w, 0.24, 0.24, 0, 0.12, -d / 2 + 0.15),
        box(w, 0.24, 0.24, 0, 0.12, d / 2 - 0.15),
      ];
      for (let i = 0; i < 5; i++) parts.push(box(0.2, h, d - 0.2, -w / 2 + 0.4 + i * ((w - 0.8) / 4), h / 2 + 0.05, 0));
      return parts;
    }
    case 'girder-iron':
      return [
        box(w, 0.14, d, 0, 0.07, 0),
        box(w, h - 0.28, d * 0.36, 0, h / 2, 0),
        box(w, 0.14, d, 0, h - 0.07, 0),
      ];
    case 'scaffolding': {
      const parts = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(box(0.12, h, 0.12, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1)));
      }
      parts.push(box(w, 0.1, d, 0, h * 0.52, 0));
      parts.push(box(w, 0.1, d, 0, h - 0.05, 0));
      parts.push(box(w * 0.9, 0.1, 0.1, 0, h * 0.5, d / 2 - 0.1, { rot: [0, 0, 40] }));
      parts.push(box(w * 0.9, 0.1, 0.1, 0, h * 0.5, -d / 2 + 0.1, { rot: [0, 0, -40] }));
      return parts;
    }
    case 'hoist-frame':
      return [
        box(0.18, h, 0.18, -0.5, h / 2, 0, { rot: [0, 0, 18] }),
        box(0.18, h, 0.18, 0.5, h / 2, 0, { rot: [0, 0, -18] }),
        box(w * 0.7, 0.16, 0.16, 0, h * 0.45, 0),
        cyl(0.03, 0.5, 0, h - 0.45, 0),
        ball(0.09, 1, 0, h - 0.75, 0, dark),
        box(w, 0.14, d * 0.6, 0, 0.07, 0),
      ];
    case 'trellis-panel': return latticePanel(w, h, d, 0, null, 0, 0.07);
    case 'pergola': {
      const parts = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(box(0.16, h, 0.16, sx * (w / 2 - 0.15), h / 2, sz * (d / 2 - 0.15)));
      }
      parts.push(box(w, 0.16, 0.2, 0, h - 0.08, -d / 2 + 0.15));
      parts.push(box(w, 0.16, 0.2, 0, h - 0.08, d / 2 - 0.15));
      for (let i = 0; i < 5; i++) {
        parts.push(box(0.14, 0.12, d + 0.3, -w / 2 + 0.3 + i * ((w - 0.6) / 4), h + 0.04, 0));
      }
      return parts;
    }
    default: return [box(w, h, d)]; // beam-short and friends
  }
};

const GEN_FITTINGS = (p) => {
  const { w, h, d } = p.size;
  const knob = (x, y, z = 0.1) => ball(0.055, 1, x, y, z, dark);
  switch (p.id) {
    case 'door-arch':
      return [
        prism(archTopProfile(w, h - w / 2), d),
        knob(w / 2 - 0.22, h * 0.45),
      ];
    case 'door-round':
      return [
        cyl(w / 2, d, 0, h / 2, 0, { rot: [90, 0, 0] }),
        ball(0.09, 1, 0, h / 2, d / 2 + 0.03, dark),
      ];
    case 'door-sliding':
      return [
        box(w / 2 + 0.1, h, d, -w / 4 + 0.04, h / 2, -d * 0.4),
        box(w / 2 + 0.1, h, d, w / 4 - 0.04, h / 2, d * 0.4),
        box(w + 0.2, 0.09, 0.09, 0, h + 0.03, 0, dark),
        knob(-0.12, h / 2, d + 0.03), knob(0.12, h / 2, -d - 0.02),
      ];
    case 'door-glass':
      return [
        box(w, 0.14, d, 0, h - 0.07, 0), box(w, 0.14, d, 0, 0.07, 0),
        box(0.14, h, d, -w / 2 + 0.07, h / 2, 0), box(0.14, h, d, w / 2 - 0.07, h / 2, 0),
        box(w - 0.2, h - 0.2, d * 0.5, 0, h / 2, 0, glassy),
        knob(w / 2 - 0.24, h / 2, 0.1),
      ];
    case 'door-trap':
      return [
        box(w, h, d),
        torus(0.2, 0.035, 0, h + 0.02, 0, { rot: [90, 0, 0], ...dark }),
        box(w * 0.7, 0.03, 0.08, 0, h + 0.01, -d * 0.2, dark),
      ];
    case 'door-half':
      return [
        box(w, h, d),
        box(w * 0.8, 0.1, d + 0.03, 0, h / 2, 0, { rot: [0, 0, 24] }),
        box(w * 0.8, 0.1, d + 0.03, 0, h / 2, 0, { rot: [0, 0, -24] }),
        knob(w / 2 - 0.2, h * 0.55),
      ];
    case 'door-secret': {
      const parts = [box(w, h, d)];
      for (let i = 0; i < 3; i++) {
        parts.push(box(w - 0.16, 0.07, 0.06, 0, 0.55 + i * 0.62, d / 2 + 0.03));
        parts.push(box(0.3, 0.42, 0.09, -0.35 + (i % 2) * 0.55, 0.32 + i * 0.62, d / 2 + 0.04, dark));
      }
      return parts;
    }
    case 'window-tall': case 'window-cross': {
      const parts = [
        box(w, h, d * 0.5, 0, h / 2, 0, glassy),
        box(w, 0.1, d, 0, 0.05, 0), box(w, 0.1, d, 0, h - 0.05, 0),
        box(0.1, h, d, -w / 2 + 0.05, h / 2, 0), box(0.1, h, d, w / 2 - 0.05, h / 2, 0),
        box(0.07, h, d * 0.8, 0, h / 2, 0),
      ];
      if (p.id === 'window-cross') parts.push(box(w, 0.07, d * 0.8, 0, h / 2, 0));
      return parts;
    }
    case 'window-round':
      return [
        torus(w / 2 - 0.04, 0.07, 0, h / 2, 0),
        cyl(w / 2 - 0.1, d * 0.6, 0, h / 2, 0, { rot: [90, 0, 0], ...glassy }),
        box(0.06, h - 0.2, d * 0.7, 0, h / 2, 0),
        box(w - 0.2, 0.06, d * 0.7, 0, h / 2, 0),
      ];
    case 'window-shutters': {
      const parts = [
        box(w * 0.55, h, d * 0.5, 0, h / 2, 0, glassy),
        box(w * 0.62, 0.1, d, 0, h - 0.05, 0), box(w * 0.62, 0.1, d, 0, 0.05, 0),
        box(0.5, h - 0.1, 0.05, -w / 2 + 0.22, h / 2, 0.08, { rot: [0, 24, 0] }),
        box(0.5, h - 0.1, 0.05, w / 2 - 0.22, h / 2, 0.08, { rot: [0, -24, 0] }),
      ];
      return parts;
    }
    case 'window-diamond':
      return [
        box(w, 0.1, d, 0, h - 0.05, 0), box(w, 0.1, d, 0, 0.05, 0),
        box(0.1, h, d, -w / 2 + 0.05, h / 2, 0), box(0.1, h, d, w / 2 - 0.05, h / 2, 0),
        box(w * 0.52, w * 0.52, d * 0.5, 0, h / 2, 0, { rot: [0, 0, 45], ...glassy }),
      ];
    case 'window-box':
      return [
        box(w, 0.14, d, 0, 0.07, 0),
        box(w, 0.14, d, 0, h - 0.07, 0),
        box(w - 0.16, h - 0.2, 0.06, 0, h / 2, d / 2 - 0.03, glassy),
        box(0.06, h - 0.2, d - 0.1, -w / 2 + 0.03, h / 2, 0, glassy),
        box(0.06, h - 0.2, d - 0.1, w / 2 - 0.03, h / 2, 0, glassy),
        box(w * 0.7, 0.25, d * 0.7, 0, 0.2, 0, foliage),
      ];
    case 'window-bay-tall':
      return [
        box(1.3, h - 0.3, 0.07, 0, h / 2, 0.28, glassy),
        box(0.95, h - 0.3, 0.07, -0.95, h / 2, 0.12, { rot: [0, 42, 0], ...glassy }),
        box(0.95, h - 0.3, 0.07, 0.95, h / 2, 0.12, { rot: [0, -42, 0], ...glassy }),
        box(w, 0.14, 0.7, 0, h - 0.07, 0.05),
        box(w, 0.14, 0.7, 0, 0.07, 0.05),
        prism([[-w / 2, 0], [w / 2, 0], [0, 0.4]], 0.75, { offset: [0, h, 0.05] }),
      ];
    case 'gate-single': {
      const parts = [
        box(w, 0.11, d, 0, h - 0.25, 0),
        box(w, 0.11, d, 0, 0.3, 0),
        box(w * 0.85, 0.1, d, 0, h / 2, 0, { rot: [0, 0, 26] }),
      ];
      for (let i = 0; i < 5; i++) parts.push(box(0.09, h - 0.2, d * 0.8, -w / 2 + 0.25 + i * ((w - 0.5) / 4), h / 2, 0));
      return parts;
    }
    case 'gate-garden': {
      const parts = [
        box(w, 0.08, d, 0, h * 0.72, 0),
        box(w, 0.08, d, 0, h * 0.3, 0),
      ];
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 0.2 + i * ((w - 0.4) / 3);
        parts.push(box(0.15, h, d * 0.8, x, h / 2, 0));
        parts.push(pyramid(0.15, 0.14, d * 0.8, 0, h + 0.05, { offset: [x, h + 0.05, 0] }));
      }
      return parts;
    }
    case 'hatch-round':
      return [
        disc(w / 2, h),
        torus(0.22, 0.035, 0, h + 0.02, 0, { rot: [90, 0, 0], ...dark }),
      ];
    case 'portcullis-small': {
      const parts = [box(w, 0.14, d, 0, h - 0.07, 0)];
      for (let i = 0; i < 5; i++) parts.push(box(0.08, h, d * 0.7, -w / 2 + 0.25 + i * ((w - 0.5) / 4), h / 2, 0));
      for (let i = 0; i < 3; i++) parts.push(box(w, 0.08, d * 0.7, 0, 0.35 + i * 0.75, 0));
      return parts;
    }
    case 'bars-window': {
      const parts = [
        box(w, 0.1, d, 0, h - 0.05, 0), box(w, 0.1, d, 0, 0.05, 0),
        box(0.1, h, d, -w / 2 + 0.05, h / 2, 0), box(0.1, h, d, w / 2 - 0.05, h / 2, 0),
      ];
      for (let i = 0; i < 4; i++) parts.push(cyl(0.035, h - 0.16, -w / 2 + 0.35 + i * ((w - 0.7) / 3), h / 2, 0, dark));
      return parts;
    }
    case 'curtain-panel': {
      const parts = [cyl(0.035, w + 0.3, 0, h + 0.02, 0, { rot: [0, 0, 90] })];
      parts.push(ball(0.06, 1, -w / 2 - 0.18, h + 0.02, 0, dark));
      parts.push(ball(0.06, 1, w / 2 + 0.18, h + 0.02, 0, dark));
      for (const fx of [-0.28, 0, 0.28]) {
        parts.push(cyl(w * 0.17, h, fx * w, h / 2, 0, { thetaLength: Math.PI }));
      }
      return parts;
    }
    case 'sign-board':
      return [
        box(w * 0.8, 0.1, 0.1, 0, h + 0.12, 0),
        box(w, h - 0.15, d, 0, (h - 0.15) / 2, 0),
        torus(0.07, 0.02, -w * 0.3, h + 0.02, 0, dark),
        torus(0.07, 0.02, w * 0.3, h + 0.02, 0, dark),
      ];
    case 'shutters-pair': {
      const parts = [];
      for (const s of [-1, 1]) {
        parts.push(box(w / 2 - 0.04, h, d, s * w / 4, h / 2, 0));
        for (let i = 0; i < 3; i++) {
          parts.push(box(w / 2 - 0.2, 0.09, d + 0.03, s * w / 4, 0.3 + i * 0.42, 0, { rot: [28, 0, 0] }));
        }
      }
      return parts;
    }
    default: return [box(w, h, d)];
  }
};

const GEN_SPANS = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'bridge-suspension': {
      const parts = [box(w, 0.18, d, 0, 0.55, 0)];
      for (const sx of [-1, 1]) {
        parts.push(box(0.35, h, 0.35, sx * (w / 2 - 0.6), h / 2, -d / 2 + 0.3));
        parts.push(box(0.35, h, 0.35, sx * (w / 2 - 0.6), h / 2, d / 2 - 0.3));
        parts.push(box(0.35, 0.35, d, sx * (w / 2 - 0.6), h - 0.4, 0));
      }
      parts.push(sagArc(w - 1.2, h - 1.35, h - 0.55, 0.045, 0));
      parts.push(sagArc(w - 1.2, h - 1.35, h - 0.55, 0.045, 0));
      parts[parts.length - 1].offset[2] = d / 2 - 0.3;
      parts[parts.length - 2].offset[2] = -d / 2 + 0.3;
      for (const fx of [-0.25, 0, 0.25]) {
        parts.push(box(0.05, h - 1.1, 0.05, fx * w, (h - 0.55) / 2 + 0.28, -d / 2 + 0.3));
        parts.push(box(0.05, h - 1.1, 0.05, fx * w, (h - 0.55) / 2 + 0.28, d / 2 - 0.3));
      }
      return parts;
    }
    case 'drawbridge': {
      const parts = [
        box(w * 0.3, 0.22, d, -w / 2 + w * 0.15, 0.35, 0),
        box(w * 0.62, 0.16, d, w * 0.1, 1.15, 0, { rot: [0, 0, 24] }),
        box(0.3, h + 0.5, 0.3, -w * 0.08, (h + 0.5) / 2, -d / 2 + 0.2),
        box(0.3, h + 0.5, 0.3, -w * 0.08, (h + 0.5) / 2, d / 2 - 0.2),
        box(0.06, 1.5, 0.06, w * 0.28, 1.9, -d / 2 + 0.2, { rot: [0, 0, -32] }),
        box(0.06, 1.5, 0.06, w * 0.28, 1.9, d / 2 - 0.2, { rot: [0, 0, -32] }),
      ];
      return parts;
    }
    case 'bridge-foot': {
      const parts = [];
      for (let i = 0; i < 5; i++) parts.push(box(w / 5 - 0.06, 0.12, d, -w / 2 + (w / 5) * (i + 0.5), 0.3, 0));
      parts.push(box(w, 0.09, 0.09, 0, 0.62, d / 2 - 0.06));
      parts.push(box(w, 0.09, 0.09, 0, 0.62, -d / 2 + 0.06));
      for (const sx of [-1, 1]) parts.push(cyl(0.08, 0.35, sx * (w / 2 - 0.4), 0.12, 0));
      return parts;
    }
    case 'bridge-arch-double':
      return [
        box(w, 0.32, d, 0, h - 0.16, 0),
        box(0.9, h - 0.3, d, -w / 2 + 0.5, (h - 0.3) / 2, 0),
        box(0.9, h - 0.3, d, w / 2 - 0.5, (h - 0.3) / 2, 0),
        box(0.7, h - 0.3, d, 0, (h - 0.3) / 2, 0),
        prism(archBandProfile(1.85, 1.45, -0.55, 8), d + 0.03, { offset: [-w / 4 - 0.12, 0, 0] }),
        prism(archBandProfile(1.85, 1.45, -0.55, 8), d + 0.03, { offset: [w / 4 + 0.12, 0, 0] }),
      ];
    case 'bridge-covered': {
      const parts = [box(w, 0.2, d, 0, 0.3, 0)];
      for (const fx of [-0.42, -0.14, 0.14, 0.42]) {
        parts.push(box(0.16, 1.9, 0.16, fx * w, 1.25, -d / 2 + 0.15));
        parts.push(box(0.16, 1.9, 0.16, fx * w, 1.25, d / 2 - 0.15));
      }
      parts.push(box(w, 0.5, 0.1, 0, 0.85, -d / 2 + 0.05));
      parts.push(box(w, 0.5, 0.1, 0, 0.85, d / 2 - 0.05));
      parts.push(prism([[-w / 2 - 0.2, 0], [w / 2 + 0.2, 0], [0, 1.15]], d + 0.5, { offset: [0, 2.2, 0] }));
      return parts;
    }
    case 'aqueduct': {
      const parts = [
        box(w, 0.5, d, 0, h - 0.25, 0),
        box(w - 0.3, 0.3, d - 0.35, 0, h - 0.42, 0, watery),
      ];
      for (const fx of [-0.38, 0, 0.38]) {
        parts.push(box(0.55, h - 0.5, d * 0.8, fx * w, (h - 0.5) / 2, 0));
      }
      parts.push(prism(archBandProfile(1.6, 1.25, 0.35, 8), d * 0.85, { offset: [-w * 0.19, 0, 0] }));
      parts.push(prism(archBandProfile(1.6, 1.25, 0.35, 8), d * 0.85, { offset: [w * 0.19, 0, 0] }));
      return parts;
    }
    case 'sky-bridge':
      return [
        box(w, h * 0.5, d, 0, h * 0.45, 0, glassy),
        box(w, 0.07, 0.1, 0, h * 0.75, d / 2 - 0.06, glow),
        box(w, 0.07, 0.1, 0, h * 0.75, -d / 2 + 0.06, glow),
        box(0.5, h * 0.9, d * 0.7, -w / 2 + 0.25, h * 0.45, 0),
        box(0.5, h * 0.9, d * 0.7, w / 2 - 0.25, h * 0.45, 0),
      ];
    case 'log-bridge': {
      const parts = [];
      for (const fz of [-0.3, 0, 0.3]) {
        parts.push(cyl(0.16, w, 0, 0.3, fz, { rot: [0, 0, 90] }));
      }
      parts.push(cyl(0.035, w - 0.3, 0, 0.85, -d / 2 + 0.05, { rot: [0, 0, 90] }));
      for (const sx of [-1, 1]) parts.push(cyl(0.05, 0.9, sx * (w / 2 - 0.3), 0.45, -d / 2 + 0.05));
      return parts;
    }
    case 'arch-triumphal':
      return [
        box(1.1, 3.1, d, -(w / 2 - 0.65), 1.55, 0),
        box(1.1, 3.1, d, w / 2 - 0.65, 1.55, 0),
        prism(archBandProfile(2.3, 1.7, 1.55, 10), d + 0.04),
        box(w, 0.55, d + 0.15, 0, 3.85, 0),
        box(w * 0.7, 0.65, d * 0.9, 0, 4.45, 0),
      ];
    case 'arch-double': case 'arch-arcade': {
      const n = p.id === 'arch-double' ? 2 : 3;
      const parts = [box(w, 0.5, d, 0, h - 0.25, 0)];
      const bay = w / n;
      for (let i = 0; i <= n; i++) {
        parts.push(box(0.42, h - 0.5, d, -w / 2 + i * bay + (i === 0 ? 0.21 : i === n ? -0.21 : 0), (h - 0.5) / 2, 0));
      }
      const rOut = bay / 2 + 0.05;
      for (let i = 0; i < n; i++) {
        parts.push(prism(archBandProfile(rOut, rOut - 0.42, h - 0.5 - rOut, 8), d + 0.03,
          { offset: [-w / 2 + bay * (i + 0.5), 0, 0] }));
      }
      return parts;
    }
    case 'beam-causeway':
      return [
        box(w, h * 0.6, d, 0, h * 0.3, 0),
        box(w, 0.12, 0.25, 0, h * 0.66, d / 2 - 0.12),
        box(w, 0.12, 0.25, 0, h * 0.66, -d / 2 + 0.12),
        box(0.5, h * 0.4, d * 0.7, -w / 4, h * 0.2, 0),
        box(0.5, h * 0.4, d * 0.7, w / 4, h * 0.2, 0),
      ];
    default: return [box(w, h * 0.4, d, 0, h * 0.2, 0)];
  }
};

const GEN_CLIMB = (p) => {
  const { w, h, d } = p.size;
  const ladderOf = (railW, rungN, rungR = 0.03) => {
    const parts = [
      box(0.07, h, 0.07, -railW / 2, h / 2, 0),
      box(0.07, h, 0.07, railW / 2, h / 2, 0),
    ];
    for (let i = 0; i < rungN; i++) {
      parts.push(cyl(rungR, railW, 0, 0.3 + i * ((h - 0.6) / Math.max(1, rungN - 1)), 0, { rot: [0, 0, 90] }));
    }
    return parts;
  };
  switch (p.id) {
    case 'stairs-wide': case 'stairs-narrow': return stepsRun(w, d, 8, h / 8);
    case 'stairs-half-flight': return stepsRun(w, d, 4, h / 4);
    case 'stairs-stone-flight': return stepsRun(w, d, 6, h / 6);
    case 'stairs-u': {
      const parts = stepsRun(w / 2 - 0.1, d * 0.44, 4, h / 8, -w / 4, -d / 2);
      parts.push(box(w, h / 2, d * 0.5, 0, h / 4, d * 0.19));
      const stepD = (d * 0.44) / 4;
      for (let i = 0; i < 4; i++) {
        const hh = h / 2 + (h / 8) * (i + 1);
        parts.push(box(w / 2 - 0.1, hh, stepD, w / 4, hh / 2, d / 2 - d * 0.14 - stepD * (i + 0.5)));
      }
      return parts;
    }
    case 'stairs-corner': {
      const parts = stepsRun(w * 0.5, d * 0.6, 3, h / 6, -w / 4, -d / 2);
      parts.push(box(w * 0.5, h / 2, d * 0.4, -w / 4, h / 4, d * 0.3));
      for (let i = 0; i < 3; i++) {
        const hh = h / 2 + (h / 6) * (i + 1);
        parts.push(box(w * 0.16, hh, d * 0.4, w * 0.02 + i * w * 0.16, hh / 2, d * 0.3));
      }
      return parts;
    }
    case 'stairs-terrace': {
      const parts = [];
      let y = 0;
      for (let t = 0; t < 3; t++) {
        parts.push(box(w, h / 6, d * 0.22, 0, y + h / 12, -d / 2 + d * 0.11 + t * d * 0.3));
        parts.push(box(w, h / 6, d * 0.3, 0, y + h / 6 + h / 12, -d / 2 + d * 0.26 + t * d * 0.3));
        y += h / 3;
      }
      return parts;
    }
    case 'ladder-tall': return ladderOf(w - 0.15, 13);
    case 'ladder-rope': {
      const parts = [
        cyl(0.03, h, -w / 2 + 0.08, h / 2, 0),
        cyl(0.03, h, w / 2 - 0.08, h / 2, 0),
      ];
      for (let i = 0; i < 6; i++) parts.push(box(w - 0.14, 0.07, 0.12, 0, 0.28 + i * ((h - 0.55) / 5), 0));
      return parts;
    }
    case 'ladder-ship': {
      const parts = [
        box(0.08, h + 0.4, 0.08, -w / 2 + 0.1, h / 2, 0, { rot: [18, 0, 0] }),
        box(0.08, h + 0.4, 0.08, w / 2 - 0.1, h / 2, 0, { rot: [18, 0, 0] }),
      ];
      for (let i = 0; i < 6; i++) {
        parts.push(cyl(0.03, w - 0.2, 0, 0.3 + i * ((h - 0.6) / 5), 0.1 - i * 0.045, { rot: [0, 0, 90] }));
      }
      parts.push(box(w, 0.1, d * 0.5, 0, 0.05, -d * 0.2));
      return parts;
    }
    case 'steps-garden': {
      const parts = stepsRun(w, d, 3, h / 3);
      parts.push(box(0.35, h * 0.8, d, -w / 2 - 0.1, h * 0.4, 0));
      parts.push(box(0.35, h * 0.8, d, w / 2 + 0.1, h * 0.4, 0));
      return parts;
    }
    case 'elevator-shaft': {
      const parts = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(box(0.14, h, 0.14, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1)));
      }
      parts.push(box(w, 0.25, d, 0, h - 0.12, 0));
      parts.push(box(w - 0.25, h - 0.6, d - 0.25, 0, (h - 0.6) / 2 + 0.2, 0, glassy));
      parts.push(box(0.09, h - 0.8, 0.09, 0, h / 2, d / 2 - 0.02, glow));
      parts.push(box(w - 0.5, 0.35, d - 0.5, 0, 0.35, 0, dark));
      return parts;
    }
    case 'climbing-rungs': {
      const parts = [cyl(0.045, h, 0, h / 2, 0)];
      for (let i = 0; i < 6; i++) {
        parts.push(torus(0.19, 0.028, 0, 0.35 + i * ((h - 0.7) / 5), 0.1, { arc: Math.PI, rot: [90, 0, 0] }));
      }
      return parts;
    }
    case 'climb-net': {
      const parts = [
        box(0.09, h, 0.09, -w / 2 + 0.06, h / 2, 0),
        box(0.09, h, 0.09, w / 2 - 0.06, h / 2, 0),
        box(w, 0.09, 0.09, 0, h - 0.05, 0),
      ];
      const diag = Math.hypot(w, h) * 0.72;
      const ang = Math.atan2(h, w) / DEG;
      for (const s of [-1, 1]) for (const off of [-0.3, 0, 0.3]) {
        parts.push(box(diag, 0.045, 0.045, off * h * s * 0.4, h / 2 + off * w * 0.4, 0, { rot: [0, 0, s * ang] }));
      }
      return parts;
    }
    default: return stepsRun(w, d, 5, h / 5);
  }
};

const GEN_WATER = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'water-channel':
      return [
        box(w, 0.14, d, 0, 0.07, 0),
        box(0.22, h, d, -w / 2 + 0.11, h / 2, 0),
        box(0.22, h, d, w / 2 - 0.11, h / 2, 0),
        box(w - 0.4, 0.1, d - 0.15, 0, h - 0.12, 0, watery),
      ];
    case 'pool-rim-round':
      return [
        cyl(w / 2, h, 0, h / 2, 0, { openEnded: true }),
        disc(w / 2 - 0.18, 0.1, 0, h - 0.16, 0, watery),
        torus(w / 2 - 0.02, 0.07, 0, h, 0, { rot: [90, 0, 0] }),
        disc(w / 2, 0.08, 0, 0.04, 0),
      ];
    case 'pool-rim-square': {
      const parts = [
        box(w, h, 0.3, 0, h / 2, d / 2 - 0.15), box(w, h, 0.3, 0, h / 2, -d / 2 + 0.15),
        box(0.3, h, d - 0.6, w / 2 - 0.15, h / 2, 0), box(0.3, h, d - 0.6, -w / 2 + 0.15, h / 2, 0),
        box(w - 0.5, 0.1, d - 0.5, 0, h - 0.14, 0, watery),
        box(w, 0.08, d, 0, 0.04, 0),
      ];
      return parts;
    }
    case 'waterfall-lip':
      return [
        box(w, h * 0.7, d, 0, h * 0.35, -0.1),
        ball(0.42, 0.7, -w / 2 + 0.2, 0, 0.25),
        ball(0.36, 0.65, w / 2 - 0.15, 0, 0.3),
        box(w * 0.55, h * 0.95, 0.1, 0, h * 0.45, d / 2 + 0.12, { rot: [10, 0, 0], ...watery }),
        box(w * 0.7, 0.12, 0.5, 0, 0.05, d / 2 + 0.25, watery),
      ];
    case 'fountain-jet':
      return [
        disc(w / 2, 0.22, 0, 0.11, 0),
        disc(w / 2 - 0.15, 0.08, 0, 0.2, 0, watery),
        cyl(0.09, h * 0.55, 0, h * 0.3, 0),
        cone(0.2, h * 0.5, 0, h * 0.55 + h * 0.25, 0, { rot: [180, 0, 0], ...watery }),
        ball(0.13, 0.8, 0, h + 0.02, 0, watery),
      ];
    case 'dock-posts': {
      const parts = [box(w, 0.12, 0.3, 0, h - 0.2, 0)];
      for (const fx of [-0.42, 0, 0.42]) {
        parts.push(cyl(0.09, h, fx * w, h / 2, 0));
        parts.push(ball(0.11, 0.7, fx * w, h + 0.02, 0));
      }
      return parts;
    }
    case 'dock-wide': {
      const parts = [];
      for (let i = 0; i < 7; i++) parts.push(box(w / 7 - 0.05, 0.14, d, -w / 2 + (w / 7) * (i + 0.5), h - 0.07, 0));
      for (const fx of [-0.44, 0, 0.44]) for (const fz of [-1, 1]) {
        parts.push(cyl(0.1, h - 0.1, fx * w, (h - 0.1) / 2, fz * (d / 2 - 0.3)));
      }
      return parts;
    }
    case 'dock-ladder': {
      const parts = [
        box(0.07, h, 0.07, -w / 2 + 0.08, h / 2, 0),
        box(0.07, h, 0.07, w / 2 - 0.08, h / 2, 0),
      ];
      for (let i = 0; i < 4; i++) parts.push(box(w - 0.14, 0.06, 0.06, 0, 0.25 + i * ((h - 0.5) / 3), 0));
      parts.push(box(w, 0.09, d, 0, h - 0.02, 0));
      return parts;
    }
    case 'railing-rope': {
      const parts = [];
      for (const fx of [-0.48, 0, 0.48]) parts.push(cyl(0.055, h, fx * w, h / 2, 0));
      for (const cxx of [-w / 4, w / 4]) {
        parts.push(sagArc(w / 2, 0.16, h - 0.05, 0.03, cxx));
      }
      return parts;
    }
    case 'fence-lattice': return latticePanel(w, h, d, 0, null, 0, 0.055);
    case 'fence-stone':
      return [
        box(w, h - 0.15, d, 0, (h - 0.15) / 2, 0),
        box(w + 0.1, 0.15, d + 0.12, 0, h - 0.07, 0),
        box(0.4, h + 0.12, d + 0.1, -w / 2 + 0.2, (h + 0.12) / 2, 0),
        box(0.4, h + 0.12, d + 0.1, w / 2 - 0.2, (h + 0.12) / 2, 0),
      ];
    case 'fence-chain': {
      const parts = [];
      for (const fx of [-0.48, 0, 0.48]) {
        parts.push(cyl(0.05, h, fx * w, h / 2, 0, dark));
        parts.push(ball(0.07, 1, fx * w, h + 0.03, 0, dark));
      }
      for (const cxx of [-w / 4, w / 4]) {
        parts.push(sagArc(w / 2, 0.14, h - 0.02, 0.022, cxx, dark));
      }
      return parts;
    }
    case 'mooring-ring':
      return [
        box(w, h * 0.8, d, 0, h * 0.4, 0),
        torus(0.17, 0.04, 0, h * 0.92, d / 2 + 0.03, dark),
        box(w + 0.15, 0.12, d + 0.15, 0, h * 0.84, 0),
      ];
    case 'water-trough':
      return [
        box(w, 0.12, d, 0, 0.06, 0),
        box(w, h, 0.1, 0, h / 2, d / 2 - 0.05), box(w, h, 0.1, 0, h / 2, -d / 2 + 0.05),
        box(0.1, h, d - 0.2, w / 2 - 0.05, h / 2, 0), box(0.1, h, d - 0.2, -w / 2 + 0.05, h / 2, 0),
        box(w - 0.2, 0.08, d - 0.2, 0, h - 0.1, 0, watery),
      ];
    case 'stepping-stones': {
      const parts = [];
      const spots = [[-0.4, -0.2], [-0.14, 0.22], [0.14, -0.18], [0.4, 0.15]];
      for (const [fx, fz] of spots) {
        parts.push(disc(0.42, h, fx * w, h / 2, fz));
      }
      return parts;
    }
    case 'buoy':
      return [
        cone(0.3, 0.35, 0, 0.17, 0, { rot: [180, 0, 0] }),
        ball(0.34, 0.85, 0, 0.5, 0),
        cyl(0.045, 0.35, 0, 0.85, 0),
        ball(0.11, 1, 0, 1.05, 0, glow),
      ];
    default: return [box(w, h, d)];
  }
};

const GEN_LIFE = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'well':
      return [
        cyl(w / 2, 0.95, 0, 0.47, 0, { openEnded: true }),
        disc(w / 2 - 0.12, 0.07, 0, 0.35, 0, watery),
        torus(w / 2, 0.06, 0, 0.97, 0, { rot: [90, 0, 0] }),
        box(0.14, h - 0.6, 0.14, -w / 2 + 0.15, (h - 0.6) / 2 + 0.5, 0),
        box(0.14, h - 0.6, 0.14, w / 2 - 0.15, (h - 0.6) / 2 + 0.5, 0),
        cyl(0.05, w - 0.2, 0, h - 0.35, 0, { rot: [0, 0, 90] }),
        prism([[-w / 2 - 0.15, 0], [w / 2 + 0.15, 0], [0, 0.5]], d * 0.7, { offset: [0, h - 0.28, 0] }),
        box(0.3, 0.28, 0.3, 0, 0.75, 0, dark),
      ];
    case 'cart':
      return [
        box(w, 0.14, d, 0, 0.62, 0),
        box(w, 0.3, 0.1, 0, 0.82, d / 2 - 0.05), box(w, 0.3, 0.1, 0, 0.82, -d / 2 + 0.05),
        box(0.1, 0.3, d, -w / 2 + 0.05, 0.82, 0), box(0.1, 0.3, d, w / 2 - 0.05, 0.82, 0),
        cyl(0.42, 0.08, -w * 0.28, 0.42, d / 2 + 0.04, { rot: [90, 0, 0] }),
        cyl(0.42, 0.08, -w * 0.28, 0.42, -d / 2 - 0.04, { rot: [90, 0, 0] }),
        box(0.09, 0.09, d * 0.4, w / 2 + 0.25, 0.45, -0.25, { rot: [0, 0, -18] }),
        box(0.09, 0.09, d * 0.4, w / 2 + 0.25, 0.45, 0.25, { rot: [0, 0, -18] }),
        box(0.7, 0.35, 0.6, -0.3, 0.85, 0),
      ];
    case 'barrel':
      return [
        ball(w / 2, h / w, 0, h / 2, 0),
        torus(w / 2 * 0.92, 0.03, 0, h * 0.28, 0, { rot: [90, 0, 0], ...dark }),
        torus(w / 2 * 0.92, 0.03, 0, h * 0.72, 0, { rot: [90, 0, 0], ...dark }),
      ];
    case 'crate':
      return [
        box(w, h, d),
        box(w + 0.04, 0.12, d + 0.04, 0, h - 0.06, 0),
        box(w + 0.04, 0.12, d + 0.04, 0, 0.06, 0),
        box(w * 0.8, 0.1, d + 0.05, 0, h / 2, 0, { rot: [0, 0, 32] }),
      ];
    case 'crates-stack':
      return [
        box(1, 0.85, 1, 0, 0.42, 0),
        box(1.04, 0.1, 1.04, 0, 0.82, 0),
        box(0.8, 0.8, 0.8, 0.05, 1.27, 0.03, { rot: [0, 14, 0] }),
        box(0.84, 0.09, 0.84, 0.05, 1.65, 0.03),
      ];
    case 'forge-anvil':
      return [
        box(w, 0.18, d, 0, 0.09, 0),
        box(0.4, 0.3, 0.35, 0, 0.33, 0),
        box(w - 0.1, 0.22, 0.3, 0, 0.6, 0),
        cone(0.14, 0.45, w / 2 + 0.05, 0.62, 0, { rot: [0, 0, -90] }),
        box(0.3, 0.1, 0.34, -w * 0.2, 0.76, 0, dark),
      ];
    case 'bell':
      return [
        box(0.12, h, 0.12, -w / 2 + 0.1, h / 2, 0),
        box(0.12, h, 0.12, w / 2 - 0.1, h / 2, 0),
        box(w + 0.15, 0.14, 0.3, 0, h - 0.07, 0),
        cone(0.3, 0.52, 0, h - 0.62, 0),
        ball(0.07, 1, 0, h - 0.95, 0, dark),
        cyl(0.02, 0.3, 0.18, h - 0.5, 0),
      ];
    case 'sundial':
      return [
        pyramid(w * 0.8, h * 0.55, d * 0.8, 0.72),
        disc(w / 2, 0.08, 0, h * 0.55 + 0.04, 0),
        prism([[0, 0], [0.34, 0], [0, 0.3]], 0.05, { offset: [-0.17, h * 0.55 + 0.08, 0] }),
        ball(0.05, 1, 0, h * 0.55 + 0.1, 0, dark),
      ];
    case 'birdbath':
      return [
        cyl(0.09, h * 0.55, 0, h * 0.27, 0),
        disc(0.2, 0.08, 0, 0.04, 0),
        disc(w / 2, 0.14, 0, h - 0.12, 0),
        disc(w / 2 - 0.08, 0.05, 0, h - 0.06, 0, watery),
      ];
    case 'campfire':
      return [
        ...[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return box(0.24, 0.16, 0.2, Math.sin(a) * 0.45, 0.08, Math.cos(a) * 0.45, { rot: [0, i * 60, 0] });
        }),
        cyl(0.07, 0.7, 0, 0.14, 0, { rot: [70, 0, 20] }),
        cyl(0.07, 0.7, 0, 0.14, 0, { rot: [-60, 0, -30] }),
        cone(0.2, 0.42, 0, 0.32, 0, glow),
        ball(0.1, 0.8, 0, 0.16, 0, glow),
      ];
    case 'cooking-pot':
      return [
        cyl(0.045, 1.15, -0.35, 0.55, 0, { rot: [0, 0, 18] }),
        cyl(0.045, 1.15, 0.35, 0.55, 0, { rot: [0, 0, -18] }),
        cyl(0.045, 1.15, 0, 0.55, -0.35, { rot: [18, 0, 0] }),
        ball(0.42, 0.72, 0, 0.52, 0, dark),
        disc(0.36, 0.06, 0, 0.82, 0, dark),
        cone(0.16, 0.3, 0, 0.26, 0, glow),
      ];
    case 'hay-bale':
      return [
        cyl(0.55, w, 0, 0.55, 0, { rot: [0, 0, 90] }),
        torus(0.55, 0.025, -w * 0.25, 0.55, 0, { rot: [0, 90, 0] }),
        torus(0.55, 0.025, w * 0.25, 0.55, 0, { rot: [0, 90, 0] }),
      ];
    case 'target-archery':
      return [
        box(0.09, h, 0.09, -0.25, h / 2, 0, { rot: [0, 0, 10] }),
        box(0.09, h, 0.09, 0.25, h / 2, 0, { rot: [0, 0, -10] }),
        box(0.7, 0.09, 0.09, 0, h - 0.35, 0),
        disc(0.48, 0.09, 0, h - 0.35, d / 2, { rot: [90, 0, 0] }),
        disc(0.3, 0.1, 0, h - 0.35, d / 2, { rot: [90, 0, 0] }),
        disc(0.14, 0.11, 0, h - 0.35, d / 2, { rot: [90, 0, 0], ...dark }),
      ];
    case 'sign-post':
      return [
        cyl(0.07, h, 0, h / 2, 0),
        box(1, 0.32, 0.06, 0.28, h - 0.35, 0, { rot: [0, -12, 0] }),
        box(0.9, 0.3, 0.06, -0.22, h - 0.85, 0, { rot: [0, 14, 0] }),
        ball(0.08, 1, 0, h + 0.03, 0),
      ];
    case 'bee-hive':
      return [
        box(w, h * 0.3, d, 0, h * 0.15, 0),
        box(w * 0.88, h * 0.3, d * 0.88, 0, h * 0.45, 0),
        box(w * 0.76, h * 0.28, d * 0.76, 0, h * 0.73, 0),
        box(w + 0.12, 0.09, d + 0.12, 0, h - 0.02, 0),
        box(0.3, 0.12, 0.05, 0, 0.18, d / 2 + 0.01, dark),
      ];
    case 'scarecrow':
      return [
        cyl(0.06, h, 0, h / 2, 0),
        cyl(0.045, w - 0.15, 0, h - 0.45, 0, { rot: [0, 0, 90] }),
        box(0.5, 0.75, 0.24, 0, h - 0.85, 0),
        ball(0.17, 1.05, 0, h - 0.12, 0),
        cone(0.3, 0.22, 0, h + 0.1, 0),
        cyl(0.3, 0.05, 0, h + 0.0, 0),
      ];
    case 'mailbox-post':
      return [
        box(0.12, h * 0.7, 0.12, 0, h * 0.35, 0),
        box(w - 0.05, 0.35, d - 0.05, 0, h * 0.82, 0),
        cyl((d - 0.05) / 2, w - 0.05, 0, h * 0.99, 0, { rot: [0, 0, 90], thetaLength: Math.PI }),
        box(0.05, 0.3, 0.05, w / 2 - 0.05, h * 0.95, d / 2 - 0.1, dark),
      ];
    case 'weather-vane':
      return [
        cyl(0.035, h, 0, h / 2, 0),
        box(0.7, 0.04, 0.04, 0, h - 0.12, 0),
        box(0.2, 0.16, 0.03, -0.38, h - 0.12, 0),
        cone(0.07, 0.22, 0.42, h - 0.12, 0, { rot: [0, 0, -90] }),
        box(0.5, 0.03, 0.03, 0, h - 0.3, 0, { rot: [0, 90, 0] }),
        ball(0.07, 1.1, 0, h - 0.45, 0),
        box(0.3, 0.2, 0.04, 0, 0.5, 0),
      ];
    case 'dog-house':
      return [
        box(w, 0.1, d, 0, 0.05, 0),
        box(w, h * 0.62, d, 0, h * 0.31 + 0.08, -0.05),
        box(0.55, 0.62, 0.06, 0, 0.42, d / 2 - 0.06, dark),
        prism([[-w / 2 - 0.08, 0], [w / 2 + 0.08, 0], [0, h * 0.42]], d + 0.15, { offset: [0, h * 0.68, 0] }),
      ];
    case 'grain-sack':
      return [
        ball(w / 2, 1.05, 0, h * 0.42, 0),
        cyl(0.12, 0.18, 0, h * 0.92, 0),
        torus(0.13, 0.03, 0, h * 0.84, 0, { rot: [90, 0, 0], ...dark }),
      ];
    default: return [box(w, h, d)];
  }
};

const GEN_ORGANIC = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'tree-column-tall':
      return [
        cyl(0.36, h - 1.6, 0, (h - 1.6) / 2, 0, { rTop: 0.6 }),
        ball(1.7, 0.72, 0, h - 1.1, 0, foliage),
        ball(1.15, 0.7, 0.95, h - 1.8, 0.45, foliage),
        ball(1.0, 0.68, -0.9, h - 2.1, -0.4, foliage),
      ];
    case 'tree-dead':
      return [
        cyl(0.2, h * 0.7, 0, h * 0.35, 0, { rTop: 0.45, rot: [0, 0, 3] }),
        cyl(0.09, h * 0.45, 0.3, h * 0.78, 0, { rot: [0, 0, -38] }),
        cyl(0.07, h * 0.38, -0.28, h * 0.72, 0.1, { rot: [12, 0, 42] }),
        cyl(0.05, h * 0.3, 0.1, h * 0.88, -0.15, { rot: [-20, 0, -18] }),
      ];
    case 'stump':
      return [
        cyl(w / 2, h, 0, h / 2, 0, { rTop: 0.92 }),
        disc(w / 2 * 0.92, 0.05, 0, h, 0),
        box(0.5, 0.16, 0.24, -w / 2 - 0.1, 0.08, 0.15, { rot: [0, 30, 0] }),
        box(0.45, 0.15, 0.22, w / 2 + 0.08, 0.07, -0.2, { rot: [0, -24, 0] }),
      ];
    case 'log-fallen':
      return [
        cyl(0.32, w - 0.2, 0, 0.34, 0, { rot: [0, 0, 90] }),
        disc(0.3, 0.05, -w / 2 + 0.08, 0.34, 0, { rot: [0, 0, 90] }),
        cyl(0.07, 0.55, 0.3, 0.55, 0.1, { rot: [-24, 0, 0] }),
      ];
    case 'rock-boulder':
      return [ball(w / 2, h / (w / 2), 0, h * 0.3, 0), ball(w * 0.26, 0.7, w * 0.3, 0, d * 0.25)];
    case 'rock-cluster':
      return [
        ball(w * 0.3, 0.75, -w * 0.22, 0, 0),
        ball(w * 0.24, 0.85, w * 0.2, 0, d * 0.16),
        ball(w * 0.17, 0.7, w * 0.05, 0, -d * 0.28),
      ];
    case 'standing-stone':
      return [pyramid(w, h, d, 0.78, null, { rot: [0, 0, 2] }), box(w + 0.25, 0.18, d + 0.25, 0, 0.09, 0)];
    case 'standing-stones-pair':
      return [
        pyramid(0.75, h - 0.5, d, 0.8, (h - 0.5) / 2, { offset: [-w / 2 + 0.4, (h - 0.5) / 2, 0], rot: [0, 0, 2] }),
        pyramid(0.75, h - 0.5, d, 0.8, (h - 0.5) / 2, { offset: [w / 2 - 0.4, (h - 0.5) / 2, 0], rot: [0, 0, -2] }),
        box(w - 0.2, 0.42, d + 0.08, 0, h - 0.28, 0),
      ];
    case 'mushroom-cluster': {
      const parts = [];
      const shrooms = [[-0.35, 0.5, 0.3], [0.3, 0.72, 0.42], [0.05, 0.38, -0.3]];
      for (const [sx, sh, sz] of shrooms) {
        parts.push(cyl(0.07, sh * 0.6, sx, sh * 0.3, sz));
        parts.push(dome(0.24 + sh * 0.12, 0.55, sx, sh * 0.6, sz));
      }
      return parts;
    }
    case 'mushroom-giant':
      return [
        cyl(0.42, h * 0.55, 0, h * 0.27, 0, { rTop: 1.25 }),
        dome(w / 2, 0.5, 0, h * 0.52, 0),
        ball(0.16, 0.5, 0.5, h * 0.78, 0.3),
        ball(0.12, 0.5, -0.6, h * 0.72, -0.2),
      ];
    case 'flower-bed': {
      const parts = [
        box(w, h * 0.55, d, 0, h * 0.27, 0),
        box(w - 0.2, 0.14, d - 0.15, 0, h * 0.6, 0, foliage),
      ];
      for (const [fx, fz] of [[-0.35, 0], [-0.12, 0.2], [0.15, -0.15], [0.38, 0.1], [0, 0]]) {
        parts.push(ball(0.09, 1, fx * w, h * 0.78, fz));
      }
      return parts;
    }
    case 'vine-column':
      return [
        cyl(0.3, h, 0, h / 2, 0),
        torus(0.38, 0.06, 0, h * 0.3, 0, { rot: [90, 0, 0], ...foliage }),
        torus(0.38, 0.06, 0, h * 0.55, 0, { rot: [90, 0, 0], ...foliage }),
        torus(0.38, 0.06, 0, h * 0.8, 0, { rot: [90, 0, 0], ...foliage }),
        ball(0.4, 0.8, 0.2, h * 0.92, 0.15, foliage),
      ];
    case 'hedge-round':
      return [
        box(w * 0.7, 0.18, d * 0.7, 0, 0.09, 0),
        ball(w / 2, (h - 0.2) / w, 0, h * 0.52, 0, foliage),
      ];
    case 'hedge-arch':
      return [
        box(0.55, h, 0.6, -(w / 2 - 0.3), h / 2, 0, foliage),
        box(0.55, h, 0.6, w / 2 - 0.3, h / 2, 0, foliage),
        box(w, 0.6, 0.65, 0, h - 0.28, 0, foliage),
        box(0.14, h - 0.5, 0.14, -(w / 2 - 0.3), (h - 0.5) / 2, 0),
        box(0.14, h - 0.5, 0.14, w / 2 - 0.3, (h - 0.5) / 2, 0),
      ];
    case 'topiary-cone':
      return [
        cyl(0.3, 0.3, 0, 0.15, 0),
        cyl(0.06, 0.35, 0, 0.45, 0),
        cone(w / 2, h - 0.6, 0, 0.6 + (h - 0.6) / 2, 0, foliage),
      ];
    case 'flower-arch': {
      const parts = [
        box(0.16, h - 0.4, 0.16, -(w / 2 - 0.15), (h - 0.4) / 2, 0),
        box(0.16, h - 0.4, 0.16, w / 2 - 0.15, (h - 0.4) / 2, 0),
        prism(archBandProfile(w / 2, w / 2 - 0.2, h - w / 2 - 0.35, 10), 0.2),
      ];
      for (const [fx, fy] of [[-0.45, 0.75], [-0.2, 0.95], [0.1, 1], [0.4, 0.8], [0, 0.88]]) {
        parts.push(ball(0.17, 0.85, fx * w, fy * h, 0, foliage));
      }
      for (const [fx, fy] of [[-0.3, 0.9], [0.25, 0.97]]) {
        parts.push(ball(0.08, 1, fx * w, fy * h, 0.12));
      }
      return parts;
    }
    case 'grass-tuft': {
      const parts = [];
      const tilts = [[0, 0], [14, 20], [-16, -10], [8, -28], [-10, 30]];
      for (const [rz, rx] of tilts) {
        parts.push(cone(0.09, h, (rz || 0) * 0.008, h / 2, (rx || 0) * 0.008, { rot: [rx, 0, rz], ...foliage }));
      }
      return parts;
    }
    case 'coral-cluster':
      return [
        cone(0.16, h * 0.85, -0.3, h * 0.42, 0, { rot: [0, 0, 14] }),
        cone(0.13, h, 0.15, h * 0.5, 0.15, { rot: [-10, 0, -8] }),
        cone(0.11, h * 0.6, 0.35, h * 0.3, -0.2, { rot: [0, 0, -20] }),
        ball(0.2, 0.7, -0.05, h * 0.55, 0.3),
        ball(0.3, 0.5, 0, 0.05, 0),
      ];
    default: return [ball(w / 2, 0.8, 0, h / 2, 0, foliage)];
  }
};

const GEN_FURNITURE = (p) => {
  const { w, h, d } = p.size;
  const legs4 = (lw, lh, inset = 0.12) => {
    const parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(box(lw, lh, lw, sx * (w / 2 - inset - lw / 2), lh / 2, sz * (d / 2 - inset - lw / 2)));
    }
    return parts;
  };
  switch (p.id) {
    case 'table-round':
      return [disc(w / 2, 0.07, 0, h - 0.05, 0), cyl(0.09, h - 0.2, 0, (h - 0.2) / 2 + 0.05, 0), disc(0.32, 0.06, 0, 0.03, 0)];
    case 'table-cafe':
      return [disc(w / 2, 0.06, 0, h - 0.04, 0), cyl(0.06, h - 0.15, 0, (h - 0.15) / 2 + 0.04, 0), disc(0.24, 0.05, 0, 0.025, 0)];
    case 'table-rect': case 'table-long':
      return [box(w, 0.08, d, 0, h - 0.04, 0), ...legs4(0.09, h - 0.08)];
    case 'table-picnic': {
      const parts = [
        box(w, 0.07, d * 0.55, 0, h - 0.04, 0),
        box(w * 0.9, 0.06, 0.3, 0, h * 0.55, -d / 2 + 0.15),
        box(w * 0.9, 0.06, 0.3, 0, h * 0.55, d / 2 - 0.15),
        box(0.1, h - 0.1, d * 0.7, -w / 2 + 0.25, (h - 0.1) / 2, 0, { rot: [0, 0, 12] }),
        box(0.1, h - 0.1, d * 0.7, w / 2 - 0.25, (h - 0.1) / 2, 0, { rot: [0, 0, -12] }),
      ];
      return parts;
    }
    case 'table-gaming':
      return [
        box(w, 0.07, d, 0, h - 0.04, 0),
        box(w - 0.3, 0.03, d - 0.3, 0, h - 0.1, 0, dark),
        ...legs4(0.09, h - 0.1),
      ];
    case 'bench': case 'bench-stone':
      return [
        box(w, 0.09, d, 0, h - 0.1, 0),
        box(0.14, h - 0.12, d - 0.08, -w / 2 + 0.25, (h - 0.12) / 2, 0),
        box(0.14, h - 0.12, d - 0.08, w / 2 - 0.25, (h - 0.12) / 2, 0),
      ];
    case 'bench-garden':
      return [
        box(w, 0.08, d * 0.7, 0, 0.45, 0.05),
        box(w, 0.5, 0.07, 0, 0.72, -d / 2 + 0.06),
        box(0.1, 0.45, d * 0.7, -w / 2 + 0.12, 0.22, 0.05),
        box(0.1, 0.45, d * 0.7, w / 2 - 0.12, 0.22, 0.05),
        box(0.08, 0.07, d * 0.7, -w / 2 + 0.12, 0.52, 0.05),
        box(0.08, 0.07, d * 0.7, w / 2 - 0.12, 0.52, 0.05),
      ];
    case 'bench-window':
      return [
        box(w, h - 0.12, d, 0, (h - 0.12) / 2, 0),
        box(w + 0.08, 0.1, d + 0.08, 0, h - 0.05, 0),
        box(0.5, 0.2, 0.06, 0, 0.2, d / 2 + 0.01, dark),
      ];
    case 'stool':
      return [
        disc(w / 2, 0.07, 0, h - 0.04, 0),
        cyl(0.05, h - 0.1, -0.12, (h - 0.1) / 2, 0), cyl(0.05, h - 0.1, 0.12, (h - 0.1) / 2, 0),
        cyl(0.05, h - 0.1, 0, (h - 0.1) / 2, -0.12), cyl(0.05, h - 0.1, 0, (h - 0.1) / 2, 0.12),
      ];
    case 'stool-tall':
      return [
        disc(w / 2, 0.07, 0, h - 0.04, 0),
        cyl(0.045, h - 0.1, -0.1, (h - 0.1) / 2, 0), cyl(0.045, h - 0.1, 0.1, (h - 0.1) / 2, 0),
        cyl(0.045, h - 0.1, 0, (h - 0.1) / 2, -0.1), cyl(0.045, h - 0.1, 0, (h - 0.1) / 2, 0.1),
        torus(0.16, 0.02, 0, 0.22, 0, { rot: [90, 0, 0] }),
      ];
    case 'stool-cube': return [box(w, h, d)];
    case 'stool-step':
      return [box(w, h * 0.55, d), box(w * 0.6, h * 0.45, d * 0.7, 0, h * 0.55 + h * 0.22, -d * 0.1)];
    case 'chair':
      return [
        box(w - 0.06, 0.07, d - 0.06, 0, 0.45, 0),
        box(w - 0.06, h - 0.45, 0.07, 0, 0.45 + (h - 0.45) / 2, -d / 2 + 0.05),
        box(0.06, 0.45, 0.06, -w / 2 + 0.06, 0.22, d / 2 - 0.06),
        box(0.06, 0.45, 0.06, w / 2 - 0.06, 0.22, d / 2 - 0.06),
        box(0.06, h, 0.06, -w / 2 + 0.06, h / 2, -d / 2 + 0.06),
        box(0.06, h, 0.06, w / 2 - 0.06, h / 2, -d / 2 + 0.06),
      ];
    case 'armchair':
      return [
        box(w - 0.2, 0.28, d - 0.15, 0, 0.3, 0.02),
        box(w, h * 0.55, 0.16, 0, h * 0.55, -d / 2 + 0.08),
        box(0.16, 0.42, d - 0.05, -w / 2 + 0.08, 0.45, 0),
        box(0.16, 0.42, d - 0.05, w / 2 - 0.08, 0.45, 0),
        box(w - 0.24, 0.14, d - 0.3, 0, 0.5, 0.05),
        box(w - 0.16, 0.1, d - 0.2, 0, 0.14, 0),
      ];
    case 'sofa':
      return [
        box(w, 0.35, d, 0, 0.25, 0),
        box(w, h - 0.35, 0.18, 0, 0.35 + (h - 0.35) / 2, -d / 2 + 0.09),
        box(0.2, 0.5, d - 0.05, -w / 2 + 0.1, 0.45, 0),
        box(0.2, 0.5, d - 0.05, w / 2 - 0.1, 0.45, 0),
        box(w / 2 - 0.18, 0.13, d - 0.3, -w / 4 + 0.02, 0.48, 0.05),
        box(w / 2 - 0.18, 0.13, d - 0.3, w / 4 - 0.02, 0.48, 0.05),
      ];
    case 'throne':
      return [
        box(w, 0.22, d, 0, 0.11, 0),
        box(w - 0.15, 0.3, d - 0.12, 0, 0.37, 0),
        box(w - 0.1, h - 0.55, 0.14, 0, 0.5 + (h - 0.55) / 2, -d / 2 + 0.07),
        ball(0.08, 1, -w / 2 + 0.12, h + 0.02, -d / 2 + 0.07, glow),
        ball(0.08, 1, w / 2 - 0.12, h + 0.02, -d / 2 + 0.07, glow),
        box(0.15, 0.35, d - 0.1, -w / 2 + 0.08, 0.55, 0),
        box(0.15, 0.35, d - 0.1, w / 2 - 0.08, 0.55, 0),
        pyramid(w * 0.5, 0.28, 0.2, 0, h - 0.3, { offset: [0, h - 0.3, -d / 2 + 0.07] }),
      ];
    case 'shelf': {
      const parts = [
        box(0.07, h, d, -w / 2 + 0.04, h / 2, 0),
        box(0.07, h, d, w / 2 - 0.04, h / 2, 0),
      ];
      for (let i = 0; i < 4; i++) parts.push(box(w, 0.06, d, 0, 0.15 + i * ((h - 0.3) / 3), 0));
      return parts;
    }
    case 'shelf-corner': {
      const parts = [box(0.07, h, d, -w / 2 + 0.04, h / 2, 0), box(0.07, h, d, 0, h / 2, -d / 2 + 0.04)];
      for (let i = 0; i < 4; i++) {
        const y = 0.15 + i * ((h - 0.3) / 3);
        parts.push(box(w, 0.06, 0.32, 0, y, -d / 2 + 0.16));
        parts.push(box(0.32, 0.06, d, -w / 2 + 0.16, y, 0));
      }
      return parts;
    }
    case 'shelf-wall':
      return [
        box(w, 0.07, d, 0, h - 0.2, 0),
        box(w, 0.07, d, 0, 0.15, 0),
        box(0.08, 0.3, d - 0.06, -w / 2 + 0.2, h - 0.38, -0.02, { rot: [0, 0, 0] }),
        box(0.08, 0.3, d - 0.06, w / 2 - 0.2, h - 0.38, -0.02),
      ];
    case 'bookcase': {
      const parts = [
        box(0.07, h, d, -w / 2 + 0.04, h / 2, 0),
        box(0.07, h, d, w / 2 - 0.04, h / 2, 0),
        box(w, 0.08, d, 0, h - 0.04, 0),
        box(w, 0.08, d, 0, 0.04, 0),
      ];
      for (let s = 0; s < 3; s++) {
        const y = 0.55 + s * 0.5;
        parts.push(box(w - 0.1, 0.05, d - 0.04, 0, y - 0.28, 0));
        for (let b = 0; b < 4; b++) {
          parts.push(box(0.09, 0.34 + (b % 2) * 0.06, 0.2, -w / 2 + 0.25 + b * 0.14 + s * 0.08, y - 0.08, 0, b % 3 === 0 ? dark : {}));
        }
      }
      return parts;
    }
    case 'bed-single': case 'bed-double': {
      const parts = [
        box(w, 0.25, d, 0, 0.18, 0),
        box(w - 0.1, 0.2, d - 0.15, 0, 0.4, 0.02),
        box(w, 0.75, 0.09, 0, 0.45, -d / 2 + 0.05),
        box(w, 0.35, 0.07, 0, 0.3, d / 2 - 0.04),
      ];
      const pillows = p.id === 'bed-double' ? [-w / 4, w / 4] : [0];
      for (const px of pillows) parts.push(box(0.52, 0.13, 0.36, px, 0.55, -d / 2 + 0.35));
      parts.push(box(w - 0.12, 0.07, d * 0.5, 0, 0.52, d * 0.18));
      return parts;
    }
    case 'bunk-bed':
      return [
        box(0.09, h, 0.09, -w / 2 + 0.06, h / 2, -d / 2 + 0.06),
        box(0.09, h, 0.09, w / 2 - 0.06, h / 2, -d / 2 + 0.06),
        box(0.09, h, 0.09, -w / 2 + 0.06, h / 2, d / 2 - 0.06),
        box(0.09, h, 0.09, w / 2 - 0.06, h / 2, d / 2 - 0.06),
        box(w, 0.16, d, 0, 0.35, 0),
        box(w - 0.08, 0.14, d - 0.1, 0, 0.5, 0),
        box(w, 0.16, d, 0, 1.3, 0),
        box(w - 0.08, 0.14, d - 0.1, 0, 1.45, 0),
        box(0.5, 0.12, 0.34, 0, 0.62, -d / 2 + 0.32),
        box(0.5, 0.12, 0.34, 0, 1.56, -d / 2 + 0.32),
        box(0.4, 0.5, 0.05, w / 2 - 0.25, 0.85, d / 2 - 0.02),
      ];
    case 'desk':
      return [
        box(w, 0.07, d, 0, h - 0.04, 0),
        box(0.5, h - 0.1, d - 0.08, -w / 2 + 0.28, (h - 0.1) / 2, 0),
        box(0.08, h - 0.1, d - 0.08, w / 2 - 0.06, (h - 0.1) / 2, 0),
        box(0.44, 0.16, 0.04, -w / 2 + 0.28, h - 0.25, d / 2 - 0.02, dark),
        box(0.44, 0.16, 0.04, -w / 2 + 0.28, h - 0.5, d / 2 - 0.02, dark),
      ];
    case 'counter': {
      const parts = [
        box(w, h - 0.12, d, 0, (h - 0.12) / 2, 0),
        box(w + 0.15, 0.1, d + 0.18, 0, h - 0.05, 0),
      ];
      for (const fx of [-0.32, 0, 0.32]) {
        parts.push(box(w * 0.26, h - 0.35, 0.04, fx * w, (h - 0.12) / 2, d / 2 + 0.01, dark));
      }
      return parts;
    }
    case 'wardrobe':
      return [
        box(w, h, d),
        box(w * 0.46, h - 0.3, 0.04, -w * 0.24, (h - 0.2) / 2, d / 2 + 0.01),
        box(w * 0.46, h - 0.3, 0.04, w * 0.24, (h - 0.2) / 2, d / 2 + 0.01),
        box(w + 0.12, 0.14, d + 0.1, 0, h - 0.05, 0),
        ball(0.045, 1, -0.09, h / 2, d / 2 + 0.06, dark),
        ball(0.045, 1, 0.09, h / 2, d / 2 + 0.06, dark),
      ];
    case 'chest':
      return [
        box(w, h * 0.62, d, 0, h * 0.31, 0),
        cyl(d / 2, w, 0, h * 0.62, 0, { rot: [0, 0, 90], thetaLength: Math.PI }),
        box(0.1, h * 0.7, d + 0.04, -w * 0.3, h * 0.35, 0, dark),
        box(0.1, h * 0.7, d + 0.04, w * 0.3, h * 0.35, 0, dark),
        box(0.16, 0.2, 0.05, 0, h * 0.42, d / 2 + 0.02, dark),
      ];
    case 'dresser': {
      const parts = [box(w, h - 0.08, d, 0, (h - 0.08) / 2, 0), box(w + 0.08, 0.07, d + 0.08, 0, h - 0.04, 0)];
      for (let i = 0; i < 3; i++) {
        parts.push(box(w - 0.2, 0.2, 0.03, 0, 0.2 + i * 0.26, d / 2 + 0.01, dark));
      }
      return parts;
    }
    case 'rug-round': return [disc(w / 2, h, 0, h / 2, 0), disc(w * 0.32, h + 0.015, 0, h / 2, 0, dark)];
    case 'rug-rect':
      return [box(w, h, d), box(w - 0.3, h + 0.015, d - 0.3, 0, h / 2, 0, dark)];
    case 'podium':
      return [
        pyramid(w, h - 0.15, d, 0.72),
        box(w * 0.8, 0.07, d * 0.9, 0, h - 0.1, 0.04, { rot: [-18, 0, 0] }),
        box(w + 0.15, 0.12, d + 0.15, 0, 0.06, 0),
      ];
    case 'hammock': {
      const parts = [
        box(0.12, h, 0.12, -w / 2 + 0.1, h / 2, 0, { rot: [0, 0, 14] }),
        box(0.12, h, 0.12, w / 2 - 0.1, h / 2, 0, { rot: [0, 0, -14] }),
        box(w * 0.34, 0.05, d * 0.8, -w * 0.3, h * 0.52, 0, { rot: [0, 0, 10] }),
        box(w * 0.34, 0.05, d * 0.85, 0, h * 0.42, 0),
        box(w * 0.34, 0.05, d * 0.8, w * 0.3, h * 0.52, 0, { rot: [0, 0, -10] }),
      ];
      return parts;
    }
    case 'coat-rack': {
      const parts = [
        cyl(0.05, h, 0, h / 2, 0),
        disc(0.24, 0.05, 0, 0.025, 0),
        ball(0.06, 1, 0, h + 0.02, 0),
      ];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        parts.push(cyl(0.025, 0.34, Math.sin(a) * 0.14, h - 0.18, Math.cos(a) * 0.14, { rot: [Math.cos(a) * 50, 0, -Math.sin(a) * 50] }));
      }
      return parts;
    }
    case 'mirror-panel':
      return [
        box(w, 0.09, d, 0, h - 0.045, 0), box(w, 0.09, d, 0, 0.045, 0),
        box(0.09, h, d, -w / 2 + 0.045, h / 2, 0), box(0.09, h, d, w / 2 - 0.045, h / 2, 0),
        box(w - 0.14, h - 0.14, d * 0.5, 0, h / 2, 0, glassy),
      ];
    case 'screen-divider': {
      const parts = [];
      const panels = [[-w * 0.34, 18], [0, 0], [w * 0.34, -18]];
      for (const [px, ry] of panels) {
        parts.push(box(w / 3 - 0.03, h, d, px, h / 2, 0, { rot: [0, ry, 0] }));
        parts.push(box(w / 3 - 0.1, 0.08, d + 0.02, px, h - 0.15, 0, { rot: [0, ry, 0] }));
      }
      return parts;
    }
    case 'planter-box':
      return [
        box(w, h, d),
        box(w - 0.14, 0.1, d - 0.14, 0, h - 0.04, 0, dark),
        ball(0.16, 0.8, -w * 0.28, h + 0.06, 0, foliage),
        ball(0.19, 0.85, 0.05, h + 0.08, 0.05, foliage),
        ball(0.15, 0.8, w * 0.3, h + 0.05, -0.04, foliage),
      ];
    default: return [box(w, h, d)];
  }
};

const GEN_LIGHTING = (p) => {
  const { w, h, d } = p.size;
  const flame = (x, y, z, s = 1) => cone(0.07 * s, 0.16 * s, x, y, z, glow);
  switch (p.id) {
    case 'torch-wall':
      return [
        box(0.08, 0.3, 0.1, 0, 0.25, -d / 2 + 0.06),
        box(0.07, 0.4, 0.07, 0, 0.42, 0.02, { rot: [-24, 0, 0] }),
        cone(0.09, 0.14, 0, 0.6, 0.1, dark),
        flame(0, 0.72, 0.1),
      ];
    case 'torch-post':
      return [
        cyl(0.035, h - 0.25, 0, (h - 0.25) / 2, 0),
        cone(0.1, 0.16, 0, h - 0.2, 0, { rot: [180, 0, 0], ...dark }),
        flame(0, h - 0.02, 0, 1.2),
        ball(0.05, 1, 0, h - 0.12, 0, glow),
      ];
    case 'torch-ground':
      return [
        cyl(0.03, h - 0.2, 0, (h - 0.2) / 2, 0, { rot: [0, 0, 4] }),
        cone(0.09, 0.13, 0.02, h - 0.14, 0, { rot: [180, 0, 0], ...dark }),
        flame(0.02, h + 0.0, 0),
      ];
    case 'brazier':
      return [
        cyl(0.3, 0.3, 0, h - 0.28, 0, { rTop: 1, rBottom: 0.45 }),
        cyl(0.07, h - 0.42, -0.14, (h - 0.42) / 2, 0, { rot: [0, 0, 10] }),
        cyl(0.07, h - 0.42, 0.14, (h - 0.42) / 2, 0.1, { rot: [0, 0, -10] }),
        cyl(0.07, h - 0.42, 0, (h - 0.42) / 2, -0.14, { rot: [10, 0, 0] }),
        disc(0.24, 0.06, 0, h - 0.16, 0, glow),
        flame(0, h - 0.02, 0, 1.4),
      ];
    case 'brazier-tall':
      return [
        cyl(0.09, h - 0.45, 0, (h - 0.45) / 2, 0),
        disc(0.22, 0.08, 0, 0.04, 0),
        cyl(0.26, 0.28, 0, h - 0.3, 0, { rTop: 1, rBottom: 0.5 }),
        disc(0.2, 0.05, 0, h - 0.18, 0, glow),
        flame(0, h - 0.04, 0, 1.3),
      ];
    case 'fire-bowl-ground':
      return [
        cyl(w / 2, h * 0.6, 0, h * 0.3, 0, { rTop: 1, rBottom: 0.55 }),
        disc(w / 2 - 0.12, 0.06, 0, h * 0.55, 0, glow),
        cyl(0.05, 0.6, 0, h * 0.6, 0, { rot: [80, 0, 15] }),
        ball(0.09, 1, 0.1, h * 0.72, 0.05, glow),
      ];
    case 'glow-orb':
      return [
        ball(w / 2, 1, 0, h / 2, 0, glow),
        torus(0.12, 0.02, 0, 0.06, 0, { rot: [90, 0, 0], ...dark }),
        cone(0.05, 0.14, 0, 0.16, 0, { rot: [180, 0, 0], ...dark }),
      ];
    case 'glow-orb-post':
      return [
        cyl(0.04, h - 0.3, 0, (h - 0.3) / 2, 0),
        box(0.05, 0.05, 0.3, 0, h - 0.32, 0.1),
        ball(0.13, 1, 0, h - 0.14, 0.22, glow),
        disc(0.16, 0.04, 0, 0.02, 0),
      ];
    case 'strip-light':
      return [
        box(w, h, d, 0, h / 2, 0, glow),
        box(0.08, h + 0.03, d + 0.02, -w / 2 + 0.04, h / 2, 0, dark),
        box(0.08, h + 0.03, d + 0.02, w / 2 - 0.04, h / 2, 0, dark),
      ];
    case 'chandelier': {
      const parts = [
        cyl(0.03, 0.3, 0, h - 0.12, 0),
        torus(0.55, 0.045, 0, h - 0.35, 0, { rot: [90, 0, 0] }),
        ball(0.09, 1, 0, h - 0.35, 0, glow),
      ];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(cyl(0.03, 0.16, Math.sin(a) * 0.55, h - 0.26, Math.cos(a) * 0.55));
        parts.push(ball(0.045, 1.2, Math.sin(a) * 0.55, h - 0.14, Math.cos(a) * 0.55, glow));
      }
      return parts;
    }
    case 'lamp-street':
      return [
        cyl(0.06, h - 0.5, 0, (h - 0.5) / 2, 0),
        disc(0.2, 0.07, 0, 0.035, 0),
        torus(0.42, 0.04, 0.18, h - 0.45, 0, { arc: Math.PI / 2, rot: [0, 0, 0] }),
        box(0.26, 0.34, 0.26, 0.55, h - 0.28, 0),
        ball(0.09, 1, 0.55, h - 0.28, 0, glow),
        cone(0.2, 0.14, 0.55, h - 0.04, 0),
      ];
    case 'beacon':
      return [
        box(0.34, h * 0.4, 0.34, 0, h * 0.2, 0),
        box(0.26, h * 0.35, 0.26, 0, h * 0.57, 0),
        cyl(0.1, h * 0.18, 0, h * 0.83, 0, dark),
        ball(0.16, 1, 0, h - 0.02, 0, glow),
      ];
    case 'candle-cluster': {
      const parts = [disc(0.24, 0.04, 0, 0.02, 0, dark)];
      const candles = [[-0.12, 0.3], [0.1, 0.38], [0, 0.22]];
      for (const [cx, ch] of candles) {
        parts.push(cyl(0.045, ch, cx, ch / 2 + 0.03, (cx * 0.5)));
        parts.push(flame(cx, ch + 0.12, cx * 0.5, 0.8));
      }
      return parts;
    }
    case 'lantern-hanging':
      return [
        cyl(0.015, 0.3, 0, h - 0.15, 0),
        cone(0.16, 0.12, 0, h - 0.36, 0),
        box(0.24, 0.3, 0.24, 0, h - 0.58, 0),
        ball(0.08, 1, 0, h - 0.58, 0, glow),
        box(0.26, 0.05, 0.26, 0, h - 0.75, 0),
      ];
    case 'crystal-lamp':
      return [
        disc(0.2, 0.06, 0, 0.03, 0, dark),
        cyl(0.05, 0.4, 0, 0.26, 0),
        cone(0.22, 0.5, 0, 0.72, 0, glow),
        ball(0.06, 1, 0, 1.0, 0, glow),
      ];
    case 'runway-light-strip': {
      const parts = [box(w, h * 0.5, d, 0, h * 0.25, 0, dark)];
      for (let i = 0; i < 5; i++) {
        parts.push(box(0.28, h * 0.6, d * 0.6, -w / 2 + 0.35 + i * ((w - 0.7) / 4), h * 0.75, 0, glow));
      }
      return parts;
    }
    case 'floodlight':
      return [
        cyl(0.05, h - 0.35, 0, (h - 0.35) / 2, 0),
        box(0.34, 0.3, 0.12, 0, h - 0.2, 0, { rot: [-18, 0, 0], ...dark }),
        box(0.28, 0.24, 0.04, 0, h - 0.2, 0.07, { rot: [-18, 0, 0], ...glow }),
        disc(0.17, 0.05, 0, 0.025, 0),
      ];
    case 'paper-lantern':
      return [
        ball(w / 2, 0.82, 0, h / 2, 0, glow),
        disc(0.12, 0.05, 0, h - 0.02, 0, dark),
        disc(0.12, 0.05, 0, 0.02, 0, dark),
      ];
    case 'lamp-paper-tall':
      return [
        box(0.07, 0.5, 0.07, -0.12, 0.25, -0.12),
        box(0.07, 0.5, 0.07, 0.12, 0.25, 0.12),
        cyl(0.21, h - 0.55, 0, (h - 0.55) / 2 + 0.5, 0, { rTop: 0.85, ...glow }),
        box(0.3, 0.05, 0.3, 0, h - 0.02, 0, dark),
      ];
    case 'wall-sconce':
      return [
        box(0.06, 0.34, 0.14, 0, 0.2, -d / 2 + 0.04),
        box(0.05, 0.05, 0.2, 0, 0.34, -d / 2 + 0.14),
        cone(0.08, 0.12, 0, 0.42, 0.02, { rot: [180, 0, 0], ...dark }),
        flame(0, 0.52, 0.02, 0.9),
      ];
    case 'sconce-crystal':
      return [
        box(0.06, 0.3, 0.13, 0, 0.18, -d / 2 + 0.04),
        cone(0.11, 0.3, 0, 0.38, 0.03, glow),
        ball(0.05, 1, 0, 0.56, 0.03, glow),
      ];
    case 'orb-string': {
      const parts = [sagArc(w - 0.2, 0.35, h - 0.1, 0.018, 0, dark)];
      for (let i = 0; i < 5; i++) {
        const fx = -0.4 + i * 0.2;
        const x = fx * w;
        const y = (h - 0.1) - 0.35 * (1 - (fx * 2) ** 2) - 0.16;
        parts.push(cyl(0.012, 0.1, x, y + 0.1, 0, dark));
        parts.push(ball(0.075, 1, x, y, 0, glow));
      }
      return parts;
    }
    case 'lamp-mushroom':
      return [
        cyl(0.07, h * 0.55, 0, h * 0.27, 0),
        dome(w / 2, 0.55, 0, h * 0.5, 0),
        disc(w / 2 - 0.12, 0.05, 0, h * 0.52, 0, glow),
      ];
    case 'fire-pit-ring': {
      const parts = [disc(w / 2 - 0.15, 0.07, 0, 0.035, 0, glow)];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push(box(0.26, 0.2, 0.2, Math.sin(a) * (w / 2 - 0.05), 0.1, Math.cos(a) * (w / 2 - 0.05), { rot: [0, i * 45, 0] }));
      }
      parts.push(cyl(0.05, 0.55, 0, 0.12, 0, { rot: [75, 0, 10] }));
      return parts;
    }
    default: return [ball(0.15, 1, 0, h / 2, 0, glow), cyl(0.04, h / 2, 0, h / 4, 0)];
  }
};

const GEN_SCIFI = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'hull-panel':
      return [
        box(w, h, d),
        box(w - 0.5, h - 0.5, 0.05, 0, h / 2, d / 2 + 0.01),
        box(w - 0.9, 0.14, 0.06, 0, h - 0.45, d / 2 + 0.01, dark),
      ];
    case 'hull-panel-window': {
      const parts = wallWithOpening(w, h, d, 2.6, 0.9, 1.15);
      parts.push(box(2.6, 0.9, 0.05, 0, 1.6, 0, glassy));
      parts.push(box(0.08, 0.9, 0.06, 0, 1.6, 0));
      return parts;
    }
    case 'hull-panel-door': {
      const parts = wallWithOpening(w, h, d, 1.6, 2.2, 0);
      parts.push(box(1.5, 2.15, 0.08, 0, 1.07, -0.04, dark));
      parts.push(box(1.7, 0.07, 0.06, 0, 2.32, d / 2 + 0.01, glow));
      return parts;
    }
    case 'hull-corner':
      return [
        box(w, h, 0.28, 0, h / 2, -d / 2 + 0.14),
        box(0.28, h, d, -w / 2 + 0.14, h / 2, 0),
        cyl(0.16, h, -w / 2 + 0.14, h / 2, -d / 2 + 0.14),
      ];
    case 'hull-window-strip': {
      const parts = [
        box(w, h * 0.32, d, 0, h * 0.16, 0),
        box(w, h * 0.3, d, 0, h * 0.85, 0),
        box(w, h * 0.38, 0.06, 0, h * 0.53, 0, glassy),
      ];
      for (const fx of [-0.25, 0, 0.25]) parts.push(box(0.1, h * 0.38, d, fx * w, h * 0.53, 0));
      return parts;
    }
    case 'greeble-block': {
      const parts = [box(w, h * 0.7, d)];
      parts.push(box(0.4, 0.35, 0.4, -0.25, h * 0.7 + 0.17, 0.15));
      parts.push(cyl(0.11, 0.5, 0.3, h * 0.7 + 0.25, -0.2));
      parts.push(box(0.5, 0.25, 0.06, 0.15, h * 0.4, d / 2 + 0.02, dark));
      parts.push(cyl(0.06, 0.7, -w / 2 - 0.02, h * 0.35, 0.2, { rot: [0, 0, 90] }));
      return parts;
    }
    case 'greeble-stack': {
      const parts = [
        box(w, h * 0.4, d, 0, h * 0.2, 0),
        box(w * 0.78, h * 0.32, d * 0.78, 0.05, h * 0.56, 0),
        box(w * 0.55, h * 0.28, d * 0.55, -0.08, h * 0.86, 0),
        cyl(0.07, 0.9, w / 2 - 0.1, h * 0.5, -d / 2 + 0.12),
        cyl(0.03, 0.6, -w * 0.2, h + 0.25, 0.2),
        ball(0.05, 1, -w * 0.2, h + 0.58, 0.2, glow),
      ];
      return parts;
    }
    case 'antenna-dish':
      return [
        cyl(0.07, h * 0.55, 0, h * 0.27, 0),
        disc(0.3, 0.07, 0, 0.035, 0),
        dome(w / 2, 0.38, 0, h * 0.62, 0, { rot: [-48, 0, 0] }),
        cyl(0.025, 0.6, 0.18, h * 0.78, 0.18, { rot: [-48, 0, 0] }),
        ball(0.05, 1, 0.3, h * 0.9, 0.3, glow),
      ];
    case 'antenna-array': {
      const parts = [box(w, 0.18, d, 0, 0.09, 0), box(0.12, h - 0.4, 0.12, 0, (h - 0.4) / 2 + 0.15, 0)];
      for (const fx of [-0.32, 0.32]) {
        parts.push(cyl(0.04, h * 0.5, fx * w, h * 0.62, 0));
        parts.push(ball(0.06, 1, fx * w, h * 0.9, 0, glow));
      }
      parts.push(box(w - 0.2, 0.07, 0.07, 0, h - 0.35, 0));
      parts.push(dome(0.3, 0.5, 0, h - 0.3, 0));
      return parts;
    }
    case 'antenna-mast-tall': {
      const parts = [cyl(0.06, h, 0, h / 2, 0), disc(0.3, 0.08, 0, 0.04, 0)];
      for (const fy of [0.55, 0.72, 0.88]) {
        parts.push(box(1 - fy * 0.5, 0.05, 0.05, 0, h * fy, 0));
      }
      parts.push(ball(0.09, 1, 0, h + 0.02, 0, glow));
      parts.push(box(0.05, 0.5, 0.05, 0, h * 0.95, 0, glow));
      return parts;
    }
    case 'sensor-dome':
      return [
        disc(w / 2, 0.3, 0, 0.15, 0),
        dome(w / 2 - 0.12, 0.75, 0, 0.28, 0, glassy),
        ball(0.2, 1, 0, 0.55, 0, dark),
        ball(0.06, 1, 0.25, 0.95, 0.15, glow),
      ];
    case 'landing-pad': {
      const parts = [
        disc(w / 2, h, 0, h / 2, 0),
        torus(w / 2 - 0.35, 0.05, 0, h + 0.02, 0, { rot: [90, 0, 0], ...glow }),
        disc(0.5, 0.04, 0, h + 0.01, 0, glow),
      ];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(box(0.14, 0.09, 0.14, Math.sin(a) * (w / 2 - 0.18), h + 0.03, Math.cos(a) * (w / 2 - 0.18), glow));
      }
      return parts;
    }
    case 'landing-pad-tall': {
      const parts = [disc(w / 2, 0.25, 0, h - 0.12, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(box(0.22, h - 0.25, 0.22, sx * (w / 2 - 0.6), (h - 0.25) / 2, sz * (d / 2 - 0.6)));
      }
      parts.push(torus(w / 2 - 0.35, 0.05, 0, h + 0.02, 0, { rot: [90, 0, 0], ...glow }));
      parts.push(box(w - 1, 0.18, 0.3, 0, (h - 0.25) / 2, d / 2 - 0.6));
      return parts;
    }
    case 'landing-legs': {
      const parts = [box(1.2, 0.4, 1.2, 0, h - 0.25, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(box(0.18, h, 0.18, sx * (w / 2 - 0.5), h / 2 - 0.1, sz * (d / 2 - 0.5), { rot: [sz * 22, 0, -sx * 22] }));
        parts.push(box(0.5, 0.1, 0.5, sx * (w / 2 - 0.25), 0.05, sz * (d / 2 - 0.25)));
      }
      return parts;
    }
    case 'airlock-door':
      return [
        box(0.22, h, d, -w / 2 + 0.11, h / 2, 0),
        box(0.22, h, d, w / 2 - 0.11, h / 2, 0),
        box(w, 0.22, d, 0, h - 0.11, 0),
        box(w / 2 - 0.14, h - 0.3, 0.09, -w / 4 + 0.03, (h - 0.3) / 2 + 0.05, 0.05),
        box(w / 2 - 0.14, h - 0.3, 0.09, w / 4 - 0.03, (h - 0.3) / 2 + 0.05, 0.05),
        box(0.05, h - 0.4, 0.05, 0, (h - 0.3) / 2 + 0.05, 0.08, glow),
        cyl(0.16, 0.05, 0, h - 0.55, 0.1, { rot: [90, 0, 0], ...glassy }),
      ];
    case 'airlock-frame':
      return [
        box(0.45, h, d, -w / 2 + 0.22, h / 2, 0),
        box(0.45, h, d, w / 2 - 0.22, h / 2, 0),
        box(w, 0.45, d, 0, h - 0.22, 0),
        box(w - 0.5, 0.18, d + 0.15, 0, 0.09, 0),
        box(0.07, h - 0.6, 0.07, -w / 2 + 0.5, (h - 0.6) / 2 + 0.1, d / 2, glow),
        box(0.07, h - 0.6, 0.07, w / 2 - 0.5, (h - 0.6) / 2 + 0.1, d / 2, glow),
      ];
    case 'habitat-dome':
      return [
        disc(w / 2, 0.35, 0, 0.17, 0),
        dome(w / 2 - 0.1, (h - 0.35) / (w / 2 - 0.1), 0, 0.35, 0, glassy),
        box(1.1, 1.6, 0.9, 0, 0.8, d / 2 - 0.2),
        cyl(0.3, 0.06, -1.4, 1.9, d / 2 - 0.75, { rot: [90, 0, 0], ...glassy }),
        cyl(0.3, 0.06, 1.4, 1.9, d / 2 - 0.75, { rot: [90, 0, 0], ...glassy }),
      ];
    case 'habitat-module':
      return [
        cyl(d / 2, w, 0, d / 2 + 0.25, 0, { rot: [0, 0, 90] }),
        ball(d / 2, 1, -w / 2, d / 2 + 0.25, 0),
        ball(d / 2, 1, w / 2, d / 2 + 0.25, 0),
        box(0.3, 0.5, 0.3, -w / 2 + 0.6, 0.25, -d / 2 + 0.4),
        box(0.3, 0.5, 0.3, w / 2 - 0.6, 0.25, -d / 2 + 0.4),
        box(0.3, 0.5, 0.3, -w / 2 + 0.6, 0.25, d / 2 - 0.4),
        box(0.3, 0.5, 0.3, w / 2 - 0.6, 0.25, d / 2 - 0.4),
        box(0.9, 1.5, 0.15, w * 0.18, 1.05, d / 2 - 0.05, dark),
        cyl(0.22, 0.06, -w * 0.22, 1.6, d / 2 - 0.02, { rot: [90, 0, 0], ...glassy }),
      ];
    case 'solar-wing': {
      const parts = [box(0.35, h * 0.8, 0.35, 0, h * 0.4, 0), disc(0.4, 0.1, 0, 0.05, 0)];
      for (const s of [-1, 1]) {
        parts.push(box(w * 0.44, h * 0.62, 0.07, s * (w * 0.27 + 0.1), h * 0.55, 0, { rot: [0, 0, s * 4] }));
        parts.push(box(w * 0.44, 0.06, 0.1, s * (w * 0.27 + 0.1), h * 0.55, 0));
      }
      return parts;
    }
    case 'solar-panel-ground':
      return [
        box(w - 0.2, h * 0.55, 0.08, 0, h * 0.62, -0.15, { rot: [-28, 0, 0] }),
        box(0.12, h * 0.6, 0.12, -w / 2 + 0.3, h * 0.3, 0.1),
        box(0.12, h * 0.6, 0.12, w / 2 - 0.3, h * 0.3, 0.1),
        box(0.6, 0.5, 0.4, 0, 0.25, 0.35, dark),
      ];
    case 'solar-array-field': {
      const parts = [];
      for (const fx of [-0.33, 0, 0.33]) {
        parts.push(box(1.4, 0.95, 0.07, fx * w, h * 0.68, 0, { rot: [-26, 0, 0] }));
        parts.push(cyl(0.06, h * 0.6, fx * w, h * 0.3, 0.12));
      }
      parts.push(box(w * 0.8, 0.12, 0.3, 0, 0.06, 0.3, dark));
      return parts;
    }
    case 'pipe-run':
      return [
        cyl(0.16, w, 0, 0.42, 0, { rot: [0, 0, 90] }),
        box(0.14, 0.42, 0.3, -w / 2 + 0.5, 0.21, 0),
        box(0.14, 0.42, 0.3, w / 2 - 0.5, 0.21, 0),
        torus(0.14, 0.035, 0, 0.42, d / 2 + 0.05),
        cyl(0.05, 0.3, 0, 0.68, d / 2 + 0.05),
      ];
    case 'pipe-elbow':
      return [
        cyl(0.15, h * 0.75, -w / 2 + 0.3, h * 0.37, 0),
        ball(0.17, 1, -w / 2 + 0.3, h * 0.75, 0),
        cyl(0.15, w * 0.62, w * 0.12, h * 0.75, 0, { rot: [0, 0, 90] }),
        disc(0.3, 0.08, -w / 2 + 0.3, 0.04, 0),
      ];
    case 'pipe-cluster': {
      const parts = [];
      for (const [ry, rr] of [[0.3, 0.13], [0.55, 0.11], [0.76, 0.09]]) {
        parts.push(cyl(rr, w, 0, ry, 0, { rot: [0, 0, 90] }));
      }
      for (const fx of [-0.3, 0.3]) {
        parts.push(box(0.1, 0.85, 0.5, fx * w, 0.42, 0));
      }
      parts.push(torus(0.12, 0.03, -w * 0.15, 0.55, d / 2 + 0.02));
      return parts;
    }
    case 'tank-vertical':
      return [
        cyl(w / 2, h - 0.9, 0, (h - 0.9) / 2 + 0.45, 0),
        dome(w / 2, 0.55, 0, h - 0.45, 0),
        disc(w / 2 + 0.05, 0.1, 0, 0.05, 0),
        cyl(0.06, 0.7, w / 2 - 0.1, 0.35, d / 2 - 0.2),
        box(0.04, h - 1, 0.25, w / 2 + 0.02, (h - 1) / 2 + 0.4, 0, dark),
      ];
    case 'tank-horizontal':
      return [
        cyl(d / 2, w - 0.5, 0, 0.95, 0, { rot: [0, 0, 90] }),
        ball(d / 2, 1, -(w - 0.5) / 2, 0.95, 0),
        ball(d / 2, 1, (w - 0.5) / 2, 0.95, 0),
        box(0.4, 0.55, d * 0.7, -w / 4, 0.27, 0),
        box(0.4, 0.55, d * 0.7, w / 4, 0.27, 0),
        cyl(0.06, 0.5, 0, 1.95, 0),
      ];
    case 'console':
      return [
        box(w * 0.85, 0.55, d * 0.8, 0, 0.27, -0.05),
        wedge(w, 0.5, d, 0, 0.5, 0, { rot: [0, 180, 0] }),
        box(w * 0.7, 0.4, 0.05, 0, 0.95, -0.05, { rot: [-32, 0, 0], ...glow }),
        box(0.2, 0.06, 0.15, -0.3, 0.82, 0.14, glow),
        box(0.2, 0.06, 0.15, 0.3, 0.82, 0.14, dark),
      ];
    case 'holo-pedestal':
      return [
        disc(0.42, 0.15, 0, 0.07, 0),
        cyl(0.16, h - 0.45, 0, (h - 0.45) / 2 + 0.12, 0, { rTop: 1.3 }),
        torus(0.24, 0.03, 0, h - 0.28, 0, { rot: [90, 0, 0], ...glow }),
        ball(0.14, 1, 0, h + 0.05, 0, glow),
      ];
    case 'reactor-core': {
      const parts = [
        disc(w / 2, 0.18, 0, 0.09, 0, dark),
        disc(w / 2, 0.18, 0, h - 0.09, 0, dark),
        cyl(0.3, h - 0.5, 0, h / 2, 0, glow),
        torus(0.55, 0.05, 0, h * 0.3, 0, { rot: [90, 0, 0] }),
        torus(0.55, 0.05, 0, h * 0.7, 0, { rot: [90, 0, 0] }),
      ];
      for (const fx of [-0.42, 0.42]) for (const fz of [-0.42, 0.42]) {
        parts.push(box(0.12, h, 0.12, fx * w, h / 2, fz * d));
      }
      return parts;
    }
    case 'vent-grate': return slatRun(w, h, d, 6, w - 0.3).map((part) => part);
    case 'vent-fan': {
      const parts = [
        box(w, h, d * 0.6, 0, h / 2, 0),
        torus(0.5, 0.06, 0, h / 2, d / 2 + 0.02),
        ball(0.13, 0.8, 0, h / 2, d / 2 + 0.03, dark),
      ];
      for (let i = 0; i < 3; i++) {
        parts.push(box(0.16, 0.44, 0.04, 0, h / 2, d / 2 + 0.02, { rot: [0, 0, i * 120 + 20] }));
      }
      return parts;
    }
    case 'strut-diagonal':
      return [
        box(w * 1.05, 0.22, d, 0, h / 2, 0, { rot: [0, 0, 45] }),
        box(0.4, 0.14, d + 0.06, -w / 2 + 0.2, 0.07, 0),
        box(0.4, 0.14, d + 0.06, w / 2 - 0.2, h - 0.07, 0),
      ];
    case 'truss-gantry': {
      const parts = [
        box(0.3, h * 0.82, d, -w / 2 + 0.2, h * 0.41, 0),
        box(0.3, h * 0.82, d, w / 2 - 0.2, h * 0.41, 0),
        box(w, 0.2, 0.24, 0, h - 0.1, -d / 2 + 0.15),
        box(w, 0.2, 0.24, 0, h * 0.82 - 0.1, -d / 2 + 0.15),
        box(w, 0.2, 0.24, 0, h - 0.1, d / 2 - 0.15),
        box(w, 0.2, 0.24, 0, h * 0.82 - 0.1, d / 2 - 0.15),
      ];
      for (let i = 0; i < 5; i++) {
        parts.push(box(0.14, h * 0.35, 0.14, -w / 2 + 0.7 + i * ((w - 1.4) / 4), h * 0.9, 0, { rot: [0, 0, i % 2 ? 32 : -32] }));
      }
      return parts;
    }
    case 'cryo-pod':
      return [
        disc(0.45, 0.14, 0, 0.07, 0),
        cyl(0.38, h - 0.5, 0, (h - 0.5) / 2 + 0.2, 0, glassy),
        dome(0.38, 0.6, 0, h - 0.32, 0),
        box(0.3, h - 0.7, 0.06, 0, (h - 0.5) / 2 + 0.2, -d / 2 + 0.12),
        box(0.07, h - 0.8, 0.05, 0, (h - 0.5) / 2 + 0.2, d / 2 - 0.2, glow),
        ball(0.05, 1, 0.2, h - 0.6, d / 2 - 0.2, glow),
      ];
    case 'cargo-container': {
      const parts = [box(w, h, d)];
      for (let i = 0; i < 7; i++) {
        parts.push(box(0.09, h - 0.1, 0.05, -w / 2 + 0.3 + i * ((w - 0.6) / 6), h / 2, d / 2 + 0.01));
        parts.push(box(0.09, h - 0.1, 0.05, -w / 2 + 0.3 + i * ((w - 0.6) / 6), h / 2, -d / 2 - 0.01));
      }
      parts.push(box(0.15, h, 0.15, -w / 2 + 0.08, h / 2, -d / 2 + 0.08));
      parts.push(box(0.15, h, 0.15, w / 2 - 0.08, h / 2, d / 2 - 0.08));
      return parts;
    }
    case 'barrier-energy':
      return [
        box(0.16, h, 0.3, -w / 2 + 0.1, h / 2, 0),
        box(0.16, h, 0.3, w / 2 - 0.1, h / 2, 0),
        box(w - 0.2, h - 0.25, 0.04, 0, (h - 0.25) / 2 + 0.05, 0, { ...glassy, ...glow }),
        box(0.07, 0.3, 0.07, -w / 2 + 0.1, h - 0.1, 0, glow),
        box(0.07, 0.3, 0.07, w / 2 - 0.1, h - 0.1, 0, glow),
      ];
    case 'satellite-kit':
      return [
        box(0.8, 0.9, 0.8, 0, 0.75, 0),
        box(1.5, 0.5, 0.06, -1.05, 0.8, 0),
        box(1.5, 0.5, 0.06, 1.05, 0.8, 0),
        dome(0.3, 0.5, 0, 1.25, 0.35, { rot: [-30, 0, 0] }),
        cyl(0.03, 0.7, 0.2, 1.6, -0.2),
        ball(0.045, 1, 0.2, 1.95, -0.2, glow),
        box(0.5, 0.3, 0.5, 0, 0.15, 0),
      ];
    case 'pad-marker-lights': {
      const parts = [disc(w / 2, 0.08, 0, 0.04, 0, dark)];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        parts.push(box(0.12, 0.3, 0.12, Math.sin(a) * (w / 2 - 0.2), 0.2, Math.cos(a) * (w / 2 - 0.2), glow));
      }
      parts.push(torus(0.5, 0.03, 0, 0.1, 0, { rot: [90, 0, 0], ...glow }));
      return parts;
    }
    default: return [box(w, h, d), box(w * 0.5, 0.2, d * 0.5, 0, h + 0.08, 0)];
  }
};

const GEN_FANTASY = (p) => {
  const { w, h, d } = p.size;
  switch (p.id) {
    case 'ice-shard':
      return [
        cone(w / 2, h, 0, h / 2, 0, { segments: 6, ...glassy }),
        ball(w * 0.4, 0.4, 0, 0.05, 0),
      ];
    case 'ice-shard-cluster':
      return [
        cone(0.45, h, -0.3, h / 2, 0, { segments: 6, rot: [0, 0, 7], ...glassy }),
        cone(0.34, h * 0.7, 0.42, h * 0.35, 0.2, { segments: 6, rot: [0, 0, -13], ...glassy }),
        cone(0.26, h * 0.5, 0.1, h * 0.25, -0.4, { segments: 6, rot: [10, 0, 4], ...glassy }),
        ball(w * 0.42, 0.35, 0, 0.04, 0),
      ];
    case 'ice-arch':
      return [
        box(0.5, h - 0.7, d, -(w / 2 - 0.28), (h - 0.7) / 2, 0, glassy),
        box(0.5, h - 0.7, d, w / 2 - 0.28, (h - 0.7) / 2, 0, glassy),
        prism(archBandProfile(w / 2, w / 2 - 0.45, h - w / 2 - 0.25, 10), d, glassy),
      ];
    case 'ice-fountain':
      return [
        disc(w / 2, 0.35, 0, 0.17, 0, glassy),
        disc(w / 2 - 0.2, 0.08, 0, 0.32, 0, watery),
        cone(0.3, h - 0.5, 0, (h - 0.5) / 2 + 0.3, 0, { segments: 6, ...glassy }),
        cone(0.16, 0.5, 0, h - 0.2, 0, { rot: [180, 0, 0], ...watery }),
      ];
    case 'crystal-tower':
      return [
        cone(0.5, h, 0, h / 2, 0, glow),
        box(0.7, 0.35, 0.7, -0.4, 0.17, 0.3, dark),
        box(0.55, 0.28, 0.55, 0.45, 0.14, -0.25, dark),
        cone(0.2, 0.9, 0.55, 0.45, 0.3, glow),
      ];
    case 'crystal-geode':
      return [
        dome(w / 2, 0.75, 0, 0, 0, dark),
        cone(0.18, 0.55, -0.2, 0.27, d / 2 - 0.15, { rot: [-18, 0, 6], ...glow }),
        cone(0.22, 0.7, 0.08, 0.35, d / 2 - 0.12, { rot: [-14, 0, -4], ...glow }),
        cone(0.14, 0.45, 0.32, 0.22, d / 2 - 0.18, { rot: [-20, 0, -12], ...glow }),
      ];
    case 'floating-crystal':
      return [
        cone(0.4, h * 0.55, 0, h * 0.72, 0, glow),
        cone(0.4, h * 0.45, 0, h * 0.22, 0, { rot: [180, 0, 0], ...glow }),
        torus(0.55, 0.035, 0, h * 0.47, 0, { rot: [90, 0, 0], ...glow }),
      ];
    case 'floating-island':
      return [
        cone(w * 0.42, h * 0.6, 0, h * 0.55, 0, { rot: [180, 0, 0] }),
        disc(w / 2, 0.3, 0, h * 0.85, 0),
        disc(w / 2 - 0.15, 0.16, 0, h * 0.95, 0, foliage),
        cyl(0.08, 0.6, 0.3, h * 1.05, 0.2),
        ball(0.45, 0.75, 0.3, h * 1.2, 0.2, foliage),
      ];
    case 'levitating-stones':
      return [
        ball(0.55, 0.75, -0.4, 0.45, 0),
        ball(0.45, 0.8, 0.35, 0.95, 0.2),
        ball(0.34, 0.75, 0, 1.45, -0.25),
        ball(0.12, 0.8, -0.15, 0.12, 0.3, glow),
      ];
    case 'floating-runes-ring': {
      const parts = [torus(w / 2 - 0.15, 0.06, 0, 0.2, 0, { rot: [90, 0, 0], ...glow })];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        parts.push(box(0.2, 0.1, 0.2, Math.sin(a) * (w / 2 - 0.15), 0.2, Math.cos(a) * (w / 2 - 0.15), glow));
      }
      parts.push(ball(0.14, 1, 0, 0.2, 0, glow));
      return parts;
    }
    case 'obelisk':
      return [
        box(w + 0.5, 0.3, d + 0.5, 0, 0.15, 0),
        box(w + 0.25, 0.3, d + 0.25, 0, 0.45, 0),
        pyramid(w, h - 0.85, d, 0.5, 0.6 + (h - 0.85) / 2, {}),
        box(w * 0.72, 0.35, d * 0.72, 0, h - 0.62, 0, glow),
      ];
    case 'rune-obelisk-small':
      return [
        box(w + 0.2, 0.2, d + 0.2, 0, 0.1, 0),
        pyramid(w, h - 0.2, d, 0.45),
        box(0.2, 0.5, 0.05, 0, h * 0.55, d / 2 + 0.05, glow),
      ];
    case 'altar':
      return [
        box(w, 0.25, d, 0, 0.12, 0),
        box(w - 0.3, 0.35, d - 0.25, 0, 0.42, 0),
        box(w + 0.15, 0.18, d + 0.15, 0, 0.68, 0),
        cone(0.16, 0.45, 0, 0.95, 0, glow),
        ball(0.05, 1, -w / 2 + 0.25, 0.85, d / 2 - 0.2, glow),
        ball(0.05, 1, w / 2 - 0.25, 0.85, d / 2 - 0.2, glow),
      ];
    case 'portal-frame':
      return [
        box(0.55, h - 0.6, 0.55, -(w / 2 - 0.3), (h - 0.6) / 2, 0),
        box(0.55, h - 0.6, 0.55, w / 2 - 0.3, (h - 0.6) / 2, 0),
        prism(archBandProfile(w / 2, w / 2 - 0.5, h - w / 2 - 0.35, 10), d),
        box(w - 1.1, h - 0.85, 0.06, 0, (h - 0.85) / 2 + 0.1, 0, { ...glassy, ...glow }),
        box(w * 0.8, 0.22, d + 0.3, 0, 0.11, 0),
      ];
    case 'rune-circle':
      return [
        disc(w / 2, h * 0.6, 0, h * 0.3, 0),
        torus(w / 2 - 0.2, 0.045, 0, h * 0.62, 0, { rot: [90, 0, 0], ...glow }),
        torus(0.6, 0.04, 0, h * 0.62, 0, { rot: [90, 0, 0], ...glow }),
        ball(0.12, 0.8, 0, h * 0.66, 0, glow),
      ];
    case 'dragon-perch':
      return [
        cone(w * 0.48, h - 0.4, 0, (h - 0.4) / 2, 0, { segments: 7 }),
        disc(w * 0.3, 0.25, 0, h - 0.3, 0),
        ball(0.4, 0.6, -w * 0.3, 0.1, d * 0.3),
        cone(0.2, 0.8, w * 0.32, 0.4, -d * 0.2, { rot: [0, 0, -15] }),
      ];
    case 'fairy-ring': {
      const parts = [torus(w / 2 - 0.2, 0.03, 0, 0.05, 0, { rot: [90, 0, 0], ...glow })];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.sin(a) * (w / 2 - 0.2);
        const z = Math.cos(a) * (w / 2 - 0.2);
        parts.push(cyl(0.035, 0.16, x, 0.08, z));
        parts.push(dome(0.09, 0.6, x, 0.16, z));
        if (i % 2 === 0) parts.push(ball(0.035, 1, x * 0.82, 0.1, z * 0.82, glow));
      }
      return parts;
    }
    case 'fairy-lantern-tree':
      return [
        cyl(0.16, h - 0.9, 0, (h - 0.9) / 2, 0, { rTop: 0.55 }),
        ball(1.05, 0.75, 0, h - 0.55, 0, foliage),
        ball(0.7, 0.7, 0.65, h - 1.05, 0.3, foliage),
        ball(0.09, 1, -0.55, h - 1.25, 0.2, glow),
        ball(0.08, 1, 0.4, h - 1.5, -0.3, glow),
        ball(0.07, 1, 0.1, h - 1.1, 0.55, glow),
      ];
    case 'moon-gate':
      return [
        torus(w / 2 - 0.1, 0.13, 0, h / 2 + 0.25, 0),
        box(0.6, 0.5, 0.7, -w / 2 + 0.35, 0.25, 0),
        box(0.6, 0.5, 0.7, w / 2 - 0.35, 0.25, 0),
        torus(0.4, 0.05, 0.5, h - 0.55, 0, { arc: Math.PI * 0.8, rot: [0, 0, 100], ...glow }),
      ];
    case 'spell-circle':
      return [
        disc(w / 2, h, 0, h / 2, 0),
        torus(w / 2 - 0.15, 0.035, 0, h + 0.01, 0, { rot: [90, 0, 0], ...glow }),
        cone(0.16, 0.3, 0, h + 0.12, 0, glow),
      ];
    case 'crystal-arch':
      return [
        cone(0.42, h - 0.5, -(w / 2 - 0.35), (h - 0.5) / 2, 0, { rot: [0, 0, -13], ...glow }),
        cone(0.42, h - 0.5, w / 2 - 0.35, (h - 0.5) / 2, 0, { rot: [0, 0, 13], ...glow }),
        cone(0.3, 1.2, 0, h - 0.35, 0, { rot: [0, 0, 90], ...glow }),
      ];
    case 'bone-rib': {
      const parts = [];
      for (const [r, x] of [[w / 2, 0], [w / 2 * 0.72, -0.3], [w / 2 * 0.72, 0.3]]) {
        parts.push(torus(r, 0.09, x, 0, 0, { arc: Math.PI }));
      }
      parts.push(box(w * 0.7, 0.2, 0.35, 0, 0.1, 0));
      return parts;
    }
    case 'egg-nest':
      return [
        torus(w / 2 - 0.15, 0.12, 0, 0.22, 0, { rot: [90, 0, 0] }),
        disc(w / 2 - 0.2, 0.12, 0, 0.1, 0, dark),
        ball(0.26, 1.15, -0.28, 0.3, 0.1),
        ball(0.28, 1.2, 0.25, 0.32, -0.12),
        ball(0.24, 1.1, 0.02, 0.28, 0.3),
      ];
    case 'thorn-arch':
      return [
        box(0.22, h, 0.3, -(w / 2 - 0.2), h / 2, 0, { rot: [0, 0, -9] }),
        box(0.22, h, 0.3, w / 2 - 0.2, h / 2, 0, { rot: [0, 0, 9] }),
        box(w * 0.7, 0.2, 0.28, 0, h - 0.15, 0, { rot: [0, 0, 4] }),
        cone(0.07, 0.3, -w / 2 + 0.35, h * 0.6, 0.18, { rot: [70, 0, 0] }),
        cone(0.07, 0.3, w / 2 - 0.4, h * 0.72, 0.18, { rot: [70, 0, 0] }),
        cone(0.07, 0.3, -w / 2 + 0.6, h * 0.85, 0.18, { rot: [70, 0, 0] }),
        cone(0.07, 0.3, 0, h - 0.3, 0.18, { rot: [70, 0, 0] }),
      ];
    case 'star-fragment':
      return [
        pyramid(0.85, h * 0.55, 0.85, 0, h * 0.45, glow),
        pyramid(0.85, h * 0.45, 0.85, 0, h * 0.22, { rot: [180, 0, 0], ...glow }),
        ball(0.14, 1, 0, h * 0.45, 0, glow),
      ];
    case 'cloud-platform': {
      const parts = [
        box(w * 0.8, 0.18, d * 0.8, 0, h * 0.72, 0),
        ball(w * 0.32, 0.5, -w * 0.2, h * 0.45, 0),
        ball(w * 0.28, 0.5, w * 0.22, h * 0.42, d * 0.15),
        ball(w * 0.24, 0.5, 0, h * 0.4, -d * 0.2),
        ball(w * 0.36, 0.45, 0.05, h * 0.55, 0),
      ];
      return parts;
    }
    case 'giant-fang':
      return [
        cone(0.5, h - 0.3, 0, (h - 0.3) / 2 + 0.15, 0, { rot: [0, 0, 10] }),
        ball(w * 0.42, 0.5, 0, 0.05, 0, dark),
      ];
    case 'world-tree-seed':
      return [
        ball(0.34, 0.6, 0, 0.08, 0, dark),
        cyl(0.05, 0.5, 0, 0.4, 0),
        ball(0.17, 1, 0, 0.78, 0, glow),
        cone(0.12, 0.35, -0.16, 0.55, 0.05, { rot: [0, 0, 32], ...foliage }),
        cone(0.12, 0.35, 0.16, 0.55, -0.05, { rot: [0, 0, -32], ...foliage }),
      ];
    case 'mirror-scrying':
      return [
        box(0.14, h * 0.5, 0.3, -0.35, h * 0.25, 0),
        box(0.14, h * 0.5, 0.3, 0.35, h * 0.25, 0),
        box(0.9, 0.14, 0.34, 0, 0.07, 0),
        torus(0.48, 0.06, 0, h * 0.62, 0),
        cyl(0.42, 0.05, 0, h * 0.62, 0, { rot: [90, 0, 0], ...glassy }),
        ball(0.06, 1, 0, h * 0.62 + 0.5, 0, glow),
      ];
    case 'sprite-willow':
      return [
        cyl(0.2, h - 1.1, 0, (h - 1.1) / 2, 0, { rTop: 0.5 }),
        ball(1.15, 0.8, 0, h - 0.6, 0, foliage),
        cyl(0.035, 1.1, -0.8, h - 1.5, 0.3, foliage),
        cyl(0.035, 1.3, 0.7, h - 1.6, -0.4, foliage),
        cyl(0.035, 0.9, 0.2, h - 1.4, 0.75, foliage),
        ball(0.06, 1, -0.8, h - 2.05, 0.3, glow),
        ball(0.06, 1, 0.7, h - 2.25, -0.4, glow),
        ball(0.05, 1, 0.2, h - 1.85, 0.75, glow),
      ];
    default: return [cone(w / 2, h, 0, h / 2, 0, glow)];
  }
};

// Assemble: the hand-written builders win; every other catalog
// piece is claimed by its category generator.
const CATEGORY_GENERATORS = Object.freeze({
  foundations: GEN_FOUNDATIONS,
  floors: GEN_FLOORS,
  walls: GEN_WALLS,
  roofs: GEN_ROOFS,
  access: GEN_ACCESS,
  structure: GEN_STRUCTURE,
  fittings: GEN_FITTINGS,
  spans: GEN_SPANS,
  climb: GEN_CLIMB,
  water: GEN_WATER,
  life: GEN_LIFE,
  organic: GEN_ORGANIC,
  furniture: GEN_FURNITURE,
  lighting: GEN_LIGHTING,
  scifi: GEN_SCIFI,
  fantasy: GEN_FANTASY,
});

const GENERATED_BUILDERS = {};
for (const piece of BUILDING_PIECES) {
  if (SPEC_BUILDERS[piece.id]) continue;
  const gen = CATEGORY_GENERATORS[piece.category];
  if (gen) GENERATED_BUILDERS[piece.id] = gen;
}

const ALL_BUILDERS = { ...SPEC_BUILDERS, ...GENERATED_BUILDERS };

/** The mesh spec for one catalog piece: { pieceId, parts }. */
export function pieceMeshSpec(pieceOrId) {
  const piece = typeof pieceOrId === 'string' ? pieceById(pieceOrId) : pieceOrId;
  if (!piece) return null;
  const build = ALL_BUILDERS[piece.id];
  if (!build) return null;
  return { pieceId: piece.id, parts: build(piece) };
}

/** True when every catalog piece has a spec builder. */
export function catalogRenderable() {
  return BUILDING_PIECES.every((p) => typeof ALL_BUILDERS[p.id] === 'function');
}

export const SPEC_PIECE_IDS = Object.freeze(Object.keys(ALL_BUILDERS));
