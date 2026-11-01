// app/water-slide/page.jsx — Olympus Water Slide: a winding slide ride.
//
// Tower start, twisting slide tube down to a splash pool, first-person
// slide camera with speed physics. One self-contained component.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const SLIDE_POINTS = [
  [0, 24, 0], [0, 23, -8], [4, 21, -14], [10, 19, -16], [14, 16, -12],
  [14, 13, -4], [10, 10, 2], [4, 8, 4], [-2, 6, 2], [-6, 4, -4],
  [-8, 2, -12], [-6, 1, -20], [0, 0.5, -26], [8, 0.3, -28], [16, 0.2, -26],
];

function buildSlideCurve() {
  const pts = SLIDE_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

export default function WaterSlidePage() {
  const containerRef = useRef(null);
  const [sliding, setSliding] = useState(false);
  const [speed, setSpeed] = useState(0);
  const slideRef = useRef({ t: 0, speed: 0, sliding: false });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a1a2e');
    scene.fog = new THREE.Fog('#0a1a2e', 60, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 400);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2cc, 0.85);
    sun.position.set(25, 40, 15);
    scene.add(sun);

    // Ground — sandy
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: '#d4a76a', roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const curve = buildSlideCurve();

    // Slide tube (open-top half pipe look via tube + water strip)
    const slideGeo = new THREE.TubeGeometry(curve, 200, 1.1, 12, false);
    const slideMat = new THREE.MeshStandardMaterial({ color: '#00b4d8', roughness: 0.25, metalness: 0.1 });
    scene.add(new THREE.Mesh(slideGeo, slideMat));

    // Water strip inside the slide
    const waterGeo = new THREE.TubeGeometry(curve, 200, 0.55, 8, false);
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#48cae4', roughness: 0.1, metalness: 0.3,
      transparent: true, opacity: 0.75,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = -0.35;
    scene.add(waterMesh);

    // Support pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#90e0ef', roughness: 0.6 });
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const pos = curve.getPointAt(t);
      if (pos.y > 2.5) {
        const h = pos.y - 0.8;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, h, 8), pillarMat);
        pillar.position.set(pos.x, h / 2, pos.z);
        scene.add(pillar);
      }
    }

    // Start tower
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(5, 24, 5),
      new THREE.MeshStandardMaterial({ color: '#0077b6', roughness: 0.7 })
    );
    tower.position.set(0, 12, 3);
    scene.add(tower);
    const towerTop = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1, 7),
      new THREE.MeshStandardMaterial({ color: '#023e8a', roughness: 0.7 })
    );
    towerTop.position.set(0, 24.5, 2);
    scene.add(towerTop);

    // Splash pool
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 10, 1, 24),
      new THREE.MeshStandardMaterial({ color: '#0096c7', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 })
    );
    pool.position.set(16, 0.4, -26);
    scene.add(pool);
    const poolRim = new THREE.Mesh(
      new THREE.TorusGeometry(10, 0.5, 8, 32),
      new THREE.MeshStandardMaterial({ color: '#caf0f8', roughness: 0.5 })
    );
    poolRim.rotation.x = Math.PI / 2;
    poolRim.position.set(16, 0.9, -26);
    scene.add(poolRim);

    // Rider (simple capsule on a mat)
    const rider = new THREE.Group();
    const mat = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.15, 2),
      new THREE.MeshStandardMaterial({ color: '#ff595e', roughness: 0.6 })
    );
    const bodyR = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.1, 4, 10),
      new THREE.MeshStandardMaterial({ color: '#ffd6a5', roughness: 0.6 })
    );
    bodyR.rotation.x = Math.PI / 2;
    bodyR.position.y = 0.45;
    rider.add(mat, bodyR);
    rider.visible = false;
    scene.add(rider);

    // Splash particles
    const splashGeo = new THREE.BufferGeometry();
    const splashCount = 60;
    const splashPos = new Float32Array(splashCount * 3);
    splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
    const splashMat = new THREE.PointsMaterial({ color: '#caf0f8', size: 0.35, transparent: true, opacity: 0.9 });
    const splash = new THREE.Points(splashGeo, splashMat);
    splash.visible = false;
    scene.add(splash);
    const splashVel = [];

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;

    const frame = (now) => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = slideRef.current;

      if (s.sliding) {
        const pos = curve.getPointAt(s.t);
        const ahead = curve.getPointAt(Math.min(s.t + 0.005, 1));
        const slope = (ahead.y - pos.y) / Math.max(0.001, ahead.distanceTo(pos));
        s.speed += -slope * 22 * dt;
        s.speed -= s.speed * 0.05 * dt;
        s.speed = Math.max(3, Math.min(s.speed, 30));
        s.t += (s.speed * dt) / curve.getLength();

        if (s.t >= 1) {
          // Splashdown!
          s.sliding = false;
          setSliding(false);
          setSpeed(0);
          rider.visible = false;
          // Burst the splash particles
          splash.visible = true;
          splashVel.length = 0;
          const arr = splashGeo.attributes.position.array;
          for (let i = 0; i < splashCount; i++) {
            arr[i * 3] = 16 + (Math.random() - 0.5) * 2;
            arr[i * 3 + 1] = 1;
            arr[i * 3 + 2] = -26 + (Math.random() - 0.5) * 2;
            splashVel.push([(Math.random() - 0.5) * 6, 4 + Math.random() * 5, (Math.random() - 0.5) * 6]);
          }
          splashGeo.attributes.position.needsUpdate = true;
          setTimeout(() => { splash.visible = false; }, 1500);
        } else {
          setSpeed(Math.round(s.speed * 3.6));
          const p = curve.getPointAt(s.t);
          const tangent = curve.getTangentAt(s.t);
          rider.visible = true;
          rider.position.copy(p);
          rider.position.y += 0.15;
          rider.lookAt(p.clone().add(tangent));
          // First-person slide camera
          const camPos = p.clone().addScaledVector(tangent, -2.2);
          camPos.y += 1.4;
          camera.position.copy(camPos);
          camera.lookAt(p.clone().addScaledVector(tangent, 10));
        }
      }

      // Splash particles fall
      if (splash.visible) {
        const arr = splashGeo.attributes.position.array;
        for (let i = 0; i < splashCount; i++) {
          splashVel[i][1] -= 12 * dt;
          arr[i * 3] += splashVel[i][0] * dt;
          arr[i * 3 + 1] += splashVel[i][1] * dt;
          arr[i * 3 + 2] += splashVel[i][2] * dt;
          if (arr[i * 3 + 1] < 0.5) arr[i * 3 + 1] = 0.5;
        }
        splashGeo.attributes.position.needsUpdate = true;
      }

      if (!s.sliding && !splash.visible) {
        const t = now * 0.00025;
        camera.position.set(Math.sin(t) * 35, 20, -10 + Math.cos(t) * 35);
        camera.lookAt(4, 8, -12);
      }

      // Water shimmer
      waterMat.opacity = 0.65 + Math.sin(now * 0.003) * 0.1;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a1a2e' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>🌊 WATER SLIDE</div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {sliding && (
        <div style={{ position: 'absolute', top: 48, left: 12, zIndex: 5, background: 'rgba(15,23,42,0.8)', color: '#48cae4', padding: '8px 16px', borderRadius: 12, fontSize: 16, fontWeight: 700 }}>
          {speed} km/h
        </div>
      )}
      {!sliding && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          {/* Water-slide art wrap (Merlin, 2026-11-01): generated backdrop +
              readability scrim; the card and every control below are
              untouched. */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: 'url(/images/water-slide/water-slide-menu-bg.webp)' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,20,38,0.72), rgba(8,20,38,0.5), rgba(8,20,38,0.85))' }} />
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>🌊</div>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>WATER SLIDE</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>
            Climb the tower, twist down the slide, splash into the pool.
          </div>
          <button
            type="button"
            onClick={() => { slideRef.current = { t: 0, speed: 4, sliding: true }; setSliding(true); }}
            style={{ marginTop: 8, background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}
          >
            SLIDE
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
