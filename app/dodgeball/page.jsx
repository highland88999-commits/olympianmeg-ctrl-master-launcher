// app/dodgeball/page.jsx — Dodgeball: full 3D arena, 3v3, you + 2 bots vs 3 bots.
//
// The scene is one self-contained component: the canvas, HUD, joystick,
// and THROW button all live inside this container, so nothing here
// overlaps anything outside it. Game rules live in lib/dodgeball/rules.js
// (pure, node-tested); this file only renders state and feeds inputs.
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WalkJoystick from '@/components/world/WalkJoystick';
import { fx, unlockFx } from '@/lib/fx';
import {
  createMatch, step, autoAim,
  COURT_HALF_W, COURT_HALF_D, CATCH_PROMPT_DIST,
} from '@/lib/dodgeball/rules.js';
import {
  createLobby, tickLobby, buildRoster, lobbyCounts, LOBBY_SECONDS,
} from '@/lib/dodgeball/matchmaking.js';

const TEAM_COLORS = { blue: '#3b82f6', red: '#ef4444' };

function makeCourtTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 896;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 512, 896);
  // Canvas top = world -Z (red half); bottom = world +Z (blue half).
  ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
  ctx.fillRect(0, 0, 512, 448);
  ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
  ctx.fillRect(0, 448, 512, 448);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 6;
  ctx.strokeRect(16, 16, 480, 864);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(16, 448);
  ctx.lineTo(496, 448);
  ctx.stroke();
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(256, 448, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16, 224);
  ctx.lineTo(496, 224);
  ctx.moveTo(16, 672);
  ctx.lineTo(496, 672);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePlayerMesh(team, isHuman) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], roughness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.75, 4, 12), bodyMat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), headMat);
  head.position.y = 1.65;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.12, 0.1),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4 }),
  );
  visor.position.set(0, 1.68, 0.28);
  group.add(body, head, visor);
  group.userData = { bodyMat, headMat, isHuman, benched: false };
  return group;
}

