// Landmark + ambient-critter builders for the Middle-earth open world.
// Original procedural geometry: boxes/cylinders/cones/spheres, flat-shaded,
// no shadow maps. Emissive only as small localized accents (windows, lava).
// Colliders are in LOCAL space: [{ x, z, r }] circles on the ground plane.

function mat(R, T, maker, fallbackColor, extra = {}) {
  try {
    const t = T[maker]();
    return new R.MeshStandardMaterial({ map: t, flatShading: true, roughness: 1, ...extra });
  } catch {
    return new R.MeshStandardMaterial({ color: fallbackColor, flatShading: true, roughness: 1, ...extra });
  }
}

function glow(R, color, intensity = 1.2) {
  return new R.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
}

function box(R, w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new R.Mesh(new R.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function cyl(R, rt, rb, h, seg, material, x = 0, y = 0, z = 0) {
  const m = new R.Mesh(new R.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  return m;
}

const BUILDERS = {
  'hobbit-hole'(R, T) {
    const g = new R.Group();
    const mound = new R.Mesh(new R.SphereGeometry(3.2, 12, 8), mat(R, T, 'grassTexture', 0x4f8f3a));
    mound.scale.set(1.4, 0.75, 1);
    mound.position.y = 0.4;
    g.add(mound);
    const door = cyl(R, 1, 1, 0.3, 16, mat(R, T, 'barkTexture', 0x6b4a2a), 0, 1.1, 4.35);
    door.rotation.x = Math.PI / 2;
    g.add(door);
    const win = new R.Mesh(new R.CircleGeometry(0.35, 12), glow(R, 0xffc86e));
    win.position.set(-2.4, 1.5, 3.7);
    win.rotation.y = 0.5;
    g.add(win);
    return { group: g, colliders: [{ x: 0, z: 0, r: 2.6 }] };
  },

  'party-tree'(R, T) {
    const g = new R.Group();
    g.add(cyl(R, 0.7, 1, 5, 8, mat(R, T, 'barkTexture', 0x5a4128), 0, 2.5, 0));
    const leaf = mat(R, T, 'grassTexture', 0x3f7d33);
    [[0, 6.5, 0, 3.4], [2.4, 5.4, 1.2, 2.4], [-2.3, 5.6, -1, 2.5], [0.2, 5.2, 2.4, 2.2]].forEach(([x, y, z, r]) => {
      const s = new R.Mesh(new R.SphereGeometry(r, 10, 8), leaf);
      s.position.set(x, y, z);
      g.add(s);
    });
    return { group: g, colliders: [{ x: 0, z: 0, r: 1.2 }] };
  },

  'green-dragon'(R, T) {
    const g = new R.Group();
    const walls = box(R, 7, 3.2, 5, mat(R, T, 'stoneTexture', 0x8a8578), 0, 1.6, 0);
    g.add(walls);
    const roofGeo = new R.CylinderGeometry(0.02, 3.4, 4.6, 3, 1);
    const roof = new R.Mesh(roofGeo, mat(R, T, 'thatchTexture', 0x9a7d3f));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI / 2;
    roof.scale.set(1, 1, 1.6);
    roof.position.y = 4.6;
    g.add(roof);
    const win = box(R, 1.1, 0.9, 0.1, glow(R, 0xffb347), -1.6, 1.7, 2.55);
    g.add(win);
    const win2 = box(R, 1.1, 0.9, 0.1, glow(R, 0xffb347), 1.6, 1.7, 2.55);
    g.add(win2);
    const doorM = box(R, 1.3, 2.2, 0.15, mat(R, T, 'barkTexture', 0x4a3320), 0, 1.1, 2.55);
    g.add(doorM);
    return { group: g, colliders: [{ x: 0, z: 0, r: 4.2 }] };
  },

  // The Dwarven Smith's forge (patron smith, 2026-10-24) — a stone
  // smithy beside the dwarf of Erebor in the White City: walls,
  // chimney, a glowing forge mouth, an anvil, and a rune-lit lintel.
  'dwarf-forge'(R, T) {
    const g = new R.Group();
    const stone = mat(R, T, 'stoneTexture', 0x7d7a72);
    const dark = mat(R, T, 'barkTexture', 0x3a332c);
    g.add(box(R, 7, 3.4, 5.5, stone, 0, 1.7, 0));
    const roof = new R.Mesh(new R.CylinderGeometry(0.02, 3.6, 5.2, 3, 1), mat(R, T, 'thatchTexture', 0x6b5a34));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI / 2;
    roof.scale.set(1, 1, 1.5);
    roof.position.y = 4.9;
    g.add(roof);
    g.add(cyl(R, 0.5, 0.65, 3.4, 8, stone, 2.6, 4.6, -1.6));
    const mouth = box(R, 1.6, 1.1, 0.2, glow(R, 0xff7a1a, 1.6), -1.8, 0.9, 2.8);
    g.add(mouth);
    g.add(box(R, 1.2, 0.7, 0.8, dark, 0.4, 0.55, 2.2));
    g.add(box(R, 1.5, 0.25, 0.5, mat(R, T, 'stoneTexture', 0x9a948a), 0.4, 1.0, 2.2));
    const rune = box(R, 2.2, 0.4, 0.1, glow(R, 0x7fd8d0, 0.9), 0, 3.0, 2.8);
    g.add(rune);
    return { group: g, colliders: [{ x: 0, z: 0, r: 3.8 }] };
  },

  'rivendell-terrace'(R, T) {
    const g = new R.Group();
    const marble = mat(R, T, 'marbleTexture', 0xe8e2d2);
    const base = box(R, 12, 1, 8, marble, 0, 0.5, 0);
    g.add(base);
    for (let i = -2; i <= 2; i++) {
      g.add(cyl(R, 0.35, 0.42, 4.4, 8, marble, i * 2.6, 3.2, -2.6));
      const arch = new R.Mesh(new R.TorusGeometry(1.3, 0.28, 8, 12, Math.PI), marble);
      arch.position.set(i * 2.6, 5.4, -2.6);
      g.add(arch);
    }
    const beam = box(R, 13, 0.6, 1, marble, 0, 6.4, -2.6);
    g.add(beam);
    for (let s = 0; s < 3; s++) g.add(box(R, 3, 0.35, 1.4, marble, 0, 0.18 + s * 0.35, 4.6 + s * 0.8));
    return { group: g, colliders: [{ x: 0, z: -1, r: 6.5 }] };
  },

  waterfall(R, T) {
    const g = new R.Group();
    const sheet = new R.Mesh(
      new R.PlaneGeometry(4, 9),
      new R.MeshStandardMaterial({ color: 0xbfe3ef, transparent: true, opacity: 0.55, roughness: 0.3 })
    );
    sheet.position.set(0, 4.5, 0);
    g.add(sheet);
    const foam = new R.Mesh(new R.SphereGeometry(2.6, 10, 8), mat(R, T, 'waterTexture', 0xdff2f7));
    foam.scale.set(1.2, 0.35, 1);
    foam.position.set(0, 0.3, 1.4);
    g.add(foam);
    g.add(box(R, 5.5, 11, 1.2, mat(R, T, 'rockTexture', 0x6f6a63), 0, 5, -0.8));
    return { group: g, colliders: [{ x: 0, z: -0.8, r: 2.2 }] };
  },

  'moria-door'(R, T) {
    const g = new R.Group();
    const stone = mat(R, T, 'stoneTexture', 0x7d7a72);
    g.add(box(R, 2.6, 9, 1, stone, -1.5, 4.5, 0));
    g.add(box(R, 2.6, 9, 1, stone, 1.5, 4.5, 0));
    const tracery = glow(R, 0x7fd8d0, 0.7);
    g.add(box(R, 0.08, 5.5, 0.06, tracery, -1.5, 4.6, 0.55));
    g.add(box(R, 0.08, 5.5, 0.06, tracery, 1.5, 4.6, 0.55));
    g.add(box(R, 4.4, 0.08, 0.06, tracery, 0, 7.6, 0.55));
    return { group: g, colliders: [{ x: -1.5, z: 0, r: 1.6 }, { x: 1.5, z: 0, r: 1.6 }] };
  },

  'moria-bridge'(R, T) {
    const g = new R.Group();
    const chasm = box(R, 16, 8, 9, mat(R, T, 'rockTexture', 0x0b0b0d), 0, -4.1, 0);
    g.add(chasm);
    g.add(box(R, 30, 0.8, 2.2, mat(R, T, 'stoneTexture', 0x6a675e), 0, 0.4, 0));
    g.add(box(R, 3, 1.2, 2.6, mat(R, T, 'stoneTexture', 0x6a675e), -13.5, 0.6, 0));
    g.add(box(R, 3, 1.2, 2.6, mat(R, T, 'stoneTexture', 0x6a675e), 13.5, 0.6, 0));
    return { group: g, colliders: [{ x: 0, z: 0, r: 1 }] };
  },

  'mallorn-tree'(R, T) {
    const g = new R.Group();
    g.add(cyl(R, 0.55, 0.85, 10, 8, mat(R, T, 'barkTexture', 0xcfc9bb), 0, 5, 0));
    const gold = mat(R, T, 'goldLeafTexture', 0xd9a92f);
    [[0, 11.5, 0, 3.8], [3, 10, 1.5, 2.6], [-3, 10.2, -1.2, 2.7], [1, 9.2, -2.6, 2.2], [-1.2, 9.4, 2.6, 2.3]].forEach(([x, y, z, r]) => {
      const s = new R.Mesh(new R.SphereGeometry(r, 10, 8), gold);
      s.position.set(x, y, z);
      g.add(s);
    });
    return { group: g, colliders: [{ x: 0, z: 0, r: 1.1 }] };
  },

  'galadriel-mirror'(R, T) {
    const g = new R.Group();
    const stone = mat(R, T, 'stoneTexture', 0x8b887e);
    g.add(cyl(R, 2.2, 2.5, 0.9, 12, stone, 0, 0.45, 0));
    const rim = new R.Mesh(new R.TorusGeometry(2.05, 0.28, 8, 20), stone);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.95;
    g.add(rim);
    const water = new R.Mesh(
      new R.CircleGeometry(1.95, 24),
      new R.MeshStandardMaterial({ color: 0x9fd4e8, emissive: 0x4a7f9a, emissiveIntensity: 0.25, roughness: 0.15 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.8;
    g.add(water);
    g.add(cyl(R, 0.5, 0.7, 2.2, 8, stone, 2.9, 1.1, 1.4));
    return { group: g, colliders: [{ x: 0, z: 0, r: 2.6 }, { x: 2.9, z: 1.4, r: 0.8 }] };
  },

  'mirkwood-web'(R, T) {
    const g = new R.Group();
    const dark = mat(R, T, 'barkTexture', 0x2c241c);
    const leafDark = new R.MeshStandardMaterial({ color: 0x1d2b16, flatShading: true, roughness: 1 });
    [[-3, 0], [3.2, -1], [0.4, 3.4]].forEach(([x, z]) => {
      g.add(cyl(R, 0.5, 0.8, 9, 7, dark, x, 4.5, z));
      const c = new R.Mesh(new R.SphereGeometry(2.6, 8, 6), leafDark);
      c.position.set(x, 9.5, z);
      c.scale.y = 0.7;
      g.add(c);
    });
    const webMat = new R.MeshStandardMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.4, side: R.DoubleSide, roughness: 1 });
    for (let i = 0; i < 5; i++) {
      const w = new R.Mesh(new R.PlaneGeometry(6 + i, 3 + i * 0.6), webMat);
      w.position.set(-3 + i * 1.5, 4 + i * 0.7, 1 + i * 0.5);
      w.rotation.y = i * 0.5;
      g.add(w);
    }
    return { group: g, colliders: [{ x: -3, z: 0, r: 1 }, { x: 3.2, z: -1, r: 1 }, { x: 0.4, z: 3.4, r: 1 }] };
  },

  'edoras-hall'(R, T) {
    const g = new R.Group();
    const wood = mat(R, T, 'barkTexture', 0x5c4227);
    g.add(box(R, 14, 4.5, 7, wood, 0, 2.25, 0));
    const roofGeo = new R.CylinderGeometry(0.02, 4.6, 15, 3, 1);
    const roof = new R.Mesh(roofGeo, new R.MeshStandardMaterial({ color: 0xc9a24a, flatShading: true, roughness: 0.8 }));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI / 2;
    roof.scale.set(1, 1, 1.15);
    roof.position.y = 6.6;
    g.add(roof);
    const win = box(R, 1, 0.8, 0.1, glow(R, 0xffb347), -3, 2.8, 3.55);
    g.add(win);
    const win2 = box(R, 1, 0.8, 0.1, glow(R, 0xffb347), 3, 2.8, 3.55);
    g.add(win2);
    for (let i = -3; i <= 3; i++) g.add(box(R, 0.5, 4.5, 0.5, wood, i * 2, 2.25, 3.6));
    return { group: g, colliders: [{ x: 0, z: 0, r: 7.5 }] };
  },

  'minas-tirith'(R, T) {
    const g = new R.Group();
    const white = mat(R, T, 'stoneTexture', 0xe4ddc9);
    g.add(cyl(R, 9, 10, 3, 16, white, 0, 1.5, 0));
    g.add(cyl(R, 6.5, 7.5, 3, 16, white, 0, 4.5, 0));
    g.add(cyl(R, 4, 5, 3, 16, white, 0, 7.5, 0));
    g.add(cyl(R, 1.6, 2, 7, 10, white, 0, 12, 0));
    const spire = new R.Mesh(new R.ConeGeometry(2, 3, 10), white);
    spire.position.y = 17;
    g.add(spire);
    const beacon = box(R, 0.5, 0.5, 0.5, glow(R, 0xff8c2e), 0, 18.2, 0);
    g.add(beacon);
    return { group: g, colliders: [{ x: 0, z: 0, r: 10 }] };
  },

  'black-gate'(R, T) {
    const g = new R.Group();
    const dark = mat(R, T, 'rockTexture', 0x232326);
    g.add(cyl(R, 2.4, 3, 14, 10, dark, -5, 7, 0));
    g.add(cyl(R, 2.4, 3, 14, 10, dark, 5, 7, 0));
    g.add(box(R, 14, 10, 2.4, dark, 0, 5, 0));
    g.add(box(R, 4.4, 7, 2.6, mat(R, T, 'rockTexture', 0x17171a), 0, 3.5, 0));
    const teeth = box(R, 14, 1.2, 2.6, dark, 0, 10.6, 0);
    g.add(teeth);
    return { group: g, colliders: [{ x: -5, z: 0, r: 3 }, { x: 5, z: 0, r: 3 }, { x: 0, z: 0, r: 2 }] };
  },

  'barad-dur'(R, T) {
    const g = new R.Group();
    const dark = mat(R, T, 'rockTexture', 0x1a1a1e);
    g.add(cyl(R, 2.2, 4.5, 22, 10, dark, 0, 11, 0));
    g.add(cyl(R, 3.4, 2.6, 3, 10, dark, 0, 22.5, 0));
    const eye = new R.Mesh(new R.CircleGeometry(0.55, 16), glow(R, 0xff2a00, 1.6));
    eye.position.set(0, 21.2, 2.9);
    eye.rotation.y = 0.15;
    g.add(eye);
    return { group: g, colliders: [{ x: 0, z: 0, r: 4.5 }] };
  },

  'mount-doom'(R, T) {
    const g = new R.Group();
    const cone = new R.Mesh(
      new R.CylinderGeometry(4, 16, 18, 14),
      mat(R, T, 'lavaTexture', 0x3a2c26)
    );
    cone.position.y = 9;
    g.add(cone);
    const cap = new R.Mesh(
      new R.CylinderGeometry(4.1, 6.5, 5, 14),
      new R.MeshStandardMaterial({ color: 0x8a3a1a, emissive: 0xff5a00, emissiveIntensity: 0.45, flatShading: true, roughness: 1 })
    );
    cap.position.y = 15.5;
    g.add(cap);
    const lava = new R.Mesh(new R.CircleGeometry(3.4, 14), glow(R, 0xff6a00, 1.8));
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = 18.1;
    g.add(lava);
    const ashRing = new R.Mesh(new R.CylinderGeometry(16.5, 19, 2, 14), mat(R, T, 'ashTexture', 0x4a4540));
    ashRing.position.y = 1;
    g.add(ashRing);
    return { group: g, colliders: [{ x: 0, z: 0, r: 16 }] };
  },

  arganath(R, T) {
    const g = new R.Group();
    const stone = mat(R, T, 'stoneTexture', 0x9a958a);
    [-7, 7].forEach((x) => {
      g.add(box(R, 3.4, 2.4, 3.4, stone, x, 1.2, 0));
      g.add(box(R, 2.6, 6.5, 2.6, stone, x, 5.6, 0));
      g.add(box(R, 2, 3.4, 2, stone, x, 10.5, 0));
      const head = new R.Mesh(new R.SphereGeometry(1.05, 10, 8), stone);
      head.position.set(x, 13.2, 0);
      g.add(head);
      const arm = box(R, 0.9, 5.5, 0.9, stone, x + (x < 0 ? -1.4 : 1.4), 11.8, 0);
      arm.rotation.z = x < 0 ? 0.5 : -0.5;
      g.add(arm);
    });
    return { group: g, colliders: [{ x: -7, z: 0, r: 2.2 }, { x: 7, z: 0, r: 2.2 }] };
  },

  /* ---- expansive-treatment additions (2026-10-23) ---- */

  'shire-mound'(R, T) {
    // A grassy dwelling mound with a round door in the side: the
    // hobbit-hole's humbler cousin, no GLB seat.
    const g = new R.Group();
    const mound = new R.Mesh(new R.SphereGeometry(3, 12, 8), mat(R, T, 'grassTexture', 0x558f3e));
    mound.scale.set(1.5, 0.7, 1.1);
    mound.position.y = 0.3;
    g.add(mound);
    const door = cyl(R, 0.85, 0.85, 0.25, 14, mat(R, T, 'barkTexture', 0x7a4a22), 1.2, 0.95, 3.1);
    door.rotation.x = Math.PI / 2;
    g.add(door);
    const win = new R.Mesh(new R.CircleGeometry(0.3, 10), glow(R, 0xffc86e));
    win.position.set(-1.9, 1.25, 2.85);
    win.rotation.y = -0.55;
    g.add(win);
    return { group: g, colliders: [{ x: 0, z: 0, r: 3.4 }] };
  },

  'elven-arch'(R, T) {
    const g = new R.Group();
    const marble = mat(R, T, 'marbleTexture', 0xe6e0d0);
    g.add(cyl(R, 0.4, 0.55, 7, 8, marble, -3.4, 3.5, 0));
    g.add(cyl(R, 0.4, 0.55, 7, 8, marble, 3.4, 3.5, 0));
    const arc = new R.Mesh(new R.TorusGeometry(3.4, 0.34, 8, 16, Math.PI), marble);
    arc.position.y = 7;
    g.add(arc);
    return { group: g, colliders: [{ x: -3.4, z: 0, r: 0.8 }, { x: 3.4, z: 0, r: 0.8 }] };
  },

  'ford-stones'(R, T) {
    // Flat stepping rocks in the gorge shallows — walk-over dressing,
    // deliberately NO colliders (they are the crossing).
    const g = new R.Group();
    const rock = mat(R, T, 'rockTexture', 0x7a766e);
    [[-4, -1, 1.6], [-1.4, 0.6, 1.3], [1.2, -0.4, 1.5], [3.8, 0.8, 1.2], [0, 2.6, 1]].forEach(([x, z, r]) => {
      const s = new R.Mesh(new R.SphereGeometry(r, 9, 6), rock);
      s.scale.y = 0.35;
      s.position.set(x, 0.1, z);
      g.add(s);
    });
    return { group: g, colliders: [] };
  },

  'watch-rock'(R, T) {
    const g = new R.Group();
    const rock = mat(R, T, 'rockTexture', 0x75726b);
    const base = new R.Mesh(new R.IcosahedronGeometry(3.4, 0), rock);
    base.scale.y = 1.5;
    base.position.y = 2.2;
    g.add(base);
    const top = new R.Mesh(new R.IcosahedronGeometry(1.8, 0), rock);
    top.position.y = 6.4;
    g.add(top);
    return { group: g, colliders: [{ x: 0, z: 0, r: 3.6 }] };
  },

  'beacon-pyre'(R, T) {
    const g = new R.Group();
    const stone = mat(R, T, 'stoneTexture', 0x8b877e);
    g.add(cyl(R, 3.2, 3.8, 1.2, 12, stone, 0, 0.6, 0));
    const wood = mat(R, T, 'barkTexture', 0x4a3320);
    for (let i = 0; i < 5; i++) {
      const log = cyl(R, 0.28, 0.28, 3.6, 6, wood, (i % 3 - 1) * 0.8, 2.2, ((i / 2) | 0) * 0.8 - 0.8);
      log.rotation.z = (i % 2 ? 0.5 : -0.5);
      g.add(log);
    }
    const flame = new R.Mesh(new R.ConeGeometry(0.9, 2.2, 8), glow(R, 0xff7a1e, 1.5));
    flame.position.y = 3.6;
    flame.userData.pulse = true;
    g.add(flame);
    return { group: g, colliders: [{ x: 0, z: 0, r: 3.9 }] };
  },

  'gondor-tower'(R, T) {
    const g = new R.Group();
    const white = mat(R, T, 'stoneTexture', 0xe4ddc9);
    g.add(cyl(R, 2.6, 3.4, 15, 10, white, 0, 7.5, 0));
    g.add(cyl(R, 3.4, 3.4, 1.2, 10, white, 0, 15.4, 0));
    const cap = new R.Mesh(new R.ConeGeometry(3.2, 3.4, 10), mat(R, T, 'stoneTexture', 0x9a958a));
    cap.position.y = 17.6;
    g.add(cap);
    const win = box(R, 0.7, 1.1, 0.12, glow(R, 0xffc86e), 0, 12.5, 3.32);
    g.add(win);
    return { group: g, colliders: [{ x: 0, z: 0, r: 3.6 }] };
  },

  'white-tree'(R, T) {
    const g = new R.Group();
    const pale = new R.MeshStandardMaterial({ color: 0xd9d4c4, flatShading: true, roughness: 1 });
    g.add(cyl(R, 0.45, 0.7, 5.5, 8, pale, 0, 2.75, 0));
    const blossom = new R.MeshStandardMaterial({ color: 0xf2eee0, flatShading: true, roughness: 1 });
    [[0, 7.4, 0, 2.6], [1.9, 6.4, 0.8, 1.8], [-1.8, 6.6, -0.7, 1.9]].forEach(([x, y, z, r]) => {
      const s = new R.Mesh(new R.SphereGeometry(r, 9, 7), blossom);
      s.position.set(x, y, z);
      g.add(s);
    });
    const court = cyl(R, 4.6, 4.6, 0.35, 16, mat(R, T, 'marbleTexture', 0xd8d2c2), 0, 0.17, 0);
    g.add(court);
    return { group: g, colliders: [{ x: 0, z: 0, r: 1.1 }] };
  },

  'city-gate'(R, T) {
    const g = new R.Group();
    const white = mat(R, T, 'stoneTexture', 0xdfd8c6);
    g.add(box(R, 3, 9, 2.6, white, -4.6, 4.5, 0));
    g.add(box(R, 3, 9, 2.6, white, 4.6, 4.5, 0));
    g.add(box(R, 12.2, 2.2, 2.6, white, 0, 9.8, 0));
    const doorM = mat(R, T, 'barkTexture', 0x3d2c1c);
    g.add(box(R, 2.8, 7, 0.4, doorM, -1.5, 3.5, 0));
    g.add(box(R, 2.8, 7, 0.4, doorM, 1.5, 3.5, 0));
    return { group: g, colliders: [{ x: -4.6, z: 0, r: 2.4 }, { x: 4.6, z: 0, r: 2.4 }, { x: 0, z: 0, r: 1.2 }] };
  },

  'elf-path-arch'(R, T) {
    // Two leaning trunks + a lintel of woven branches over the path.
    const g = new R.Group();
    const dark = mat(R, T, 'barkTexture', 0x33291f);
    const a = cyl(R, 0.5, 0.85, 10, 7, dark, -3.6, 5, 0);
    a.rotation.z = 0.16;
    g.add(a);
    const b = cyl(R, 0.5, 0.85, 10, 7, dark, 3.6, 5, 0);
    b.rotation.z = -0.16;
    g.add(b);
    const lintel = cyl(R, 0.3, 0.3, 8.6, 6, dark, 0, 10.1, 0);
    lintel.rotation.z = Math.PI / 2;
    g.add(lintel);
    return { group: g, colliders: [{ x: -3.6, z: 0, r: 1.1 }, { x: 3.6, z: 0, r: 1.1 }] };
  },

  'ruined-watchtower'(R, T) {
    // Procedural stand-in under the GLB seat (data names the model).
    const g = new R.Group();
    const stone = mat(R, T, 'stoneTexture', 0x8b877e);
    g.add(cyl(R, 3, 3.9, 11, 9, stone, 0, 5.5, 0));
    g.add(cyl(R, 3.9, 3.9, 1, 9, stone, 0, 11.2, 0));
    const broken = box(R, 2.4, 2.6, 1.6, stone, 1.6, 12.4, 0);
    broken.rotation.z = 0.24;
    g.add(broken);
    const rubble = new R.Mesh(new R.IcosahedronGeometry(1.5, 0), stone);
    rubble.position.set(4.6, 0.7, 2.4);
    g.add(rubble);
    return { group: g, colliders: [{ x: 0, z: 0, r: 4.1 }, { x: 4.6, z: 2.4, r: 1.6 }] };
  },

  orthanc(R, T) {
    // The black tower of Isengard: four fused shards of black stone
    // rising to a forked crown. Procedural — the foundry delivered
    // no Orthanc — and the boss arena's centrepiece.
    const g = new R.Group();
    const black = new R.MeshStandardMaterial({ color: 0x17171c, flatShading: true, roughness: 0.65, metalness: 0.25 });
    const shaft = cyl(R, 3.4, 5.2, 34, 4, black, 0, 17, 0);
    shaft.rotation.y = Math.PI / 4;
    g.add(shaft);
    [[3.1, 0], [-3.1, 0], [0, 3.1], [0, -3.1]].forEach(([x, z]) => {
      const prong = cyl(R, 0.6, 1.5, 9, 4, black, x, 37, z);
      g.add(prong);
    });
    const eye = box(R, 0.55, 1.5, 0.55, glow(R, 0xbfd8ff, 1.1), 0, 30, 3.2);
    eye.userData.pulse = true;
    g.add(eye);
    const court = cyl(R, 9, 9.6, 1.1, 18, mat(R, T, 'rockTexture', 0x2a2a30), 0, 0.55, 0);
    g.add(court);
    return { group: g, colliders: [{ x: 0, z: 0, r: 6.2 }] };
  },

  'isengard-ring'(R, T) {
    // The ring wall of Isengard: a broken circle of dark stone
    // segments around Orthanc, with a south gate gap. Colliders are
    // per-segment so the wall actually stops the walker everywhere
    // except the gate arc (centred on local -z... the gate faces
    // local +x after the def's ry; the gap is centred at angle 0).
    const g = new R.Group();
    const dark = mat(R, T, 'rockTexture', 0x2e2e34);
    const colliders = [];
    const RING_R = 44;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.24) continue; // the gate gap
      const x = Math.cos(a) * RING_R, z = Math.sin(a) * RING_R;
      const seg = box(R, 10.4, 6.5, 2.2, dark, x, 3.25, z);
      seg.rotation.y = -a + Math.PI / 2;
      g.add(seg);
      colliders.push({ x, z, r: 5.4 });
    }
    return { group: g, colliders };
  },
};

/* Type aliases: pod defs name the place; an existing builder wears
 * the name (the Green Dragon stands in for every roadside inn; the
 * terrace serves as the elven pavilion until its GLB swaps in). */
BUILDERS['roadside-inn'] = BUILDERS['green-dragon'];
BUILDERS['elven-pavilion'] = BUILDERS['rivendell-terrace'];
BUILDERS['rohan-hall'] = BUILDERS['edoras-hall'];
BUILDERS['citadel'] = BUILDERS['minas-tirith'];
BUILDERS['dark-tower'] = BUILDERS['barad-dur'];
BUILDERS['spider-hollow'] = BUILDERS['mirkwood-web'];

const LANDMARK_TYPES = Object.keys(BUILDERS);

export function buildLandmark(type, R, T = {}) {
  const builder = BUILDERS[type];
  if (!builder) return { group: new R.Group(), colliders: [] };
  const result = builder(R, T);
  if (!result || !result.group) return { group: new R.Group(), colliders: [] };
  return { group: result.group, colliders: Array.isArray(result.colliders) ? result.colliders : [] };
}

/* ------------------------------------------------------------------
 * GLB seats — the foundry's real constructs. A data.js landmark
 * entry opts in with `model: '<key>'`; zone.js then uses the
 * registry colliders (the model's true footprint) and calls
 * attachGlbModel. The files are meshopt-compressed + WebP
 * (unrigged pipeline — constructs are unrigged by design), so the
 * loader carries the MeshoptDecoder, the house pattern from the
 * Star Wars program. Loading is async and best-effort: if it fails
 * (or there is no window, e.g. node tests), the procedural stand-in
 * simply stays.
 * ------------------------------------------------------------------ */
export const GLB_MODELS = {
  'hobbit-hole': {
    url: '/models/middle-earth/hobbit-hole.glb',
    meters: 13,
    colliders: [{ x: 0, z: 0, r: 6.9 }],
  },
  'roadside-inn': {
    url: '/models/middle-earth/roadside-inn.glb',
    meters: 15,
    colliders: [{ x: 0, z: 0, r: 8 }],
  },
  'elven-pavilion': {
    url: '/models/middle-earth/elven-pavilion.glb',
    meters: 15,
    colliders: [{ x: 0, z: 0, r: 8 }],
  },
  'ruined-watchtower': {
    url: '/models/middle-earth/ruined-watchtower.glb',
    meters: 11,
    colliders: [{ x: 0, z: 0, r: 5.9 }],
  },
  citadel: {
    url: '/models/middle-earth/citadel.glb',
    meters: 30,
    colliders: [{ x: 0, z: 0, r: 15.6 }],
  },
  'black-gate': {
    url: '/models/middle-earth/black-gate.glb',
    meters: 26,
    colliders: [{ x: -6.5, z: 0, r: 3.6 }, { x: 6.5, z: 0, r: 3.6 }, { x: 0, z: 0, r: 3 }],
  },
};

/**
 * Load GLB_MODELS[key] into a slot inside `holder`, normalised:
 * largest horizontal extent -> def.meters, base on y=0, centred on
 * x/z. On arrival the holder's other children (the procedural
 * stand-in) are hidden. Returns the slot group, or null when
 * loading can't happen here. Never throws.
 */
export function attachGlbModel(R, holder, key) {
  const def = GLB_MODELS[key];
  if (!def || !holder || typeof window === 'undefined') return null;
  const slot = new R.Group();
  slot.name = 'glb:' + key;
  if (def.yawFix) slot.rotation.y = def.yawFix;
  holder.add(slot);
  (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(def.url);
      const model = gltf.scene;
      const box = new R.Box3().setFromObject(model);
      const size = new R.Vector3(); box.getSize(size);
      const center = new R.Vector3(); box.getCenter(center);
      const fit = def.meters / Math.max(size.x, size.z, 1e-6);
      model.scale.setScalar(fit);
      model.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
      });
      slot.add(model);
      for (const child of [...holder.children]) {
        if (child !== slot) child.visible = false;
      }
      holder.userData.glbModel = key;
    } catch (e) {
      /* the procedural stand-in stays — by design */
    }
  })();
  return slot;
}

