// WORLD NEXUS — one containing pocket universe holding every world.
// A walkable 3D plaza hub: central spawn, 11 god-category districts arranged
// in a ring, each district with its gate arch and a portal to every world.
//
// Walk-control interface (for future lib/world/walk-controls.js unification):
//   createWorld(canvas, { onReady, onNavigate, onError }) -> {
//     destroy(), setMove(x, y), goHome(), gotoDistrict(god)
//   }
// Movement: WASD/arrows + drag-look (desktop), HUD joystick + drag-look
// (mobile, via setMove). Collision: circle push-out vs every solid
// (portal posts, asset footprints, world boundary). Portal PLANES are the
// only pass-through: walking through one navigates to that world's route.

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WORLDS, GODS } from './world-names.js';
import manifest from './generation-manifest.json';
import { loadAsset } from '../../lib/world-nexus/asset-loader.js';

const ACCENTS = {
  ARES: 0xe5484d, APOLLO: 0xf5b942, HERMES: 0xd4a017, HEPHAESTUS: 0xf97316,
  ATHENA: 0x6b8afd, ARTEMIS: 0x2dd4bf, HESTIA: 0xfbbf24, DIONYSUS: 0xa855f7,
  PLUTUS: 0x4ade80, APHRODITE: 0xf472b6, UTILITIES: 0x60a5fa,
};
const GOD_LABELS = {
  ARES: 'Battle & Competition', APOLLO: 'Music & Arts', HERMES: 'Shopping',
  HEPHAESTUS: 'Forge, Craft & Building', ATHENA: 'Wisdom & Systems',
  ARTEMIS: 'Space, Wilds & Exploration', HESTIA: 'Life, Healing & Home',
  DIONYSUS: 'Thrills & Play', PLUTUS: 'Wealth & Trade',
  APHRODITE: 'People & Community', UTILITIES: 'Utilities',
};

const PLAZA_R = 16;
const DISTRICT_R = 58;
const WORLD_R = 96;      // invisible boundary
const EYE = 1.7;
const WALK_SPEED = 6.2;
const SPRINT_SPEED = 9.5;
const PLAYER_R = 0.55;

