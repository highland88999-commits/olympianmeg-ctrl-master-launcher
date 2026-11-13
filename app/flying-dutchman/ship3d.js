// The Flying Dutchman — procedural 3D ship builder (three.js).
//
// Builds a real ship: lofted hull, plank deck, three masts with yards
// and tattered sails, bowsprit, sterncastle, a broadside of cannons per
// side, ghost-green trim, and a crew of soul figures at the guns.
// makeGhostShip() reuses the builder for AI opponents (paler, thinner).

import * as THREE from 'three';
import { SHIP } from './engine.js';

/** Canvas texture: weathered deck planks. */
function plankTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a1f16'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#33261a' : '#2c2115';
    g.fillRect(0, i * 32, 256, 30);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, i * 32 + 30, 256, 2);
    // plank seams
    g.fillStyle = 'rgba(0,0,0,0.35)';
    const off = (i * 97) % 256;
    g.fillRect(off, i * 32, 2, 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 8);
  return t;
}

/** Canvas texture: tattered sailcloth. */
function sailTexture(tint = '#cfd4c8') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = tint;
  g.fillRect(0, 0, 128, 128);
  // cloth shading: vertical seams + grime
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(i * 22, 0, 3, 128);
  }
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(10,12,10,0.55)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  // tattered lower edge: chew holes with destination-out
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < 128; x += 4) {
    const h = 6 + Math.abs(Math.sin(x * 0.7)) * 26 + (x % 3) * 4;
    g.fillRect(x, 128 - h, 4, h);
  }
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 128, y = 30 + Math.random() * 80, r = 2 + Math.random() * 5;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return new THREE.CanvasTexture(c);
}

/** Lofted hull geometry. Bow at +Z. */
function hullGeometry(L, B, ghost) {
  const N = 16; // sections along length
  const K = 9;  // points across (port rail -> keel -> stbd rail)
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;                 // 0 stern -> 1 bow
    const z = (t - 0.5) * L;
    // half-beam: full amidships, narrow at bow, transom at stern
    const fullness = Math.sin(Math.PI * Math.min(0.985, Math.max(0.015, 0.12 + t * 0.82)));
    const halfBeam = (B / 2) * (0.28 + 0.72 * Math.pow(fullness, 0.65));
    // keel rises toward bow and stern
    const keelY = -3.4 + 2.9 * Math.pow(Math.abs(t - 0.42) / 0.58, 2.2);
    // rail with sheer: rises at bow, higher at stern (castle)
    const railY = 2.3 + 1.6 * Math.pow(Math.max(0, t - 0.72) / 0.28, 1.6)
                      + 2.6 * Math.pow(Math.max(0, 0.22 - t) / 0.22, 1.8);
    for (let k = 0; k <= K; k++) {
      const u = (k / K) * 2 - 1;     // -1 port rail .. 1 stbd rail
      const x = u * halfBeam;
      const y = keelY + (railY - keelY) * Math.pow(Math.abs(u), 1.7);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < K; k++) {
      const a = i * (K + 1) + k, b = a + K + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, railAt: (t) => 2.3 + 1.6 * Math.pow(Math.max(0, t - 0.72) / 0.28, 1.6) + 2.6 * Math.pow(Math.max(0, 0.22 - t) / 0.22, 1.8) };
}

function makeSail(w, h, tex, ghost) {
  const geo = new THREE.PlaneGeometry(w, h, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, side: THREE.DoubleSide,
    roughness: 0.9, metalness: 0,
    emissive: new THREE.Color(ghost ? 0x9fd8ff : 0x0a3d2a),
    emissiveIntensity: ghost ? 0.25 : 0.12,
    alphaTest: 0.15,
  });
  const m = new THREE.Mesh(geo, mat);
  m.userData.base = geo.attributes.position.array.slice();
  return m;
}

/**
 * Build the ship. Options: { ghost, name }.
 * Returns a THREE.Group with userData:
 *   sails[], flag, crewGroup, setCrew(n), setSails(state),
 *   muzzle(side, i) -> world position of a cannon muzzle,
 *   cannons: { port: [Object3D], stbd: [Object3D] }
 */
