// app/attractions-complex/page.jsx — Olympus Attractions Complex (Merlin, 2026-10-31).
//
// Wrapped in EPIC graphics: a cosmic night midway, colossal rotating
// monument with orbiting rings, ember particles rising, god-ray light
// pillars, and portal gates wreathed in energy. Portals to every ride.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';

const ATTRACTIONS = [
  { key: 'rollercoaster', name: 'Rollercoaster', icon: '🎢', color: '#e74c3c', angle: 0 },
  { key: 'merry-go-round', name: 'Merry-Go-Round', icon: '🎠', color: '#f472b6', angle: 90 },
  { key: 'water-slide', name: 'Water Slide', icon: '🌊', color: '#00b4d8', angle: 180 },
  { key: 'hall-of-mirrors', name: 'Hall of Mirrors', icon: '🪞', color: '#a855f7', angle: 270 },
];

export default function AttractionsComplexPage() {
  const containerRef = useRef(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#05030f');
    scene.fog = new THREE.Fog('#05030f', 70, 220);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, 500);

    scene.add(new THREE.AmbientLight(0x8877ff, 0.35));
    const moon = new THREE.DirectionalLight(0xaaaaff, 0.45);
    moon.position.set(-30, 40, -20);
    scene.add(moon);

    // ---- Starfield ----
    const starGeo = new THREE.BufferGeometry();
    const starCount = 700;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 400;
      starPos[i * 3 + 1] = 15 + Math.random() * 120;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#cdd6ff', size: 0.55, transparent: true, opacity: 0.9 })));

    // ---- Nebula glow sprites (big soft discs) ----
    const nebulaColors = [0x6d28d9, 0x0ea5e9, 0xdb2777];
    nebulaColors.forEach((c, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, color: c, transparent: true, opacity: 0.28, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(120, 120, 1);
      const a = (i / 3) * Math.PI * 2;
      sprite.position.set(Math.cos(a) * 90, 55, Math.sin(a) * 90);
      scene.add(sprite);
    });

    // ---- Obsidian midway ----
    const midway = new THREE.Mesh(
      new THREE.CircleGeometry(30, 56),
      new THREE.MeshStandardMaterial({ color: '#14101f', roughness: 0.35, metalness: 0.55 })
    );
    midway.rotation.x = -Math.PI / 2;
    scene.add(midway);
    // Glowing inlay rings
    const inlayColors = [0x8b5cf6, 0x06b6d4, 0xec4899];
    inlayColors.forEach((c, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(9 + i * 6, 9.35 + i * 6, 56),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      scene.add(ring);
    });

    // ---- Colossal monument: obelisk + orbiting rings ----
    const monument = new THREE.Group();
    const obelisk = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 16, 4),
      new THREE.MeshStandardMaterial({ color: '#1e1b2e', roughness: 0.25, metalness: 0.85, flatShading: true })
    );
    obelisk.position.y = 8;
    obelisk.rotation.y = Math.PI / 4;
    monument.add(obelisk);
    // Energy core
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: '#f0abfc' })
    );
    core.position.y = 8;
    monument.add(core);
    const coreLight = new THREE.PointLight(0xd946ef, 3, 45);
    coreLight.position.y = 8;
    monument.add(coreLight);
    // Orbiting rings
    const orbitRings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(5.5 + i * 1.8, 0.14, 8, 48),
        new THREE.MeshBasicMaterial({ color: [0x8b5cf6, 0x06b6d4, 0xf0abfc][i], transparent: true, opacity: 0.85 })
      );
      ring.position.y = 8;
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
      monument.add(ring);
      orbitRings.push({ mesh: ring, speed: (i % 2 ? -1 : 1) * (0.4 + i * 0.2), tilt: ring.rotation.x });
    }
    scene.add(monument);

    // ---- God-ray light pillars ----
    const pillarMat = new THREE.MeshBasicMaterial({ color: '#a78bfa', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.8, 42, 10, 1, true), pillarMat);
      pillar.position.set(Math.cos(a) * 24, 21, Math.sin(a) * 24);
      scene.add(pillar);
    }

    // ---- Rising ember particles ----
    const emberCount = 160;
    const emberGeo = new THREE.BufferGeometry();
    const emberPos = new Float32Array(emberCount * 3);
    const emberVel = [];
    for (let i = 0; i < emberCount; i++) {
      emberPos[i * 3] = (Math.random() - 0.5) * 70;
      emberPos[i * 3 + 1] = Math.random() * 30;
      emberPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      emberVel.push(0.6 + Math.random() * 1.4);
    }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ color: '#fbbf24', size: 0.32, transparent: true, opacity: 0.85 }));
    scene.add(embers);

    // ---- Portal gates wreathed in energy ----
    const portals = [];
    for (const attr of ATTRACTIONS) {
      const a = (attr.angle * Math.PI) / 180;
      const x = Math.cos(a) * 19;
      const z = Math.sin(a) * 19;
      const gate = new THREE.Group();
      // Main ring
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.4, 0.3, 10, 32),
        new THREE.MeshBasicMaterial({ color: attr.color })
      );
      gate.add(ring);
      // Outer energy wisp ring
      const wisp = new THREE.Mesh(
        new THREE.TorusGeometry(3.1, 0.09, 8, 40),
        new THREE.MeshBasicMaterial({ color: attr.color, transparent: true, opacity: 0.6 })
      );
      gate.add(wisp);
      gate.position.set(x, 3.1, z);
      gate.lookAt(0, 3.1, 0);
      scene.add(gate);
      // Obsidian pedestal with glowing edge
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 0.7, 16), new THREE.MeshStandardMaterial({ color: '#0d0a18', roughness: 0.3, metalness: 0.7 }));
      ped.position.set(x, 0.35, z);
      scene.add(ped);
      const pedGlow = new THREE.Mesh(
        new THREE.TorusGeometry(1.85, 0.07, 6, 24),
        new THREE.MeshBasicMaterial({ color: attr.color })
      );
      pedGlow.rotation.x = Math.PI / 2;
      pedGlow.position.set(x, 0.72, z);
      scene.add(pedGlow);
      // Light beam to the sky
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.6, 26, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: attr.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
      );
      beam.position.set(x, 14, z);
      scene.add(beam);
      portals.push({ ...attr, x, z, mesh: ring, wisp, gate });
    }

    // ---- Click to enter ----
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(portals.map((p) => p.mesh));
      if (hits.length) {
        const portal = portals.find((p) => p.mesh === hits[0].object);
        if (portal) routerRef.current.push(`/${portal.key}`);
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let cancelled = false;

    const frame = (now) => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
      const t = now * 0.001;
      camera.position.set(Math.sin(now * 0.0003) * 36, 14, Math.cos(now * 0.0003) * 36);
      camera.lookAt(0, 5, 0);

      // Monument motion
      core.rotation.y = t * 1.2;
      core.rotation.x = t * 0.7;
      coreLight.intensity = 2.4 + Math.sin(t * 3) * 0.8;
      orbitRings.forEach((o) => {
        o.mesh.rotation.z = t * o.speed;
      });
      monument.rotation.y = t * 0.12;

      // Portals pulse + wisp orbit
      portals.forEach((p, i) => {
        const s = 1 + Math.sin(t * 2.6 + i * 1.6) * 0.07;
        p.mesh.scale.set(s, s, s);
        p.wisp.rotation.z = t * (0.8 + i * 0.25);
      });

      // Embers rise
      const arr = emberGeo.attributes.position.array;
      for (let i = 0; i < emberCount; i++) {
        arr[i * 3 + 1] += emberVel[i] * 0.016;
        arr[i * 3] += Math.sin(t * 2 + i) * 0.01;
        if (arr[i * 3 + 1] > 32) {
          arr[i * 3 + 1] = 0;
          arr[i * 3] = (Math.random() - 0.5) * 70;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 70;
        }
      }
      emberGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      // Free scene resources (geometry, materials, textures — including the
      // nebula canvas sprites) — renderer.dispose() alone does not release them.
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#05030f' }}>
      <style>{`.hub-btn { transition: transform 120ms ease, opacity 120ms ease; } .hub-btn:active { transform: scale(0.94); opacity: 0.8; }`}</style>
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05030f', pointerEvents: 'none' }}>
          <div style={{ color: '#e9d5ff', fontSize: 14, background: 'rgba(20,10,40,0.85)', padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(168,85,247,0.45)' }}>
            🎡 Raising the midway…
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18, textShadow: '0 0 18px rgba(168,85,247,0.8)' }}>🎡 ATTRACTIONS COMPLEX</div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ color: '#e9d5ff', fontSize: 13, background: 'rgba(20,10,40,0.75)', padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(168,85,247,0.4)' }}>
          Tap a glowing gate to ride
        </div>
      </div>
      <div style={{ position: 'absolute', top: 48, left: 12, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ATTRACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            className="hub-btn"
            onClick={() => router.push(`/${a.key}`)}
            style={{ background: 'rgba(20,10,40,0.85)', color: '#f8fafc', border: `1px solid ${a.color}`, borderRadius: 999, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
          >
            {a.icon} {a.name}
          </button>
        ))}
      </div>
    </div>
  );
}
