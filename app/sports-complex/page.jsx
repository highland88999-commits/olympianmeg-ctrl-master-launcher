// app/sports-complex/page.jsx — Olympus Sports Complex (Merlin, 2026-10-31).
//
// Wrapped in sports graphics: stadium floodlights with light cones,
// a running track ring, championship banners, floating sports balls,
// and a golden trophy centerpiece. Portals to every sport.

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
    scene.background = new THREE.Color('#060d18');
    scene.fog = new THREE.Fog('#060d18', 60, 160);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 400);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    // ---- Stadium grass plaza ----
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(26, 48),
      new THREE.MeshStandardMaterial({ color: '#1d5c2a', roughness: 0.95 })
    );
    plaza.rotation.x = -Math.PI / 2;
    scene.add(plaza);
    // Mowed stripes
    for (let i = 0; i < 8; i++) {
      const stripe = new THREE.Mesh(
        new THREE.RingGeometry(3 + i * 2.9, 5.6 + i * 2.9, 48),
        new THREE.MeshStandardMaterial({ color: i % 2 ? '#1d5c2a' : '#23702f', roughness: 0.95 })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.y = 0.005;
      scene.add(stripe);
    }

    // ---- Running track ring ----
    const track = new THREE.Mesh(
      new THREE.RingGeometry(26, 31, 48),
      new THREE.MeshStandardMaterial({ color: '#a83a2a', roughness: 0.9 })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.005;
    scene.add(track);
    // Lane lines
    for (const r of [27.2, 28.4, 29.6]) {
      const lane = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.06, r + 0.06, 48),
        new THREE.MeshBasicMaterial({ color: '#f8fafc' })
      );
      lane.rotation.x = -Math.PI / 2;
      lane.position.y = 0.01;
      scene.add(lane);
    }

    // ---- Floodlight towers ----
    const towerMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
    const headMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 });
    const coneMat = new THREE.MeshBasicMaterial({ color: '#fef9c3', transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * 38;
      const z = Math.sin(a) * 38;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 22, 8), towerMat);
      tower.position.set(x, 11, z);
      scene.add(tower);
      const head = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.6), headMat);
      head.position.set(x, 22.5, z);
      head.lookAt(0, 0, 0);
      scene.add(head);
      // Light bank bulbs
      for (let b = 0; b < 6; b++) {
        const bulb = new THREE.Mesh(
          new THREE.CircleGeometry(0.28, 8),
          new THREE.MeshBasicMaterial({ color: '#fefce8' })
        );
        bulb.position.set(x + (b % 3 - 1) * 1.1, 22.5 + (Math.floor(b / 3) - 0.5) * 0.9, z);
        bulb.lookAt(0, 0, 0);
        scene.add(bulb);
      }
      // Light cone
      const cone = new THREE.Mesh(new THREE.ConeGeometry(13, 24, 16, 1, true), coneMat);
      cone.position.set(x * 0.55, 11, z * 0.55);
      cone.lookAt(0, 0, 0);
      cone.rotateX(Math.PI / 2);
      scene.add(cone);
      const spot = new THREE.SpotLight(0xfff7cc, 1.2, 90, 0.5, 0.4);
      spot.position.set(x, 22.5, z);
      spot.target.position.set(0, 0, 0);
      scene.add(spot, spot.target);
    }

    // ---- Championship banners ----
    const bannerColors = ['#1e40af', '#166534', '#92400e', '#7c2d12'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * 33;
      const z = Math.sin(a) * 33;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 7, 6), towerMat);
      pole.position.set(x, 3.5, z);
      scene.add(pole);
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 3),
        new THREE.MeshStandardMaterial({ color: bannerColors[i % 4], roughness: 0.8, side: THREE.DoubleSide })
      );
      banner.position.set(x, 5, z);
      banner.lookAt(0, 5, 0);
      scene.add(banner);
      banner.userData.phase = i * 0.8;
      banner.userData.baseX = x;
      banner.userData.baseZ = z;
      (function keep(b) {
        b.userData.tick = (t) => {
          b.rotation.y = Math.sin(t * 1.4 + b.userData.phase) * 0.18;
        };
      })(banner);
      scene.userData['banner' + i] = banner;
    }

    // ---- Golden trophy centerpiece ----
    const trophyBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 1.2, 20), new THREE.MeshStandardMaterial({ color: '#3f3f46', roughness: 0.4, metalness: 0.6 }));
    trophyBase.position.y = 0.6;
    scene.add(trophyBase);
    const cup = new THREE.Group();
    const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.55, 2.2, 16), new THREE.MeshStandardMaterial({ color: '#ffd700', metalness: 0.95, roughness: 0.15 }));
    cupBody.position.y = 1.6;
    const cupRim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 20), new THREE.MeshStandardMaterial({ color: '#ffd700', metalness: 0.95, roughness: 0.15 }));
    cupRim.rotation.x = Math.PI / 2;
    cupRim.position.y = 2.7;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 1.2, 10), new THREE.MeshStandardMaterial({ color: '#b8860b', metalness: 0.9, roughness: 0.25 }));
    stem.position.y = 0.4;
    cup.add(cupBody, cupRim, stem);
    cup.position.y = 1.2;
    scene.add(cup);
    const cupLight = new THREE.PointLight(0xffd700, 1.5, 20);
    cupLight.position.set(0, 5, 0);
    scene.add(cupLight);

    // ---- Floating sports balls ----
    const balls = [];
    const ballDefs = [
      { r: 0.5, color: '#ffffff', y: 6 },   // soccer-ish
      { r: 0.35, color: '#ccff00', y: 7.5 }, // tennis
      { r: 0.4, color: '#f97316', y: 5 },    // basketball-ish
      { r: 0.3, color: '#ffffff', y: 8.5 },  // baseball-ish
    ];
    ballDefs.forEach((bd, i) => {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(bd.r, 14, 12),
        new THREE.MeshStandardMaterial({ color: bd.color, roughness: 0.45 })
      );
      const a = (i / ballDefs.length) * Math.PI * 2;
      ball.position.set(Math.cos(a) * 8, bd.y, Math.sin(a) * 8);
      ball.userData = { baseY: bd.y, phase: i * 1.7, orbitR: 8, speed: 0.25 + i * 0.06 };
      scene.add(ball);
      balls.push(ball);
    });

    // ---- Sport portals: glowing rings on grass pedestals ----
    const portals = [];
    for (const sport of SPORTS) {
      const a = (sport.angle * Math.PI) / 180;
      const x = Math.cos(a) * 17;
      const z = Math.sin(a) * 17;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2, 0.28, 10, 28),
        new THREE.MeshBasicMaterial({ color: sport.color })
      );
      ring.position.set(x, 2.6, z);
      ring.lookAt(0, 2.6, 0);
      scene.add(ring);
      // Grass pedestal with white chalk ring
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 16), new THREE.MeshStandardMaterial({ color: '#245c2e', roughness: 0.9 }));
      ped.position.set(x, 0.25, z);
      scene.add(ped);
      const chalk = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.85, 24), new THREE.MeshBasicMaterial({ color: '#f8fafc' }));
      chalk.rotation.x = -Math.PI / 2;
      chalk.position.set(x, 0.51, z);
      scene.add(chalk);
      portals.push({ ...sport, x, z, mesh: ring });
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
      const t = now * 0.001;
      camera.position.set(Math.sin(now * 0.00035) * 34, 15, Math.cos(now * 0.00035) * 34);
      camera.lookAt(0, 2, 0);
      portals.forEach((p, i) => {
        const s = 1 + Math.sin(t * 3 + i) * 0.06;
        p.mesh.scale.set(s, s, s);
      });
      cup.rotation.y = t * 0.8;
      balls.forEach((b) => {
        const u = b.userData;
        const a = t * u.speed + u.phase;
        b.position.x = Math.cos(a) * u.orbitR;
        b.position.z = Math.sin(a) * u.orbitR;
        b.position.y = u.baseY + Math.sin(t * 2 + u.phase) * 0.5;
        b.rotation.x = t * 2;
      });
      for (let i = 0; i < 8; i++) {
        const banner = scene.userData['banner' + i];
        if (banner && banner.userData.tick) banner.userData.tick(t);
      }
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#060d18' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>🏟️ SPORTS COMPLEX</div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ color: '#e2e8f0', fontSize: 13, background: 'rgba(15,23,42,0.75)', padding: '8px 16px', borderRadius: 999 }}>
          Tap a glowing ring to enter a sport
        </div>
      </div>
      <div style={{ position: 'absolute', top: 48, left: 12, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SPORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => router.push(`/${s.key}`)}
            style={{ background: 'rgba(15,23,42,0.85)', color: '#f8fafc', border: `1px solid ${s.color}`, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
          >
            {s.icon} {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