function makeLabelSprite(text, opts = {}) {
  const { fontPx = 52, padX = 28, fg = '#f2f5fa', pill = 'rgba(6,10,16,0.78)', accent = null } = opts;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  function draw(str) {
    ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const w = Math.ceil(ctx.measureText(str).width) + padX * 2;
    canvas.width = w;
    canvas.height = fontPx + padX * 1.6;
    const c2 = canvas.getContext('2d');
    c2.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    c2.textBaseline = 'middle';
    const r = canvas.height / 2;
    c2.fillStyle = pill;
    c2.beginPath();
    c2.roundRect(0, 0, canvas.width, canvas.height, r);
    c2.fill();
    if (accent) {
      c2.strokeStyle = accent;
      c2.lineWidth = 4;
      c2.beginPath();
      c2.roundRect(3, 3, canvas.width - 6, canvas.height - 6, r - 3);
      c2.stroke();
    }
    c2.fillStyle = fg;
    c2.fillText(str, padX, canvas.height / 2 + 2);
    return canvas;
  }
  draw(text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.userData.redraw = (str) => { draw(str); tex.needsUpdate = true; };
  return sp;
}

export function createWorld(canvas, cb = {}) {
  const { onReady, onNavigate, onError } = cb;
  let renderer;
  // Declared OUTSIDE the try: tick() and destroy() below both use it, and a
  // const declared inside the try block is invisible to them — it was
  // ReferenceError 'contextGuard is not defined' every frame and on unmount
  // (World Nexus scout flaw, Nov 14). Same shape as app/alexandria/page.tsx.
  let contextGuard = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and the loop below freezes while the context is lost.
  contextGuard = guardCanvasContext(canvas, { label: 'WORLD NEXUS' });
  } catch (err) {
    if (onError) onError(err);
    throw err;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.Fog(0x05070c, 70, 170);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400);

  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x0a0c10, 0.75));
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.0);
  sun.position.set(40, 70, 20);
  scene.add(sun);
  const coreLight = new THREE.PointLight(0xc9a86a, 60, 40, 1.8);
  coreLight.position.set(0, 6, 0);
  scene.add(coreLight);

  // ---- stars ----
  {
    const N = 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.48 + 0.05;
      const r = 300;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaFC4e8, size: 1.4, sizeAttenuation: false, fog: false })));
  }

  // ---- ground ----
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0b0e15, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(WORLD_R + 30, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // central plaza disc + gold ring
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(PLAZA_R, 48),
    new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.9 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  scene.add(plaza);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(PLAZA_R, 0.22, 8, 72),
    new THREE.MeshStandardMaterial({ color: 0xc9a86a, emissive: 0xc9a86a, emissiveIntensity: 0.7, roughness: 0.4 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  scene.add(ring);

  // ---- districts ----
  const byGod = {};
  for (const g of GODS) byGod[g] = [];
  for (const w of WORLDS) (byGod[w.god] || (byGod[w.god] = [])).push(w);

  const portals = [];      // {x,z,nx,nz,tx,tz,route,key,god}
  const colliders = [];    // {x,z,r}
  const updaters = [];     // fn(t)
  const districtAnchors = {}; // god -> {x,z,yaw}

  const postGeo = new THREE.BoxGeometry(0.4, 3.6, 0.4);
  const lintelGeo = new THREE.BoxGeometry(3.1, 0.45, 0.45);
  const planeGeo = new THREE.PlaneGeometry(2.3, 3.1);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.7, metalness: 0.25 });
  const planeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });

  // First pass: compute portal transforms so we can size the InstancedMeshes.
  const placements = [];
  GODS.forEach((god, gi) => {
    const a = (gi / GODS.length) * Math.PI * 2;
    const cx = Math.sin(a) * DISTRICT_R;
    const cz = -Math.cos(a) * DISTRICT_R;
    const radial = { x: Math.sin(a), z: -Math.cos(a) };       // outward
    const tang = { x: Math.cos(a), z: Math.sin(a) };          // tangential
    const accent = ACCENTS[god];
    districtAnchors[god] = { x: cx - radial.x * 8, z: cz - radial.z * 8, yaw: Math.atan2(-radial.x, -radial.z) };

    // district disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(19, 40),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(accent).multiplyScalar(0.14), roughness: 1 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(cx, 0.015, cz);
    scene.add(disc);

    // walkway strip plaza -> district
    const walkLen = DISTRICT_R - PLAZA_R - 14;
    const walk = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, walkLen),
      new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 1 })
    );
    walk.rotation.x = -Math.PI / 2;
    walk.rotation.z = -a;
    walk.position.set(Math.sin(a) * (PLAZA_R + walkLen / 2), 0.012, -Math.cos(a) * (PLAZA_R + walkLen / 2));
    scene.add(walk);

    // district name banner (permanent sprite above the gate arch)
    const banner = makeLabelSprite(`${god} — ${GOD_LABELS[god]}`, {
      accent: '#' + accent.toString(16).padStart(6, '0'),
    });
    banner.scale.set(9, 9 * (banner.material.map.image.height / banner.material.map.image.width), 1);
    banner.position.set(cx - radial.x * 10, 8.8, cz - radial.z * 10);
    scene.add(banner);

    // portals in a grid behind the arch
    const list = byGod[god];
    const cols = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(list.length * 1.6))));
    list.forEach((w, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const lx = (col - (cols - 1) / 2) * 3.7;   // tangential
      const lz = 2 + row * 4.6;                  // radial, away from plaza
      const px = cx + tang.x * lx + radial.x * lz;
      const pz = cz + tang.z * lx + radial.z * lz;
      const yaw = Math.atan2(-radial.x, -radial.z); // plane faces the plaza
      placements.push({ x: px, z: pz, yaw, route: w.route, key: w.key, title: w.title, god, accent });
      // solid posts (the frame never lets you through)
      const pxn = { x: -Math.sin(yaw), z: -Math.cos(yaw) }; // plane local +x in world
      colliders.push({ x: px + pxn.x * 1.35, z: pz + pxn.z * 1.35, r: 0.35 });
      colliders.push({ x: px - pxn.x * 1.35, z: pz - pxn.z * 1.35, r: 0.35 });
      portals.push({
        x: px, z: pz,
        nx: -radial.x, nz: -radial.z,   // inward normal (toward plaza)
        tx: tang.x, tz: tang.z,
        route: w.route, key: w.key, title: w.title, god,
      });
    });
  });

  // ---- instanced portal frames ----
  const dummy = new THREE.Object3D();
  const postMesh = new THREE.InstancedMesh(postGeo, frameMat, placements.length * 2);
  const lintelMesh = new THREE.InstancedMesh(lintelGeo, frameMat, placements.length);
  const planeMesh = new THREE.InstancedMesh(planeGeo, planeMat, placements.length);
  const tmpColor = new THREE.Color();
  placements.forEach((p, i) => {
    const pxn = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    dummy.position.set(p.x + pxn.x * 1.35, 1.8, p.z + pxn.z * 1.35);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.updateMatrix();
    postMesh.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.set(p.x - pxn.x * 1.35, 1.8, p.z - pxn.z * 1.35);
    dummy.updateMatrix();
    postMesh.setMatrixAt(i * 2 + 1, dummy.matrix);
    dummy.position.set(p.x, 3.75, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.updateMatrix();
    lintelMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 1.75, p.z);
    dummy.updateMatrix();
    planeMesh.setMatrixAt(i, dummy.matrix);
    tmpColor.set(p.accent).multiplyScalar(0.9);
    planeMesh.setColorAt(i, tmpColor);
  });
  postMesh.instanceMatrix.needsUpdate = true;
  lintelMesh.instanceMatrix.needsUpdate = true;
  planeMesh.instanceMatrix.needsUpdate = true;
  if (planeMesh.instanceColor) planeMesh.instanceColor.needsUpdate = true;
  scene.add(postMesh, lintelMesh, planeMesh);

  // ---- floating name labels (pooled, nearest portals only) ----
  const LABEL_POOL = 14;
  const labelPool = [];
  for (let i = 0; i < LABEL_POOL; i++) {
    const sp = makeLabelSprite('');
    sp.visible = false;
    scene.add(sp);
    labelPool.push({ sp, portal: null });
  }
  let labelTimer = 0;
  function refreshLabels(px, pz) {
    const near = [];
    for (const p of portals) {
      const d2 = (p.x - px) ** 2 + (p.z - pz) ** 2;
      if (d2 < 32 * 32) near.push({ p, d2 });
    }
    near.sort((a, b) => a.d2 - b.d2);
    labelPool.forEach((slot, i) => {
      const hit = near[i];
      if (!hit) { slot.sp.visible = false; slot.portal = null; return; }
      slot.portal = hit.p;
      slot.sp.visible = true;
      slot.sp.userData.redraw(hit.p.title);
      const img = slot.sp.material.map.image;
      slot.sp.scale.set(5.2, 5.2 * (img.height / img.width), 1);
      slot.sp.position.set(hit.p.x, 4.9, hit.p.z);
    });
  }

  // ---- generated assets (gate arches, centerpiece, decor) ----
  const templates = new Map();
  async function placeAsset(id, x, z, opts = {}) {
    const entry = manifest.assets.find((a) => a.id === id);
    if (!entry) return { generated: false };
    let t = templates.get(id);
    if (!t) {
      const res = await loadAsset(THREE, GLTFLoader, scene, entry, {
        x: 0, y: opts.y || 0, z: 0, rotationY: 0,
        scale: opts.scale || 1, accent: opts.accent || 0xc9a86a,
      });
      scene.remove(res.group); // re-added per placement below
      t = { group: res.group, colliders: res.colliders, update: res.update, generated: res.generated };
      templates.set(id, t);
    }
    const g = t.group.clone();
    g.position.set(x, opts.y || 0, z);
    g.rotation.y = opts.rotationY || 0;
    scene.add(g);
    for (const c of t.colliders) colliders.push({ x: c.x + x, z: c.z + z, r: c.r });
    if (t.update && opts.animate !== false && !t.updateBound) {
      // single-placement animated assets (nexus-core) keep their updater
      updaters.push(t.update);
      t.updateBound = true;
    }
    return { generated: t.generated };
  }

  let assetsDone = false;
  async function loadHubAssets() {
    const jobs = [];
    jobs.push(placeAsset('nexus-core', 0, 0, { accent: 0xc9a86a }));
    jobs.push(placeAsset('fountain-light', 9, 6, {}));
    jobs.push(placeAsset('sundial', -9, 7, {}));
    jobs.push(placeAsset('statue-guardian', -3.2, 13.5, { rotationY: Math.PI }));
    jobs.push(placeAsset('statue-guardian', 3.2, 13.5, { rotationY: Math.PI }));
    GODS.forEach((god, gi) => {
      const a = (gi / GODS.length) * Math.PI * 2;
      const cx = Math.sin(a) * DISTRICT_R;
      const cz = -Math.cos(a) * DISTRICT_R;
      const radial = { x: Math.sin(a), z: -Math.cos(a) };
      const tang = { x: Math.cos(a), z: Math.sin(a) };
      const accent = ACCENTS[god];
      const gx = cx - radial.x * 10, gz = cz - radial.z * 10;
      const faceYaw = Math.atan2(-radial.x, -radial.z);
      jobs.push(placeAsset('gate-' + god.toLowerCase(), gx, gz, { rotationY: faceYaw, accent }));
      jobs.push(placeAsset('obelisk-rune', cx + radial.x * 20, cz + radial.z * 20, { accent }));
      jobs.push(placeAsset('brazier-flame', gx + tang.x * 4.5 - radial.x * 2, gz + tang.z * 4.5 - radial.z * 2, {}));
      jobs.push(placeAsset('brazier-flame', gx - tang.x * 4.5 - radial.x * 2, gz - tang.z * 4.5 - radial.z * 2, {}));
      jobs.push(placeAsset('nexus-crystal', gx + tang.x * 7, gz + tang.z * 7, { accent }));
      jobs.push(placeAsset('nexus-crystal', gx - tang.x * 7, gz - tang.z * 7, { accent }));
      jobs.push(placeAsset('nexus-lantern', cx - radial.x * 24 + tang.x * 3, cz - radial.z * 24 + tang.z * 3, {}));
      jobs.push(placeAsset('nexus-lantern', cx - radial.x * 24 - tang.x * 3, cz - radial.z * 24 - tang.z * 3, {}));
      jobs.push(placeAsset('banner-pole', cx - radial.x * 16 + tang.x * 9, cz - radial.z * 16 + tang.z * 9, { accent }));
      // trees + rocks as soft district dividers
      const mid = a + Math.PI / GODS.length;
      jobs.push(placeAsset('nexus-tree', Math.sin(mid) * 66, -Math.cos(mid) * 66, {}));
      jobs.push(placeAsset('nexus-rock', Math.sin(mid) * 40, -Math.cos(mid) * 40, {}));
    });
    // floating isles drift above the plaza (no collision)
    jobs.push(placeAsset('nexus-floating-isle', 20, -14, { y: 14 }));
    jobs.push(placeAsset('nexus-floating-isle', -22, -6, { y: 17 }));
    jobs.push(placeAsset('nexus-floating-isle', 4, 26, { y: 15 }));
    await Promise.all(jobs);
    assetsDone = true;
  }
  loadHubAssets().catch(() => { assetsDone = true; });

  // ---- central return gate (walk through -> back to spawn) ----
  const returnGate = { x: 0, z: 14.5, nx: 0, nz: -1, tx: 1, tz: 0 };
  {
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a86a, emissive: 0xc9a86a, emissiveIntensity: 0.55, roughness: 0.4 });
    const g1 = new THREE.Mesh(postGeo, gold); g1.position.set(-1.35, 1.8, 14.5); scene.add(g1);
    const g2 = new THREE.Mesh(postGeo, gold); g2.position.set(1.35, 1.8, 14.5); scene.add(g2);
    const g3 = new THREE.Mesh(lintelGeo, gold); g3.position.set(0, 3.75, 14.5); scene.add(g3);
    const gp = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: 0xc9a86a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    gp.position.set(0, 1.75, 14.5); scene.add(gp);
    colliders.push({ x: -1.35, z: 14.5, r: 0.35 }, { x: 1.35, z: 14.5, r: 0.35 });
    const lbl = makeLabelSprite('NEXUS RETURN', { accent: '#c9a86a' });
    const img = lbl.material.map.image;
    lbl.scale.set(5.4, 5.4 * (img.height / img.width), 1);
    lbl.position.set(0, 4.9, 14.5);
    scene.add(lbl);
  }

  // ---- player + walk controls ----
  const player = { x: 0, z: 8, yaw: 0, pitch: 0 };
  const SPAWN = { x: 0, z: 8, yaw: 0 };
  const keys = {};
  const joy = { x: 0, y: 0 };

  function applyLook() {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    camera.position.set(player.x, EYE, player.z);
  }

  // drag-look (mouse + touch), tap detection for portal tap-to-travel
  let dragId = null, lastX = 0, lastY = 0, downX = 0, downY = 0, moved = false;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragId = e.pointerId; lastX = downX = e.clientX; lastY = downY = e.clientY; moved = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  }
  function onMovePtr(e) {
    if (e.pointerId !== dragId) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) moved = true;
    player.yaw -= dx * 0.0042;
    player.pitch = Math.max(-1.1, Math.min(1.1, player.pitch - dy * 0.0042));
  }
  function onUp(e) {
    if (e.pointerId !== dragId) return;
    dragId = null;
    if (!moved) {
      // tap: raycast portal planes
      ndc.x = (e.clientX / canvas.clientWidth) * 2 - 1;
      ndc.y = -(e.clientY / canvas.clientHeight) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(planeMesh);
      if (hits.length && onNavigate) {
        const inst = hits[0].instanceId;
        if (inst != null && placements[inst]) onNavigate(placements[inst].route);
      }
    }
  }
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMovePtr);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function onKeyDown(e) {
    if (e.repeat) return;
    keys[e.key.toLowerCase()] = true;
  }
  function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let travelCooldown = 0;
  function checkPortalTravel() {
    if (travelCooldown > 0 || !onNavigate) return;
    // world portals
    for (const p of portals) {
      const rx = player.x - p.x, rz = player.z - p.z;
      const lateral = rx * p.tx + rz * p.tz;
      const normal = rx * p.nx + rz * p.nz;
      if (Math.abs(lateral) < 1.15 && Math.abs(normal) < 0.75) {
        travelCooldown = 1.2;
        onNavigate(p.route);
        return;
      }
    }
    // return gate
    {
      const rx = player.x - returnGate.x, rz = player.z - returnGate.z;
      const lateral = rx * returnGate.tx + rz * returnGate.tz;
      const normal = rx * returnGate.nx + rz * returnGate.nz;
      if (Math.abs(lateral) < 1.15 && Math.abs(normal) < 0.75) {
        travelCooldown = 1.2;
        player.x = SPAWN.x; player.z = SPAWN.z; player.yaw = SPAWN.yaw; player.pitch = 0;
      }
    }
  }

  function collide() {
    // world boundary
    const d0 = Math.hypot(player.x, player.z);
    if (d0 > WORLD_R) {
      player.x *= WORLD_R / d0;
      player.z *= WORLD_R / d0;
    }
    // circle push-out vs nearby colliders (deflect, never kill)
    for (const c of colliders) {
      const dx = player.x - c.x, dz = player.z - c.z;
      const rr = c.r + PLAYER_R;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        player.x = c.x + (dx / d) * rr;
        player.z = c.z + (dz / d) * rr;
      }
    }
  }

  let last = performance.now();
  let raf = 0;
  let firstFrame = true;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (contextGuard && contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    // input -> velocity
    let ix = 0, iz = 0;
    if (keys['w'] || keys['arrowup']) iz += 1;
    if (keys['s'] || keys['arrowdown']) iz -= 1;
    if (keys['a'] || keys['arrowleft']) ix -= 1;
    if (keys['d'] || keys['arrowright']) ix += 1;
    ix += joy.x; iz += joy.y;
    const mag = Math.hypot(ix, iz);
    const sprint = keys['shift'] || mag > 0.94;
    const speed = (sprint ? SPRINT_SPEED : WALK_SPEED) * Math.min(1, mag || 1);
    if (mag > 0.01) {
      const nx = ix / (mag || 1), nz = iz / (mag || 1);
      // camera-relative: forward = (-sin yaw, -cos yaw)
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const rx = -fz, rz = fx;
      player.x += (fx * nz + rx * nx) * speed * dt;
      player.z += (fz * nz + rz * nx) * speed * dt;
    }

    collide();
    travelCooldown = Math.max(0, travelCooldown - dt);
    checkPortalTravel();
    applyLook();

    labelTimer -= dt;
    if (labelTimer <= 0) { labelTimer = 0.4; refreshLabels(player.x, player.z); }

    for (const u of updaters) u(t);

    // The frame is only ever seen because it is rendered here:
    // without this call the loop updates player state forever
    // but the canvas stays black (the tour's World Nexus finding:
    // header, districts and stick all rendered, canvas black,
    // district taps changing nothing visible).
    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      if (onReady) onReady({ portals: placements.length, assetsReady: () => assetsDone });
    }
  }

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  applyLook();
  refreshLabels(player.x, player.z);
  raf = requestAnimationFrame(tick);

  return {
    destroy() {
      if (contextGuard) contextGuard.dispose();
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMovePtr);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      renderer.dispose();
    },
    setMove(x, y) { joy.x = x; joy.y = y; },
    goHome() { player.x = SPAWN.x; player.z = SPAWN.z; player.yaw = SPAWN.yaw; player.pitch = 0; },
    gotoDistrict(god) {
      const d = districtAnchors[god];
      if (!d) return;
      player.x = d.x; player.z = d.z; player.yaw = d.yaw; player.pitch = 0;
    },
  };
}

export { GODS, GOD_LABELS, ACCENTS };
