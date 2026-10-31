// app/volleyball/page.jsx — Olympus Volleyball: 2v2 beach volleyball.
//
// You + AI teammate vs 2 AI. Rally scoring, first to 21 win by 2.
// Rules in lib/sports/volleyball.js (pure, node-tested).

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WalkJoystick from '@/components/world/WalkJoystick';
import { createVolleyball, stepVolleyball, serveBall, COURT_W, COURT_L, NET_H } from '@/lib/sports/volleyball.js';

const TEAM_COLORS = { blue: '#3b82f6', red: '#ef4444' };

export default function VolleyballPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const actRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ blue: 0, red: 0, message: '', winner: null });
  const hudPrevRef = useRef('');
  const startedRef = useRef(false);

  if (!gameRef.current) gameRef.current = createVolleyball();

  useEffect(() => { startedRef.current = started; }, [started]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87ceeb');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 200);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(10, 20, 10);
    scene.add(sun);

    // Sand court
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT_W + 8, COURT_L + 8),
      new THREE.MeshStandardMaterial({ color: '#e8d5a3', roughness: 1 })
    );
    sand.rotation.x = -Math.PI / 2;
    scene.add(sand);
    // Court lines
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const mkLine = (w, d, x, z) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
      line.position.set(x, 0.01, z);
      scene.add(line);
    };
    mkLine(COURT_W, 0.15, 0, COURT_L / 2);
    mkLine(COURT_W, 0.15, 0, -COURT_L / 2);
    mkLine(0.15, COURT_L, -COURT_W / 2, 0);
    mkLine(0.15, COURT_L, COURT_W / 2, 0);

    // Net
    const netPost = new THREE.CylinderGeometry(0.08, 0.08, NET_H + 0.5, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: '#666666' });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(netPost, postMat);
      post.position.set(sx * (COURT_W / 2 + 0.3), (NET_H + 0.5) / 2, 0);
      scene.add(post);
    }
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT_W + 0.6, NET_H),
      new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    net.position.set(0, NET_H / 2, 0);
    scene.add(net);

    // Players
    const playerMeshes = {};
    for (const p of gameRef.current.players) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 0.7, 4, 10),
        new THREE.MeshStandardMaterial({ color: TEAM_COLORS[p.team], roughness: 0.6 })
      );
      body.position.y = 0.9;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 10),
        new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5 })
      );
      head.position.y = 1.65;
      g.add(body, head);
      g.userData.isHuman = p.isHuman;
      scene.add(g);
      playerMeshes[p.id] = g;
    }
    // Highlight ring for you
    const youRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.8, 20),
      new THREE.MeshBasicMaterial({ color: '#fbbf24', side: THREE.DoubleSide })
    );
    youRing.rotation.x = -Math.PI / 2;
    youRing.position.y = 0.02;
    scene.add(youRing);

    // Ball
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 })
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
      const you = state.players.find((p) => p.isHuman);

      if (startedRef.current && state.status === 'rally' && you) {
        stepVolleyball(state, dt, { mx: joyRef.current.x, mz: -joyRef.current.y, act: actRef.current }, Math.random);
        actRef.current = false;
        for (const ev of state.events) {
          if (ev.type === 'point') msgRef.current = ev.team === 'blue' ? 'Point!' : 'Their point.';
          if (ev.type === 'win') msgRef.current = '';
        }
      } else if (startedRef.current && state.status === 'serve') {
        // Auto-serve after a beat
        if (!frame.serveTimer) frame.serveTimer = now;
        if (now - frame.serveTimer > 1200) {
          serveBall(state);
          frame.serveTimer = 0;
        }
      }

      // Sync meshes
      for (const p of state.players) {
        const m = playerMeshes[p.id];
        if (m) {
          m.position.set(p.x, 0, p.z);
          m.rotation.y = p.team === 'blue' ? Math.PI : 0;
        }
      }
      if (you) {
        youRing.position.x = you.x;
        youRing.position.z = you.z;
      }
      ball.position.set(state.ball.x, state.ball.y, state.ball.z);

      // Camera follows you
      if (you) {
        camera.position.set(you.x * 0.5, 10, you.z + 10);
        camera.lookAt(0, 1, 0);
      }

      const nextHud = { blue: state.score.blue, red: state.score.red, message: msgRef.current, winner: state.winner };
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#87ceeb' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#1e293b', fontWeight: 800, fontSize: 18 }}>🏐 VOLLEYBALL <span style={{ fontSize: 14, fontWeight: 600 }}>{hud.blue} - {hud.red}</span></div>
        <a href="/" style={{ color: '#475569', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {hud.message && !hud.winner && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>{hud.message}</div>
        </div>
      )}
      {!started && !hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(135,206,235,0.7)', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>🏐</div>
          <div style={{ color: '#1e293b', fontSize: 28, fontWeight: 800 }}>BEACH VOLLEYBALL</div>
          <div style={{ color: '#475569', fontSize: 15, maxWidth: 320 }}>You + AI vs 2 AI. First to 21, win by 2. Move with the joystick, tap HIT when the ball is close.</div>
          <button type="button" onClick={() => setStarted(true)} style={{ marginTop: 8, background: '#0284c7', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>PLAY</button>
        </div>
      )}
      {hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(15,23,42,0.75)', padding: 20, textAlign: 'center' }}>
          <div style={{ color: hud.winner === 'blue' ? '#60a5fa' : '#f87171', fontSize: 34, fontWeight: 800 }}>{hud.winner === 'blue' ? 'YOU WIN!' : 'They win.'}</div>
          <button type="button" onClick={() => { gameRef.current = createVolleyball(); setHud({ blue: 0, red: 0, message: '', winner: null }); setStarted(true); }} style={{ marginTop: 8, background: '#0284c7', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>REMATCH</button>
        </div>
      )}
      {started && !hud.winner && (
        <>
          <div style={{ position: 'absolute', left: 16, bottom: 24, zIndex: 6 }}>
            <WalkJoystick onMove={(x, y) => { joyRef.current = { x, y }; }} size={120} />
          </div>
          <button
            type="button"
            onPointerDown={() => { actRef.current = true; }}
            style={{ position: 'absolute', right: 20, bottom: 32, zIndex: 6, width: 104, height: 104, borderRadius: '50%', border: '3px solid #fff', cursor: 'pointer', fontSize: 19, fontWeight: 800, background: '#0284c7', color: '#fff' }}
          >
            HIT
          </button>
        </>
      )}
    </div>
  );
}
