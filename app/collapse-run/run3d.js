// app/collapse-run/run3d.js — three.js renderer for Collapse Run.
// The world slides past a fixed runner: tiles are placed relative to the
// runner's distance, curving with the path. Pure render; all game state
// comes from engine.js.

import * as THREE from 'three';
import { pathCurve, TILE_M, TRACK_HALF } from './engine.js';
import {
  wrapForLevel, WRAP_SLOT_FLOOR, WRAP_SLOT_OBSTRUCTION, WRAP_SLOT_SOLID,
} from './textures.js';

const TILE_W = 6.4;

// ---------------------------------------------------------------------------
// Vortex-graphic texture cache (Merlin, 2026-10-29): one graphic per realm
// per surface — floor tiles, obstruction cubes, solid cubes. Loaded lazily
// per level, LRU-capped so 100 realms don't bloat GPU memory.
// ---------------------------------------------------------------------------
const TEX_CACHE = new Map(); // url -> THREE.Texture
const TEX_LOADING = new Map(); // url -> Promise<THREE.Texture|null>
const TEX_CACHE_MAX = 40;

function loadVortexTexture(url) {
  if (!url) return Promise.resolve(null);
  const hit = TEX_CACHE.get(url);
  if (hit) return Promise.resolve(hit);
  const inflight = TEX_LOADING.get(url);
  if (inflight) return inflight;
  const p = new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        TEX_CACHE.set(url, tex);
        while (TEX_CACHE.size > TEX_CACHE_MAX) {
          const oldest = TEX_CACHE.keys().next().value;
          const t = TEX_CACHE.get(oldest);
          TEX_CACHE.delete(oldest);
          if (t) t.dispose();
        }
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  }).finally(() => TEX_LOADING.delete(url));
  TEX_LOADING.set(url, p);
  return p;
}

