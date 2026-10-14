// KOMBAT ARENAS — franchise stages, upgraded to the Olympus
// world-quality standard (lib/worlds/environment.js — the shared
// environment kit; see WORLD_STANDARD.md).
//
// What "upgraded" means here, per arena:
//   * LAYERED DEPTH — vista (far silhouettes, sky glow) / midground
//     (themed hero set pieces with volume) / foreground frame (duel
//     only, edges only) — never a flat backdrop strip.
//   * TEXTURE-WRAPPED surfaces — procedural canvas textures from the
//     kit (planks, stone, strata, deck plates, window grids…), kept
//     READABLE under the LIGHTING LAW: glow is local (sprites +
//     emissive maps), real point lights stay ≤ 4 per stage.
//   * ATMOSPHERE + AMBIENT LIFE — mist, embers, ash, fireflies, dust,
//     steam, water shimmer, swaying trees/vines, blinking beacons.
//   * SOLID GEOMETRY + FLOOR LAW — the fight floor's top surface is
//     y=0; every solid set piece sits outside the play space by
//     construction (≥ ~8.8 units from the arena center, overhead
//     y ≥ 5, or in the duel-only foreground frame at the frame edges).
//     The fighting band (|z| ≤ ~2) carries only flat floor detail.
//     Every mesh is stamped userData.kind ('solid' | 'ground' |
//     'flat' | 'fx') and tests/kombat-arenas.test.mjs proves it.
//   * PHONE BUDGET — instancing for repeated set pieces, window-grid
//     textures instead of per-window meshes, shared cached textures,
//     sprite particles. Mesh counts per stage are asserted in tests.
//
// Contract (unchanged): buildArena(index, opts?) →
//   { group, update(dt, t), fog {color, near, far}, bg, name, tag,
//     franchise }
// opts.foreground === false skips the duel-only foreground frame
// (brawl builds its own 360° surround in arena3d.js instead).

import * as THREE from 'three';
import {
  mulberry32, rr, wmat, canvasTexture, PAINTERS, windowsTexture,
  silhouetteTexture, textPanel, glowSprite, shadowPool, put, layer,
  groundPlane, instanced, particleField, mistBanks, starPoints, updaters, sway,
} from '../../lib/worlds/environment.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);

function ptLight(parent, color, intensity, x, y, z, dist = 30) {
  const l = new THREE.PointLight(color, intensity, dist);
  l.position.set(x, y, z);
  parent.add(l);
  return l;
}
// The clear fighting band, drawn as a flat inlay on the floor: packed
// ground, subtly lighter than the surroundings, theme-tinted trim.
function fightBand(parent, { w = 19, mat, trimMat = null }) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.1), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.userData.kind = 'flat';
  parent.add(m);
  if (trimMat) {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.14), trimMat);
      t.rotation.x = -Math.PI / 2;
      t.position.set(0, 0.014, s * 2.05);
      t.userData.kind = 'flat';
      parent.add(t);
    }
  }
  return m;
}
// Vista silhouette plane (treeline / skyline / mesa rim).
function vistaSilhouette(parent, key, color, w, h, x, y, z, seed = 7) {
  const tex = silhouetteTexture(key, { color, seed });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.position.set(x, y, z);
  m.userData.kind = 'fx';
  parent.add(m);
  return m;
}

// ------------------------------------------------------------------
// 0. CAMP CRYSTAL LAKE — moonlit lakeshore: dock, cabins, pines (Horror)
// ------------------------------------------------------------------
function crystalLake(opts = {}) {
  const g = new THREE.Group();
  const U = updaters();
  const rng = mulberry32(101);
  const vista = layer(g, 'vista'), mid = layer(g, 'midground'), atmo = layer(g, 'atmos');

  // ---- ground + fight band
  const dirtTex = canvasTexture('lake-dirt', 512, 512, PAINTERS.dirt('#232d1e', '#141a10', '#46543a'), { repeat: [7, 5] });
  g.add(groundPlane(46, 28, wmat(0xffffff, { map: dirtTex, roughness: 1 }), 0, -3));
  const pathTex = canvasTexture('lake-path', 512, 128, PAINTERS.dirt('#3a3423', '#241d12', '#6a5c3a'), { repeat: [6, 1] });
  fightBand(g, { mat: wmat(0xffffff, { map: pathTex, roughness: 1 }) });

  // ---- the lake — animated shimmer texture, dock, beached rowboat
  const waterTex = canvasTexture('lake-water', 512, 256, PAINTERS.water(), { repeat: [5, 2] });
  const lake = groundPlane(44, 10.5, wmat(0xffffff, { map: waterTex, roughness: 0.25, metalness: 0.55 }), 0, -13.6, 0.02);
  g.add(lake);
  U.push((dt, t) => { waterTex.offset.x = Math.sin(t * 0.11) * 0.02 + t * 0.004; });

  const plankTex = canvasTexture('lake-planks', 256, 256, PAINTERS.planks('#4a3421', '#2c1e12', '#6a4c2c'), { repeat: [2, 2] });
  const woodMat = wmat(0xffffff, { map: plankTex, roughness: 1 });
  // dock reaching into the lake from the left shore
  const dock = new THREE.Group(); dock.position.set(-8.4, 0, -8.6); mid.add(dock);
  put(dock, box(3.4, 0.22, 4.6), woodMat, 0, 0.42, 0);
  for (const [px, pz] of [[-1.5, -2.1], [1.5, -2.1], [-1.5, 2.1], [1.5, 2.1], [-1.5, 0], [1.5, 0]]) {
    put(dock, cyl(0.09, 0.09, 0.9, 6), woodMat, px, 0, pz);
  }
  const dockShadow = shadowPool(2.6, 0.35); dockShadow.position.set(0, -0.36, 0); dock.add(dockShadow);
  // rowboat, gently bobbing
  const boat = new THREE.Group(); boat.position.set(-10.5, 0.12, -13); boat.rotation.y = 0.5; mid.add(boat);
  put(boat, box(2.6, 0.5, 1.1), woodMat, 0, 0.1, 0);
  put(boat, box(2.2, 0.16, 0.8), wmat(0x2c1e12, { roughness: 1 }), 0, 0.36, 0);
  U.push((dt, t) => { boat.position.y = 0.12 + Math.sin(t * 0.9) * 0.05; boat.rotation.z = Math.sin(t * 0.7) * 0.03; });

  // ---- cabins with porches and lit windows
  const winTexCabin = canvasTexture('cabin-window', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffb84d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7a4a16'; ctx.fillRect(w / 2 - 2, 0, 4, h); ctx.fillRect(0, h / 2 - 2, w, 4);
  });
  const cabinWinMat = wmat(0xffffff, { map: winTexCabin, emissive: 0xffc860, emissiveMap: winTexCabin, emissiveIntensity: 1.5 });
  for (const [cx, cz, ry] of [[-11, -7, 0.25], [10.5, -8.5, -0.3], [-6, -13.5, 0.1]]) {
    const c = new THREE.Group(); c.position.set(cx, 0, cz); c.rotation.y = ry; mid.add(c);
    put(c, box(3.6, 2.5, 3), woodMat, 0, 1.25, 0);
    put(c, cone(2.8, 1.5, 4), wmat(0x1c1410, { roughness: 1 }), 0, 3.25, 0).rotation.y = Math.PI / 4;
    put(c, box(0.65, 0.65, 0.06), cabinWinMat, -0.8, 1.3, 1.53);
    put(c, box(0.65, 0.65, 0.06), cabinWinMat, 0.85, 1.3, 1.53);
    // porch: deck + two posts + roof lip
    put(c, box(3.6, 0.14, 1.1), woodMat, 0, 0.07, 2);
    put(c, cyl(0.06, 0.06, 2.1, 6), woodMat, -1.6, 1.05, 2.4);
    put(c, cyl(0.06, 0.06, 2.1, 6), woodMat, 1.6, 1.05, 2.4);
    put(c, box(3.8, 0.1, 1.3), wmat(0x1c1410, { roughness: 1 }), 0, 2.15, 2);
    const glow = glowSprite(0xffb84d, 2.6, 0.33); glow.position.set(0, 1.3, 2); c.add(glow);
    const sh = shadowPool(2.9, 0.4); sh.position.set(cx, 0.015, cz + 0.6); g.add(sh);
  }

  // ---- weathered camp sign
  const signTex = canvasTexture('camp-sign', 512, 128, (ctx, w, h) => {
    PAINTERS.planks('#4a3421', '#2c1e12', '#6a4c2c')(ctx, w, h);
    textPanel({ bg: 'rgba(0,0,0,0)', fg: '#d8c9a0', lines: ['CAMP CRYSTAL LAKE'], font: '900 64px Georgia, serif' })(ctx, w, h);
  });
  const sign = new THREE.Group(); sign.position.set(-9.3, 0, -4.2); sign.rotation.y = 0.35; mid.add(sign);
  put(sign, cyl(0.09, 0.11, 2.6, 6), woodMat, -1.5, 1.3, 0);
  put(sign, cyl(0.09, 0.11, 2.6, 6), woodMat, 1.5, 1.3, 0);
  put(sign, box(3.6, 0.95, 0.09), wmat(0xffffff, { map: signTex, roughness: 1 }), 0, 2.1, 0);

  // ---- pine forest — instanced wall + two swaying heroes
  const pineGeo = cone(1.55, 3.8, 7);
  const pineMat = wmat(0x14301c, { roughness: 1 });
  const trunkGeo = cyl(0.13, 0.2, 2.6, 6);
  const trunkMat = wmat(0x2e2118, { roughness: 1 });
  const pines = [], trunks = [];
  for (let i = 0; i < 46; i++) {
    const a = rr(rng, Math.PI * 0.95, Math.PI * 2.05); // back + side arc
    const rad = rr(rng, 10.5, 20);
    const x = Math.sin(a) * rad, z = -Math.abs(Math.cos(a)) * rad * 0.8 - 2.5;
    const s = rr(rng, 0.8, 1.5);
    pines.push({ p: [x, 2.6 * s + 1.9 * s, z], ry: rng() * 3, s });
    trunks.push({ p: [x, 1.3 * s, z], ry: 0, s });
  }
  mid.add(instanced(pineGeo, pineMat, pines, 1.6));
  mid.add(instanced(trunkGeo, trunkMat, trunks, 0.4));
  for (const [hx, hz] of [[-9.8, -3.8], [10, -4.4]]) {
    const hero = new THREE.Group(); hero.position.set(hx, 0, hz); mid.add(hero);
    put(hero, cyl(0.16, 0.24, 3, 6), trunkMat, 0, 1.5, 0);
    put(hero, cone(1.7, 4.4, 7), pineMat, 0, 4.6, 0);
    U.push(sway(hero, { amp: 0.012, speed: 0.7, phase: hx }));
  }

  // ---- vista: moon + halo, twin treeline layers, stars
  put(vista, sph(3.2, 20, 16), wmat(0xe8ecff, { emissive: 0xcfd8ff, emissiveIntensity: 1.15, roughness: 1 }), -8, 10.5, -25, 'fx');
  const halo = glowSprite(0x9fb4ff, 15, 0.4); halo.position.set(-8, 10.5, -24.4); vista.add(halo);
  vistaSilhouette(vista, 'lake-treeline-a', '#0a140d', 72, 9, 0, 3.4, -23, 11);
  vistaSilhouette(vista, 'lake-treeline-b', '#060b07', 84, 12, -4, 4.6, -27, 23);
  vista.add(starPoints({ count: 190, seed: 11 }));

  // ---- foreground frame (duel only): branch clusters + shore rocks
  if (opts.foreground !== false) {
    const fore = layer(g, 'foreground');
    for (const s of [-1, 1]) {
      const cluster = new THREE.Group(); cluster.position.set(s * 7.6, 5.4, 4.4); cluster.rotation.z = s * 0.7; fore.add(cluster);
      put(cluster, cone(1.3, 3.2, 7), pineMat, 0, 0, 0);
      put(cluster, cone(1, 2.4, 7), pineMat, s * -0.9, -0.5, 0.3);
      const rock = put(fore, box(1.7, 0.8, 1.1), wmat(0x232a24, { roughness: 1 }), s * 6.5, 0.3, 4.3);
      rock.rotation.y = s * 0.4;
    }
  }

  // ---- atmosphere: lake mist + cold motes over the water
  const mist = mistBanks({ count: 6, color: 0x8fa3c8, opacity: 0.1, y: 0.65, z: -8, spread: 30, scale: [9, 2.4], speed: 0.16, seed: 31 });
  atmo.add(mist.group); U.push(mist.update);
  const flies = particleField({ count: 26, area: { x: 24, y: 2.6, z: [-4, -11] }, color: 0xcfe8ff, size: 0.07, opacity: 0.7, mode: 'float', seed: 41 });
  atmo.add(flies.points); U.push(flies.update);

  ptLight(g, 0x9fb4ff, 55, -8, 10, -18);
  ptLight(g, 0xffb84d, 26, -11, 1.6, -6.4);
  g.add(new THREE.AmbientLight(0x223048, 0.85));

  return {
    group: g, update: (dt, t) => U.run(dt, t),
    fog: { color: 0x101826, near: 13, far: 40 }, bg: 0x0a1018,
    name: 'Camp Crystal Lake', tag: 'He is still in the water',
    franchise: 'Horror',
  };
}

