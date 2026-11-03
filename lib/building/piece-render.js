// lib/building/piece-render.js
// THE BUILDING TOOLKIT — PIECE RENDERING (three.js).
//
// Turns mesh specs (lib/building/piece-geometry.js) into three.js
// groups: one mesh per spec part, positioned at the part offset,
// wearing the placement's finish (colour / roughness / metalness
// from the finish def) shifted by the optional placement tint —
// a hue rotation in degrees, the exact selection the player made
// in the palette (catalog normalizeTint semantics).
//
// FINISH LOOK: the catalog's finish defs carry only a tint hex, so
// the surface character per finish lives here: glass and
// crystal-glass are translucent, iron and copper are metallic,
// marble and porcelain are polished, the rest are matte. A piece's
// 'finishGlass' parts (window panes, skylights, the sky walkway)
// go translucent only under a glassy finish — under timber they
// read as a solid shutter of the same wood. 'glow' parts wear the
// finish colour as an emissive (runes, lantern cores, crystal),
// 'water' is always bright blue, 'foliage' always leaf green,
// 'dark' a near-black inset.
//
// PERFORMANCE: geometries and materials are cached module-wide and
// SHARED between every rendered piece — a geometry is keyed by its
// shape params, a material by (finish, tint, kind). Unit
// primitives carry the size: boxes/cylinders/cones are unit-sized
// and scaled per mesh, so the cache stays tiny no matter how many
// builds stream in. Disposal follows the world scene's own rule
// (whole-graph disposal on stream release).
//
// The pure halves (shiftHue, finishMaterialSpec) are exported for
// tests; the three.js halves take THREE as an argument, like the
// rest of the Earth 2 scene code.

import { finishById, normalizeTint, normalizeOrientation, pieceById } from './catalog.js';
import { pieceMeshSpec } from './piece-geometry.js';

// LIGHT EMISSION (Merlin, 2026-11-03): lighting pieces don't just
// LOOK like lights — they ARE lights. Each entry maps a piece ID
// to its real THREE.js light: warm fire tones for torches and
// braziers, cool white for modern fixtures. The light is a child
// of the piece group, so it moves, rotates, and deletes with the
// piece — and it reflects off everything around it, because
// that's what real lights do.
const LIGHT_SPECS = {
  'torch-wall': { color: 0xff9a3c, intensity: 8, distance: 12, y: 0.5 },
  'torch-post': { color: 0xff9a3c, intensity: 10, distance: 14, y: 1.2 },
  'torch-ground': { color: 0xff9a3c, intensity: 8, distance: 12, y: 0.7 },
  'brazier': { color: 0xff7a2a, intensity: 14, distance: 18, y: 0.6 },
  'brazier-tall': { color: 0xff7a2a, intensity: 16, distance: 20, y: 1.4 },
  'fire-bowl-ground': { color: 0xff8a3a, intensity: 12, distance: 16, y: 0.3 },
  'glow-orb': { color: 0x9adfff, intensity: 10, distance: 14, y: 0 },
  'glow-orb-post': { color: 0x9adfff, intensity: 12, distance: 16, y: 1.4 },
  'strip-light': { color: 0xfff2d9, intensity: 10, distance: 14, y: 0 },
  'chandelier': { color: 0xffe6b8, intensity: 18, distance: 22, y: -0.3 },
  'street-lamp': { color: 0xffd9a0, intensity: 16, distance: 20, y: 3.2 },
  'beacon-post': { color: 0xffb060, intensity: 12, distance: 16, y: 1.0 },
  'candle-cluster': { color: 0xffa040, intensity: 6, distance: 10, y: 0.3 },
  'hanging-lantern': { color: 0xffb060, intensity: 8, distance: 12, y: -0.2 },
  'paper-lantern': { color: 0xffc080, intensity: 8, distance: 12, y: 0 },
  'wall-sconce': { color: 0xffa050, intensity: 7, distance: 11, y: 0.1 },
  'crystal-sconce': { color: 0xa0d8ff, intensity: 7, distance: 11, y: 0.1 },
  'orb-string-lights': { color: 0xffe0a0, intensity: 8, distance: 14, y: 0 },
  'mushroom-lamp': { color: 0x90e0ff, intensity: 6, distance: 10, y: 0.3 },
  'fire-pit': { color: 0xff7a2a, intensity: 14, distance: 18, y: 0.2 },
};

/** True when this piece ID emits real light. */
export function isLightPiece(pieceId) {
  return !!LIGHT_SPECS[pieceId];
}

