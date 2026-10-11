/*
 * MIDDLE-EARTH pocket universe — world builder.
 *
 * buildWorld(THREE, T, DATA, activeQuest) assembles one continuous open world
 * (680 x 320 units) running west to east through all eight regions:
 *   The Shire -> Rivendell -> Moria -> Lothlorien -> Mirkwood
 *   -> Rohan -> Gondor -> Mordor
 *
 * DATA is the './data' module: { REGIONS: [{id,name,x,blurb}],
 *   QUESTS: [{id,region,title,text,objective,target?,checkpoints?}] }.
 * Quest targets/checkpoints are the source of truth for beacon placement;
 * landmark coordinates below are fixed to sit at (or beside) them.
 *
 * Returns:
 *   { group, colliders, spawn, bounds, groundHeight, update, dispose,
 *     sky, fog, beacon }
 *   - colliders: world-space [{x, z, r}] (landmark-local circles rotated by
 *     ry, scaled by s, offset by landmark x/z — same transform as the
 *     star-wars zone builder). Solid geometry: the walker is pushed out,
 *     never killed. Only the gate label sprites pass through visually.
 *   - beacon: { markCheckpoint(i), markTarget() } or null when no quest.
 *   - sky / fog are extras for the page shell (scene.background + FogExp2).
 *
 * Lighting: one hemisphere + one directional for the whole world (readable
 * everywhere, Mordor included), plus small LOCALIZED point lights — red at
 * Mount Doom, warm at Rivendell / Lothlorien / the Citadel beacon. Glow
 * never drowns the texture wraps.
 */
import * as ThreeJS from 'three';
import { buildLandmark, buildAmbient } from './landmarks.js';
import * as DataModule from './data.js';

function R3(THREE) { return THREE || ThreeJS; }

/* --- seeded PRNG + value noise (same family as the mount-doom foundry) --- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function gauss(v, mu, sig) {
  const d = (v - mu) / sig;
  return Math.exp(-d * d * 0.5);
}

const SEED = 0x1eaf;
const WORLD_W = 680, WORLD_D = 320;
const SPAWN = { x: -262, z: 44, yaw: -Math.PI / 2 }; // faces +x: east, toward the journey

/* Biome tints (multiplied over the grass wrap — kept bright so every region
 * stays readable, Mordor included). */
const BIOME = {
  shire: 0x77b255,      // lush green
  rivendell: 0x5fb89a,  // green-blue valley
  moria: 0x8d8a83,      // grey rock
  lothlorien: 0xb8bf62, // gold-green
  mirkwood: 0x3e7a44,   // dark green
  rohan: 0xa9c46a,      // light grassland
  gondor: 0xd8d2c2,     // pale stone / white
  mordor: 0x5c564f,     // ash grey-black (red tint added near the volcano)
};

/* Landmark placements, fixed to sit at the quest targets/checkpoints from
 * data.js (the source of truth). Scales are chosen so each landmark's
 * collider radius stays INSIDE its quest target radius — the beat must
 * always be reachable:
 *   minas-tirith s=0.9 -> r9 < target r10
 *   mount-doom   s=0.55 -> r8.8 < target r10
 */
const LANDMARKS = [
  // The Shire — quest target: East Road (-215, 0, r12)
  { type: 'hobbit-hole', x: -272, z: 28, s: 1 },
  { type: 'party-tree', x: -256, z: -16, s: 1.3 },
  { type: 'green-dragon', x: -242, z: 34, s: 1 },
  // Rivendell — quest target: Council terrace (-190, -18, r10)
  { type: 'rivendell-terrace', x: -190, z: -18, s: 1 },
  { type: 'waterfall', x: -176, z: -48, s: 1 },
  // Moria — checkpoints: West gate (-140,0), bridge (-115,-10), East gate (-95,0)
  { type: 'moria-door', x: -140, z: 0, s: 1 },
  { type: 'moria-bridge', x: -115, z: -10, s: 1 },
  { type: 'moria-door', x: -95, z: 0, s: 1, ry: Math.PI }, // East gate checkpoint
  // Lothlorien — quest target: Mirror glade (-50, -15, r8)
  { type: 'galadriel-mirror', x: -50, z: -15, s: 1 },
  { type: 'mallorn-tree', x: -63, z: 14, s: 1.2 },
  // Mirkwood — checkpoint: Spider hollow (25,-10, r8)
  { type: 'mirkwood-web', x: 25, z: -10, s: 1 },
  // Rohan — quest target: Edoras (90, -25, r10)
  { type: 'edoras-hall', x: 90, z: -25, s: 1 },
  // Gondor — quest target: Citadel (160, -30, r10)
  { type: 'minas-tirith', x: 160, z: -30, s: 0.9 },
  { type: 'arganath', x: 138, z: 12, s: 1 },
  // Mordor — quest target: Mount Doom summit (265, -20, r10)
  { type: 'mount-doom', x: 265, z: -20, s: 0.55 },
  { type: 'black-gate', x: 218, z: 44, s: 1 }, // decorative, off the road
  { type: 'barad-dur', x: 292, z: 58, s: 1 },
];

