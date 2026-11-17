// lib/keepsake/scene.js
// The Keepsake globe: a layered 3D diorama sealed in glass, built from
// one photo (or a short video). Plain Three.js (no R3F) — a small
// self-contained scene.
//
// Layers, back to front:
//   1. extended backdrop — the photo, curved, edges melted into its own
//      colours (the honest reconstruction, labelled on the page)
//   2. midground pines + snow mounds on the ground disc
//   3. foreground snow bank — the photo's lower strip, faded to white
//   4. glass globe, brass ring, wooden base, engraved plaque
//   5. realistic snow — soft-edged flakes that fall, sway and accumulate
//
// Camera: custom orbit (lib/keepsake/camera.js). No recoil — a swipe
// leaves the camera exactly where it stops.
//
// ROUND 2 (Nov 17, 2026): the backdrop is fitted to the photo's own
// aspect (the whole photo fits a portrait phone, head and all); an
// interior view walks INSIDE the glass with the photo wrapped 360°;
// videos up to 2 minutes play inside the globe as a VideoTexture.
import * as THREE from 'three';
import { makeBackdropCanvas, makeForegroundCanvas, samplePalette, mediaSize, NEUTRAL_PALETTE } from './palette.js';
import {
  initialCamera, applySwipe, applyJoystick, cameraPosition,
  initialInteriorCamera, applyInteriorSwipe, applyInteriorJoystick,
  interiorCameraPosition, interiorLookTarget,
  fitBackdropPanel, zoomToExteriorRadius, zoomToInteriorFov,
  clampZoomT, ZOOM_T_DEFAULT, BACKDROP_R, BACKDROP_CENTER_Y, DEFAULT_FOV,
} from './camera.js';

const GLOBE_R = 2.0;
const GROUND_Y = -1.15;
const CAM_TARGET = { x: 0, y: -0.35, z: 0 };

// Deterministic pseudo-random so the trees sit still between renders.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Soft-edged snowflake sprite: a radial blob with faint crystalline
// arms, so flakes read as snow instead of dots or glow orbs.
function softFlakeTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let a = 0; a < 6; a++) {
    const t = (a / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(t) * 7, 32 + Math.sin(t) * 7);
    ctx.lineTo(32 + Math.cos(t) * 25, 32 + Math.sin(t) * 25);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makePine(height, rand) {
  const group = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x1e4d2c, roughness: 0.9 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.95 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, height * 0.22, 6), trunkMat);
  trunk.position.y = height * 0.11;
  group.add(trunk);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const f = 1 - i / tiers;
    const coneH = height * 0.42;
    const coneR = height * 0.22 * f + 0.02;
    const mat = i === tiers - 1 ? snowMat : green;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 8), mat);
    cone.position.y = height * 0.22 + coneH * 0.5 + i * coneH * 0.3;
    group.add(cone);
  }
  group.rotation.y = rand() * Math.PI * 2;
  return group;
}

function plaqueTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#3a2c14');
  g.addColorStop(0.5, '#6b5222');
  g.addColorStop(1, '#2e220e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#c9a24d';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 112);
  const label = (text || 'Keepsake').slice(0, 40) || 'Keepsake';
  let size = 52;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
  while (ctx.measureText(label).width > 460 && size > 18) {
    size -= 2;
    ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
  }
  ctx.fillStyle = '#5d4216';
  ctx.fillText(label, 256, 68);
  ctx.fillStyle = '#f0d493';
  ctx.fillText(label, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load that photo.'));
    img.src = src;
  });
}

// Load a video keepsake: muted + loop + playsInline so it can autoplay
// inside the globe on a phone. Resolves once the first frame is ready.
export function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (/^https?:\/\//.test(src)) video.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('That video took too long to open.')), 15000);
    video.onloadeddata = () => {
      clearTimeout(timer);
      resolve(video);
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Could not load that video.'));
    };
    video.src = src;
  });
}

