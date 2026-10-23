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

import { pieceById, BUILDING_PIECES } from './catalog.js';

export const PIECE_SHAPES = Object.freeze([
  'box', 'cylinder', 'cone', 'pyramid', 'sphere', 'prism', 'torus', 'arcwall',
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

/** The mesh spec for one catalog piece: { pieceId, parts }. */
export function pieceMeshSpec(pieceOrId) {
  const piece = typeof pieceOrId === 'string' ? pieceById(pieceOrId) : pieceOrId;
  if (!piece) return null;
  const build = SPEC_BUILDERS[piece.id];
  if (!build) return null;
  return { pieceId: piece.id, parts: build(piece) };
}

/** True when every catalog piece has a spec builder. */
export function catalogRenderable() {
  return BUILDING_PIECES.every((p) => typeof SPEC_BUILDERS[p.id] === 'function');
}

export const SPEC_PIECE_IDS = Object.freeze(Object.keys(SPEC_BUILDERS));
