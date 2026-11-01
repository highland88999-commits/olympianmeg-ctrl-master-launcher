// app/merry-go-round/page.jsx — Olympus Merry-Go-Round: a classic carousel ride.
//
// Rotating platform, horses that gallop up and down on brass poles,
// carnival lights, and a ride camera. One self-contained component.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const HORSE_COUNT = 8;

function makeHorse(color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  // Body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 10), bodyMat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.1;
  // Neck + head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.7, 8), bodyMat);
  neck.position.set(0.65, 1.5, 0);
  neck.rotation.z = -0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.25), bodyMat);
  head.position.set(0.95, 1.85, 0);
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.9, 6);
  const legMat = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.7 });
  const legs = [];
  for (const [lx, lz] of [[-0.35, 0.18], [-0.35, -0.18], [0.35, 0.18], [0.35, -0.18]]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.45, lz);
    group.add(leg);
    legs.push(leg);
  }
  // Mane
  const mane = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.15, 0.1),
    new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 })
  );
  mane.position.set(0.7, 1.75, 0);
  mane.rotation.z = -0.5;
  // Saddle
  const saddle = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.5),
    new THREE.MeshStandardMaterial({ color: '#8b0000', roughness: 0.6 })
  );
  saddle.position.set(0, 1.45, 0);
  group.add(body, neck, head, mane, saddle);
  group.userData.legs = legs;
  return group;
}

export default function MerryGoRoundPage() {
  const containerRef = useRef(null);
  const [riding, setRiding] = useState(false);
  const rideRef = useRef({ riding: false, angle: 0, speed: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0a1f');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 300);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffe0b3, 0.7);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#14241a', roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Carousel group (rotates)
    const carousel = new THREE.Group();
    scene.add(carousel);

    // Platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7.5, 0.5, 32),
      new THREE.MeshStandardMaterial({ color: '#5b3a1a', roughness: 0.6 })
    );
    platform.position.y = 0.25;
    carousel.add(platform);
    // Platform trim
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(7.2, 0.15, 8, 40),
      new THREE.MeshStandardMaterial({ color: '#ffd700', roughness: 0.3, metalness: 0.7, emissive: '#664400' })
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.5;
    carousel.add(trim);

    // Center column
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.5, 6, 16),
      new THREE.MeshStandardMaterial({ color: '#8b0000', roughness: 0.5 })
    );
    column.position.y = 3.5;
    carousel.add(column);

    // Canopy
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(8.5, 3, 24),
      new THREE.MeshStandardMaterial({ color: '#a01010', roughness: 0.6, side: THREE.DoubleSide })
    );
    canopy.position.y = 8;
    carousel.add(canopy);
    const canopyTrim = new THREE.Mesh(
      new THREE.TorusGeometry(8.5, 0.2, 8, 32),
      new THREE.MeshStandardMaterial({ color: '#ffd700', emissive: '#664400', roughness: 0.4 })
    );
    canopyTrim.rotation.x = Math.PI / 2;
    canopyTrim.position.y = 6.5;
    carousel.add(canopyTrim);

    // Carnival lights around the canopy rim
    const lightGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const lightColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    const bulbs = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const bulb = new THREE.Mesh(
        lightGeo,
        new THREE.MeshBasicMaterial({ color: lightColors[i % lightColors.length] })
      );
      bulb.position.set(Math.cos(a) * 8.5, 6.6, Math.sin(a) * 8.5);
      carousel.add(bulb);
      bulbs.push(bulb);
    }

    // Horses on brass poles
    const horses = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.8, roughness: 0.3 });
    const horseColors = [0xffffff, 0x8b4513, 0x2c2c2c, 0xd2a679, 0x800080, 0x006400, 0xff69b4, 0x4682b4];
    for (let i = 0; i < HORSE_COUNT; i++) {
      const a = (i / HORSE_COUNT) * Math.PI * 2;
      const r = 5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 8), poleMat);
      pole.position.set(Math.cos(a) * r, 3.5, Math.sin(a) * r);
      carousel.add(pole);
      const horse = makeHorse(horseColors[i % horseColors.length]);
      horse.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
      horse.rotation.y = -a + Math.PI / 2;
      carousel.add(horse);
      horses.push({ group: horse, phase: (i / HORSE_COUNT) * Math.PI * 2 });
    }

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
      const ride = rideRef.current;

      if (ride.riding) {
        ride.speed = Math.min(ride.speed + 0.5 * dt, 0.9); // spin up
      } else {
        ride.speed = Math.max(ride.speed - 0.4 * dt, 0); // spin down
      }
      ride.angle += ride.speed * dt;
      carousel.rotation.y = ride.angle;

      // Horses gallop up and down
      const t = now * 0.004;
      for (const h of horses) {
        h.group.position.y = 0.5 + Math.sin(t + h.phase) * 0.55 * Math.min(1, ride.speed * 2);
        // Legs pump
        const legs = h.group.userData.legs;
        if (legs) {
          legs[0].rotation.x = Math.sin(t * 2 + h.phase) * 0.4;
          legs[3].rotation.x = Math.sin(t * 2 + h.phase) * 0.4;
          legs[1].rotation.x = Math.sin(t * 2 + h.phase + Math.PI) * 0.4;
          legs[2].rotation.x = Math.sin(t * 2 + h.phase + Math.PI) * 0.4;
        }
      }

      // Bulbs twinkle
      bulbs.forEach((b, i) => {
        b.material.color.setHex(lightColors[(i + Math.floor(now / 300)) % lightColors.length]);
      });

      if (ride.riding || ride.speed > 0.05) {
        // Ride camera: on a horse, looking outward
        const hr = 5;
        const ha = ride.angle + 0.3;
        camera.position.set(Math.cos(ha) * hr, 2.6, Math.sin(ha) * hr);
        camera.lookAt(Math.cos(ha) * 20, 1.5, Math.sin(ha) * 20);
      } else {
        const t2 = now * 0.0003;
        camera.position.set(Math.sin(t2) * 22, 8, Math.cos(t2) * 22);
        camera.lookAt(0, 3, 0);
      }

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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0d0a1f' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>🎠 CAROUSEL</div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {!riding ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          {/* Carousel art wrap (Merlin, 2026-11-01): generated night-carnival
              backdrop + readability scrim; the card and every control below
              are untouched. */}
          <div className="absolute inset-0 bg-cover bg-center" aria-hidden="true"
            style={{ backgroundImage: 'url(/images/merry-go-round/merry-go-round-menu-bg.webp)' }} />
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/55 via-black/55 to-black/85" aria-hidden="true" />
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 56 }}>🎠</div>
            <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>MERRY-GO-ROUND</div>
            <button
              type="button"
              onClick={() => { rideRef.current.riding = true; setRiding(true); }}
              style={{ marginTop: 8, background: '#a01010', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}
            >
              RIDE
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { rideRef.current.riding = false; setRiding(false); }}
          style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 6, background: 'rgba(15,23,42,0.8)', color: '#f8fafc', border: '1px solid #475569', borderRadius: 999, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Step Off
        </button>
      )}
    </div>
  );
}
