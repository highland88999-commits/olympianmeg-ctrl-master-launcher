// app/order-67/throne-room.js — the Order 67 holochamber (Three.js).
// A dark circular chamber with a central projection dais, a holoprojector
// throwing a volumetric light cone, drifting dust motes, and a hologram
// plane where the peer's video materializes through a Palpatine-style
// shader (cyan monochrome, scanlines, flicker, reveal wipe).
//
// Optional realm dome: a 360° environment dropped OVER the throne room like
// a shelter (Merlin's call) — one inverted sphere, one texture, fading in on
// selection. Priority per realm: video -> banner image -> void.
//
// API: createThroneRoom(canvas, { reducedMotion }) ->
//   { setStream(videoEl, {mirror}), clearStream(), showHologram(), hideHologram(),
//     setBackdrop(realm), setProjecting(bool), dispose() }

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { backdropVideoUrl, backdropImageUrl, isBackdropRealm, throneCameraFrame, projectorSlotPositions } from '@/lib/order-67';

const HOLO_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HOLO_FRAGMENT = `
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uTime;
uniform float uReveal;
uniform float uFlicker;

void main() {
  vec2 uv = vUv;
  // subtle vertical wobble, like a shaky transmission
  uv.x += sin(uv.y * 36.0 + uTime * 2.6) * 0.004 * uFlicker;

  vec3 tex = texture2D(uMap, uv).rgb;
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));

  // cyan/blue monochrome hologram
  vec3 holo = vec3(0.35, 0.85, 1.0) * lum;

  // scanlines
  float scan = 0.78 + 0.22 * sin(vUv.y * 440.0);

  // layered-sine flicker
  float fl = 1.0 - uFlicker * 0.10 * (0.5 + 0.5 * sin(uTime * 43.0) * sin(uTime * 29.0 + 1.7));

  // materialize wipe rising from the bottom, bright leading edge
  float vis = 1.0 - smoothstep(uReveal - 0.05, uReveal, vUv.y);
  float edge = smoothstep(uReveal - 0.06, uReveal, vUv.y)
             * (1.0 - smoothstep(uReveal, uReveal + 0.015, vUv.y));
  holo += vec3(0.5, 0.9, 1.0) * edge * 1.6;

  float alpha = clamp(vis, 0.0, 1.0) * scan * fl;
  gl_FragColor = vec4(holo * alpha, alpha * 0.92);
}
`;

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a11';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(70,200,255,0.10)';
  g.lineWidth = 2;
  for (let r = 40; r < 260; r += 44) {
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = 'rgba(70,200,255,0.16)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(256, 256, 150, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeWallTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#060609';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(90,220,255,0.05)';
  for (let x = 0; x < 512; x += 64) {
    g.fillRect(x, 0, 3, 256);
  }
  g.fillStyle = 'rgba(90,220,255,0.08)';
  g.fillRect(0, 30, 512, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = 6;
  return t;
}

export function createThroneRoom(canvas, options = {}) {
  const { reducedMotion = false } = options;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and the loop below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'ORDER 67' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020204);
  scene.fog = new THREE.FogExp2(0x020204, 0.030);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
  camera.position.set(0, 3.6, 9.4);
  // Camera base: recomputed from framing mode + guest count, eased toward in
  // tick(). 'idle' frames the throne room; 'call' pulls back so the dais and
  // hologram sit in the visible band on a phone portrait.
  let framingMode = 'idle';
  const camBase = new THREE.Vector3(0, 3.6, 9.4);
  function updateCameraBase() {
    const f = throneCameraFrame(framingMode, projectors.size);
    camBase.set(0, f.y, f.z);
    controls.target.set(0, f.targetY, 0);
  }

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.85;
  controls.maxPolarAngle = 1.62;
  controls.minAzimuthAngle = -0.7;
  controls.maxAzimuthAngle = 0.7;
  controls.update();

  // --- lights: dim ambient + one localized cyan projector light ---
  scene.add(new THREE.AmbientLight(0x2a3a4d, 0.55));
  const projectorLight = new THREE.PointLight(0x46d8ff, 14, 22, 1.8);
  projectorLight.position.set(0, 4.2, 0);
  scene.add(projectorLight);
  const rim = new THREE.DirectionalLight(0x1c4a66, 0.5);
  rim.position.set(-6, 8, -4);
  scene.add(rim);

  // --- chamber: floor, wall, ceiling ring ---
  const disposables = [];
  const track = (obj) => { disposables.push(obj); return obj; };

  const floor = new THREE.Mesh(
    track(new THREE.CircleGeometry(18, 64)),
    track(new THREE.MeshStandardMaterial({
      map: makeFloorTexture(), color: 0xffffff, roughness: 0.85, metalness: 0.25,
    }))
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wall = new THREE.Mesh(
    track(new THREE.CylinderGeometry(18, 18, 13, 64, 1, true)),
    track(new THREE.MeshStandardMaterial({
      map: makeWallTexture(), color: 0xffffff, roughness: 1, metalness: 0,
      side: THREE.BackSide, transparent: true,
    }))
  );
  wall.position.y = 6.5;
  scene.add(wall);
  const wallMat = wall.material;
  // Realm drop: the black chamber wall fades to ~98% transparent so the realm
  // dome art dominates (Merlin: "make black space 98% transparent upon realm
  // drop"). The floor stays — it grounds the dais.
  let wallFade = 1;
  let wallFadeTarget = 1;

  const ceilingRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(6.5, 0.07, 10, 72)),
    track(new THREE.MeshBasicMaterial({ color: 0x1e5f7a }))
  );
  ceilingRing.rotation.x = Math.PI / 2;
  ceilingRing.position.y = 11.5;
  scene.add(ceilingRing);

  // --- dais ---
  const dais = new THREE.Mesh(
    track(new THREE.CylinderGeometry(2.4, 2.8, 0.55, 48)),
    track(new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.4, metalness: 0.8 }))
  );
  dais.position.y = 0.275;
  scene.add(dais);

  const daisRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(2.38, 0.045, 12, 72)),
    track(new THREE.MeshBasicMaterial({ color: 0x35e0ff }))
  );
  daisRing.rotation.x = Math.PI / 2;
  daisRing.position.y = 0.56;
  scene.add(daisRing);

  // --- holoprojector ---
  const projector = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.26, 0.34, 0.34, 24)),
    track(new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.35, metalness: 0.9 }))
  );
  projector.position.y = 0.72;
  scene.add(projector);

  const lens = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.13, 20, 14)),
    track(new THREE.MeshBasicMaterial({ color: 0x9beaff }))
  );
  lens.position.y = 0.93;
  scene.add(lens);

  // --- volumetric light cone (apex at the projector, widening upward) ---
  const coneGeo = track(new THREE.ConeGeometry(1.95, 4.8, 48, 1, true));
  coneGeo.rotateX(Math.PI); // apex down (BufferGeometry rotation API: rotateX/Y/Z)
  const coneMat = track(new THREE.MeshBasicMaterial({
    color: 0x2fb9e8, transparent: true, opacity: 0.075,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 0.95 + 2.4;
  scene.add(cone);

  // --- dust motes drifting up through the cone ---
  const DUST = reducedMotion ? 0 : 130;
  let dustGeo = null;
  let dustPts = null;
  let dustVel = null;
  if (DUST > 0) {
    const pos = new Float32Array(DUST * 3);
    dustVel = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      const r = Math.sqrt(Math.random()) * 1.6;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 1.0 + Math.random() * 4.4;
      pos[i * 3 + 2] = Math.sin(a) * r;
      dustVel[i] = 0.12 + Math.random() * 0.25;
    }
    dustGeo = track(new THREE.BufferGeometry());
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustPts = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({
      color: 0x7fd8ff, size: 0.035, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })));
    scene.add(dustPts);
  }

  // --- the hologram plane ---
  const holoUniforms = {
    uMap: { value: null },
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uFlicker: { value: reducedMotion ? 0 : 1 },
  };
  const holoMat = track(new THREE.ShaderMaterial({
    vertexShader: HOLO_VERTEX,
    fragmentShader: HOLO_FRAGMENT,
    uniforms: holoUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const holoPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(1.7, 2.55)), holoMat);
  holoPlane.position.y = 2.05;
  holoPlane.visible = false;
  scene.add(holoPlane);

  let videoTexture = null;

  // --- realm dome: a 360° environment dropped OVER the throne room ---
  // "like a horse shelter" (Merlin): the realm envelops the scene instead of
  // hanging as a flat plane behind the dais. One sphere, one texture —
  // phone-cheap. Fades in on selection; void on 'none' or missing files.
  let domeMesh = null;
  let domeVideoEl = null;
  let domeToken = 0;
  let domeFade = 0;       // 0..1, animated toward domeFadeTarget in tick()
  let domeFadeTarget = 0;
  const DOME_RADIUS = 42;
  const texLoader = new THREE.TextureLoader();

  function clearDome() {
    domeFade = 0;
    domeFadeTarget = 0;
    if (domeMesh) {
      scene.remove(domeMesh);
      if (domeMesh.material.map) domeMesh.material.map.dispose();
      domeMesh.material.dispose();
      domeMesh.geometry.dispose();
      domeMesh = null;
    }
    if (domeVideoEl) {
      try {
        domeVideoEl.pause();
        domeVideoEl.removeAttribute('src');
        domeVideoEl.load();
      } catch { /* noop */ }
      domeVideoEl = null;
    }
  }

  function showDomeTexture(tex, token) {
    if (token !== domeToken) {
      if (tex && typeof tex.dispose === 'function') tex.dispose();
      return;
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    clearDome();
    const geo = new THREE.SphereGeometry(DOME_RADIUS, 48, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,   // camera sits inside the shelter
      fog: false,             // the void fog must not wash out the realm
      transparent: true,
      opacity: 0,             // fades in via domeFade in tick()
      depthWrite: false,
    });
    mat.color.setScalar(0.95); // bright: the dome IS the wrap here — the lighting rule
    // means not washing it out with bloom, not dimming the art itself
    domeMesh = new THREE.Mesh(geo, mat);
    domeMesh.renderOrder = -10; // paint first, behind everything
    scene.add(domeMesh);
    domeFadeTarget = 1;
  }

  // Probe a backdrop video: resolves with the element on canplay, rejects on
  // error/timeout so the chain falls through to the banner image.
  function probeBackdropVideo(url, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      let done = false;
      const timer = setTimeout(() => finish(false), timeoutMs);
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (ok) {
          v.play().catch(() => {});
          resolve(v);
        } else {
          try { v.removeAttribute('src'); v.load(); } catch { /* noop */ }
          reject(new Error('backdrop video unavailable'));
        }
      }
      v.oncanplay = () => finish(true);
      v.onerror = () => finish(false);
      v.src = url;
    });
  }

  // --- guest projectors: extra daises for multi-guest calls ---
  // Each guest is an independent 1:1 WebRTC call in its own room; here each
  // gets a scaled-down dais + cone + its own hologram shader instance
  // (Eidolon effect per guest). Guests fan behind the main dais; the camera
  // pulls back as they arrive (see layoutProjectors).
  const projectors = new Map(); // id -> record
  const GUEST_SCALE = 0.78;

  function makeProjectorParts(scale) {
    const group = new THREE.Group();
    const rec = { group, videoTexture: null, revealTarget: 0, revealShown: false };
    const d = new THREE.Mesh(
      track(new THREE.CylinderGeometry(2.4 * scale, 2.8 * scale, 0.55 * scale, 40)),
      track(new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.4, metalness: 0.8 }))
    );
    d.position.y = 0.275 * scale;
    group.add(d);
    const ring = new THREE.Mesh(
      track(new THREE.TorusGeometry(2.38 * scale, 0.045 * scale, 10, 60)),
      track(new THREE.MeshBasicMaterial({ color: 0x35e0ff }))
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.56 * scale;
    group.add(ring);
    const proj = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.26 * scale, 0.34 * scale, 0.34 * scale, 20)),
      track(new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.35, metalness: 0.9 }))
    );
    proj.position.y = 0.72 * scale;
    group.add(proj);
    const cg = track(new THREE.ConeGeometry(1.95 * scale, 4.8 * scale, 40, 1, true));
    cg.rotateX(Math.PI); // apex down (BufferGeometry rotation API)
    const cm = track(new THREE.MeshBasicMaterial({
      color: 0x2fb9e8, transparent: true, opacity: 0.075,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    const cone = new THREE.Mesh(cg, cm);
    cone.position.y = (0.95 + 2.4) * scale;
    group.add(cone);
    rec.coneMat = cm;
    const uniforms = {
      uMap: { value: null },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uFlicker: { value: reducedMotion ? 0 : 1 },
    };
    const hm = track(new THREE.ShaderMaterial({
      vertexShader: HOLO_VERTEX,
      fragmentShader: HOLO_FRAGMENT,
      uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const hp = new THREE.Mesh(track(new THREE.PlaneGeometry(1.7 * scale, 2.55 * scale)), hm);
    hp.position.y = 2.05 * scale;
    hp.visible = false;
    group.add(hp);
    rec.holoUniforms = uniforms;
    rec.holoPlane = hp;
    rec.baseHoloY = 2.05 * scale;
    return rec;
  }

  function layoutProjectors() {
    const slots = projectorSlotPositions(projectors.size);
    let i = 0;
    for (const rec of projectors.values()) {
      const sl = slots[i++] || { x: 0, z: -5 };
      rec.group.position.set(sl.x, 0, sl.z);
    }
    updateCameraBase();
  }

  function disposeProjectorParts(rec) {
    rec.group.traverse((o) => {
      if (o.geometry && typeof o.geometry.dispose === 'function') o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map && typeof m.map.dispose === 'function' && m.map !== rec.videoTexture) {
            try { m.map.dispose(); } catch { /* noop */ }
          }
          if (typeof m.dispose === 'function') {
            try { m.dispose(); } catch { /* noop */ }
          }
        }
      }
    });
  }

  // --- reveal animation state ---
  let revealTarget = 0;
  let revealShown = false;

  // --- resize ---
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // --- main loop ---
  let raf = 0;
  const clock = new THREE.Clock();
  const driftT = Math.random() * 100;

  function tick() {
    raf = requestAnimationFrame(tick);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // hologram shader clock + reveal tween
    holoUniforms.uTime.value = t;
    const cur = holoUniforms.uReveal.value;
    if (Math.abs(cur - revealTarget) > 0.001) {
      const next = cur + Math.sign(revealTarget - cur) * dt * (reducedMotion ? 4 : 0.9);
      holoUniforms.uReveal.value = Math.min(1, Math.max(0, next));
      if (revealTarget === 0 && holoUniforms.uReveal.value === 0 && revealShown) {
        holoPlane.visible = false;
        revealShown = false;
      }
    }

    // gentle life: cone breathing, hologram bob, lens pulse
    // ease toward the framing base every frame (also under reduced motion —
    // only the whisper drift and breathing are motion-gated)
    {
      const k = Math.min(1, dt * 3);
      const px = reducedMotion ? 0 : Math.sin(driftT + t * 0.07) * 0.55;
      const py = reducedMotion ? camBase.y : camBase.y + Math.sin(driftT * 1.3 + t * 0.05) * 0.25;
      camera.position.x += (px - camera.position.x) * k;
      camera.position.y += (py - camera.position.y) * k;
      camera.position.z += (camBase.z - camera.position.z) * k;
    }
    if (!reducedMotion) {
      coneMat.opacity = 0.065 + 0.02 * (0.5 + 0.5 * Math.sin(t * 1.7));
      holoPlane.position.y = 2.05 + Math.sin(t * 1.1) * 0.045;
      const s = 1 + 0.06 * Math.sin(t * 3.2);
      lens.scale.set(s, s, s);
    }

    // realm dome: fade toward target, whisper-drift for life
    if (domeMesh) {
      const dd = domeFadeTarget - domeFade;
      if (Math.abs(dd) > 0.003) {
        domeFade += Math.sign(dd) * dt * (reducedMotion ? 5 : 1.5);
        domeFade = Math.min(1, Math.max(0, domeFade));
        domeMesh.material.opacity = domeFade;
      } else if (domeMesh.material.opacity !== domeFadeTarget) {
        domeFade = domeFadeTarget;
        domeMesh.material.opacity = domeFadeTarget;
      }
      if (!reducedMotion) domeMesh.rotation.y += dt * 0.004;
    }

    // realm drop: black wall toward 98% transparent (or back to solid)
    if (Math.abs(wallFade - wallFadeTarget) > 0.004) {
      wallFade += Math.sign(wallFadeTarget - wallFade) * dt * 1.6;
      wallFade = Math.min(1, Math.max(0.02, wallFade));
      wallMat.opacity = wallFade;
    }

    // guest projectors: reveal tween + idle life per hologram
    for (const rec of projectors.values()) {
      rec.holoUniforms.uTime.value = t;
      const cur = rec.holoUniforms.uReveal.value;
      if (Math.abs(cur - rec.revealTarget) > 0.001) {
        const next = cur + Math.sign(rec.revealTarget - cur) * dt * (reducedMotion ? 4 : 0.9);
        rec.holoUniforms.uReveal.value = Math.min(1, Math.max(0, next));
        if (rec.revealTarget === 0 && rec.holoUniforms.uReveal.value === 0 && rec.revealShown) {
          rec.holoPlane.visible = false;
          rec.revealShown = false;
        }
      }
      if (!reducedMotion) {
        rec.coneMat.opacity = 0.065 + 0.02 * (0.5 + 0.5 * Math.sin(t * 1.7 + rec.baseHoloY));
        rec.holoPlane.position.y = rec.baseHoloY + Math.sin(t * 1.1 + rec.baseHoloY) * 0.045;
      }
    }

    // dust rises through the cone
    if (dustPts) {
      const p = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST; i++) {
        p[i * 3 + 1] += dustVel[i] * dt;
        if (p[i * 3 + 1] > 5.6) p[i * 3 + 1] = 1.0;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  return {
    /** Attach a video element as the hologram source. */
    setStream(videoEl, { mirror = false } = {}) {
      if (videoTexture) {
        videoTexture.dispose();
        videoTexture = null;
      }
      if (!videoEl) return;
      videoTexture = new THREE.VideoTexture(videoEl);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      if (mirror) {
        videoTexture.wrapS = THREE.RepeatWrapping;
        videoTexture.repeat.x = -1;
      }
      holoUniforms.uMap.value = videoTexture;
    },
    clearStream() {
      if (videoTexture) {
        holoUniforms.uMap.value = null;
        videoTexture.dispose();
        videoTexture = null;
      }
    },
    /** Materialize the hologram with the rising wipe. */
    showHologram() {
      holoPlane.visible = true;
      revealShown = true;
      revealTarget = 1;
    },
    hideHologram() {
      revealTarget = 0;
    },
    get hologramVisible() {
      return revealShown;
    },
    /**
     * Drop a realm over the throne room. 'none'/unknown -> void.
     * Chain: realm video -> banner image -> void. Never a broken texture.
     */
    setBackdrop(realm) {
      domeToken += 1;
      const token = domeToken;
      const r = String(realm || '').toLowerCase();
      if (!isBackdropRealm(r)) {
        clearDome();
        wallFadeTarget = 1; // void: the chamber wall returns
        return;
      }
      wallFadeTarget = 0.02; // realm drop: black space to ~98% transparent
      probeBackdropVideo(backdropVideoUrl(r)).then(
        (v) => {
          if (token !== domeToken) {
            try { v.pause(); } catch { /* noop */ }
            return;
          }
          domeVideoEl = v;
          showDomeTexture(new THREE.VideoTexture(v), token);
        },
        () => {
          if (token !== domeToken) return;
          texLoader.load(
            backdropImageUrl(r),
            (tex) => showDomeTexture(tex, token),
            undefined,
            () => { if (token === domeToken) clearDome(); }
          );
        }
      );
    },
    /** Brighter cone while a call is live, calmer while idle. */
    setProjecting(on) {
      coneMat.opacity = on ? 0.11 : 0.075;
    },
    /**
     * Camera framing: 'idle' frames the throne room; 'call' pulls back so the
     * dais + hologram sit in the visible band on a phone portrait.
     */
    setFraming(mode) {
      framingMode = mode === 'call' ? 'call' : 'idle';
      updateCameraBase();
    },
    /** Add a guest projector dais (multi-guest). Returns nothing; id-keyed. */
    addProjector(id) {
      if (!id || projectors.has(id)) return;
      const rec = makeProjectorParts(GUEST_SCALE);
      projectors.set(id, rec);
      scene.add(rec.group);
      layoutProjectors();
    },
    /** Remove a guest projector and free its GPU resources. */
    removeProjector(id) {
      const rec = projectors.get(id);
      if (!rec) return;
      if (rec.videoTexture) {
        rec.holoUniforms.uMap.value = null;
        rec.videoTexture.dispose();
        rec.videoTexture = null;
      }
      scene.remove(rec.group);
      disposeProjectorParts(rec);
      projectors.delete(id);
      layoutProjectors();
    },
    /** Attach a video element as a guest's hologram source. */
    setProjectorStream(id, videoEl, { mirror = false } = {}) {
      const rec = projectors.get(id);
      if (!rec) return;
      if (rec.videoTexture) {
        rec.videoTexture.dispose();
        rec.videoTexture = null;
      }
      if (!videoEl) return;
      rec.videoTexture = new THREE.VideoTexture(videoEl);
      rec.videoTexture.colorSpace = THREE.SRGBColorSpace;
      if (mirror) {
        rec.videoTexture.wrapS = THREE.RepeatWrapping;
        rec.videoTexture.repeat.x = -1;
      }
      rec.holoUniforms.uMap.value = rec.videoTexture;
    },
    clearProjectorStream(id) {
      const rec = projectors.get(id);
      if (!rec || !rec.videoTexture) return;
      rec.holoUniforms.uMap.value = null;
      rec.videoTexture.dispose();
      rec.videoTexture = null;
    },
    /** Materialize / dematerialize a guest hologram. */
    showProjector(id) {
      const rec = projectors.get(id);
      if (!rec) return;
      rec.holoPlane.visible = true;
      rec.revealShown = true;
      rec.revealTarget = 1;
    },
    hideProjector(id) {
      const rec = projectors.get(id);
      if (!rec) return;
      rec.revealTarget = 0;
    },
    get projectorCount() {
      return projectors.size;
    },
    dispose() {
      contextGuard.dispose();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      controls.dispose();
      clearDome();
      for (const d of disposables) {
        if (d && typeof d.dispose === 'function') d.dispose();
      }
      if (videoTexture) videoTexture.dispose();
      renderer.dispose();
    },
  };
}