export function buildShip({ ghost = false } = {}) {
  const L = SHIP.length, B = SHIP.beam;
  const g = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: ghost ? 0x3a4a55 : 0x1c1410,
    roughness: 0.85, metalness: 0.1,
    emissive: new THREE.Color(ghost ? 0x1a3a55 : 0x03170f),
    emissiveIntensity: ghost ? 0.5 : 0.35,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x0b0f0c, roughness: 0.6,
    emissive: new THREE.Color(ghost ? 0x66c2ff : 0x00ff9d),
    emissiveIntensity: ghost ? 1.2 : 0.9,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 0.9 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x171008, roughness: 0.95 });

  // --- hull ---
  const { geo: hullGeo } = hullGeometry(L, B, ghost);
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({
    ...hullMat, side: THREE.DoubleSide,
  }));
  // copy props manually (spread of material loses prototype) — rebuild:
  hull.material = new THREE.MeshStandardMaterial({
    color: ghost ? 0x2c3e4a : 0x201712,
    roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide,
    emissive: new THREE.Color(ghost ? 0x14324a : 0x03231a),
    emissiveIntensity: ghost ? 0.6 : 0.4,
  });
  g.add(hull);

  // --- gunwale trim: glowing rail line (tube along the sheer) ---
  {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, z = (t - 0.5) * L;
      const fullness = Math.sin(Math.PI * Math.min(0.985, Math.max(0.015, 0.12 + t * 0.82)));
      const halfBeam = (B / 2) * (0.28 + 0.72 * Math.pow(fullness, 0.65));
      const railY = 2.3 + 1.6 * Math.pow(Math.max(0, t - 0.72) / 0.28, 1.6)
                        + 2.6 * Math.pow(Math.max(0, 0.22 - t) / 0.22, 1.8);
      pts.push(new THREE.Vector3(halfBeam * 0.98, railY + 0.05, z));
    }
    for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x * s, p.y, p.z)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.09, 6), trimMat));
    }
  }

  // --- deck ---
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(B * 0.86, 0.25, L * 0.94),
    new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.95 })
  );
  deck.position.y = 1.15;
  g.add(deck);

  // --- sterncastle ---
  const castle = new THREE.Mesh(new THREE.BoxGeometry(B * 0.7, 2.6, 4.6), darkWood);
  castle.position.set(0, 3.4, -L / 2 + 3.4);
  g.add(castle);
  const castleRoof = new THREE.Mesh(new THREE.BoxGeometry(B * 0.78, 0.3, 5.0), woodMat);
  castleRoof.position.set(0, 4.85, -L / 2 + 3.4);
  g.add(castleRoof);
  // stern lanterns
  for (const sx of [-1, 0, 1]) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(ghost ? 0x66c2ff : 0x39ff9d), emissiveIntensity: 2.2 })
    );
    lamp.position.set(sx * B * 0.28, 4.4, -L / 2 + 1.05);
    g.add(lamp);
  }

  // --- bowsprit ---
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 7, 8), woodMat);
  bowsprit.rotation.x = Math.PI / 2 - 0.28;
  bowsprit.position.set(0, 3.6, L / 2 + 2.6);
  g.add(bowsprit);

  // --- masts, yards, sails ---
  const sails = [];
  const sailTex = sailTexture(ghost ? '#b9cdd8' : '#cfd4c8');
  const mastDefs = [
    { z: -6.5, h: 15, yards: [9.5, 13], sailW: 8.5 },
    { z: 0.5, h: 19, yards: [10.5, 15, 18], sailW: 10.5 },
    { z: 6.8, h: 16, yards: [10, 14], sailW: 9 },
  ];
  for (const md of mastDefs) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, md.h, 8), woodMat);
    mast.position.set(0, 1.2 + md.h / 2, md.z);
    g.add(mast);
    for (let yi = 0; yi < md.yards.length; yi++) {
      const y = md.yards[yi] + 1.2;
      const yardW = md.sailW * (1 - yi * 0.14);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, yardW, 6), darkWood);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, y, md.z);
      g.add(yard);
      if (yi < md.yards.length - 1 || true) {
        const sh = yi === 0 ? 5.2 : 4.2;
        const sail = makeSail(yardW * 0.92, sh, sailTex, ghost);
        sail.position.set(0, y - sh / 2 - 0.15, md.z + 0.12);
        g.add(sail);
        sails.push(sail);
      }
    }
    // masthead pennant — a sail-like mesh, so it needs the same
    // userData.base the ripple loop reads (a pennant without it
    // black-screens the whole voyage: animateShip reads base[0]).
    const pen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.5, 6, 1),
      new THREE.MeshBasicMaterial({ color: ghost ? 0x66c2ff : 0x00ff9d, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    pen.userData.base = pen.geometry.attributes.position.array.slice();
    pen.position.set(0.8, 1.2 + md.h + 0.2, md.z);
    g.add(pen);
    sails.push(pen); // ripples like a sail
  }

  // --- stern flag (tattered) ---
  const flag = makeSail(2.6, 1.6, sailTex, ghost);
  flag.position.set(-1.35, 5.6, -L / 2 + 1.2);
  g.add(flag);
  sails.push(flag);

  // --- cannons: 6 per side ---
  const cannons = { port: [], stbd: [] };
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.5, metalness: 0.7 });
  for (let i = 0; i < SHIP.cannonsPerSide; i++) {
    const t = 0.3 + (i / (SHIP.cannonsPerSide - 1)) * 0.4; // midship band
    const z = (t - 0.5) * L;
    const fullness = Math.sin(Math.PI * Math.min(0.985, Math.max(0.015, 0.12 + t * 0.82)));
    const halfBeam = (B / 2) * (0.28 + 0.72 * Math.pow(fullness, 0.65));
    for (const side of ['port', 'stbd']) {
      const s = side === 'port' ? -1 : 1;
      const grp = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 10), barrelMat);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.x = s * 1.1;
      grp.add(barrel);
      const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.8), darkWood);
      grp.add(carriage);
      grp.position.set(s * (halfBeam - 0.4), 1.9, z);
      g.add(grp);
      cannons[side].push(grp);
    }
  }

  // --- ghost deck light ---
  const deckLight = new THREE.PointLight(ghost ? 0x66c2ff : 0x2bff9d, ghost ? 12 : 20, 26, 1.6);
  deckLight.position.set(0, 6, 0);
  g.add(deckLight);

  // --- crew: soul figures at the guns ---
  const crewGroup = new THREE.Group();
  g.add(crewGroup);
  const crewMat = new THREE.MeshStandardMaterial({
    color: 0xd8fff0, transparent: true, opacity: 0.85,
    emissive: new THREE.Color(ghost ? 0x9fdcff : 0x54ffb0), emissiveIntensity: 1.4,
  });
  function setCrew(n) {
    while (crewGroup.children.length > n) crewGroup.remove(crewGroup.children[0]);
    while (crewGroup.children.length < n) {
      const fig = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 8), crewMat);
      body.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), crewMat);
      head.position.y = 1.25;
      fig.add(body, head);
      // station: alternate sides along the gun deck
      const k = crewGroup.children.length;
      const side = k % 2 === 0 ? 1 : -1;
      const zi = Math.floor(k / 2) % SHIP.cannonsPerSide;
      const t = 0.3 + (zi / (SHIP.cannonsPerSide - 1)) * 0.4;
      fig.position.set(side * (B / 2 - 1.3), 1.3, (t - 0.5) * L);
      fig.userData.phase = Math.random() * 6.28;
      crewGroup.add(fig);
    }
  }
  setCrew(6);

  // --- sail plan: full / battle / furled ---
  function setSails(state) {
    for (const s of sails) {
      if (s === flag) continue;
      const target = state === 'full' ? 1 : state === 'battle' ? 0.55 : 0.12;
      s.userData.deploy = target;
      if (s.userData.deployCur === undefined) s.userData.deployCur = target;
    }
  }
  setSails('full');

  /** World position of a cannon muzzle (for ball spawn visuals). */
  function muzzle(side, i, out) {
    const c = cannons[side][i % cannons[side].length];
    out = out || new THREE.Vector3();
    c.children[0].getWorldPosition(out);
    const s = side === 'port' ? -1 : 1;
    // push outward along the ship's local X
    const off = new THREE.Vector3(s * 1.4, 0.1, 0).applyQuaternion(g.quaternion);
    return out.add(off);
  }

  g.userData = { sails, flag, crewGroup, setCrew, setSails, muzzle, cannons, ghost, deckLight };
  return g;
}

