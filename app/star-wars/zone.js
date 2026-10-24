/*
 * STAR WARS pocket universe — zone builder.
 *
 * buildZone(THREE, planetDef, T, opts?) assembles a full zone scene graph
 * from a plain-data planet definition. Decoupled from data.js: planetDef
 * is just an object shaped like:
 *   { id, sky, fog, fogDensity, ground, ground2, tex, groundAmp, seed,
 *     kind: 'walk' | 'fly',
 *     landmarks: [{ type, x, z, s, ry?, model? }],
 *     ambient:   [{ type, count }],
 *     characters: [{ id, model, name, at: [x, z], faceYaw, height?,
 *                    hand?, saber: { color, length } | null }],
 *     beat: { checkpoints?: [{ x, z, r, label }], target?: { x, z, r, label } },
 *     missions: [beat, ...] — when present, def.beat is missions[0],
 *     // ever-expanding world template (all optional, defaults = the
 *     // original pocket disc):
 *     worldRadius, boundsRadius, ambientRadius,
 *     canyon:  { path: [[x,z],...], width, depth },
 *     scatter: [{ kind, count, cx?, cz?, minR?, maxR?, size?, tint? }],
 *     horizon: { radius, count, color, style? } }
 *
 * opts: { mission?, freeRoam? } — `mission` overrides def.beat as the
 * active beat (its checkpoints/target/extraAmbient are honoured);
 * `freeRoam` builds the world with NO beat at all (no rings, no target,
 * no completion gating) — the same world, landmarks, life and models.
 *
 * Returns:
 *   { group, colliders, spawn, bounds, groundHeight, checkpoints, target,
 *     update, dispose, kind, sky, fog }
 *   - colliders: world-space [{x, z, r}] (landmark-local circles rotated by ry,
 *     scaled by s, offset by landmark x/z).
 *   - checkpoints / target: {x, z, r, label}. Fly-zone rings sit at y≈0 so a
 *     2D horizontal distance check works.
 *   - sky / fog are extras for the page shell (scene.background + FogExp2).
 */
import * as ThreeJS from 'three';
import { buildLandmark, buildAmbient, GLB_MODELS, attachGlbModel } from './landmarks.js';
import { buildCharacter } from './characters.js';

function R3(THREE) { return THREE || ThreeJS; }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Integer-lattice hash -> [0,1). */
function hash2(x, y, seed) {
  let h = (seed | 0) + Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function sstep(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = sstep(xf), v = sstep(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x, y, seed) {
  return vnoise(x, y, seed) * 0.55
    + vnoise(x * 2.13 + 5.2, y * 2.13 + 1.3, seed + 101) * 0.28
    + vnoise(x * 4.41 + 9.1, y * 4.41 + 3.7, seed + 202) * 0.17;
}

/* Distance from (px,pz) to the segment (ax,az)-(bx,bz). */
function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

/** Distance from (x,z) to a canyon path (array of [x,z] points). */
export function distToPath(x, z, path) {
  let d = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    d = Math.min(d, distToSeg(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]));
  }
  return d;
}

/**
 * TEMPLATE (terrain): the pure height function for a walk world —
 * seeded fbm dunes, with an optional carved canyon along def.canyon
 * ({ path: [[x,z],...], width, depth }). Shared verbatim by the
 * terrain geometry and the returned groundHeight, so what you see is
 * exactly what you walk on. Every world reuses this; only the def
 * (seed / amp / canyon) is world-specific.
 */
export function createHeightFunction(def) {
  const d = def || {};
  const seed = (d.seed >>> 0) || 1337;
  const amp = d.groundAmp != null ? d.groundAmp : 2.5;
  const canyon = d.canyon && Array.isArray(d.canyon.path) && d.canyon.path.length > 1
    ? d.canyon : null;
  return function heightAt(x, z) {
    let h = (fbm2(x * 0.018, z * 0.018, seed) - 0.5) * 2 * amp;
    if (canyon) {
      const dist = distToPath(x, z, canyon.path);
      const half = canyon.width / 2;
      if (dist < half) {
        const t = (half - dist) / (half * 0.55);
        const s = sstep(Math.max(0, Math.min(1, t)));
        // carve down, and damp the dune chop on the canyon floor so a
        // race line reads as a track bed, not a rollercoaster
        h = h * (1 - 0.3 * s) - canyon.depth * s;
      }
    }
    return h;
  };
}