/* Ambient scatter plan per region (counts chosen per the build spec). */
const AMBIENT_PLAN = [
  { region: 'shire', type: 'sheep', count: 5 },
  { region: 'shire', type: 'bird', count: 3 },
  { region: 'rivendell', type: 'bird', count: 3 },
  { region: 'rivendell', type: 'firefly', count: 6 },
  { region: 'moria', type: 'ember', count: 6 },
  { region: 'lothlorien', type: 'firefly', count: 8 },
  { region: 'lothlorien', type: 'bird', count: 2 },
  { region: 'mirkwood', type: 'bird', count: 4 },
  { region: 'rohan', type: 'horse', count: 5 },
  { region: 'rohan', type: 'deer', count: 3 },
  { region: 'gondor', type: 'bird', count: 4 },
  { region: 'mordor', type: 'ember', count: 8 },
  { region: 'mordor', type: 'orc-sentry', count: 3 },
];

/* Pure height function — shared by geometry displacement and groundHeight. */
function makeHeightAt() {
  return function heightAt(x, z) {
    let h = (fbm2(x * 0.02, z * 0.02, SEED) - 0.5) * 2 * 3; // gentle +-3
    if (x > 200) { // Gondor mountain wall — raised but walkable
      const k = Math.min((x - 200) / 80, 1);
      h += k * k * 9;
    }
    if (x > -175 && x < -75) { // Moria canyon walls flanking the pass
      const band = smoothstep(-175, -155, x) * (1 - smoothstep(-95, -75, x));
      h += 8 * band * Math.max(gauss(z, 17, 6), gauss(z, -17, 6));
    }
    if (x > 240) { // Mordor: roughened ground near Mount Doom
      const k = Math.min((x - 240) / 40, 1);
      h += (fbm2(x * 0.09, z * 0.09, SEED + 7) - 0.5) * 2 * 1.8 * k;
    }
    return h;
  };
}

/* Gold-on-dark floating label sprite (region gates + quest beacons). */
function makeLabel(R, text, scaleW, scaleH) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  const label = String(text).slice(0, 22);
  if (ctx) {
    ctx.fillStyle = 'rgba(6,8,10,0.78)';
    ctx.fillRect(0, 8, 256, 48);
    ctx.strokeStyle = '#d8b25c'; ctx.lineWidth = 3;
    ctx.strokeRect(2, 10, 252, 44);
    ctx.fillStyle = '#f2dfa8';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 33);
  }
  const tex = new R.CanvasTexture(cv);
  tex.colorSpace = R.SRGBColorSpace;
  const sp = new R.Sprite(new R.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false,
  }));
  sp.scale.set(scaleW || 16, scaleH || 4, 1);
  return sp;
}

/* Region gate: stone arch with a floating label. Decorative — the opening is
 * wide and free roam is never blocked; only the pillars are solid. */
function buildGate(R, gx, gy, regionName, stoneMat, updaters) {
  const g = new R.Group();
  const pillarGeo = new R.BoxGeometry(1.8, 7, 1.8);
  for (const pz of [-8, 8]) {
    const p = new R.Mesh(pillarGeo, stoneMat);
    p.position.set(gx, gy + 3.5, pz);
    g.add(p);
    const cap = new R.Mesh(new R.BoxGeometry(2.4, 0.7, 2.4), stoneMat);
    cap.position.set(gx, gy + 7.3, pz);
    g.add(cap);
  }
  const lintel = new R.Mesh(new R.BoxGeometry(2.2, 1.6, 19.6), stoneMat);
  lintel.position.set(gx, gy + 8.1, 0);
  g.add(lintel);
  const label = makeLabel(R, regionName, 24, 6);
  label.position.set(gx, gy + 11.5, 0);
  g.add(label);
  updaters.push(function (t) {
    label.position.y = gy + 11.5 + Math.sin(t * 1.2 + gx * 0.13) * 0.35;
  });
  return {
    group: g,
    colliders: [{ x: gx, z: 8, r: 1.4 }, { x: gx, z: -8, r: 1.4 }],
  };
}

