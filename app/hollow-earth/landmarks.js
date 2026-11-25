// OLYMPIAN MONSTERVERSE — procedural landmarks (pure geometry).
//
// Every landmark is built from primitives in code: no GLB is
// required for the world to stand. The collider contract is the
// same as the saga's — the returned group's userData.colliderR
// covers the visual hull, and zone.js turns it into a solid
// {x, z, r} circle. Monster models are NOT landmarks: they live
// in spawns.js (MONSTER_MODELS), where the Tripo GLBs will land.

import { sharedTexture } from './textures.js';

export const LANDMARK_TYPES = [
  'ooze-pool', 'ember-spire', 'storm-pylon', 'mire-arch',
  'gloom-monolith', 'wreck-hulk', 'peak-shrine', 'frost-spire',
  'korus-throne', 'intro-arch', 'haven', 'court-brazier',
];

/* Dive round (Nov 24): every body mesh wears a procedural map —
 * mat(color, extra, mapTex) adds the map only when the textures
 * module has that maker; a stub T leaves the material flat, never
 * a crash. Colour rule (textures.js): white where the texture
 * carries the colour, the old colour kept where the texture is
 * a pale/neutral grain. Glow pieces (emissive orbs, flame, the
 * Haven dome/pole) stay flat on purpose — a map would fight
 * the glow. The jpg art faces are untouched. */
function mat(color, extra, mapTex) {
  const m = { color, roughness: 0.8, metalness: 0.1, ...(extra || {}) };
  if (mapTex) m.map = mapTex;
  return m;
}

function mesh(R, geo, m, x, y, z, ry) {
  const o = new R.Mesh(geo, new R.MeshStandardMaterial(m));
  o.position.set(x, y, z);
  if (ry) o.rotation.y = ry;
  return o;
}

