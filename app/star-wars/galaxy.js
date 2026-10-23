// app/star-wars/galaxy.js — 3D galaxy map for the Star Wars pocket universe.
//
// buildGalaxy(THREE, canvas, PLANETS, CHAPTERS, progress, onPick, camera?) ->
//   { group, update(t, dt), dispose(), refresh(newProgress) }
//
// One sphere per planet on a deterministic spiral ordered by saga
// (chapter index -> angle/radius). Spheres carry seeded per-planet
// surface textures (textures.js planetSurfaceTexture) plus a fresnel
// atmosphere rim; locked planets show the same world under a dim
// hologram tint with a slate-blue rim, padlock sprite and dimmed
// label; finished beats get a gold ring.
// Tap/click (with tap-vs-drag detection) raycasts planet meshes and calls
// onPick(planetId) — including locked planets, so the page can show a
// "finish the previous episode first" hint. No document/window access at
// module import time — only inside functions.

import * as T from './textures';
import { isPlanetUnlocked } from './data';

const TAU = Math.PI * 2;
const LOCKED_TINT = 0x565664; // multiplies the surface texture -> dim monochrome world
const LOCKED_RIM = 0x3a5a8a; // hologram-blue rim for locked worlds
const TAP_MAX_PX = 10;
const TAP_MAX_MS = 500;

/* Fresnel atmosphere shell (classic view-space glow, BackSide + additive). */
function makeRimMaterial(THREE, colorHex, intensity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uIntensity: { value: intensity },
    },
    vertexShader: [
      'varying vec3 vNormal;',
      'void main() {',
      '  vNormal = normalize(normalMatrix * normal);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColor;',
      'uniform float uIntensity;',
      'varying vec3 vNormal;',
      'void main() {',
      '  float f = pow(max(0.0, 0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);',
      '  gl_FragColor = vec4(uColor, 1.0) * f * uIntensity;',
      '}',
    ].join('\n'),
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/* Lighten a hex colour toward white by amt (0..1) — for rim tinting. */
function lighten(hex, amt) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = (v) => Math.round(v + (255 - v) * amt);
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

function beatIsDone(progress, planetId) {
  if (!progress) return false;
  if (progress.beatsDone && progress.beatsDone[planetId]) return true; // data.js shape
  if (progress.beats && progress.beats[planetId]) return true;
  if (Array.isArray(progress.done) && progress.done.includes(planetId)) return true;
  return false;
}

