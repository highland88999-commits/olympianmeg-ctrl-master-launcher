/*
 * STAR WARS pocket universe — landmark & ambient-creature builders.
 *
 * buildLandmark(type, THREE, T) -> { group, colliders }
 *   colliders are [{x, z, r}] circles in LANDMARK-LOCAL space
 *   (origin at the landmark base center). zone.js offsets them to world.
 * buildAmbient(type, THREE, T) -> { group, update(t, dt) }
 *
 * Perf: every mesh gets castShadow=false / receiveShadow=false, materials use
 * flatShading. Emissive accents are small MeshBasicMaterial bits only —
 * localized glow, never a texture wash.
 */
import * as ThreeJS from 'three';

/* THREE may be passed in (page shell / tests) — fall back to the import. */
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

/* Flat-shaded standard material. */
function M(R, color, opts) {
  return new R.MeshStandardMaterial(Object.assign(
    { color: color, flatShading: true, roughness: 0.92, metalness: 0.05 }, opts || {}));
}
/* Localized "emissive" accent — unlit, cheap. */
function E(R, color, opts) {
  return new R.MeshBasicMaterial(Object.assign({ color: color }, opts || {}));
}
function mesh(R, geo, material, x, y, z, ry) {
  const m = new R.Mesh(geo, material);
  m.position.set(x || 0, y || 0, z || 0);
  if (ry) m.rotation.y = ry;
  m.castShadow = false; m.receiveShadow = false;
  return m;
}
/* Per-vertex color jitter on a geometry (needs material.vertexColors=true). */
function tintGeo(R, geo, base, amt, rand) {
  const c = new R.Color(base);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = 1 + (rand() - 0.5) * amt;
    cols[i * 3] = Math.min(1, c.r * v);
    cols[i * 3 + 1] = Math.min(1, c.g * v);
    cols[i * 3 + 2] = Math.min(1, c.b * v);
  }
  geo.setAttribute('color', new R.BufferAttribute(cols, 3));
  return geo;
}
function done(R, group, colliders) {
  group.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group: group, colliders: colliders || [] };
}
function dome(R, r, ws, hs) {
  return new R.SphereGeometry(r, ws || 12, hs || 8, 0, Math.PI * 2, 0, Math.PI / 2);
}

export const LANDMARK_TYPES = [
  'mos-eisley', 'moisture-farm', 'podrace-arch', 'beggars-canyon', 'theed-palace',
  'jedi-temple', 'senate-dome', 'tipoca-city', 'geonosis-arena', 'droid-foundry',
  'mustafar-fortress', 'lava-falls', 'yavin-temple', 'echo-base', 'swamp-hut',
  'cloud-city', 'shield-generator', 'ewok-village', 'niima-outpost', 'maz-castle',
  'starkiller-cannon', 'jedi-village', 'salt-arch', 'sith-citadel', 'sith-throne',
  'death-star', 'debris-field', 'star-destroyer',
];