/* Quest beacon: gold checkpoint rings + target light pillar, all from the
 * active quest's own target/checkpoints (the source of truth). */
function buildBeacon(R, quest, heightAt, updaters) {
  if (!quest) return null;
  const g = new R.Group();
  const cps = Array.isArray(quest.checkpoints) ? quest.checkpoints : [];
  const rings = [];
  cps.forEach(function (cp) {
    const cy = heightAt(cp.x, cp.z) + 5.5;
    const ring = new R.Mesh(
      new R.TorusGeometry(cp.r || 5, 0.32, 10, 44),
      new R.MeshBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.9, fog: false })
    );
    ring.position.set(cp.x, cy, cp.z);
    g.add(ring);
    rings.push(ring);
    if (cp.label) {
      const lab = makeLabel(R, cp.label, 15, 3.75);
      lab.position.set(cp.x, cy + (cp.r || 5) + 3, cp.z);
      g.add(lab);
      updaters.push(function (t) {
        lab.position.y = cy + (cp.r || 5) + 3 + Math.sin(t * 1.6 + cp.x) * 0.4;
      });
    }
    const phase = cp.x * 1.7 + cp.z;
    updaters.push(function (t, dt) {
      ring.rotation.y += dt * 1.1;
      ring.position.y = cy + Math.sin(t * 1.6 + phase) * 0.45;
    });
  });

  let pillar = null, groundRing = null;
  if (quest.target) {
    const tg = quest.target;
    const ty = heightAt(tg.x, tg.z);
    pillar = new R.Mesh(
      new R.CylinderGeometry(1.5, 2.4, 64, 12, 1, true),
      new R.MeshBasicMaterial({
        color: 0xd8b25c, transparent: true, opacity: 0.3,
        blending: R.AdditiveBlending, side: R.DoubleSide, depthWrite: false, fog: false,
      })
    );
    pillar.position.set(tg.x, ty + 30, tg.z);
    g.add(pillar);
    groundRing = new R.Mesh(
      new R.TorusGeometry(tg.r || 6, 0.32, 8, 48),
      new R.MeshBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.75, fog: false })
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.set(tg.x, ty + 0.5, tg.z);
    g.add(groundRing);
    if (tg.label) {
      const lab = makeLabel(R, tg.label, 17, 4.25);
      lab.position.set(tg.x, ty + (tg.r || 6) + 4, tg.z);
      g.add(lab);
      updaters.push(function (t) {
        lab.position.y = ty + (tg.r || 6) + 4 + Math.sin(t * 1.6) * 0.4;
      });
    }
    updaters.push(function (t) {
      pillar.material.opacity = 0.24 + Math.sin(t * 2.2) * 0.08;
      groundRing.rotation.z += 0.008;
    });
  }

  return {
    group: g,
    markCheckpoint: function (i) { if (rings[i]) rings[i].material.color.set(0x6fe07a); },
    markTarget: function () {
      if (pillar) pillar.material.color.set(0x6fe07a);
      if (groundRing) groundRing.material.color.set(0x6fe07a);
    },
  };
}

