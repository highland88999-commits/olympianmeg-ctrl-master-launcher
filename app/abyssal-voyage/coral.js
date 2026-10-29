/**
 * Abyssal Voyage — procedural coral reef system (Merlin, 2026-10-29).
 * The dive ends at the seafloor: coral reefs and coral life grow on the
 * trench walls and floor in the hadal zone. All procedural, zero network.
 *
 * Coral types:
 *  - staghorn: branching cylinders (recursive, 3 levels)
 *  - fan: flat rippled planes
 *  - tube: anemone-like tubes with a pulsing crown
 *  - polyp: small glowing dots (coral life) scattered on rock
 *
 * Pure geometry builders (headless-testable) + a CoralField class that
 * owns the three.js meshes, fades them in by depth, and animates the
 * living parts (polyp pulse, anemone sway).
 */

import * as THREE from 'three';

export const CORAL_DEPTH_START = 7500; // reefs fade in approaching the hadal zone
export const CORAL_DEPTH_FULL = 9000; // fully grown at the trench floor

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0..1 reef visibility for a depth in meters. */
export function coralVisibility(depth) {
  if (depth <= CORAL_DEPTH_START) return 0;
  if (depth >= CORAL_DEPTH_FULL) return 1;
  return (depth - CORAL_DEPTH_START) / (CORAL_DEPTH_FULL - CORAL_DEPTH_START);
}

/** Merge a list of BufferGeometries (same attributes) into one. */
export function mergeGeometries(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : 0;
  }
  const pos = new Float32Array(vCount * 3);
  const norm = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
  let vo = 0, io = 0;
  const c = new THREE.Color();
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) norm.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.color) {
      col.set(g.attributes.color.array, vo * 3);
    } else {
      c.set(g.userData.color || 0xffffff);
      for (let i = 0; i < n; i++) { col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b; }
    }
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
      io += ia.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function tinted(geo, hex) {
  geo.userData.color = hex;
  return geo;
}

/** Recursive staghorn branch. */
function branch(rng, mat4, len, rad, level, geos, palette) {
  const seg = new THREE.CylinderGeometry(rad * 0.7, rad, len, 5, 1);
  seg.applyMatrix4(mat4);
  tinted(seg, palette[Math.floor(rng() * palette.length)]);
  geos.push(seg);
  if (level <= 0) {
    // tip polyp bud
    const bud = new THREE.SphereGeometry(rad * 1.4, 6, 5);
    const tip = new THREE.Matrix4().makeTranslation(0, len / 2, 0).premultiply(mat4);
    bud.applyMatrix4(tip);
    tinted(bud, 0xfff2cc);
    geos.push(bud);
    return;
  }
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Matrix4()
      .makeRotationY((i / n) * Math.PI * 2 + rng() * 0.8)
      .premultiply(new THREE.Matrix4().makeRotationZ(0.5 + rng() * 0.5))
      .premultiply(new THREE.Matrix4().makeTranslation(0, len / 2, 0))
      .premultiply(mat4);
    branch(rng, m, len * (0.55 + rng() * 0.2), rad * 0.65, level - 1, geos, palette);
  }
}

/** Staghorn coral colony. Returns geometry, ~1-3 units tall. */
export function staghornCoral(seed, palette) {
  const rng = mulberry(seed);
  const geos = [];
  const base = new THREE.Matrix4().makeRotationX((rng() - 0.5) * 0.3);
  branch(rng, base, 0.9 + rng() * 0.6, 0.09, 3, geos, palette);
  return mergeGeometries(geos);
}

/** Sea fan: a rippled vertical plane. */
export function fanCoral(seed, palette) {
  const rng = mulberry(seed);
  const geo = new THREE.PlaneGeometry(1.6 + rng() * 0.8, 1.2 + rng() * 0.6, 8, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.sin(x * 4 + seed) * 0.12 + Math.cos(y * 5) * 0.08);
  }
  geo.computeVertexNormals();
  tinted(geo, palette[Math.floor(rng() * palette.length)]);
  return geo;
}

/** Tube anemone: a tube with a crown of tentacles (separate mesh for sway). */
export function tubeAnemone(seed, palette) {
  const rng = mulberry(seed);
  const tube = new THREE.CylinderGeometry(0.16, 0.22, 0.9 + rng() * 0.5, 7, 1);
  tinted(tube, palette[Math.floor(rng() * palette.length)]);
  const crownGeos = [];
  const tentN = 10 + Math.floor(rng() * 6);
  for (let i = 0; i < tentN; i++) {
    const a = (i / tentN) * Math.PI * 2;
    const tent = new THREE.ConeGeometry(0.045, 0.5 + rng() * 0.3, 5);
    const m = new THREE.Matrix4()
      .makeRotationZ(0.9)
      .premultiply(new THREE.Matrix4().makeRotationY(a))
      .premultiply(new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.14, 0.55, Math.sin(a) * 0.14));
    tent.applyMatrix4(m);
    tinted(tent, 0xffe9a8);
    crownGeos.push(tent);
  }
  return { tube: mergeGeometries([tube]), crown: mergeGeometries(crownGeos) };
}

