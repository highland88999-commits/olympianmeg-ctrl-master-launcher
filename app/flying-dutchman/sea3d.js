// The cursed sea — actual ocean, storm sky, and battle effects (three.js).
//
// - Ocean: a CPU-displaced plane that follows the camera, using the SAME
//   waveHeight() as the engine so ships ride the visible waves.
// - Foam caps via vertex colors; moon specular via Phong material.
// - Night storm sky: gradient dome, stars, moon, lightning, rain.
// - Pools: cannonballs, muzzle flashes, splashes, soul wisps.

import * as THREE from 'three';
import { waveHeight, SHIP, sinkDropK } from './engine.js';
import { getParticleTexture } from '../../lib/particles/sprites.js';

function radialTexture(inner, outer, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------------------
// Ocean
// ---------------------------------------------------------------------------

const OCEAN_SIZE = 1400;
const OCEAN_SEG = 96;

export function createOcean() {
  const geo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEG, OCEAN_SEG);
  geo.rotateX(-Math.PI / 2);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshPhongMaterial({
    color: 0x06283a,
    emissive: 0x010a12,
    specular: 0x9fd8ff,
    shininess: 90,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  const deep = new THREE.Color(0x06283a);
  const foam = new THREE.Color(0xbfe6ef);
  const tmp = new THREE.Color();

  function update(t, camX, camZ) {
    mesh.position.set(camX, 0, camZ);
    const pos = geo.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const lx = arr[i * 3], lz = arr[i * 3 + 2];
      const wx = camX + lx, wz = camZ + lz;
      const h = waveHeight(wx, wz, t);
      arr[i * 3 + 1] = h;
      // foam on crests
      const f = Math.max(0, Math.min(1, (h - 1.55) / 0.75));
      tmp.copy(deep).lerp(foam, f * 0.85);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    pos.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return { mesh, update };
}

// ---------------------------------------------------------------------------
// Sky: dome, stars, moon, lightning, rain
// ---------------------------------------------------------------------------

export function createSky() {
  const group = new THREE.Group();

  // gradient dome
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g2 = c.getContext('2d');
  const grad = g2.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#020409');
  grad.addColorStop(0.55, '#071018');
  grad.addColorStop(0.8, '#0d1c26');
  grad.addColorStop(1, '#12242e');
  g2.fillStyle = grad; g2.fillRect(0, 0, 4, 256);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 16, 12),
    // depthWrite off, house sky-dome idiom: the Moon sits 8 m outside
    // this 3000 m wall, and a depth-writing dome would occlude it.
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  group.add(dome);

  // stars
  {
    const n = 700;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 + 0.08;
      const r = 2800;
      p[i * 3] = Math.cos(a) * Math.cos(e) * r;
      p[i * 3 + 1] = Math.sin(e) * r;
      p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe8ff, size: 3.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, map: getParticleTexture('star') || undefined })));
  }

  // moon
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(235,244,255,1)', 'rgba(235,244,255,0)', 256),
    fog: false, transparent: true, opacity: 0.95,
  }));
  moon.scale.set(320, 320, 1);
  moon.position.set(-1400, 1500, -2200);
  group.add(moon);
  // The real Moon: Merlin's photograph on a sphere (never a flat
  // disc — the photo is equirectangular and would smear). It sits
  // 160 m inside the glow sprite along the moon direction so the
  // halo's opaque centre never paints over the photo; the glow
  // sprite stays as its halo. Rides with the sky group, which
  // follows the camera. Pale fallback if the photo fails to load.
  const moonDir = new THREE.Vector3(-1400, 1500, -2200);
  const moonDist = moonDir.length();
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false });
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 32), moonMat);
  moonBall.position.copy(moonDir).multiplyScalar((moonDist - 160) / moonDist);
  moonBall.name = 'dutchman-moon';
  group.add(moonBall);
  if (typeof document !== 'undefined') {
    try {
      new THREE.TextureLoader().load(
        '/images/moon/moon-surface.jpg',
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          moonMat.map = tex;
          moonMat.color.set(0xffffff);
          moonMat.needsUpdate = true;
        },
        undefined,
        () => { /* photo failed: the pale fallback stays */ },
      );
    } catch { /* no loader available: the pale fallback stays */ }
  }
  const moonLight = new THREE.DirectionalLight(0xbfd9ff, 1.1);
  moonLight.position.copy(moon.position);
  group.add(moonLight);

  // lightning
  const bolt = new THREE.DirectionalLight(0xd8ecff, 0);
  bolt.position.set(600, 900, 300);
  group.add(bolt);
  const strike = { t: -10, next: 4 + Math.random() * 8, dur: 0.28 };

  // rain
  const rainN = 900;
  const rainPos = new Float32Array(rainN * 3);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fc4d8, size: 1.6, transparent: true, opacity: 0.5, map: getParticleTexture('drop') || undefined }));
  rain.frustumCulled = false;
  group.add(rain);
  const rainVel = new Float32Array(rainN);

  function update(t, dt, camX, camZ) {
    // lightning timing
    if (t - strike.t > strike.next) {
      strike.t = t;
      strike.next = 5 + Math.random() * 11;
    }
    const lt = (t - strike.t) / strike.dur;
    const flicker = lt < 1 ? Math.max(0, Math.sin(lt * Math.PI * 3)) * (1 - lt) : 0;
    bolt.intensity = flicker * 5;
    dome.material.color.setScalar(1 + flicker * 0.9);

    // rain falls around the camera
    const R = 90;
    for (let i = 0; i < rainN; i++) {
      if (rainVel[i] === 0) {
        rainPos[i * 3] = camX + (Math.random() - 0.5) * R * 2;
        rainPos[i * 3 + 1] = Math.random() * 60;
        rainPos[i * 3 + 2] = camZ + (Math.random() - 0.5) * R * 2;
        rainVel[i] = 38 + Math.random() * 22;
      }
      rainPos[i * 3 + 1] -= rainVel[i] * dt;
      if (rainPos[i * 3 + 1] < -2) rainVel[i] = 0;
    }
    rainGeo.attributes.position.needsUpdate = true;
    group.position.set(camX, 0, camZ);
    return flicker;
  }
  return { group, update, moonLight };
}