function canvasEl(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(THREE, v) {
  if (v && v.isTexture) return v;
  return new THREE.CanvasTexture(v);
}

// --- local fallback canvas textures (used when ./textures lacks an export) ---

function fallbackStarTexture() {
  const c = canvasEl(64, 64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function fallbackNebulaTexture(rgb) {
  const c = canvasEl(256, 256);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, `rgba(${rgb},0.5)`);
  grad.addColorStop(0.5, `rgba(${rgb},0.22)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return c;
}

function makeLabelTexture(text) {
  const c = canvasEl(512, 128);
  const g = c.getContext('2d');
  g.font = '600 42px system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.95)';
  g.shadowBlur = 14;
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.fillText(String(text).toUpperCase(), 256, 66);
  return c;
}

function makeLockTexture() {
  const c = canvasEl(96, 96);
  const g = c.getContext('2d');
  // shackle
  g.strokeStyle = 'rgba(175,180,195,0.95)';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(48, 44, 20, Math.PI, 0);
  g.stroke();
  // body (rounded rect)
  const x = 24, y = 42, w = 48, h = 38, r = 9;
  g.fillStyle = 'rgba(130,136,150,0.95)';
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
  // keyhole
  g.fillStyle = 'rgba(20,20,28,0.9)';
  g.beginPath();
  g.arc(48, 56, 5, 0, TAU);
  g.fill();
  g.fillRect(45.5, 56, 5, 12);
  return c;
}

export function buildGalaxy(THREE, canvas, PLANETS, CHAPTERS, progress, onPick, camera) {
  const group = new THREE.Group();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const planets = [];
  const meshes = [];
  const nebulae = [];

  // --- starfield ---
  const starTex = toTexture(
    THREE,
    T && typeof T.starTexture === 'function' ? T.starTexture() : fallbackStarTexture()
  );
  const starGeo = new THREE.BufferGeometry();
  const STAR_COUNT = 1400;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 230 + Math.random() * 280;
    const th = Math.random() * TAU;
    const ph = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = r * Math.cos(ph);
    starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.4, map: starTex, transparent: true, depthWrite: false,
  });
  group.add(new THREE.Points(starGeo, starMat));

  // --- near star layer: bigger, softer, counter-rotating for parallax ---
  const nearGeo = new THREE.BufferGeometry();
  const NEAR_COUNT = 240;
  const nearPos = new Float32Array(NEAR_COUNT * 3);
  for (let i = 0; i < NEAR_COUNT; i++) {
    const r = 120 + Math.random() * 90;
    const th = Math.random() * TAU;
    const ph = Math.acos(2 * Math.random() - 1);
    nearPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    nearPos[i * 3 + 1] = r * Math.cos(ph);
    nearPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  nearGeo.setAttribute('position', new THREE.BufferAttribute(nearPos, 3));
  const nearStars = new THREE.Points(nearGeo, new THREE.PointsMaterial({
    size: 5.2, map: starTex, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  group.add(nearStars);

  // --- nebulae ---
  const nebColors = ['96,44,168', '168,44,96', '44,96,184', '128,64,208'];
  nebColors.forEach((rgb, i) => {
    const tex = toTexture(
      THREE,
      T && typeof T.nebulaTexture === 'function' ? T.nebulaTexture(rgb) : fallbackNebulaTexture(rgb)
    );
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.16, depthWrite: false })
    );
    const s = 95 + i * 32;
    sp.scale.set(s, s, 1);
    sp.position.set(Math.cos(i * 1.7) * 130, (i - 1.5) * 42, Math.sin(i * 1.7) * 130);
    group.add(sp);
    nebulae.push(sp);
  });

  // --- planets on a deterministic spiral, ordered by saga ---
  const order = [];
  for (const ch of CHAPTERS || []) {
    for (const id of ch.planets || []) {
      if (PLANETS[id] && !order.includes(id)) order.push(id);
    }
  }

  const lockTex = toTexture(
    THREE,
    T && typeof T.lockTexture === 'function' ? T.lockTexture() : makeLockTexture()
  );

  order.forEach((id, i) => {
    const def = PLANETS[id];
    const radius = def.kind === 'fly' ? 3 : 2.2;
    const angle = i * 2.39996; // golden angle — even spiral spacing
    const dist = 11 + i * 3.3;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const y = Math.sin(i * 1.31) * 3.5;

    // Per-planet rendered surface (seeded canvas texture in the
    // planet's own colours); the scene's directional light gives the
    // terminator. Falls back to the flat colour if the maker is absent.
    let surfaceTex = null;
    if (T && typeof T.planetSurfaceTexture === 'function') {
      const made = T.planetSurfaceTexture(def);
      surfaceTex = made && made.isTexture ? made : (made ? toTexture(THREE, made) : null);
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 36, 24),
      new THREE.MeshStandardMaterial({
        color: surfaceTex ? 0xffffff : (def.color || '#888888'),
        map: surfaceTex || undefined,
        roughness: 0.9, metalness: 0.08,
      })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.z = Math.sin(i * 2.7) * 0.28; // a little axial personality
    mesh.userData.planetId = id;
    group.add(mesh);
    meshes.push(mesh);

    // Atmosphere rim — soft fresnel shell just above the surface.
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.22, 32, 20),
      makeRimMaterial(THREE, lighten(def.color || 0x888888, 0.35), 0.85)
    );
    rim.position.set(x, y, z);
    group.add(rim);

    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: toTexture(THREE, makeLabelTexture(def.name || id)),
        transparent: true, depthWrite: false,
      })
    );
    label.scale.set(8.4, 2.1, 1);
    label.position.set(x, y + radius + 2.3, z);
    group.add(label);

    const lock = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: lockTex, transparent: true, depthWrite: false })
    );
    lock.scale.set(1.7, 1.7, 1);
    lock.position.set(x, y + radius + 0.55, z);
    group.add(lock);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 0.9, 0.13, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y - radius - 0.7, z);
    group.add(ring);

    planets.push({
      id, def, mesh, label, lock, ring, rim,
      baseColor: new THREE.Color(def.color || '#888888'),
    });
  });

  function applyProgress(p) {
    for (const pl of planets) {
      const locked = !isPlanetUnlocked(p, pl.id);
      // Unlocked: full-colour textured world. Locked: the same world
      // seen through a dim hologram tint (surface still reads), with a
      // slate-blue rim and the padlock on top.
      pl.mesh.material.color.setHex(locked ? LOCKED_TINT : 0xffffff);
      if (!pl.mesh.material.map) pl.mesh.material.color.copy(locked ? new THREE.Color(LOCKED_TINT) : pl.baseColor);
      pl.mesh.material.emissive.setHex(locked ? 0x05080f : 0x000000);
      pl.rim.material.uniforms.uColor.value.setHex(
        locked ? LOCKED_RIM : lighten(pl.def.color || 0x888888, 0.35)
      );
      pl.rim.material.uniforms.uIntensity.value = locked ? 0.5 : 0.85;
      pl.label.material.opacity = locked ? 0.4 : 1;
      pl.lock.visible = locked;
      pl.ring.visible = beatIsDone(p, pl.id);
      pl.mesh.userData.locked = locked;
    }
  }
  applyProgress(progress);

  // --- picking (tap vs drag) + desktop hover highlight ---
  function castAt(clientX, clientY) {
    if (!camera) return null;
    const r = canvas.getBoundingClientRect();
    pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object.userData.planetId : null;
  }

  let dX = 0, dY = 0, dT = 0;
  function onPointerDown(e) {
    dX = e.clientX; dY = e.clientY; dT = performance.now();
  }
  function onPointerUp(e) {
    const moved = Math.hypot(e.clientX - dX, e.clientY - dY);
    if (moved < TAP_MAX_PX && performance.now() - dT < TAP_MAX_MS) {
      const id = castAt(e.clientX, e.clientY);
      if (id && onPick) onPick(id);
    }
  }
  let hovered = null;
  function onPointerMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const id = castAt(e.clientX, e.clientY);
    if (hovered && hovered.userData.planetId !== id) {
      hovered.material.emissive.setHex(0x000000);
      hovered = null;
    }
    if (id) {
      const m = meshes.find((mm) => mm.userData.planetId === id);
      if (m && m !== hovered) {
        m.material.emissive.setHex(0x2e2e1a);
        hovered = m;
      }
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);

  function update(t, dt) {
    group.rotation.y += dt * 0.02;
    nearStars.rotation.y -= dt * 0.006; // parallax against the far field
    for (const pl of planets) pl.mesh.rotation.y += dt * 0.12;
    for (let i = 0; i < nebulae.length; i++) {
      nebulae[i].material.rotation += dt * 0.008 * (i % 2 ? 1 : -1);
    }
  }

  function dispose() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointermove', onPointerMove);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    if (group.parent) group.parent.remove(group);
  }

  return { group, update, dispose, refresh: applyProgress };
}
