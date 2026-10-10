/*
 * STAR WARS pocket universe — zone builder.
 *
 * buildZone(THREE, planetDef, T) assembles a full zone scene graph from a
 * plain-data planet definition. Decoupled from data.js: planetDef is just an
 * object shaped like:
 *   { id, sky, fog, fogDensity, ground, ground2, tex, groundAmp, seed,
 *     kind: 'walk' | 'fly',
 *     landmarks: [{ type, x, z, s, ry? }],
 *     ambient:   [{ type, count }],
 *     beat: { checkpoints?: [{ x, z, r, label }], target?: { x, z, r, label } } }
 *
 * Returns:
 *   { group, colliders, spawn, bounds, groundHeight, checkpoints, target,
 *     update, dispose, kind, sky, fog }
 *   - colliders: world-space [{x, z, r}] (landmark-local circles rotated by ry,
 *     scaled by s, offset by landmark x/z).
 *   - checkpoints / target: {x, z, r, label}. Fly-zone rings sit at y≈0 so a
 *     2D horizontal distance check works.
 *   - sky / fog are extras for the page shell (scene.background + FogExp2).
 */
import * as ThreeJS from 'three';
import { buildLandmark, buildAmbient } from './landmarks.js';

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

/* Integer-lattice hash -> [0,1). */
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