// Circular character badge from a preview PNG (previews are RGB-on-black,
// no alpha — the feathered circular clip handles that, same treatment as
// the vortex rider medallion).
function makeCharacterTexture(img) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  g.clip();
  const scale = Math.max(S / img.width, S / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  g.restore();
  g.globalCompositeOperation = 'destination-in';
  const feather = g.createRadialGradient(S / 2, S / 2, S / 2 - 26, S / 2, S / 2, S / 2);
  feather.addColorStop(0, 'rgba(0,0,0,1)');
  feather.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = feather;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRunRenderer(mount, palette) {
  const W = () => mount.clientWidth || window.innerWidth;
  const H = () => mount.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H());
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.skyTop);
  scene.fog = new THREE.Fog(new THREE.Color(palette.fog), 30, 110);

  const camera = new THREE.PerspectiveCamera(70, W() / H(), 0.1, 220);
  const baseFov = 70;

  // Lights.
  const amb = new THREE.AmbientLight(0xffffff, 0.75);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(6, 12, 4);
  scene.add(amb, dir);

  // Stars.
  const starGeo = new THREE.BufferGeometry();
  {
    const n = 400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 300;
      pos[i * 3 + 1] = 10 + Math.random() * 120;
      pos[i * 3 + 2] = -Math.random() * 220;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const starMat = new THREE.PointsMaterial({ color: new THREE.Color(palette.star), size: 0.7, sizeAttenuation: true });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Tile pool.
  const tileGeo = new THREE.BoxGeometry(TILE_W, 0.6, TILE_M + 0.06);
  const tileMeshes = new Map(); // tileIndex -> { mesh, fallT }
  const tileMat = (color) => new THREE.MeshLambertMaterial({ color, transparent: true });

  // Obstacle pool.
  const obsGeo = new THREE.BoxGeometry(1.4, 1.6, 1.4);
  const solidGeo = new THREE.BoxGeometry(2.2, 2.4, 2.2);
  const obsMeshes = new Map(); // obstacle object -> mesh

  // The runner: the user's selected character as a floating badge;
  // falls back to the glowing capsule when no character is picked.
  const runnerGeo = new THREE.CapsuleGeometry(0.42, 0.9, 6, 14);
  const runnerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.runner) });
  const runner = new THREE.Mesh(runnerGeo, runnerMat);
  runner.position.y = 1.1;
  scene.add(runner);
  const runnerSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthWrite: false })
  );
  runnerSprite.scale.set(1.7, 1.7, 1);
  runnerSprite.position.y = 1.1;
  runnerSprite.visible = false;
  scene.add(runnerSprite);
  let characterUrl = null;
  // Soft glow disc under the runner.
  const glowGeo = new THREE.CircleGeometry(0.9, 24);
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(palette.runner), transparent: true, opacity: 0.35,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  scene.add(glow);

  /** Swap the runner to the user's selected character (preview URL). */
  function setCharacter(previewUrl) {
    if (!previewUrl || previewUrl === characterUrl) return;
    characterUrl = previewUrl;
    const img = new Image();
    img.onload = () => {
      try {
        const tex = makeCharacterTexture(img);
        runnerSprite.material.map = tex;
        runnerSprite.material.needsUpdate = true;
        runnerSprite.visible = true;
        runner.visible = false;
      } catch { /* capsule stands */ }
    };
    img.onerror = () => { /* capsule stands */ };
    img.src = previewUrl;
  }

  let pal = palette;
  let level = palette.level || 1;
  const tileTopColor = new THREE.Color(pal.tileTop);
  const tileSideColor = new THREE.Color(pal.tileSide);
  // Live textures for this realm (null until the async load lands).
  let floorTex = null;
  let obstructionTex = null;
  let solidTex = null;

  // Paint every live tile / cube with the realm's graphics once loaded.
  // Stale guard: a slow load from a previous realm never overwrites the new one.
  function paintRealmGraphics(lv) {
    const jobs = [
      { url: wrapForLevel(lv, WRAP_SLOT_FLOOR), apply: (tex) => {
        floorTex = tex;
        for (const { mesh } of tileMeshes.values()) {
          mesh.material.map = tex;
          mesh.material.color.set(0xffffff);
          mesh.material.needsUpdate = true;
        }
      } },
      { url: wrapForLevel(lv, WRAP_SLOT_OBSTRUCTION), apply: (tex) => {
        obstructionTex = tex;
        for (const m of obsMeshes.values()) {
          if (m.userData.kind !== 'solid') {
            m.material.map = tex;
            m.material.color.set(0xffffff);
            m.material.needsUpdate = true;
          }
        }
      } },
      { url: wrapForLevel(lv, WRAP_SLOT_SOLID), apply: (tex) => {
        solidTex = tex;
        for (const m of obsMeshes.values()) {
          if (m.userData.kind === 'solid') {
            m.material.map = tex;
            m.material.color.set(0xffffff);
            m.material.needsUpdate = true;
          }
        }
      } },
    ];
    for (const { url, apply } of jobs) {
      loadVortexTexture(url).then((tex) => {
        if (tex && lv === level) apply(tex);
      });
    }
  }

  function setPalette(p) {
    pal = p;
    level = p.level || 1;
    scene.background.set(p.skyTop);
    scene.fog.color.set(p.fog);
    starMat.color.set(p.star);
    tileTopColor.set(p.tileTop);
    tileSideColor.set(p.tileSide);
    runnerMat.color.set(p.runner);
    glowMat.color.set(p.runner);
    // Reset to flat realm colors first; the graphics paint over when loaded.
    floorTex = obstructionTex = solidTex = null;
    for (const { mesh } of tileMeshes.values()) {
      mesh.material.map = null;
      mesh.material.color.copy(tileTopColor);
      mesh.material.needsUpdate = true;
    }
    for (const m of obsMeshes.values()) {
      m.material.map = null;
      if (m.userData.kind === 'solid') m.material.color.set(p.solid);
      else m.material.color.set(p.obstacle);
      m.material.needsUpdate = true;
    }
    paintRealmGraphics(level);
  }

  function tileWorld(idx, runnerD) {
    const td = idx * TILE_M;
    return {
      x: pathCurve(td) - pathCurve(runnerD),
      z: -(td - runnerD),
      d: td,
    };
  }

  function update(g, dt, time) {
    const rd = g.distance;
    const rc = pathCurve(rd);

    // Runner (character badge floats where the capsule did).
    const bobY = 1.1 + Math.abs(Math.sin(time * 9)) * 0.12 * Math.min(1, g.speed / 9);
    runner.position.x = g.lateral;
    runner.position.y = bobY;
    runner.rotation.z = -g.lateralVel * 0.03;
    runnerSprite.position.x = g.lateral;
    runnerSprite.position.y = bobY + 0.15;
    runnerSprite.material.rotation = -g.lateralVel * 0.02;
    glow.position.set(g.lateral, 0.32, 0);

    // Camera: behind and above, swinging into the curves ahead.
    const aheadX = pathCurve(rd + 14) - rc;
    camera.position.set(g.lateral * 0.55, 4.6, 7.5);
    camera.lookAt(aheadX * 0.7, 0.8, -12);
    const targetFov = g.sprinting ? 84 : baseFov;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();

    // Tiles.
    const seen = new Set();
    for (const [idx, st] of g.tiles) {
      const { x, z } = tileWorld(idx, rd);
      if (z > 12 || z < -105) continue;
      seen.add(idx);
      let rec = tileMeshes.get(idx);
      if (!rec) {
        const mat = tileMat(tileTopColor.clone());
        if (floorTex) { mat.map = floorTex; mat.color.set(0xffffff); }
        const mesh = new THREE.Mesh(tileGeo, mat);
        scene.add(mesh);
        rec = { mesh, fallT: 0, shakeSeed: Math.random() * 10 };
        tileMeshes.set(idx, rec);
      }
      const { mesh } = rec;
      mesh.position.x = x;
      mesh.position.z = z;
      if (st === 'solid') {
        mesh.position.y = 0;
        mesh.rotation.set(0, 0, 0);
        mesh.material.opacity = 1;
        rec.fallT = 0;
      } else if (st === 'shaking') {
        mesh.position.y = Math.sin(time * 40 + rec.shakeSeed) * 0.08;
        mesh.rotation.set(0, 0, 0);
      } else if (st === 'falling') {
        rec.fallT += dt;
        mesh.position.y = -rec.fallT * rec.fallT * 14;
        mesh.rotation.x = rec.fallT * 1.8;
        mesh.material.opacity = Math.max(0, 1 - rec.fallT * 1.4);
      }
    }
    for (const [idx, rec] of tileMeshes) {
      if (!seen.has(idx)) {
        scene.remove(rec.mesh);
        rec.mesh.material.dispose();
        tileMeshes.delete(idx);
      }
    }

    // Obstacles.
    const seenObs = new Set();
    for (const o of g.obstacles) {
      if (o.hit && o.vanish) continue;
      const z = -(o.d - rd);
      if (z > 10 || z < -100) continue;
      seenObs.add(o);
      let mesh = obsMeshes.get(o);
      if (!mesh) {
        const isSolid = o.kind === 'solid';
        const tex = isSolid ? solidTex : obstructionTex;
        const mat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(isSolid ? pal.solid : pal.obstacle),
          emissive: new THREE.Color(isSolid ? pal.solid : pal.obstacle),
          emissiveIntensity: 0.35,
          transparent: true,
        });
        if (tex) { mat.map = tex; mat.color.set(0xffffff); mat.emissive.set(0xffffff); mat.emissiveIntensity = 0.15; }
        mesh = new THREE.Mesh(isSolid ? solidGeo : obsGeo, mat);
        mesh.userData.kind = o.kind;
        scene.add(mesh);
        obsMeshes.set(o, mesh);
      }
      mesh.position.set(pathCurve(o.d) - rc + o.lat, o.kind === 'solid' ? 1.2 : 0.8, z);
      mesh.rotation.y = time * (o.kind === 'solid' ? 0.6 : 1.2);
      if (o.hit) mesh.material.opacity = 0.25;
    }
    for (const [o, mesh] of obsMeshes) {
      if (!seenObs.has(o)) {
        scene.remove(mesh);
        mesh.material.dispose();
        obsMeshes.delete(o);
      }
    }

    // Stars drift with the run.
    stars.position.z = (rd % 40) * 0.5;

    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  }
  window.addEventListener('resize', onResize);

  function dispose() {
    window.removeEventListener('resize', onResize);
    tileGeo.dispose();
    obsGeo.dispose();
    solidGeo.dispose();
    runnerGeo.dispose();
    glowGeo.dispose();
    starGeo.dispose();
    if (runnerSprite.material.map) runnerSprite.material.map.dispose();
    runnerSprite.material.dispose();
    for (const { mesh } of tileMeshes.values()) { scene.remove(mesh); mesh.material.dispose(); }
    for (const mesh of obsMeshes.values()) { scene.remove(mesh); mesh.material.dispose(); }
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
  }

  // Paint realm 1's graphics on boot (setPalette covers later realms).
  paintRealmGraphics(level);

  return { update, setPalette, setCharacter, dispose };
}
