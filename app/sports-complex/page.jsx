// app/sports-complex/page.jsx — Olympus Sports Complex: the hub for all sports.
//
// A 3D plaza with portals to every sport: volleyball, hockey, soccer,
// tennis, table tennis, run-it-straight, dodgeball, beer pong.
// One self-contained component.

'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';

const SPORTS = [
  { key: 'volleyball', name: 'Volleyball', icon: '🏐', color: '#0284c7', angle: 0 },
  { key: 'hockey', name: 'Hockey', icon: '🏒', color: '#3b82f6', angle: 45 },
  { key: 'soccer', name: 'Soccer', icon: '⚽', color: '#16a34a', angle: 90 },
  { key: 'tennis', name: 'Tennis', icon: '🎾', color: '#ccff00', angle: 135 },
  { key: 'table-tennis', name: 'Table Tennis', icon: '🏓', color: '#f97316', angle: 180 },
  { key: 'run-it-straight', name: 'Run It Straight', icon: '💥', color: '#ef4444', angle: 225 },
  { key: 'dodgeball', name: 'Dodgeball', icon: '🤾', color: '#f59e0b', angle: 270 },
  { key: 'beer-pong', name: 'Beer Pong', icon: '🍺', color: '#fbbf24', angle: 315 },
];

export default function SportsComplexPage() {
  const containerRef = useRef(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a1a0a');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 300);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    // Plaza
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(28, 40),
      new THREE.MeshStandardMaterial({ color: '#1a2e1a', roughness: 0.8 })
    );
    plaza.rotation.x = -Math.PI / 2;
    scene.add(plaza);

    // Center trophy
    const trophyBase = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 1, 16), new THREE.MeshStandardMaterial({ color: '#444', roughness: 0.5 }));
    trophyBase.position.y = 0.5;
    scene.add(trophyBase);
    const trophy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.5, 2.5, 12),
      new THREE.MeshStandardMaterial({ color: '#ffd700', metalness: 0.9, roughness: 0.2 })
    );
    trophy.position.y = 2.5;
    scene.add(trophy);

    // Sport portals (glowing rings)
    const portals = [];
    for (const sport of SPORTS) {
      const a = (sport.angle * Math.PI) / 180;
      const x = Math.cos(a) * 18;
      const z = Math.sin(a) * 18;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2, 0.25, 8, 24),
        new THREE.MeshBasicMaterial({ color: sport.color })
      );
      ring.position.set(x, 2.5, z);
      ring.lookAt(0, 2.5, 0);
      scene.add(ring);
      // Pedestal
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.7 }));
      ped.position.set(x, 0.3, z);
      scene.add(ped);
      portals.push({ ...sport, x, z, mesh: ring });
    }

    // Click to enter
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
      const t = now * 0.0004;
      camera.position.set(Math.sin(t) * 32, 14, Math.cos(t) * 32);
      camera.lookAt(0, 2, 0);
      // Pulse portals
      portals.forEach((p, i) => {
        const s = 1 + Math.sin(now * 0.003 + i) * 0.06;
        p.mesh.scale.set(s, s, s);
      });
      trophy.rotation.y = now * 0.001;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a1a0a' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>🏟️ SPORTS COMPLEX</div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ color: '#94a3b8', fontSize: 13, background: 'rgba(15,23,42,0.7)', padding: '8px 16px', borderRadius: 999 }}>
          Tap a glowing ring to enter a sport
        </div>
      </div>
      {/* Fallback list for accessibility */}
      <div style={{ position: 'absolute', top: 48, left: 12, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SPORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => router.push(`/${s.key}`)}
            style={{ background: 'rgba(15,23,42,0.8)', color: '#f8fafc', border: `1px solid ${s.color}`, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
          >
            {s.icon} {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
