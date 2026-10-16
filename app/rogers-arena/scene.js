// Three.js scene factory for Rogers Arena.
// Fully procedural: no external textures, videos, or network requests.
// Restrained lighting: ACES tone mapping, exposure 1.15, no bloom pass —
// emissive materials only, so the arena geometry stays readable.

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import {
  MODES,
  getMode,
  cameraPosition,
  createMatch,
  tickMatch,
  formatClock,
  waveLift,
} from './arena';

const TIER1 = { rBottom: 33, rTop: 48, yBottom: 4, yTop: 20, seats: 2600 };
const TIER2 = { rBottom: 51, rTop: 66, yBottom: 25, yTop: 40, seats: 2200 };
const ARENA_CENTER = { x: 0, y: 20, z: 0 };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// ---- Procedural floor textures ----

function paintIce(ctx, S) {
  ctx.fillStyle = '#dfe9f2';
  ctx.fillRect(0, 0, S, S);
  // subtle ice noise
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(160,190,215,${0.04 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  const cx = S / 2;
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = S * 0.012;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, S);
  ctx.stroke();
  ctx.strokeStyle = '#2471a3';
  ctx.lineWidth = S * 0.02;
  [-0.22, 0.22].forEach((o) => {
    ctx.beginPath();
    ctx.moveTo(cx + o * S, 0);
    ctx.lineTo(cx + o * S, S);
    ctx.stroke();
  });
  // centre circle + faceoff dots
  ctx.strokeStyle = '#2471a3';
  ctx.lineWidth = S * 0.01;
  ctx.beginPath();
  ctx.arc(cx, cx, S * 0.11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#2471a3';
  ctx.beginPath();
  ctx.arc(cx, cx, S * 0.018, 0, Math.PI * 2);
  ctx.fill();
  [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(([ox, oy]) => {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(cx + ox * S, cx + oy * S, S * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(cx + ox * S, cx + oy * S, S * 0.075, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function paintStageFloor(ctx, S) {
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(120,140,180,0.16)';
  ctx.lineWidth = 2;
  const step = S / 16;
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(S, i * step);
    ctx.stroke();
  }
  // glow ring around the stage footprint
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.32);
  g.addColorStop(0, 'rgba(255,47,214,0.20)');
  g.addColorStop(1, 'rgba(255,47,214,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

function paintConcrete(ctx, S) {
  ctx.fillStyle = '#17181d';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2);
  ctx.stroke();
}

// ---- Jumbotron faces ----

function drawJumbotron(ctx, W, H, modeId, match, timeSec) {
  ctx.fillStyle = '#04060c';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120,180,255,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (modeId === 'concert') {
    const pulse = 0.6 + 0.4 * Math.sin(timeSec * 4);
    ctx.fillStyle = `rgba(255,47,214,${pulse})`;
    ctx.font = `900 ${H * 0.34}px system-ui, sans-serif`;
    ctx.fillText('LIVE', W / 2, H * 0.36);
    // equalizer bars
    const bars = 28;
    const bw = (W * 0.86) / bars;
    for (let i = 0; i < bars; i++) {
      const h =
        H * 0.3 * (0.25 + 0.75 * Math.abs(Math.sin(timeSec * 3 + i * 0.9)));
      ctx.fillStyle = i % 2 ? '#00f2ff' : '#ff2fd6';
      ctx.fillRect(W * 0.07 + i * bw + 1, H * 0.88 - h, bw - 2, h);
    }
  } else if (modeId === 'game') {
    ctx.fillStyle = '#e8eefc';
    ctx.font = `800 ${H * 0.13}px system-ui, sans-serif`;
    const status = match.final ? 'FINAL' : `PERIOD ${match.period}`;
    ctx.fillText(status, W / 2, H * 0.16);
    ctx.font = `900 ${H * 0.2}px system-ui, sans-serif`;
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText(match.homeName.toUpperCase(), W * 0.27, H * 0.44);
    ctx.fillStyle = '#fda4af';
    ctx.fillText(match.awayName.toUpperCase(), W * 0.73, H * 0.44);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${H * 0.3}px system-ui, sans-serif`;
    ctx.fillText(`${match.home} — ${match.away}`, W / 2, H * 0.72);
    if (!match.final) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `700 ${H * 0.11}px system-ui, sans-serif`;
      ctx.fillText(formatClock(match.clockSec), W / 2, H * 0.9);
    }
  } else {
    ctx.fillStyle = '#3f3f46';
    ctx.font = `800 ${H * 0.16}px system-ui, sans-serif`;
    ctx.fillText('WELCOME TO', W / 2, H * 0.36);
    ctx.fillStyle = '#71717a';
    ctx.font = `900 ${H * 0.24}px system-ui, sans-serif`;
    ctx.fillText('THE ARENA', W / 2, H * 0.62);
  }
}

// ============================================================

export function createArenaScene(mount, opts = {}) {
  const modeId = opts.mode || 'concert';
  const reducedMotion = !!opts.reducedMotion;
  let mode = getMode(modeId);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and the loop below freezes while the context is lost.
  const contextGuard = guardCanvasContext(renderer.domElement, { label: 'ROGERS ARENA' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.Fog(0x05070d, 230, 560);

  const camera = new THREE.PerspectiveCamera(
    55,
    mount.clientWidth / mount.clientHeight,
    1,
    1200
  );

  const disposables = [];
  const track = (x) => {
    disposables.push(x);
    return x;
  };

  // ---- Stars ----
  {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.85); // upper hemisphere
      const r = 520;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) + 20;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = track(
      new THREE.PointsMaterial({ color: 0xbfd4ff, size: 1.6, sizeAttenuation: false })
    );
    scene.add(new THREE.Points(g, m));
  }

  // ---- Outer ground ----
  {
    const g = track(new THREE.CircleGeometry(500, 48));
    const m = track(new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 1 }));
    const ground = new THREE.Mesh(g, m);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    scene.add(ground);
  }

  // ---- Floor (texture swaps per mode) ----
  const [floorCanvas, floorCtx] = makeCanvas(1024, 1024);
  const floorTex = track(new THREE.CanvasTexture(floorCanvas));
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 4;
  {
    const g = track(new THREE.CircleGeometry(30, 64));
    const m = track(
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.05 })
    );
    const floor = new THREE.Mesh(g, m);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.1;
    scene.add(floor);
  }

  // ---- Stage platform (concert mode only) ----
  const stage = new THREE.Mesh(
    track(new THREE.BoxGeometry(26, 3, 18)),
    track(new THREE.MeshStandardMaterial({ color: 0x11131c, roughness: 0.6 }))
  );
  stage.position.set(0, 1.5, 0);
  scene.add(stage);
  const stageEdge = new THREE.Mesh(
    track(new THREE.BoxGeometry(26.6, 0.5, 18.6)),
    track(new THREE.MeshBasicMaterial({ color: 0xff2fd6 }))
  );
  stageEdge.position.set(0, 3.1, 0);
  scene.add(stageEdge);

  // ---- Seating tiers ----
  const tierMat = new THREE.MeshStandardMaterial({
    color: 0x141824,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  track(tierMat);
  function addTier(t) {
    const h = t.yTop - t.yBottom;
    const g = track(new THREE.CylinderGeometry(t.rTop, t.rBottom, h, 64, 1, true));
    const mesh = new THREE.Mesh(g, tierMat);
    mesh.position.y = (t.yTop + t.yBottom) / 2;
    scene.add(mesh);
    // seat lip rings
    const lip = new THREE.Mesh(
      track(new THREE.TorusGeometry(t.rTop, 0.7, 8, 64)),
      track(new THREE.MeshStandardMaterial({ color: 0x1f2740, roughness: 0.7 }))
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = t.yTop;
    scene.add(lip);
  }
  addTier(TIER1);
  addTier(TIER2);

  // ---- Concourse ring + roof ring + arches ----
  {
    const conc = new THREE.Mesh(
      track(new THREE.TorusGeometry(49.5, 1.6, 10, 72)),
      track(new THREE.MeshStandardMaterial({ color: 0x232b45, roughness: 0.8 }))
    );
    conc.rotation.x = Math.PI / 2;
    conc.position.y = 22.5;
    scene.add(conc);

    const roof = new THREE.Mesh(
      track(new THREE.TorusGeometry(68, 2.6, 12, 72)),
      track(new THREE.MeshStandardMaterial({ color: 0x1a2138, roughness: 0.6, metalness: 0.4 }))
    );
    roof.rotation.x = Math.PI / 2;
    roof.position.y = 44;
    scene.add(roof);

    for (let i = 0; i < 4; i++) {
      const arch = new THREE.Mesh(
        track(new THREE.TorusGeometry(66, 1.1, 8, 48, Math.PI)),
        track(new THREE.MeshStandardMaterial({ color: 0x2b3a5e, roughness: 0.6, metalness: 0.4 }))
      );
      arch.rotation.y = (i / 4) * Math.PI; // fan the four arches across the roof
      arch.position.y = 6; // spring line just above the upper tier
      scene.add(arch);
    }
  }

  // ---- Jumbotron ----
  const faces = [];
  const jumboCanvases = [];
  for (let i = 0; i < 4; i++) {
    const [c, ctx] = makeCanvas(512, 288);
    jumboCanvases.push([c, ctx]);
    const t = track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    faces.push(new THREE.MeshBasicMaterial({ map: t }));
  }
  const jumboDark = track(new THREE.MeshBasicMaterial({ color: 0x05070c }));
  const jumbo = new THREE.Mesh(track(new THREE.BoxGeometry(13, 8, 13)), [
    faces[0],
    faces[1],
    jumboDark,
    jumboDark,
    faces[2],
    faces[3],
  ]);
  jumbo.position.y = 38;
  scene.add(jumbo);
  // hang cables
  for (const [cx, cz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    const cable = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.15, 0.15, 8, 6)),
      track(new THREE.MeshBasicMaterial({ color: 0x0a0c12 }))
    );
    cable.position.set(cx, 46, cz);
    scene.add(cable);
  }

  // ---- Crowd (points on the tier slopes) ----
  const crowd = { count: TIER1.seats + TIER2.seats };
  let crowdGeo, crowdBase, crowdAngle;
  {
    const n = crowd.count;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    crowdBase = new Float32Array(n * 3);
    crowdAngle = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tier = i < TIER1.seats ? TIER1 : TIER2;
      const t = Math.random();
      const r = tier.rBottom + (tier.rTop - tier.rBottom) * t + 0.6;
      const a = Math.random() * Math.PI * 2;
      const y = tier.yBottom + (tier.yTop - tier.yBottom) * t + 0.9;
      crowdBase[i * 3] = r * Math.cos(a);
      crowdBase[i * 3 + 1] = y;
      crowdBase[i * 3 + 2] = r * Math.sin(a);
      crowdAngle[i] = a;
      pos[i * 3] = crowdBase[i * 3];
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = crowdBase[i * 3 + 2];
      // dim varied seat colors; brightened by the wave in update()
      const v = 0.25 + Math.random() * 0.35;
      const warm = Math.random() < 0.2;
      col[i * 3] = v * (warm ? 1 : 0.75);
      col[i * 3 + 1] = v * 0.8;
      col[i * 3 + 2] = v * (warm ? 0.7 : 1);
    }
    crowdGeo = track(new THREE.BufferGeometry());
    crowdGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    crowdGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = track(
      new THREE.PointsMaterial({ size: 1.1, vertexColors: true, sizeAttenuation: true })
    );
    const pts = new THREE.Points(crowdGeo, m);
    pts.frustumCulled = false;
    scene.add(pts);
  }

  // ---- Lights ----
  const hemi = new THREE.HemisphereLight(0x8aa0c8, 0x0a0c12, 0.5);
  scene.add(hemi);
  const keyLight = new THREE.PointLight(0xffffff, 900, 260, 1.6);
  keyLight.position.set(0, 60, 0);
  scene.add(keyLight);
  const fillA = new THREE.PointLight(0x22d3ee, 500, 220, 1.6);
  fillA.position.set(-45, 40, 20);
  scene.add(fillA);
  const fillB = new THREE.PointLight(0xff2fd6, 500, 220, 1.6);
  fillB.position.set(45, 40, -20);
  scene.add(fillB);

  // ---- Sweeping spotlights + visible cones ----
  const spots = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const sx = Math.cos(a) * 55;
    const sz = Math.sin(a) * 55;
    const spot = new THREE.SpotLight(0xffffff, 0, 160, 0.32, 0.5, 1.2);
    spot.position.set(sx, 44, sz);
    spot.target.position.set(0, 0, 0);
    scene.add(spot);
    scene.add(spot.target);
    const coneLen = 46;
    const cone = new THREE.Mesh(
      track(new THREE.CylinderGeometry(1.2, 10, coneLen, 20, 1, true)),
      track(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.07,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      )
    );
    // orient cone from fixture toward target each frame; store for update
    scene.add(cone);
    spots.push({ spot, cone, fixture: new THREE.Vector3(sx, 44, sz), phase: a });
  }

  // ---- Match state (game mode) ----
  const match = createMatch(20260927);
  let lastClockShown = -1;

  function paintFloor() {
    if (mode.id === 'game') paintIce(floorCtx, 1024);
    else if (mode.id === 'concert') paintStageFloor(floorCtx, 1024);
    else paintConcrete(floorCtx, 1024);
    floorTex.needsUpdate = true;
  }

  function applyModeVisuals() {
    paintFloor();
    stage.visible = mode.id === 'concert';
    stageEdge.visible = mode.id === 'concert';
    stageEdge.material.color.setHex(mode.palette.key);
    hemi.intensity = mode.id === 'quiet' ? 0.18 : 0.5;
    keyLight.intensity = mode.id === 'quiet' ? 120 : 900;
    keyLight.color.setHex(mode.id === 'game' ? 0xf4f7ff : 0xfff2df);
    fillA.color.setHex(mode.palette.fill);
    fillB.color.setHex(mode.palette.key);
    fillA.intensity = mode.id === 'quiet' ? 60 : 500;
    fillB.intensity = mode.id === 'quiet' ? 60 : 500;
    for (const s of spots) {
      s.spot.intensity = mode.id === 'quiet' ? 0 : mode.spotlightSweep ? 900 : 350;
      s.spot.color.setHex(mode.id === 'game' ? 0xeaf2ff : mode.palette.key);
      s.cone.material.color.setHex(mode.id === 'game' ? 0xdbeafe : mode.palette.key);
      s.cone.material.opacity = mode.id === 'quiet' ? 0 : 0.07;
      s.cone.visible = mode.id !== 'quiet';
    }
    // reset jumbotron so it repaints immediately
    lastClockShown = -1;
    jumboCanvases.forEach(([, ctx], i) => {
      drawJumbotron(ctx, 512, 288, mode.id, match, 0);
    });
    jumbo.material.forEach((m) => {
      if (m.map) m.map.needsUpdate = true;
    });
  }

  function setMode(id) {
    mode = getMode(id);
    applyModeVisuals();
    renderOnce();
  }

  // ---- Camera ----
  let camState = { theta: 0.7, phi: 1.02, radius: 165 };
  function applyCamera(cam) {
    camState = cam;
    const p = cameraPosition(cam, ARENA_CENTER);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(ARENA_CENTER.x, ARENA_CENTER.y, ARENA_CENTER.z);
    renderOnce();
  }

  // ---- Frame update ----
  const clock = new THREE.Clock();
  let elapsed = 0;
  let jumboTimer = 0;

  function update(dt) {
    elapsed += dt;
    // crowd wave
    if (mode.waveSpeed > 0) {
      const posAttr = crowdGeo.getAttribute('position');
      const arr = posAttr.array;
      for (let i = 0; i < crowd.count; i++) {
        const lift = waveLift(crowdAngle[i] / (Math.PI * 2), elapsed, mode.waveSpeed);
        arr[i * 3 + 1] = crowdBase[i * 3 + 1] + lift * mode.waveAmp;
      }
      posAttr.needsUpdate = true;
    }
    // spotlight sweep (concert)
    if (mode.spotlightSweep) {
      for (const s of spots) {
        const a = elapsed * 0.9 + s.phase;
        const tx = Math.cos(a) * 20;
        const tz = Math.sin(a) * 20;
        s.spot.target.position.set(tx, 0, tz);
        // aim the cone: midpoint between fixture and target, lookAt target
        s.cone.position.set((s.fixture.x + tx) / 2, 22, (s.fixture.z + tz) / 2);
        s.cone.lookAt(tx, 0, tz);
        s.cone.rotateX(Math.PI / 2); // cylinder axis -> pointing direction
      }
      jumboTimer += dt;
      if (jumboTimer > 0.12) {
        jumboTimer = 0;
        jumboCanvases.forEach(([, ctx]) => drawJumbotron(ctx, 512, 288, mode.id, match, elapsed));
        faces.forEach((f) => (f.map.needsUpdate = true));
      }
    }
    // match sim (game mode)
    if (mode.id === 'game' && !reducedMotion) {
      tickMatch(match, dt);
      const shown = Math.ceil(match.clockSec);
      if (shown !== lastClockShown) {
        lastClockShown = shown;
        jumboCanvases.forEach(([, ctx]) =>
          drawJumbotron(ctx, 512, 288, mode.id, match, elapsed)
        );
        faces.forEach((f) => (f.map.needsUpdate = true));
      }
    }
    // gentle jumbotron rotation for life
    if (!reducedMotion) jumbo.rotation.y = elapsed * 0.15;
  }

  function renderOnce() {
    update(0);
    renderer.render(scene, camera);
  }

  // ---- Main loop ----
  let raf = 0;
  let last = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    renderer.render(scene, camera);
  }

  applyModeVisuals();
  applyCamera(camState);
  if (!reducedMotion) {
    raf = requestAnimationFrame(loop);
  }

  // ---- Resize ----
  const resize = () => {
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (reducedMotion) renderOnce();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  function dispose() {
    contextGuard.dispose();
    cancelAnimationFrame(raf);
    ro.disconnect();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
    disposables.forEach((d) => {
      try {
        d.dispose();
      } catch {
        /* already disposed via traverse */
      }
    });
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
  }

  return { setMode, applyCamera, dispose };
}