// ------------------------------------------------------------------
// 1. MUSTAFAR — lava rivers, crust pools, spires, mining rig (Sci-Fi)
// ------------------------------------------------------------------
function mustafar(opts = {}) {
  const g = new THREE.Group();
  const U = updaters();
  const rng = mulberry32(202);
  const vista = layer(g, 'vista'), mid = layer(g, 'midground'), atmo = layer(g, 'atmos');

  // ---- basalt ground + glowing crust band
  const basaltTex = canvasTexture('mustafar-basalt', 512, 512, PAINTERS.dirt('#171310', '#0c0a08', '#2c211a'), { repeat: [7, 5] });
  g.add(groundPlane(44, 28, wmat(0xffffff, { map: basaltTex, roughness: 1 }), 0, -3));
  const crustTex = canvasTexture('mustafar-crust', 512, 128, PAINTERS.lavacrust(), { repeat: [6, 1] });
  const crustMat = wmat(0xffffff, { map: crustTex, emissive: 0xff5a00, emissiveMap: crustTex, emissiveIntensity: 0.55, roughness: 0.9 });
  fightBand(g, { mat: crustMat });
  U.push((dt, t) => { crustMat.emissiveIntensity = 0.45 + Math.sin(t * 1.7) * 0.14; });

  // ---- lava rivers + pools + a scrolling lava fall
  const riverTex = canvasTexture('mustafar-river', 256, 512, PAINTERS.lavacrust('#ff7a1a'), { repeat: [1, 3] });
  const riverMat = wmat(0xffffff, { map: riverTex, emissive: 0xff4400, emissiveMap: riverTex, emissiveIntensity: 2.1, roughness: 0.6 });
  for (const [lx, lz, w] of [[-6, -12.5, 3.4], [4.5, -15, 2.6], [-1, -19, 4.4]]) {
    const r = groundPlane(w, 15, riverMat, lx, lz, 0.03);
    r.rotation.z = 0.22;
    g.add(r);
  }
  const poolMat = wmat(0xff5a00, { emissive: 0xff4400, emissiveIntensity: 2.3, roughness: 0.5 });
  for (const [px, pz, pr] of [[-10.2, -4.6, 1.9], [10.8, -6.6, 2.3], [-4.2, -12.2, 1.5]]) {
    const p = put(g, new THREE.CircleGeometry(pr, 18), poolMat, px, 0.03, pz, 'flat');
    p.rotation.x = -Math.PI / 2;
    const glow = glowSprite(0xff6a1a, pr * 3.4, 0.3); glow.position.set(px, 0.7, pz); atmo.add(glow);
  }
  const fallTex = canvasTexture('mustafar-fall', 128, 512, PAINTERS.lavacrust('#ff8a2a'), { repeat: [1, 2] });
  const fallMat = wmat(0xffffff, { map: fallTex, emissive: 0xff4400, emissiveMap: fallTex, emissiveIntensity: 2.2, roughness: 0.6 });
  put(vista, new THREE.PlaneGeometry(3, 10), fallMat, -13.5, 4.6, -18.5, 'fx');
  U.push((dt) => { fallTex.offset.y -= dt * 0.55; });
  U.push((dt, t) => { riverMat.emissiveIntensity = 1.9 + Math.sin(t * 2.6) * 0.35; poolMat.emissiveIntensity = 2.1 + Math.sin(t * 2.6 + 1) * 0.35; });

  // ---- spires — instanced jagged black rock
  const rockTex = canvasTexture('mustafar-rock', 256, 256, PAINTERS.strata(['#241a12', '#1a1410', '#2c2016', '#14100c']), { repeat: [1, 2] });
  const rockMat = wmat(0xffffff, { map: rockTex, roughness: 1 });
  const spireItems = [];
  for (let i = 0; i < 17; i++) {
    const a = rr(rng, Math.PI * 0.9, Math.PI * 2.1);
    const rad = rr(rng, 10.5, 20);
    const h = rr(rng, 5, 11);
    spireItems.push({ p: [Math.sin(a) * rad, h / 2 - 0.8, -Math.abs(Math.cos(a)) * rad * 0.82 - 2], ry: rng() * 3, s: [rr(rng, 0.8, 1.5), h / 6, rr(rng, 0.8, 1.5)] });
  }
  mid.add(instanced(cone(1.9, 6, 7), rockMat, spireItems, 2));

  // ---- mining rig silhouette with a working lamp
  const rig = new THREE.Group(); rig.position.set(11, 0, -10.5); rig.rotation.y = -0.4; mid.add(rig);
  const rigMat = wmat(0x241c16, { roughness: 0.8, metalness: 0.4 });
  for (const [lx, lz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) put(rig, cyl(0.14, 0.18, 3.4, 6), rigMat, lx, 1.7, lz);
  put(rig, box(4.4, 0.35, 3.4), rigMat, 0, 3.5, 0);
  put(rig, box(4.6, 0.3, 0.4), rigMat, -1.2, 5.4, 0).rotation.z = 0.5;
  put(rig, cyl(0.03, 0.03, 2.2, 4), rigMat, -3.1, 4.6, 0);
  put(rig, box(0.5, 0.7, 0.5), rigMat, -3.1, 3.3, 0);
  const lamp = glowSprite(0xffc36a, 3.2, 0.55); lamp.position.set(0, 3.8, 0.6); rig.add(lamp);

  // ---- vista: smoke columns + horizon glow
  for (const [sx, sz] of [[-7, -22], [6, -24], [14, -20]]) {
    const smoke = mistBanks({ count: 3, color: 0x4a3428, opacity: 0.16, y: 5.5, z: sz, spread: 6, scale: [6, 5], speed: 0.1, seed: Math.abs(sx) * 10 + 3 });
    smoke.group.position.x = sx;
    vista.add(smoke.group); U.push(smoke.update);
  }
  const horizon = glowSprite(0xff5a1a, 34, 0.32); horizon.position.set(0, 3.5, -27); vista.add(horizon);

  // ---- foreground (duel): black rock outcrops at the frame's feet
  if (opts.foreground !== false) {
    const fore = layer(g, 'foreground');
    for (const s of [-1, 1]) {
      const r1 = put(fore, cone(1.5, 1.6, 6), rockMat, s * 6.6, 0.5, 4.4);
      r1.rotation.z = s * 0.25;
      put(fore, cone(0.9, 1, 6), rockMat, s * 5.7, 0.3, 4.9);
    }
  }

  // ---- atmosphere: rising embers + falling ash
  const embers = particleField({ count: 105, area: { x: 28, y: 9.5, z: [-2, -15] }, color: 0xffa030, size: 0.13, opacity: 0.9, mode: 'rise', speed: 1.15, seed: 55 });
  atmo.add(embers.points); U.push(embers.update);
  const ash = particleField({ count: 70, area: { x: 30, y: 10, z: [-2, -14] }, color: 0x9a8a7a, size: 0.09, opacity: 0.5, mode: 'fall', speed: 0.55, seed: 66 });
  atmo.add(ash.points); U.push(ash.update);

  ptLight(g, 0xff5a00, 100, 0, 1.6, -9);
  ptLight(g, 0xff2200, 45, -8, 5, -2);
  g.add(new THREE.AmbientLight(0x4a2410, 0.85));

  return {
    group: g, update: (dt, t) => U.run(dt, t),
    fog: { color: 0x200e08, near: 12, far: 38 }, bg: 0x160806,
    name: 'Mustafar', tag: 'The high ground is lava',
    franchise: 'Sci-Fi',
  };
}

// ------------------------------------------------------------------
// 2. JURASSIC GATE — stone gate, torches, layered jungle (Jurassic)
// ------------------------------------------------------------------
function jurassicGate(opts = {}) {
  const g = new THREE.Group();
  const U = updaters();
  const rng = mulberry32(303);
  const vista = layer(g, 'vista'), mid = layer(g, 'midground'), atmo = layer(g, 'atmos');

  // ---- jungle dirt + gravel path through the gate line
  const dirtTex = canvasTexture('jurassic-dirt', 512, 512, PAINTERS.dirt('#26331c', '#131c0c', '#54683a'), { repeat: [7, 5] });
  g.add(groundPlane(46, 28, wmat(0xffffff, { map: dirtTex, roughness: 1 }), 0, -3));
  const pathTex = canvasTexture('jurassic-path', 512, 128, PAINTERS.dirt('#4a4433', '#2c281a', '#7a7258'), { repeat: [6, 1] });
  fightBand(g, { mat: wmat(0xffffff, { map: pathTex, roughness: 1 }) });

  // ---- the gate: stone pillars, planked doors ajar, beam + sign
  const stoneTex = canvasTexture('jurassic-stone', 256, 256, PAINTERS.stone('#5c5c60', '#34343a', '#7a7a80'), { repeat: [1, 2] });
  const stoneMat = wmat(0xffffff, { map: stoneTex, roughness: 1 });
  const plankTex = canvasTexture('jurassic-planks', 256, 256, PAINTERS.planks('#5a4026', '#38260f', '#7a5a34'), { repeat: [2, 3] });
  const gateWood = wmat(0xffffff, { map: plankTex, roughness: 0.95 });
  const ironMat = wmat(0x2a2a30, { roughness: 0.5, metalness: 0.7 });
  for (const s of [-1, 1]) {
    put(mid, box(1.6, 10.5, 1.6), stoneMat, s * 5.6, 5.25, -13);
    put(mid, box(2, 0.7, 2), stoneMat, s * 5.6, 10.8, -13);
    const door = put(mid, box(3.6, 8.8, 0.45), gateWood, s * 2.95, 4.4, -13);
    door.rotation.y = s * -0.38;
    for (const by of [1.6, 4.4, 7.2]) put(door, box(3.65, 0.4, 0.08), ironMat, 0, by - 4.4, 0.27).position.z = 0.27;
  }
  put(mid, box(13.5, 1.2, 1), gateWood, 0, 10.1, -13);
  const signTex = canvasTexture('jurassic-sign', 1024, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    textPanel({ bg: 'rgba(0,0,0,0)', fg: '#e8c95a', lines: ['JURASSIC'], font: '900 84px Georgia, serif' })(ctx, w, h);
  });
  const signMat = wmat(0xffffff, { map: signTex, transparent: true, emissive: 0xa8842a, emissiveMap: signTex, emissiveIntensity: 0.55, roughness: 0.9 });
  put(mid, new THREE.PlaneGeometry(8.6, 1.05), signMat, 0, 10.1, -12.45, 'fx');

  // hanging vines off the beam, swaying
  const vineMat = wmat(0x2a5426, { roughness: 1 });
  for (const vx of [-3.4, -0.8, 2.2, 4.1]) {
    const vine = new THREE.Group(); vine.position.set(vx, 9.6, -12.7); mid.add(vine);
    const len = rr(rng, 1.4, 2.6);
    put(vine, cyl(0.03, 0.02, len, 5), vineMat, 0, -len / 2, 0);
    put(vine, box(0.5, 0.34, 0.04), vineMat, 0.1, -len, 0).rotation.z = 0.5;
    U.push(sway(vine, { amp: 0.05, speed: 0.9, phase: vx * 2 }));
  }

  // ---- flaming torches flanking the gate
  const flameMat = wmat(0xffa020, { emissive: 0xff7a00, emissiveIntensity: 3, roughness: 0.7 });
  const flames = [];
  for (const tx of [-7.2, 7.2]) {
    put(mid, cyl(0.1, 0.14, 3, 6), wmat(0x2a2018, { roughness: 1 }), tx, 1.5, -11.8);
    put(mid, cyl(0.3, 0.16, 0.5, 8), ironMat, tx, 3.15, -11.8);
    const f = put(mid, sph(0.26, 8, 6), flameMat, tx, 3.6, -11.8, 'fx');
    flames.push({ m: f, ph: tx });
    const glow = glowSprite(0xff8a20, 4.4, 0.4); glow.position.set(tx, 3.6, -11.4); mid.add(glow);
    ptLight(g, 0xff8a20, 34, tx, 3.4, -11, 15);
  }
  U.push((dt, t) => {
    flameMat.emissiveIntensity = 2.6 + Math.sin(t * 9) * 0.55;
    for (const f of flames) f.m.scale.y = 1 + Math.sin(t * 11 + f.ph) * 0.28;
  });

  // ---- broken paddock fence — side segments only, wire sagging
  const postMat = wmat(0x3f3a33, { roughness: 0.8, metalness: 0.3 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const px = s * (7.8 + i * 2.4);
      const post = put(mid, box(0.24, 3.1, 0.24), postMat, px, 1.55, -5.4);
      if (i === 2) post.rotation.z = s * 0.16;
    }
    const wire = put(mid, cyl(0.02, 0.02, 5.2, 4), postMat, s * 10.2, 2.75, -5.4);
    wire.rotation.z = Math.PI / 2;
  }

  // ---- jungle in three depth rows: instanced canopy + foliage walls
  const canopyItems = [];
  for (let i = 0; i < 30; i++) {
    const a = rr(rng, Math.PI * 0.92, Math.PI * 2.08);
    const rad = rr(rng, 11, 19);
    const h = rr(rng, 4, 8);
    let cx = Math.sin(a) * rad;
    const cz = -Math.abs(Math.cos(a)) * rad * 0.8 - 2.5;
    // keep a clear vista corridor in front of the gate (the hero piece)
    if (cz < -8.5 && Math.abs(cx) < 9.5) cx = (cx < 0 ? -1 : 1) * rr(rng, 9.5, 12);
    canopyItems.push({ p: [cx, h / 2 + 0.8, cz], ry: rng() * 3, s: [rr(rng, 0.9, 1.6), h / 5, rr(rng, 0.9, 1.6)] });
  }
  const leafMat = wmat(0x1d3d17, { roughness: 1 });
  mid.add(instanced(cone(1.9, 5, 7), leafMat, canopyItems, 2));
  const folTex = canvasTexture('jurassic-foliage', 512, 256, PAINTERS.foliage(), { repeat: [4, 1.5] });
  const folMat = wmat(0xffffff, { map: folTex, roughness: 1 });
  const wall1 = put(vista, box(46, 7, 0.6), folMat, 0, 3, -17.5); void wall1;
  const wall2 = put(vista, box(52, 9, 0.6), folMat, -3, 3.8, -21.5); void wall2;
  for (const [fx, fz] of [[-10.2, -6.8], [10.4, -7.4]]) {
    put(mid, box(3, 2.6, 2.4), folMat, fx, 1.3, fz);
  }
  vistaSilhouette(vista, 'jurassic-rim', '#0a1408', 80, 11, 0, 4.4, -25, 31);

  // ---- foreground (duel): fern silhouettes at the frame's feet
  if (opts.foreground !== false) {
    const fore = layer(g, 'foreground');
    const fernMat = wmat(0x12260e, { roughness: 1, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const frond = put(fore, cone(0.85, 1.9, 5), fernMat, s * (6 + i * 0.55), 0.7, 4.3 + (i % 2) * 0.4);
        frond.rotation.z = s * (0.35 + i * 0.14);
      }
    }
  }

  // ---- atmosphere: fireflies + ground mist at the jungle edge
  const flies = particleField({ count: 42, area: { x: 26, y: 3.6, z: [-2, -11] }, color: 0xd8ff70, size: 0.1, opacity: 0.9, mode: 'float', seed: 77 });
  atmo.add(flies.points); U.push(flies.update);
  const mist = mistBanks({ count: 4, color: 0x9ab88a, opacity: 0.07, y: 0.5, z: -9, spread: 26, scale: [8, 1.8], speed: 0.12, seed: 83 });
  atmo.add(mist.group); U.push(mist.update);

  g.add(new THREE.AmbientLight(0x2a3a2a, 0.95));

  return {
    group: g, update: (dt, t) => U.run(dt, t),
    fog: { color: 0x141c12, near: 14, far: 42 }, bg: 0x0c120c,
    name: 'Jurassic Gate', tag: 'Life finds a way',
    franchise: 'Jurassic',
  };
}