const BUILDERS = {
  /* Tatooine — cluster of 5-7 domes + one tall tower. */
  'mos-eisley': function (R) {
    const g = new R.Group(), rand = mulberry32(21);
    const sand = M(R, 0xd9b57c), dark = M(R, 0xb08d58);
    for (let i = 0; i < 6; i++) {
      const r = 3 + rand() * 2.5, a = (i / 6) * Math.PI * 2;
      g.add(mesh(R, dome(R, r), i % 2 ? sand : dark, Math.cos(a) * 7, 0, Math.sin(a) * 7));
    }
    g.add(mesh(R, dome(R, 4.5), sand, 0, 0, 0));
    g.add(mesh(R, new R.CylinderGeometry(1.6, 2.4, 22, 8), dark, 9, 11, -6));
    g.add(mesh(R, dome(R, 2.2), sand, 9, 22, -6));
    return done(R, g, [{ x: 0, z: 0, r: 13 }]);
  },
  /* Tatooine — igloo dome + 3 vaporator poles. */
  'moisture-farm': function (R) {
    const g = new R.Group();
    const wall = M(R, 0xe6ddc8), pole = M(R, 0x8f959c, { metalness: 0.6, roughness: 0.5 });
    g.add(mesh(R, dome(R, 6, 14, 10), wall, 0, 0, 0));
    g.add(mesh(R, new R.CylinderGeometry(1.2, 1.2, 1.5, 8), M(R, 0xb9ac8f), 0, 0.4, 7));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5, x = Math.cos(a) * 11, z = Math.sin(a) * 11;
      g.add(mesh(R, new R.CylinderGeometry(0.25, 0.35, 9, 6), pole, x, 4.5, z));
      g.add(mesh(R, new R.BoxGeometry(2.4, 0.25, 0.25), pole, x, 8.2, z, a));
      g.add(mesh(R, new R.BoxGeometry(0.9, 0.9, 0.9), pole, x, 9, z));
    }
    return done(R, g, [{ x: 0, z: 0, r: 8 }]);
  },
  /* Tatooine — two stone pillars + top beam (podrace start arch). */
  'podrace-arch': function (R) {
    const g = new R.Group();
    const stone = M(R, 0x9a7f5e, { vertexColors: false });
    const rand = mulberry32(23);
    for (const s of [-1, 1]) {
      g.add(mesh(R, tintGeo(R, new R.BoxGeometry(3, 16, 3), 0x9a7f5e, 0.25, rand),
        M(R, 0xffffff, { vertexColors: true }), s * 6, 8, 0));
      g.add(mesh(R, new R.BoxGeometry(4, 1.5, 4), stone, s * 6, 0.7, 0));
    }
    g.add(mesh(R, new R.BoxGeometry(16, 2.5, 3.5), stone, 0, 17, 0));
    return done(R, g, [{ x: -6, z: 0, r: 2.4 }, { x: 6, z: 0, r: 2.4 }]);
  },
  /* Tatooine — two long rock walls forming a gap. */
  'beggars-canyon': function (R) {
    const g = new R.Group(), rand = mulberry32(24);
    const rockMat = M(R, 0xffffff, { vertexColors: true });
    const cols = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const h = 10 + rand() * 6, z = -30 + i * 20;
        const geo = tintGeo(R, new R.BoxGeometry(8, h, 18), 0x8a6f52, 0.35, rand);
        g.add(mesh(R, geo, rockMat, s * 11, h / 2 - 1, z, (rand() - 0.5) * 0.2));
        cols.push({ x: s * 11, z: z, r: 5.5 });
      }
    }
    return done(R, g, cols);
  },
  /* Naboo — grand domed palace + columns + plaza disc. */
  'theed-palace': function (R) {
    const g = new R.Group();
    const cream = M(R, 0xe9dfc8), patina = M(R, 0x5f8f7a), gold = M(R, 0xc9a227, { metalness: 0.5, roughness: 0.4 });
    g.add(mesh(R, new R.CylinderGeometry(16, 16, 1, 32), M(R, 0xb9ac96), 0, 0.5, 0)); // plaza
    g.add(mesh(R, new R.BoxGeometry(22, 8, 14), cream, 0, 4.5, -4));
    g.add(mesh(R, dome(R, 7, 18, 12), patina, 0, 8.5, -4));
    g.add(mesh(R, new R.SphereGeometry(0.9, 8, 6), gold, 0, 16.4, -4));
    for (let i = -2; i <= 2; i++) g.add(mesh(R, new R.CylinderGeometry(0.7, 0.8, 7, 8), cream, i * 5, 4, 4.5));
    g.add(mesh(R, new R.BoxGeometry(26, 1.2, 3), cream, 0, 8, 4.5)); // entablature
    return done(R, g, [{ x: 0, z: -4, r: 13 }]);
  },
  /* Coruscant — stepped ziggurat + 5 spires. */
  'jedi-temple': function (R) {
    const g = new R.Group();
    const stone = M(R, 0xcfc39f);
    let w = 30;
    for (let i = 0; i < 4; i++) {
      g.add(mesh(R, new R.BoxGeometry(w, 4, w), stone, 0, 2 + i * 4, 0));
      w -= 6;
    }
    const top = 2 + 3 * 4 + 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 6, z = Math.sin(a) * 6;
      g.add(mesh(R, new R.CylinderGeometry(1.2, 1.8, 14, 6), stone, x, top + 7, z));
      g.add(mesh(R, new R.ConeGeometry(1.6, 3, 6), M(R, 0x8f8468), x, top + 15.5, z));
    }
    g.add(mesh(R, new R.CylinderGeometry(2, 2.6, 10, 8), stone, 0, top + 5, 0));
    return done(R, g, [{ x: 0, z: 0, r: 15 }]);
  },
  /* Coruscant — large hemisphere dome. */
  'senate-dome': function (R) {
    const g = new R.Group();
    const shell = M(R, 0xb9b3a4);
    g.add(mesh(R, new R.CylinderGeometry(19, 20, 3, 28), M(R, 0x9d968a), 0, 1.5, 0));
    g.add(mesh(R, dome(R, 18, 28, 16), shell, 0, 3, 0));
    g.add(mesh(R, new R.SphereGeometry(1.4, 10, 8), M(R, 0xc9a227, { metalness: 0.5, roughness: 0.4 }), 0, 21.6, 0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(mesh(R, new R.BoxGeometry(1.6, 2.4, 0.5), E(R, 0x9fd8ff), Math.cos(a) * 18.4, 6, Math.sin(a) * 18.4, -a));
    }
    return done(R, g, [{ x: 0, z: 0, r: 19 }]);
  },
  /* Kamino — 3 stilt platforms over a water disc + bridges. */
  'tipoca-city': function (R, T) {
    const g = new R.Group();
    const water = new R.MeshStandardMaterial({ color: 0x2a6f9e, map: T.waterTexture(), roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.96 });
    water.map.repeat.set(6, 6);
    const disc = mesh(R, new R.CylinderGeometry(30, 30, 1, 32), water, 0, 0.2, 0);
    disc.userData.pulse = true; g.add(disc);
    const white = M(R, 0xdde3e8, { metalness: 0.3, roughness: 0.5 });
    const cols = [];
    const spots = [[-12, -6], [10, -8], [0, 12]];
    for (const [px, pz] of spots) {
      for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]])
        g.add(mesh(R, new R.CylinderGeometry(0.5, 0.6, 8, 6), white, px + lx, 4, pz + lz));
      g.add(mesh(R, new R.CylinderGeometry(6, 6.6, 2.5, 12), white, px, 9, pz));
      g.add(mesh(R, dome(R, 4, 12, 8), white, px, 10.2, pz));
      cols.push({ x: px, z: pz, r: 6 });
    }
    g.add(mesh(R, new R.BoxGeometry(24, 0.6, 2), white, -1, 8.6, -7, 0.35));
    g.add(mesh(R, new R.BoxGeometry(2, 0.6, 20), white, 5, 8.6, 2, 0.3));
    return done(R, g, cols);
  },
  /* Geonosis — rock bowl: ring wall + spires. */
  'geonosis-arena': function (R) {
    const g = new R.Group(), rand = mulberry32(25);
    const rockMat = M(R, 0xffffff, { vertexColors: true });
    const wall = tintGeo(R, new R.CylinderGeometry(20, 23, 10, 18, 1, true), 0xa0663a, 0.3, rand);
    const wm = mesh(R, wall, rockMat, 0, 5, 0); wm.material.side = R.DoubleSide; g.add(wm);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, h = 14 + rand() * 8;
      g.add(mesh(R, tintGeo(R, new R.ConeGeometry(2.5, h, 7), 0x96603a, 0.3, rand),
        rockMat, Math.cos(a) * 24, h / 2, Math.sin(a) * 24));
    }
    g.add(mesh(R, tintGeo(R, new R.ConeGeometry(3, 12, 7), 0x8a5636, 0.3, rand), rockMat, 0, 6, 0));
    return done(R, g, [{ x: 0, z: 0, r: 14 }]);
  },
  /* Geonosis — dark factory block + chimney stacks. */
  'droid-foundry': function (R) {
    const g = new R.Group(), rand = mulberry32(26);
    const dark = M(R, 0x2b2b30, { metalness: 0.4, roughness: 0.6 });
    g.add(mesh(R, new R.BoxGeometry(24, 10, 16), dark, 0, 5, 0));
    g.add(mesh(R, new R.BoxGeometry(26, 2, 18), M(R, 0x1d1d22), 0, 11, 0));
    for (let i = 0; i < 4; i++) {
      const x = -9 + i * 6;
      g.add(mesh(R, new R.CylinderGeometry(1.2, 1.6, 12, 8), dark, x, 16, -4 + (rand() - 0.5) * 4));
      g.add(mesh(R, new R.SphereGeometry(0.9, 8, 6), E(R, 0xff7a1f, { transparent: true, opacity: 0.9 }), x, 22.2, -4));
    }
    for (let i = 0; i < 5; i++)
      g.add(mesh(R, new R.BoxGeometry(1.4, 2, 0.4), E(R, 0xffc23d), -10 + i * 5, 5, 8.1));
    return done(R, g, [{ x: 0, z: 0, r: 11 }]);
  },
  /* Mustafar — black angular fortress + red emissive slits. */
  'mustafar-fortress': function (R) {
    const g = new R.Group();
    const obs = M(R, 0x0e0d0f, { metalness: 0.3, roughness: 0.5 });
    const main = mesh(R, new R.BoxGeometry(16, 22, 12), obs, 0, 11, 0); main.rotation.y = 0.3; g.add(main);
    const wing = mesh(R, new R.BoxGeometry(10, 14, 18), obs, -10, 7, 4); wing.rotation.y = -0.4; g.add(wing);
    g.add(mesh(R, new R.ConeGeometry(5, 10, 4), obs, 6, 27, -2, 0.5));
    for (let i = 0; i < 4; i++)
      g.add(mesh(R, new R.BoxGeometry(0.5, 8, 0.5), E(R, 0xff2a1a), 8.1, 6 + i * 3.4, -2 + (i % 2) * 3, 0.3));
    for (let i = 0; i < 3; i++)
      g.add(mesh(R, new R.BoxGeometry(6, 0.5, 0.5), E(R, 0xff2a1a), -10, 4 + i * 3.5, 13.2, -0.4));
    return done(R, g, [{ x: 0, z: 0, r: 12 }]);
  },
  /* Mustafar — rock cliff + emissive lava-fall strips. */
  'lava-falls': function (R, T) {
    const g = new R.Group(), rand = mulberry32(27);
    const cliff = mesh(R, tintGeo(R, new R.BoxGeometry(14, 20, 6), 0x2a2018, 0.35, rand),
      M(R, 0xffffff, { vertexColors: true }), 0, 10, 0);
    g.add(cliff);
    for (let i = 0; i < 3; i++) {
      const strip = mesh(R, new R.PlaneGeometry(1.6, 18),
        new R.MeshBasicMaterial({ map: T.lavaTexture(), transparent: true, opacity: 0.95 }), -4 + i * 4, 9.5, 3.1);
      strip.userData.pulse = true; g.add(strip);
    }
    const pool = mesh(R, new R.CircleGeometry(9, 20),
      new R.MeshBasicMaterial({ map: T.lavaTexture(), transparent: true, opacity: 0.95 }), 0, 0.3, 8);
    pool.rotation.x = -Math.PI / 2; pool.userData.pulse = true; g.add(pool);
    return done(R, g, [{ x: 0, z: 0, r: 7 }]);
  },
  /* Yavin 4 — stepped stone pyramid. */
  'yavin-temple': function (R) {
    const g = new R.Group(), rand = mulberry32(28);
    const stoneMat = M(R, 0xffffff, { vertexColors: true });
    let w = 26;
    for (let i = 0; i < 5; i++) {
      g.add(mesh(R, tintGeo(R, new R.BoxGeometry(w, 3.4, w), 0x8f8a76, 0.22, rand), stoneMat, 0, 1.7 + i * 3.4, 0, (i % 2) * 0.06));
      w -= 4.4;
    }
    g.add(mesh(R, new R.BoxGeometry(4, 3, 6), M(R, 0x6e6a5c), 0, 18.4, 3));
    return done(R, g, [{ x: 0, z: 0, r: 12 }]);
  },
  /* Hoth — ice arch hangar entrance + trench walls. */
  'echo-base': function (R) {
    const g = new R.Group();
    const ice = M(R, 0xd6e8f5, { roughness: 0.35 });
    const arch = mesh(R, new R.TorusGeometry(7, 2.2, 10, 20, Math.PI), ice, 0, 2, 0);
    g.add(arch);
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(3, 9, 4), ice, s * 8.5, 4.5, 0));
      g.add(mesh(R, new R.BoxGeometry(3, 6, 26), ice, s * 8.5, 3, -14));
    }
    g.add(mesh(R, new R.BoxGeometry(4, 1.6, 0.6), E(R, 0x9fd8ff), 0, 8.6, 0.6));
    const cols = [{ x: -8.5, z: 0, r: 3 }, { x: 8.5, z: 0, r: 3 },
      { x: -8.5, z: -14, r: 3 }, { x: 8.5, z: -14, r: 3 }];
    return done(R, g, cols);
  },
  /* Dagobah — hut on stilts + roots. */
  'swamp-hut': function (R) {
    const g = new R.Group(), rand = mulberry32(29);
    const wood = M(R, 0x5d4a33);
    for (const [lx, lz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]])
      g.add(mesh(R, new R.CylinderGeometry(0.35, 0.45, 5, 6), wood, lx, 2.5, lz));
    g.add(mesh(R, new R.BoxGeometry(7, 3.4, 6), M(R, 0x6e5a3e), 0, 6.6, 0));
    g.add(mesh(R, new R.ConeGeometry(5.4, 3.4, 8), M(R, 0x4a5d2e), 0, 10, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const root = mesh(R, new R.ConeGeometry(0.5, 3.5, 5), wood, Math.cos(a) * 5, 1.2, Math.sin(a) * 5);
      root.rotation.z = Math.cos(a) * 0.5; root.rotation.x = -Math.sin(a) * 0.5; g.add(root);
    }
    g.add(mesh(R, new R.BoxGeometry(1.6, 2.2, 0.4), E(R, 0xffd98a), 0, 6.2, 3.1));
    return done(R, g, [{ x: 0, z: 0, r: 5 }]);
  },
  /* Bespin — wide disc + towers on a tapered repulsor column. */
  'cloud-city': function (R, T) {
    const g = new R.Group();
    const white = M(R, 0xe8e4da, { metalness: 0.35, roughness: 0.45 });
    g.add(mesh(R, new R.CylinderGeometry(3.5, 11, 38, 12), M(R, 0xb9b3a4), 0, 19, 0)); // column
    g.add(mesh(R, new R.CylinderGeometry(26, 21, 4.5, 26), white, 0, 40, 0)); // disc
    const rand = mulberry32(30);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 12, z = Math.sin(a) * 12;
      const h = 8 + rand() * 10;
      g.add(mesh(R, new R.CylinderGeometry(1.8, 2.4, h, 8), white, x, 42 + h / 2, z));
      g.add(mesh(R, new R.SphereGeometry(2.4, 10, 8), white, x, 42 + h + 1.4, z));
    }
    g.add(mesh(R, new R.CylinderGeometry(3, 4, 16, 10), white, 0, 50, 0));
    const glow = new R.Sprite(new R.SpriteMaterial({ map: T.glowSprite(), color: 0x9fd8ff, transparent: true, opacity: 0.85, depthWrite: false }));
    glow.scale.set(16, 16, 1); glow.position.set(0, 2, 0); glow.userData.pulse = true; g.add(glow);
    return done(R, g, [{ x: 0, z: 0, r: 6 }]);
  },
  /* Endor — bunker + big dish. */
  'shield-generator': function (R) {
    const g = new R.Group();
    const army = M(R, 0x5a6148);
    g.add(mesh(R, dome(R, 7, 14, 8), army, 0, 0, 0));
    g.add(mesh(R, new R.BoxGeometry(10, 3, 6), army, 0, 1.2, 7));
    const mast = mesh(R, new R.CylinderGeometry(0.4, 0.5, 10, 6), M(R, 0x3a3f35), 4, 9, -2);
    mast.rotation.z = 0.35; g.add(mast);
    const dish = mesh(R, new R.SphereGeometry(4.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3.2),
      M(R, 0xd8d4c8, { metalness: 0.4, roughness: 0.4, side: R.DoubleSide }), 6.4, 13.4, -2);
    dish.rotation.z = -1.1; g.add(dish);
    g.add(mesh(R, new R.BoxGeometry(1.2, 1.2, 1.2), E(R, 0xff3b30), 6.4, 13.4, -2));
    return done(R, g, [{ x: 0, z: 0, r: 7 }]);
  },
  /* Endor — 3 tall trees + rope platforms. */
  'ewok-village': function (R) {
    const g = new R.Group(), rand = mulberry32(31);
    const bark = M(R, 0x5d4630), leaf = M(R, 0x3f6b34);
    const cols = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4, x = Math.cos(a) * 9, z = Math.sin(a) * 9;
      const h = 22 + rand() * 6;
      g.add(mesh(R, new R.CylinderGeometry(1.1, 1.7, h, 7), bark, x, h / 2, z));
      g.add(mesh(R, new R.SphereGeometry(5, 9, 7), leaf, x, h + 2.5, z));
      g.add(mesh(R, new R.CylinderGeometry(3.4, 3.4, 0.5, 10), M(R, 0x7a5f42), x, 12 + i * 2, z));
      g.add(mesh(R, new R.ConeGeometry(4, 2.4, 8), M(R, 0x8a6f4e), x, 14.6 + i * 2, z));
      cols.push({ x: x, z: z, r: 1.8 });
    }
    g.add(mesh(R, new R.BoxGeometry(9, 0.4, 1.2), M(R, 0x8a6f4e), 4.5, 12.4, 4.4, 0.5));
    return done(R, g, cols);
  },
  /* Jakku — junk walls: boxes + a downed walker-leg silhouette. */
  'niima-outpost': function (R) {
    const g = new R.Group(), rand = mulberry32(32);
    const junkCols = [0x8a7f6a, 0x6e6a5e, 0x9a8a70, 0x5d5a52];
    for (let i = 0; i < 14; i++) {
      const w = 1.5 + rand() * 3, h = 1.5 + rand() * 4;
      const a = rand() * Math.PI * 2, r = 4 + rand() * 9;
      g.add(mesh(R, new R.BoxGeometry(w, h, w * (0.6 + rand() * 0.8)),
        M(R, junkCols[(rand() * junkCols.length) | 0], { metalness: 0.4, roughness: 0.6 }),
        Math.cos(a) * r, h / 2, Math.sin(a) * r, rand() * Math.PI));
    }
    const leg = mesh(R, new R.BoxGeometry(2.2, 16, 2.2), M(R, 0x4a4d52, { metalness: 0.5, roughness: 0.55 }), -8, 3, 6);
    leg.rotation.z = 1.25; leg.rotation.y = 0.4; g.add(leg);
    g.add(mesh(R, new R.BoxGeometry(5, 2, 4), M(R, 0x4a4d52), -13.5, 1.4, 7.5, 0.4));
    return done(R, g, [{ x: 0, z: 0, r: 9 }]);
  },
  /* Takodana — stone castle: keep + towers + flags. */
  'maz-castle': function (R) {
    const g = new R.Group();
    const stone = M(R, 0x8f8a7c), dark = M(R, 0x6e6a5e);
    g.add(mesh(R, new R.BoxGeometry(14, 16, 12), stone, 0, 8, 0));
    g.add(mesh(R, new R.BoxGeometry(15, 2, 13), dark, 0, 17, 0));
    for (const [tx, tz] of [[-8, -7], [8, -7], [-8, 7], [8, 7]]) {
      g.add(mesh(R, new R.CylinderGeometry(2.4, 2.8, 20, 8), stone, tx, 10, tz));
      g.add(mesh(R, new R.ConeGeometry(3, 4, 8), dark, tx, 22, tz));
      g.add(mesh(R, new R.CylinderGeometry(0.08, 0.08, 4, 4), dark, tx, 25.5, tz));
      const flag = mesh(R, new R.PlaneGeometry(2.2, 1.2), E(R, 0xc23b2e, { side: R.DoubleSide }), tx + 1.15, 26.4, tz);
      g.add(flag);
    }
    g.add(mesh(R, new R.BoxGeometry(4, 5, 1), E(R, 0xffd98a), 0, 2.5, 6.1));
    return done(R, g, [{ x: 0, z: 0, r: 11 }]);
  },
  /* Starkiller — huge cannon barrel angled skyward in an ice trench. */
  'starkiller-cannon': function (R) {
    const g = new R.Group();
    const ice = M(R, 0xd6e8f5, { roughness: 0.35 });
    for (const s of [-1, 1]) g.add(mesh(R, new R.BoxGeometry(4, 8, 44), ice, s * 10, 4, 0));
    const barrel = mesh(R, new R.CylinderGeometry(2.6, 3.4, 34, 12), M(R, 0x3a3f46, { metalness: 0.6, roughness: 0.4 }), 0, 12, 6);
    barrel.rotation.x = -0.9; g.add(barrel);
    const muzzle = mesh(R, new R.CylinderGeometry(3.2, 2.6, 3, 12), M(R, 0x2b2f35), 0, 26.4, -8.6);
    muzzle.rotation.x = -0.9; g.add(muzzle);
    g.add(mesh(R, new R.BoxGeometry(8, 6, 10), M(R, 0x4a5058), 0, 3, 10));
    return done(R, g, [{ x: 0, z: 6, r: 8 }]);
  },
  /* Ahch-To — 5 stone beehive huts. */
  'jedi-village': function (R) {
    const g = new R.Group(), rand = mulberry32(33);
    const stoneMat = M(R, 0xffffff, { vertexColors: true });
    const cols = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 10, z = Math.sin(a) * 10;
      const r = 2.6 + rand() * 0.8;
      const hut = tintGeo(R, new R.SphereGeometry(r, 10, 8), 0x9d968a, 0.25, rand);
      const m = mesh(R, hut, stoneMat, x, 0, z); m.scale.y = 1.25; g.add(m);
      g.add(mesh(R, new R.BoxGeometry(1.2, 1.8, 0.4), M(R, 0x4a4438), x, 0.9, z + r * 0.92, a));
      cols.push({ x: x, z: z, r: r });
    }
    return done(R, g, cols);
  },
  /* Crait — white arch with red under-cracks. */
  'salt-arch': function (R) {
    const g = new R.Group();
    const salt = M(R, 0xf2f4f6, { roughness: 0.7 });
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(2.6, 13, 2.6), salt, s * 5.5, 6.5, 0));
      g.add(mesh(R, new R.BoxGeometry(3.2, 0.8, 3.2), E(R, 0xb03a2e), s * 5.5, 0.4, 0));
    }
    const beam = mesh(R, new R.TorusGeometry(5.5, 1.5, 8, 16, Math.PI), salt, 0, 13, 0);
    g.add(beam);
    g.add(mesh(R, new R.BoxGeometry(11.5, 0.7, 2.2), E(R, 0xc0392b), 0, 12.4, 0));
    return done(R, g, [{ x: -5.5, z: 0, r: 2.2 }, { x: 5.5, z: 0, r: 2.2 }]);
  },
  /* Exegol — cluster of black spires + red emissive windows. */
  'sith-citadel': function (R) {
    const g = new R.Group(), rand = mulberry32(34);
    const obs = M(R, 0x0c0b0e, { metalness: 0.35, roughness: 0.45 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, x = Math.cos(a) * (4 + rand() * 8), z = Math.sin(a) * (4 + rand() * 8);
      const h = 18 + rand() * 22;
      g.add(mesh(R, new R.ConeGeometry(2.2 + rand() * 1.6, h, 5), obs, x, h / 2, z, rand()));
      for (let w = 0; w < 3; w++)
        g.add(mesh(R, new R.PlaneGeometry(0.7, 1.4), E(R, 0xff2a1a),
          x + (rand() - 0.5) * 2, 6 + rand() * (h - 8), z + 2.2, rand() * Math.PI * 2));
    }
    return done(R, g, [{ x: 0, z: 0, r: 12 }]);
  },
  /* Exegol — dais + throne + statues. */
  'sith-throne': function (R) {
    const g = new R.Group();
    const obs = M(R, 0x121114, { metalness: 0.3, roughness: 0.5 });
    g.add(mesh(R, new R.CylinderGeometry(9, 10, 1.6, 8), obs, 0, 0.8, 0));
    g.add(mesh(R, new R.CylinderGeometry(6.5, 7.5, 1.6, 8), obs, 0, 2.4, 0));
    g.add(mesh(R, new R.BoxGeometry(3.4, 2.6, 2.4), obs, 0, 4.4, -1));
    g.add(mesh(R, new R.BoxGeometry(3.4, 5, 1.2), obs, 0, 7.6, -2));
    g.add(mesh(R, new R.BoxGeometry(4.4, 0.8, 3), M(R, 0x1e1c22), 0, 8.6, -1.6));
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(1.6, 7, 1.6), obs, s * 7.5, 3.5, -4));
      g.add(mesh(R, new R.SphereGeometry(1.1, 7, 6), obs, s * 7.5, 7.6, -4));
      g.add(mesh(R, new R.BoxGeometry(0.5, 0.9, 0.2), E(R, 0xff2a1a), s * 7.5 - 0.3, 7.7, -3));
      g.add(mesh(R, new R.BoxGeometry(0.5, 0.9, 0.2), E(R, 0xff2a1a), s * 7.5 + 0.3, 7.7, -3));
    }
    return done(R, g, [{ x: 0, z: 0, r: 7 }]);
  },
  /* Fly zone — long trench corridor segment along -z/+z. */
  'death-star': function (R) {
    const g = new R.Group(), rand = mulberry32(35);
    const hull = M(R, 0x8f959c, { metalness: 0.55, roughness: 0.45 });
    const dark = M(R, 0x5d6269, { metalness: 0.5, roughness: 0.5 });
    g.add(mesh(R, new R.BoxGeometry(32, 1.5, 220), dark, 0, -0.75, 0)); // floor
    const cols = [];
    for (const s of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(2.5, 16, 220), hull, s * 16, 8, 0)); // walls
      for (let i = 0; i < 22; i++) {
        const z = -105 + i * 10, w = 1 + rand() * 3;
        g.add(mesh(R, new R.BoxGeometry(1.2, 1 + rand() * 3, w), dark, s * 14.4, 3 + rand() * 9, z));
        if (rand() < 0.3)
          g.add(mesh(R, new R.BoxGeometry(0.6, 0.6, 2), E(R, 0x9fd8ff), s * 14.3, 6 + rand() * 6, z));
      }
      for (let z = -100; z <= 100; z += 20) cols.push({ x: s * 16, z: z, r: 8 });
    }
    return done(R, g, cols);
  },
  /* Fly zone — ring of floating rocks + central memorial beacon pylon. */
  'debris-field': function (R, T) {
    const g = new R.Group(), rand = mulberry32(36);
    const rockGeo = new R.IcosahedronGeometry(1, 0);
    const rockMat = M(R, 0x6e6258, { roughness: 1, metalness: 0 });
    const count = 200;
    const inst = new R.InstancedMesh(rockGeo, rockMat, count);
    const d = new R.Object3D();
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, r = 60 + rand() * 55;
      d.position.set(Math.cos(a) * r, (rand() - 0.5) * 44, Math.sin(a) * r);
      d.rotation.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
      const s = 1 + rand() * 4; d.scale.set(s, s * (0.6 + rand() * 0.8), s);
      d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false; inst.receiveShadow = false;
    g.add(inst);
    g.add(mesh(R, new R.CylinderGeometry(1.5, 2.5, 40, 8), M(R, 0x3a3f46, { metalness: 0.6, roughness: 0.4 }), 0, 20, 0));
    const beacon = mesh(R, new R.SphereGeometry(2.4, 12, 10), E(R, 0x9fd8ff, { transparent: true, opacity: 0.9 }), 0, 42, 0);
    beacon.userData.pulse = true; g.add(beacon);
    const halo = new R.Sprite(new R.SpriteMaterial({ map: T.glowSprite(), color: 0x9fd8ff, transparent: true, opacity: 0.7, depthWrite: false }));
    halo.scale.set(18, 18, 1); halo.position.set(0, 42, 0); halo.userData.pulse = true; g.add(halo);
    return done(R, g, [{ x: 0, z: 0, r: 4 }]);
  },
  /* Distant wedge silhouette — no collider. */
  'star-destroyer': function (R) {
    const g = new R.Group();
    const hull = M(R, 0x9aa0a8, { metalness: 0.5, roughness: 0.5 });
    g.add(mesh(R, new R.BoxGeometry(70, 7, 90), hull, 0, 0, 30));
    const nose = mesh(R, new R.ConeGeometry(35, 70, 4), hull, 0, 0, -40);
    nose.rotation.x = -Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.scale.y = 1; g.add(nose);
    g.add(mesh(R, new R.BoxGeometry(10, 14, 8), hull, 0, 10, 62));
    g.add(mesh(R, new R.BoxGeometry(22, 3, 6), hull, 0, 18, 62));
    for (const s of [-1, 1]) g.add(mesh(R, new R.SphereGeometry(2.5, 8, 6), hull, s * 6, 18, 62));
    for (let i = 0; i < 12; i++)
      g.add(mesh(R, new R.BoxGeometry(1, 0.5, 1), E(R, 0xffe9b0), -30 + i * 5.5, -3.6, 10 + (i % 3) * 20));
    g.position.y = 90;
    return done(R, g, []);
  },
};

