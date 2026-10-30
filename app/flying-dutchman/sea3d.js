// The cursed sea — actual ocean, storm sky, and battle effects (three.js).
//
// - Ocean: a CPU-displaced plane that follows the camera, using the SAME
//   waveHeight() as the engine so ships ride the visible waves.
// - Foam caps via vertex colors; moon specular via Phong material.
// - Night storm sky: gradient dome, stars, moon, lightning, rain.
// - Pools: cannonballs, muzzle flashes, splashes, soul wisps.

import * as THREE from 'three';
import { waveHeight, SHIP } from './engine.js';

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
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide, fog: false })
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
    group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe8ff, size: 3.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  }

  // moon
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(235,244,255,1)', 'rgba(235,244,255,0)', 256),
    fog: false, transparent: true, opacity: 0.95,
  }));
  moon.scale.set(320, 320, 1);
  moon.position.set(-1400, 1500, -2200);
  group.add(moon);
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
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fc4d8, size: 1.6, transparent: true, opacity: 0.5 }));
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
    group.position.y -= k * 9;
    group.rotation.z += k * 0.55;
    group.rotation.x -= k * 0.3;
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

export function createSoulPool(scene, max = 40) {
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