/**
 * Attach the piece's real light to its group. Called by
 * buildPieceGroup — the light rides along with the piece
 * through placement, rotation, and deletion.
 */
export function attachPieceLight(THREE, group, pieceId) {
  const spec = LIGHT_SPECS[pieceId];
  if (!spec || !group) return null;
  const light = new THREE.PointLight(spec.color, spec.intensity, spec.distance, 1.8);
  light.position.set(0, spec.y, 0);
  group.add(light);
  // Fire lights flicker — store the base so the scene's
  // per-frame loop can breathe them.
  if (spec.color === 0xff9a3c || spec.color === 0xff7a2a || spec.color === 0xff8a3a || spec.color === 0xffa040) {
    light.userData.flicker = true;
    light.userData.baseIntensity = spec.intensity;
  }
  return light;
}

// ── Pure colour math ─────────────────────────────────────────────

/** Rotate a 0xRRGGBB colour's hue by `deg` degrees. */
export function shiftHue(hex, deg) {
  const d = normalizeTint(deg);
  if (d === null || d === 0) return hex;
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return hex; // achromatic: hue is meaningless
  const s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  let h;
  if (max === r) h = ((g - b) / (max - min) + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / (max - min) + 2) * 60;
  else h = ((r - g) / (max - min) + 4) * 60;
  h = (((h + d) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rr = 0; let gg = 0; let bb = 0;
  if (h < 60) { rr = c; gg = x; } else if (h < 120) { rr = x; gg = c; } else if (h < 180) { gg = c; bb = x; } else if (h < 240) { gg = x; bb = c; } else if (h < 300) { rr = x; bb = c; } else { rr = c; bb = x; }
  const to255 = (v) => Math.round((v + m) * 255);
  return (to255(rr) << 16) | (to255(gg) << 8) | to255(bb);
}

// Surface character per finish id: roughness / metalness, and the
// glassy flag that turns finish + finishGlass parts translucent.
const FINISH_SURFACES = Object.freeze({
  timber: { roughness: 0.85, metalness: 0.0 },
  stone: { roughness: 0.95, metalness: 0.0 },
  brick: { roughness: 0.92, metalness: 0.0 },
  sandstone: { roughness: 0.95, metalness: 0.0 },
  'mossy-stone': { roughness: 0.97, metalness: 0.0 },
  marble: { roughness: 0.3, metalness: 0.05 },
  porcelain: { roughness: 0.35, metalness: 0.05 },
  obsidian: { roughness: 0.28, metalness: 0.25 },
  iron: { roughness: 0.45, metalness: 0.85 },
  copper: { roughness: 0.4, metalness: 0.8 },
  glass: { roughness: 0.08, metalness: 0.0, glassy: true },
  'crystal-glass': { roughness: 0.05, metalness: 0.0, glassy: true },
  // Phase 3 finishes: gold is a true metal, ice is a frozen
  // glass, thatch is the roughest matte in the palette.
  gold: { roughness: 0.3, metalness: 0.95 },
  ice: { roughness: 0.12, metalness: 0.0, glassy: true },
  thatch: { roughness: 1.0, metalness: 0.0 },
});

const WATER_COLOR = 0x14608c; // the planet's deep blue (Merlin's darker-water order, 2026-10-23)
const FOLIAGE_COLOR = 0x4a7c3a;
const DARK_COLOR = 0x17130f;

/**
 * The material description for one part kind under a finish +
 * tint. Pure — the renderer turns this into a cached
 * MeshStandardMaterial. kind: 'finish' | 'finishGlass' | 'glow' |
 * 'water' | 'foliage' | 'dark'.
 */
export function finishMaterialSpec(finishId, tint, kind = 'finish') {
  const finish = finishById(finishId);
  const base = finish ? finish.tint : 0x9a8f7a;
  const surface = FINISH_SURFACES[finishId] || { roughness: 0.9, metalness: 0 };
  if (kind === 'water') {
    return {
      color: WATER_COLOR, roughness: 0.15, metalness: 0,
      transparent: true, opacity: 0.85, emissive: 0x000000, emissiveIntensity: 0,
    };
  }
  if (kind === 'foliage') {
    return {
      color: FOLIAGE_COLOR, roughness: 0.95, metalness: 0,
      transparent: false, opacity: 1, emissive: 0x000000, emissiveIntensity: 0,
    };
  }
  if (kind === 'dark') {
    return {
      color: DARK_COLOR, roughness: 0.9, metalness: 0.1,
      transparent: false, opacity: 1, emissive: 0x000000, emissiveIntensity: 0,
    };
  }
  const color = shiftHue(base, tint);
  if (kind === 'glow') {
    return {
      color, roughness: 0.4, metalness: 0,
      transparent: false, opacity: 1, emissive: color, emissiveIntensity: 0.9,
    };
  }
  const glassy = !!surface.glassy;
  return {
    color,
    roughness: surface.roughness,
    metalness: surface.metalness,
    transparent: glassy,
    opacity: glassy ? (kind === 'finishGlass' ? 0.45 : 0.6) : 1,
    emissive: 0x000000,
    emissiveIntensity: 0,
  };
}

// ── three.js construction ────────────────────────────────────────

const geometryCache = new Map();
const materialCache = new Map();
let ghostMaterials = null;

function partGeometryKey(part) {
  switch (part.shape) {
    case 'box': return 'box';
    case 'cylinder':
      return `cyl|${part.rTop ?? 1}|${part.rBottom ?? 1}|${part.segments ?? 20}|${part.thetaStart ?? 0}|${part.thetaLength ?? Math.PI * 2}|${part.openEnded ? 1 : 0}`;
    case 'cone': return `cone|${part.segments ?? 20}`;
    case 'pyramid': return `pyr|${part.top ?? 0}`;
    case 'sphere': return `sph|${part.thetaLength ?? Math.PI * 2}`;
    case 'prism': return `prism|${part.depth}|${JSON.stringify(part.profile)}`;
    case 'torus': return `tor|${part.radius}|${part.tube}|${part.arc}`;
    case 'arcwall': return `arc|${part.radius}|${part.angleDeg}`;
    case 'wedge': return 'wedge';
    default: return part.shape;
  }
}

function geometryFor(THREE, part) {
  const key = partGeometryKey(part);
  let geo = geometryCache.get(key);
  if (geo) return geo;
  switch (part.shape) {
    case 'box':
      geo = new THREE.BoxGeometry(1, 1, 1);
      break;
    case 'cylinder':
      geo = new THREE.CylinderGeometry(
        part.rTop ?? 1, part.rBottom ?? 1, 1, part.segments ?? 20, 1,
        !!part.openEnded, part.thetaStart ?? 0, part.thetaLength ?? Math.PI * 2
      );
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(1, 1, part.segments ?? 20);
      break;
    case 'pyramid':
      // A 4-sided tapered cylinder turned 45° so its flat faces
      // meet the axes; the renderer scales it so the base corners
      // land exactly on the footprint corners.
      geo = new THREE.CylinderGeometry(part.top ?? 0, 1, 1, 4, 1);
      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(
        1, 24, 16, 0, Math.PI * 2, 0, part.thetaLength ?? Math.PI * 2
      );
      break;
    case 'prism': {
      const shape = new THREE.Shape();
      part.profile.forEach(([x, y], i) => {
        if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      });
      shape.closePath();
      geo = new THREE.ExtrudeGeometry(shape, { depth: part.depth, bevelEnabled: false });
      geo.translate(0, 0, -part.depth / 2);
      break;
    }
    case 'torus':
      geo = new THREE.TorusGeometry(part.radius, part.tube, 10, 28, part.arc);
      break;
    case 'arcwall': {
      // An open cylinder shell spanning the piece's arc, centred
      // so its chord midpoint sits at local z = wall centre: the
      // cylinder axis is pushed back by R·cos(half-step).
      const step = (part.angleDeg * Math.PI) / 180;
      geo = new THREE.CylinderGeometry(
        part.radius, part.radius, 1, 14, 1, true, -step / 2, step
      );
      geo.translate(0, 0, -part.radius * Math.cos(step / 2));
      break;
    }
    case 'wedge': {
      // A right-triangle ramp in unit space: the hypotenuse falls
      // from the high edge at x = -0.5 down to x = +0.5, the base
      // spans y in [0, 1] and z in [-0.5, 0.5]. Scaled by part.size
      // exactly like the unit box (see applyPartTransform).
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, 0);
      shape.lineTo(0.5, 0);
      shape.lineTo(-0.5, 1);
      shape.closePath();
      geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      geo.translate(0, 0, -0.5);
      break;
    }
    default:
      geo = new THREE.BoxGeometry(1, 1, 1);
  }
  geometryCache.set(key, geo);
  return geo;
}

function applyPartTransform(mesh, part) {
  const [ox, oy, oz] = part.offset || [0, 0, 0];
  mesh.position.set(ox, oy, oz);
  if (part.rot) {
    mesh.rotation.set(
      (part.rot[0] || 0) * Math.PI / 180,
      (part.rot[1] || 0) * Math.PI / 180,
      (part.rot[2] || 0) * Math.PI / 180
    );
  }
  switch (part.shape) {
    case 'box':
      mesh.scale.set(part.size[0], part.size[1], part.size[2]);
      break;
    case 'cylinder':
      mesh.scale.set(part.radius, part.height, part.radius);
      break;
    case 'cone':
      mesh.scale.set(part.radius, part.height, part.radius);
      break;
    case 'pyramid': {
      const s = Math.SQRT1_2; // across-flats = scale · √2 → scale = size / √2
      mesh.scale.set(part.w * s, part.h, part.d * s);
      mesh.rotation.y += Math.PI / 4;
      break;
    }
    case 'sphere':
      mesh.scale.set(part.radius, part.radius * (part.scaleY ?? 1), part.radius);
      break;
    case 'arcwall':
      mesh.scale.set(1, part.height, 1);
      break;
    case 'wedge':
      // The wedge geometry spans y in [0, 1] from its offset, so the
      // offset is the ramp's BASE, not a centre.
      mesh.scale.set(part.size[0], part.size[1], part.size[2]);
      break;
    default:
      break; // prism + torus carry absolute geometry
  }
}

function materialFor(THREE, finishId, tint, kind, doubleSide = false) {
  const key = `${finishId}|${normalizeTint(tint) ?? ''}|${kind}|${doubleSide ? 'ds' : 'fs'}`;
  let mat = materialCache.get(key);
  if (mat) return mat;
  const spec = finishMaterialSpec(finishId, tint, kind);
  mat = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: spec.transparent,
    opacity: spec.opacity,
    emissive: spec.emissive,
    emissiveIntensity: spec.emissiveIntensity,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (spec.transparent) mat.depthWrite = false;
  materialCache.set(key, mat);
  return mat;
}

// ── Orientation (the stance beyond rotY) ─────────────────────
// A placement's orientation (catalog: 'upright' | 'flat' |
// 'flat-flip') is applied as ONE rigid transform of the whole
// part set, inside the placement group: the parts are built
// upright into a holder, and the holder is tipped over and
// re-centred so the tipped piece occupies exactly the oriented
// bounding box the footprint law (catalog.orientedSize) promises
// — flat swaps height and depth; flat-flip tips the other way,
// so the piece's working face points opposite. Upright adds no
// holder at all: the group is the parts, exactly as before.
function orientHolder(THREE, piece, orientation) {
  const holder = new THREE.Group();
  const { w, h, d } = piece.size;
  if (orientation === 'flat') {
    // Tip backward over the piece's back edge: local +y (up)
    // lands on +z, the base ends standing at z ∈ [0, h].
    holder.rotation.x = Math.PI / 2;
    holder.position.set(0, d / 2, -h / 2);
  } else {
    // 'flat-flip': tip forward over the front edge instead.
    holder.rotation.x = -Math.PI / 2;
    holder.position.set(0, d / 2, h / 2);
  }
  return holder;
}

// ── The foundation footing ─────────────────────────────────────
// Merlin's ground law (2026-10-23): "buildings are placed at
// ground level" — a foundation seated by its CENTRE on a slope
// floats at its downhill edge. A slab foundation therefore grows
// a footing: a skirt of its own footprint reaching FOOTING_M
// below its base, so the base is at or below grade on every
// side — buried where the ground rises, planted where it falls,
// never hovering. Only slab-bodied foundations qualify (a part
// box spanning the footprint at the base); post grids and
// boulders plant themselves and grow none.
export const FOOTING_M = 0.55;

export function pieceHasFooting(piece, spec) {
  if (!piece || piece.category !== 'foundations' || !spec) return false;
  return spec.parts.some((part) =>
    part.shape === 'box' &&
    Math.abs(part.size[0]) >= piece.size.w * 0.8 &&
    Math.abs(part.size[2]) >= piece.size.d * 0.8 &&
    (part.offset ? part.offset[1] : 0) - part.size[1] / 2 <= 0.05
  );
}

function footingPart(piece) {
  return {
    shape: 'box',
    size: [piece.size.w * 0.98, FOOTING_M, piece.size.d * 0.98],
    offset: [0, -FOOTING_M / 2 + 0.02, 0],
  };
}

/**
 * Build the three.js group for one placement (or bare piece id).
 * Piece-local frame: origin at ground centre, +y up — the caller
 * positions/rotates the group into the world. `orientation` is
 * the placement's stance (absent = upright).
 */
export function buildPieceGroup(THREE, pieceOrId, finishId, tint, orientation) {
  const spec = pieceMeshSpec(pieceOrId);
  const group = new THREE.Group();
  if (!spec) return group;
  const piece = pieceById(typeof pieceOrId === 'string' ? pieceOrId : pieceOrId && pieceOrId.id);
  const finish = finishId || 'timber';
  const stance = normalizeOrientation(orientation);
  const holder = stance === 'upright' || !piece ? group : orientHolder(THREE, piece, stance);
  if (holder !== group) group.add(holder);
  for (const part of spec.parts) {
    const kind = part.material || 'finish';
    const mesh = new THREE.Mesh(
      geometryFor(THREE, part),
      materialFor(THREE, finish, tint, kind, part.shape === 'arcwall')
    );
    applyPartTransform(mesh, part);
    holder.add(mesh);
  }
  if (piece && stance === 'upright' && pieceHasFooting(piece, spec)) {
    const part = footingPart(piece);
    const mesh = new THREE.Mesh(
      geometryFor(THREE, part),
      materialFor(THREE, finish, tint, 'finish', false)
    );
    applyPartTransform(mesh, part);
    group.add(mesh);
  }
  // Real light for lighting pieces (Merlin, 2026-11-03) — the
  // piece doesn't just look lit, it lights the world around it.
  const pid = typeof pieceOrId === 'string' ? pieceOrId : pieceOrId && pieceOrId.id;
  if (pid) attachPieceLight(THREE, group, pid);
  return group;
}

function ghostMats(THREE) {
  if (!ghostMaterials) {
    ghostMaterials = {
      ok: new THREE.MeshBasicMaterial({
        color: 0x2fe08a, transparent: true, opacity: 0.55, depthWrite: false,
        side: THREE.DoubleSide,
      }),
      bad: new THREE.MeshBasicMaterial({
        color: 0xff4455, transparent: true, opacity: 0.55, depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
  }
  return ghostMaterials;
}

/** The translucent ghost of a piece being aimed in build mode —
 *  same stance, footing, and FINISH as the real piece, so what you
 *  aim is what you get (Merlin, 2026-10-31: the ghost used to be a
 *  flat green silhouette — now it wears the real materials, and the
 *  lawful/unlawful verdict lives on a base ring instead). */
export function buildGhostGroup(THREE, pieceOrId, orientation, finishId, tint) {
  const spec = pieceMeshSpec(pieceOrId);
  const group = new THREE.Group();
  if (!spec) return group;
  const piece = pieceById(typeof pieceOrId === 'string' ? pieceOrId : pieceOrId && pieceOrId.id);
  const finish = finishId || 'timber';
  const stance = normalizeOrientation(orientation);
  const holder = stance === 'upright' || !piece ? group : orientHolder(THREE, piece, stance);
  if (holder !== group) group.add(holder);
  // Real materials, cloned transparent — the ghost looks like the
  // piece that will actually land, not a green silhouette.
  const ghostMat = (kind, doubleSide) => {
    const real = materialFor(THREE, finish, tint, kind, doubleSide);
    const m = real.clone();
    m.transparent = true;
    m.opacity = 0.65;
    m.depthWrite = false;
    return m;
  };
  for (const part of spec.parts) {
    const kind = part.material || 'finish';
    const mesh = new THREE.Mesh(
      geometryFor(THREE, part),
      ghostMat(kind, part.shape === 'arcwall')
    );
    applyPartTransform(mesh, part);
    mesh.userData.isGhostPiece = true;
    holder.add(mesh);
  }
  if (piece && stance === 'upright' && pieceHasFooting(piece, spec)) {
    const part = footingPart(piece);
    const mesh = new THREE.Mesh(
      geometryFor(THREE, part),
      ghostMat('finish', false)
    );
    applyPartTransform(mesh, part);
    mesh.userData.isGhostPiece = true;
    group.add(mesh);
  }
  // Validity ring at the base — green when lawful, red when not.
  // This carries the verdict now that the piece itself wears its
  // real finish.
  const ringGeo = new THREE.RingGeometry(0.45, 0.6, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x2fe08a, transparent: true, opacity: 0.9,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.userData.isValidityRing = true;
  group.add(ring);
  return group;
}

/** Recolour a ghost group's validity ring by the placement verdict.
 *  The piece meshes keep their real finish — only the ring changes. */
export function setGhostValidity(THREE, group, ok) {
  const color = ok ? 0x2fe08a : 0xff4455;
  group.traverse((node) => {
    if (node.isMesh && node.userData.isValidityRing) {
      node.material.color.setHex(color);
    }
  });
}