// ---------------------------------------------------------------------------
// Ship posing on the waves
// ---------------------------------------------------------------------------

/** Place a ship group on the waves: bob + pitch/roll from the slope. */
export function poseShip(group, ship, t) {
  const h = waveHeight(ship.x, ship.z, t);
  const e = 2.5;
  const hx = waveHeight(ship.x + e, ship.z, t) - waveHeight(ship.x - e, ship.z, t);
  const hz = waveHeight(ship.x, ship.z + e, t) - waveHeight(ship.x, ship.z - e, t);
  group.position.set(ship.x, h - 0.4, ship.z);
  group.rotation.set(0, ship.heading, 0);
  // pitch/roll from wave slope, in ship-local frame
  const pitch = Math.atan2(hz, e * 2) * Math.cos(ship.heading) - Math.atan2(hx, e * 2) * Math.sin(ship.heading);
  const roll = Math.atan2(hx, e * 2) * Math.cos(ship.heading) + Math.atan2(hz, e * 2) * Math.sin(ship.heading);
  group.rotation.x = pitch * 0.7;
  group.rotation.z = -roll * 0.7;
  if (ship.sinking) {
    const k = Math.min(1, ship.sinkT / SHIP.sinkTime);
    // Accelerating drop (sinkDropK): the hull slips under early and
    // the masthead goes last — at k = 1 the whole ship is under water.
    group.position.y -= sinkDropK(k);
    group.rotation.z += k * 0.95;
    group.rotation.x -= k * 0.5;
  }
}

// ---------------------------------------------------------------------------
// Cannonballs
// ---------------------------------------------------------------------------