// ------------------------------------------------------------------
// 3. FIREHOUSE ROOF — brick parapet, water tower, city vista (Ghostbusters)
// ------------------------------------------------------------------
function firehouseRoof(opts = {}) {
  const g = new THREE.Group();
  const U = updaters();
  const rng = mulberry32(404);
  const vista = layer(g, 'vista'), mid = layer(g, 'midground'), atmo = layer(g, 'atmos');

  // ---- rooftop slab (tar + gravel) + painted fight band
  const tarTex = canvasTexture('roof-tar', 512, 512, PAINTERS.tarpaper(), { repeat: [5, 3] });
  const slab = put(g, box(27, 0.6, 17), wmat(0xffffff, { map: tarTex, roughness: 0.95 }), 0, -0.3, -2, 'ground');
  void slab;
  const bandTex = canvasTexture('roof-band', 512, 128, PAINTERS.tarpaper('#3d3e45', '#2b2c31', '#585963'), { repeat: [6, 1] });
  fightBand(g, { w: 20, mat: wmat(0xffffff, { map: bandTex, roughness: 0.95 }), trimMat: wmat(0x8a8f7a, { roughness: 0.9 }) });

  // ---- brick parapet (back + sides; arena3d adds the front for brawl)
  const brickTex = canvasTexture('roof-brick', 512, 256, PAINTERS.brick(), { repeat: [8, 1] });
  const parMat = wmat(0xffffff, { map: brickTex, roughness: 0.92 });
  put(mid, box(27, 1.15, 0.5), parMat, 0, 0.57, -9.7);
  put(mid, box(0.5, 1.15, 17), parMat, -13.25, 0.57, -2);
  put(mid, box(0.5, 1.15, 17), parMat, 13.25, 0.57, -2);
  put(mid, box(27, 0.22, 0.7), wmat(0x4a4a50, { roughness: 0.9 }), 0, 1.22, -9.7); // coping stones

  // ---- water tower, banded and planked
  const tower = new THREE.Group(); tower.position.set(-8.5, 0, -7); mid.add(tower);
  const plankTex = canvasTexture('tower-planks', 256, 256, PAINTERS.planks('#503722', '#33220f', '#6e4e2c'), { repeat: [3, 1] });
  const towerWood = wmat(0xffffff, { map: plankTex, roughness: 1 });
  put(tower, cyl(1.65, 1.75, 2.7, 12), towerWood, 0, 5.5, 0);
  put(tower, cone(1.95, 1.25, 12), wmat(0x33302c, { roughness: 1 }), 0, 7.45, 0);
  const bandMat = wmat(0x2c2c30, { roughness: 0.5, metalness: 0.6 });
  put(tower, cyl(1.78, 1.78, 0.14, 12), bandMat, 0, 6.4, 0);
  put(tower, cyl(1.8, 1.8, 0.14, 12), bandMat, 0, 4.6, 0);
  for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    put(tower, box(0.22, 4.3, 0.22), towerWood, lx, 2.15, lz);
  }
  const tShadow = shadowPool(2.6, 0.4); tShadow.position.set(-8.5, 0.015, -7); g.add(tShadow);

  // ---- vents, pipes, containment unit
  const ventTex = canvasTexture('roof-vent', 256, 256, PAINTERS.deck('#4c5058', '#33363d', '#646873'), { repeat: [1, 1] });
  const ventMat = wmat(0xffffff, { map: ventTex, roughness: 0.65, metalness: 0.4 });
  put(mid, box(1.3, 1.5, 1.3), ventMat, 7.5, 0.75, -6);
  put(mid, box(2.3, 1.05, 1.5), ventMat, 9.5, 0.52, -3.2);
  put(mid, cyl(0.32, 0.32, 1.9, 8), ventMat, 6.2, 0.95, -7.6);
  const contMat = wmat(0x0d2a12, { emissive: 0x22ff66, emissiveIntensity: 1.5, roughness: 0.6 });
  put(mid, box(1.7, 1.05, 1.05), contMat, -4.5, 0.52, -8.3);
  const contGlow = glowSprite(0x22ff66, 3.4, 0.3); contGlow.position.set(-4.5, 0.8, -7.6); mid.add(contGlow);
  U.push((dt, t) => { contMat.emissiveIntensity = 1.3 + Math.sin(t * 2.2) * 0.3; });

  // steam curling off the vent stack
  const steam = particleField({ count: 22, area: { x: 1.4, y: 3.4, z: [-0.4, 0.4] }, color: 0xcfd6dd, size: 0.16, opacity: 0.34, mode: 'rise', speed: 0.8, seed: 91 });
  steam.points.position.set(6.2, 1.8, -7.6);
  atmo.add(steam.points); U.push(steam.update);

  // ---- city vista: window-grid towers (texture does the windows) +
  //      a nearer rooftop row with its own towers and antennas
  const winA = windowsTexture('city-win-a', { cols: 7, rows: 13, lit: 0.4 });
  const winB = windowsTexture('city-win-b', { cols: 9, rows: 16, lit: 0.5, warm: '#ffe2a8' });
  const cityMats = [winA, winB].map((tx) => wmat(0xffffff, { map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.8, roughness: 1 }));
  for (let i = 0; i < 11; i++) {
    const w = rr(rng, 2.6, 5.2), h = rr(rng, 5, 13);
    const bx = rr(rng, -29, 29), bz = rr(rng, -30, -21);
    put(vista, box(w, h, w), cityMats[i % 2], bx, h / 2 - 1.5, bz, 'fx');
  }
  const nearMat = wmat(0x14161e, { roughness: 1 });
  for (const [nx, nz, nw] of [[-12, -13.5, 5], [-4, -14.5, 6], [5, -13.8, 5.5], [12.5, -14.2, 5]]) {
    put(vista, box(nw, 1.2, 4), nearMat, nx, -0.6, nz, 'fx');
    put(vista, cyl(0.5, 0.55, 1.1, 8), nearMat, nx - nw / 4, 0.55, nz, 'fx');
    const ant = put(vista, cyl(0.03, 0.03, 2.6, 4), nearMat, nx + nw / 4, 1.3, nz, 'fx');
    void ant;
  }
  const haze = glowSprite(0x5a6f9a, 40, 0.16); haze.position.set(0, 6, -26); vista.add(haze);

  // ---- string lights across the roof (warm bulbs, shared material)
  const bulbMat = wmat(0xffe0a0, { emissive: 0xffb84d, emissiveIntensity: 2.6, roughness: 0.6 });
  const bulbGeo = sph(0.09, 6, 5);
  for (let i = 0; i <= 16; i++) {
    const x = -8 + i;
    const y = 4.7 - Math.sin((i / 16) * Math.PI) * 1.1;
    put(mid, bulbGeo, bulbMat, x, y, -5, 'fx');
  }
  for (const px of [-8.2, 8.2]) put(mid, cyl(0.05, 0.05, 4.7, 5), bandMat, px, 2.35, -5);
  U.push((dt, t) => { bulbMat.emissiveIntensity = 2.4 + Math.sin(t * 5) * 0.35; });
  const stringGlow = glowSprite(0xffb84d, 9, 0.16); stringGlow.position.set(0, 3.9, -4.6); mid.add(stringGlow);

  // ---- foreground (duel): antenna mast + a low duct at the frame's feet
  if (opts.foreground !== false) {
    const fore = layer(g, 'foreground');
    const mastMat = wmat(0x1c1e24, { roughness: 0.8, metalness: 0.4 });
    put(fore, cyl(0.06, 0.08, 6.6, 6), mastMat, 7.9, 3.3, 4.4);
    put(fore, box(1.7, 0.08, 0.08), mastMat, 7.9, 5.6, 4.4);
    put(fore, box(1.1, 0.08, 0.08), mastMat, 7.9, 4.7, 4.4);
    put(fore, box(2.3, 0.95, 1.3), ventMat, -6.4, 0.47, 4.3);
  }

  ptLight(g, 0xffb84d, 40, 0, 4.4, -5);
  ptLight(g, 0x6688ff, 30, 8, 6, -12);
  g.add(new THREE.AmbientLight(0x2a3048, 0.9));

  return {
    group: g, update: (dt, t) => U.run(dt, t),
    fog: { color: 0x0c1018, near: 16, far: 46 }, bg: 0x080b12,
    name: 'Firehouse Roof', tag: 'Who ya gonna call?',
    franchise: 'Ghostbusters',
  };
}

