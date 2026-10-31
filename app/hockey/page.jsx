// app/hockey/page.jsx — Olympus Hockey: 3v3 ice hockey, NHL arcade style.
//
// You + 2 AI vs 3 AI. Two 3-minute periods. Rules in lib/sports/hockey.js.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WalkJoystick from '@/components/world/WalkJoystick';
import { createHockey, stepHockey, faceoff, RINK_W, RINK_L, GOAL_W } from '@/lib/sports/hockey.js';

const TEAM_COLORS = { blue: '#3b82f6', red: '#ef4444' };

export default function HockeyPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const actRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ blue: 0, red: 0, period: 1, clock: '3:00', message: '', winner: null });
  const hudPrevRef = useRef('');
  const startedRef = useRef(false);

  if (!gameRef.current) gameRef.current = createHockey();
  useEffect(() => { startedRef.current = started; }, [started]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a1628');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 300);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(0, 30, 0);
    scene.add(sun);

    // Ice rink
    const ice = new THREE.Mesh(
      new THREE.PlaneGeometry(RINK_W, RINK_L),
      new THREE.MeshStandardMaterial({ color: '#dbeafe', roughness: 0.15, metalness: 0.1 })
    );
    ice.rotation.x = -Math.PI / 2;
    scene.add(ice);
    // Center line + circle
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(RINK_W, 0.02, 0.3), lineMat);
    centerLine.position.y = 0.01;
    scene.add(centerLine);
    const circle = new THREE.Mesh(
      new THREE.RingGeometry(4, 4.3, 32),
      new THREE.MeshBasicMaterial({ color: '#3b82f6', side: THREE.DoubleSide })
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.01;
    scene.add(circle);
    // Boards
    const boardMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });
    const mkBoard = (w, d, x, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), boardMat);
      b.position.set(x, 0.6, z);
      scene.add(b);
    };
    mkBoard(RINK_W + 1, 0.4, 0, RINK_L / 2 + 0.2);
    mkBoard(RINK_W + 1, 0.4, 0, -RINK_L / 2 - 0.2);
    mkBoard(0.4, RINK_L + 1, -RINK_W / 2 - 0.2, 0);
    mkBoard(0.4, RINK_L + 1, RINK_W / 2 + 0.2, 0);
    // Goals
    const goalMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 });
    for (const gz of [RINK_L / 2 - 0.5, -RINK_L / 2 + 0.5]) {
      const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8), goalMat);
      post1.position.set(-GOAL_W / 2, 0.75, gz);
      const post2 = post1.clone();
      post2.position.x = GOAL_W / 2;
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, GOAL_W, 8), goalMat);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0, 1.5, gz);
      scene.add(post1, post2, cross);
    }

    // Players (on skates — simple figures)
    const playerMeshes = {};
    for (const p of gameRef.current.players) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 0.7, 4, 10),
        new THREE.MeshStandardMaterial({ color: TEAM_COLORS[p.team], roughness: 0.5 })
      );
      body.position.y = 0.9;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 10),
        new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4 })
      );
      head.position.y = 1.65; // helmet
      g.add(body, head);
      scene.add(g);
      playerMeshes[p.id] = g;
    }
    const youRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.8, 20),
      new THREE.MeshBasicMaterial({ color: '#fbbf24', side: THREE.DoubleSide })
    );
    youRing.rotation.x = -Math.PI / 2;
    youRing.position.y = 0.02;
    scene.add(youRing);

    // Puck
    const puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12),
      new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 })
    );
    scene.add(puck);

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

      if (startedRef.current && state.status === 'play' && you) {
        stepHockey(state, dt, { mx: joyRef.current.x, mz: -joyRef.current.y, act: actRef.current }, Math.random);
        actRef.current = false;
        for (const ev of state.events) {
          if (ev.type === 'goal') msgRef.current = ev.team === 'blue' ? 'GOAL!' : 'They scored.';
          if (ev.type === 'period') msgRef.current = 'Period 2';
        }
        if (state.status === 'faceoff' && !frame.faceoffTimer) frame.faceoffTimer = now;
      } else if (startedRef.current && state.status === 'faceoff') {
        if (!frame.faceoffTimer) frame.faceoffTimer = now;
        if (now - frame.faceoffTimer > 1500) {
          faceoff(state);
          frame.faceoffTimer = 0;
          msgRef.current = '';
        }
      }

      for (const p of state.players) {
        const m = playerMeshes[p.id];
        if (m) m.position.set(p.x, 0, p.z);
      }
      if (you) {
        youRing.position.x = you.x;
        youRing.position.z = you.z;
      }
      puck.position.set(state.puck.x, 0.1, state.puck.z);
      // Highlight puck holder
      if (state.puck.holder) {
        const holder = playerMeshes[state.puck.holder];
        if (holder) puck.position.set(holder.position.x, 0.1, holder.position.z + 0.8);
      }

      if (you) {
        camera.position.set(you.x * 0.6, 22, you.z * 0.6 + 18);
        camera.lookAt(you.x * 0.6, 0, you.z * 0.6 - 5);
      }

      const mins = Math.floor(Math.max(0, state.clock) / 60);
      const secs = Math.floor(Math.max(0, state.clock) % 60).toString().padStart(2, '0');
      const nextHud = { blue: state.score.blue, red: state.score.red, period: state.period, clock: `${mins}:${secs}`, message: msgRef.current, winner: state.winner };
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a1628' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>🏒 HOCKEY <span style={{ fontWeight: 600 }}>{hud.blue}-{hud.red}</span> <span style={{ fontSize: 13, color: '#94a3b8' }}>P{hud.period} {hud.clock}</span></div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {hud.message && !hud.winner && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700 }}>{hud.message}</div>
        </div>
      )}
      {!started && !hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(10,22,40,0.7)', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>🏒</div>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>ICE HOCKEY</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>3v3, two 3-minute periods. Skate with the joystick, tap SHOOT to fire at their net.</div>
          <button type="button" onClick={() => { faceoff(gameRef.current); setStarted(true); }} style={{ marginTop: 8, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>DROP THE PUCK</button>
        </div>
      )}
      {hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(15,23,42,0.8)', padding: 20, textAlign: 'center' }}>
          <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 800 }}>{hud.winner === 'blue' ? 'YOU WIN!' : hud.winner === 'tie' ? 'TIE GAME' : 'They win.'}</div>
          <button type="button" onClick={() => { gameRef.current = createHockey(); setHud({ blue: 0, red: 0, period: 1, clock: '3:00', message: '', winner: null }); setStarted(true); }} style={{ marginTop: 8, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>REMATCH</button>
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
            style={{ position: 'absolute', right: 20, bottom: 32, zIndex: 6, width: 104, height: 104, borderRadius: '50%', border: '3px solid #fff', cursor: 'pointer', fontSize: 18, fontWeight: 800, background: '#3b82f6', color: '#fff' }}
          >
            SHOOT
          </button>
        </>
      )}
    </div>
  );
}
