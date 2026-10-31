// app/attractions-complex/page.jsx — Olympus Attractions Complex: the hub for rides.
//
// A 3D midway with portals to every attraction: rollercoaster,
// merry-go-round, water slide, hall of mirrors.
// One self-contained component.

'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';

const ATTRACTIONS = [
  { key: 'rollercoaster', name: 'Rollercoaster', icon: '🎢', color: '#e74c3c', angle: 0 },
  { key: 'merry-go-round', name: 'Merry-Go-Round', icon: '🎠', color: '#a01010', angle: 90 },
  { key: 'water-slide', name: 'Water Slide', icon: '🌊', color: '#00b4d8', angle: 180 },
  { key: 'hall-of-mirrors', name: 'Hall of Mirrors', icon: '🪞', color: '#a855f7', angle: 270 },
];

export default function AttractionsComplexPage() {
  const containerRef = useRef(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0a1f');
    // Night sky stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 200;
      starPos[i * 3 + 1] = 20 + Math.random() * 60;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.4 })));

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 300);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const moon = new THREE.DirectionalLight(0xaaaaff, 0.5);
    moon.position.set(-20, 30, -10);
    scene.add(moon);

    // Midway
    const midway = new THREE.Mesh(
      new THREE.CircleGeometry(24, 40),
      new THREE.MeshStandardMaterial({ color: '#2a1a3a', roughness: 0.85 })
    );
    midway.rotation.x = -Math.PI / 2;
    scene.add(midway);

    // Center ferris-wheel-ish beacon
    const beacon = new THREE.Mesh(
      new THREE.TorusGeometry(4, 0.4, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#ff00ff' })
    );
    beacon.position.y = 8;
    scene.add(beacon);
    const beaconPole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 8, 8), new THREE.MeshStandardMaterial({ color: '#444' }));
    beaconPole.position.y = 4;
    scene.add(beaconPole);

    // Attraction portals
    const portals = [];
    for (const attr of ATTRACTIONS) {
      const a = (attr.angle * Math.PI) / 180;
      const x = Math.cos(a) * 15;
      const z = Math.sin(a) * 15;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.3, 8, 24),
        new THREE.MeshBasicMaterial({ color: attr.color })
      );
      ring.position.set(x, 2.8, z);
      ring.lookAt(0, 2.8, 0);
      scene.add(ring);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.7 }));
      ped.position.set(x, 0.3, z);
      scene.add(ped);
      // String lights to the portal
      const lightGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 9, 0),
        new THREE.Vector3(x, 3.5, z),
      ]);
      scene.add(new THREE.Line(lightGeo, new THREE.LineBasicMaterial({ color: attr.color, transparent: true, opacity: 0.5 })));
      portals.push({ ...attr, x, z, mesh: ring });
    }

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
      camera.position.set(Math.sin(t) * 28, 12, Math.cos(t) * 28);
      camera.lookAt(0, 3, 0);
      portals.forEach((p, i) => {
        const s = 1 + Math.sin(now * 0.003 + i * 1.5) * 0.07;
        p.mesh.scale.set(s, s, s);
      });
      beacon.rotation.z = now * 0.0005;
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0d0a1f' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>🎡 ATTRACTIONS COMPLEX</div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ color: '#94a3b8', fontSize: 13, background: 'rgba(15,23,42,0.7)', padding: '8px 16px', borderRadius: 999 }}>
          Tap a glowing ring to ride
        </div>
      </div>
      <div style={{ position: 'absolute', top: 48, left: 12, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ATTRACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => router.push(`/${a.key}`)}
            style={{ background: 'rgba(15,23,42,0.8)', color: '#f8fafc', border: `1px solid ${a.color}`, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
          >
            {a.icon} {a.name}
          </button>
        ))}
      </div>
    </div>
  );
}