// ------------------------------------------------------------------
// 4. SUNSET CANYON — stratified mesas, saguaros, golden hour (Toons)
// ------------------------------------------------------------------
function sunsetCanyon(opts = {}) {
  const g = new THREE.Group();
  const U = updaters();
  const rng = mulberry32(505);
  const vista = layer(g, 'vista'), mid = layer(g, 'midground'), atmo = layer(g, 'atmos');

  // ---- sand floor + packed band + scattered stone
  const sandTex = canvasTexture('canyon-sand', 512, 512, PAINTERS.sand(), { repeat: [7, 5] });
  g.add(groundPlane(48, 28, wmat(0xffffff, { map: sandTex, roughness: 1 }), 0, -3));
  const packTex = canvasTexture('canyon-pack', 512, 128, PAINTERS.sand('#d89a58', '#b57a3e', '#f0c088'), { repeat: [6, 1] });
  fightBand(g, { mat: wmat(0xffffff, { map: packTex, roughness: 1 }) });
  const pebbleItems = [];
  for (let i = 0; i < 26; i++) {
    const a = rr(rng, 0, Math.PI * 2), rad = rr(rng, 9.2, 15);
    pebbleItems.push({ p: [Math.sin(a) * rad, 0.09, Math.cos(a) * rad * 0.7 - 3], ry: rng() * 3, s: rr(rng, 0.5, 1.1) });
  }
  const pebbles = instanced(sph(0.22, 7, 6), wmat(0x9a6a42, { roughness: 1 }), pebbleItems, 0.3);
  pebbles.userData.kind = 'flat'; // floor litter, ≤ 0.4 high — walked over, never a wall
  mid.add(pebbles);

  // ---- mesas — instanced strata towers + two hero buttes
  const strataTex = canvasTexture('canyon-strata', 256, 256, PAINTERS.strata(), { repeat: [2, 1] });
  const mesaMat = wmat(0xffffff, { map: strataTex, roughness: 1 });
  const mesaItems = [];
  for (let i = 0; i < 13; i++) {
    const a = rr(rng, Math.PI * 0.9, Math.PI * 2.1);
    const rad = rr(rng, 13.5, 23);
    const w = rr(rng, 4, 8), h = rr(rng, 5.5, 10.5);
    mesaItems.push({ p: [Math.sin(a) * rad, h / 2 - 0.4, -Math.abs(Math.cos(a)) * rad * 0.85 - 2.5], ry: rr(rng, -0.3, 0.3), s: [w / 4, h / 4, (w * 0.8) / 4] });
  }
  mid.add(instanced(box(4, 4, 3.2), mesaMat, mesaItems, 4.6));
  for (const [bx, bz, bw, bh] of [[-12.5, -10, 6.5, 8], [13, -11, 7.5, 9.5]]) {
    put(mid, box(bw, bh, bw * 0.8), mesaMat, bx, bh / 2 - 0.3, bz);
    put(mid, box(bw * 1.14, bh * 0.13, bw * 0.92), wmat(0xa85c34, { roughness: 1 }), bx, bh + bh * 0.05 - 0.3, bz);
    const sh = shadowPool(bw * 0.62, 0.32); sh.position.set(bx, 0.015, bz + 1); g.add(sh);
  }

  // ---- the big low sun + halo
  put(vista, sph(3.6, 20, 16), wmat(0xffd27a, { emissive: 0xffb84d, emissiveIntensity: 2.2, roughness: 1 }), 9, 4.4, -27, 'fx');
  const sunHalo = glowSprite(0xffb060, 26, 0.5); sunHalo.position.set(9, 4.4, -26.2); vista.add(sunHalo);
  vistaSilhouette(vista, 'canyon-rim', '#7a3d1e', 90, 8, 0, 3, -24.5, 47);

  // ---- saguaros with arms
  const cactusMat = wmat(0x2a6a2a, { roughness: 1 });
  for (const [cx, cz] of [[-9.2, -3.6], [8.6, -6.8], [-4.4, -9.6], [12.2, -4.2], [-12.8, -7.5]]) {
    const c = new THREE.Group(); c.position.set(cx, 0, cz); c.rotation.y = rng() * 3; mid.add(c);
    put(c, cyl(0.22, 0.27, 3.5, 8), cactusMat, 0, 1.75, 0);
    put(c, sph(0.24, 8, 6), cactusMat, 0, 3.55, 0);
    const armL = put(c, cyl(0.15, 0.17, 1.5, 7), cactusMat, 0.52, 2.3, 0); armL.rotation.z = -0.45;
    const armR = put(c, cyl(0.15, 0.17, 1.25, 7), cactusMat, -0.5, 2.65, 0); armR.rotation.z = 0.45;
    put(c, cyl(0.13, 0.14, 0.8, 7), cactusMat, 0.86, 2.85, 0);
    put(c, cyl(0.13, 0.14, 0.7, 7), cactusMat, -0.82, 3.1, 0);
  }

  // ---- tumbleweed on the wind + drifting dust
  const tumble = put(atmo, new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.MeshBasicMaterial({ color: 0xa87f4e, wireframe: true, transparent: true, opacity: 0.75 }), -11, 0.5, -3.6, 'fx');
  U.push((dt, t) => {
    tumble.position.x += dt * 1.15;
    tumble.rotation.z -= dt * 2.3;
    tumble.rotation.x += dt * 0.7;
    tumble.position.y = 0.5 + Math.abs(Math.sin(t * 2.4)) * 0.45;
    if (tumble.position.x > 15) tumble.position.x = -15;
  });
  const dust = particleField({ count: 55, area: { x: 30, y: 3.2, z: [-1, -10] }, color: 0xe8b878, size: 0.08, opacity: 0.4, mode: 'drift', speed: 0.9, seed: 97 });
  atmo.add(dust.points); U.push(dust.update);

  // ---- foreground (duel): dead tree silhouette + sun-bleached rocks
  if (opts.foreground !== false) {
    const fore = layer(g, 'foreground');
    const deadMat = wmat(0x3a2415, { roughness: 1 });
    const tree = new THREE.Group(); tree.position.set(-7.4, 0, 4.5); tree.rotation.z = 0.14; fore.add(tree);
    put(tree, cyl(0.13, 0.22, 4.4, 6), deadMat, 0, 2.2, 0);
    put(tree, cyl(0.05, 0.09, 2, 5), deadMat, 0.8, 4.6, 0).rotation.z = -0.7;
    put(tree, cyl(0.04, 0.07, 1.5, 5), deadMat, -0.65, 4.9, 0).rotation.z = 0.8;
    put(fore, box(1.9, 0.85, 1.2), wmat(0xffffff, { map: strataTex, roughness: 1 }), 6.6, 0.32, 4.4).rotation.y = 0.5;
  }

  ptLight(g, 0xff9a4d, 75, 9, 5, -18);
  ptLight(g, 0xffd27a, 35, -6, 6, -6);
  g.add(new THREE.AmbientLight(0x6a4a30, 0.95));

  return {
    group: g, update: (dt, t) => U.run(dt, t),
    fog: { color: 0xd88a4a, near: 18, far: 48 }, bg: 0xc9763a,
    name: 'Sunset Canyon', tag: 'Meep meep',
    franchise: 'Toons',
  };
}