/* Radial disc geometry (CircleGeometry has no interior verts for displacement). */
function makeDiscGeometry(R, radius, rings, segs, heightAt) {
  const positions = [], uvs = [], indices = [];
  for (let ri = 0; ri <= rings; ri++) {
    const r = (ri / rings) * radius;
    for (let si = 0; si <= segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      positions.push(x, heightAt(x, z), z);
      uvs.push(x / radius * 0.5 + 0.5, z / radius * 0.5 + 0.5);
    }
  }
  const row = segs + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * row + si, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, b, c, b, d, c); // +y winding
    }
  }
  const g = new R.BufferGeometry();
  g.setAttribute('position', new R.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new R.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

const TEX_BY_NAME = {
  sand: 'sandTexture', rock: 'rockTexture', ice: 'iceTexture', lava: 'lavaTexture',
  metal: 'metalTexture', leaf: 'leafTexture', water: 'waterTexture', salt: 'saltTexture',
  swamp: 'swampTexture', city: 'cityTexture',
};

/**
 * TEMPLATE (scatter): seeded instanced dressing for a walk world.
 * def.scatter entries: { kind: 'rock'|'mesa'|'vaporator', count,
 *   cx?, cz?, minR?, maxR?, size?: [min, max] } — sampled in an annulus
 * around (cx, cz), seated on heightAt, kept clear of every collider
 * (landmarks + `avoid` circles: checkpoints / target / spawn) and out
 * of the canyon cut. Instances that matter get colliders appended to
 * the shared `colliders` array. One InstancedMesh per kind (three for
 * the vaporator's parts) — no per-frame cost.
 */
/*
 * Generic scatter kinds — the biome vocabulary beyond Tatooine's
 * rock/mesa/vaporator: jungle canopy + undergrowth, swamp trees + knees,
 * ice crags + drifts, lava rock + obsidian, salt crystals, city spires,
 * ocean pylons + reeds, wreckage, dark spires, island scrub. Each kind
 * is a list of instanced parts; part.at(size, ry) gives the part's
 * local transform (y = base offset in metres, sx/sy/sz = scale, optional
 * tilt). `collider(size)` -> radius or 0: trunks, crags and wrecks are
 * solid; soft dressing (ferns, knees, drifts, crystals, reeds) is
 * walk-through. An entry may override the part colour with `tint`.
 */
const SCATTER_KINDS = {
  'canopy-tree': { // Yavin 4 / Endor / Takodana jungle
    collider: (s) => (s >= 1.6 ? 0.8 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.32, 0.55, 7, 6), color: 0x6b4a2f,
        at: (s) => ({ y: 3.5 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.SphereGeometry(3.1, 8, 6), color: 0x3e7d32,
        at: (s) => ({ y: 8.4 * s, sx: s * 1.15, sy: s * 0.8, sz: s * 1.15 }) },
    ],
  },
  'garden-tree': { // Naboo / Ahch-To round tree
    collider: (s) => (s >= 1.6 ? 0.7 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.26, 0.44, 5, 6), color: 0x7a5a36,
        at: (s) => ({ y: 2.5 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.SphereGeometry(2.6, 8, 6), color: 0x5da24a,
        at: (s) => ({ y: 6.2 * s, sx: s, sy: s * 0.9, sz: s }) },
    ],
  },
  'swamp-tree': { // Dagobah gnarlwood
    collider: (s) => (s >= 1.6 ? 0.9 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.5, 0.95, 9, 6), color: 0x4a4238,
        at: (s, ry) => ({ y: 4.4 * s, sx: s, sy: s, sz: s, tilt: 0.16, tiltDir: ry }) },
      { geo: (R) => new R.SphereGeometry(3.0, 7, 5), color: 0x39543c,
        at: (s) => ({ y: 9.6 * s, sx: s * 1.25, sy: s * 0.62, sz: s * 1.25 }) },
    ],
  },
  undergrowth: { // low foliage clump, walk-through
    parts: [
      { geo: (R) => new R.SphereGeometry(1.1, 6, 5), color: 0x4c8a3f,
        at: (s) => ({ y: 0.5 * s, sx: s, sy: s * 0.62, sz: s }) },
    ],
  },
  'swamp-knee': { // cypress knees, walk-through
    parts: [
      { geo: (R) => new R.ConeGeometry(0.42, 1.6, 5), color: 0x5a4c3a,
        at: (s) => ({ y: 0.7 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  'ice-crag': { // Hoth / Starkiller
    collider: (s) => (s >= 1.8 ? s * 0.8 : 0),
    parts: [
      { geo: (R) => new R.ConeGeometry(1, 3.4, 5), color: 0xdceef8, flat: true,
        at: (s) => ({ y: 1.6 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  'snow-drift': { // soft, walk-through
    parts: [
      { geo: (R) => new R.SphereGeometry(1.6, 7, 5), color: 0xf4f9fc,
        at: (s) => ({ y: 0.1 * s, sx: s, sy: s * 0.34, sz: s * 0.7 }) },
    ],
  },
  'lava-rock': { // Mustafar / Exegol basalt
    collider: (s) => (s >= 1.8 ? s * 0.85 : 0),
    parts: [
      { geo: (R) => new R.IcosahedronGeometry(1, 0), color: 0x35303a, flat: true,
        at: (s) => ({ y: s * 0.55, sx: s, sy: s * 0.8, sz: s }) },
    ],
  },
  obsidian: { // Mustafar spikes; tinted = Geonosis hive spikes
    collider: (s) => (s >= 1.8 ? s * 0.6 : 0),
    parts: [
      { geo: (R) => new R.ConeGeometry(0.55, 3.4, 4), color: 0x17141c, flat: true,
        at: (s) => ({ y: 1.6 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  'salt-crystal': { // Crait, walk-through
    parts: [
      { geo: (R) => new R.OctahedronGeometry(1), color: 0xf6ecec, flat: true,
        at: (s) => ({ y: 0.8 * s, sx: s * 0.6, sy: s, sz: s * 0.6 }) },
    ],
  },
  spire: { // Coruscant blocks / Bespin platform towers
    collider: (s) => s * 0.95,
    parts: [
      { geo: (R) => new R.BoxGeometry(1.6, 11, 1.6), color: 0x9aa4b4, tex: 'metalTexture',
        at: (s) => ({ y: 5.5 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.BoxGeometry(0.5, 2.6, 0.5), color: 0xffca7a, emissive: 0xcf8a2e,
        at: (s) => ({ y: 12.2 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  pylon: { // Kamino stilt platforms
    collider: (s) => (s >= 1.6 ? 0.8 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.42, 0.62, 8, 6), color: 0xb9c6cf, tex: 'metalTexture',
        at: (s) => ({ y: 4 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.SphereGeometry(1.15, 7, 5), color: 0xd7e3ea,
        at: (s) => ({ y: 8.6 * s, sx: s, sy: s * 0.6, sz: s }) },
    ],
  },
  reed: { // shallows dressing, walk-through
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.09, 0.13, 2.8, 4), color: 0x6f9a52,
        at: (s) => ({ y: 1.3 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  wreck: { // Jakku hull chunks
    collider: (s) => s * 1.5,
    parts: [
      { geo: (R) => new R.BoxGeometry(2.3, 1.25, 4.6), color: 0x8a7a63, tex: 'metalTexture',
        at: (s, ry) => ({ y: 0.5 * s, sx: s, sy: s, sz: s, tilt: 0.35, tiltDir: ry + 1.2 }) },
    ],
  },
  'dark-spire': { // Exegol lightning spires
    collider: (s) => (s >= 1.8 ? s * 0.6 : 0),
    parts: [
      { geo: (R) => new R.ConeGeometry(0.85, 6.5, 4), color: 0x23222e, flat: true,
        at: (s) => ({ y: 3.1 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  scrub: { // Ahch-To island scrub, walk-through
    parts: [
      { geo: (R) => new R.SphereGeometry(0.95, 6, 5), color: 0x71835c,
        at: (s) => ({ y: 0.42 * s, sx: s, sy: s * 0.66, sz: s }) },
    ],
  },
};

function buildScatterKind(R, entry, placed, T, heightAt, colliders) {
  const kind = SCATTER_KINDS[entry.kind];
  const group = new R.Group();
  const dummy = new R.Object3D();
  for (const part of kind.parts) {
    const matOpts = {
      color: entry.tint != null ? entry.tint : part.color,
      roughness: 0.95, flatShading: !!part.flat,
    };
    if (part.tex && T && typeof T[part.tex] === 'function') matOpts.map = T[part.tex]();
    if (part.emissive) { matOpts.emissive = part.emissive; matOpts.emissiveIntensity = 0.7; }
    const inst = new R.InstancedMesh(part.geo(R), new R.MeshStandardMaterial(matOpts), placed.length);
    placed.forEach((p, k) => {
      const tr = part.at(p.s, p.ry);
      dummy.position.set(p.x, heightAt(p.x, p.z) + (tr.y || 0) - 0.12, p.z);
      dummy.rotation.set(
        tr.tilt ? Math.cos(tr.tiltDir || 0) * tr.tilt : 0,
        p.ry,
        tr.tilt ? Math.sin(tr.tiltDir || 0) * tr.tilt : 0
      );
      dummy.scale.set(tr.sx || 1, tr.sy || 1, tr.sz || 1);
      dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false; inst.receiveShadow = false;
    group.add(inst);
  }
  if (kind.collider) {
    for (const p of placed) {
      const r = kind.collider(p.s);
      if (r > 0) colliders.push({ x: p.x, z: p.z, r });
    }
  }
  return group;
}

export function buildWorldScatter(R, def, T, heightAt, colliders, avoid) {
  const group = new R.Group();
  const entries = Array.isArray(def.scatter) ? def.scatter : [];
  if (!entries.length) return group;
  const seed = (def.seed >>> 0) || 1337;
  const rand = mulberry32(seed ^ 0x5ca7);
  const canyon = def.canyon && Array.isArray(def.canyon.path) ? def.canyon : null;
  const avoidList = Array.isArray(avoid) ? avoid : [];

  function clearOf(x, z, pad) {
    for (const c of colliders) {
      const dx = x - c.x, dz = z - c.z, rr = c.r + pad;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    for (const c of avoidList) {
      const dx = x - c.x, dz = z - c.z, rr = c.r + pad;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }
  function sample(entry, s) {
    const cx = entry.cx || 0, cz = entry.cz || 0;
    const minR = entry.minR || 0, maxR = entry.maxR || 100;
    for (let tries = 0; tries < 16; tries++) {
      const a = rand() * Math.PI * 2;
      const r = minR + rand() * (maxR - minR);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (canyon && distToPath(x, z, canyon.path) < canyon.width / 2 + s + 2) continue;
      if (!clearOf(x, z, Math.max(1.5, s * 0.6))) continue;
      return { x, z };
    }
    return null;
  }

  const dummy = new R.Object3D();
  const local = new R.Object3D();
  const m4 = new R.Matrix4();
  function setInst(inst, k, x, y, z, ry, sx, sy, sz, lx, ly, lz, lry, lsx, lsy, lsz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    local.position.set(lx, ly, lz);
    local.rotation.set(0, lry || 0, 0);
    local.scale.set(lsx == null ? 1 : lsx, lsy == null ? 1 : lsy, lsz == null ? 1 : lsz);
    local.updateMatrix();
    m4.multiplyMatrices(dummy.matrix, local.matrix);
    inst.setMatrixAt(k, m4);
  }

  for (const entry of entries) {
    const count = entry.count | 0;
    if (count <= 0) continue;
    const size = Array.isArray(entry.size) ? entry.size : [1, 1];
    const placed = [];
    for (let i = 0; i < count; i++) {
      const s = size[0] + rand() * (size[1] - size[0]);
      const p = sample(entry, s);
      if (p) placed.push({ x: p.x, z: p.z, s: s, ry: rand() * Math.PI * 2 });
    }
    if (!placed.length) continue;

    if (entry.kind === 'rock') {
      const tex = T.rockTexture();
      const inst = new R.InstancedMesh(
        new R.IcosahedronGeometry(1, 0),
        new R.MeshStandardMaterial({ map: tex, color: 0xcbb28a, flatShading: true, roughness: 1 }),
        placed.length
      );
      placed.forEach((p, k) => {
        const gy = heightAt(p.x, p.z);
        setInst(inst, k, p.x, gy + p.s * 0.18, p.z, p.ry, p.s, p.s * 0.72, p.s, 0, 0, 0);
        if (p.s >= 1.8) colliders.push({ x: p.x, z: p.z, r: p.s * 0.85 });
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = false; inst.receiveShadow = false;
      group.add(inst);
    } else if (entry.kind === 'mesa') {
      const tex = T.rockTexture();
      const inst = new R.InstancedMesh(
        new R.CylinderGeometry(1, 1.28, 1, 7),
        new R.MeshStandardMaterial({ map: tex, color: 0xd8ab6d, flatShading: true, roughness: 1 }),
        placed.length
      );
      placed.forEach((p, k) => {
        const gy = heightAt(p.x, p.z);
        const h = p.s * 0.55;
        setInst(inst, k, p.x, gy + h / 2 - p.s * 0.1, p.z, p.ry, p.s, h, p.s, 0, 0, 0);
        colliders.push({ x: p.x, z: p.z, r: p.s * 1.02 });
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = false; inst.receiveShadow = false;
      group.add(inst);
    } else if (entry.kind === 'vaporator') {
      const metal = new R.MeshStandardMaterial({
        color: 0x9aa0a6, metalness: 0.6, roughness: 0.5, flatShading: true,
      });
      const pole = new R.InstancedMesh(new R.CylinderGeometry(0.09, 0.14, 1, 6), metal, placed.length);
      const bar = new R.InstancedMesh(new R.BoxGeometry(1.9, 0.16, 0.16), metal, placed.length);
      const head = new R.InstancedMesh(new R.BoxGeometry(0.66, 0.66, 0.66), metal, placed.length);
      placed.forEach((p, k) => {
        const gy = heightAt(p.x, p.z);
        setInst(pole, k, p.x, gy, p.z, p.ry, p.s, 1, p.s, 0, 3.5, 0, 0, 1, 7, 1);
        setInst(bar, k, p.x, gy, p.z, p.ry, p.s, 1, p.s, 0, 6.1, 0);
        setInst(head, k, p.x, gy, p.z, p.ry, p.s, 1, p.s, 0, 6.6, 0);
        colliders.push({ x: p.x, z: p.z, r: 0.7 });
      });
      for (const inst of [pole, bar, head]) {
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = false; inst.receiveShadow = false;
        group.add(inst);
      }
    } else if (SCATTER_KINDS[entry.kind]) {
      group.add(buildScatterKind(R, entry, placed, T, heightAt, colliders));
    }
  }
  return group;
}

/**
 * TEMPLATE (horizon): two seeded rings of far silhouettes — flat-top
 * mesas, then wider dune cones behind them — so a big world's edge
 * reads as distance and haze instead of a disc rim. No colliders;
 * pure backdrop. def.horizon: { radius, count, color }.
 */
export function buildHorizon(R, def, heightAt) {
  const group = new R.Group();
  const hz = def.horizon;
  if (!hz) return group;
  const seed = (def.seed >>> 0) || 1337;
  const rand = mulberry32(seed ^ 0xbeef);
  const radius = hz.radius || 430;
  const count = hz.count || 16;

  const mesaMat = new R.MeshStandardMaterial({
    color: hz.color || 0xc79a58, flatShading: true, roughness: 1,
  });
  /* Horizon style picks the silhouette vocabulary: flat-top mesas
   * (default), mountain 'peaks', city 'spires', jungle 'trees', pale
   * 'ice'. Only the first ring changes; the hazed cone ring behind it
   * stays the distance cue for every style. */
  const style = hz.style || 'mesa';
  const ringGeo = style === 'spires'
    ? new R.CylinderGeometry(0.55, 0.8, 1, 6)
    : (style === 'mesa' ? new R.CylinderGeometry(1, 1.3, 1, 7) : new R.ConeGeometry(1, 1, 7));
  const mesas = new R.InstancedMesh(ringGeo, mesaMat, count);
  const dummy = new R.Object3D();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.22;
    const r = radius + (rand() - 0.5) * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let w = 30 + rand() * 42, h = 11 + rand() * 17;
    if (style === 'peaks' || style === 'ice') { w = 34 + rand() * 40; h = 20 + rand() * 26; }
    if (style === 'trees') { w = 16 + rand() * 14; h = 15 + rand() * 12; }
    if (style === 'spires') { w = 7 + rand() * 6; h = 34 + rand() * 34; }
    dummy.position.set(x, heightAt(x, z) + h / 2 - 3, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(w, h, w * (0.7 + rand() * 0.5));
    dummy.updateMatrix();
    mesas.setMatrixAt(i, dummy.matrix);
  }
  mesas.instanceMatrix.needsUpdate = true;
  mesas.castShadow = false; mesas.receiveShadow = false;
  group.add(mesas);

  const haze = new R.Color(hz.color || 0xc79a58).lerp(new R.Color(0xffffff), 0.25);
  const duneMat = new R.MeshStandardMaterial({ color: haze, flatShading: true, roughness: 1 });
  const dunes = new R.InstancedMesh(new R.ConeGeometry(1, 1, 7), duneMat, count);
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * Math.PI * 2 + rand() * 0.2;
    const r = radius * 1.45 + (rand() - 0.5) * 80;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 60 + rand() * 55, h = 8 + rand() * 10;
    dummy.position.set(x, heightAt(x, z) + h / 2 - 2.5, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(w, h, w * 0.8);
    dummy.updateMatrix();
    dunes.setMatrixAt(i, dummy.matrix);
  }
  dunes.instanceMatrix.needsUpdate = true;
  dunes.castShadow = false; dunes.receiveShadow = false;
  group.add(dunes);
  return group;
}

export function buildZone(THREE, planetDef, T, opts) {
  const R = R3(THREE);
  const def = planetDef || {};
  const options = opts || {};
  /* The active beat: an explicit mission (multi-mission worlds), the
   * def's own beat, or — in free roam — nothing at all: no rings, no
   * target pillar, nothing to complete. */
  const freeRoam = !!options.freeRoam;
  const beat = freeRoam ? {} : (options.mission || def.beat || {});
  const kind = def.kind === 'fly' ? 'fly' : 'walk';
  const seed = (def.seed >>> 0) || 1337;
  const group = new R.Group();
  const colliders = [];
  const updaters = [];
  const extraTextures = [];
  const disposers = [];
  /* The player's position, fed by the page each frame via
   * setObserver — proximity-driven dressing (lightsabers) reads it. */
  const observer = { x: 0, z: 95 };

  /* Pure height function — shared by geometry displacement and
   * groundHeight (template: createHeightFunction — dunes + optional
   * carved canyon). Fly zones stay flat. */
  const rawHeight = createHeightFunction(def);
  const heightAt = kind === 'walk' ? rawHeight : function () { return 0; };

  /* ---------- atmosphere: fog + hemisphere/directional per zone ---------- */
  const skyHex = def.sky != null ? def.sky : (kind === 'walk' ? 0x87b5e0 : 0x05070f);
  const fogHex = def.fog != null ? def.fog : skyHex;
  const fogDensity = def.fogDensity != null ? def.fogDensity : (kind === 'walk' ? 0.0075 : 0.0);
  if (kind === 'walk') {
    group.add(new R.HemisphereLight(skyHex, def.ground != null ? def.ground : 0x8a6f4d, 0.85));
    const sun = new R.DirectionalLight(0xfff2dd, 1.25);
    sun.position.set(60, 110, 35);
    group.add(sun);
  } else {
    group.add(new R.HemisphereLight(0x8899ff, 0x111122, 0.5));
    const sun = new R.DirectionalLight(0xcfe0ff, 0.9);
    sun.position.set(-40, 80, 60);
    group.add(sun);
  }

  /* ---------- terrain (walk) / starfield (fly) ---------- */
  const worldRadius = kind === 'walk' ? (def.worldRadius || 130) : 130;
  if (kind === 'walk') {
    const makerName = TEX_BY_NAME[def.tex] || 'sandTexture';
    const gtex = T[makerName]();
    extraTextures.push(gtex);
    const reps = Math.max(4, Math.round(28 * worldRadius / 130));
    gtex.repeat.set(reps, reps);
    const rings = Math.max(22, Math.round(worldRadius / 6));
    const segs = Math.max(48, Math.round(worldRadius * 0.38));
    const terrain = new R.Mesh(
      makeDiscGeometry(R, worldRadius, rings, segs, heightAt),
      new R.MeshStandardMaterial({
        color: def.ground != null ? def.ground : 0xc9a06a,
        map: gtex, roughness: 1, metalness: 0,
      })
    );
    terrain.castShadow = false; terrain.receiveShadow = false;
    group.add(terrain);
    /* Far silhouettes so a big world reads as distance, not a rim. */
    group.add(buildHorizon(R, def, heightAt));
  } else {
    const N = 1600, pos = new Float32Array(N * 3), rand = mulberry32(seed ^ 0x9e37);
    for (let i = 0; i < N; i++) {
      const r = 500 + rand() * 500;
      const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.9 - 40;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new R.BufferGeometry();
    sg.setAttribute('position', new R.BufferAttribute(pos, 3));
    group.add(new R.Points(sg, new R.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false,
    })));
  }

  /* ---------- landmarks (colliders -> world space) ---------- */
  const landmarkDefs = Array.isArray(def.landmarks) ? def.landmarks : [];
  for (const ld of landmarkDefs) {
    let built;
    try { built = buildLandmark(ld.type, R, T); }
    catch (e) { continue; } // unknown type: skip, keep the zone alive
    const s = ld.s || 1, ry = ld.ry || 0;
    built.group.position.set(ld.x || 0, kind === 'walk' ? heightAt(ld.x || 0, ld.z || 0) : 0, ld.z || 0);
    built.group.rotation.y = ry;
    built.group.scale.setScalar(s);
    group.add(built.group);
    /* GLB seat: the entry names a real model — the registry supplies
     * the colliders (the model's true footprint) and the model swaps
     * in over the procedural stand-in when it loads. */
    const glb = ld.model ? GLB_MODELS[ld.model] : null;
    if (glb) {
      try { attachGlbModel(R, built.group, ld.model); } catch (e) { /* stand-in stays */ }
    }
    const localColliders = glb ? glb.colliders : built.colliders;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (const c of localColliders) {
      colliders.push({
        x: (ld.x || 0) + (c.x * cos + c.z * sin) * s,
        z: (ld.z || 0) + (-c.x * sin + c.z * cos) * s,
        r: c.r * s,
      });
    }
  }

  /* ---------- characters (named figures; dressing in EVERY mode) ----------
   * Built before scatter and ambient life so their body colliders
   * join the shared array and the dressing keeps clear of them.
   * Never objectives: they exist identically in Free Roam and
   * Mission modes. Sabers ignite on the player's proximity. */
  const characters = [];
  if (kind === 'walk' && Array.isArray(def.characters)) {
    for (const cd of def.characters) {
      if (!cd || !Array.isArray(cd.at)) continue;
      try {
        const ch = buildCharacter(R, cd, heightAt);
        group.add(ch.group);
        colliders.push({ x: cd.at[0], z: cd.at[1], r: 0.45 });
        characters.push({
          id: cd.id || cd.model || 'figure',
          name: cd.name || cd.id || '',
          x: cd.at[0], z: cd.at[1],
        });
        const cx = cd.at[0], cz = cd.at[1];
        updaters.push(function (t, dt) {
          ch.update(t, dt, Math.hypot(observer.x - cx, observer.z - cz));
        });
        disposers.push(function () { ch.dispose(); });
      } catch (e) { /* a bad character def never kills the zone */ }
    }
  }

  /* ---------- world scatter (seeded instanced dressing) ---------- */
  if (kind === 'walk' && Array.isArray(def.scatter) && def.scatter.length) {
    /* Scatter stays clear of EVERY mission's gates (not just the one
     * being played) — a world is dressed once, then roamed and raced
     * in any mode. */
    const avoid = [];
    const missionList = Array.isArray(def.missions) && def.missions.length
      ? def.missions : [def.beat || {}];
    for (const m of missionList) {
      for (const cp of (Array.isArray(m.checkpoints) ? m.checkpoints : [])) {
        avoid.push({ x: cp.x, z: cp.z, r: (cp.r || 5) + 3 });
      }
      if (m.target) avoid.push({ x: m.target.x, z: m.target.z, r: (m.target.r || 6) + 3 });
    }
    avoid.push({ x: 0, z: 95, r: 9 }); // spawn clearing
    group.add(buildWorldScatter(R, def, T, heightAt, colliders, avoid));
  }

  /* ---------- ambient creatures (seeded scatter, clear of landmarks) ---------- */
  /* The active mission may add hazard/flavour ambient life on top of
   * the world's baseline (mission.extraAmbient) — e.g. more Tuskens in
   * the gauntlet. Free roam and other missions keep the baseline. */
  const ambientDefs = (Array.isArray(def.ambient) ? def.ambient : [])
    .concat(!freeRoam && Array.isArray(beat.extraAmbient) ? beat.extraAmbient : []);
  const arand = mulberry32(seed ^ 0x51f7);
  function clearOfLandmarks(x, z, pad) {
    for (const c of colliders) {
      const dx = x - c.x, dz = z - c.z, rr = c.r + pad;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }
  const ambientMaxR = def.ambientRadius || 100;
  for (const ad of ambientDefs) {
    const n = ad.count | 0;
    for (let i = 0; i < n; i++) {
      let px = 0, pz = 0, ok = false;
      for (let tries = 0; tries < 14 && !ok; tries++) {
        const a = arand() * Math.PI * 2, r = 14 + arand() * (ambientMaxR - 14);
        px = Math.cos(a) * r; pz = Math.sin(a) * r;
        ok = clearOfLandmarks(px, pz, 4);
      }
      if (!ok) continue;
      try {
        const amb = buildAmbient(ad.type, R, T);
        amb.group.position.set(px, heightAt(px, pz), pz);
        group.add(amb.group);
        updaters.push(function (t, dt) { amb.update(t, dt); });
      } catch (e) { /* unknown ambient: skip */ }
    }
  }

  /* ---------- checkpoint rings ---------- */
  const checkpoints = [];
  const cpDefs = Array.isArray(beat.checkpoints) ? beat.checkpoints : [];
  function makeLabel(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(8,10,18,0.72)';
      ctx.fillRect(0, 8, 256, 48);
      ctx.strokeStyle = '#ffcf5e'; ctx.lineWidth = 3;
      ctx.strokeRect(2, 10, 252, 44);
      ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(text).slice(0, 18), 128, 33);
    }
    const tex = new R.CanvasTexture(cv);
    tex.colorSpace = R.SRGBColorSpace;
    extraTextures.push(tex);
    const sp = new R.Sprite(new R.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(14, 3.5, 1);
    return sp;
  }
  for (const cp of cpDefs) {
    const cy = kind === 'walk' ? heightAt(cp.x, cp.z) + 6 : 0;
    const ring = new R.Mesh(
      new R.TorusGeometry(4, 0.28, 10, 40),
      new R.MeshStandardMaterial({
        color: 0xffc63a, emissive: 0xff9d00, emissiveIntensity: 1.4,
        roughness: 0.4, metalness: 0.3,
      })
    );
    ring.position.set(cp.x, cy, cp.z);
    ring.castShadow = false; ring.receiveShadow = false;
    group.add(ring);
    let label = null;
    if (cp.label) {
      label = makeLabel(cp.label);
      label.position.set(cp.x, cy + 5.5, cp.z);
      group.add(label);
    }
    const phase = cp.x * 1.7 + cp.z;
    updaters.push(function (t, dt) {
      ring.rotation.y += dt * 1.2;
      ring.position.y = cy + Math.sin(t * 1.6 + phase) * 0.5;
      if (label) label.position.y = cy + 5.5 + Math.sin(t * 1.6 + phase) * 0.5;
    });
    checkpoints.push({ x: cp.x, z: cp.z, r: cp.r || 5, label: cp.label || '' });
  }

  /* ---------- target: light pillar + ground ring ---------- */
  let target = null;
  if (beat.target) {
    const tg = beat.target;
    const ty = heightAt(tg.x, tg.z);
    const pillar = new R.Mesh(
      new R.CylinderGeometry(1.4, 2.2, 70, 12, 1, true),
      new R.MeshBasicMaterial({
        color: 0x9fdcff, transparent: true, opacity: 0.28,
        blending: R.AdditiveBlending, side: R.DoubleSide, depthWrite: false, fog: false,
      })
    );
    pillar.position.set(tg.x, ty + 32, tg.z);
    group.add(pillar);
    const gring = new R.Mesh(
      new R.TorusGeometry(tg.r || 6, 0.3, 8, 48),
      new R.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.7, fog: false })
    );
    gring.rotation.x = -Math.PI / 2;
    gring.position.set(tg.x, ty + 0.4, tg.z);
    group.add(gring);
    updaters.push(function (t) {
      pillar.material.opacity = 0.22 + Math.sin(t * 2.2) * 0.08;
      gring.rotation.z += 0.004;
    });
    target = { x: tg.x, z: tg.z, r: tg.r || 6, label: tg.label || '' };
  }

  /* ---------- emissive pulse: anything tagged userData.pulse ---------- */
  group.traverse(function (o) {
    if ((o.isMesh || o.isSprite) && o.userData && o.userData.pulse && o.material) {
      const m = o.material;
      const base = (m.opacity == null ? 1 : m.opacity);
      const ph = (o.position.x * 1.3 + o.position.z) % 6.28;
      updaters.push(function (t) { m.opacity = base * (0.82 + 0.18 * Math.sin(t * 2 + ph)); });
    }
  });

  const spawn = kind === 'walk'
    ? { x: 0, z: 95, yaw: Math.PI }
    : { x: 0, z: 120, yaw: Math.PI };
  const bounds = kind === 'walk'
    ? { kind: 'circle', max: def.boundsRadius || 115 }
    : { kind: 'circle', max: def.boundsRadius || 150 };

  function update(t, dt) {
    for (const u of updaters) u(t, dt);
  }

  function dispose() {
    for (const d of disposers) { try { d(); } catch (e) { /* noop */ } }
    group.traverse(function (o) {
      if (o.isMesh || o.isPoints || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          if (m.map) { try { m.map.dispose(); } catch (e) { /* noop */ } }
          try { m.dispose(); } catch (e) { /* noop */ }
        }
      }
    });
    for (const t of extraTextures) { try { t.dispose(); } catch (e) { /* noop */ } }
  }

  return {
    group: group,
    colliders: colliders,
    spawn: spawn,
    bounds: bounds,
    groundHeight: heightAt,
    checkpoints: checkpoints,
    target: target,
    characters: characters,
    setObserver: function (x, z) { observer.x = x; observer.z = z; },
    update: update,
    dispose: dispose,
    /* extras for the page shell (scene setup) */
    kind: kind,
    sky: skyHex,
    fog: { color: fogHex, density: fogDensity },
  };
}