export function buildLandmark(type, R, T = {}, art = null) {
  const g = new R.Group();
  let colliderR = 3;
  const M = (geo, m, x, y, z, ry) => { const o = mesh(R, geo, m, x, y, z, ry); g.add(o); return o; };
  // One shared texture per maker for this build (null on a stub T).
  const tex = (name) => sharedTexture(T, name);

  if (type === 'ooze-pool') {
    colliderR = 6;
    M(new R.CylinderGeometry(6, 6.4, 0.5, 20), mat(0xffffff, null, tex('acidBubbleTexture')), 0, 0.25, 0);
    // G-05: the inner disc + bubble spheres are kept as refs so
    // the zone can pulse them per frame (emissive breathe + bob).
    const disc = M(new R.CylinderGeometry(5, 5, 0.2, 20), mat(0xffffff, { emissive: 0x4a7a28, emissiveIntensity: 0.6 }, tex('acidBubbleTexture')), 0, 0.55, 0);
    const bubbles = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      bubbles.push(M(new R.SphereGeometry(0.5, 8, 6), mat(0xffffff, null, tex('acidBubbleTexture')), Math.cos(a) * 3, 0.9, Math.sin(a) * 3));
    }
    g.userData.oozePool = { disc, bubbles };
  } else if (type === 'ember-spire') {
    colliderR = 3;
    M(new R.CylinderGeometry(0.6, 2.2, 9, 7), mat(0xffffff, null, tex('emberRockTexture')), 0, 4.5, 0);
    M(new R.ConeGeometry(1.1, 3, 7), mat(0xff6a22, { emissive: 0xff4400, emissiveIntensity: 1.2 }), 0, 10.5, 0);
    M(new R.CylinderGeometry(3, 3.4, 0.8, 8), mat(0xffffff, null, tex('emberRockTexture')), 0, 0.4, 0);
  } else if (type === 'storm-pylon') {
    colliderR = 2.5;
    M(new R.CylinderGeometry(0.5, 0.8, 12, 8), mat(0x8a907e, { metalness: 0.6 }, tex('rustedMetalTexture')), 0, 6, 0);
    M(new R.TorusGeometry(2, 0.18, 6, 20), mat(0xffe14d, { emissive: 0xccaa00, emissiveIntensity: 1 }), 0, 11, 0);
    M(new R.SphereGeometry(0.7, 10, 8), mat(0xfff2a8, { emissive: 0xffe14d, emissiveIntensity: 1.4 }), 0, 12.6, 0);
  } else if (type === 'mire-arch') {
    colliderR = 4;
    M(new R.CylinderGeometry(0.9, 1.1, 6, 7), mat(0xffffff, null, tex('poisonStoneTexture')), -3, 3, 0);
    M(new R.CylinderGeometry(0.9, 1.1, 6, 7), mat(0xffffff, null, tex('poisonStoneTexture')), 3, 3, 0);
    M(new R.BoxGeometry(8.5, 1.2, 1.4), mat(0xffffff, null, tex('poisonStoneTexture')), 0, 6.4, 0);
    M(new R.SphereGeometry(1.1, 8, 6), mat(0xc06ae0, { emissive: 0x7a2aa0, emissiveIntensity: 0.8 }), 0, 7.4, 0);
  } else if (type === 'gloom-monolith') {
    colliderR = 3;
    M(new R.BoxGeometry(3, 14, 1.6), mat(0xffffff, null, tex('darkStoneTexture')), 0, 7, 0);
    M(new R.BoxGeometry(3.6, 1, 2.2), mat(0xffffff, null, tex('darkStoneTexture')), 0, 0.5, 0);
    M(new R.SphereGeometry(0.5, 8, 6), mat(0x8a8a9a, { emissive: 0x555560, emissiveIntensity: 0.8 }), 0, 12.5, 0);
  } else if (type === 'wreck-hulk') {
    colliderR = 7;
    const hull = M(new R.BoxGeometry(11, 2.2, 4), mat(0xffffff, { metalness: 0.4 }, tex('woodTexture')), 0, 1.4, 0, 0.5);
    hull.rotation.z = 0.22;
    for (let i = -2; i <= 2; i++) {
      M(new R.BoxGeometry(0.5, 3.4, 3.6), mat(0xffffff, null, tex('woodTexture')), i * 2.2, 2.6, 0, 0.5);
    }
    M(new R.CylinderGeometry(0.9, 0.9, 5, 8), mat(0xffffff, null, tex('rustedMetalTexture')), 5.5, 1, 0, 0.5);
  } else if (type === 'peak-shrine') {
    colliderR = 4;
    M(new R.CylinderGeometry(1.5, 3.5, 2, 7), mat(0x6e6e78, null, tex('mountainStoneTexture')), 0, 1, 0);
    M(new R.CylinderGeometry(0.8, 2.2, 3, 6), mat(0x7a7a82, null, tex('mountainStoneTexture')), 0, 3, 0);
    M(new R.ConeGeometry(0.7, 4.5, 4), mat(0xd8d8e0, { emissive: 0x888899, emissiveIntensity: 0.4 }, tex('iceTexture')), 0, 6.5, 0);
    // G-09: white snow cap on the cone tip — MeshBasicMaterial,
    // no light, just the pale read against the storm sky.
    const cap = new R.Mesh(
      new R.ConeGeometry(0.34, 1.3, 4),
      new R.MeshBasicMaterial({ color: 0xffffff })
    );
    cap.position.set(0, 8.3, 0);
    g.add(cap);
  } else if (type === 'frost-spire') {
    // The Frozen Reaches marker: a pale ice crystal spire on a
    // frost base — the yeti's band, visible from the wastes.
    colliderR = 3;
    M(new R.CylinderGeometry(2.6, 3, 0.8, 7), mat(0x8aa0b0, null, tex('iceTexture')), 0, 0.4, 0);
    M(new R.ConeGeometry(1.2, 8, 6), mat(0x9fd8e8, { emissive: 0x4a7a8a, emissiveIntensity: 0.7 }, tex('iceTexture')), 0, 5, 0);
    M(new R.ConeGeometry(0.6, 4, 5), mat(0xe8f4f8, { emissive: 0x9fd8e8, emissiveIntensity: 0.5 }, tex('iceTexture')), 1.4, 3, 0.8);
    M(new R.ConeGeometry(0.6, 4, 5), mat(0xe8f4f8, { emissive: 0x9fd8e8, emissiveIntensity: 0.5 }, tex('iceTexture')), -1.4, 3, -0.8);
    // G-09: white snow caps on the spire tips — basic material, no light.
    const capMain = new R.Mesh(
      new R.ConeGeometry(0.42, 1.6, 6),
      new R.MeshBasicMaterial({ color: 0xffffff })
    );
    capMain.position.set(0, 8.5, 0);
    g.add(capMain);
    const capSide = new R.Mesh(
      new R.ConeGeometry(0.22, 0.9, 5),
      new R.MeshBasicMaterial({ color: 0xffffff })
    );
    capSide.position.set(1.4, 4.7, 0.8);
    g.add(capSide);
  } else if (type === 'court-brazier') {
    // G-10: a brazier for Korus's COURT APPROACH only — never the
    // throne itself. Dark stone bowl + a breathing flame cone +
    // a glow dome, all emissive/basic material: ZERO new lights
    // (the lava-glow.js "breathing flame cones + glow dome, no
    // new light" shape). The flame cone breathes via
    // animateLandmark() (scale pulse); the dome is a static glow.
    colliderR = 1.5;
    M(new R.CylinderGeometry(0.9, 1.2, 1.4, 7), mat(0xffffff, null, tex('darkStoneTexture')), 0, 0.7, 0);
    M(new R.CylinderGeometry(1.3, 0.9, 0.6, 7), mat(0xffffff, null, tex('darkStoneTexture')), 0, 1.6, 0);
    const flame = new R.Mesh(
      new R.ConeGeometry(0.55, 2.2, 7),
      new R.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 })
    );
    flame.position.set(0, 2.9, 0);
    g.add(flame);
    const glow = new R.Mesh(
      new R.SphereGeometry(1.6, 12, 8),
      new R.MeshBasicMaterial({ color: 0xff6a22, transparent: true, opacity: 0.16, depthWrite: false })
    );
    glow.position.set(0, 2.6, 0);
    g.add(glow);
    g.userData.brazier = { flame, glow };
  } else if (type === 'korus-throne') {
    // The boss seat: a colossal dark throne under a storm arch.
    // Korus himself is a monster figure (spawns.js), not stone.
    colliderR = 10;
    M(new R.BoxGeometry(10, 1.2, 8), mat(0xffffff, null, tex('darkStoneTexture')), 0, 0.6, 0);
    M(new R.BoxGeometry(2.4, 12, 2), mat(0xffffff, null, tex('darkStoneTexture')), -4.5, 6, -2);
    M(new R.BoxGeometry(2.4, 12, 2), mat(0xffffff, null, tex('darkStoneTexture')), 4.5, 6, -2);
    M(new R.BoxGeometry(11, 2, 2), mat(0xffffff, null, tex('darkStoneTexture')), 0, 12.4, -2);
    M(new R.CylinderGeometry(0.12, 0.12, 11, 5), mat(0xffe14d, { emissive: 0xffe14d, emissiveIntensity: 1.6 }), -2.5, 7, 1);
    M(new R.CylinderGeometry(0.12, 0.12, 11, 5), mat(0x8a8a9a, { emissive: 0x666670, emissiveIntensity: 1 }), 2.5, 7, 1);
  } else if (type === 'haven') {
    // The Haven: the realm's sanctuary — a ring of pale pillars
    // under a glowing dome, unmistakable from anywhere in the
    // southern flats. The pillar ring sits ON the safe-base
    // boundary (r 28, spawns.js SAFE_BASE) so the eye learns
    // exactly where safety starts.
    colliderR = 0; // sanctuary, never a wall: walk straight in
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      M(new R.CylinderGeometry(0.9, 1.2, 7, 7), mat(0xd8d2c2, null, tex('palePillarTexture')), Math.cos(a) * 26, 3.5, Math.sin(a) * 26);
    }
    M(new R.SphereGeometry(26, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffe9a8, { transparent: true, opacity: 0.18, emissive: 0xaa8822, emissiveIntensity: 0.5 }), 0, 0, 0);
    M(new R.CylinderGeometry(0.4, 0.4, 12, 6), mat(0xe8c87a, { emissive: 0xaa8822, emissiveIntensity: 0.8 }), 0, 6, 0);
    M(new R.SphereGeometry(1.1, 10, 8), mat(0xffe9a8, { emissive: 0xffcc55, emissiveIntensity: 1.4 }), 0, 12.6, 0);
  } else if (type === 'intro-arch') {
    colliderR = 4;
    M(new R.CylinderGeometry(1, 1.3, 7, 8), mat(0xb4935a, null, tex('sandstoneTexture')), -4, 3.5, 0);
    M(new R.CylinderGeometry(1, 1.3, 7, 8), mat(0xb4935a, null, tex('sandstoneTexture')), 4, 3.5, 0);
    M(new R.BoxGeometry(10.5, 1.4, 1.6), mat(0xc2a15e, null, tex('sandstoneTexture')), 0, 7.4, 0);
    M(new R.SphereGeometry(0.9, 10, 8), mat(0xe8c87a, { emissive: 0xaa8822, emissiveIntensity: 0.7 }), 0, 8.6, 0);
  } else {
    // Unknown type: a plain marker stone, never a crash.
    colliderR = 1.5;
    M(new R.CylinderGeometry(0.8, 1.1, 2.4, 7), mat(0x888888, null, tex('darkStoneTexture')), 0, 1.2, 0);
  }

  g.userData.landmarkType = type;
  g.userData.colliderR = colliderR;
  // G-03: illustrated dressing, hung at build time when the page
  // already holds the texture; otherwise the page calls
  // applyLandmarkArt() once the art loads — the plain face stands
  // until then, never a wrong image.
  if (art) hangLandmarkArt(g, type, R, art);
  return g;
}

