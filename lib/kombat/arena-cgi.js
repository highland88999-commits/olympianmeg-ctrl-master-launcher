// lib/kombat/arena-cgi.js — KOMBAT ARENA CGI upgrade (Merlin, 2026-11-15).
//
// Procedural CGI dressing for the brawl arenas (app/kombat/arena3d.js).
// Everything the arena was missing, per his brief:
//   * a fighting PIT with a marked ring (painted centre ring + emblem)
//   * a BRAZIER ring — torches/braziers flanking the pit, flickering
//   * EMBER MOTES + DUST/HAZE drifting over the pit
//   * DRAMATIC RIM LIGHT — faked with warm/cool glow sprites (the
//     lighting law caps real point lights at 4 per stage and Midgar is
//     already at 4, so NO real lights are added here, ever)
//   * CROWD TIERS — spectator towers at the four diagonals, instanced
//     bodies + heads that bob and lean with the fight
//
// RENDER ONLY: no gameplay, no rules, no roster, no layout change.
// Every solid piece sits OUTSIDE the play circle (clearance >=
// radius + 0.45, the kombat-arenas test's own rule); the pit ring is
// 'flat' floor detail. Deterministic: one seed per arena index, the
// same ring every load. Pure THREE + the shared world kit — no DOM,
// no Tripo, no GLB, no paid assets. Original designs only: no Mortal
// Kombat names, characters, or IP of any kind anywhere in this file.

import * as THREE from 'three';
import {
  mulberry32, rr, wmat, glowSprite, put, instanced,
  particleField, mistBanks,
} from '../../lib/worlds/environment.js';
import { crowdMaps } from '../../lib/sports/cgi.js';

// ---------------------------------------------------------------------------
// Law — the numbers the tests pin.
// ---------------------------------------------------------------------------
export const KOMBAT_CGI = {
  PIT_RING_R: 2.4, // painted ring radius (m)
  PIT_BAND_OUTER: 3.05, // dark pit band outer radius
  PIT_EMBLEM_R: 1.15, // centre emblem disc radius
  BRAZIER_COUNT: 4,
  BRAZIER_R_OFFSET: 1.2, // braziers sit this far outside the play circle
  BRAZIER_FOOTPRINT: 0.45,
  CROWD_TOWERS: 4,
  CROWD_R_OFFSET: 2.2, // crowd towers sit this far outside the play circle
  CROWD_PER_TOWER: 8, // bodies per tower (2 tiers x 4)
  CROWD_FOOTPRINT: 0.5,
  EMBER_COUNT: 90,
  HAZE_COUNT: 4,
  MAX_POINT_LIGHTS_ADDED: 0, // lighting law: glow sprites only
};

export const KOMBAT_PALETTE = {
  gold: 0xd8a93a,
  goldDeep: 0x9a7420,
  ember: 0xff7a1a,
  emberHot: 0xffc36a,
  pitDark: 0x1a0f08,
  pitBand: 0x241610,
  stone: 0x4a4238,
  stoneDark: 0x2e2822,
  rimWarm: 0xffb84d,
  rimCool: 0x7a9cc8,
  crowdShirts: ['#b91c1c', '#1d4ed8', '#b45309', '#15803d', '#7e22ce', '#e5e7eb'],
  crowdSkin: ['#d9a066', '#b07a4a', '#e8b98a', '#8a5a33'],
};