export function buildWorld(THREE, T, DATA, activeQuest) {
  const R = R3(THREE);
  const D = DATA || DataModule;
  const rawRegions = (D && Array.isArray(D.REGIONS) && D.REGIONS.length)
    ? D.REGIONS : (DataModule.REGIONS || []);
  const rs = rawRegions.slice().sort(function (a, b) { return a.x - b.x; });
  // Region x-spans: boundaries at midpoints between centers, edges at bounds.
  const rb = rs.map(function (r, i) {
    return {
      region: r,
      x0: i === 0 ? -WORLD_W / 2 + 5 : (rs[i - 1].x + r.x) / 2,
      x1: i === rs.length - 1 ? WORLD_W / 2 - 5 : (r.x + rs[i + 1].x) / 2,
    };
  });

  const group = new R.Group();
  const colliders = [];
  const updaters = [];
  const heightAt = makeHeightAt();

  function safeTexture(maker, repeatX, repeatY) {
    try {
      const t = maker();
      t.repeat.set(repeatX || 1, repeatY || 1);
      return t;
    } catch (e) { return null; }
  }

  /* ---------- lights: readable everywhere, glow strictly localized ---------- */
  group.add(new R.HemisphereLight(0xbfd8e8, 0x3a3f33, 0.6));
  const sun = new R.DirectionalLight(0xfff0d8, 1.15);
  sun.position.set(80, 120, 40);
  group.add(sun);
  const mordorLight = new R.PointLight(0xff5a1a, 60, 150, 2);
  mordorLight.position.set(265, heightAt(265, -20) + 16, -20);
  group.add(mordorLight);
  const rivLight = new R.PointLight(0xffd9a0, 28, 85, 2);
  rivLight.position.set(-190, heightAt(-190, -18) + 9, -18);
  group.add(rivLight);
  const lorienLight = new R.PointLight(0xffe6b0, 28, 85, 2);
  lorienLight.position.set(-50, heightAt(-50, -15) + 11, -15);
  group.add(lorienLight);
  const citadelLight = new R.PointLight(0xffb347, 22, 75, 2);
  citadelLight.position.set(160, heightAt(160, -30) + 20, -30);
  group.add(citadelLight);
  updaters.push(function (t) {
    // deterministic eruption flicker (mount-doom foundry technique)
    mordorLight.intensity = 56 + 11 * Math.sin(t * 7.3) + 7 * Math.sin(t * 13.7 + 1.7);
  });

  /* ---------- terrain: vertex-colored by region biome ---------- */
  const tmpC = new R.Color();
  function biomeColorAt(x, z, out) {
    const n = rb.length;
    let i = 0;
    while (i < n - 1 && x >= rb[i].x1) i++;
    const id = rb[i].region.id;
    out.set(BIOME[id] != null ? BIOME[id] : 0x77b255);
    if (i < n - 1) { // blend across the boundary with the next region
      const b = rb[i].x1;
      const t = smoothstep(b - 18, b + 18, x);
      if (t > 0) {
        const nid = rb[i + 1].region.id;
        tmpC.set(BIOME[nid] != null ? BIOME[nid] : 0x77b255);
        out.lerp(tmpC, t);
      }
    }
    if (x < 250) { // worn road along the journey line
      const road = 1 - smoothstep(3.2, 5.2, Math.abs(z));
      if (road > 0) { tmpC.set(0x8a6f4d); out.lerp(tmpC, road * 0.55); }
    }
    const mdx = x - 265, mdz = z + 20; // red tint near Mount Doom
    const md = Math.sqrt(mdx * mdx + mdz * mdz);
    if (md < 75) { tmpC.set(0x8a3a24); out.lerp(tmpC, (1 - md / 75) * 0.55); }
    const v = 0.9 + 0.2 * fbm2(x * 0.05, z * 0.05, SEED + 31);
    out.multiplyScalar(v);
    return out;
  }

  const tgeo = new R.PlaneGeometry(WORLD_W, WORLD_D, 170, 80);
  tgeo.rotateX(-Math.PI / 2);
  const tpos = tgeo.attributes.position;
  const tcolors = new Float32Array(tpos.count * 3);
  const col = new R.Color();
  for (let i = 0; i < tpos.count; i++) {
    const x = tpos.getX(i), z = tpos.getZ(i);
    tpos.setY(i, heightAt(x, z));
    biomeColorAt(x, z, col);
    tcolors[i * 3] = col.r; tcolors[i * 3 + 1] = col.g; tcolors[i * 3 + 2] = col.b;
  }
  tgeo.setAttribute('color', new R.BufferAttribute(tcolors, 3));
  tgeo.computeVertexNormals();
  const groundTex = safeTexture(function () { return T.grassTexture(); }, 40, 19);
  const terrain = new R.Mesh(tgeo, new R.MeshStandardMaterial({
    map: groundTex || undefined,
    color: groundTex ? 0xffffff : 0x6f8f52,
    vertexColors: true, roughness: 1, metalness: 0,
  }));
  group.add(terrain);

  /* ---------- landmarks (local colliders -> world space) ---------- */
  for (const ld of LANDMARKS) {
    let built;
    try { built = buildLandmark(ld.type, R, T); }
    catch (e) { continue; } // unknown type: skip, keep the world alive
    if (!built || !built.group) continue;
    const s = ld.s || 1, ry = ld.ry || 0;
    built.group.position.set(ld.x, heightAt(ld.x, ld.z), ld.z);
    built.group.rotation.y = ry;
    built.group.scale.setScalar(s);
    group.add(built.group);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const list = Array.isArray(built.colliders) ? built.colliders : [];
    for (const c of list) {
      colliders.push({
        x: ld.x + (c.x * cos + c.z * sin) * s,
        z: ld.z + (-c.x * sin + c.z * cos) * s,
        r: c.r * s,
      });
    }
  }

  /* ---------- region gates (decorative arches, free roam always) ---------- */
  const gateTex = safeTexture(function () { return T.stoneTexture(); }, 2, 2);
  const gateMat = new R.MeshStandardMaterial({
    map: gateTex || undefined, color: gateTex ? 0xffffff : 0x8d8d94, roughness: 1,
  });
  for (let i = 0; i < rb.length - 1; i++) {
    const gx = rb[i].x1;
    const gy = heightAt(gx, 0);
    const gate = buildGate(R, gx, gy, rb[i + 1].region.name, gateMat, updaters);
    group.add(gate.group);
    for (const c of gate.colliders) colliders.push(c);
  }

  /* ---------- quest beacon ---------- */
  const beacon = buildBeacon(R, activeQuest, heightAt, updaters);
  if (beacon) group.add(beacon.group);

  /* ---------- ambient scatter (clear of landmark colliders) ---------- */
  const arand = mulberry32(SEED ^ 0x51f7);
  function clearOfLandmarks(x, z, pad) {
    for (const c of colliders) {
      const dx = x - c.x, dz = z - c.z, rr = c.r + pad;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }
  function spanOf(regionId) {
    for (const b of rb) if (b.region.id === regionId) return b;
    return null;
  }
  for (const ad of AMBIENT_PLAN) {
    const span = spanOf(ad.region);
    if (!span) continue;
    for (let i = 0; i < ad.count; i++) {
      let px = 0, pz = 0, ok = false;
      for (let tries = 0; tries < 14 && !ok; tries++) {
        px = span.x0 + 6 + arand() * Math.max(1, span.x1 - span.x0 - 12);
        pz = -110 + arand() * 220;
        ok = clearOfLandmarks(px, pz, 5);
      }
      if (!ok) continue;
      let amb;
      try { amb = buildAmbient(ad.type, R, T); }
      catch (e) { continue; } // unknown ambient: skip
      if (!amb || !amb.group) continue;
      // Parent holder: several ambient updates drive their group position
      // absolutely (birds circle, embers rise), so the scatter offset lives
      // on the parent and the critter animates locally.
      const holder = new R.Group();
      holder.position.set(px, heightAt(px, pz), pz);
      holder.rotation.y = arand() * Math.PI * 2;
      holder.add(amb.group);
      group.add(holder);
      const upd = (typeof amb.update === 'function') ? amb.update : function () {};
      updaters.push(function (t, dt) { try { upd(t, dt); } catch (e) {} });
    }
  }

  function update(t, dt) {
    for (const u of updaters) {
      try { u(t, dt); } catch (e) { /* a broken updater never kills the frame */ }
    }
  }

  /* Spawn near the active quest's first step (facing east toward it) so
   * late quests don't force a full west-to-east walk every time. Wandering
   * (no quest) keeps the Shire spawn. Offsets verified clear of landmark
   * colliders; free roam is untouched. */
  function questSpawn() {
    if (activeQuest) {
      const cps = Array.isArray(activeQuest.checkpoints) ? activeQuest.checkpoints : [];
      const first = cps.length ? cps[0] : activeQuest.target;
      if (first && typeof first.x === 'number' && typeof first.z === 'number') {
        return { x: first.x - 30, z: first.z + 30, yaw: -Math.PI / 2 };
      }
    }
    return { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw };
  }

  function dispose() {
    // The entire world group is discarded on dispose, so every texture found
    // on a material is released — including the ones landmark/ambient
    // builders created via T[maker]() (each buildWorld call makes fresh
    // ones, so skipping them leaked GPU memory on every quest transition).
    group.traverse(function (o) {
      if (o.isMesh || o.isSprite || o.isPoints) {
        if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          if (m.map) { try { m.map.dispose(); } catch (e) {} }
          try { m.dispose(); } catch (e) {}
        }
      }
    });
  }

  return {
    group: group,
    colliders: colliders,
    spawn: questSpawn(),
    bounds: { kind: 'box', min: { x: -335, z: -155 }, max: { x: 335, z: 155 } },
    groundHeight: heightAt,
    update: update,
    dispose: dispose,
    beacon: beacon,
    /* extras for the page shell (scene setup) */
    sky: 0x9fc3e0,
    fog: { color: 0xa9c3d6, density: 0.0038 },
  };
}
