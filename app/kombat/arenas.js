// KOMBAT ARENA — procedural franchise stages.
// No external assets: simple Three.js geometry + fog + lights.
// Poly budgets are mobile-safe (a few dozen low-seg meshes per stage).

import * as THREE from 'three';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0.05,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1,
  });
}
function add(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function light(parent, color, intensity, x, y, z, dist = 30) {
  const l = new THREE.PointLight(color, intensity, dist);
  l.position.set(x, y, z);
  parent.add(l);
  return l;
}
function starfield(parent, count, spread, yMin, yMax, zMin, zMax, color = 0xaabbff, size = 0.09) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = yMin + Math.random() * (yMax - yMin);
    pos[i * 3 + 2] = zMin - Math.random() * (zMax - zMin);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  parent.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.8 })));
}

// ------------------------------------------------------------------
// 0. CAMP CRYSTAL LAKE — moonlit lake, cabins, drifting fog (Horror)
// ------------------------------------------------------------------
function crystalLake() {
  const g = new THREE.Group();
  const updaters = [];

  // dark pine-forest floor
  add(g, new THREE.PlaneGeometry(44, 26), std(0x101a12, { roughness: 1 }), 0, 0, -2).rotation.x = -Math.PI / 2;

  // the lake — a still reflective strip behind the fight line
  const lakeMat = std(0x1a2e44, { roughness: 0.15, metalness: 0.7, emissive: 0x0a1626, emissiveIntensity: 0.6 });
  const lake = add(g, new THREE.PlaneGeometry(40, 8), lakeMat, 0, 0.02, -11);
  lake.rotation.x = -Math.PI / 2;

  // moon + its reflection shimmer
  const moon = add(g, sph(3.4, 20, 16), std(0xe8ecff, { emissive: 0xcfd8ff, emissiveIntensity: 1.1, roughness: 1 }), -8, 10.5, -24);
  void moon;
  updaters.push((dt, t) => {
    lakeMat.emissiveIntensity = 0.5 + Math.sin(t * 1.4) * 0.18;
    void dt;
  });

  starfield(g, 200, 60, 5, 24, 14, 30);

  // cabins — dark boxes with one warm window each
  const woodMat = std(0x2e2118, { roughness: 1 });
  const winMat = std(0xffc860, { emissive: 0xffb84d, emissiveIntensity: 1.8 });
  for (const [cx, cz] of [[-11, -7], [10.5, -8.5], [-6, -13]]) {
    add(g, box(3.4, 2.4, 2.8), woodMat, cx, 1.2, cz);
    add(g, cone(2.6, 1.4, 4), std(0x1c1410, { roughness: 1 }), cx, 3.1, cz).rotation.y = Math.PI / 4;
    add(g, box(0.6, 0.6, 0.06), winMat, cx - 0.7, 1.2, cz + 1.44);
  }

  // pine silhouettes
  const pineMat = std(0x0e2416, { roughness: 1 });
  for (const [tx, tz] of [[-14, -4], [14, -5], [-9, -10], [8, -12], [0, -15], [-16, -10]]) {
    add(g, cyl(0.14, 0.22, 3.2, 6), pineMat, tx, 1.6, tz);
    add(g, cone(1.5, 3.4, 7), pineMat, tx, 4.4, tz);
  }

  // drifting fog banks
  const fogMat = std(0x9aa4c0, { transparent: true, opacity: 0.09, roughness: 1 });
  const banks = [];
  for (let i = 0; i < 7; i++) {
    const b = add(g, sph(2.6, 8, 6), fogMat, -12 + i * 4, 0.6, -3 - (i % 3) * 2);
    b.scale.y = 0.3;
    banks.push({ m: b, ph: i * 1.9, speed: 0.1 + (i % 3) * 0.04 });
  }
  updaters.push((dt, t) => {
    for (const b of banks) {
      b.m.position.x += b.speed * dt;
      b.m.position.y = 0.6 + Math.sin(t * 0.7 + b.ph) * 0.15;
      if (b.m.position.x > 14) b.m.position.x = -14;
    }
  });

  light(g, 0x9fb4ff, 55, -8, 10, -20);
  light(g, 0xffb84d, 25, -11, 1.5, -7); // cabin window glow
  g.add(new THREE.AmbientLight(0x223048, 0.85));

  return {
    group: g, update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    fog: { color: 0x101826, near: 13, far: 38 }, bg: 0x0a1018,
    name: 'Camp Crystal Lake', tag: 'He is still in the water',
    franchise: 'Horror',
  };
}