// ---------------------------------------------------------------------------
// Pit emblem — a DataTexture (node-safe, deterministic, testable pixels):
// dark pit field, twin gold rings, a gold diamond at the centre.
// ---------------------------------------------------------------------------
export function pitEmblemTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x + 0.5 - cx) / cx;
      const dy = (y + 0.5 - cy) / cy;
      const r = Math.hypot(dx, dy);
      // dark pit field with a faint radial falloff
      let f = 0.75 + 0.25 * (1 - r);
      let cr = 42 * f;
      let cg = 26 * f;
      let cb = 16 * f;
      // twin gold rings
      const ring = (rr0, w) => Math.abs(r - rr0) < w;
      if (ring(0.86, 0.035) || ring(0.62, 0.025)) {
        cr = 216; cg = 169; cb = 58;
      }
      // centre diamond
      const dia = Math.abs(dx) + Math.abs(dy);
      if (dia < 0.22) {
        const edge = dia > 0.17 ? 0.6 : 1;
        cr = 216 * edge + cr * (1 - edge);
        cg = 169 * edge + cg * (1 - edge);
        cb = 58 * edge + cb * (1 - edge);
      }
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Pure placement — deterministic from (index, radius). Tests assert on
// these without building a scene.
// ---------------------------------------------------------------------------
export function diagonalAngles(count = 4, offset = Math.PI / 4) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(offset + (i / count) * Math.PI * 2);
  return out;
}

// Crowd-tower angles per arena. Default: the two FRONT diagonals
// (45, 135 — between the camera and the pit, low enough to look over)
// plus the two SIDES (0, 180). NO tower in the back half: every duel
// stage's own set pieces (Jurassic gate + torches, canyon spires,
// Midgar neon pillars, rooftop AC boxes) live back there and the
// towers clipped them. The stage's backdrop IS the back view.
const CROWD_TOWER_ANGLES = {
  // Rooftops (3 Firehouse Roof, 5 Manhattan Rooftop): the front
  // diagonals would clip the parapet wall at z=6.2, so the crowd
  // stands east, west, and the two back corners. The back corners
  // differ per roof because the stages are asymmetric: Firehouse has
  // its AC box on the +x side only (225 is clear there, 240 is not —
  // a back vent sits at (-4.5,-8.3)); Manhattan has AC boxes on both
  // sides (240/300 clear, 225/315 are not).
  3: [0, Math.PI, Math.PI * 5 / 4, Math.PI * 5 / 3],
  5: [0, Math.PI, Math.PI * 4 / 3, Math.PI * 5 / 3],
};
const CROWD_TOWER_ANGLES_DEFAULT = [Math.PI / 4, Math.PI * 3 / 4, 0, Math.PI];

export function brazierSpotsFor(index, radius) {
  const r = radius + KOMBAT_CGI.BRAZIER_R_OFFSET;
  return diagonalAngles().map((a) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r, a, r }));
}

export function crowdTowerSpotsFor(index, radius) {
  const r = radius + KOMBAT_CGI.CROWD_R_OFFSET;
  const angles = CROWD_TOWER_ANGLES[index] || CROWD_TOWER_ANGLES_DEFAULT;
  return angles.map((a) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r, a, r }));
}

// Crowd body spots: 2 tiers x 4 per tower, on the tower tops.
export function crowdBodySpotsFor(index, radius) {
  const towers = crowdTowerSpotsFor(index, radius);
  const rng = mulberry32(4100 + index * 29);
  const spots = [];
  for (const tw of towers) {
    for (let tier = 0; tier < 2; tier++) {
      for (let k = 0; k < 4; k++) {
        const a = tw.a + (k - 1.5) * 0.05;
        const rr2 = tw.r + (tier === 0 ? -0.28 : 0.28);
        spots.push({
          x: Math.cos(a) * rr2,
          z: Math.sin(a) * rr2,
          y: tier === 0 ? 0.62 : 1.22,
          ry: -a + Math.PI / 2 + (rng() - 0.5) * 0.3,
          phase: rng() * Math.PI * 2,
        });
      }
    }
  }
  return spots;
}