const REEF_PALETTES = [
  [0xff6b9d, 0xff8fb3, 0xf45d7c], // pink staghorn
  [0xff9a3c, 0xffb36b, 0xf47c20], // orange fan
  [0x9d6bff, 0xb794ff, 0x7c4dff], // purple tube
  [0x3ce88b, 0x6bffb8, 0x20c46b], // green algae
];

/**
 * CoralField: owns the reef meshes in the dive scene.
 * Corals are scattered on both trench walls + the floor, fade in by
 * depth, and the living parts (anemone crowns, polyp glow) animate.
 */
export class CoralField {
  constructor(scene, count = 46) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.anemones = []; // { crown, phase }
    this.polyps = null;
    this.rng = mulberry(20261029);

    const statics = [];
    for (let i = 0; i < count; i++) {
      const palette = REEF_PALETTES[Math.floor(this.rng() * REEF_PALETTES.length)];
      const side = this.rng() < 0.5 ? -1 : 1;
      const kind = this.rng();
      let geo;
      if (kind < 0.45) geo = staghornCoral(Math.floor(this.rng() * 1e9), palette);
      else if (kind < 0.75) geo = fanCoral(Math.floor(this.rng() * 1e9), palette);
      else {
        const { tube } = tubeAnemone(Math.floor(this.rng() * 1e9), palette);
        geo = tube;
      }
      // scatter: walls at |x| 24-36, floor y -14..-10, spread in z
      const px = side * (24 + this.rng() * 12);
      const py = -14 + this.rng() * 5;
      const pz = -110 + this.rng() * 130;
      const s = 0.8 + this.rng() * 1.6;
      geo.applyMatrix4(new THREE.Matrix4().makeRotationY(this.rng() * Math.PI * 2)
        .premultiply(new THREE.Matrix4().makeScale(s, s, s))
        .premultiply(new THREE.Matrix4().makeTranslation(px, py, pz)));
      statics.push(geo);
    }
    const staticGeo = mergeGeometries(statics);
    this.staticMesh = new THREE.Mesh(staticGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.8, metalness: 0.05,
    }));
    this.group.add(this.staticMesh);

    // anemone crowns (animated separately for sway)
    for (let i = 0; i < 14; i++) {
      const palette = REEF_PALETTES[2];
      const { crown } = tubeAnemone(Math.floor(this.rng() * 1e9), palette);
      const m = new THREE.Mesh(crown, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.7, emissive: 0x442200, emissiveIntensity: 0.4,
      }));
      const side = this.rng() < 0.5 ? -1 : 1;
      m.position.set(side * (24 + this.rng() * 12), -13 + this.rng() * 4, -110 + this.rng() * 130);
      const s = 0.9 + this.rng() * 1.2;
      m.scale.setScalar(s);
      m.rotation.y = this.rng() * Math.PI * 2;
      this.group.add(m);
      this.anemones.push({ crown: m, phase: this.rng() * Math.PI * 2 });
    }

    // polyp glow points (coral life): tiny lights on the reef
    const pn = 220;
    const pp = new Float32Array(pn * 3);
    for (let i = 0; i < pn; i++) {
      const side = this.rng() < 0.5 ? -1 : 1;
      pp[i * 3] = side * (23 + this.rng() * 14);
      pp[i * 3 + 1] = -13.5 + this.rng() * 5;
      pp[i * 3 + 2] = -110 + this.rng() * 130;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.polyps = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0x7dffd4, size: 0.28, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.polyps.frustumCulled = false;
    this.group.add(this.polyps);
  }

  /** depth in meters, t in seconds. */
  update(depth, t) {
    const v = coralVisibility(depth);
    this.group.visible = v > 0.01;
    if (!this.group.visible) return;
    // fade the whole reef in (materials share opacity via transparent flag)
    this.staticMesh.material.transparent = true;
    this.staticMesh.material.opacity = v;
    this.polyps.material.opacity = 0.9 * v;
    // living motion: anemone crowns sway, polyps pulse
    for (const a of this.anemones) {
      a.crown.rotation.z = Math.sin(t * 1.3 + a.phase) * 0.12;
      a.crown.rotation.x = Math.cos(t * 0.9 + a.phase) * 0.1;
    }
    this.polyps.material.size = 0.28 + Math.sin(t * 2.2) * 0.07;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