// ------------------------------------------------------------------
// 1. MUSTAFAR — rivers of lava, black rock, ash sky (Sci-Fi)
// ------------------------------------------------------------------
function mustafar() {
  const g = new THREE.Group();
  const updaters = [];

  // black basalt shelf
  add(g, new THREE.PlaneGeometry(30, 20), std(0x14100c, { roughness: 1 }), 0, 0, -1).rotation.x = -Math.PI / 2;

  // lava rivers cutting across the backdrop
  const lavaMat = std(0xff5a00, { emissive: 0xff4400, emissiveIntensity: 2.6, roughness: 0.6 });
  for (const [lx, lz, w] of [[-6, -10, 3.2], [4, -13, 2.4], [-1, -17, 4.2]]) {
    const r = add(g, new THREE.PlaneGeometry(w, 14), lavaMat, lx, 0.05, lz);
    r.rotation.x = -Math.PI / 2;
    r.rotation.z = 0.25;
  }
  updaters.push((dt, t) => {
    lavaMat.emissiveIntensity = 2.3 + Math.sin(t * 2.8) * 0.5;
    void dt;
  });

  // jagged black spires
  const rockMat = std(0x1a1410, { roughness: 1 });
  const spires = [[-10, -8, 2.4, 8], [10, -9, 3, 10], [-5, -14, 1.8, 6], [7, -15, 2.2, 7], [0, -19, 3.4, 9]];
  for (const [x, z, r, h] of spires) add(g, cone(r, h, 7), rockMat, x, h / 2 - 1, z);

  // rising embers + ash
  const COUNT = 110;
  const eGeo = new THREE.BufferGeometry();
  const ePos = new Float32Array(COUNT * 3);
  const eVel = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    ePos[i * 3] = (Math.random() - 0.5) * 28;
    ePos[i * 3 + 1] = Math.random() * 9;
    ePos[i * 3 + 2] = -3 - Math.random() * 14;
    eVel[i] = 0.7 + Math.random() * 1.6;
  }
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  g.add(new THREE.Points(eGeo, new THREE.PointsMaterial({ color: 0xffa030, size: 0.13, transparent: true, opacity: 0.9 })));
  updaters.push((dt) => {
    const p = eGeo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      p[i * 3 + 1] += eVel[i] * dt;
      p[i * 3] += Math.sin(p[i * 3 + 1] * 2 + i) * dt * 0.5;
      if (p[i * 3 + 1] > 10) { p[i * 3 + 1] = -0.5; p[i * 3] = (Math.random() - 0.5) * 28; }
    }
    eGeo.attributes.position.needsUpdate = true;
  });

  light(g, 0xff5a00, 100, 0, 1.5, -9);
  light(g, 0xff2200, 45, -8, 5, -2);
  g.add(new THREE.AmbientLight(0x4a2410, 0.85));

  return {
    group: g, update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    fog: { color: 0x200e08, near: 12, far: 36 }, bg: 0x160806,
    name: 'Mustafar', tag: 'The high ground is lava',
    franchise: 'Sci-Fi',
  };
}