// ------------------------------------------------------------------
// 5. MANHATTAN ROOFTOP — dense night skyline, billboard, steam (Marvel)
// ------------------------------------------------------------------
function manhattanRooftop(opts = {}) {
  const g = new THREE.Group();
  const U = updaters();
  const rng = mulberry32(606);
  const vista = layer(g, 'vista'), mid = layer(g, 'midground'), atmo = layer(g, 'atmos');

  // ---- roof slab + band
  const tarTex = canvasTexture('roof-tar', 512, 512, PAINTERS.tarpaper(), { repeat: [5, 3] });
  put(g, box(27, 0.6, 17), wmat(0xffffff, { map: tarTex, roughness: 0.95 }), 0, -0.3, -2, 'ground');
  const bandTex = canvasTexture('roof-band', 512, 128, PAINTERS.tarpaper('#3d3e45', '#2b2c31', '#585963'), { repeat: [6, 1] });
  fightBand(g, { w: 20, mat: wmat(0xffffff, { map: bandTex, roughness: 0.95 }), trimMat: wmat(0x7a8296, { roughness: 0.9 }) });
  const edgeMat = wmat(0x1c1c22, { roughness: 0.9 });
  put(mid, box(27, 1.05, 0.45), edgeMat, 0, 0.52, -9.7);
  put(mid, box(0.45, 1.05, 17), edgeMat, -13.25, 0.52, -2);
  put(mid, box(0.45, 1.05, 17), edgeMat, 13.25, 0.52, -2);

  // ---- skyline: window-grid towers + the spire with its beacon
  const winA = windowsTexture('city-win-a', { cols: 7, rows: 13, lit: 0.4 });
  const winB = windowsTexture('city-win-b', { cols: 9, rows: 16, lit: 0.5, warm: '#ffe2a8' });
  const winC = windowsTexture('city-win-c', { cols: 6, rows: 11, lit: 0.34, cool: '#a8d4ff' });
  const cityMats = [winA, winB, winC].map((tx) => wmat(0xffffff, { map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.85, roughness: 1 }));
  for (let i = 0; i < 14; i++) {
    const w = rr(rng, 2.6, 5.4), h = rr(rng, 6, 17);
    put(vista, box(w, h, w), cityMats[i % 3], rr(rng, -31, 31), h / 2 - 1.5, rr(rng, -31, -21), 'fx');
  }
  put(vista, box(3.2, 23, 3.2), cityMats[1], -14, 10, -27, 'fx');
  const beaconMat = wmat(0xff3030, { emissive: 0xff2020, emissiveIntensity: 3 });
  put(vista, sph(0.26, 8, 6), beaconMat, -14, 21.9, -27, 'fx');
  U.push((dt, t) => { beaconMat.emissiveIntensity = (Math.sin(t * 4) > 0) ? 3 : 0.2; });
  vista.add(starPoints({ count: 130, seed: 61, color: 0xffffff, size: 0.07 }));

  // ---- billboard with a lit in-world ad face
  const adTex = canvasTexture('roof-ad', 512, 256, (ctx, w, h) => {
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#1a2450'); grd.addColorStop(1, '#3a1050');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, w - 20, h - 20);
    textPanel({ bg: 'rgba(0,0,0,0)', fg: '#ffe9a8', lines: ['KOMBAT', 'ARENA'], font: '900 70px system-ui, sans-serif' })(ctx, w, h);
  });
  const adMat = wmat(0xffffff, { map: adTex, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: 0.75, roughness: 0.85 });
  put(mid, box(5.2, 2.7, 0.22), adMat, 2, 4.6, -9.3);
  const frameMat = wmat(0x33363d, { roughness: 0.6, metalness: 0.5 });
  for (const px of [-0.2, 4.2]) put(mid, box(0.22, 3.4, 0.22), frameMat, px, 1.7, -9.3);
  const adGlow = glowSprite(0x6688ff, 8, 0.16); adGlow.position.set(2, 4.6, -8.4); mid.add(adGlow);
  U.push((dt, t) => { adMat.emissiveIntensity = 0.7 + Math.sin(t * 1.3) * 0.08; });

  // ---- rooftop props + steam
  const propTex = canvasTexture('roof-vent', 256, 256, PAINTERS.deck('#4c5058', '#33363d', '#646873'), { repeat: [1, 1] });
  const propMat = wmat(0xffffff, { map: propTex, roughness: 0.65, metalness: 0.4 });
  put(mid, box(1.5, 1.25, 1.5), propMat, 7.2, 0.62, -6.2);
  put(mid, box(2.5, 0.95, 1.3), propMat, -7.8, 0.47, -5.4);
  put(mid, cyl(0.3, 0.3, 1.7, 8), propMat, 5.6, 0.85, -8);
  for (const [sx, sz] of [[5.6, -8], [7.2, -6.2]]) {
    const steam = particleField({ count: 18, area: { x: 1.2, y: 3, z: [-0.4, 0.4] }, color: 0xd6dde6, size: 0.15, opacity: 0.3, mode: 'rise', speed: 0.75, seed: Math.floor(sx * 13) });
    steam.points.position.set(sx, 1.6, sz);
    atmo.add(steam.points); U.push(steam.update);
  }

  // ---- foreground (duel): stair bulkhead + antenna with a dish
  if (opts.foreground !== false) {
    const fore = layer(g, 'foreground');
    put(fore, box(2.5, 1.95, 1.9), wmat(0x2e2e36, { roughness: 0.9 }), 6.9, 0.97, 4);
    put(fore, box(2.7, 0.18, 2.1), edgeMat, 6.9, 2.03, 4);
    const mastMat = wmat(0x1c1e24, { roughness: 0.8, metalness: 0.4 });
    put(fore, cyl(0.06, 0.08, 6.2, 6), mastMat, -8.1, 3.1, 4.4);
    const dish = put(fore, sph(0.85, 12, 8), mastMat, -8.1, 5.6, 4.4);
    dish.scale.z = 0.35; dish.rotation.x = -0.7;
  }

  ptLight(g, 0x9ac8ff, 45, 0, 8, -13);
  ptLight(g, 0xffc860, 25, 6, 4, -4);
  g.add(new THREE.AmbientLight(0x2a3450, 0.9));

  return {
    group: g, update: (dt, t) => U.run(dt, t),
    fog: { color: 0x0a0e18, near: 18, far: 50 }, bg: 0x060910,
    name: 'Manhattan Rooftop', tag: 'The city that never sleeps',
    franchise: 'Marvel',
  };
}

