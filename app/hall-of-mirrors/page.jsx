// app/hall-of-mirrors/page.jsx — Olympus Hall of Mirrors: a mirror maze.
//
// Wander a maze of reflective panels — some flat, some warped for the
// classic funhouse stretch-and-squash. Find the exit. One self-contained
// component.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WalkJoystick from '@/components/world/WalkJoystick';

// Maze layout: 1 = mirror wall, 0 = path. 11x11.
const MAZE = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];
const CELL = 4;
const EXIT = { cx: 9, cz: 9 };

export default function HallOfMirrorsPage() {
  const containerRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef(new Set());
  const [started, setStarted] = useState(false);
  const [won, setWon] = useState(false);
  const [time, setTime] = useState(0);
  const posRef = useRef({ x: 1.5 * CELL, z: 1.5 * CELL, angle: 0 });
  const wonRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0a1a');
    scene.fog = new THREE.Fog('#0a0a1a', 10, 45);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 100);

    // Lights — dim carnival glow
    scene.add(new THREE.AmbientLight(0x8888ff, 0.4));
    const glowColors = [0xff00ff, 0x00ffff, 0xffff00];
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(glowColors[i % 3], 0.8, 25);
      light.position.set((i % 3) * 12 - 12, 3, Math.floor(i / 3) * 20 - 10);
      scene.add(light);
    }

    // Floor — dark with a subtle grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: '#141428', roughness: 0.3, metalness: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Mirror walls — some flat, some warped (funhouse)
    const mirrorMat = new THREE.MeshStandardMaterial({
      color: '#aaccff', roughness: 0.05, metalness: 0.95,
      envMapIntensity: 1.5,
    });
    const warpMat = new THREE.MeshStandardMaterial({
      color: '#ffccaa', roughness: 0.15, metalness: 0.9,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#ffd700', roughness: 0.4, metalness: 0.6 });

    const mazeW = MAZE[0].length;
    const mazeH = MAZE.length;
    const originX = -mazeW * CELL / 2;
    const originZ = -mazeH * CELL / 2;

    for (let cz = 0; cz < mazeH; cz++) {
      for (let cx = 0; cx < mazeW; cx++) {
        if (!MAZE[cz][cx]) continue;
        const x = originX + (cx + 0.5) * CELL;
        const z = originZ + (cz + 0.5) * CELL;
        const warped = (cx + cz) % 3 === 0;
        // Warped mirrors get a wavy geometry
        let geo;
        if (warped) {
          geo = new THREE.PlaneGeometry(CELL, 3, 8, 4);
          const pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i);
            pos.setZ(i, Math.sin(px * 2) * 0.25);
          }
          geo.computeVertexNormals();
        } else {
          geo = new THREE.PlaneGeometry(CELL, 3);
        }
        // Two-sided wall (mirror both faces)
        for (const rot of [0, Math.PI]) {
          const wall = new THREE.Mesh(geo, warped ? warpMat : mirrorMat);
          wall.position.set(x, 1.5, z);
          wall.rotation.y = rot;
          // Offset slightly so the two faces don't z-fight
          wall.position.z += Math.sin(rot) * 0.02;
          wall.position.x += Math.cos(rot) * 0.02;
          scene.add(wall);
        }
        // Gold frame top
        const frame = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.15, 0.15), frameMat);
        frame.position.set(x, 3.05, z);
        scene.add(frame);
      }
    }

    // Exit portal — glowing arch
    const exitX = originX + (EXIT.cx + 0.5) * CELL;
    const exitZ = originZ + (EXIT.cz + 0.5) * CELL;
    const exitGlow = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.15, 8, 20),
      new THREE.MeshBasicMaterial({ color: '#00ff88' })
    );
    exitGlow.position.set(exitX, 1.5, exitZ);
    scene.add(exitGlow);

    const onKeyDown = (e) => keysRef.current.add(e.key.toLowerCase());
    const onKeyUp = (e) => keysRef.current.delete(e.key.toLowerCase());
    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;
    let elapsed = 0;

    const isWall = (x, z) => {
      const cx = Math.floor((x - originX) / CELL);
      const cz = Math.floor((z - originZ) / CELL);
      if (cx < 0 || cz < 0 || cx >= mazeW || cz >= mazeH) return true;
      return MAZE[cz][cx] === 1;
    };

    const frame = (now) => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const pos = posRef.current;

      if (!wonRef.current) {
        elapsed += dt;
        setTime(Math.floor(elapsed));

        // Movement (tank-ish: joystick strafes, drag to look — simplified to move+turn)
        let mx = joyRef.current.x;
        let mz = -joyRef.current.y;
        const keys = keysRef.current;
        if (keys.has('a') || keys.has('arrowleft')) pos.angle += 2.2 * dt;
        if (keys.has('d') || keys.has('arrowright')) pos.angle -= 2.2 * dt;
        if (keys.has('w') || keys.has('arrowup')) mz -= 1;
        if (keys.has('s') || keys.has('arrowdown')) mz += 1;

        const speed = 5;
        const dx = Math.sin(pos.angle) * -mz * speed * dt + Math.cos(pos.angle) * mx * speed * dt;
        const dz = Math.cos(pos.angle) * -mz * speed * dt - Math.sin(pos.angle) * mx * speed * dt;
        const nx = pos.x + dx;
        const nz = pos.z + dz;
        // Collide (circle radius 0.5)
        if (!isWall(nx + Math.sign(dx) * 0.5, pos.z)) pos.x = nx;
        if (!isWall(pos.x, nz + Math.sign(dz) * 0.5)) pos.z = nz;

        // Exit check
        const ecx = Math.floor((pos.x - originX) / CELL);
        const ecz = Math.floor((pos.z - originZ) / CELL);
        if (ecx === EXIT.cx && ecz === EXIT.cz) {
          wonRef.current = true;
          setWon(true);
        }
      }

      camera.position.set(pos.x, 1.7, pos.z);
      camera.rotation.set(0, pos.angle, 0, 'YXZ');

      // Exit glow pulse
      exitGlow.material.color.setHSL(0.4, 1, 0.5 + Math.sin(now * 0.005) * 0.15);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a0a1a' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>🪞 HALL OF MIRRORS <span style={{ fontSize: 13, color: '#94a3b8' }}>{time}s</span></div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {!started && !won && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          {/* Mirror art wrap (Merlin, 2026-11-01): generated backdrop +
              readability scrim; the card and every control below are
              untouched. */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/hall-of-mirrors/hall-of-mirrors-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,9,20,0.72) 0%, rgba(4,9,20,0.55) 50%, rgba(4,9,20,0.88) 100%)' }} />
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>🪞</div>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>HALL OF MIRRORS</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>A maze of mirrors — some stretch, some squash. Find the green exit arch. Joystick to walk, A/D or arrows to turn.</div>
          <button type="button" onClick={() => setStarted(true)} style={{ marginTop: 8, background: '#a855f7', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>ENTER</button>
          </div>
        </div>
      )}
      {won && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          {/* Mirror art wrap (Merlin, 2026-11-01): same backdrop + scrim on
              the escape screen; the card and every control below are
              untouched. */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/hall-of-mirrors/hall-of-mirrors-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,9,20,0.72) 0%, rgba(4,9,20,0.55) 50%, rgba(4,9,20,0.88) 100%)' }} />
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ color: '#4ade80', fontSize: 34, fontWeight: 800 }}>ESCAPED!</div>
          <div style={{ color: '#cbd5e1', fontSize: 16 }}>You found the exit in {time} seconds.</div>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 8, background: '#a855f7', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>AGAIN</button>
          </div>
        </div>
      )}
      {started && !won && (
        <div style={{ position: 'absolute', left: 16, bottom: 24, zIndex: 6 }}>
          <WalkJoystick onMove={(x, y) => { joyRef.current = { x, y }; }} size={120} />
        </div>
      )}
    </div>
  );
}
