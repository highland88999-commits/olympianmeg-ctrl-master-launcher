// app/tennis/page.jsx — Olympus Tennis: singles vs AI.
//
// ITF scoring: 15/30/40, games, sets (best of 3), tie-break.
// Rules in lib/sports/tennis.js.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WalkJoystick from '@/components/world/WalkJoystick';
import { createRacket, stepRacket, serveRacket, courtDims, formatScore } from '@/lib/sports/tennis.js';

export default function TennisPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const actRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ scoreText: '', message: '', winner: null });
  const hudPrevRef = useRef('');
  const startedRef = useRef(false);

  if (!gameRef.current) gameRef.current = createRacket('tennis');
  useEffect(() => { startedRef.current = started; }, [started]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const d = courtDims('tennis');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a4d1a');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 200);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(10, 25, 10);
    scene.add(sun);

    // Court (green with blue playing area)
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(d.W + 8, d.L + 8),
      new THREE.MeshStandardMaterial({ color: '#2d6a2d', roughness: 0.9 })
    );
    outer.rotation.x = -Math.PI / 2;
    scene.add(outer);
    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(d.W, d.L),
      new THREE.MeshStandardMaterial({ color: '#3b82c4', roughness: 0.85 })
    );
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.01;
    scene.add(court);
    // Lines
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const mkLine = (w, dep, x, z) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, dep), lineMat);
      l.position.set(x, 0.02, z);
      scene.add(l);
    };
    mkLine(d.W, 0.1, 0, d.L / 2);
    mkLine(d.W, 0.1, 0, -d.L / 2);
    mkLine(0.1, d.L, -d.W / 2, 0);
    mkLine(0.1, d.L, d.W / 2, 0); // fixed 2026-11-02: was (0.1, d.W/2, d.W/2) — a 5.5m white slab instead of a full-length sideline
    mkLine(d.W, 0.1, 0, 0); // service line (simplified)
    // Net
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(d.W, d.NET_H),
      new THREE.MeshStandardMaterial({ color: '#111111', transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    net.position.set(0, d.NET_H / 2, 0);
    scene.add(net);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, d.NET_H + 0.2, 8), new THREE.MeshStandardMaterial({ color: '#888' }));
      post.position.set(sx * d.W / 2, (d.NET_H + 0.2) / 2, 0);
      scene.add(post);
    }

    // Players
    const mkPlayer = (color) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
      body.position.y = 0.9;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), new THREE.MeshStandardMaterial({ color: '#e5e7eb' }));
      head.position.y = 1.65;
      // Racket
      const racket = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 12), new THREE.MeshStandardMaterial({ color: '#8b4513' }));
      racket.position.set(0.5, 1.1, 0.2);
      g.add(body, head, racket);
      scene.add(g);
      return g;
    };
    const youMesh = mkPlayer('#3b82f6');
    const aiMesh = mkPlayer('#ef4444');
    const youRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 20), new THREE.MeshBasicMaterial({ color: '#fbbf24', side: THREE.DoubleSide }));
    youRing.rotation.x = -Math.PI / 2;
    youRing.position.y = 0.02;
    scene.add(youRing);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      new THREE.MeshStandardMaterial({ color: '#ccff00', roughness: 0.5 })
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
          else if (ev.type === 'let') msgRef.current = 'Let — replay the serve.';
          else if (ev.type === 'fault') msgRef.current = ev.double ? 'Double fault.' : 'Fault — second serve.';
          else if (ev.type === 'game') msgRef.current = ev.winner === 'you' ? 'Game!' : 'Game to AI.';
          else if (ev.type === 'set') msgRef.current = ev.winner === 'you' ? 'Set!' : 'Set to AI.';
        }
      } else if (startedRef.current && state.status === 'serve') {
        if (!frame.serveTimer) frame.serveTimer = now;
        if (now - frame.serveTimer > 1200) {
          serveRacket(state);
          frame.serveTimer = 0;
          msgRef.current = '';
        }
      }

      youMesh.position.set(state.you.x, 0, state.you.z);
      aiMesh.position.set(state.ai.x, 0, state.ai.z);
      youRing.position.x = state.you.x;
      youRing.position.z = state.you.z;
      ball.position.set(state.ball.x, state.ball.y, state.ball.z);

      camera.position.set(state.you.x * 0.5, 12, state.you.z + 12);
      camera.lookAt(0, 0.5, -2);

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
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else if (m) m.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#1a4d1a' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>🎾 TENNIS <span style={{ fontSize: 14 }}>{hud.scoreText}</span></div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {hud.message && !hud.winner && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>{hud.message}</div>
        </div>
      )}
      {!started && !hud.winner && (
        // Menu art wrap (Merlin, 2026-11-01): generated storm-sky court
        // backdrop + readability scrim; the intro card and every control
        // below are untouched.
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/tennis/tennis-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(5,8,18,0.72), rgba(5,8,18,0.55) 50%, rgba(5,8,18,0.88))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>🎾</div>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>TENNIS</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>Singles vs AI. Real ITF scoring: 15-30-40, games, sets, tie-break. Move with the joystick, tap HIT to swing.</div>
          <button type="button" onClick={() => setStarted(true)} style={{ marginTop: 8, background: '#ccff00', color: '#1a4d1a', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>PLAY</button>
          </div>
        </div>
      )}
      {hud.winner && (
        // Win art wrap (Merlin, 2026-11-01): generated sunbreak court
        // backdrop + readability scrim; the result card below is untouched.
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/tennis/tennis-win-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,8,10,0.72), rgba(8,8,10,0.6) 50%, rgba(8,8,10,0.9))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ color: hud.winner === 'you' ? '#ccff00' : '#f87171', fontSize: 34, fontWeight: 800 }}>{hud.winner === 'you' ? 'YOU WIN!' : 'AI wins.'}</div>
          <div style={{ color: '#cbd5e1', fontSize: 15 }}>{hud.scoreText}</div>
          <button type="button" onClick={() => { gameRef.current = createRacket('tennis'); setHud({ scoreText: '', message: '', winner: null }); setStarted(true); }} style={{ marginTop: 8, background: '#ccff00', color: '#1a4d1a', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>REMATCH</button>
          </div>
        </div>
      )}
      {started && !hud.winner && (
        <>
          <div style={{ position: 'absolute', left: 16, bottom: 24, zIndex: 6 }}>
            <WalkJoystick onMove={(x, y) => { joyRef.current = { x, y }; }} size={120} />
          </div>
          <button
            type="button"
            onPointerDown={(e) => { actRef.current = true; e.currentTarget.style.transform = 'scale(0.92)'; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ''; }}
            onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
            style={{ position: 'absolute', right: 20, bottom: 32, zIndex: 6, width: 104, height: 104, borderRadius: '50%', border: '3px solid #fff', cursor: 'pointer', fontSize: 19, fontWeight: 800, background: '#ccff00', color: '#1a4d1a', transition: 'transform 90ms ease' }}
          >
            HIT
          </button>
        </>
      )}
    </div>
  );
}
