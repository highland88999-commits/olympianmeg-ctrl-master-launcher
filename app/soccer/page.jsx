// app/soccer/page.jsx — Olympus Soccer: 7v7, Olympus Cup rules.
//
// You (striker) + 6 AI vs 7 AI. Two 10-minute halves, FIFA Laws of the Game.
// Rules in lib/sports/soccer.js.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WalkJoystick from '@/components/world/WalkJoystick';
import { createSoccer, stepSoccer, kickoff, PITCH_W, PITCH_L, GOAL_W, FORMAT_SHORT } from '@/lib/sports/soccer.js';
import { loadSportPlayer } from '@/lib/sports/player-models.js';
import { cachedMaps, grassMaps, crowdMaps, netTexture, soccerBallMaps, breathScale, breathTilt, phaseFor } from '@/lib/sports/cgi.js';

const TEAM_COLORS = { blue: '#3b82f6', red: '#ef4444' };

// Subtle press feedback for menu/action buttons: brief shrink on pointer
// down, released on up/cancel/leave. No layout change.
const pressable = {
  onPointerDown: (e) => { e.currentTarget.style.transform = 'scale(0.95)'; },
  onPointerUp: (e) => { e.currentTarget.style.transform = ''; },
  onPointerCancel: (e) => { e.currentTarget.style.transform = ''; },
  onPointerLeave: (e) => { e.currentTarget.style.transform = ''; },
};
const PRESS_TRANSITION = 'transform 0.08s ease';