export function createKeepsakeScene(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfe9f5, 10, 18);

  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 60);
  let cam = initialCamera();
  let interiorCam = initialInteriorCamera();
  let view = 'exterior';
  let zoomT = ZOOM_T_DEFAULT;
  const applyCamera = () => {
    if (view === 'interior') {
      const p = interiorCameraPosition(interiorCam);
      const l = interiorLookTarget(interiorCam);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(l.x, l.y, l.z);
      return;
    }
    const p = cameraPosition(cam, CAM_TARGET);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(CAM_TARGET.x, CAM_TARGET.y, CAM_TARGET.z);
  };
  applyCamera();

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xfff1d6, 1.25);
  key.position.set(3, 5, 4);
  scene.add(key);
  const glowLight = new THREE.PointLight(0xffd9a0, 6, 0, 1.2);
  glowLight.position.set(0, 0.6, 0.8);
  scene.add(glowLight);

  // --- ground disc -------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  scene.add(ground);

  // --- backdrop (the photo, curved) + foreground snow bank --------------
  // Exterior: the photo on a panel fitted to its own aspect, so the
  // whole photo fits the phone (see fitBackdropPanel). Interior: the
  // same photo wrapped the full 360° circle, seen from inside
  // (BackSide). The panel's side edges fade to transparent in the
  // canvas, so an orbit never meets a hard cut mid-screen.
  const backdropMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false, transparent: true });
  const backdrop = new THREE.Mesh(new THREE.BufferGeometry(), backdropMat);
  backdrop.position.y = BACKDROP_CENTER_Y;
  scene.add(backdrop);

  const interiorMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, transparent: true });
  const interiorBackdrop = new THREE.Mesh(new THREE.BufferGeometry(), interiorMat);
  interiorBackdrop.position.y = BACKDROP_CENTER_Y;
  interiorBackdrop.visible = false;
  scene.add(interiorBackdrop);

  function rebuildBackdrop(aspect) {
    const fit = fitBackdropPanel(aspect);
    backdrop.geometry.dispose();
    backdrop.geometry = new THREE.CylinderGeometry(
      BACKDROP_R, BACKDROP_R, fit.height, 48, 1, true,
      Math.PI - fit.thetaLength / 2, fit.thetaLength,
    );
    interiorBackdrop.geometry.dispose();
    interiorBackdrop.geometry = new THREE.CylinderGeometry(
      BACKDROP_R, BACKDROP_R, fit.height, 48, 1, true, 0, Math.PI * 2,
    );
    return fit;
  }
  rebuildBackdrop(1.5); // default sample aspect until a photo loads

  const fgMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false, transparent: true });
  const fgBank = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.45, 0.5, 48, 1, true, -0.95, 1.9),
    fgMat,
  );
  fgBank.position.y = GROUND_Y + 0.25;
  scene.add(fgBank);

  // --- pines + drifts ----------------------------------------------------
  const world = new THREE.Group();
  scene.add(world);
  const drifts = [];
  let driftSeed = 1;
  function rebuildWorld(seed) {
    for (const child of [...world.children]) {
      world.remove(child);
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    drifts.length = 0;
    const rand = mulberry32(seed);
    const driftMat = new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const h = 0.45 + rand() * 0.45;
      const pine = makePine(h, rand);
      const a = rand() * Math.PI * 2;
      const r = 0.55 + rand() * 0.6;
      pine.position.set(Math.cos(a) * r, GROUND_Y, Math.sin(a) * r - 0.15);
      world.add(pine);
    }
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.32 + rand() * 0.2, 16, 12), driftMat);
      d.scale.y = 0.22;
      const a = rand() * Math.PI * 2;
      const r = 0.9 + rand() * 0.5;
      d.position.set(Math.cos(a) * r, GROUND_Y + 0.02, Math.sin(a) * r);
      world.add(d);
      drifts.push(d);
    }
  }
  rebuildWorld(driftSeed);

  // --- glass globe, brass ring, wooden base, plaque ----------------------
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_R, 48, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity: 0.09,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      side: THREE.FrontSide,
      depthWrite: false,
    }),
  );
  glass.renderOrder = 10;
  scene.add(glass);

  const flakeTex = softFlakeTexture();
  const glint = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flakeTex, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  glint.scale.set(1.1, 1.1, 1);
  glint.position.set(-1.05, 1.25, 1.25);
  scene.add(glint);

  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24d, metalness: 0.85, roughness: 0.35 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.06, 12, 64), brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.98;
  scene.add(ring);

  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.62, 0.55, 48), wood);
  base.position.y = -2.28;
  scene.add(base);
  const baseTrim = new THREE.Mesh(new THREE.TorusGeometry(1.56, 0.035, 10, 64), brass);
  baseTrim.rotation.x = Math.PI / 2;
  baseTrim.position.y = -2.02;
  scene.add(baseTrim);

  let plaqueTex = plaqueTexture(opts.plaque || 'Keepsake');
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.29),
    new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.5, metalness: 0.4 }),
  );
  plaque.position.set(0, -2.28, 1.56);
  plaque.rotation.x = -0.1;
  scene.add(plaque);

  // --- snow ---------------------------------------------------------------
  // Largest disc radius that still sits inside the glass at height y.
  function radiusAtHeight(y) {
    return Math.sqrt(Math.max(0.04, GLOBE_R * GLOBE_R - y * y)) * 0.92;
  }
  function makeSnow(count, size, opacity) {
    const pos = new Float32Array(count * 3);
    const meta = [];
    for (let i = 0; i < count; i++) {
      const y = GROUND_Y + 0.1 + Math.random() * 2.7;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radiusAtHeight(y);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
      meta.push({
        fall: 0.12 + Math.random() * 0.2,
        sway: 0.4 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size,
      map: flakeTex,
      transparent: true,
      opacity,
      depthWrite: false,
      sizeAttenuation: true,
      color: 0xffffff,
    });
    const points = new THREE.Points(geo, mat);
    points.renderOrder = 5;
    points.frustumCulled = false;
    return { points, meta, count };
  }
  const snowSmall = makeSnow(850, 0.05, 0.9);
  const snowLarge = makeSnow(220, 0.11, 0.75);
  scene.add(snowSmall.points);
  scene.add(snowLarge.points);
  const snowSystems = [snowSmall, snowLarge];

  let snowfall = 1; // 0 light, 1 normal, 2 heavy
  const fallMul = [0.55, 1, 1.7];
  const snowOpacity = [0.55, 0.9, 1];
  let accum = 0;
  let joy = { x: 0, y: 0 };

  function updateSnow(dt, t) {
    const mul = fallMul[snowfall];
    for (const sys of snowSystems) {
      const pos = sys.points.geometry.attributes.position.array;
      for (let i = 0; i < sys.count; i++) {
        const m = sys.meta[i];
        m.vx *= 0.94;
        m.vy *= 0.94;
        m.vz *= 0.94;
        pos[i * 3] += Math.sin(t * m.sway + m.phase) * 0.0016 + m.vx * dt;
        pos[i * 3 + 1] += (-m.fall * mul + m.vy) * dt;
        pos[i * 3 + 2] += Math.cos(t * m.sway * 0.9 + m.phase) * 0.0012 + m.vz * dt;
        if (pos[i * 3 + 1] < GROUND_Y + 0.03) {
          const y = 1.55;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * radiusAtHeight(y);
          pos[i * 3] = Math.cos(a) * r;
          pos[i * 3 + 1] = y;
          pos[i * 3 + 2] = Math.sin(a) * r;
          m.vx = 0;
          m.vy = 0;
          m.vz = 0;
        }
      }
      sys.points.geometry.attributes.position.needsUpdate = true;
    }
    accum = Math.min(1, accum + dt * 0.004 * mul);
    const grow = 1 + accum * 0.18;
    for (const d of drifts) d.scale.y = 0.22 * grow;
  }

  // --- image / video ------------------------------------------------------
  let palette = null;
  let videoTex = null;
  let currentVideo = null;

  function applyPalette(el) {
    const isVideo = el && el.tagName === 'VIDEO';
    if (isVideo && el.readyState < 2) {
      // No frame yet — the neutral palette stands; nothing breaks.
      palette = NEUTRAL_PALETTE;
    } else {
      try {
        palette = samplePalette(el);
      } catch {
        palette = NEUTRAL_PALETTE;
      }
    }
    glowLight.color.setRGB(palette.glow.r / 255, palette.glow.g / 255, palette.glow.b / 255);
    groundMat.color.setRGB(
      (palette.ground.r / 255) * 0.25 + 0.75,
      (palette.ground.g / 255) * 0.25 + 0.75,
      (palette.ground.b / 255) * 0.25 + 0.75,
    );
  }

  function setImage(img, seedSource) {
    if (currentVideo) {
      currentVideo.pause();
      currentVideo = null;
    }
    if (videoTex) {
      videoTex.dispose();
      videoTex = null;
    }
    const { w, h } = mediaSize(img);
    rebuildBackdrop(w > 0 && h > 0 ? w / h : 1);
    const backCanvas = makeBackdropCanvas(img);
    const backTex = new THREE.CanvasTexture(backCanvas);
    backTex.colorSpace = THREE.SRGBColorSpace;
    if (backdropMat.map) backdropMat.map.dispose();
    backdropMat.map = backTex;
    backdropMat.needsUpdate = true;
    // The interior wrap wears the same texture.
    interiorMat.map = backTex;
    interiorMat.needsUpdate = true;

    const fgCanvas = makeForegroundCanvas(img);
    const fgTex = new THREE.CanvasTexture(fgCanvas);
    fgTex.colorSpace = THREE.SRGBColorSpace;
    if (fgMat.map) fgMat.map.dispose();
    fgMat.map = fgTex;
    fgMat.needsUpdate = true;

    applyPalette(img);
    driftSeed = hashString(seedSource || String(Date.now()));
    rebuildWorld(driftSeed);
    accum = 0;
  }

  // A video keepsake plays inside the globe as a VideoTexture (muted,
  // loop, playsInline). Its first frame feeds the foreground bank and
  // the palette; if the frame is not ready yet the neutral palette
  // stands and the bank keeps its previous frame.
  function setVideo(videoEl, seedSource) {
    if (currentVideo && currentVideo !== videoEl) currentVideo.pause();
    currentVideo = videoEl;
    try {
      const p = videoEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch {
      // Autoplay is a nicety; the first frame still shows.
    }
    const { w, h } = mediaSize(videoEl);
    rebuildBackdrop(w > 0 && h > 0 ? w / h : 1.78);
    if (videoTex) videoTex.dispose();
    if (backdropMat.map && backdropMat.map !== videoTex) backdropMat.map.dispose();
    videoTex = new THREE.VideoTexture(videoEl);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    videoTex.minFilter = THREE.LinearFilter;
    backdropMat.map = videoTex;
    backdropMat.needsUpdate = true;
    interiorMat.map = videoTex;
    interiorMat.needsUpdate = true;

    if (videoEl.readyState >= 2) {
      try {
        const fgCanvas = makeForegroundCanvas(videoEl);
        const fgTex = new THREE.CanvasTexture(fgCanvas);
        fgTex.colorSpace = THREE.SRGBColorSpace;
        if (fgMat.map) fgMat.map.dispose();
        fgMat.map = fgTex;
        fgMat.needsUpdate = true;
      } catch {
        // First frame not ready — the bank keeps its previous frame.
      }
    }
    applyPalette(videoEl);
    driftSeed = hashString(seedSource || String(Date.now()));
    rebuildWorld(driftSeed);
    accum = 0;
  }
  if (opts.image) setImage(opts.image, opts.imageSrc || '');

  // --- loop ----------------------------------------------------------------
  let raf = 0;
  let last = performance.now();
  let disposed = false;
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function tick(now) {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (joy.x !== 0 || joy.y !== 0) {
      if (view === 'interior') {
        interiorCam = applyInteriorJoystick(interiorCam, joy.x, joy.y, dt);
      } else {
        cam = applyJoystick(cam, joy.x, joy.y, Math.min(dt * 60, 3));
      }
      applyCamera();
    }
    updateSnow(dt, t);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    setImage,
    setVideo,
    getPalette: () => palette,
    getView: () => view,
    // Exterior <-> interior. Interior hides the exterior panel and the
    // foreground bank (both would surround the walker), shows the
    // 360° wrap, and switches the camera + zoom behaviour. The glass
    // is FrontSide, so from inside it is invisible and never blocks
    // the view. Snow, pines and drifts stay visible in both views.
    setView(next) {
      view = next === 'interior' ? 'interior' : 'exterior';
      backdrop.visible = view === 'exterior';
      interiorBackdrop.visible = view === 'interior';
      fgBank.visible = view === 'exterior';
      if (view === 'interior') {
        camera.fov = zoomToInteriorFov(zoomT);
      } else {
        camera.fov = DEFAULT_FOV;
        cam.radius = zoomToExteriorRadius(zoomT);
      }
      camera.updateProjectionMatrix();
      applyCamera();
    },
    // One zoom slider, two behaviours: exterior drives orbit radius
    // (within the camera clamp), interior drives FOV. The slider is
    // the set-point; the joystick may nudge the radius away from it
    // until the slider moves again.
    setZoom(t) {
      zoomT = clampZoomT(t);
      if (view === 'interior') {
        camera.fov = zoomToInteriorFov(zoomT);
      } else {
        cam.radius = zoomToExteriorRadius(zoomT);
      }
      camera.updateProjectionMatrix();
      applyCamera();
    },
    setPlaque(text) {
      const next = plaqueTexture(text);
      plaque.material.map.dispose();
      plaque.material.map = next;
      plaque.material.needsUpdate = true;
      plaqueTex = next;
    },
    swipe(dx, dy) {
      if (view === 'interior') {
        interiorCam = applyInteriorSwipe(interiorCam, dx, dy);
      } else {
        cam = applySwipe(cam, dx, dy);
      }
      applyCamera();
    },
    setJoystick(x, y) {
      joy = { x, y };
    },
    setSnowfall(level) {
      snowfall = Math.max(0, Math.min(2, level | 0));
      snowSmall.points.material.opacity = snowOpacity[snowfall];
      snowLarge.points.material.opacity = snowOpacity[snowfall] * 0.85;
    },
    shake(power = 1) {
      for (const sys of snowSystems) {
        for (const m of sys.meta) {
          m.vx += (Math.random() - 0.5) * 2.4 * power;
          m.vy += Math.random() * 1.6 * power;
          m.vz += (Math.random() - 0.5) * 2.4 * power;
        }
      }
      accum *= 0.85;
    },
    snapshot() {
      renderer.render(scene, camera);
      return new Promise((resolve) => {
        renderer.domElement.toBlob((b) => resolve(b), 'image/png');
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (currentVideo) currentVideo.pause();
      if (videoTex) videoTex.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.map) m.map.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
  };
}
