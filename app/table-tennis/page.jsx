// app/table-tennis/page.jsx — Olympus Table Tennis: fast singles vs AI.
//
// First to 11 points, win by 2. Rules in lib/sports/tennis.js (variant 'table').

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WalkJoystick from '@/components/world/WalkJoystick';
import { createRacket, stepRacket, serveRacket, courtDims, formatScore } from '@/lib/sports/tennis.js';

export default function TableTennisPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const actRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ scoreText: '', message: '', winner: null });
  const hudPrevRef = useRef('');
  const startedRef = useRef(false);

  if (!gameRef.current) gameRef.current = createRacket('table');
  useEffect(() => { startedRef.current = started; }, [started]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const d = courtDims('table');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 50);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(3, 8, 3);
    scene.add(sun);

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Table
    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(d.W, 0.05, d.L),
      new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.4 })
    );
    tableTop.position.y = 0.76;
    scene.add(tableTop);
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const mkLine = (w, dep, x, z) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, dep), lineMat);
      l.position.set(x, 0.79, z);
      scene.add(l);
    };
    mkLine(d.W, 0.02, 0, d.L / 2);
    mkLine(d.W, 0.02, 0, -d.L / 2);
    mkLine(0.02, d.L, -d.W / 2, 0);
    mkLine(0.02, d.L, d.W / 2, 0);
    mkLine(d.W, 0.02, 0, 0);
    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: '#334155' });
    for (const [lx, lz] of [[-d.W / 2 + 0.1, -d.L / 2 + 0.2], [d.W / 2 - 0.1, -d.L / 2 + 0.2], [-d.W / 2 + 0.1, d.L / 2 - 0.2], [d.W / 2 - 0.1, d.L / 2 - 0.2]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.76, 0.06), legMat);
      leg.position.set(lx, 0.38, lz);
      scene.add(leg);
    }
    // Net
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(d.W, d.NET_H),
      new THREE.MeshStandardMaterial({ color: '#111', transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    net.position.set(0, 0.76 + d.NET_H / 2, 0);
    scene.add(net);

    // Paddles (players are represented by their paddle + a marker)
    const mkPaddle = (color) => {
      const g = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      blade.rotation.x = Math.PI / 2;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), new THREE.MeshStandardMaterial({ color: '#8b4513' }));
      handle.position.z = -0.1;
      g.add(blade, handle);
      scene.add(g);
      return g;
    };
    const youPaddle = mkPaddle('#3b82f6');
    const aiPaddle = mkPaddle('#ef4444');

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#ff8800', roughness: 0.4 })
    );
    scene.add(ball);

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;
    const msgRef = { current: '' };

    const frame = (now) => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const state = gameRef.current;

      if (startedRef.current && state.status === 'rally') {
        stepRacket(state, dt, { mx: joyRef.current.x, mz: -joyRef.current.y, act: actRef.current }, Math.random);
        actRef.current = false;
        for (const ev of state.events) {
          if (ev.type === 'point') msgRef.current = ev.winner === 'you' ? 'Point!' : 'Their point.';
          else if (ev.type === 'let') msgRef.current = 'Let — re-serve.';
        }
      } else if (startedRef.current && state.status === 'serve') {
        if (!frame.serveTimer) frame.serveTimer = now;
        if (now - frame.serveTimer > 1000) {
          serveRacket(state);
          frame.serveTimer = 0;
          msgRef.current = '';
        }
      }

      youPaddle.position.set(state.you.x, 1.0, state.you.z);
      aiPaddle.position.set(state.ai.x, 1.0, state.ai.z);
      ball.position.set(state.ball.x, state.ball.y, state.ball.z);

      camera.position.set(state.you.x * 0.6, 2.6, state.you.z + 2.2);
      camera.lookAt(0, 0.8, -0.5);

      const nextHud = { scoreText: formatScore(state), message: msgRef.current, winner: state.winner };
      const key = JSON.stringify(nextHud);
      if (key !== hudPrevRef.current) {
        hudPrevRef.current = key;
        setHud(nextHud);
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0f172a' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>🏓 TABLE TENNIS <span style={{ fontSize: 14 }}>{hud.scoreText}</span></div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {hud.message && !hud.winner && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>{hud.message}</div>
        </div>
      )}
      {!started && !hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/table-tennis/table-tennis-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.70), rgba(0,0,0,0.55), rgba(0,0,0,0.85))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 56 }}>🏓</div>
            <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>TABLE TENNIS</div>
            <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>Fast singles vs AI. First to 11, win by 2. Tap HIT to return.</div>
            <button type="button" onClick={() => setStarted(true)} style={{ marginTop: 8, background: '#f97316', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>PLAY</button>
          </div>
        </div>
      )}
      {hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/table-tennis/table-tennis-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.70), rgba(0,0,0,0.55), rgba(0,0,0,0.85))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ color: hud.winner === 'you' ? '#fdba74' : '#f87171', fontSize: 34, fontWeight: 800 }}>{hud.winner === 'you' ? 'YOU WIN!' : 'AI wins.'}</div>
            <div style={{ color: '#cbd5e1', fontSize: 15 }}>{hud.scoreText}</div>
            <button type="button" onClick={() => { gameRef.current = createRacket('table'); setHud({ scoreText: '', message: '', winner: null }); setStarted(true); }} style={{ marginTop: 8, background: '#f97316', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>REMATCH</button>
          </div>
        </div>
      )}
      {started && !hud.winner && (
        <>
          <div style={{ position: 'absolute', left: 16, bottom: 24, zIndex: 6 }}>
            <WalkJoystick onMove={(x, y) => { joyRef.current = { x, y }; }} size={110} />
          </div>
          <button
            type="button"
            onPointerDown={() => { actRef.current = true; }}
            style={{ position: 'absolute', right: 20, bottom: 32, zIndex: 6, width: 96, height: 96, borderRadius: '50%', border: '3px solid #fff', cursor: 'pointer', fontSize: 18, fontWeight: 800, background: '#f97316', color: '#fff' }}
          >
            HIT
          </button>
        </>
      )}
    </div>
  );
}