export default function SoccerPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const actRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ blue: 0, red: 0, half: 1, clock: '10:00', message: '', winner: null });
  const hudPrevRef = useRef('');
  const startedRef = useRef(false);

  if (!gameRef.current) gameRef.current = createSoccer();
  useEffect(() => { startedRef.current = started; }, [started]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a1f0a');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 400);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(20, 40, 20);
    scene.add(sun);

    // Pitch — CGI grass: mow stripes + blade grain baked into a seeded
    // colour/bump pair (lib/sports/cgi.js); the old 8 flat stripe planes
    // are gone, the stripes live in the texture now.
    const grass = cachedMaps('grass', 0x5a0cc4, grassMaps);
    grass.map.repeat.set(6, 10);
    grass.bumpMap.repeat.set(6, 10);
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH_W, PITCH_L),
      new THREE.MeshStandardMaterial({ map: grass.map, bumpMap: grass.bumpMap, bumpScale: 0.6, roughness: 0.9 })
    );
    pitch.rotation.x = -Math.PI / 2;
    scene.add(pitch);
    // Lines
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const mkLine = (w, d, x, z) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
      l.position.set(x, 0.01, z);
      scene.add(l);
    };
    mkLine(PITCH_W, 0.2, 0, PITCH_L / 2);
    mkLine(PITCH_W, 0.2, 0, -PITCH_L / 2);
    mkLine(0.2, PITCH_L, -PITCH_W / 2, 0);
    mkLine(0.2, PITCH_L, PITCH_W / 2, 0);
    mkLine(PITCH_W, 0.2, 0, 0);
    const circle = new THREE.Mesh(new THREE.RingGeometry(6, 6.3, 40), new THREE.MeshBasicMaterial({ color: '#fff', side: THREE.DoubleSide }));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.01;
    scene.add(circle);
    // Goals — posts + crossbar as before, plus woven netting (back, top,
    // both sides) from the seeded net texture.
    const goalMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 });
    const netTex = netTexture();
    netTex.repeat.set(4, 2);
    const soccerNetMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (const gz of [PITCH_L / 2, -PITCH_L / 2]) {
      const dir = gz > 0 ? 1 : -1;
      for (const gx of [-GOAL_W / 2, GOAL_W / 2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8), goalMat);
        post.position.set(gx, 1.25, gz);
        scene.add(post);
      }
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, GOAL_W, 8), goalMat);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0, 2.5, gz);
      scene.add(cross);
      const netBack = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 2.5), soccerNetMat);
      netBack.position.set(0, 1.25, gz + dir * 1.2);
      scene.add(netBack);
      const netTop = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 1.2), soccerNetMat);
      netTop.rotation.x = Math.PI / 2 - 0.45 * dir;
      netTop.position.set(0, 2.1, gz + dir * 0.6);
      scene.add(netTop);
      for (const sx of [-1, 1]) {
        const netSide = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.5), soccerNetMat);
        netSide.rotation.y = Math.PI / 2;
        netSide.position.set(sx * GOAL_W / 2, 1.25, gz + dir * 0.6);
        scene.add(netSide);
      }
    }

    // Environment — crowd stands on all four sides (seeded crowd speckle)
    // and floodlight poles with emissive heads. No extra lights (perf).
    const crowd = cachedMaps('crowd', 0xc0d, crowdMaps);
    crowd.map.repeat.set(6, 1);
    const standMat = new THREE.MeshStandardMaterial({ map: crowd.map, bumpMap: crowd.bumpMap, bumpScale: 0.4, roughness: 0.95 });
    const standSide = (w, d, x, z) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), standMat);
      s.position.set(x, 2.5, z);
      scene.add(s);
    };
    standSide(8, PITCH_L + 12, -(PITCH_W / 2 + 6), 0);
    standSide(8, PITCH_L + 12, PITCH_W / 2 + 6, 0);
    standSide(PITCH_W + 12, 8, 0, -(PITCH_L / 2 + 6));
    standSide(PITCH_W + 12, 8, 0, PITCH_L / 2 + 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5, metalness: 0.6 });
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fefce8', emissive: '#fef9c3', emissiveIntensity: 1.6 });
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 18, 8), poleMat);
      pole.position.set(px * (PITCH_W / 2 + 3), 9, pz * (PITCH_L / 2 + 3));
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 0.4), lampMat);
      lamp.position.set(px * (PITCH_W / 2 + 3), 18.2, pz * (PITCH_L / 2 + 3));
      lamp.lookAt(0, 0, 0);
      scene.add(lamp);
    }

    const playerMeshes = {};
    // TRIPO RIGGED PLAYERS (Merlin, 2026-11-03): Batch 9 GLB models replace
    // the procedural capsule players. Loaded async; placeholder groups hold
    // positions until the GLBs arrive. Jerseys tint per team via setTeamColor.
    for (const p of gameRef.current.players) {
      const g = new THREE.Group();
      scene.add(g);
      playerMeshes[p.id] = g;
      const isGoalie = p.role === 'gk';
      loadSportPlayer('soccer', isGoalie).then((model) => {
        model.userData.setTeamColor(TEAM_COLORS[p.team]);
        g.add(model);
      }).catch(() => {
        // Fallback: procedural capsule if the GLB fails to load.
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.35, 0.7, 4, 10),
          new THREE.MeshStandardMaterial({ color: TEAM_COLORS[p.team], roughness: 0.6 })
        );
        body.position.y = 0.9;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 12, 10),
          new THREE.MeshStandardMaterial({ color: '#e5e7eb' })
        );
        head.position.y = 1.65;
        g.add(body, head);
      });
    }
    const youRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 20), new THREE.MeshBasicMaterial({ color: '#fbbf24', side: THREE.DoubleSide }));
    youRing.rotation.x = -Math.PI / 2;
    youRing.position.y = 0.02;
    scene.add(youRing);

    // Ball — panelled leather (seeded pentagon patches + grain) that
    // rolls with its travel instead of spinning on a fixed axis.
    const soccerBall = cachedMaps('soccerBall', 0xba11, soccerBallMaps);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 24, 18),
      new THREE.MeshStandardMaterial({ map: soccerBall.map, bumpMap: soccerBall.bumpMap, bumpScale: 0.3, roughness: 0.35 })
    );
    scene.add(ball);
    const ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false })
    );
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.y = 0.02;
    scene.add(ballShadow);
    const prevBall = { x: 0, z: 0 };
    const rollAxis = new THREE.Vector3();
    const prevPlayerPos = {};

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

      // REMATCH swaps in a fresh game object — drop any leftover message
      // from the previous match (the initial kickoff pushes no 'kickoff'
      // event, so the handler below never clears it).
      if (frame.lastGame !== state) {
        frame.lastGame = state;
        msgRef.current = '';
      }

      if (startedRef.current && state.status === 'play' && you) {
        stepSoccer(state, dt, { mx: joyRef.current.x, mz: -joyRef.current.y, act: actRef.current }, Math.random);
        actRef.current = false;
        for (const ev of state.events) {
          if (ev.type === 'goal') msgRef.current = ev.team === 'blue' ? 'GOAL!' : 'They scored.';
          if (ev.type === 'half') msgRef.current = 'Second half — ends changed';
          if (ev.type === 'foul') msgRef.current = 'Foul! Free kick.';
          if (ev.type === 'offside') msgRef.current = 'Offside!';
          if (ev.type === 'penalty') msgRef.current = 'Penalty!';
          if (ev.type === 'corner') msgRef.current = 'Corner';
          if (ev.type === 'throwin') msgRef.current = 'Throw-in';
          if (ev.type === 'goalkick') msgRef.current = 'Goal kick';
          if (ev.type === 'freekick') msgRef.current = 'Free kick';
          if (ev.type === 'kickoff') msgRef.current = '';
          if (ev.type === 'card') msgRef.current = ev.color === 'red' ? 'Red card — sent off!' : 'Yellow card';
          if (ev.type === 'abandoned') msgRef.current = 'Match abandoned — too few players.';
        }
      } else if (startedRef.current && state.status === 'kickoff') {
        if (!frame.koTimer) frame.koTimer = now;
        if (now - frame.koTimer > 1500) {
          kickoff(state);
          frame.koTimer = 0;
          msgRef.current = '';
        }
      }

      for (const p of state.players) {
        const m = playerMeshes[p.id];
        if (m) {
          m.position.set(p.x, 0, p.z);
          // Idle life: standing players breathe (scale + sway); moving
          // players stand tall. Phase is seeded per player id.
          const prev = prevPlayerPos[p.id];
          const speed = prev && dt > 0 ? Math.hypot(p.x - prev.x, p.z - prev.z) / dt : 0;
          prevPlayerPos[p.id] = { x: p.x, z: p.z };
          const t = now / 1000;
          const phase = phaseFor(p.id);
          if (speed < 0.8) {
            m.scale.y = breathScale(t, phase);
            m.rotation.z = breathTilt(t, phase);
          } else {
            m.scale.y = 1;
            m.rotation.z = 0;
          }
        }
      }
      if (you) {
        youRing.position.x = you.x;
        youRing.position.z = you.z;
      }
      ball.position.set(state.ball.x, 0.4, state.ball.z);
      if (state.ball.holder) {
        const h = playerMeshes[state.ball.holder];
        if (h) ball.position.set(h.position.x, 0.4, h.position.z + 0.9);
      }
      // Roll the ball along its travel direction; shadow tracks it.
      const bdx = ball.position.x - prevBall.x;
      const bdz = ball.position.z - prevBall.z;
      const bdist = Math.hypot(bdx, bdz);
      if (bdist > 0.001) {
        rollAxis.set(bdz, 0, -bdx).normalize();
        ball.rotateOnWorldAxis(rollAxis, bdist / 0.4);
      }
      prevBall.x = ball.position.x;
      prevBall.z = ball.position.z;
      ballShadow.position.x = ball.position.x;
      ballShadow.position.z = ball.position.z;

      if (you) {
        camera.position.set(you.x * 0.7, 26, you.z * 0.7 + 22);
        camera.lookAt(you.x * 0.5, 0, you.z * 0.5 - 8);
      }

      const mins = Math.floor(Math.max(0, state.clock) / 60);
      const secs = Math.floor(Math.max(0, state.clock) % 60).toString().padStart(2, '0');
      const nextHud = { blue: state.score.blue, red: state.score.red, half: state.half, clock: `${mins}:${secs}`, message: msgRef.current, winner: state.winner };
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a1f0a' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>⚽ SOCCER <span style={{ fontWeight: 600 }}>{hud.blue}-{hud.red}</span> <span style={{ fontSize: 13, color: '#94a3b8' }}>H{hud.half} {hud.clock}</span> <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{FORMAT_SHORT}</span></div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto', padding: '8px 10px', margin: '-8px -10px' }}>✕ Leave</a>
      </div>
      {hud.message && !hud.winner && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700 }}>{hud.message}</div>
        </div>
      )}
      {!started && !hud.winner && (
        // Menu art wrap (Merlin, 2026-11-01): generated floodlit-stadium
        // backdrop + readability scrim; the intro card and every control
        // below are untouched.
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/soccer/soccer-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(5,15,5,0.72), rgba(5,15,5,0.55) 50%, rgba(5,15,5,0.88))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>⚽</div>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>SOCCER</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>7-a-side, two 10-minute halves per Olympus Cup rules. You're the striker — dribble with the joystick, tap SHOOT in range.</div>
          <button type="button" {...pressable} onClick={() => { kickoff(gameRef.current); setStarted(true); }} style={{ marginTop: 8, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer', transition: PRESS_TRANSITION }}>KICK OFF</button>
          </div>
        </div>
      )}
      {hud.winner && (
        // Win art wrap (Merlin, 2026-11-01): generated celebration
        // backdrop + readability scrim; the result card below is untouched.
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/soccer/soccer-win-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,10,10,0.72), rgba(10,10,10,0.6) 50%, rgba(10,10,10,0.9))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 800 }}>{hud.winner === 'blue' ? 'YOU WIN!' : hud.winner === 'tie' ? 'DRAW' : 'They win.'}</div>
          <button type="button" {...pressable} onClick={() => { gameRef.current = createSoccer(); setHud({ blue: 0, red: 0, half: 1, clock: '10:00', message: '', winner: null }); setStarted(true); }} style={{ marginTop: 8, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer', transition: PRESS_TRANSITION }}>REMATCH</button>
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
            onPointerDown={(e) => { actRef.current = true; e.currentTarget.style.transform = 'scale(0.94)'; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ''; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ''; }}
            onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
            style={{ position: 'absolute', right: 20, bottom: 32, zIndex: 6, width: 104, height: 104, borderRadius: '50%', border: '3px solid #fff', cursor: 'pointer', fontSize: 18, fontWeight: 800, background: '#16a34a', color: '#fff', transition: PRESS_TRANSITION, touchAction: 'manipulation' }}
          >
            SHOOT
          </button>
        </>
      )}
    </div>
  );
}