// ------------------------------------------------------------------
// 2. JURASSIC GATE — the park gates, torches, jungle wall (Jurassic)
// ------------------------------------------------------------------
function jurassicGate() {
  const g = new THREE.Group();
  const updaters = [];

  add(g, new THREE.PlaneGeometry(40, 24), std(0x1a2416, { roughness: 1 }), 0, 0, -2).rotation.x = -Math.PI / 2;

  // the iconic gates — two tall wooden doors, slightly ajar
  const gateMat = std(0x4a3620, { roughness: 0.95 });
  const left = add(g, box(3.2, 9, 0.7), gateMat, -2.6, 4.5, -14);
  const right = add(g, box(3.2, 9, 0.7), gateMat, 2.6, 4.5, -14);
  left.rotation.y = 0.35; right.rotation.y = -0.35;
  // crossbeam with the park name silhouette
  add(g, box(10.5, 1.1, 0.8), gateMat, 0, 9.6, -14);
  const signMat = std(0xd8b13a, { emissive: 0xa8842a, emissiveIntensity: 0.7, roughness: 0.8 });
  add(g, box(7.5, 0.5, 0.1), signMat, 0, 9.6, -13.55);

  // flaming torches flanking the gate
  const flameMat = std(0xffa020, { emissive: 0xff7a00, emissiveIntensity: 3 });
  const flames = [];
  for (const tx of [-5.4, 5.4]) {
    add(g, cyl(0.09, 0.12, 2.6, 6), std(0x2a2018, { roughness: 1 }), tx, 1.3, -13);
    const f = add(g, sph(0.22, 8, 6), flameMat, tx, 2.85, -13);
    flames.push({ m: f, ph: tx });
    light(g, 0xff8a20, 35, tx, 3, -12, 14);
  }
  updaters.push((dt, t) => {
    flameMat.emissiveIntensity = 2.6 + Math.sin(t * 9) * 0.6;
    for (const f of flames) f.m.scale.y = 1 + Math.sin(t * 11 + f.ph) * 0.25;
    void dt;
  });

  // jungle wall behind
  const leafMat = std(0x14280f, { roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const jx = -16 + i * 2.5 + (Math.random() - 0.5);
    add(g, cone(1.6 + Math.random(), 3.5 + Math.random() * 2.5, 7), leafMat, jx, 2.4, -18 - Math.random() * 4);
  }

  // paddock fence posts with a downed wire
  const postMat = std(0x3a3a3a, { roughness: 0.7, metalness: 0.5 });
  for (let i = -3; i <= 3; i++) add(g, box(0.25, 3.4, 0.25), postMat, i * 4.2, 1.7, -6);
  const wire = add(g, cyl(0.02, 0.02, 25, 4), postMat, 0, 2.9, -6);
  wire.rotation.z = Math.PI / 2;

  // fireflies
  const FC = 40;
  const fGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(FC * 3);
  for (let i = 0; i < FC; i++) {
    fPos[i * 3] = (Math.random() - 0.5) * 26;
    fPos[i * 3 + 1] = 0.5 + Math.random() * 3.5;
    fPos[i * 3 + 2] = -2 - Math.random() * 10;
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const fireflies = new THREE.Points(fGeo, new THREE.PointsMaterial({ color: 0xd8ff70, size: 0.1, transparent: true, opacity: 0.9 }));
  g.add(fireflies);
  updaters.push((dt, t) => {
    fireflies.material.opacity = 0.55 + Math.sin(t * 3) * 0.35;
    void dt;
  });

  g.add(new THREE.AmbientLight(0x2a3a2a, 0.9));

  return {
    group: g, update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    fog: { color: 0x141c12, near: 14, far: 40 }, bg: 0x0c120c,
    name: 'Jurassic Gate', tag: 'Life finds a way',
    franchise: 'Jurassic',
  };
}

// ------------------------------------------------------------------
// 3. FIREHOUSE ROOF — night rooftop over the city, string lights
// ------------------------------------------------------------------
function firehouseRoof() {
  const g = new THREE.Group();
  const updaters = [];

  // rooftop slab + parapet
  add(g, box(26, 0.6, 16), std(0x3a3a40, { roughness: 0.95 }), 0, -0.3, -2);
  const parMat = std(0x6b2a22, { roughness: 0.9 }); // brick-red parapet
  add(g, box(26, 1.1, 0.5), parMat, 0, 0.55, -9.5);
  add(g, box(0.5, 1.1, 16), parMat, -12.75, 0.55, -2);
  add(g, box(0.5, 1.1, 16), parMat, 12.75, 0.55, -2);

  // water tower silhouette
  const woodMat = std(0x4a3220, { roughness: 1 });
  add(g, cyl(1.6, 1.7, 2.6, 10), woodMat, -8.5, 5.4, -7);
  add(g, cone(1.9, 1.2, 10), std(0x33302c, { roughness: 1 }), -8.5, 7.3, -7);
  for (const [lx, lz] of [[-9.4, -7.9], [-7.6, -7.9], [-9.4, -6.1], [-7.6, -6.1]]) {
    add(g, box(0.22, 4.2, 0.22), woodMat, lx, 2.1, lz);
  }

  // vent boxes + AC unit
  const ventMat = std(0x555a60, { roughness: 0.7, metalness: 0.4 });
  add(g, box(1.2, 1.4, 1.2), ventMat, 7.5, 0.7, -6);
  add(g, box(2.2, 1.0, 1.4), ventMat, 9.5, 0.5, -3);
  add(g, cyl(0.3, 0.3, 1.8, 8), ventMat, 6.2, 0.9, -7.5);

  // containment unit — glowing green box (a nod to the ghost crew)
  const contMat = std(0x0d2a12, { emissive: 0x22ff66, emissiveIntensity: 1.4, roughness: 0.6 });
  add(g, box(1.6, 1.0, 1.0), contMat, -4.5, 0.5, -8.2);

  // distant city: dark slabs with lit windows
  const cityMat = std(0x0c0e16, { roughness: 1 });
  const winMat = std(0xffd98a, { emissive: 0xffc860, emissiveIntensity: 1.6 });
  const rng = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 22; i++) {
    const w = rng(2, 5), h = rng(4, 12);
    const bx = rng(-28, 28), bz = -20 - rng(0, 10);
    add(g, box(w, h, w), cityMat, bx, h / 2 - 1, bz);
    // a few lit windows per building
    const wins = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < wins; k++) {
      add(g, box(0.3, 0.3, 0.05), winMat, bx + rng(-w / 3, w / 3), rng(0, h - 1), bz + w / 2 + 0.03);
    }
  }

  // string lights across the roof
  const bulbMat = std(0xffe0a0, { emissive: 0xffb84d, emissiveIntensity: 2.6 });
  const bulbGeo = sph(0.09, 6, 5);
  const catenary = [];
  for (let i = 0; i <= 16; i++) {
    const x = -8 + i;
    const y = 4.6 - Math.sin((i / 16) * Math.PI) * 1.1;
    catenary.push([x, y, -5]);
  }
  for (const [x, y, z] of catenary) add(g, bulbGeo, bulbMat, x, y, z);
  updaters.push((dt, t) => {
    bulbMat.emissiveIntensity = 2.4 + Math.sin(t * 5) * 0.35;
    void dt;
  });

  light(g, 0xffb84d, 40, 0, 4.5, -5);
  light(g, 0x6688ff, 30, 8, 6, -12);
  g.add(new THREE.AmbientLight(0x2a3048, 0.9));

  return {
    group: g, update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    fog: { color: 0x0c1018, near: 16, far: 44 }, bg: 0x080b12,
    name: 'Firehouse Roof', tag: 'Who ya gonna call?',
    franchise: 'Ghostbusters',
  };
}

