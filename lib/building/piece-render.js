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

import { finishById, normalizeTint } from './catalog.js';
import { pieceMeshSpec } from './piece-geometry.js';

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
});

const WATER_COLOR = 0x2f9fd8; // the planet's own clear bright blue
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
    case 'pyramid': return 'pyr';
    case 'sphere': return `sph|${part.thetaLength ?? Math.PI * 2}`;
    case 'prism': return `prism|${part.depth}|${JSON.stringify(part.profile)}`;
    case 'torus': return `tor|${part.radius}|${part.tube}|${part.arc}`;
    case 'arcwall': return `arc|${part.radius}|${part.angleDeg}`;
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

/**
 * Build the three.js group for one placement (or bare piece id).
 * Piece-local frame: origin at ground centre, +y up — the caller
 * positions/rotates the group into the world.
 */
export function buildPieceGroup(THREE, pieceOrId, finishId, tint) {
  const spec = pieceMeshSpec(pieceOrId);
  const group = new THREE.Group();
  if (!spec) return group;
  const finish = finishId || 'timber';
  for (const part of spec.parts) {
    const kind = part.material || 'finish';
    const mesh = new THREE.Mesh(
      geometryFor(THREE, part),
      materialFor(THREE, finish, tint, kind, part.shape === 'arcwall')
    );
    applyPartTransform(mesh, part);
    group.add(mesh);
  }
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

/** The translucent ghost of a piece being aimed in build mode. */
export function buildGhostGroup(THREE, pieceOrId) {
  const spec = pieceMeshSpec(pieceOrId);
  const group = new THREE.Group();
  if (!spec) return group;
  const mats = ghostMats(THREE);
  for (const part of spec.parts) {
    const mesh = new THREE.Mesh(geometryFor(THREE, part), mats.ok);
    applyPartTransform(mesh, part);
    group.add(mesh);
  }
  return group;
}

/** Recolour a ghost group by the placement verdict. */
export function setGhostValidity(THREE, group, ok) {
  const mats = ghostMats(THREE);
  const mat = ok ? mats.ok : mats.bad;
  group.traverse((node) => {
    if (node.isMesh) node.material = mat;
  });
}