// ---------------------------------------------------------------------------
// The dressing itself. Returns { group, update, counts }.
// group is named 'arena-dressing' and carries only 'flat' / 'fx' /
// 'solid-outside-circle' pieces — nothing inside the play circle.
// ---------------------------------------------------------------------------
export function buildArenaDressing(index, radius) {
  const seed = 7100 + index * 37;
  const rng = mulberry32(seed);
  void rng;
  const group = new THREE.Group();
  group.name = 'arena-dressing';
  const updaters = [];
  const counts = { pit: 0, braziers: 0, embers: 0, haze: 0, rimGlow: 0, crowdTowers: 0, crowdBodies: 0 };

  // ---- fighting pit: dark band + gold trim + centre emblem (flat) ----
  const bandMat = new THREE.MeshBasicMaterial({ color: KOMBAT_PALETTE.pitBand, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const band = new THREE.Mesh(new THREE.RingGeometry(KOMBAT_CGI.PIT_RING_R, KOMBAT_CGI.PIT_BAND_OUTER, 64), bandMat);
  band.rotation.x = -Math.PI / 2;
  band.position.y = 0.02;
  band.userData.kind = 'flat';
  group.add(band);
  const trimMat = new THREE.MeshBasicMaterial({ color: KOMBAT_PALETTE.gold, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  for (const [inner, outer] of [[2.32, 2.4], [3.05, 3.13]]) {
    const trim = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), trimMat);
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = 0.025;
    trim.userData.kind = 'flat';
    group.add(trim);
  }
  const emblem = new THREE.Mesh(
    new THREE.CircleGeometry(KOMBAT_CGI.PIT_EMBLEM_R, 40),
    new THREE.MeshBasicMaterial({ map: pitEmblemTexture(), transparent: true, depthWrite: false })
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.y = 0.03;
  emblem.userData.kind = 'flat';
  group.add(emblem);
  counts.pit = 4;

  // ---- brazier ring: instanced stone bases + bowls, flame + glow each ----
  const braziers = brazierSpotsFor(index, radius);
  const stoneMat = wmat(KOMBAT_PALETTE.stone, { roughness: 0.95 });
  const stoneDark = wmat(KOMBAT_PALETTE.stoneDark, { roughness: 1 });
  const baseItems = braziers.map((s) => ({ p: [s.x, 0.55, s.z], s: 1 }));
  const bowlItems = braziers.map((s) => ({ p: [s.x, 1.18, s.z], s: 1 }));
  const bases = instanced(new THREE.CylinderGeometry(0.34, 0.44, 1.1, 8), stoneMat, baseItems, KOMBAT_CGI.BRAZIER_FOOTPRINT);
  const bowls = instanced(new THREE.CylinderGeometry(0.5, 0.3, 0.32, 8), stoneDark, bowlItems, KOMBAT_CGI.BRAZIER_FOOTPRINT);
  group.add(bases, bowls);
  const flames = [];
  for (const s of braziers) {
    const flame = glowSprite(KOMBAT_PALETTE.emberHot, 1.5, 0.85);
    flame.position.set(s.x, 1.55, s.z);
    group.add(flame);
    const glow = glowSprite(KOMBAT_PALETTE.ember, 3.4, 0.3);
    glow.position.set(s.x, 1.5, s.z);
    group.add(glow);
    flames.push({ flame, glow, ph: s.a * 3 });
  }
  counts.braziers = braziers.length;
  updaters.push((dt, t) => {
    for (const f of flames) {
      const k = 1 + Math.sin(t * 9 + f.ph) * 0.16 + Math.sin(t * 23 + f.ph * 2) * 0.07;
      f.flame.scale.set(1.5 * k, 1.5 * (2 - k) * 0.9 + 0.4, 1);
      f.flame.material.opacity = 0.75 + Math.sin(t * 11 + f.ph) * 0.12;
    }
  });

  // ---- ember motes rising over the pit + dust haze ----
  const embers = particleField({
    count: KOMBAT_CGI.EMBER_COUNT,
    area: { x: radius * 2.4, y: 7, z: [-radius * 1.2, radius * 1.2] },
    color: KOMBAT_PALETTE.ember, size: 0.13, opacity: 0.9,
    mode: 'rise', speed: 1.1, seed: seed + 5,
  });
  group.add(embers.points);
  updaters.push(embers.update);
  counts.embers = KOMBAT_CGI.EMBER_COUNT;
  const haze = mistBanks({
    count: KOMBAT_CGI.HAZE_COUNT, color: 0x8a7a66, opacity: 0.1,
    y: 1.4, z: 0, spread: radius * 2.4, scale: [7, 2], speed: 0.16, seed: seed + 9,
  });
  group.add(haze.group);
  updaters.push(haze.update);
  counts.haze = KOMBAT_CGI.HAZE_COUNT;

  // ---- dramatic rim light, faked: warm glow behind, cool glow in front ----
  const rimWarm = glowSprite(KOMBAT_PALETTE.rimWarm, 26, 0.32);
  rimWarm.position.set(0, 5, -(radius + 4));
  group.add(rimWarm);
  const rimCool = glowSprite(KOMBAT_PALETTE.rimCool, 20, 0.2);
  rimCool.position.set(0, 3.5, radius + 4);
  group.add(rimCool);
  counts.rimGlow = 2;

  // ---- crowd tiers: 4 diagonal towers, instanced bobbing bodies ----
  const towers = crowdTowerSpotsFor(index, radius);
  const towerMat = wmat(KOMBAT_PALETTE.stone, { roughness: 0.95 });
  const crowdTex = crowdMaps(0xc0d + index);
  const crowdBandMat = new THREE.MeshStandardMaterial({ map: crowdTex.map, roughness: 0.9 });
  for (const tw of towers) {
    const t1 = put(group, new THREE.BoxGeometry(1.7, 0.55, 1.7), towerMat, tw.x, 0.28, tw.z, 'solid');
    t1.rotation.y = -tw.a;
    const t2 = put(group, new THREE.BoxGeometry(1.35, 0.55, 1.35), towerMat, tw.x, 0.83, tw.z, 'solid');
    t2.rotation.y = -tw.a;
    const band = put(group, new THREE.BoxGeometry(1.75, 0.5, 0.12), crowdBandMat, tw.x, 0.35, tw.z, 'solid');
    band.rotation.y = -tw.a;
  }
  counts.crowdTowers = towers.length;
  const spots = crowdBodySpotsFor(index, radius);
  const bodyItems = spots.map((s) => ({ p: [s.x, s.y, s.z], ry: s.ry, s: 1.25 }));
  const headItems = spots.map((s) => ({ p: [s.x, s.y + 0.62, s.z], ry: s.ry, s: 1.25 }));
  const bodies = instanced(
    new THREE.CapsuleGeometry(0.22, 0.55, 3, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    bodyItems, KOMBAT_CGI.CROWD_FOOTPRINT
  );
  const heads = instanced(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    headItems, KOMBAT_CGI.CROWD_FOOTPRINT
  );
  const shirtRng = mulberry32(seed + 21);
  const skinRng = mulberry32(seed + 22);
  const dummyColor = new THREE.Color();
  spots.forEach((s, i) => {
    dummyColor.set(KOMBAT_PALETTE.crowdShirts[Math.floor(shirtRng() * KOMBAT_PALETTE.crowdShirts.length)]);
    bodies.setColorAt(i, dummyColor);
    dummyColor.set(KOMBAT_PALETTE.crowdSkin[Math.floor(skinRng() * KOMBAT_PALETTE.crowdSkin.length)]);
    heads.setColorAt(i, dummyColor);
  });
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  group.add(bodies, heads);
  counts.crowdBodies = spots.length;
  const dummy = new THREE.Object3D();
  updaters.push((dt, t) => {
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const bob = Math.abs(Math.sin(t * (1.6 + (i % 5) * 0.35) + s.phase)) * 0.08;
      const lean = Math.sin(t * 0.9 + s.phase) * 0.05;
      dummy.position.set(s.x, s.y + bob, s.z);
      dummy.rotation.set(lean, s.ry, 0);
      dummy.scale.setScalar(1.25);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      dummy.position.y = s.y + 0.62 + bob;
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  });

  const update = (dt, t) => { for (const u of updaters) u(dt, t); };
  return { group, update, counts };
}
