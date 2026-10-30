/**
 * Abyssal Voyage — three.js 3D trench-dive renderer.
 * The 2D game logic in engine.js is untouched. WORLD coordinates map to 3D:
 *   worldX (0..720) -> scene X (-20..20)
 *   worldY (the falling axis) -> scene Y (vertical), so this is a true
 *     side-view dive: rock columns scroll down past the sub, each with a
 *     VISIBLE glowing slot the sub threads. What you see is exactly what
 *     the 2D collision checks — damage only ever lands on a visible hit.
 * Zero network calls. No postprocessing: the only glows are the sub's
 * headlamp cone, pearl/thruster sprites, and gate rim strips — all local.
 */
import * as THREE from 'three';
import { WORLD } from './engine.js';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { CoralField } from './coral.js';
import { MarineLife } from './marine.js';

// ---------------------------------------------------------------------------
// Pure helpers (no DOM, headless-testable)
// ---------------------------------------------------------------------------

export const SX = 40 / WORLD.width; // world px -> scene units
export const PLAYER_WY = WORLD.height * 0.72; // the sub's fixed 2D height
export const GATE_DEPTH = 2.5; // rock wall thickness in Z (scene units) — thin
export const GATE_HALF_H = 30; // rock columns extend this far above/below the slot
export const DIVE_TILT = 0.5; // radians: the dive plane leans back, so gates
// scroll down AND rush toward the camera — the trench-rush perspective —
// while the slots stay visible gaps, exactly what the 2D collision checks.
export const MAX_GATES = 16; // pooled rock gates
export const MAX_PEARLS = 24;
export const MAX_DEBRIS = 80;
export const MAX_SPARKS = 120;
export const SNOW_COUNT = 350;

/** worldX -> scene X */
export function sceneX(wx) {
  return (wx - WORLD.width / 2) * SX;
}

/** worldY (falling axis) -> scene Y (vertical). Player sits at y = 0;
 *  gates spawn deep below (-Y) and rush up past the sub on the dive. */
export function sceneY(wy) {
  return (PLAYER_WY - wy) * SX;
}

/**
 * Fog/background palette for a depth in meters. Lerps twilight -> hadal.
 * Returns { bg: [r,g,b] 0..1, density }.
 */
export function zonePalette(depth) {
  const stops = [
    { at: 0, bg: [0x06 / 255, 0x28 / 255, 0x3f / 255], density: 0.014 },
    { at: 1500, bg: [0x03 / 255, 0x0b / 255, 0x18 / 255], density: 0.019 },
    { at: 4500, bg: [0x02 / 255, 0x06 / 255, 0x10 / 255], density: 0.025 },
    { at: 9000, bg: [0x00, 0x03 / 255, 0x08 / 255], density: 0.031 },
  ];
  const d = Math.max(0, depth);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (d <= b.at) {
      const k = (d - a.at) / (b.at - a.at);
      return {
        bg: [0, 1, 2].map((j) => a.bg[j] + (b.bg[j] - a.bg[j]) * k),
        density: a.density + (b.density - a.density) * k,
      };
    }
  }
  const last = stops[stops.length - 1];
  return { bg: last.bg.slice(), density: last.density };
}

/** Sub roll (radians) from horizontal velocity, clamped like the 2D tilt. */
export function subRollFor(vx) {
  return Math.max(-0.3, Math.min(0.3, vx * 0.004));
}

