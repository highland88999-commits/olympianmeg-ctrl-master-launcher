// app/run-it-straight/page.jsx — "Run It Straight": one-on-one collision sport.
//
// Two runners, one narrow lane, no sidestepping. Mash to build power,
// meet in the middle, and run through them. Best of 5.
// Rules in lib/sports/run-it-straight.js.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createRunItStraight, startRound, stepRunIt, nextRound, LANE_W, LANE_L } from '@/lib/sports/run-it-straight.js';

export default function RunItStraightPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const mashRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ you: 0, ai: 0, round: 1, message: 'MASH TO RUN!', winner: null, phase: 'ready' });
  const hudPrevRef = useRef('');
  const startedRef = useRef(false);

  if (!gameRef.current) gameRef.current = createRunItStraight();
  useEffect(() => { startedRef.current = started; }, [started]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f1a0f');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(0, 25, 0);
    scene.add(sun);

    // Lane
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_W, LANE_L),
      new THREE.MeshStandardMaterial({ color: '#3a5f3a', roughness: 0.9 })
    );
    lane.rotation.x = -Math.PI / 2;
    scene.add(lane);
    // Lane edges
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, LANE_L), edgeMat);
      edge.position.set(sx * LANE_W / 2, 0.01, 0);
      scene.add(edge);
    }
    // Clash zone marker
    const midLine = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.02, 0.4), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    midLine.position.y = 0.01;
    scene.add(midLine);
    // Grass around
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), new THREE.MeshStandardMaterial({ color: '#1e3a1e', roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.05;
    scene.add(grass);

    // Runners
    const mkRunner = (color) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 4, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
      body.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: '#e5e7eb' }));
      head.position.y = 1.95;
      const legs = [];
      const legGeo = new THREE.CylinderGeometry(0.13, 0.1, 1.0, 6);
      const legMat = new THREE.MeshStandardMaterial({ color: '#1e293b' });
      for (const lz of [0.2, -0.2]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(0, 0.5, lz);
        g.add(leg);
        legs.push(leg);
      }
      g.add(body, head);
      g.userData.legs = legs;
      scene.add(g);
      return g;
    };
    const youMesh = mkRunner('#3b82f6');
    const aiMesh = mkRunner('#ef4444');

    // Impact flash
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0 })
    );
    scene.add(flash);

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;
    const msgRef = { current: 'MASH TO RUN!' };

    const frame = (now) => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const state = gameRef.current;

      if (startedRef.current && state.status === 'run') {
        stepRunIt(state, dt, mashRef.current, Math.random);
        for (const ev of state.events) {
          if (ev.type === 'clash') {
            msgRef.current = ev.winner === 'you' ? (ev.attackerWins && ev.youAttacking ? 'RAN THROUGH!' : 'STONEWALLED!') : 'THEY GOT YOU';
            flash.position.set(0, 1.2, (state.you.z + state.ai.z) / 2);
            flash.material.opacity = 0.9;
            setTimeout(() => {
              if (state.status === 'clash') nextRound(state);
            }, 1400);
          }
        }
      }

      // Sync meshes
      youMesh.position.set(0, 0, state.you.z);
      aiMesh.position.set(0, 0, state.ai.z);
      youMesh.rotation.y = Math.PI;
      // Running leg pump
      const t = now * 0.02;
      if (state.status === 'run') {
        for (const m of [youMesh, aiMesh]) {
          const legs = m.userData.legs;
          legs[0].rotation.x = Math.sin(t) * 0.7;
          legs[1].rotation.x = Math.sin(t + Math.PI) * 0.7;
        }
      }
      // Clash knockback
      if (state.status === 'clash') {
        const lastEv = state.events.find((e) => e.type === 'clash');
        // Simple: loser stumbles back
      }
      flash.material.opacity = Math.max(0, flash.material.opacity - dt * 2);

      // Side camera tracking the clash point
      const midZ = (state.you.z + state.ai.z) / 2;
      camera.position.set(10, 5, midZ + 6);
      camera.lookAt(0, 1.2, midZ);

      const nextHud = { you: state.score.you, ai: state.score.ai, round: state.round, message: msgRef.current, winner: state.winner, phase: state.status };
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

  const begin = () => {
    startRound(gameRef.current);
    setStarted(true);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0f1a0f' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>💥 RUN IT STRAIGHT <span style={{ fontSize: 14 }}>{hud.you}-{hud.ai}</span></div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {hud.message && !hud.winner && hud.phase === 'run' && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700 }}>{hud.message}</div>
        </div>
      )}
      {!started && !hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/run-it-straight/run-it-straight-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.70), rgba(0,0,0,0.55), rgba(0,0,0,0.85))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 56 }}>💥</div>
            <div style={{ color: '#f8fafc', fontSize: 26, fontWeight: 800 }}>RUN IT STRAIGHT</div>
            <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>One lane. No sidestepping. Mash RUN to build power, then meet them head-on. Best of 5 — you attack, then defend.</div>
            <button type="button" onClick={begin} style={{ marginTop: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>RUN</button>
          </div>
        </div>
      )}
      {hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/run-it-straight/run-it-straight-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.70), rgba(0,0,0,0.55), rgba(0,0,0,0.85))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ color: hud.winner === 'you' ? '#4ade80' : '#f87171', fontSize: 34, fontWeight: 800 }}>{hud.winner === 'you' ? 'YOU WIN!' : 'THEY WIN.'}</div>
            <button type="button" onClick={() => { gameRef.current = createRunItStraight(); setHud({ you: 0, ai: 0, round: 1, message: 'MASH TO RUN!', winner: null, phase: 'ready' }); begin(); }} style={{ marginTop: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>REMATCH</button>
          </div>
        </div>
      )}
      {started && !hud.winner && hud.phase === 'run' && (
        <button
          type="button"
          onPointerDown={() => { mashRef.current = true; }}
          onPointerUp={() => { mashRef.current = false; }}
          onPointerLeave={() => { mashRef.current = false; }}
          style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 6, width: 140, height: 140, borderRadius: '50%', border: '4px solid #fbbf24', cursor: 'pointer', fontSize: 22, fontWeight: 800, background: '#ef4444', color: '#fff', userSelect: 'none', touchAction: 'none' }}
        >
          RUN!
        </button>
      )}
    </div>
  );
}