// ------------------------------------------------------------------
// 4. SUNSET CANYON — desert mesas at golden hour (Toons)
// ------------------------------------------------------------------
function sunsetCanyon() {
  const g = new THREE.Group();
  const updaters = [];

  // sand floor
  add(g, new THREE.PlaneGeometry(46, 26), std(0xc98a4a, { roughness: 1 }), 0, 0, -2).rotation.x = -Math.PI / 2;

  // big low sun
  const sun = add(g, sph(3.6, 20, 16), std(0xffd27a, { emissive: 0xffb84d, emissiveIntensity: 2.2, roughness: 1 }), 9, 4.2, -26);
  void sun;

  // mesa silhouettes — flat-topped desert towers
  const mesaMat = std(0x8a4a2a, { roughness: 1 });
  const mesaTopMat = std(0xa85c34, { roughness: 1 });
  const mesas = [[-14, -16, 5, 7], [-6, -20, 7, 9], [4, -17, 4.5, 6], [12, -21, 8, 10], [18, -15, 4, 5.5]];
  for (const [x, z, w, h] of mesas) {
    add(g, box(w, h, w * 0.8), mesaMat, x, h / 2, z);
    add(g, box(w * 1.12, h * 0.14, w * 0.9), mesaTopMat, x, h + h * 0.05, z);
  }

  // saguaro cacti
  const cactusMat = std(0x2a6a2a, { roughness: 1 });
  for (const [cx, cz] of [[-9, -6], [8.5, -7], [-4, -9], [12, -4]]) {
    add(g, cyl(0.22, 0.26, 3.4, 8), cactusMat, cx, 1.7, cz);
    add(g, cyl(0.16, 0.18, 1.6, 7), cactusMat, cx + 0.5, 2.2, cz).rotation.z = -0.5;
    add(g, cyl(0.16, 0.18, 1.3, 7), cactusMat, cx - 0.5, 2.6, cz).rotation.z = 0.5;
  }

  // heat shimmer + drifting tumbleweed
  const tumble = add(g, sph(0.5, 8, 6), std(0x9a7448, { roughness: 1 }), -10, 0.5, -4);
  updaters.push((dt, t) => {
    tumble.position.x += dt * 1.1;
    tumble.rotation.z -= dt * 2.2;
    tumble.position.y = 0.5 + Math.abs(Math.sin(t * 2.4)) * 0.5;
    if (tumble.position.x > 14) tumble.position.x = -14;
  });

  // painted-desert sky gradient handled by fog + bg
  light(g, 0xff9a4d, 70, 9, 5, -20);
  light(g, 0xffd27a, 35, -6, 6, -6);
  g.add(new THREE.AmbientLight(0x6a4a30, 0.9));

  return {
    group: g, update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    fog: { color: 0xd88a4a, near: 18, far: 46 }, bg: 0xc9763a,
    name: 'Sunset Canyon', tag: 'Meep meep',
    franchise: 'Toons',
  };
}