export function buildLandmark(type, THREE, T) {
  const R = R3(THREE);
  const b = BUILDERS[type];
  if (!b) throw new Error('[star-wars] unknown landmark type: ' + type);
  return b(R, T);
}

/* ------------------------- ambient creatures ------------------------- */

export const AMBIENT_TYPES = [
  'bantha', 'jawa', 'bird', 'wampa', 'tauntaun',
  'ewok', 'porg', 'probe-droid', 'fish', 'tuskan',
];

/* Lazily capture the zone-assigned base position on first update. */
function wanderState(g) {
  const s = { bx: null, bz: null, by: null, ph: Math.random() * 6.2832 };
  s.base = function () {
    if (s.bx === null) { s.bx = g.position.x; s.bz = g.position.z; s.by = g.position.y; }
  };
  return s;
}

const AMBIENT = {
  /* Boxy quadruped. */
  'bantha': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const fur = M(R, 0x8a6b4a), dark = M(R, 0x6e5638);
    const body = mesh(R, new R.BoxGeometry(3.4, 1.9, 1.7), fur, 0, 1.75, 0); g.add(body);
    g.add(mesh(R, new R.BoxGeometry(1, 1.1, 1.2), fur, 2.05, 1.9, 0));
    for (const [lx, lz] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]])
      g.add(mesh(R, new R.BoxGeometry(0.5, 1.3, 0.5), dark, lx, 0.65, lz));
    for (const lz of [-0.75, 0.75]) g.add(mesh(R, new R.ConeGeometry(0.16, 1.5, 6), M(R, 0xe8dcc0), 2.3, 2.7, lz));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.12 + s.ph) * 7;
        g.position.z = s.bz + Math.sin(t * 0.10 + s.ph) * 7;
        g.rotation.y = Math.atan2(-Math.sin(t * 0.12 + s.ph) * 0.12, Math.cos(t * 0.10 + s.ph) * 0.10);
        body.position.y = 1.75 + Math.sin(t * 2.2 + s.ph) * 0.09;
      },
    };
  },
  /* Small hooded figure with glowing eyes. */
  'jawa': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const robe = mesh(R, new R.ConeGeometry(0.55, 1.5, 7), M(R, 0x4a3b2c), 0, 0.75, 0); g.add(robe);
    g.add(mesh(R, new R.SphereGeometry(0.3, 8, 6), M(R, 0x1a1410), 0, 1.35, 0.18));
    g.add(mesh(R, new R.BoxGeometry(0.12, 0.08, 0.05), E(R, 0xffd76a), -0.1, 1.38, 0.44));
    g.add(mesh(R, new R.BoxGeometry(0.12, 0.08, 0.05), E(R, 0xffd76a), 0.1, 1.38, 0.44));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.35 + s.ph) * 4;
        g.position.z = s.bz + Math.sin(t * 0.3 + s.ph) * 4;
        g.rotation.y = t * 0.35 + s.ph;
        robe.position.y = 0.75 + Math.abs(Math.sin(t * 5 + s.ph)) * 0.08;
      },
    };
  },
  /* Flapping V bird. */
  'bird': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const wm = M(R, 0x3a3f4a, { side: R.DoubleSide });
    const wl = new R.Group(), wr = new R.Group();
    const gl = new R.PlaneGeometry(1.7, 0.7); gl.translate(0.85, 0, 0); wl.add(mesh(R, gl, wm));
    const gr = new R.PlaneGeometry(1.7, 0.7); gr.translate(-0.85, 0, 0); wr.add(mesh(R, gr, wm));
    g.add(wl, wr);
    g.add(mesh(R, new R.SphereGeometry(0.24, 8, 6), M(R, 0x22262e), 0, 0, 0.25));
    return {
      group: g,
      update: function (t) {
        s.base();
        const f = Math.sin(t * 9 + s.ph);
        wl.rotation.z = 0.45 + f * 0.55; wr.rotation.z = -0.45 - f * 0.55;
        const nx = s.bx + Math.cos(t * 0.5 + s.ph) * 9, nz = s.bz + Math.sin(t * 0.42 + s.ph) * 9;
        g.rotation.y = Math.atan2(nx - g.position.x, nz - g.position.z);
        g.position.x = nx; g.position.z = nz;
        g.position.y = s.by + Math.sin(t * 1.6 + s.ph) * 1.4;
      },
    };
  },
  /* Tall white brute. */
  'wampa': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const fur = M(R, 0xe8e4da);
    const body = mesh(R, new R.BoxGeometry(1.6, 2.6, 1.1), fur, 0, 2, 0); g.add(body);
    g.add(mesh(R, new R.SphereGeometry(0.55, 8, 6), fur, 0, 3.6, 0.2));
    for (const lz of [-1, 1]) {
      g.add(mesh(R, new R.BoxGeometry(0.45, 1.9, 0.45), fur, 0, 2, lz * 0.85));
      g.add(mesh(R, new R.BoxGeometry(0.4, 1.1, 0.4), fur, 0, 0.55, lz * 0.4));
    }
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.09 + s.ph) * 5;
        g.position.z = s.bz + Math.sin(t * 0.08 + s.ph) * 5;
        g.rotation.y = Math.sin(t * 0.09 + s.ph) * 0.8;
        body.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.06;
      },
    };
  },
  /* Two-legged mount. */
  'tauntaun': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const hide = M(R, 0xb9a58a);
    const body = mesh(R, new R.BoxGeometry(2.4, 1.2, 1), hide, 0, 1.9, 0); g.add(body);
    const legL = mesh(R, new R.BoxGeometry(0.4, 1.4, 0.4), hide, 0, 0.7, -0.35); g.add(legL);
    const legR = mesh(R, new R.BoxGeometry(0.4, 1.4, 0.4), hide, 0, 0.7, 0.35); g.add(legR);
    g.add(mesh(R, new R.BoxGeometry(0.7, 0.8, 0.6), hide, 1.4, 2.6, 0));
    for (const lz of [-0.3, 0.3]) g.add(mesh(R, new R.ConeGeometry(0.1, 0.9, 5), M(R, 0xe8dcc0), 1.5, 3.2, lz));
    g.add(mesh(R, new R.BoxGeometry(0.25, 1, 0.25), hide, -1.3, 1.9, 0));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.22 + s.ph) * 8;
        g.position.z = s.bz + Math.sin(t * 0.19 + s.ph) * 8;
        g.rotation.y = Math.atan2(-Math.sin(t * 0.22 + s.ph), Math.cos(t * 0.19 + s.ph));
        const hop = Math.abs(Math.sin(t * 4 + s.ph));
        body.position.y = 1.9 + hop * 0.22;
        legL.rotation.x = Math.sin(t * 4 + s.ph) * 0.5;
        legR.rotation.x = -Math.sin(t * 4 + s.ph) * 0.5;
      },
    };
  },
  /* Small furry biped. */
  'ewok': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const fur = M(R, 0x6e5138);
    const body = mesh(R, new R.SphereGeometry(0.5, 8, 6), fur, 0, 0.75, 0); g.add(body);
    g.add(mesh(R, new R.SphereGeometry(0.34, 8, 6), fur, 0, 1.3, 0.1));
    for (const lz of [-0.28, 0.28]) g.add(mesh(R, new R.ConeGeometry(0.12, 0.35, 5), fur, 0, 1.62, lz));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.4 + s.ph) * 3.5;
        g.position.z = s.bz + Math.sin(t * 0.36 + s.ph) * 3.5;
        g.rotation.y = t * 0.4 + s.ph;
        body.position.y = 0.75 + Math.abs(Math.sin(t * 6 + s.ph)) * 0.1;
      },
    };
  },
  /* Round bird. */
  'porg': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const body = mesh(R, new R.SphereGeometry(0.45, 10, 8), M(R, 0xd8cfc0), 0, 0.7, 0); g.add(body);
    const beak = mesh(R, new R.ConeGeometry(0.14, 0.35, 6), M(R, 0xe09a3a), 0, 0.75, 0.45);
    beak.rotation.x = Math.PI / 2; g.add(beak);
    const wgeo = new R.PlaneGeometry(0.7, 0.3); wgeo.translate(0.35, 0, 0);
    const wl = mesh(R, wgeo, M(R, 0x8a7a68, { side: R.DoubleSide }), 0, 0.8, 0); g.add(wl);
    return {
      group: g,
      update: function (t) {
        s.base();
        const hop = Math.abs(Math.sin(t * 3 + s.ph));
        g.position.y = s.by + hop * 0.35;
        g.position.x = s.bx + Math.cos(t * 0.3 + s.ph) * 2.5;
        g.position.z = s.bz + Math.sin(t * 0.27 + s.ph) * 2.5;
        g.rotation.y = t * 0.3 + s.ph;
        body.scale.y = 1 - hop * 0.12;
      },
    };
  },
  /* Floating black pod + legs. */
  'probe-droid': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const pod = mesh(R, new R.SphereGeometry(0.7, 10, 8), M(R, 0x17181c, { metalness: 0.6, roughness: 0.35 }), 0, 2.4, 0);
    pod.scale.y = 1.25; g.add(pod);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = mesh(R, new R.CylinderGeometry(0.07, 0.05, 1.6, 5), M(R, 0x2b2d33), Math.cos(a) * 0.7, 1.5, Math.sin(a) * 0.7);
      leg.rotation.z = Math.cos(a) * 0.5; leg.rotation.x = -Math.sin(a) * 0.5; g.add(leg);
    }
    g.add(mesh(R, new R.SphereGeometry(0.16, 8, 6), E(R, 0xff3b30), 0, 2.5, 0.68));
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.y = s.by + Math.sin(t * 1.8 + s.ph) * 0.35 + 0.2;
        g.position.x = s.bx + Math.cos(t * 0.25 + s.ph) * 5;
        g.position.z = s.bz + Math.sin(t * 0.22 + s.ph) * 5;
        g.rotation.y = t * 0.5 + s.ph;
      },
    };
  },
  /* Simple swimmer. */
  'fish': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const fm = M(R, 0x4a7a9e);
    const body = mesh(R, new R.ConeGeometry(0.35, 1.6, 6), fm, 0, 0, 0);
    body.rotation.z = -Math.PI / 2; g.add(body);
    const tail = mesh(R, new R.PlaneGeometry(0.5, 0.6), M(R, 0x4a7a9e, { side: R.DoubleSide }), -0.95, 0, 0);
    g.add(tail);
    return {
      group: g,
      update: function (t) {
        s.base();
        const nx = s.bx + Math.cos(t * 0.45 + s.ph) * 6, nz = s.bz + Math.sin(t * 0.4 + s.ph) * 6;
        g.rotation.y = Math.atan2(nx - g.position.x, nz - g.position.z) - Math.PI / 2;
        g.position.x = nx; g.position.z = nz;
        g.position.y = s.by + Math.sin(t * 1.3 + s.ph) * 0.5;
        tail.rotation.y = Math.sin(t * 8 + s.ph) * 0.5;
      },
    };
  },
  /* Robed figure + staff. */
  'tuskan': function (R) {
    const g = new R.Group(), s = wanderState(g);
    const robe = mesh(R, new R.ConeGeometry(0.6, 1.9, 7), M(R, 0x9a8a72), 0, 0.95, 0); g.add(robe);
    g.add(mesh(R, new R.SphereGeometry(0.32, 8, 6), M(R, 0x7a6a55), 0, 1.95, 0));
    for (const lz of [-0.2, 0.2]) {
      const tusk = mesh(R, new R.ConeGeometry(0.06, 0.5, 5), M(R, 0xe8dcc0), 0, 1.95, lz);
      tusk.rotation.x = lz > 0 ? 0.9 : -0.9; g.add(tusk);
    }
    const staff = mesh(R, new R.CylinderGeometry(0.06, 0.06, 2.2, 5), M(R, 0x5d4a33), 0.55, 1.1, 0);
    g.add(staff);
    return {
      group: g,
      update: function (t) {
        s.base();
        g.position.x = s.bx + Math.cos(t * 0.16 + s.ph) * 5;
        g.position.z = s.bz + Math.sin(t * 0.14 + s.ph) * 5;
        g.rotation.y = Math.sin(t * 0.16 + s.ph) * 1.2;
        robe.rotation.z = Math.sin(t * 1.4 + s.ph) * 0.04;
        staff.rotation.z = Math.sin(t * 1.4 + s.ph) * 0.08;
      },
    };
  },
};

export function buildAmbient(type, THREE, T) {
  const R = R3(THREE);
  const b = AMBIENT[type];
  if (!b) throw new Error('[star-wars] unknown ambient type: ' + type);
  return b(R, T);
}