const _cosT = Math.cos(DIVE_TILT);
const _sinT = Math.sin(DIVE_TILT);
/** Lean a scene-Y position back along the dive tilt (rotation about X). */
export function tiltPos(y) {
  return { y: y * _cosT, z: -y * _sinT };
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

function makeSpriteTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDiveScene(canvas, options = {}) {
  const { reducedMotion = false } = options;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and render() below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'ABYSSAL VOYAGE' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(0x06283f);
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2(0x06283f, 0.014);

  const camera = new THREE.PerspectiveCamera(68, 3 / 4, 0.5, 400);

  // --- lights: dim ambient + the sub's own lamps (localized) ---
  scene.add(new THREE.AmbientLight(0x2a4a66, 0.85));
  const topLight = new THREE.DirectionalLight(0x3a6a8a, 0.5);
  topLight.position.set(0, 30, -10);
  scene.add(topLight);

  // --- trench walls (frame the dive on both sides) ---
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d1620, roughness: 1, metalness: 0 });
  const wallGeo = new THREE.BoxGeometry(30, 90, 34);
  const wallL = new THREE.Mesh(wallGeo, wallMat);
  wallL.position.set(-38, 0, -4);
  const wallR = new THREE.Mesh(wallGeo, wallMat);
  wallR.position.set(38, 0, -4);
  scene.add(wallL, wallR);

  // --- coral reef (Merlin 2026-10-29): the seafloor at the trench bottom ---
  const reef = new CoralField(scene);

  // --- marine life (Merlin 2026-10-29): rigged Tripo creatures ---
  // Lazy band loading: species parse once, max 2 concurrent fetches,
  // only when the dive nears their depth — the old 31-at-once storm
  // is what killed the tab on phones.
  const marine = new MarineLife(scene);

  // --- marine snow ---
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SNOW_COUNT * 3);
  const snowBase = new Float32Array(SNOW_COUNT * 3);
  const srng = mulberry(777);
  for (let i = 0; i < SNOW_COUNT; i++) {
    snowBase[i * 3] = (srng() * 2 - 1) * 42;
    snowBase[i * 3 + 1] = (srng() * 2 - 1) * 34;
    snowBase[i * 3 + 2] = (srng() * 2 - 1) * 14;
  }
  snowPos.set(snowBase);
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3).setUsage(THREE.DynamicDrawUsage));
  const snow = new THREE.Points(
    snowGeo,
    new THREE.PointsMaterial({ color: 0x9fc4d8, size: 0.35, transparent: true, opacity: 0.5, depthWrite: false })
  );
  snow.frustumCulled = false;
  scene.add(snow);

  // --- the submersible (procedural, low-poly), diving head-first (-Y) ---
  const sub = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x1a86b8, metalness: 0.55, roughness: 0.4 });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 2.4, 4, 10), hullMat);
  sub.add(hull); // capsule's long axis is Y by default: nose down
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x0a2a3a, emissive: 0xbfefff, emissiveIntensity: 1.1, roughness: 0.2 })
  );
  canopy.scale.set(1, 1.3, 0.7);
  canopy.position.set(0, -0.9, 0.78); // bubble toward the camera, near the nose
  sub.add(canopy);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.7, 8), hullMat);
  tower.rotation.x = Math.PI / 2;
  tower.position.set(0, 0.5, -0.75); // sail on the far side
  sub.add(tower);
  const finGeo = new THREE.BoxGeometry(0.12, 0.9, 1.1);
  const finL = new THREE.Mesh(finGeo, hullMat);
  finL.position.set(-1.05, 1.25, 0);
  finL.rotation.z = 0.25;
  const finR = new THREE.Mesh(finGeo, hullMat);
  finR.position.set(1.05, 1.25, 0);
  finR.rotation.z = -0.25;
  const finT = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.12), hullMat);
  finT.position.set(0, 1.25, -1.0);
  sub.add(finL, finR, finT);
  // thruster glow (localized sprite) at the tail, pointing up
  const thrustTex = makeSpriteTexture([[0, 'rgba(180,255,255,1)'], [0.4, 'rgba(0,242,255,0.6)'], [1, 'rgba(0,242,255,0)']]);
  const thrustMat = new THREE.SpriteMaterial({ map: thrustTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const thrust = new THREE.Sprite(thrustMat);
  thrust.position.set(0, 2.1, 0);
  sub.add(thrust);
  // headlamp: one spotlight down into the trench (localized)
  const lamp = new THREE.SpotLight(0xbfefff, 90, 70, 0.48, 0.6, 1.4);
  lamp.position.set(0, -1.6, 0.5);
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, -30, 0);
  sub.add(lampTarget);
  lamp.target = lampTarget;
  sub.add(lamp);
  const subGlow = new THREE.PointLight(0x00f2ff, 12, 16, 1.8);
  subGlow.position.set(0, 0, 2);
  sub.add(subGlow);
  scene.add(sub);

  // --- rock gate pool: a rock column per gate, split into the rock ABOVE
  // the slot and the rock BELOW it, so the safe slot is a visible glowing
  // gap — exactly what the 2D collision checks (topRect / botRect).
  // Each gate lives in a group leaned back by DIVE_TILT, so the columns
  // rush toward the camera as they scroll down.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.95, metalness: 0.05, flatShading: true });
  const rockGeo = new THREE.BoxGeometry(1, 1, 1);
  const stripGeo = new THREE.BoxGeometry(1, 0.5, 1.2);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.85 });
  const gates = [];
  for (let i = 0; i < MAX_GATES; i++) {
    const group = new THREE.Group();
    group.rotation.x = -DIVE_TILT;
    const rockTop = new THREE.Mesh(rockGeo, rockMat);
    const rockBot = new THREE.Mesh(rockGeo, rockMat);
    const stripT = new THREE.Mesh(stripGeo, stripMat);
    const stripB = new THREE.Mesh(stripGeo, stripMat);
    rockTop.visible = rockBot.visible = stripT.visible = stripB.visible = false;
    group.add(rockTop, rockBot, stripT, stripB);
    scene.add(group);
    gates.push({ group, rockTop, rockBot, stripT, stripB });
  }

  // --- pearl pool ---
  const pearlGeo = new THREE.SphereGeometry(0.55, 12, 10);
  const pearlMat = new THREE.MeshStandardMaterial({ color: 0x0a3038, emissive: 0x00f2ff, emissiveIntensity: 1.6, roughness: 0.3 });
  const pearls = [];
  for (let i = 0; i < MAX_PEARLS; i++) {
    const m = new THREE.Mesh(pearlGeo, pearlMat);
    m.visible = false;
    scene.add(m);
    pearls.push(m);
  }

  // --- debris: one instanced mesh ---
  const debrisMesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.5),
    new THREE.MeshStandardMaterial({ color: 0x5a6f80, roughness: 1 }),
    MAX_DEBRIS
  );
  debrisMesh.frustumCulled = false;
  debrisMesh.count = 0;
  scene.add(debrisMesh);
  const dummy = new THREE.Object3D();

  // --- sparks: one dynamic points cloud ---
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkCol = new Float32Array(MAX_SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ size: 0.8, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  sparks.frustumCulled = false;
  scene.add(sparks);

  // --- damage flash: red quad pinned in front of the camera ---
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xff2850, transparent: true, opacity: 0, depthTest: false });
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), flashMat);
  flashQuad.renderOrder = 999;
  scene.add(flashQuad);

  let disposed = false;
  let prevSubX = 0;
  const _camDir = new THREE.Vector3();
  const _raycaster = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _hit = new THREE.Vector3();
  const _playPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z = 0

  function render(game, dt, nowMs) {
    if (disposed) return;
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const t = nowMs / 1000;

    // environment follows depth
    const depth = game ? game.depth : 0;
    reef.update(depth, t);
    marine.update(t, dt, depth);
    const pal = zonePalette(depth);
    bgColor.setRGB(pal.bg[0], pal.bg[1], pal.bg[2]);
    scene.fog.color.copy(bgColor);
    scene.fog.density = pal.density;

    // sub (dives head-first; banks with horizontal velocity)
    const px = game ? sceneX(game.player.x) : 0;
    const vx = dt > 0 ? (px - prevSubX) / Math.max(dt, 1e-3) : 0;
    prevSubX = px;
    sub.position.set(px, 0, 0);
    sub.rotation.z = subRollFor(vx);
    sub.rotation.y = Math.max(-0.4, Math.min(0.4, -vx * 0.02));
    const blink = game && game.invuln > 0 && !reducedMotion && Math.floor(nowMs / 120) % 2 === 0;
    sub.visible = !blink;
    const flick = reducedMotion ? 1.5 : 1.3 + Math.sin(t * 31) * 0.35 + Math.sin(t * 57) * 0.15;
    thrust.scale.set(flick, flick, 1);

    // camera: level with the sub, looking slightly down into the dive —
    // gates rise from the depths below and rush up past the sub,
    // the way the world streams past on a real nose-down dive
    camera.position.set(px * 0.4, 5, 24);
    camera.lookAt(px * 0.5, -8, -8);
    camera.getWorldDirection(_camDir);
    flashQuad.position.copy(camera.position).addScaledVector(_camDir, 5);
    flashQuad.lookAt(camera.position);

    // gates: rock above the slot + rock below the slot, thin in Z.
    // The slot between them is the visible safe gap. The group lean
    // sends each column rushing toward the camera as it scrolls down.
    const obstacles = game ? game.obstacles : [];
    for (let i = 0; i < MAX_GATES; i++) {
      const g = gates[i];
      const o = obstacles[i];
      const show = !!o;
      g.rockTop.visible = g.rockBot.visible = g.stripT.visible = g.stripB.visible = show;
      if (!o) continue;
      const slotTopY = sceneY(o.gapY - o.gapH / 2);
      const slotBotY = sceneY(o.gapY + o.gapH / 2);
      const cx = sceneX(o.x + o.w / 2);
      const w = Math.max(0.5, o.w * SX);
      g.group.position.set(cx, 0, 0);
      g.rockTop.position.set(0, slotTopY + GATE_HALF_H / 2, 0);
      g.rockTop.scale.set(w, GATE_HALF_H, GATE_DEPTH);
      g.rockBot.position.set(0, slotBotY - GATE_HALF_H / 2, 0);
      g.rockBot.scale.set(w, GATE_HALF_H, GATE_DEPTH);
      g.stripT.position.set(0, slotTopY, 0);
      g.stripT.scale.set(w, 1, 1);
      g.stripB.position.set(0, slotBotY, 0);
      g.stripB.scale.set(w, 1, 1);
    }

    // bits: pearls, debris, sparks
    const bits = game ? game.bits : [];
    let pi = 0, di = 0, si = 0;
    for (const b of bits) {
      const bx = sceneX(b.x);
      const tp = tiltPos(sceneY(b.y)); // lean bits with the dive plane
      const by = tp.y;
      const bz = tp.z;
      if (b.kind === 'pearl' && pi < MAX_PEARLS) {
        const m = pearls[pi++];
        m.visible = true;
        m.position.set(bx, by + (reducedMotion ? 0 : Math.sin(t * 3 + pi) * 0.5), bz);
      } else if (b.kind === 'debris' && di < MAX_DEBRIS) {
        dummy.position.set(bx, by, bz + (b.r * 7) % 2 - 1);
        dummy.rotation.set(b.r * 3, b.x * 0.05, 0);
        dummy.scale.setScalar(0.6 + b.r * 0.5);
        dummy.updateMatrix();
        debrisMesh.setMatrixAt(di++, dummy.matrix);
      } else if (b.kind === 'spark' && si < MAX_SPARKS) {
        sparkPos[si * 3] = bx;
        sparkPos[si * 3 + 1] = by;
        sparkPos[si * 3 + 2] = bz;
        const k = Math.min(1, b.life * 2);
        sparkCol[si * 3] = 1.0 * k;
        sparkCol[si * 3 + 1] = 0.55 * k;
        sparkCol[si * 3 + 2] = 0.2 * k;
        si++;
      } else if (b.kind === 'heal' && si < MAX_SPARKS) {
        // clean-streak restore sparkles (2026-10-29): green-cyan,
        // rising — the voyage rewarding clean diving.
        sparkPos[si * 3] = bx;
        sparkPos[si * 3 + 1] = by;
        sparkPos[si * 3 + 2] = bz;
        const k = Math.min(1, b.life * 2);
        sparkCol[si * 3] = 0.25 * k;
        sparkCol[si * 3 + 1] = 1.0 * k;
        sparkCol[si * 3 + 2] = 0.65 * k;
        si++;
      }
    }
    for (let i = pi; i < MAX_PEARLS; i++) pearls[i].visible = false;
    debrisMesh.count = di;
    debrisMesh.instanceMatrix.needsUpdate = true;
    sparkGeo.setDrawRange(0, si);
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;

    // damage flash
    flashMat.opacity = game ? Math.min(0.35, Math.max(0, game.flash)) : 0;

    // marine snow drift, sinking downward (frozen under reduced motion)
    if (!reducedMotion && dt > 0) {
      for (let i = 0; i < SNOW_COUNT; i++) {
        let y = snowPos[i * 3 + 1] - dt * 2.2;
        if (y < -34) y += 68;
        snowPos[i * 3 + 1] = y;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (disposed) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    disposed = true;
    reef.dispose();
    marine.dispose();
    contextGuard.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    renderer.dispose();
  }

  // never blank on first paint
  render(null, 0, 0);

  /**
   * Map a pointer position to a worldX on the play plane (z = 0).
   * Raycast, not a flat 0..720 lerp, so taps land where the player
   * is actually pointing even with the camera's slight angle.
   * Returns null if the ray misses the plane.
   */
  function pickWorldX(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    _ndc.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    _raycaster.setFromCamera(_ndc, camera);
    if (!_raycaster.ray.intersectPlane(_playPlane, _hit)) return null;
    const wx = _hit.x / SX + WORLD.width / 2;
    return Math.max(0, Math.min(WORLD.width, wx));
  }

  return { render, resize, dispose, pickWorldX };
}
