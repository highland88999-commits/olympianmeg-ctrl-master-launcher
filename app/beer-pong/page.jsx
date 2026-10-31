// app/beer-pong/page.jsx — Olympus Beer Pong with Call Cam.
//
// Classic 10-cup beer pong vs AI. Toss the ball with a swipe.
// Call Cam: optional face-to-face video while you play (getUserMedia).

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const CUPS_PER_SIDE = 10;

function cupPositions(side) {
  // Triangle rack: 4-3-2-1 rows
  const positions = [];
  const zBase = side === 'you' ? 4 : -4;
  const dir = side === 'you' ? 1 : -1;
  let row = 0;
  let count = 0;
  for (let r = 4; r >= 1 && count < CUPS_PER_SIDE; r--) {
    for (let i = 0; i < r && count < CUPS_PER_SIDE; i++) {
      positions.push({
        x: (i - (r - 1) / 2) * 0.55,
        z: zBase + dir * row * 0.5,
        alive: true,
      });
      count++;
    }
    row++;
  }
  return positions;
}

export default function BeerPongPage() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [callOn, setCallOn] = useState(false);
  const [hud, setHud] = useState({ you: CUPS_PER_SIDE, ai: CUPS_PER_SIDE, message: 'Swipe up to toss!', winner: null, turn: 'you' });
  const gameRef = useRef(null);

  if (!gameRef.current) {
    gameRef.current = {
      youCups: cupPositions('you'),
      aiCups: cupPositions('ai'),
      ball: { x: 0, y: 1, z: 6, vx: 0, vy: 0, vz: 0, flying: false },
      turn: 'you',
      winner: null,
    };
  }

  // Call Cam
  const toggleCall = async () => {
    if (callOn) {
      const stream = videoRef.current?.srcObject;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCallOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCallOn(true);
    } catch (err) {
      setHud((h) => ({ ...h, message: 'Camera blocked — check permissions.' }));
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a0f2e');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffe0b3, 0.7);
    sun.position.set(0, 15, 5);
    scene.add(sun);

    // Table
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.15, 14),
      new THREE.MeshStandardMaterial({ color: '#5b3a1a', roughness: 0.6 })
    );
    table.position.y = 0.9;
    scene.add(table);
    for (const [lx, lz] of [[-1.3, -6.5], [1.3, -6.5], [-1.3, 6.5], [1.3, 6.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), new THREE.MeshStandardMaterial({ color: '#3a2a1a' }));
      leg.position.set(lx, 0.45, lz);
      scene.add(leg);
    }

    // Cups
    const cupMeshes = { you: [], ai: [] };
    const cupGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.35, 12, 1, true);
    const cupMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4, side: THREE.DoubleSide });
    const rimGeo = new THREE.TorusGeometry(0.22, 0.02, 6, 12);
    for (const side of ['you', 'ai']) {
      for (const cup of gameRef.current[side === 'you' ? 'youCups' : 'aiCups']) {
        const g = new THREE.Group();
        const cup = new THREE.Mesh(cupGeo, cupMat);
        cup.position.y = 0.175;
        const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: '#ffffff' }));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.35;
        g.add(cup, rim);
        g.position.set(cup.x, 0.975, cup.z);
        scene.add(g);
        cupMeshes[side].push(g);
      }
    }

    // Ball
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 10),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 })
    );
    scene.add(ball);

    // Swipe to toss
    let swipeStart = null;
    const onPointerDown = (e) => { swipeStart = { x: e.clientX, y: e.clientY, t: Date.now() }; };
    const onPointerUp = (e) => {
      if (!swipeStart || !startedRef.current) return;
      const g = gameRef.current;
      if (g.turn !== 'you' || g.ball.flying || g.winner) return;
      const dy = swipeStart.y - e.clientY; // upward swipe = positive
      const dx = e.clientX - swipeStart.x;
      const dt = Math.max(50, Date.now() - swipeStart.t);
      if (dy > 30) {
        const power = Math.min(1.5, dy / 200 + 0.5);
        g.ball.flying = true;
        g.ball.x = 0; g.ball.y = 1.3; g.ball.z = 6;
        g.ball.vx = (dx / dt) * 2;
        g.ball.vy = 4.5 * power;
        g.ball.vz = -(6 + power * 6);
        setHud((h) => ({ ...h, message: '' }));
      }
      swipeStart = null;
    };
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;
    const startedRef = { current: false };

    const frame = (now) => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const g = gameRef.current;

      if (g.ball.flying) {
        const b = g.ball;
        b.vy -= 9.8 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;

        // Check cup hits (AI side cups when you throw)
        const targetCups = g.turn === 'you' ? g.aiCups : g.youCups;
        const meshes = g.turn === 'you' ? cupMeshes.ai : cupMeshes.you;
        for (let i = 0; i < targetCups.length; i++) {
          const cup = targetCups[i];
          if (!cup.alive) continue;
          const dx = b.x - cup.x;
          const dz = b.z - cup.z;
          // Ball drops into cup mouth
          if (Math.hypot(dx, dz) < 0.24 && b.y < 1.35 && b.y > 0.9 && b.vy < 0) {
            cup.alive = false;
            meshes[i].visible = false;
            b.flying = false;
            const remaining = targetCups.filter((c) => c.alive).length;
            if (g.turn === 'you') {
              setHud((h) => ({ ...h, ai: remaining, message: remaining === 0 ? '' : 'NICE SHOT!' }));
              if (remaining === 0) {
                g.winner = 'you';
                setHud((h) => ({ ...h, winner: 'you', message: '' }));
              } else {
                g.turn = 'ai';
                setTimeout(aiThrow, 1200);
              }
            } else {
              setHud((h) => ({ ...h, you: remaining, message: 'They sank one.' }));
              if (remaining === 0) {
                g.winner = 'ai';
                setHud((h) => ({ ...h, winner: 'ai', message: '' }));
              } else {
                g.turn = 'you';
                setHud((h) => ({ ...h, message: 'Your turn — swipe up to toss!' }));
              }
            }
            break;
          }
        }
        // Missed everything — ball lands
        if (b.flying && (b.y < 0.95 || Math.abs(b.z) > 8)) {
          b.flying = false;
          if (g.turn === 'you') {
            g.turn = 'ai';
            setHud((h) => ({ ...h, message: 'Miss. Their turn.' }));
            setTimeout(aiThrow, 1200);
          } else {
            g.turn = 'you';
            setHud((h) => ({ ...h, message: 'They missed. Your turn!' }));
          }
        }
      }
      ball.position.set(g.ball.x, g.ball.y, g.ball.z);
      ball.visible = g.ball.flying || g.turn === 'you';

      camera.position.set(0, 4.5, 10);
      camera.lookAt(0, 1, -2);

      renderer.render(scene, camera);
    };

    const aiThrow = () => {
      const g = gameRef.current;
      if (g.winner || g.turn !== 'ai') return;
      // AI aims at a random live cup
      const live = g.youCups.filter((c) => c.alive);
      if (!live.length) return;
      const target = live[Math.floor(Math.random() * live.length)];
      g.ball.flying = true;
      g.ball.x = 0; g.ball.y = 1.3; g.ball.z = -6;
      // 55% accuracy
      const hit = Math.random() < 0.55;
      const tx = hit ? target.x : target.x + (Math.random() - 0.5) * 1.5;
      const tz = hit ? target.z : target.z + (Math.random() - 0.5) * 1.5;
      const airTime = 0.8;
      g.ball.vx = (tx - g.ball.x) / airTime;
      g.ball.vz = (tz - g.ball.z) / airTime;
      g.ball.vy = 4.2;
    };

    // Sync startedRef with React state via a small interval
    const syncId = setInterval(() => {
      startedRef.current = document.querySelector('[data-beer-started]') !== null;
    }, 200);

    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearInterval(syncId);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} data-beer-started={started ? '1' : undefined} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#1a0f2e' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>🍺 BEER PONG <span style={{ fontSize: 13 }}>{hud.you}v{hud.ai}</span></div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button type="button" onClick={toggleCall} style={{ background: callOn ? '#16a34a' : 'rgba(15,23,42,0.8)', color: '#fff', border: '1px solid #475569', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {callOn ? '📹 Call On' : '📹 Call Cam'}
          </button>
          <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', alignSelf: 'center' }}>✕</a>
        </div>
      </div>

      {/* Call Cam video */}
      {callOn && (
        <video ref={videoRef} playsInline muted style={{ position: 'absolute', top: 48, right: 12, width: 110, height: 150, objectFit: 'cover', borderRadius: 12, border: '2px solid #16a34a', zIndex: 6, background: '#000' }} />
      )}

      {hud.message && !hud.winner && (
        <div style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>{hud.message}</div>
        </div>
      )}

      {!started && !hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(26,15,46,0.75)', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>🍺</div>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>BEER PONG</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>10 cups each vs AI. Swipe UP on the table to toss. Turn on Call Cam to face-time while you play.</div>
          <button type="button" onClick={() => setStarted(true)} style={{ marginTop: 8, background: '#f59e0b', color: '#1a0f2e', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>RACK 'EM</button>
        </div>
      )}
      {hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(15,23,42,0.85)', padding: 20, textAlign: 'center' }}>
          <div style={{ color: hud.winner === 'you' ? '#fbbf24' : '#f87171', fontSize: 34, fontWeight: 800 }}>{hud.winner === 'you' ? 'YOU WIN!' : 'AI wins.'}</div>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 8, background: '#f59e0b', color: '#1a0f2e', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>REMATCH</button>
        </div>
      )}
      <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
    </div>
  );
}
