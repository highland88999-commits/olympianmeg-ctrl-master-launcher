// app/rollercoaster/page.jsx — Olympus Rollercoaster: a full 3D coaster ride.
//
// Procedural track (hills, banked turns, a loop), a car that rides it
// with speed physics (gravity speeds descents, slows climbs), and a
// first-person ride camera. One self-contained component.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// Track definition: control points the coaster threads through.
// y = height. The ride: station -> lift hill -> big drop -> loop ->
// banked turns -> hills -> brake run -> station.
const TRACK_POINTS = [
  [0, 2, 0], [0, 2, -20], [0, 8, -45], [0, 22, -65], [0, 30, -85],
  [0, 28, -105], [0, 12, -125], [0, 4, -145], [0, 3, -165],
  [8, 3, -180], [18, 6, -185], [24, 10, -178], [26, 14, -165],
  [22, 10, -150], [12, 6, -145], [4, 4, -150], [0, 3, -160],
  [-10, 8, -170], [-16, 14, -180], [-14, 18, -195], [-6, 12, -205],
  [0, 6, -210], [0, 3, -220], [0, 2, -240], [0, 2, -260],
];

function buildTrackCurve() {
  const pts = TRACK_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

export default function RollercoasterPage() {
  const containerRef = useRef(null);
  const [riding, setRiding] = useState(false);
  const [speed, setSpeed] = useState(0);
  const rideRef = useRef({ t: 0, speed: 0, riding: false });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0f24');
    scene.fog = new THREE.Fog('#0a0f24', 80, 300);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 500);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(30, 50, 20);
    scene.add(sun);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: '#1a2f1a', roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Track
    const curve = buildTrackCurve();
    const trackGeo = new THREE.TubeGeometry(curve, 400, 0.3, 8, false);
    const trackMat = new THREE.MeshStandardMaterial({ color: '#e74c3c', roughness: 0.4, metalness: 0.6 });
    scene.add(new THREE.Mesh(trackGeo, trackMat));

    // Support pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#7f8c8d', roughness: 0.7 });
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const pos = curve.getPointAt(t);
      if (pos.y > 3) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, pos.y, 8), pillarMat);
        pillar.position.set(pos.x, pos.y / 2, pos.z);
        scene.add(pillar);
      }
    }

    // Car
    const car = new THREE.Group();
    const carBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.8, 2.4),
      new THREE.MeshStandardMaterial({ color: '#f39c12', roughness: 0.3, metalness: 0.4 })
    );
    carBody.position.y = 0.6;
    const carTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.5, 2.0),
      new THREE.MeshStandardMaterial({ color: '#2c3e50', roughness: 0.5 })
    );
    carTop.position.y = 1.2;
    car.add(carBody, carTop);
    scene.add(car);

    // Station platform
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: '#34495e', roughness: 0.8 })
    );
    platform.position.set(0, 1, 4);
    scene.add(platform);

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
        // Speed physics: gravity accelerates descents, decelerates climbs.
        const pos = curve.getPointAt(ride.t);
        const ahead = curve.getPointAt(Math.min(ride.t + 0.005, 1));
        const slope = (ahead.y - pos.y) / Math.max(0.001, ahead.distanceTo(pos));
        // Lift hill: constant slow speed up the first hill
        if (ride.t < 0.12) {
          ride.speed = Math.min(ride.speed + 2 * dt, 6);
        } else {
          ride.speed += -slope * 18 * dt; // gravity
          ride.speed -= ride.speed * 0.08 * dt; // friction
          ride.speed = Math.max(2, Math.min(ride.speed, 28));
        }
        // Brake run at the end
        if (ride.t > 0.94) ride.speed = Math.max(0, ride.speed - 12 * dt);

        ride.t += (ride.speed * dt) / curve.getLength();
        if (ride.t >= 1) {
          ride.t = 0;
          ride.speed = 0;
          ride.riding = false;
          setRiding(false);
          setSpeed(0);
        } else {
          setSpeed(Math.round(ride.speed * 3.6)); // km/h
        }

        const p = curve.getPointAt(ride.t);
        const tangent = curve.getTangentAt(ride.t);
        car.position.copy(p);
        car.position.y += 0.4;
        // Orient car along track
        const lookAt = p.clone().add(tangent);
        car.lookAt(lookAt);
        // Bank into turns
        const tangentAhead = curve.getTangentAt(Math.min(ride.t + 0.01, 1));
        const turn = tangent.x * tangentAhead.z - tangent.z * tangentAhead.x;
        car.rotation.z = -turn * 8;

        // First-person ride camera: just behind and above the car, looking ahead
        const camPos = p.clone().addScaledVector(tangent, -3.5);
        camPos.y += 2.2;
        camera.position.copy(camPos);
        const camLook = p.clone().addScaledVector(tangent, 12);
        camera.lookAt(camLook);
      } else {
        // Idle: orbit around the station
        const t = now * 0.0002;
        camera.position.set(Math.sin(t) * 40, 18, Math.cos(t) * 40 - 130);
        camera.lookAt(0, 10, -130);
        car.position.set(0, 2.4, 0);
        car.rotation.set(0, 0, 0);
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

  const startRide = () => {
    rideRef.current = { t: 0, speed: 0, riding: true };
    setRiding(true);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a0f24' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>🎢 OLYMPUS COASTER</div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>

      {riding && (
        <div style={{ position: 'absolute', top: 48, left: 12, zIndex: 5, background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '8px 16px', borderRadius: 12, fontSize: 16, fontWeight: 700 }}>
          {speed} km/h
        </div>
      )}

      {!riding && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(10,15,36,0.6)', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>🎢</div>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>OLYMPUS COASTER</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>
            Lift hill, big drop, banked turns and hills. Hold on.
          </div>
          <button
            type="button"
            onClick={startRide}
            style={{ marginTop: 8, background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}
          >
            RIDE
          </button>
        </div>
      )}
    </div>
  );
}