/* One illustrated graphic per dressed landmark type, hung on a
 * flat face/disc of the landmark (G-03). Throne, haven and
 * intro-arch take no art. Called from buildLandmark (art passed
 * in) or from applyLandmarkArt() (art loaded after the build).
 * Guards: unknown type, missing texture, or an already-hung face
 * all no-op — never a duplicate, never a crash. */
export function hangLandmarkArt(group, type, R, tex) {
  if (!group || !tex || group.userData.artApplied) return false;
  const basic = (w, h) => new R.MeshBasicMaterial({ map: tex, transparent: true });
  let artMesh = null;
  if (type === 'ooze-pool') {
    artMesh = new R.Mesh(new R.CircleGeometry(4.6, 24), basic());
    artMesh.rotation.x = -Math.PI / 2;
    artMesh.position.set(0, 0.68, 0);
  } else if (type === 'ember-spire') {
    artMesh = new R.Mesh(new R.CylinderGeometry(1.45, 1.75, 2.6, 12, 1, true), basic());
    artMesh.position.set(0, 4.5, 0);
  } else if (type === 'storm-pylon') {
    artMesh = new R.Mesh(new R.CircleGeometry(1.9, 24), basic());
    artMesh.position.set(0, 11, 0.2);
  } else if (type === 'mire-arch') {
    artMesh = new R.Mesh(new R.CircleGeometry(2.6, 24), basic());
    artMesh.position.set(0, 3, 0.2);
  } else if (type === 'gloom-monolith') {
    artMesh = new R.Mesh(new R.PlaneGeometry(2.6, 10), basic());
    artMesh.position.set(0, 7, 0.85);
  } else if (type === 'wreck-hulk') {
    artMesh = new R.Mesh(new R.PlaneGeometry(8, 1.8), basic());
    artMesh.position.set(0, 1.6, 2.05);
    artMesh.rotation.z = 0.22;
  } else if (type === 'peak-shrine') {
    artMesh = new R.Mesh(new R.PlaneGeometry(2, 2.4), basic());
    artMesh.position.set(0, 3, 1.75);
  } else if (type === 'frost-spire') {
    artMesh = new R.Mesh(new R.PlaneGeometry(1.6, 5), basic());
    artMesh.position.set(0, 5, 1.05);
  } else {
    return false;
  }
  group.add(artMesh);
  group.userData.artApplied = true;
  return true;
}