// ------------------------------------------------------------------
// 5. MANHATTAN ROOFTOP — New York skyline at night (Marvel)
// ------------------------------------------------------------------
function manhattanRooftop() {
  const g = new THREE.Group();
  const updaters = [];

  // rooftop slab + edge
  add(g, box(26, 0.6, 16), std(0x2e2e36, { roughness: 0.95 }), 0, -0.3, -2);
  const edgeMat = std(0x1c1c22, { roughness: 0.9 });
  add(g, box(26, 1.0, 0.4), edgeMat, 0, 0.5, -9.6);

  // skyline — dense towers with lit windows, one very tall spire
  const towerMat = std(0x0a0c14, { roughness: 1 });
  const winMat = std(0xbfe0ff, { emissive: 0x9ac8ff, emissiveIntensity: 1.5 });
  const winMat2 = std(0xffd98a, { emissive: 0xffc860, emissiveIntensity: 1.4 });
  const rng = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 26; i++) {
    const w = rng(2.5, 5), h = rng(5, 16);
    const bx = rng(-30, 30), bz = -22 - rng(0, 8);
    add(g, box(w, h, w), towerMat, bx, h / 2 - 1, bz);
    const wins = 4 + Math.floor(Math.random() * 5);
    for (let k = 0; k < wins; k++) {
      add(g, box(0.32, 0.32, 0.05), Math.random() < 0.6 ? winMat : winMat2,
        bx + rng(-w / 3, w / 3), rng(0.5, h - 1), bz + w / 2 + 0.03);
    }
  }
  // the tall spire with a blinking beacon
  add(g, box(3, 22, 3), towerMat, -14, 10, -26);
  const beaconMat = std(0xff3030, { emissive: 0xff2020, emissiveIntensity: 3 });
  const beacon = add(g, sph(0.25, 8, 6), beaconMat, -14, 21.4, -26);
  updaters.push((dt, t) => {
    beaconMat.emissiveIntensity = (Math.sin(t * 4) > 0) ? 3 : 0.2;
    void dt;
  });

  // rooftop props: vents, billboard frame, pigeon (a box, honestly)
  const propMat = std(0x4a4e56, { roughness: 0.7, metalness: 0.4 });
  add(g, box(1.4, 1.2, 1.4), propMat, 7, 0.6, -6);
  add(g, box(2.4, 0.9, 1.2), propMat, -7.5, 0.45, -5);
  const billMat = std(0x11131c, { emissive: 0x2244aa, emissiveIntensity: 0.8, roughness: 0.8 });
  add(g, box(5, 2.6, 0.25), billMat, 2, 4.4, -8.8);
  for (const px of [-0.2, 4.2]) add(g, box(0.2, 3.2, 0.2), propMat, px, 1.6, -8.8);

  starfield(g, 120, 60, 8, 26, 20, 34, 0xffffff, 0.07);

  light(g, 0x9ac8ff, 45, 0, 8, -14);
  light(g, 0xffc860, 25, 6, 4, -4);
  g.add(new THREE.AmbientLight(0x2a3450, 0.9));

  return {
    group: g, update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    fog: { color: 0x0a0e18, near: 18, far: 48 }, bg: 0x060910,
    name: 'Manhattan Rooftop', tag: 'The city that never sleeps',
    franchise: 'Marvel',
  };
}

