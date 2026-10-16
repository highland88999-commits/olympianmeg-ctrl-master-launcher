// solarSystem.js — Hercules three.js scene factory.
// Port of highland88999-commits/Hercules ("Adaptive Solar Explorer").
// Changes from the original:
//  - Telemetry removed (no network requests of any kind — zero).
//  - No promo carousel, no paid-promotion links, no YouTube iframe player,
//    no mic access. The original asked for microphone access to pulse the
//    planets; that is gone.
//  - `three` is imported from the installed npm package, not a CDN.
//  - No bloom post-processing: the Sun glows via a restrained emissive
//    material and a soft sprite halo only. Lighting rule: planet surfaces stay
//    readable, no wash-out.
//  - Render quality adapts to the device (see tour.js QUALITY tiers).
//  - Exposes a mission API: flyTo(id), setFreeLook(on), tick control, dispose.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANETS, SUN, QUALITY } from './tour.js';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';

const SUN_LIGHT_INTENSITY = 3.2;

export function createSolarScene(canvas, { qualityTier = 'medium', reducedMotion = false, onArrive = null } = {}) {
  const q = QUALITY[qualityTier] || QUALITY.medium;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and tick() below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'HERCULES' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.maxPixelRatio));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 6000);
  camera.position.set(0, 260, 700);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 1.1;
  controls.minDistance = 30;
  controls.maxDistance = 1600;
  controls.enablePan = false;
  controls.enabled = false; // enabled on arrival

  // Lights: warm point light at the Sun + gentle ambient so night sides read.
  const sunLight = new THREE.PointLight(0xfff3d6, SUN_LIGHT_INTENSITY, 4000, 1.6);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xbfd4ff, 0.35));

  // Starfield (count scales with quality tier).
  const starGeo = new THREE.BufferGeometry();
  const verts = new Float32Array(q.starCount * 3);
  for (let i = 0; i < q.starCount; i++) {
    verts[i * 3] = (Math.random() - 0.5) * 5000;
    verts[i * 3 + 1] = (Math.random() - 0.5) * 5000;
    verts[i * 3 + 2] = (Math.random() - 0.5) * 5000;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.2, color: 0xcfe8ff, transparent: true, opacity: 0.75, sizeAttenuation: true,
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  // Sun: restrained emissive sphere + one soft halo sprite (no bloom pass).
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(SUN.radius, q.sphereSeg, q.sphereSeg),
    new THREE.MeshStandardMaterial({ color: SUN.color, emissive: SUN.color, emissiveIntensity: 1.15, roughness: 1 })
  );
  sunMesh.userData.planetId = 'sun';
  scene.add(sunMesh);

  const haloTex = makeHaloTexture();
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: haloTex, color: 0xffd76a, transparent: true, opacity: 0.35, depthWrite: false })
  );
  halo.scale.set(SUN.radius * 4.2, SUN.radius * 4.2, 1);
  scene.add(halo);

  // Planets + moons + orbit rings.
  const systems = [];
  for (const p of PLANETS) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.radius, q.sphereSeg, q.sphereSeg),
      new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85, metalness: 0.05 })
    );
    mesh.userData.planetId = p.id;
    scene.add(mesh);

    if (p.rings) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.radius * 1.45, p.radius * 2.5, 64),
        new THREE.MeshBasicMaterial({ color: 0xffeecc, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
      );
      ring.rotation.x = Math.PI / 2.15;
      mesh.add(ring);
    }

    const orbitRing = new THREE.Mesh(
      new THREE.RingGeometry(p.distance - 0.6, p.distance + 0.6, 180),
      new THREE.MeshBasicMaterial({ color: 0x3d5a80, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
    );
    orbitRing.rotation.x = Math.PI / 2;
    scene.add(orbitRing);

    const sys = {
      data: p,
      mesh,
      angle: Math.random() * Math.PI * 2,
      moons: p.moons.map((m) => {
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(m.radius, Math.max(12, q.sphereSeg / 2), Math.max(12, q.sphereSeg / 2)),
          new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.9 })
        );
        scene.add(moonMesh);
        return { data: m, mesh: moonMesh, angle: Math.random() * Math.PI * 2 };
      }),
    };
    systems.push(sys);
  }

  const byId = (id) => (id === 'sun' ? { mesh: sunMesh, data: SUN } : systems.find((s) => s.data.id === id));

  // ── Flight ────────────────────────────────────────────────────────────────
  // Cinematic camera flight: ease from current position to a vantage point
  // near the destination, looking at it the whole way.
  let flight = null; // { from, to, lookFrom, lookTo, t, dur, onDone }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function planetWorldPos(sys, out) {
    if (sys.data.id === 'sun') return out.set(0, 0, 0);
    out.set(Math.cos(sys.angle) * sys.data.distance, 0, Math.sin(sys.angle) * sys.data.distance);
    return out;
  }

  const tmpV = new THREE.Vector3();

  function flyTo(id, durationMs = 3600) {
    const sys = byId(id);
    if (!sys) return false;
    controls.enabled = false;

    const destPos = planetWorldPos(sys, new THREE.Vector3());
    const dir = destPos.clone().normalize();
    if (dir.lengthSq() < 0.001) dir.set(0, 0, 1); // Sun: approach along +z
    const standOff = Math.max(sys.data.radius * 5.5, 34);
    const to = destPos.clone().add(dir.multiplyScalar(standOff)).add(new THREE.Vector3(0, standOff * 0.45, 0));

    flight = {
      from: camera.position.clone(),
      to,
      lookFrom: controls.target.clone(),
      lookTo: destPos.clone(),
      t: 0,
      dur: Math.max(600, durationMs) / 1000,
      onDone: () => {
        controls.target.copy(destPos);
        controls.enabled = true;
        controls.minDistance = Math.max(sys.data.radius * 2.2, 12);
        controls.maxDistance = Math.max(standOff * 6, 200);
        if (onArrive) onArrive(id);
      },
    };

    if (reducedMotion) {
      // Calm mode: cut straight to the vantage point, no flight animation.
      camera.position.copy(to);
      flight.onDone();
      flight = null;
    }
    return true;
  }

  function setFreeLook(on) {
    controls.enabled = !!on;
  }

  function goHome() {
    controls.enabled = false;
    camera.position.set(0, 260, 700);
    controls.target.set(0, 0, 0);
    controls.minDistance = 30;
    controls.maxDistance = 1600;
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  let raf = 0;
  let last = performance.now();
  let running = true;
  const arrivedAt = { id: null };

  function placeSystem(sys) {
    if (sys.data.id !== 'sun') {
      sys.mesh.position.set(
        Math.cos(sys.angle) * sys.data.distance, 0,
        Math.sin(sys.angle) * sys.data.distance
      );
    }
    for (const m of sys.moons) {
      m.mesh.position.set(
        sys.mesh.position.x + Math.cos(m.angle) * m.data.dist,
        Math.sin(m.angle * 2.6) * m.data.dist * 0.06,
        sys.mesh.position.z + Math.sin(m.angle) * m.data.dist
      );
      m.mesh.rotation.y += 0.01;
    }
  }

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!reducedMotion) {
      starField.rotation.y += dt * 0.004;
      sunMesh.rotation.y += dt * 0.02;
    }

    for (const sys of systems) {
      if (!reducedMotion && sys.data.speed) sys.angle += sys.data.speed * dt;
      for (const m of sys.moons) {
        if (!reducedMotion) m.angle += m.data.speed * dt;
      }
      placeSystem(sys);
      if (!reducedMotion) sys.mesh.rotation.y += dt * 0.12;
    }
    // Sun has no orbit; place once.
    sunMesh.position.set(0, 0, 0);

    if (flight) {
      flight.t += dt;
      const k = smoothstep(Math.min(1, flight.t / flight.dur));
      camera.position.lerpVectors(flight.from, flight.to, k);
      // During flight, keep looking at the destination (which may drift).
      const sys = byId(arrivedAt.id);
      if (sys) planetWorldPos(sys, tmpV); else tmpV.copy(flight.lookTo);
      controls.target.lerpVectors(flight.lookFrom, tmpV, k);
      camera.lookAt(controls.target);
      if (flight.t >= flight.dur) {
        const done = flight.onDone;
        flight = null;
        done();
      }
    } else if (arrivedAt.id) {
      // Keep the free-look target glued to the planet as it orbits.
      const sys = byId(arrivedAt.id);
      if (sys && controls.enabled) {
        planetWorldPos(sys, tmpV);
        const delta = tmpV.clone().sub(controls.target);
        controls.target.copy(tmpV);
        camera.position.add(delta);
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  raf = requestAnimationFrame(tick);

  return {
    flyTo: (id, ms) => { arrivedAt.id = id; return flyTo(id, ms); },
    setFreeLook,
    goHome: () => { arrivedAt.id = null; goHome(); },
    dispose() {
      running = false;
      contextGuard.dispose();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      haloTex.dispose();
      renderer.dispose();
    },
  };
}

function makeHaloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,220,120,0.85)');
  g.addColorStop(0.4, 'rgba(255,190,90,0.28)');
  g.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