export function createBallPool(scene, max = 60) {
  const geo = new THREE.SphereGeometry(0.32, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const glowTex = radialTexture('rgba(255,180,80,0.9)', 'rgba(255,120,20,0)', 64);
  const items = [];
  for (let i = 0; i < max; i++) {
    const m = new THREE.Mesh(geo, mat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.7, depthWrite: false }));
    glow.scale.set(2.2, 2.2, 1);
    m.add(glow);
    m.visible = false;
    scene.add(m);
    items.push(m);
  }
  let cursor = 0;
  return {
    /** Sync pool meshes to engine balls (positions only). */
    sync(balls, t) {
      for (const m of items) m.visible = false;
      let n = 0;
      for (const b of balls) {
        if (t < b.delay || n >= max) continue;
        const m = items[n++];
        m.visible = true;
        m.position.set(b.x, Math.max(b.y, waveHeight(b.x, b.z, t) + 0.2), b.z);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Muzzle flashes + splashes (event-driven, pooled)
// ---------------------------------------------------------------------------

export function createFlashPool(scene, max = 24) {
  const tex = radialTexture('rgba(255,220,150,1)', 'rgba(255,120,20,0)', 128);
  const items = [];
  for (let i = 0; i < max; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    items.push({ s, t: 1e9 });
  }
  const light = new THREE.PointLight(0xffb050, 0, 60, 1.8);
  scene.add(light);
  let cursor = 0;
  return {
    fire(x, y, z) {
      const it = items[cursor++ % max];
      it.s.visible = true;
      it.s.position.set(x, y, z);
      it.s.scale.set(7, 7, 1);
      it.t = 0;
      light.position.set(x, y + 1, z);
      light.intensity = 60;
    },
    update(dt) {
      for (const it of items) {
        if (!it.s.visible) continue;
        it.t += dt;
        const k = it.t / 0.22;
        if (k >= 1) { it.s.visible = false; continue; }
        it.s.material.opacity = 1 - k;
        const sc = 7 + k * 5;
        it.s.scale.set(sc, sc, 1);
      }
      light.intensity = Math.max(0, light.intensity - dt * 400);
    },
  };
}

export function createSplashPool(scene, max = 30) {
  const tex = radialTexture('rgba(220,240,250,0.95)', 'rgba(220,240,250,0)', 128);
  const items = [];
  for (let i = 0; i < max; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    items.push({ s, t: 1e9, big: false });
  }
  let cursor = 0;
  return {
    splash(x, z, t, big = false) {
      const it = items[cursor++ % max];
      it.s.visible = true;
      it.s.position.set(x, waveHeight(x, z, t) + 1.2, z);
      it.t = 0; it.big = big;
    },
    update(dt) {
      for (const it of items) {
        if (!it.s.visible) continue;
        it.t += dt;
        const dur = it.big ? 0.9 : 0.55;
        const k = it.t / dur;
        if (k >= 1) { it.s.visible = false; continue; }
        it.s.material.opacity = 0.9 * (1 - k);
        const sc = (it.big ? 14 : 8) * (0.4 + k);
        it.s.scale.set(sc, sc * 1.4, 1);
        it.s.position.y += dt * (it.big ? 7 : 4);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Soul wisps
// ---------------------------------------------------------------------------

export function createSoulPool(scene, max = 60) {
  const tex = radialTexture('rgba(140,255,210,1)', 'rgba(40,255,170,0)', 128);
  const items = [];
  for (let i = 0; i < max; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    items.push(s);
  }
  return {
    sync(souls, t) {
      for (const s of items) s.visible = false;
      for (let i = 0; i < Math.min(souls.length, max); i++) {
        const w = souls[i], m = items[i];
        m.visible = true;
        m.position.set(w.x, waveHeight(w.x, w.z, t) + 2.2 + Math.sin(t * 2.4 + w.phase) * 0.8, w.z);
        const sc = 2.6 + Math.sin(t * 3 + w.phase) * 0.5;
        m.scale.set(sc, sc, 1);
        m.material.opacity = Math.min(0.95, w.life / 6);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Wreck fires — flame + smoke + orange glow on a burning ship.
// ---------------------------------------------------------------------------

/**
 * One slot per ship that can burn at once (player + up to 3 enemies in
 * solo, 2 in a duel). sync() takes burning ships as
 * [{ x, z, k }] — k = 0 fresh wreck → 1 slipped under. Flames fade as
 * the hull goes down; the light flickers like the nether torch lights.
 */
export function createFirePool(scene, max = 4) {
  const flameTex = radialTexture('rgba(255,220,120,1)', 'rgba(255,90,10,0)', 128);
  const smokeTex = radialTexture('rgba(40,40,44,0.55)', 'rgba(40,40,44,0)', 128);
  const slots = [];
  for (let i = 0; i < max; i++) {
    const g = new THREE.Group();
    const flames = [];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, opacity: 0.95, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      s.position.set((k - 1) * 2.4, 1.5 + (k % 2) * 1.4, (k % 2 ? -1.6 : 1.4));
      s.scale.set(5, 7, 1);
      g.add(s);
      flames.push({ s, phase: k * 2.1 + i * 1.7, base: 5 + k * 1.6 });
    }
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTex, transparent: true, opacity: 0.4, depthWrite: false,
    }));
    smoke.position.set(0, 9, 0);
    smoke.scale.set(10, 10, 1);
    g.add(smoke);
    const light = new THREE.PointLight(0xff7a1a, 0, 46, 1.8);
    light.position.set(0, 4, 0);
    g.add(light);
    g.visible = false;
    scene.add(g);
    slots.push({ g, flames, smoke, light });
  }
  return {
    sync(burning, t) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const b = burning[i];
        if (!b) { slot.g.visible = false; slot.light.intensity = 0; continue; }
        slot.g.visible = true;
        const sinkK = Math.min(1, b.k || 0);
        const fade = 1 - sinkK; // flames die as the hull goes under
        const wh = waveHeight(b.x, b.z, t);
        // The fire rides the deck down — same drop law as the hull.
        slot.g.position.set(b.x, wh + 1.5 - sinkDropK(sinkK), b.z);
        for (const f of slot.flames) {
          const fl = 0.75 + 0.25 * Math.sin(t * 11 + f.phase) * Math.sin(t * 5.3 + f.phase * 2);
          const sc = f.base * fl * (0.4 + 0.6 * fade);
          f.s.scale.set(sc, sc * 1.5, 1);
          f.s.material.opacity = 0.95 * fade;
        }
        slot.smoke.position.y = 9 + Math.sin(t * 0.8 + i) * 1.5;
        slot.smoke.material.opacity = 0.4 * fade;
        const sm = 10 + Math.sin(t * 0.9 + i * 2) * 2;
        slot.smoke.scale.set(sm, sm * 1.3, 1);
        slot.light.intensity = (26 + 12 * Math.sin(t * 13 + i * 3.1) * Math.sin(t * 5.7 + i)) * fade;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Kraken — one pooled group, driven by world.kraken.
// ---------------------------------------------------------------------------

/** Deterministic RNG (mulberry32) — the kraken / sea-life look is fixed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KRAKEN_TAU = Math.PI * 2;

/** Mottled dark red-green hide for the kraken body (procedural). */
function krakenHideTexture(seed) {
  const rng = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a1f1a'; g.fillRect(0, 0, 256, 256);
  const blotches = ['#3d2a1e', '#1e3326', '#4a1f1a', '#26331f', '#33241c'];
  for (let i = 0; i < 90; i++) {
    g.fillStyle = blotches[Math.floor(rng() * blotches.length)];
    g.globalAlpha = 0.25 + rng() * 0.45;
    const r = 6 + rng() * 26;
    g.beginPath();
    g.ellipse(rng() * 256, rng() * 256, r, r * (0.5 + rng() * 0.8), rng() * Math.PI, 0, KRAKEN_TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}

/**
 * One tentacle: 8 nested tapered cylinder segments so it can whip
 * and curl (each pivot bends a little more than the last).
 */
function buildTentacle(mat, length, baseR) {
  const root = new THREE.Group();
  const segs = [];
  const N = 8;
  const segLen = length / N;
  let parent = root;
  for (let i = 0; i < N; i++) {
    const r0 = baseR * (1 - (i / N) * 0.85);
    const r1 = baseR * (1 - ((i + 1) / N) * 0.85);
    const pivot = new THREE.Group();
    pivot.position.y = i === 0 ? 0 : segLen;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segLen * 1.15, 7), mat);
    mesh.position.y = segLen / 2;
    pivot.add(mesh);
    parent.add(pivot);
    segs.push(pivot);
    parent = pivot;
  }
  return { root, segs };
}

/**
 * The kraken. Returns { group, sync(kraken, t) }.
 * kraken: null | { state:'warning'|'attack'|'dying', x, z, t, hits, hp,
 *   tentacles:[{angle, phase} x6] } — missing fields render nothing
 *   for that part, never crash. State timing is tracked internally
 *   from the frame clock t, so it works whatever kraken.t means.
 */
export function createKraken(scene) {
  const group = new THREE.Group();
  group.visible = false;

  // Dark water disc — the warning ring the tentacles rise out of.
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x06110c, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(25, 32), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.4;
  group.add(disc);

  // Central body dome — only in attack / dying.
  const bodyMat = new THREE.MeshStandardMaterial({
    map: krakenHideTexture(4242), color: 0xffffff, roughness: 0.9,
    emissive: new THREE.Color(0x1a0505), emissiveIntensity: 0.4,
  });
  const body = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 12, 0, KRAKEN_TAU, 0, Math.PI / 2), bodyMat);
  dome.scale.y = 0.75;
  dome.position.y = 0;
  body.add(dome);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xe8f5d0, emissive: new THREE.Color(0xd8ffb0), emissiveIntensity: 1.6, roughness: 0.3,
  });
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 10), eyeMat);
    eye.position.set(sx * 3.4, 4.2, 7.2);
    body.add(eye);
    eyes.push(eye);
  }
  body.visible = false;
  group.add(body);

  // Six tentacles, seeded so the beast looks the same every voyage.
  const rng = mulberry32(1337);
  const tentMat = new THREE.MeshStandardMaterial({
    color: 0x2a3d2a, roughness: 0.85,
    emissive: new THREE.Color(0x0a1a10), emissiveIntensity: 0.5,
  });
  const tentacles = [];
  for (let i = 0; i < 6; i++) {
    const len = 14 + rng() * 5;
    const tn = buildTentacle(tentMat, len, 1.3 + rng() * 0.3);
    tn.baseAngle = (i / 6) * KRAKEN_TAU;
    tn.basePhase = rng() * KRAKEN_TAU;
    tn.len = len;
    group.add(tn.root);
    tentacles.push(tn);
  }

  scene.add(group);
  let prevState = null;
  let stateStartT = 0;

  return {
    group,
    sync(kraken, t) {
      if (!kraken || !kraken.state || typeof kraken.x !== 'number' || typeof kraken.z !== 'number') {
        group.visible = false;
        prevState = null;
        return;
      }
      if (kraken.state !== prevState) { prevState = kraken.state; stateStartT = t; }
      const elapsed = Math.max(0, t - stateStartT);
      const wh = waveHeight(kraken.x, kraken.z, t);
      group.visible = true;
      group.position.set(kraken.x, wh, kraken.z);

      const data = Array.isArray(kraken.tentacles) ? kraken.tentacles : null;
      if (kraken.state === 'warning') {
        const rise = Math.min(1, elapsed / 2);
        disc.visible = true;
        discMat.opacity = 0.55;
        body.visible = false;
        group.position.y = wh;
        for (let i = 0; i < tentacles.length; i++) {
          const tn = tentacles[i];
          const d = data && data[i] ? data[i] : null;
          const a = d && typeof d.angle === 'number' ? d.angle : tn.baseAngle;
          const phase = d && typeof d.phase === 'number' ? d.phase : tn.basePhase;
          const rad = 13 + (i % 2) * 4;
          tn.root.position.set(Math.cos(a) * rad, -4 + rise * 4, Math.sin(a) * rad);
          tn.root.scale.y = 0.3 + 0.7 * rise;
          // Swaying, tips above the water.
          const lean = 0.25 + 0.12 * Math.sin(t * 0.8 + phase);
          tn.root.rotation.x = Math.sin(a) * lean;
          tn.root.rotation.z = -Math.cos(a) * lean;
          for (let s = 0; s < tn.segs.length; s++) {
            tn.segs[s].rotation.x = Math.sin(t * 1.1 + phase + s * 0.55) * 0.16;
            tn.segs[s].rotation.z = Math.cos(t * 0.9 + phase + s * 0.5) * 0.14;
          }
        }
      } else if (kraken.state === 'attack') {
        const rise = Math.min(1, elapsed / 1.2);
        disc.visible = true;
        discMat.opacity = 0.55;
        body.visible = true;
        body.position.y = -3 + rise * 3;
        body.scale.setScalar(0.6 + 0.4 * rise);
        // Eyes flare when the beast has taken hits.
        const hits = typeof kraken.hits === 'number' ? kraken.hits : 0;
        eyeMat.emissiveIntensity = 1.6 + Math.min(1.5, hits * 0.2);
        for (let i = 0; i < tentacles.length; i++) {
          const tn = tentacles[i];
          const d = data && data[i] ? data[i] : null;
          const a = d && typeof d.angle === 'number' ? d.angle : tn.baseAngle;
          const phase = d && typeof d.phase === 'number' ? d.phase : tn.basePhase;
          const rad = 12 + (i % 2) * 5;
          tn.root.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
          tn.root.scale.y = 1;
          // Lashing: the whole tentacle whips, and the tip curls down
          // to slap the water on its cycle.
          const whip = Math.sin(t * 2.6 + phase);
          const dip = Math.max(0, Math.sin(t * 0.9 + phase * 2));
          const lean = 0.35 + whip * 0.35 + dip * 0.55;
          tn.root.rotation.x = Math.sin(a) * lean;
          tn.root.rotation.z = -Math.cos(a) * lean;
          for (let s = 0; s < tn.segs.length; s++) {
            tn.segs[s].rotation.x = Math.sin(t * 3.2 + phase + s * 0.6) * 0.4 + dip * s * 0.16;
            tn.segs[s].rotation.z = Math.cos(t * 2.8 + phase + s * 0.55) * 0.35;
          }
        }
      } else { // 'dying' (and any unknown state: sink away, never crash)
        const sink = Math.min(1, elapsed / 2.5);
        disc.visible = true;
        discMat.opacity = 0.55 * (1 - sink);
        body.visible = sink < 0.85;
        body.position.y = -sink * 9;
        group.position.y = wh - sink * 3;
        for (let i = 0; i < tentacles.length; i++) {
          const tn = tentacles[i];
          const d = data && data[i] ? data[i] : null;
          const a = d && typeof d.angle === 'number' ? d.angle : tn.baseAngle;
          const phase = d && typeof d.phase === 'number' ? d.phase : tn.basePhase;
          const rad = 13 + (i % 2) * 4;
          tn.root.position.set(Math.cos(a) * rad, -sink * 6, Math.sin(a) * rad);
          tn.root.scale.y = 1 - sink * 0.75;
          const lean = 0.2 + 0.1 * Math.sin(t * 0.7 + phase);
          tn.root.rotation.x = Math.sin(a) * lean;
          tn.root.rotation.z = -Math.cos(a) * lean;
          for (let s = 0; s < tn.segs.length; s++) {
            tn.segs[s].rotation.x = Math.sin(t * 0.8 + phase + s * 0.5) * 0.12 * (1 - sink);
            tn.segs[s].rotation.z = Math.cos(t * 0.7 + phase + s * 0.5) * 0.1 * (1 - sink);
          }
        }
        if (sink >= 1) group.visible = false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Mega souls — gold, 2.5x normal wisps. Mirrors createSoulPool.
// ---------------------------------------------------------------------------

export function createMegaSoulPool(scene, max = 5) {
  const tex = radialTexture('rgba(255,220,110,1)', 'rgba(255,170,20,0)', 128);
  const items = [];
  for (let i = 0; i < max; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    s.visible = false;
    scene.add(s);
    items.push(s);
  }
  return {
    sync(megaSouls, t) {
      if (!Array.isArray(megaSouls)) { for (const s of items) s.visible = false; return; }
      for (const s of items) s.visible = false;
      for (let i = 0; i < Math.min(megaSouls.length, max); i++) {
        const w = megaSouls[i];
        if (!w || typeof w.x !== 'number' || typeof w.z !== 'number') continue;
        const m = items[i];
        const phase = typeof w.phase === 'number' ? w.phase : i * 1.7;
        m.visible = true;
        // Slower pulse, gentle rise-and-fall, 2.5x a normal wisp.
        m.position.set(w.x, waveHeight(w.x, w.z, t) + 3 + Math.sin(t * 1.2 + phase) * 1.1, w.z);
        const sc = 6.5 + Math.sin(t * 1.6 + phase) * 0.9;
        m.scale.set(sc, sc, 1);
        m.material.opacity = Math.min(0.98, (typeof w.life === 'number' ? w.life : 6) / 6);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Seagulls — 2 flocks of 3, circling the two nearest-to-spawn islands
// (islands[0] and islands[1] by index — deterministic). Pure function
// of t; the page calls sync(t) every frame.
// ---------------------------------------------------------------------------

function buildGull() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 6), white);
  body.rotation.x = Math.PI / 2; // point forward (+Z)
  body.scale.set(1, 1, 0.45); // flattened — applied after rotation, flattens Y
  g.add(body);
  const wings = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.2, 0.05, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.55), white);
    wing.position.x = s * 0.85;
    pivot.add(wing);
    g.add(pivot);
    wings.push({ pivot, side: s });
  }
  return { group: g, wings };
}

export function createGulls(scene, islands) {
  const group = new THREE.Group();
  const flocks = [];
  const list = Array.isArray(islands) ? islands : [];
  for (let f = 0; f < 2; f++) {
    const isl = list[f];
    if (!isl || typeof isl.x !== 'number' || typeof isl.z !== 'number') continue;
    const flock = {
      cx: isl.x, cz: isl.z,
      radius: (typeof isl.r === 'number' ? isl.r : 60) + 25,
      height: 25 + f * 8,
      phase0: f * 2.4,
      gulls: [],
    };
    for (let k = 0; k < 3; k++) {
      const gull = buildGull();
      gull.phase = (k / 3) * KRAKEN_TAU;
      group.add(gull.group);
      flock.gulls.push(gull);
    }
    flocks.push(flock);
  }
  scene.add(group);
  return {
    group,
    sync(t) {
      for (const flock of flocks) {
        for (const gull of flock.gulls) {
          const a = flock.phase0 + t * 0.15 + gull.phase;
          const x = flock.cx + Math.cos(a) * flock.radius;
          const z = flock.cz + Math.sin(a) * flock.radius;
          gull.group.position.set(x, flock.height + Math.sin(t * 0.9 + gull.phase) * 2, z);
          // Face along the circle (tangent).
          gull.group.rotation.y = -a;
          const flap = Math.sin(t * 6 + gull.phase * 3) * 0.7;
          for (const w of gull.wings) {
            w.pivot.rotation.z = w.side > 0 ? flap : -flap;
          }
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Sea life — dolphins / flying fish breaching near the player.
// Seeded schedule (fixed seed 1337): a breach every 45–90 s, one at a
// time, arcing ~1.2 s and peaking ~4 m, then a small splash.
// ---------------------------------------------------------------------------

export function createSeaLife(scene) {
  const rng = mulberry32(1337);
  const group = new THREE.Group();

  // Dolphin: dark grey elongated body + dorsal fin, ~3 m.
  const dolphin = new THREE.Group();
  {
    const grey = new THREE.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.6 });
    const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), grey);
    bodyM.scale.set(0.8, 0.8, 2.8);
    dolphin.add(bodyM);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 4), grey);
    fin.position.set(0, 0.55, 0.2);
    fin.scale.set(1, 1, 0.25);
    fin.rotation.x = -0.4;
    dolphin.add(fin);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.5), grey);
    tail.position.set(0, 0.05, -1.6);
    dolphin.add(tail);
  }
  // Flying fish: a small silver dart.
  const fish = new THREE.Group();
  {
    const silver = new THREE.MeshStandardMaterial({
      color: 0xc8d4d8, roughness: 0.3, metalness: 0.7,
    });
    const bodyM = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.4, 6), silver);
    bodyM.rotation.x = Math.PI / 2;
    fish.add(bodyM);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.4), silver);
    wing.position.set(0, 0.12, 0.1);
    fish.add(wing);
  }
  dolphin.visible = false;
  fish.visible = false;
  group.add(dolphin, fish);

  const splashTex = radialTexture('rgba(220,240,250,0.95)', 'rgba(220,240,250,0)', 128);
  const splash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: splashTex, transparent: true, opacity: 0, depthWrite: false,
  }));
  splash.visible = false;
  scene.add(splash);
  scene.add(group);

  let nextBreachT = null;
  let active = null; // { startT, x, z, bearing, kind, endX, endZ }
  let splashT = -1e9;
  let splashX = 0, splashZ = 0;

  return {
    group,
    sync(t, playerX, playerZ) {
      const px = typeof playerX === 'number' ? playerX : 0;
      const pz = typeof playerZ === 'number' ? playerZ : 0;
      if (nextBreachT === null) nextBreachT = t + 45 + rng() * 45;

      // Start a breach when its time comes (never more than one).
      if (!active && t >= nextBreachT) {
        const kind = rng() < 0.6 ? 'dolphin' : 'fish';
        const bearing = rng() * KRAKEN_TAU;
        const dist = 40 + rng() * 40;
        active = {
          startT: t, kind, bearing,
          x: px + Math.sin(bearing) * dist,
          z: pz + Math.cos(bearing) * dist,
        };
      }

      if (active) {
        const p = (t - active.startT) / 1.2;
        if (p >= 1) {
          // Re-entry: hide the creature, pop a small splash, schedule next.
          splashX = active.x + Math.sin(active.bearing) * 10;
          splashZ = active.z + Math.cos(active.bearing) * 10;
          splashT = t;
          dolphin.visible = false;
          fish.visible = false;
          active = null;
          nextBreachT = t + 45 + rng() * 45;
        } else {
          const cx = active.x + Math.sin(active.bearing) * 10 * p;
          const cz = active.z + Math.cos(active.bearing) * 10 * p;
          const wh = waveHeight(cx, cz, t);
          const y = wh + 4 * Math.sin(Math.PI * p) + 0.4;
          const creature = active.kind === 'dolphin' ? dolphin : fish;
          creature.visible = true;
          (active.kind === 'dolphin' ? fish : dolphin).visible = false;
          creature.position.set(cx, y, cz);
          creature.rotation.y = active.bearing;
          // Nose up on the way out, nose down on the way back in.
          creature.rotation.x = -Math.cos(Math.PI * p) * 0.6;
        }
      }

      // Splash fades over ~0.6 s after re-entry.
      const sk = (t - splashT) / 0.6;
      if (sk >= 0 && sk < 1) {
        splash.visible = true;
        splash.position.set(splashX, waveHeight(splashX, splashZ, t) + 1, splashZ);
        splash.material.opacity = 0.9 * (1 - sk);
        const sc = 4 + sk * 5;
        splash.scale.set(sc, sc * 1.3, 1);
      } else {
        splash.visible = false;
      }
    },
  };
}