/** Animate sails/flag ripple + crew bob. Call every frame. */
export function animateShip(g, t, dt) {
  const ud = g.userData;
  for (const s of ud.sails) {
    const pos = s.geometry.attributes.position;
    const base = s.userData.base;
    // A sail-like mesh without a base must never kill the whole frame
    // (that black-screened the voyage). Skip it and keep sailing.
    if (!base) continue;
    const deploy = s.userData.deploy ?? 1;
    s.userData.deployCur = (s.userData.deployCur ?? 1) + (deploy - (s.userData.deployCur ?? 1)) * Math.min(1, dt * 2);
    const d = s.userData.deployCur;
    const billow = (s === ud.flag ? 0.35 : 0.9) * d;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      const w = Math.sin(bx * 1.4 + t * 3.1) * 0.5 + Math.sin(by * 2.2 - t * 2.3) * 0.3;
      pos.setZ(i, w * billow);
      // furled sails gather upward
      pos.setY(i, by * (0.25 + 0.75 * d));
    }
    pos.needsUpdate = true;
    s.geometry.computeVertexNormals();
  }
  for (const fig of ud.crewGroup.children) {
    fig.position.y = 1.3 + Math.sin(t * 2 + fig.userData.phase) * 0.12;
  }
}

/** AI ghost ship: paler rigging, thinner presence. */
export function buildGhostShip() {
  return buildShip({ ghost: true });
}