/* Radial disc geometry (CircleGeometry has no interior verts for displacement). */
function makeDiscGeometry(R, radius, rings, segs, heightAt) {
  const positions = [], uvs = [], indices = [];
  for (let ri = 0; ri <= rings; ri++) {
    const r = (ri / rings) * radius;
    for (let si = 0; si <= segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      positions.push(x, heightAt(x, z), z);
      uvs.push(x / radius * 0.5 + 0.5, z / radius * 0.5 + 0.5);
    }
  }
  const row = segs + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * row + si, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, b, c, b, d, c); // +y winding
    }
  }
  const g = new R.BufferGeometry();
  g.setAttribute('position', new R.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new R.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

const TEX_BY_NAME = {
  sand: 'sandTexture', rock: 'rockTexture', ice: 'iceTexture', lava: 'lavaTexture',
  metal: 'metalTexture', leaf: 'leafTexture', water: 'waterTexture', salt: 'saltTexture',
  swamp: 'swampTexture', city: 'cityTexture',
};

export function buildZone(THREE, planetDef, T) {
  const R = R3(THREE);
  const def = planetDef || {};
  const kind = def.kind === 'fly' ? 'fly' : 'walk';
  const seed = (def.seed >>> 0) || 1337;
  const group = new R.Group();
  const colliders = [];
  const updaters = [];
  const extraTextures = [];

  const amp = def.groundAmp != null ? def.groundAmp : 2.5;
  /* Pure height function — shared by geometry displacement and groundHeight. */
  const heightAt = function (x, z) {
    if (kind !== 'walk') return 0;
    return (fbm2(x * 0.018, z * 0.018, seed) - 0.5) * 2 * amp;
  };

  /* ---------- atmosphere: fog + hemisphere/directional per zone ---------- */
  const skyHex = def.sky != null ? def.sky : (kind === 'walk' ? 0x87b5e0 : 0x05070f);
  const fogHex = def.fog != null ? def.fog : skyHex;
  const fogDensity = def.fogDensity != null ? def.fogDensity : (kind === 'walk' ? 0.0075 : 0.0);
  if (kind === 'walk') {
    group.add(new R.HemisphereLight(skyHex, def.ground != null ? def.ground : 0x8a6f4d, 0.85));
    const sun = new R.DirectionalLight(0xfff2dd, 1.25);
    sun.position.set(60, 110, 35);
    group.add(sun);
  } else {
    group.add(new R.HemisphereLight(0x8899ff, 0x111122, 0.5));
    const sun = new R.DirectionalLight(0xcfe0ff, 0.9);
    sun.position.set(-40, 80, 60);
    group.add(sun);
  }

  /* ---------- terrain (walk) / starfield (fly) ---------- */
  if (kind === 'walk') {
    const makerName = TEX_BY_NAME[def.tex] || 'sandTexture';
    const gtex = T[makerName]();
    extraTextures.push(gtex);
    gtex.repeat.set(28, 28);
    const terrain = new R.Mesh(
      makeDiscGeometry(R, 130, 22, 48, heightAt),
      new R.MeshStandardMaterial({
        color: def.ground != null ? def.ground : 0xc9a06a,
        map: gtex, roughness: 1, metalness: 0,
      })
    );
    terrain.castShadow = false; terrain.receiveShadow = false;
    group.add(terrain);
  } else {
    const N = 1600, pos = new Float32Array(N * 3), rand = mulberry32(seed ^ 0x9e37);
    for (let i = 0; i < N; i++) {
      const r = 500 + rand() * 500;
      const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.9 - 40;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new R.BufferGeometry();
    sg.setAttribute('position', new R.BufferAttribute(pos, 3));
    group.add(new R.Points(sg, new R.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false,
    })));
  }

  /* ---------- landmarks (colliders -> world space) ---------- */
  const landmarkDefs = Array.isArray(def.landmarks) ? def.landmarks : [];
  for (const ld of landmarkDefs) {
    let built;
    try { built = buildLandmark(ld.type, R, T); }
    catch (e) { continue; } // unknown type: skip, keep the zone alive
    const s = ld.s || 1, ry = ld.ry || 0;
    built.group.position.set(ld.x || 0, kind === 'walk' ? heightAt(ld.x || 0, ld.z || 0) : 0, ld.z || 0);
    built.group.rotation.y = ry;
    built.group.scale.setScalar(s);
    group.add(built.group);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (const c of built.colliders) {
      colliders.push({
        x: (ld.x || 0) + (c.x * cos + c.z * sin) * s,
        z: (ld.z || 0) + (-c.x * sin + c.z * cos) * s,
        r: c.r * s,
      });
    }
  }

  /* ---------- ambient creatures (seeded scatter, clear of landmarks) ---------- */
  const ambientDefs = Array.isArray(def.ambient) ? def.ambient : [];
  const arand = mulberry32(seed ^ 0x51f7);
  function clearOfLandmarks(x, z, pad) {
    for (const c of colliders) {
      const dx = x - c.x, dz = z - c.z, rr = c.r + pad;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }
  for (const ad of ambientDefs) {
    const n = ad.count | 0;
    for (let i = 0; i < n; i++) {
      let px = 0, pz = 0, ok = false;
      for (let tries = 0; tries < 14 && !ok; tries++) {
        const a = arand() * Math.PI * 2, r = 14 + arand() * 86;
        px = Math.cos(a) * r; pz = Math.sin(a) * r;
        ok = clearOfLandmarks(px, pz, 4);
      }
      if (!ok) continue;
      try {
        const amb = buildAmbient(ad.type, R, T);
        amb.group.position.set(px, heightAt(px, pz), pz);
        group.add(amb.group);
        updaters.push(function (t, dt) { amb.update(t, dt); });
      } catch (e) { /* unknown ambient: skip */ }
    }
  }

  /* ---------- checkpoint rings ---------- */
  const checkpoints = [];
  const beat = def.beat || {};
  const cpDefs = Array.isArray(beat.checkpoints) ? beat.checkpoints : [];
  function makeLabel(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(8,10,18,0.72)';
      ctx.fillRect(0, 8, 256, 48);
      ctx.strokeStyle = '#ffcf5e'; ctx.lineWidth = 3;
      ctx.strokeRect(2, 10, 252, 44);
      ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(text).slice(0, 18), 128, 33);
    }
    const tex = new R.CanvasTexture(cv);
    tex.colorSpace = R.SRGBColorSpace;
    extraTextures.push(tex);
    const sp = new R.Sprite(new R.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(14, 3.5, 1);
    return sp;
  }
  for (const cp of cpDefs) {
    const cy = kind === 'walk' ? heightAt(cp.x, cp.z) + 6 : 0;
    const ring = new R.Mesh(
      new R.TorusGeometry(4, 0.28, 10, 40),
      new R.MeshStandardMaterial({
        color: 0xffc63a, emissive: 0xff9d00, emissiveIntensity: 1.4,
        roughness: 0.4, metalness: 0.3,
      })
    );
    ring.position.set(cp.x, cy, cp.z);
    ring.castShadow = false; ring.receiveShadow = false;
    group.add(ring);
    let label = null;
    if (cp.label) {
      label = makeLabel(cp.label);
      label.position.set(cp.x, cy + 5.5, cp.z);
      group.add(label);
    }
    const phase = cp.x * 1.7 + cp.z;
    updaters.push(function (t, dt) {
      ring.rotation.y += dt * 1.2;
      ring.position.y = cy + Math.sin(t * 1.6 + phase) * 0.5;
      if (label) label.position.y = cy + 5.5 + Math.sin(t * 1.6 + phase) * 0.5;
    });
    checkpoints.push({ x: cp.x, z: cp.z, r: cp.r || 5, label: cp.label || '' });
  }

  /* ---------- target: light pillar + ground ring ---------- */
  let target = null;
  if (beat.target) {
    const tg = beat.target;
    const ty = heightAt(tg.x, tg.z);
    const pillar = new R.Mesh(
      new R.CylinderGeometry(1.4, 2.2, 70, 12, 1, true),
      new R.MeshBasicMaterial({
        color: 0x9fdcff, transparent: true, opacity: 0.28,
        blending: R.AdditiveBlending, side: R.DoubleSide, depthWrite: false, fog: false,
      })
    );
    pillar.position.set(tg.x, ty + 32, tg.z);
    group.add(pillar);
    const gring = new R.Mesh(
      new R.TorusGeometry(tg.r || 6, 0.3, 8, 48),
      new R.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.7, fog: false })
    );
    gring.rotation.x = -Math.PI / 2;
    gring.position.set(tg.x, ty + 0.4, tg.z);
    group.add(gring);
    updaters.push(function (t) {
      pillar.material.opacity = 0.22 + Math.sin(t * 2.2) * 0.08;
      gring.rotation.z += 0.004;
    });
    target = { x: tg.x, z: tg.z, r: tg.r || 6, label: tg.label || '' };
  }

  /* ---------- emissive pulse: anything tagged userData.pulse ---------- */
  group.traverse(function (o) {
    if ((o.isMesh || o.isSprite) && o.userData && o.userData.pulse && o.material) {
      const m = o.material;
      const base = (m.opacity == null ? 1 : m.opacity);
      const ph = (o.position.x * 1.3 + o.position.z) % 6.28;
      updaters.push(function (t) { m.opacity = base * (0.82 + 0.18 * Math.sin(t * 2 + ph)); });
    }
  });

  const spawn = kind === 'walk'
    ? { x: 0, z: 95, yaw: Math.PI }
    : { x: 0, z: 120, yaw: Math.PI };
  const bounds = kind === 'walk'
    ? { kind: 'circle', max: 115 }
    : { kind: 'circle', max: 150 };

  function update(t, dt) {
    for (const u of updaters) u(t, dt);
  }

  function dispose() {
    group.traverse(function (o) {
      if (o.isMesh || o.isPoints || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          if (m.map) { try { m.map.dispose(); } catch (e) { /* noop */ } }
          try { m.dispose(); } catch (e) { /* noop */ }
        }
      }
    });
    for (const t of extraTextures) { try { t.dispose(); } catch (e) { /* noop */ } }
  }

  return {
    group: group,
    colliders: colliders,
    spawn: spawn,
    bounds: bounds,
    groundHeight: heightAt,
    checkpoints: checkpoints,
    target: target,
    update: update,
    dispose: dispose,
    /* extras for the page shell (scene setup) */
    kind: kind,
    sky: skyHex,
    fog: { color: fogHex, density: fogDensity },
  };
}