// ---- ambient critters ------------------------------------------------------

const AMBIENT = {
  sheep(R, T) {
    const g = new R.Group();
    const wool = new R.MeshStandardMaterial({ color: 0xf2efe6, flatShading: true, roughness: 1 });
    const body = box(R, 1.3, 0.9, 0.9, wool, 0, 0.85, 0);
    const head = box(R, 0.4, 0.5, 0.4, new R.MeshStandardMaterial({ color: 0x3a3128, flatShading: true }), 0.85, 1.0, 0);
    g.add(body, head);
    [[0.45, 0.28], [0.45, -0.28], [-0.45, 0.28], [-0.45, -0.28]].forEach(([x, z]) =>
      g.add(box(R, 0.16, 0.5, 0.16, wool, x, 0.25, z)));
    const s = { phase: Math.random() * 6 };
    return { group: g, update(t) { head.position.y = 1.0 + Math.sin(t * 1.4 + s.phase) * 0.28; } };
  },

  deer(R, T) {
    const g = new R.Group();
    const fur = new R.MeshStandardMaterial({ color: 0x8a5f36, flatShading: true, roughness: 1 });
    const body = box(R, 1.5, 0.8, 0.7, fur, 0, 1.1, 0);
    g.add(body);
    const neck = box(R, 0.28, 0.9, 0.28, fur, 0.8, 1.6, 0);
    neck.rotation.z = -0.3;
    g.add(neck);
    const head = box(R, 0.55, 0.35, 0.35, fur, 1.05, 2.05, 0);
    g.add(head);
    [[0.55, 0.22], [0.55, -0.22], [-0.55, 0.22], [-0.55, -0.22]].forEach(([x, z]) =>
      g.add(box(R, 0.14, 0.9, 0.14, fur, x, 0.45, z)));
    const s = { phase: Math.random() * 6, hx: g.position.x, hz: g.position.z };
    return {
      group: g,
      update(t) {
        const a = t * 0.25 + s.phase;
        g.position.x = s.hx + Math.cos(a) * 2.2;
        g.position.z = s.hz + Math.sin(a) * 2.2;
        g.rotation.y = -a + Math.PI / 2;
      },
    };
  },

  horse(R, T) {
    const g = new R.Group();
    const coat = new R.MeshStandardMaterial({ color: 0x5a3d24, flatShading: true, roughness: 1 });
    g.add(box(R, 2, 1, 0.9, coat, 0, 1.5, 0));
    const neck = box(R, 0.35, 1.2, 0.35, coat, 1.05, 2.2, 0);
    neck.rotation.z = -0.35;
    g.add(neck);
    g.add(box(R, 0.7, 0.4, 0.4, coat, 1.4, 2.85, 0));
    const tail = box(R, 0.14, 1.1, 0.14, coat, -1.05, 1.6, 0);
    g.add(tail);
    [[0.75, 0.3], [0.75, -0.3], [-0.75, 0.3], [-0.75, -0.3]].forEach(([x, z]) =>
      g.add(box(R, 0.18, 1.1, 0.18, coat, x, 0.55, z)));
    return { group: g, update(t) { tail.rotation.x = Math.sin(t * 2.2) * 0.35; } };
  },

  bird(R, T) {
    const g = new R.Group();
    const feather = new R.MeshStandardMaterial({ color: 0x3d4a5a, flatShading: true, side: R.DoubleSide, roughness: 1 });
    const wL = box(R, 1.1, 0.06, 0.5, feather, -0.6, 0, 0);
    const wR = box(R, 1.1, 0.06, 0.5, feather, 0.6, 0, 0);
    g.add(wL, wR);
    const s = { phase: Math.random() * 6, r: 8 + Math.random() * 6, h: 10 + Math.random() * 4 };
    return {
      group: g,
      update(t) {
        const a = t * 0.5 + s.phase;
        g.position.set(Math.cos(a) * s.r, s.h + Math.sin(t * 0.9 + s.phase) * 0.8, Math.sin(a) * s.r);
        g.rotation.y = -a;
        const flap = Math.sin(t * 9 + s.phase) * 0.55;
        wL.rotation.z = flap;
        wR.rotation.z = -flap;
      },
    };
  },

  firefly(R, T) {
    const g = new R.Group();
    const dot = new R.Mesh(new R.SphereGeometry(0.12, 6, 5), glow(R, 0xd8ff7a, 2));
    g.add(dot);
    const s = { phase: Math.random() * 6, hx: 0, hz: 0, hy: 1.4 };
    g.position.y = s.hy;
    return {
      group: g,
      update(t) {
        g.position.x = s.hx + Math.sin(t * 0.7 + s.phase) * 1.6;
        g.position.z = s.hz + Math.cos(t * 0.5 + s.phase * 2) * 1.6;
        g.position.y = s.hy + Math.sin(t * 1.1 + s.phase) * 0.5;
      },
    };
  },

  ember(R, T) {
    const g = new R.Group();
    const dot = new R.Mesh(new R.SphereGeometry(0.14, 6, 5), glow(R, 0xff6a1a, 2));
    g.add(dot);
    const s = { x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8, speed: 1 + Math.random() * 1.5, phase: Math.random() * 6 };
    return {
      group: g,
      update(t, dt = 0.016) {
        g.position.y += s.speed * dt;
        g.position.x = s.x + Math.sin(t * 2 + s.phase) * 0.4;
        if (g.position.y > 8) { g.position.y = 0; s.x = (Math.random() - 0.5) * 8; }
      },
    };
  },

  'orc-sentry'(R, T) {
    const g = new R.Group();
    const dark = new R.MeshStandardMaterial({ color: 0x141214, flatShading: true, roughness: 1 });
    g.add(box(R, 0.9, 1.5, 0.6, dark, 0, 1.05, 0));
    g.add(new R.Mesh(new R.SphereGeometry(0.34, 8, 6), dark).translateY(2.05));
    g.add(box(R, 0.16, 1.6, 0.16, dark, 0.6, 1.1, 0));
    [[0.28, 0.18], [-0.28, 0.18], [0.28, -0.18], [-0.28, -0.18]].forEach(([x, z]) =>
      g.add(box(R, 0.2, 0.7, 0.2, dark, x, 0.35, z)));
    const eyeL = box(R, 0.07, 0.07, 0.05, glow(R, 0xff3a00, 1.4), -0.12, 2.08, 0.3);
    const eyeR = box(R, 0.07, 0.07, 0.05, glow(R, 0xff3a00, 1.4), 0.12, 2.08, 0.3);
    g.add(eyeL, eyeR);
    return { group: g, update(t) { g.rotation.z = Math.sin(t * 0.8) * 0.03; } };
  },
};

const AMBIENT_TYPES = Object.keys(AMBIENT);

export function buildAmbient(type, R, T = {}) {
  const builder = AMBIENT[type];
  if (!builder) return { group: new R.Group(), update: () => {} };
  const result = builder(R, T);
  return {
    group: result.group,
    update: typeof result.update === 'function' ? result.update : () => {},
  };
}

export { LANDMARK_TYPES, AMBIENT_TYPES };