// ------------------------------------------------------------------
// 6. MIDGAR — mako reactors and neon sprawl (Final Fantasy)
// ------------------------------------------------------------------
function midgar() {
  const g = new THREE.Group();
  const updaters = [];

  add(g, new THREE.PlaneGeometry(40, 24), std(0x12141c, { roughness: 0.7, metalness: 0.3 }), 0, 0, -2).rotation.x = -Math.PI / 2;

  // mako reactor towers — cylindrical stacks with green glow vents
  const towerMat = std(0x2a2e38, { roughness: 0.6, metalness: 0.5 });
  const makoMat = std(0x0d3a1a, { emissive: 0x22ff88, emissiveIntensity: 2.4, roughness: 0.5 });
  const reactors = [];
  for (const [rx, rz, rh] of [[-10, -14, 11], [0, -18, 13], [10, -14, 11]]) {
    add(g, cyl(2.2, 2.6, rh, 12), towerMat, rx, rh / 2, rz);
    const vent = add(g, cyl(2.35, 2.35, 0.5, 12), makoMat, rx, rh * 0.72, rz);
    reactors.push(vent);
    light(g, 0x22ff88, 40, rx, rh * 0.75, rz + 2, 18);
  }
  updaters.push((dt, t) => {
    makoMat.emissiveIntensity = 2.1 + Math.sin(t * 3.2) * 0.5;
    void dt;
  });

  // neon signage strips on pipes
  const neonPink = std(0xff2fd6, { emissive: 0xff2fd6, emissiveIntensity: 2.4 });
  const neonCyan = std(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 2.4 });
  for (let i = 0; i < 6; i++) {
    const nx = -12 + i * 4.8;
    add(g, box(2.6, 0.18, 0.18), i % 2 ? neonPink : neonCyan, nx, 3.2 + (i % 3), -8 - (i % 2) * 2);
  }

  // pipe runs
  const pipeMat = std(0x3a3e48, { roughness: 0.5, metalness: 0.6 });
  for (const [px, pz] of [[-6, -6], [6, -7]]) {
    const p = add(g, cyl(0.5, 0.5, 16, 8), pipeMat, px, 0.5, pz);
    p.rotation.z = Math.PI / 2;
  }

  // mako particles drifting up
  const MC = 60;
  const mGeo = new THREE.BufferGeometry();
  const mPos = new Float32Array(MC * 3);
  for (let i = 0; i < MC; i++) {
    mPos[i * 3] = (Math.random() - 0.5) * 30;
    mPos[i * 3 + 1] = Math.random() * 10;
    mPos[i * 3 + 2] = -4 - Math.random() * 12;
  }
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  const makoPts = new THREE.Points(mGeo, new THREE.PointsMaterial({ color: 0x44ff99, size: 0.12, transparent: true, opacity: 0.85 }));
  g.add(makoPts);
  updaters.push((dt) => {
    const p = mGeo.attributes.position.array;
    for (let i = 0; i < MC; i++) {
      p[i * 3 + 1] += dt * 0.9;
      if (p[i * 3 + 1] > 11) p[i * 3 + 1] = 0;
    }
    mGeo.attributes.position.needsUpdate = true;
  });

  light(g, 0xff2fd6, 35, -6, 4, -6);
  light(g, 0x22d3ee, 35, 6, 4, -8);
  g.add(new THREE.AmbientLight(0x2a3444, 0.85));

  return {
    group: g, update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    fog: { color: 0x101418, near: 14, far: 40 }, bg: 0x0a0d12,
    name: 'Midgar', tag: 'Mako flows beneath',
    franchise: 'Final Fantasy',
  };
}