/** Hang a landmark's art after the build (texture loaded late).
 * Reads the type off the group; no-op for undressed types. */
export function applyLandmarkArt(group, R, tex) {
  if (!group || !tex) return false;
  return hangLandmarkArt(group, group.userData.landmarkType, R, tex);
}

/* Per-frame landmark life (G-05 + G-10), called by the zone's
 * update(): ooze pools bubble (inner-disc emissive breathe +
 * bubble bob/scale on a slow seeded cycle) and court braziers
 * breathe (flame cone scale pulse). Everything else is static.
 * No-op for landmarks without animated parts. */
export function animateLandmark(group, t, seed = 0) {
  if (!group || !group.userData) return;
  const ooze = group.userData.oozePool;
  if (ooze) {
    if (ooze.disc && ooze.disc.material && ooze.disc.material.emissiveIntensity != null) {
      ooze.disc.material.emissiveIntensity = 0.6 + 0.25 * Math.sin(t * 1.3 + seed);
    }
    for (let i = 0; i < (ooze.bubbles || []).length; i++) {
      const b = ooze.bubbles[i];
      const ph = t * 1.5 + seed + i * 1.26;
      b.position.y = 0.9 + 0.15 * Math.sin(ph);
      const s = 1 + 0.2 * Math.sin(ph * 1.7);
      b.scale.set(s, s, s);
    }
  }
  const br = group.userData.brazier;
  if (br && br.flame) {
    const s = 1 + 0.18 * Math.sin(t * 2.1 + seed);
    br.flame.scale.set(s, 1 + 0.28 * Math.sin(t * 2.1 + seed), s);
    if (br.glow && br.glow.material) {
      br.glow.material.opacity = 0.13 + 0.05 * Math.sin(t * 2.1 + seed);
    }
  }
}