export default function DodgeballPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef(new Set());
  const actRef = useRef(false);
  const padEdgeRef = useRef(false);
  const startedRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [inLobby, setInLobby] = useState(false);
  const [lobby, setLobby] = useState(null);
  const [camMode, setCamMode] = useState('third'); // 'third' | 'first'
  const camModeRef = useRef('third');
  const [hud, setHud] = useState({ blue: 3, red: 3, carrying: false, catchPrompt: false, message: '', winner: null });
  const hudPrevRef = useRef('');

  if (!gameRef.current) gameRef.current = createMatch();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1120');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 200);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(6, 14, 6);
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT_HALF_W * 2, COURT_HALF_D * 2),
      new THREE.MeshStandardMaterial({ map: makeCourtTexture(), roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.8 });
    const trimMat = new THREE.MeshBasicMaterial({ color: '#f59e0b' });
    const mkWall = (w, d, x, z) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wallMat);
      wall.position.set(x, 0.55, z);
      scene.add(wall);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w === 0.4 ? 0.5 : w, 0.08, d === 0.4 ? 0.5 : d), trimMat);
      trim.position.set(x, 1.14, z);
      scene.add(trim);
    };
    mkWall(0.4, COURT_HALF_D * 2 + 0.8, -COURT_HALF_W - 0.2, 0);
    mkWall(0.4, COURT_HALF_D * 2 + 0.8, COURT_HALF_W + 0.2, 0);
    mkWall(COURT_HALF_W * 2 + 0.8, 0.4, 0, -COURT_HALF_D - 0.2);
    mkWall(COURT_HALF_W * 2 + 0.8, 0.4, 0, COURT_HALF_D + 0.2);
    const postGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.6, 12);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, trimMat);
        post.position.set(sx * (COURT_HALF_W + 0.2), 0.8, sz * (COURT_HALF_D + 0.2));
        scene.add(post);
      }
    }
    const centerStrip = new THREE.Mesh(
      new THREE.BoxGeometry(COURT_HALF_W * 2, 0.06, 0.3),
      new THREE.MeshBasicMaterial({ color: '#ef4444' }),
    );
    centerStrip.position.set(0, 0.03, 0);
    scene.add(centerStrip);

    const playerMeshes = {};
    for (const p of gameRef.current.players) {
      const mesh = makePlayerMesh(p.team, p.isHuman);
      scene.add(mesh);
      playerMeshes[p.id] = mesh;
    }
    const youRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.9, 24),
      new THREE.MeshBasicMaterial({ color: '#fbbf24', side: THREE.DoubleSide }),
    );
    youRing.rotation.x = -Math.PI / 2;
    youRing.position.y = 0.02;
    scene.add(youRing);

    const ballMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 });
    const ballMeshes = gameRef.current.balls.map(() => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 14), ballMat);
      scene.add(mesh);
      return mesh;
    });

    const onKeyDown = (e) => {
      if (e.repeat) return;
      keysRef.current.add(e.key.toLowerCase());
      if (e.key === ' ' || e.key === 'Enter') actRef.current = true;
    };
    const onKeyUp = (e) => keysRef.current.delete(e.key.toLowerCase());
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;
    const messageRef = { current: '' };

    const frame = (now) => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const state = gameRef.current;
      const you = state.players.find((p) => p.isHuman);

      // ---- inputs: joystick, keyboard, gamepad (left stick + CONFIRM) ----
      let mx = joyRef.current.x;
      let mz = -joyRef.current.y;
      const keys = keysRef.current;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      if (keys.has('w') || keys.has('arrowup')) mz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) mz += 1;
      let padAct = false;
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads && pads[0];
        if (pad) {
          const dead = 0.15;
          const ax = Math.abs(pad.axes[0]) > dead ? pad.axes[0] : 0;
          const az = Math.abs(pad.axes[1]) > dead ? pad.axes[1] : 0;
          if (ax !== 0 || az !== 0) {
            mx = ax;
            mz = az;
          }
          const confirm = pad.buttons && pad.buttons[0] && pad.buttons[0].pressed;
          if (confirm && !padEdgeRef.current) padAct = true;
          padEdgeRef.current = !!confirm;
        }
      } catch (err) {
        // Gamepad polling must never break the match.
      }
      const doAct = actRef.current || padAct;
      actRef.current = false;

      if (startedRef.current && state.status === 'playing' && you) {
        const aim = autoAim(state, you);
        step(state, dt, { mx, mz, act: doAct, aimX: aim.x, aimZ: aim.z }, Math.random);
        for (const ev of state.events) {
          if (ev.type === 'threw' && ev.throwerId === 'you') fx.tap();
          if (ev.type === 'picked' && ev.playerId === 'you') fx.tap();
          if (ev.type === 'caught') {
            fx.checkpoint();
            messageRef.current = ev.catcherId === 'you'
              ? 'Caught! Thrower out.'
              : 'Your throw was caught — you’re out!';
          }
          if (ev.type === 'out') {
            fx.checkpoint();
            if (ev.victimId === 'you') messageRef.current = 'You’re out — your team fights on.';
            else if (ev.victimTeam === 'red') messageRef.current = 'Hit! Opponent out.';
          }
          if (ev.type === 'win') {
            if (ev.winner === 'blue') fx.gameWin();
            else fx.menuClose();
          }
        }
      }

      // ---- sync meshes from state ----
      const benchX = { blue: -COURT_HALF_W - 2.5, red: COURT_HALF_W + 2.5 };
      let benchIdx = { blue: 0, red: 0 };
      for (const p of state.players) {
        const mesh = playerMeshes[p.id];
        if (!mesh) continue;
        if (p.alive) {
          mesh.position.set(p.x, 0, p.z);
          mesh.rotation.y = p.facing;
          mesh.userData.bodyMat.color.set(TEAM_COLORS[p.team]);
          mesh.visible = true;
        } else {
          const idx = benchIdx[p.team];
          benchIdx[p.team] += 1;
          mesh.position.set(benchX[p.team], 0, -6 + idx * 3);
          mesh.rotation.y = p.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
          mesh.userData.bodyMat.color.set('#6b7280');
          mesh.visible = true;
        }
      }
      for (let i = 0; i < state.balls.length; i++) {
        const b = state.balls[i];
        ballMeshes[i].position.set(b.x, b.mode === 'carried' ? 0.9 : 0.35, b.z);
      }
      if (you) {
        youRing.position.x = you.x;
        youRing.position.z = you.z;
        youRing.visible = you.alive;
        if (camModeRef.current === 'first' && you.alive) {
          // First-person: camera at the player's head, looking where they face.
          const dirX = Math.sin(you.facing);
          const dirZ = Math.cos(you.facing);
          camera.position.set(you.x, 1.7, you.z);
          camera.lookAt(you.x + dirX * 10, 1.2, you.z + dirZ * 10);
          // Hide the player's own mesh so it doesn't block the view.
          const youMesh = playerMeshes[you.id];
          if (youMesh) youMesh.visible = false;
        } else {
          const youMesh = playerMeshes[you.id];
          if (youMesh && you.alive) youMesh.visible = true;
          camera.position.set(you.x * 0.55, 9.5, you.z + 8.5);
          camera.lookAt(you.x * 0.55, 0.5, you.z - 3.5);
        }
      }

      // ---- HUD, only when something changed ----
      let catchPrompt = false;
      if (you && you.alive && you.hasBall === null && state.status === 'playing') {
        for (const b of state.balls) {
          if (b.mode !== 'flying' || !b.throwerId) continue;
          const thrower = state.players.find((p) => p.id === b.throwerId);
          if (!thrower || thrower.team === you.team) continue;
          const dx = you.x - b.x;
          const dz = you.z - b.z;
          if (Math.hypot(dx, dz) < CATCH_PROMPT_DIST && b.vx * dx + b.vz * dz > 0) {
            catchPrompt = true;
            break;
          }
        }
      }
      const nextHud = {
        blue: state.players.filter((p) => p.team === 'blue' && p.alive).length,
        red: state.players.filter((p) => p.team === 'red' && p.alive).length,
        carrying: !!(you && you.hasBall !== null),
        catchPrompt,
        message: messageRef.current,
        winner: state.winner,
      };
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
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the frame loop's started flag in sync with React state.
  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  // Keep the camera mode ref in sync for the frame loop.
  useEffect(() => {
    camModeRef.current = camMode;
  }, [camMode]);

  // Lobby countdown: 60s, then AI fills the gaps and the match starts.
  useEffect(() => {
    if (!inLobby || !lobby || started) return undefined;
    const id = setInterval(() => {
      setLobby((prev) => {
        if (!prev) return prev;
        const next = { ...prev, players: [...prev.players] };
        if (tickLobby(next, 1)) {
          // Time's up — build the roster and start.
          const roster = buildRoster(next);
          gameRef.current = createMatch(roster);
          setHud({ blue: 3, red: 3, carrying: false, catchPrompt: false, message: '', winner: null });
          setStarted(true);
          setInLobby(false);
          return { ...next, status: 'done' };
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [inLobby, started]); // eslint-disable-line react-hooks/exhaustive-deps

  const openLobby = () => {
    try {
      unlockFx();
      fx.tap();
    } catch (err) {
      // Sound is garnish; a sound failure never blocks the match.
    }
    setLobby(createLobby('you', 'You'));
    setInLobby(true);
  };

  const startNow = () => {
    if (!lobby) return;
    const roster = buildRoster(lobby);
    gameRef.current = createMatch(roster);
    setHud({ blue: 3, red: 3, carrying: false, catchPrompt: false, message: '', winner: null });
    setStarted(true);
    setInLobby(false);
  };

  const startMatch = () => {
    // Legacy direct start (kept for rematch): AI fills all non-human slots.
    try {
      unlockFx();
      fx.tap();
    } catch (err) {
      // Sound is garnish; a sound failure never blocks the match.
    }
    gameRef.current = createMatch();
    setHud({ blue: 3, red: 3, carrying: false, catchPrompt: false, message: '', winner: null });
    setStarted(true);
  };

  const dots = (n) => '●'.repeat(n) + '○'.repeat(3 - n);
  const you = gameRef.current.players.find((p) => p.isHuman);
  const out = !!(you && !you.alive && hud.winner === null);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0b1120' }}>
      {/* Top HUD bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>
          <span style={{ color: '#60a5fa' }}>YOU {dots(hud.blue)}</span>
          <span style={{ color: '#94a3b8', margin: '0 8px' }}>vs</span>
          <span style={{ color: '#f87171' }}>{dots(hud.red)} FOES</span>
        </div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>

      {/* Message banner */}
      {hud.message && !hud.winner && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.85)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>
            {hud.message}
          </div>
        </div>
      )}
      {out && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc', padding: '6px 14px', borderRadius: 999, fontSize: 13 }}>
            Watching from the bench — your team fights on
          </div>
        </div>
      )}

      {/* Start overlay -> matchmaking lobby */}
      {!started && !inLobby && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(11, 17, 32, 0.72)', padding: 20, textAlign: 'center' }}>
          <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 800 }}>DODGEBALL</div>
          <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 340, lineHeight: 1.5 }}>
            3v3 PvP arena. Find a match — players join first, AI fills
            the gaps after 60 seconds. Throw balls to hit opponents out.
            Tap THROW just as a ball arrives to catch it. Last team standing wins.
          </div>
          <button
            type="button"
            onClick={openLobby}
            style={{ marginTop: 8, background: '#f59e0b', color: '#111827', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}
          >
            FIND MATCH
          </button>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>Joystick or WASD to move · THROW button, Space, or controller X/A</div>
        </div>
      )}

      {/* Matchmaking lobby — art wrap (Merlin, 2026-11-01): generated
          arena backdrop + readability scrim; the roster and controls
          below are untouched inside the relative wrapper. */}
      {!started && inLobby && lobby && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20, textAlign: 'center' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: 'url(/images/dodgeball/dodgeball-menu-bg.webp)' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.55), rgba(0,0,0,0.88))' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>FINDING MATCH</div>
          <div style={{ color: '#fbbf24', fontSize: 42, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {Math.ceil(lobby.secondsLeft)}s
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13, maxWidth: 320 }}>
            Players join first — AI fills the gaps when the timer hits zero.
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>BLUE</div>
              {[0, 1, 2].map((i) => {
                const roster = buildRoster(lobby);
                const slot = roster.filter((c) => c.team === 'blue')[i];
                const isHuman = slot && slot.isHuman;
                return (
                  <div key={i} style={{ color: isHuman ? '#f8fafc' : '#475569', fontSize: 13, padding: '4px 0' }}>
                    {slot ? (isHuman ? `● ${slot.name}` : '○ AI') : '○ Waiting...'}
                  </div>
                );
              })}
            </div>
            <div>
              <div style={{ color: '#f87171', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>RED</div>
              {[0, 1, 2].map((i) => {
                const roster = buildRoster(lobby);
                const slot = roster.filter((c) => c.team === 'red')[i];
                const isHuman = slot && slot.isHuman;
                return (
                  <div key={i} style={{ color: isHuman ? '#f8fafc' : '#475569', fontSize: 13, padding: '4px 0' }}>
                    {slot ? (isHuman ? `● ${slot.name}` : '○ AI') : '○ Waiting...'}
                  </div>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={startNow}
            style={{ marginTop: 4, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            START NOW WITH AI
          </button>
          </div>
        </div>
      )}

      {/* End overlay */}
      {started && hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(11, 17, 32, 0.72)', padding: 20, textAlign: 'center' }}>
          <div style={{ color: hud.winner === 'blue' ? '#60a5fa' : '#f87171', fontSize: 34, fontWeight: 800 }}>
            {hud.winner === 'blue' ? 'YOU WIN!' : 'Red team wins.'}
          </div>
          <div style={{ color: '#cbd5e1', fontSize: 15 }}>
            {hud.winner === 'blue' ? 'Last team standing. Nice throwing.' : 'They got the last of your team. Run it back.'}
          </div>
          <button
            type="button"
            onClick={startMatch}
            style={{ marginTop: 8, background: '#f59e0b', color: '#111827', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}
          >
            REMATCH
          </button>
        </div>
      )}

      {/* Camera toggle: third-person / first-person */}
      {started && !hud.winner && (
        <button
          type="button"
          onClick={() => setCamMode((m) => (m === 'third' ? 'first' : 'third'))}
          style={{
            position: 'absolute', top: 44, right: 12, zIndex: 6,
            background: 'rgba(15, 23, 42, 0.8)', color: '#f8fafc',
            border: '1px solid #475569', borderRadius: 999,
            padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {camMode === 'third' ? '🎥 1st Person' : '🎥 3rd Person'}
        </button>
      )}

      {/* Controls: joystick bottom-left, THROW bottom-right */}
      {started && !hud.winner && (
        <>
          <div style={{ position: 'absolute', left: 16, bottom: 24, zIndex: 6 }}>
            <WalkJoystick onMove={(x, y) => { joyRef.current = { x, y }; }} size={120} />
          </div>
          <button
            type="button"
            onPointerDown={() => { actRef.current = true; }}
            style={{
              position: 'absolute', right: 20, bottom: 32, zIndex: 6, width: 104, height: 104, borderRadius: '50%',
              border: '3px solid #f8fafc', cursor: 'pointer', fontSize: 19, fontWeight: 800,
              background: hud.catchPrompt ? '#ef4444' : hud.carrying ? '#f59e0b' : '#94a3b8',
              color: hud.catchPrompt ? '#fff' : '#111827',
              transform: hud.catchPrompt ? 'scale(1.08)' : 'none',
            }}
          >
            {hud.catchPrompt ? 'CATCH!' : 'THROW'}
          </button>
        </>
      )}
    </div>
  );
}