// ------------------------------------------------------------------
// 6. MIDGAR — mako reactors, pipe bridges, neon sprawl (Final Fantasy)
// ------------------------------------------------------------------
function midgar(opts = {}) {
  const g = new THREE.Group();
  const U = updaters();
  const rng = mulberry32(707);
  const vista = layer(g, 'vista'), mid = layer(g, 'midground'), atmo = layer(g, 'atmos');

  // ---- deck-plate ground + hazard-trimmed band + mako leak pools
  const deckTex = canvasTexture('midgar-deck', 512, 512, PAINTERS.deck('#2e3138', '#1d1f24', '#464a54'), { repeat: [7, 5] });
  g.add(groundPlane(42, 26, wmat(0xffffff, { map: deckTex, roughness: 0.65, metalness: 0.3 }), 0, -3));
  const bandTex = canvasTexture('midgar-band', 512, 128, PAINTERS.deck('#34373f', '#232529', '#4c505a'), { repeat: [6, 1] });
  const hazTex = canvasTexture('midgar-hazard', 256, 32, PAINTERS.hazard('#b8932a', '#17181c'), { repeat: [8, 1] });
  fightBand(g, { mat: wmat(0xffffff, { map: bandTex, roughness: 0.6, metalness: 0.3 }), trimMat: wmat(0xffffff, { map: hazTex, roughness: 0.85 }) });
  const leakMat = wmat(0x0d3a1a, { emissive: 0x22ff88, emissiveIntensity: 1.6, roughness: 0.4 });
  for (const [lx, lz, lr] of [[-9.8, -4.4, 1.3], [10.4, -5.6, 1.6]]) {
    const leak = put(g, new THREE.CircleGeometry(lr, 16), leakMat, lx, 0.025, lz, 'flat');
    leak.rotation.x = -Math.PI / 2;
  }

  // ---- mako reactors — paneled towers, glowing rings, vent glows
  const panelTex = canvasTexture('midgar-panels', 256, 256, PAINTERS.panels('#3a3e48', '#26282f', '#54585f'), { repeat: [3, 2] });
  const towerMat = wmat(0xffffff, { map: panelTex, roughness: 0.55, metalness: 0.5 });
  const makoMat = wmat(0x0d3a1a, { emissive: 0x22ff88, emissiveIntensity: 2.4, roughness: 0.5 });
  for (const [rx, rz, rh] of [[-10.5, -14.5, 11], [0, -18.5, 13.5], [10.5, -14.5, 11]]) {
    put(mid, cyl(2.3, 2.7, rh, 14), towerMat, rx, rh / 2, rz);
    put(mid, cyl(2.5, 2.5, 0.55, 14), makoMat, rx, rh * 0.72, rz);
    put(mid, cyl(1.1, 1.5, 1.6, 10), towerMat, rx, rh + 0.8, rz);
    const vent = glowSprite(0x2bff8a, 5.5, 0.35); vent.position.set(rx, rh * 0.72, rz + 1.6); mid.add(vent);
    const sh = shadowPool(3.4, 0.4); sh.position.set(rx, 0.015, rz + 1.4); g.add(sh);
  }
  ptLight(g, 0x22ff88, 42, -10.5, 8.5, -12, 19);
  ptLight(g, 0x22ff88, 42, 10.5, 8.5, -12, 19);
  U.push((dt, t) => { makoMat.emissiveIntensity = 2.1 + Math.sin(t * 3.1) * 0.5; leakMat.emissiveIntensity = 1.4 + Math.sin(t * 2.3 + 2) * 0.35; });

  // ---- overhead pipe bridge + a floor-level side run
  const pipeMat = wmat(0x43464e, { roughness: 0.45, metalness: 0.6 });
  const bridge = put(mid, cyl(0.55, 0.55, 15.5, 10), pipeMat, 0, 5.7, -7.6);
  bridge.rotation.z = Math.PI / 2;
  const bridge2 = put(mid, cyl(0.34, 0.34, 15.5, 8), pipeMat, 0, 6.55, -7.6);
  bridge2.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    put(mid, box(0.5, 5.7, 0.5), pipeMat, s * 7.6, 2.85, -7.6);
    put(mid, cyl(0.62, 0.62, 0.5, 10), pipeMat, s * 3.8, 5.7, -7.6).rotation.x = Math.PI / 2;
  }
  const sideRun = put(mid, cyl(0.42, 0.42, 17, 8), pipeMat, 0, 0.42, -9.9);
  sideRun.rotation.z = Math.PI / 2;

  // ---- neon signage — lit panels with painted glyphs
  const neonDefs = [
    { key: 'neon-mako', lines: ['MAKO'], fg: '#5affa8', x: -6.6, y: 3.7, z: -9.8, ry: 0.15 },
    { key: 'neon-sector', lines: ['SECTOR 7'], fg: '#ff5ae0', x: 6.2, y: 4.5, z: -10.6, ry: -0.18 },
    { key: 'neon-bar', lines: ['— ✦ —'], fg: '#4ae0ff', x: 0.4, y: 5.4, z: -11.4, ry: 0 },
  ];
  const neonMats = [];
  for (const nd of neonDefs) {
    const tex = canvasTexture(nd.key, 512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = nd.fg; ctx.lineWidth = 5; ctx.strokeRect(7, 7, w - 14, h - 14);
      textPanel({ bg: 'rgba(0,0,0,0)', fg: nd.fg, lines: nd.lines, font: '900 64px system-ui, sans-serif' })(ctx, w, h);
    });
    const m = wmat(0xffffff, { map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.7 });
    neonMats.push(m);
    const panel = put(mid, new THREE.PlaneGeometry(4.6, 1.15), m, nd.x, nd.y, nd.z, 'fx');
    panel.rotation.y = nd.ry;
  }
  U.push((dt, t) => { neonMats.forEach((m, i) => { m.emissiveIntensity = 1.5 + Math.sin(t * 2.2 + i * 2.1) * 0.18; }); });

  // ---- vista: plate-city silhouettes + smog glow
  vistaSilhouette(vista, 'midgar-rim', '#0a1210', 84, 13, 0, 5, -26, 53);
  const winD = windowsTexture('city-win-d', { cols: 8, rows: 12, lit: 0.3, cool: '#8affc8' });
  const farMat = wmat(0xffffff, { map: winD, emissive: 0xffffff, emissiveMap: winD, emissiveIntensity: 0.6, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const w = rr(rng, 3.4, 6), h = rr(rng, 7, 13);
    put(vista, box(w, h, w), farMat, rr(rng, -26, 26), h / 2 - 1, rr(rng, -25, -21), 'fx');
  }
  const smog = glowSprite(0x2bff8a, 36, 0.1); smog.position.set(0, 8, -24); vista.add(smog);

  // ---- foreground (duel): gantry girders framing the shot
  if (opts.foreground !== false) {
    const fore = layer(g, 'foreground');
    const girderMat = wmat(0x22242a, { roughness: 0.6, metalness: 0.5 });
    for (const s of [-1, 1]) put(fore, box(0.55, 6.4, 0.55), girderMat, s * 7.8, 3.2, 4.3);
    put(fore, box(16.2, 0.55, 0.55), girderMat, 0, 6.55, 4.3);
    const cable = put(fore, cyl(0.03, 0.03, 3.4, 4), girderMat, -5.2, 5.2, 4.3);
    cable.rotation.z = 0.5;
  }

  // ---- atmosphere: mako motes + low smog banks
  const motes = particleField({ count: 60, area: { x: 30, y: 10, z: [-3, -14] }, color: 0x44ff99, size: 0.12, opacity: 0.8, mode: 'float', seed: 113 });
  atmo.add(motes.points); U.push(motes.update);
  const smogBanks = mistBanks({ count: 4, color: 0x3f5a4a, opacity: 0.08, y: 1.1, z: -7, spread: 28, scale: [10, 3], speed: 0.1, seed: 127 });
  atmo.add(smogBanks.group); U.push(smogBanks.update);

  ptLight(g, 0xff2fd6, 30, -6, 4.5, -6);
  ptLight(g, 0x22d3ee, 30, 6, 4.5, -8);
  g.add(new THREE.AmbientLight(0x2a3444, 0.85));

  return {
    group: g, update: (dt, t) => U.run(dt, t),
    fog: { color: 0x101418, near: 14, far: 42 }, bg: 0x0a0d12,
    name: 'Midgar', tag: 'Mako flows beneath',
    franchise: 'Final Fantasy',
  };
}