/* Ambient world furniture: the glowing core-sun overhead and the
 * inverted horizon ring — the two things that make the sky read
 * as an inner world rather than an open sky. */
export function buildAmbient(type, R, T = {}) {
  const g = new R.Group();
  if (type === 'core-sun') {
    const sun = new R.Mesh(
      new R.SphereGeometry(26, 20, 14),
      new R.MeshBasicMaterial({ color: 0xffe9a8 })
    );
    sun.position.set(0, 200, 0);
    g.add(sun);
    const halo = new R.Mesh(
      new R.SphereGeometry(42, 20, 14),
      new R.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.22 })
    );
    halo.position.set(0, 200, 0);
    g.add(halo);
  } else if (type === 'inverted-horizon') {
    // A jagged silhouette ring far out, leaning inward: the
    // world's rim curving up overhead, as an inner world does.
    // Ring radius 700 sits outside the 600 m disc rim — at the
    // old 430 it would stand ON the ground inside the bigger
    // disc, a ring of cones rising out of the walkable world.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const h = 26 + ((i * 37) % 22);
      // Dive round (Nov 24): the rim peaks wear dark stone, not
      // flat violet — same shared texture as the monoliths.
      const peakMat = { color: 0xffffff, roughness: 1 };
      const peakTex = sharedTexture(T, 'darkStoneTexture');
      if (peakTex) peakMat.map = peakTex;
      const peak = new R.Mesh(
        new R.ConeGeometry(26, h, 4),
        new R.MeshStandardMaterial(peakMat)
      );
      peak.position.set(Math.cos(a) * 700, h / 2 - 4, Math.sin(a) * 700);
      peak.rotation.z = -0.12;
      peak.rotation.y = a;
      g.add(peak);
    }
  }
  g.userData.ambientType = type;
  return g;
}

export const AMBIENT_TYPES = ['core-sun', 'inverted-horizon'];