// ------------------------------------------------------------------
// 7. HANGAR 51 — Area 51 containment hangar (Monsters vs Aliens)
// ------------------------------------------------------------------
function hangar51() {
  const g = new THREE.Group();
  const updaters = [];

  // hangar floor + curved walls suggested by panels
  add(g, new THREE.PlaneGeometry(36, 22), std(0x2e3238, { roughness: 0.6, metalness: 0.4 }), 0, 0, -2).rotation.x = -Math.PI / 2;
  const wallMat = std(0x3a3e46, { roughness: 0.7, metalness: 0.3 });
  add(g, box(36, 9, 0.6), wallMat, 0, 4.5, -16);
  for (let i = -4; i <= 4; i++) add(g, box(0.5, 9, 0.7), std(0x2a2e36, { roughness: 0.7 }), i * 4, 4.5, -15.9);

  // containment tubes — glass cylinders with... something inside
  const glassMat = std(0x88ccff, { transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0.2 });
  const gooMat = std(0x44ff88, { emissive: 0x22dd66, emissiveIntensity: 1.2, transparent: true, opacity: 0.75 });
  const tubes = [];
  for (const [tx, tz] of [[-8, -11], [-3, -12], [3, -12], [8, -11]]) {
    add(g, cyl(1.1, 1.1, 4.6, 12), glassMat, tx, 2.3, tz);
    const goo = add(g, cyl(0.85, 0.85, 2.4, 10), gooMat, tx, 1.5, tz);
    tubes.push({ m: goo, ph: tx * 1.3 });
    add(g, cyl(1.25, 1.25, 0.35, 12), wallMat, tx, 4.75, tz);
    add(g, cyl(1.25, 1.25, 0.35, 12), wallMat, tx, 0.18, tz);
  }
  updaters.push((dt, t) => {
    for (const tb of tubes) {
      tb.m.position.y = 1.5 + Math.sin(t * 1.6 + tb.ph) * 0.3;
      tb.m.rotation.y += dt * 0.6;
    }
  });

  // hazard stripes on the floor
  const stripeMat = std(0xd8a020, { emissive: 0x885a00, emissiveIntensity: 0.4, roughness: 0.9 });
  for (let i = -3; i <= 3; i++) {
    const s = add(g, box(0.5, 0.02, 6), stripeMat, i * 1.4, 0.02, -4);
    s.rotation.y = 0.5;
  }

  // overhead crane + hanging hook
  add(g, box(20, 0.5, 0.8), wallMat, 0, 8.2, -6);
  const hook = add(g, box(0.3, 1.6, 0.3), wallMat, 3, 7.2, -6);
  updaters.push((dt, t) => {
    hook.position.x = 3 + Math.sin(t * 0.5) * 2.5;
    void dt;
  });

  // red alert lights sweeping
  const alertMat = std(0xff2020, { emissive: 0xff1010, emissiveIntensity: 2.8 });
  const alerts = [];
  for (const ax of [-12, 12]) {
    const a = add(g, sph(0.22, 8, 6), alertMat, ax, 7.8, -15.5);
    alerts.push(a);
    light(g, 0xff2020, 25, ax, 7.4, -14, 16);
  }
  updaters.push((dt, t) => {
    alertMat.emissiveIntensity = (Math.sin(t * 6) > 0) ? 2.8 : 0.3;
    void dt;
  });

  g.add(new THREE.AmbientLight(0x3a4048, 0.9));

  return {
    group: g, update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    fog: { color: 0x14161c, near: 14, far: 38 }, bg: 0x0e1014,
    name: 'Hangar 51', tag: 'Nothing to see here',
    franchise: 'Monsters vs Aliens',
  };
}

export const ARENAS = [crystalLake, mustafar, jurassicGate, firehouseRoof, sunsetCanyon, manhattanRooftop, midgar, hangar51];

export const ARENA_META = [
  { name: 'Camp Crystal Lake', tag: 'He is still in the water', franchise: 'Horror' },
  { name: 'Mustafar', tag: 'The high ground is lava', franchise: 'Sci-Fi' },
  { name: 'Jurassic Gate', tag: 'Life finds a way', franchise: 'Jurassic' },
  { name: 'Firehouse Roof', tag: 'Who ya gonna call?', franchise: 'Ghostbusters' },
  { name: 'Sunset Canyon', tag: 'Meep meep', franchise: 'Toons' },
  { name: 'Manhattan Rooftop', tag: 'The city that never sleeps', franchise: 'Marvel' },
  { name: 'Midgar', tag: 'Mako flows beneath', franchise: 'Final Fantasy' },
  { name: 'Hangar 51', tag: 'Nothing to see here', franchise: 'Monsters vs Aliens' },
];

export function buildArena(index) {
  const builder = ARENAS[index] || ARENAS[0];
  return builder();
}