// ------------------------------------------------------------------
// 7. HANGAR 51 — containment hangar: ribs, tubes, crane (Monsters vs Aliens)
// ------------------------------------------------------------------
function hangar51(opts = {}) {
  const g = new THREE.Group();
  const U = updaters();
  const vista = layer(g, 'vista'), mid = layer(g, 'midground'), atmo = layer(g, 'atmos');

  // ---- concrete deck + painted ring + hazard-trimmed band
  const deckTex = canvasTexture('hangar-deck', 512, 512, PAINTERS.deck('#33363d', '#232529', '#4c505a'), { repeat: [6, 4] });
  g.add(groundPlane(38, 24, wmat(0xffffff, { map: deckTex, roughness: 0.55, metalness: 0.35 }), 0, -3));
  const bandTex = canvasTexture('hangar-band', 512, 128, PAINTERS.deck('#3a3d44', '#282a30', '#565a64'), { repeat: [6, 1] });
  const hazTex = canvasTexture('hangar-hazard', 256, 32, PAINTERS.hazard(), { repeat: [8, 1] });
  fightBand(g, { mat: wmat(0xffffff, { map: bandTex, roughness: 0.55, metalness: 0.35 }), trimMat: wmat(0xffffff, { map: hazTex, roughness: 0.85 }) });
  const ring = put(g, new THREE.RingGeometry(6.7, 6.95, 56), new THREE.MeshBasicMaterial({ color: 0xd8a020, transparent: true, opacity: 0.28, depthWrite: false }), 0, 0.016, 0, 'flat');
  ring.rotation.x = -Math.PI / 2;
  U.push((dt, t) => { ring.material.opacity = 0.22 + Math.sin(t * 1.8) * 0.07; });

  // ---- ribbed back wall + receding arch ribs
  const wallTex = canvasTexture('hangar-wall', 512, 256, PAINTERS.panels(), { repeat: [4, 1] });
  const wallMat = wmat(0xffffff, { map: wallTex, roughness: 0.7, metalness: 0.3 });
  put(mid, box(38, 10, 0.6), wallMat, 0, 5, -16.5);
  const ribMat = wmat(0x2c2e36, { roughness: 0.65, metalness: 0.35 });
  for (const rz of [-4.5, -8.5, -12.5]) {
    put(mid, box(0.65, 8.6, 0.65), ribMat, -10.2, 4.3, rz);
    put(mid, box(0.65, 8.6, 0.65), ribMat, 10.2, 4.3, rz);
    put(mid, box(21.1, 0.65, 0.65), ribMat, 0, 8.75, rz);
  }
  // wall light strips
  const stripMat = wmat(0xbfe0ff, { emissive: 0x9ac8ff, emissiveIntensity: 1.8, roughness: 0.6 });
  put(mid, box(30, 0.14, 0.1), stripMat, 0, 6.9, -16.1, 'fx');

  // ---- containment tubes — glass, glowing cores, rising bubbles
  const glassMat = wmat(0x88ccff, { transparent: true, opacity: 0.16, roughness: 0.12, metalness: 0.2 });
  const gooMat = wmat(0x44ff88, { emissive: 0x22dd66, emissiveIntensity: 1.25, transparent: true, opacity: 0.78, roughness: 0.4 });
  const capMat = wmat(0x3a3e46, { roughness: 0.6, metalness: 0.4 });
  const tubes = [];
  for (const [tx, tz] of [[-8, -11.5], [-2.8, -12.5], [2.8, -12.5], [8, -11.5]]) {
    put(mid, cyl(1.15, 1.15, 4.8, 14), glassMat, tx, 2.4, tz, 'fx');
    const goo = put(mid, cyl(0.88, 0.88, 2.5, 12), gooMat, tx, 1.55, tz, 'fx');
    tubes.push({ m: goo, ph: tx * 1.3 });
    put(mid, cyl(1.3, 1.3, 0.38, 14), capMat, tx, 4.95, tz);
    put(mid, cyl(1.3, 1.3, 0.38, 14), capMat, tx, 0.19, tz);
    const glow = glowSprite(0x2bff8a, 3.6, 0.22); glow.position.set(tx, 1.8, tz + 0.8); mid.add(glow);
  }
  U.push((dt, t) => {
    for (const tb of tubes) {
      tb.m.position.y = 1.55 + Math.sin(t * 1.6 + tb.ph) * 0.3;
      tb.m.rotation.y += dt * 0.6;
    }
  });
  const bubbles = particleField({ count: 30, area: { x: 17, y: 3.6, z: [-12.4, -11.4] }, color: 0x9affc8, size: 0.055, opacity: 0.55, mode: 'rise', speed: 0.5, seed: 131 });
  bubbles.points.position.y = 0.4;
  atmo.add(bubbles.points); U.push(bubbles.update);

  // ---- overhead crane with a travelling hook + a slung crate
  const craneMat = wmat(0x4a4438, { roughness: 0.6, metalness: 0.45 });
  put(mid, box(21, 0.55, 0.85), craneMat, 0, 8.3, -6);
  const trolley = new THREE.Group(); trolley.position.set(3, 7.9, -6); mid.add(trolley);
  put(trolley, box(0.8, 0.5, 0.9), craneMat, 0, 0, 0);
  put(trolley, cyl(0.03, 0.03, 1.8, 4), craneMat, 0, -1.1, 0);
  put(trolley, box(0.34, 0.5, 0.34), craneMat, 0, -2.2, 0);
  U.push((dt, t) => { trolley.position.x = 3 + Math.sin(t * 0.45) * 3.2; });
  put(mid, cyl(0.025, 0.025, 2.6, 4), craneMat, -5, 6.9, -6);
  put(mid, box(1.5, 1.1, 1.5), wmat(0x555a52, { roughness: 0.85 }), -5, 5, -6);

  // ---- tarped vehicle + crate stacks
  const tarpTex = canvasTexture('hangar-tarp', 256, 256, PAINTERS.dirt('#3e4636', '#2a3022', '#5c6850'), { repeat: [2, 1] });
  const tarpMat = wmat(0xffffff, { map: tarpTex, roughness: 1 });
  const veh = new THREE.Group(); veh.position.set(-11.2, 0, -5.8); veh.rotation.y = 0.3; mid.add(veh);
  put(veh, box(4.4, 1.5, 2), tarpMat, 0, 0.95, 0);
  put(veh, box(2.2, 0.9, 1.9), tarpMat, -0.4, 2.1, 0);
  const crateMat = wmat(0x4e5258, { roughness: 0.8, metalness: 0.2 });
  put(mid, box(1.6, 1.6, 1.6), crateMat, 10.8, 0.8, -6.8);
  put(mid, box(1.3, 1.3, 1.3), crateMat, 10.6, 2.25, -6.7);
  put(mid, box(1.9, 1.2, 1.4), crateMat, 12.2, 0.6, -5.4);
  for (const [sx, sz] of [[-11.2, -5.8], [10.8, -6.8]]) {
    const sh = shadowPool(2.8, 0.38); sh.position.set(sx, 0.015, sz + 0.5); g.add(sh);
  }

  // ---- ceiling light shafts + dust motes inside them
  const shaftMat = new THREE.MeshBasicMaterial({ map: canvasTexture('__world_glow', 128, 128, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.32)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
  }), color: 0xbfe0ff, transparent: true, opacity: 0.055, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const [sx, sz] of [[-4, -8], [4.5, -10]]) {
    const shaft = put(atmo, new THREE.PlaneGeometry(3.6, 10.5), shaftMat, sx, 4.6, sz, 'fx');
    shaft.rotation.x = 0.32; shaft.rotation.y = 0.2;
  }
  const motes = particleField({ count: 36, area: { x: 12, y: 6.5, z: [-11, -6] }, color: 0xd6e6f5, size: 0.05, opacity: 0.5, mode: 'float', seed: 139 });
  atmo.add(motes.points); U.push(motes.update);

  // ---- red alert lights, sweeping blink
  const alertMat = wmat(0xff2020, { emissive: 0xff1010, emissiveIntensity: 2.8 });
  for (const ax of [-13, 13]) {
    put(mid, sph(0.23, 8, 6), alertMat, ax, 8.1, -15.9, 'fx');
    const glow = glowSprite(0xff2020, 3, 0.3); glow.position.set(ax, 8.1, -15.2); mid.add(glow);
    ptLight(g, 0xff2020, 22, ax, 7.6, -14, 16);
  }
  U.push((dt, t) => { alertMat.emissiveIntensity = (Math.sin(t * 6) > 0) ? 2.8 : 0.3; });

  // ---- foreground (duel): the hangar door frame you fight inside
  if (opts.foreground !== false) {
    const fore = layer(g, 'foreground');
    const doorMat = wmat(0x2c2e36, { roughness: 0.65, metalness: 0.35 });
    for (const s of [-1, 1]) put(fore, box(0.8, 8.6, 0.8), doorMat, s * 8.9, 4.3, 5.4);
    put(fore, box(18.6, 0.9, 0.9), doorMat, 0, 8.6, 5.4);
    const strip2 = put(fore, box(17, 0.12, 0.1), stripMat, 0, 8.05, 5, 'fx');
    void strip2;
  }

  ptLight(g, 0xbfe0ff, 34, 0, 7.2, -6, 22);
  g.add(new THREE.AmbientLight(0x3a4048, 0.9));

  return {
    group: g, update: (dt, t) => U.run(dt, t),
    fog: { color: 0x14161c, near: 14, far: 40 }, bg: 0x0e1014,
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

export function buildArena(index, opts = {}) {
  const builder = ARENAS[index] || ARENAS[0];
  return builder(opts);
}
