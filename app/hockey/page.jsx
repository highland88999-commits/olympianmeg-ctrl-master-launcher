// app/hockey/page.jsx — Olympus Hockey: true fundamentals (Merlin, 2026-10-31).
//
// 4v4 (3 skaters + goalie). Blue lines, offside, creases, goalies,
// sticks, pass / check / steal, wrist / slap / backhand shots,
// penalties, overtime, shootout. Rules in lib/sports/hockey.js.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WalkJoystick from '@/components/world/WalkJoystick';
import {
  createHockey, stepHockey, faceoff,
  RINK_W, RINK_L, GOAL_W, BLUE_LINE_Z, GOAL_LINE_Z, CREASE_R,
  SHOT_TYPES, SHOT_TIMING, slapPower, pickPassTarget, passLeadPoint,
} from '@/lib/sports/hockey.js';

const TEAM_COLORS = { blue: '#3b82f6', red: '#ef4444' };

// Penalty clocks are real 2:00 — display what the engine counts.
function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function makeStick() {
  const g = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.6 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), shaftMat);
  shaft.position.y = 0.65;
  shaft.rotation.z = 0.25;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.45), shaftMat);
  blade.position.set(0.16, 0.04, 0.2);
  g.add(shaft, blade);
  g.position.set(0.45, 0, 0.15);
  return g;
}

export default function HockeyPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const passRef = useRef(false);
  const checkRef = useRef(false);
  // SHOOT fires on RELEASE (Merlin 2026-11-02): hold duration picks the shot.
  //   tap < 0.30s      → wrist shot (quick, accurate)
  //   0.30 – 0.60s     → backhand (half-second hold)
  //   > 0.60s          → slap shot, power scales with hold (power meter)
  const shootHoldRef = useRef({ active: false, start: 0 });
  const pendingShotRef = useRef(null); // { type, power } — consumed by the frame loop
  const meterRef = useRef(-1);
  const [shootMeter, setShootMeter] = useState(-1); // -1 = hidden, 0..1 = charge
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ blue: 0, red: 0, period: 1, clock: '3:00', message: '', winner: null, shootout: null });
  const hudPrevRef = useRef('');
  const startedRef = useRef(false);

  if (!gameRef.current) gameRef.current = createHockey();
  useEffect(() => { startedRef.current = started; }, [started]);

  // SHOOT release: hold duration → shot type + power (Merlin 2026-11-02)
  const releaseShoot = () => {
    const h = shootHoldRef.current;
    if (!h.active) return;
    h.active = false;
    const dur = (performance.now() - h.start) / 1000;
    let type;
    let power;
    if (dur < SHOT_TIMING.wristMax) {
      type = 'wrist';
      power = SHOT_TYPES.wrist.power;
    } else if (dur <= SHOT_TIMING.backhandMax) {
      type = 'backhand';
      power = SHOT_TYPES.backhand.power;
    } else {
      type = 'slap';
      power = slapPower(dur);
    }
    pendingShotRef.current = { type, power };
    meterRef.current = -1;
    setShootMeter(-1);
  };

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

    // Ice
    const ice = new THREE.Mesh(
      new THREE.PlaneGeometry(RINK_W, RINK_L),
      new THREE.MeshStandardMaterial({ color: '#dbeafe', roughness: 0.15, metalness: 0.1 })
    );
    ice.rotation.x = -Math.PI / 2;
    scene.add(ice);

    // Lines: red center, BLUE offside lines, red goal lines
    const redLineMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
    const blueLineMat = new THREE.MeshBasicMaterial({ color: '#2563eb' });
    const mkLine = (z, mat, w = 0.35) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(RINK_W, 0.02, w), mat);
      l.position.set(0, 0.01, z);
      scene.add(l);
    };
    mkLine(0, redLineMat); // center
    mkLine(BLUE_LINE_Z, blueLineMat, 0.5); // blue lines (offside)
    mkLine(-BLUE_LINE_Z, blueLineMat, 0.5);
    mkLine(GOAL_LINE_Z, redLineMat, 0.2); // goal lines
    mkLine(-GOAL_LINE_Z, redLineMat, 0.2);

    // Center circle + faceoff dots
    const circle = new THREE.Mesh(
      new THREE.RingGeometry(4, 4.3, 32),
      new THREE.MeshBasicMaterial({ color: '#3b82f6', side: THREE.DoubleSide })
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.01;
    scene.add(circle);
    const dotGeo = new THREE.CircleGeometry(0.3, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
    for (const [dx, dz] of [[-8, 14], [8, 14], [-8, -14], [8, -14], [0, 0]]) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(dx, 0.01, dz);
      scene.add(dot);
    }

    // Goal creases (light blue semicircles)
    const creaseMat = new THREE.MeshBasicMaterial({ color: '#93c5fd', transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    for (const gz of [GOAL_LINE_Z, -GOAL_LINE_Z]) {
      const crease = new THREE.Mesh(new THREE.CircleGeometry(CREASE_R, 20, 0, Math.PI), creaseMat);
      crease.rotation.x = -Math.PI / 2;
      crease.rotation.z = gz > 0 ? Math.PI : 0;
      crease.position.set(0, 0.015, gz);
      scene.add(crease);
    }

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

    // Nets IN the crease, on the goal line
    const goalMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 });
    const netMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    for (const gz of [GOAL_LINE_Z, -GOAL_LINE_Z]) {
      const dir = gz > 0 ? 1 : -1;
      for (const gx of [-GOAL_W / 2, GOAL_W / 2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8), goalMat);
        post.position.set(gx, 0.8, gz);
        scene.add(post);
      }
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, GOAL_W, 8), goalMat);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0, 1.6, gz);
      scene.add(cross);
      // Netting behind
      const netBack = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 1.6), netMat);
      netBack.position.set(0, 0.8, gz + dir * 1.1);
      scene.add(netBack);
      const netTop = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, 1.2), netMat);
      netTop.rotation.x = Math.PI / 2 - 0.5 * dir;
      netTop.position.set(0, 1.3, gz + dir * 0.55);
      scene.add(netTop);
    }

    // Players with sticks; goalies bigger with leg pads
    const playerMeshes = {};
    for (const p of gameRef.current.players) {
      const g = new THREE.Group();
      const isGoalie = p.role === 'G';
      const bodyH = isGoalie ? 0.9 : 0.7;
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(isGoalie ? 0.5 : 0.35, bodyH, 4, 10),
        new THREE.MeshStandardMaterial({ color: TEAM_COLORS[p.team], roughness: 0.5 })
      );
      body.position.y = isGoalie ? 1.0 : 0.9;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 10),
        new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4 })
      );
      head.position.y = isGoalie ? 1.85 : 1.65;
      g.add(body, head);
      if (isGoalie) {
        // Leg pads
        const padMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });
        for (const px of [-0.4, 0.4]) {
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.35), padMat);
          pad.position.set(px, 0.45, 0);
          g.add(pad);
        }
        // Blocker + glove
        const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.12), padMat);
        blocker.position.set(0.62, 0.9, 0.1);
        g.add(blocker);
      }
      // Hockey stick!
      const stick = makeStick();
      if (isGoalie) stick.scale.set(1.15, 1.15, 1.15);
      g.add(stick);
      g.userData.stick = stick;
      g.userData.isGoalie = isGoalie;
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

    // Guidance lines (Merlin 2026-11-02): dotted, in the rink plane.
    // Shot line (amber) while holding SHOOT — color shifts with the timing
    // window (green=wrist, yellow=backhand, orange/red=slap charging).
    // Pass line (green) while carrying — shows the current pass target.
    function makeGuideLine(color, opacity) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(),
      ]);
      const mat = new THREE.LineDashedMaterial({
        color, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      return line;
    }
    const shotGuide = makeGuideLine(0xfbbf24, 0.75);
    const passGuide = makeGuideLine(0x22c55e, 0.4);
    function setGuide(line, x1, z1, x2, z2) {
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, x1, 0.12, z1);
      pos.setXYZ(1, x2, 0.12, z2);
      pos.needsUpdate = true;
      line.computeLineDistances();
      line.visible = true;
    }

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
      const carrying = you && state.puck.holder === you.id;

      // SHOOT charge meter + guidance (while held)
      const hold = shootHoldRef.current;
      if (hold.active) {
        const dur = (now - hold.start) / 1000;
        const m = Math.min(1, dur / SHOT_TIMING.slapFull);
        if (Math.abs(m - meterRef.current) > 0.04) {
          meterRef.current = m;
          setShootMeter(m);
        }
        // Shot guidance line: puck → net mouth, colored by timing window
        if (carrying) {
          const targetZ = -GOAL_LINE_Z; // you attack the far net
          const windowColor = dur < SHOT_TIMING.wristMax ? 0x22c55e
            : dur <= SHOT_TIMING.backhandMax ? 0xfbbf24 : 0xfb7185;
          shotGuide.material.color.setHex(windowColor);
          setGuide(shotGuide, state.puck.x, state.puck.z, 0, targetZ);
        } else {
          shotGuide.visible = false;
        }
      } else {
        if (meterRef.current !== -1) { meterRef.current = -1; setShootMeter(-1); }
        shotGuide.visible = false;
      }

      // Pass guidance: faint green line to the current pass target while carrying
      if (carrying && state.status === 'play') {
        const mate = pickPassTarget(state, you, joyRef.current.x, -joyRef.current.y);
        if (mate) {
          const lead = passLeadPoint(mate);
          setGuide(passGuide, state.puck.x, state.puck.z, lead.x, lead.z);
        } else {
          passGuide.visible = false;
        }
      } else {
        passGuide.visible = false;
      }

      if (startedRef.current && (state.status === 'play' || state.status === 'shootout' || state.status === 'penaltyshot') && you) {
        const pending = pendingShotRef.current;
        pendingShotRef.current = null;
        stepHockey(state, dt, {
          mx: joyRef.current.x,
          mz: -joyRef.current.y,
          act: false,
          shoot: !!pending,
          shotType: pending ? pending.type : 'wrist',
          shotPower: pending ? pending.power : 0,
          pass: passRef.current,
          check: checkRef.current,
          aimDx: joyRef.current.x,
          aimDz: -joyRef.current.y,
        }, Math.random);
        passRef.current = false;
        checkRef.current = false;
        for (const ev of state.events) {
          if (ev.type === 'goal') msgRef.current = ev.team === 'blue' ? 'GOAL!' : 'They scored.';
          if (ev.type === 'period') msgRef.current = ev.period === 'ot' ? 'OVERTIME — sudden death' : `Period ${ev.period}`;
          if (ev.type === 'penalty') msgRef.current = `${ev.team === 'blue' ? 'Blue' : 'Red'} penalty: ${ev.reason} (${fmtClock(ev.seconds || 120)})`;
          if (ev.type === 'offside') msgRef.current = 'Offside!';
          if (ev.type === 'delayedOffside') msgRef.current = 'Delayed offside — tag up!';
          if (ev.type === 'delayedPenalty') msgRef.current = `Delayed penalty on ${ev.team === 'blue' ? 'Blue' : 'Red'}…`;
          if (ev.type === 'penaltyWiped') msgRef.current = 'Goal wipes out the delayed penalty.';
          if (ev.type === 'penaltyEnded') msgRef.current = 'Shorthanded goal — penalty over.';
          if (ev.type === 'icing') msgRef.current = 'Icing! Faceoff deep in the zone.';
          if (ev.type === 'icingWaved') msgRef.current = 'Icing waved off — play on.';
          if (ev.type === 'penaltyShot') msgRef.current = 'PENALTY SHOT!';
          if (ev.type === 'penaltyShotMiss') msgRef.current = 'Stopped! No goal.';
          if (ev.type === 'creaseViolation') msgRef.current = 'No goal — crease violation!';
          if (ev.type === 'check') msgRef.current = ev.checker === 'you' ? 'Big hit!' : 'You got leveled.';
          if (ev.type === 'save') msgRef.current = 'Saved!';
          if (ev.type === 'shootout') msgRef.current = 'SHOOTOUT';
          if (ev.type === 'shootoutResult') msgRef.current = ev.scored ? (ev.team === 'blue' ? 'Scores!' : 'They score.') : 'Stopped!';
        }
      } else if (startedRef.current && state.status === 'faceoff') {
        if (!frame.foTimer) frame.foTimer = now;
        if (now - frame.foTimer > 1500) {
          faceoff(state, state.nextFaceoffZ || 0);
          state.nextFaceoffZ = 0;
          frame.foTimer = 0;
          msgRef.current = '';
        }
      }

      // Sync meshes
      for (const p of state.players) {
        const m = playerMeshes[p.id];
        if (!m) continue;
        if (p.penalty > 0) {
          // Penalty box: off to the side
          m.position.set(p.team === 'blue' ? -RINK_W / 2 - 2 : RINK_W / 2 + 2, 0, 0);
          m.visible = true;
        } else {
          m.position.set(p.x, 0, p.z);
          m.visible = true;
        }
        // Face the play
        const targetZ = p.team === 'blue' ? -GOAL_LINE_Z : GOAL_LINE_Z;
        m.rotation.y = Math.atan2(0 - p.x, targetZ - p.z);
      }
      if (you && you.penalty <= 0) {
        youRing.position.x = you.x;
        youRing.position.z = you.z;
        youRing.visible = true;
      } else {
        youRing.visible = false;
      }
      puck.position.set(state.puck.x, 0.1, state.puck.z);
      if (state.puck.holder) {
        const holder = playerMeshes[state.puck.holder];
        if (holder) puck.position.set(holder.position.x + 0.5, 0.1, holder.position.z + 0.5);
      }

      if (you) {
        camera.position.set(you.x * 0.6, 22, you.z * 0.6 + 18);
        camera.lookAt(you.x * 0.6, 0, you.z * 0.6 - 5);
      }

      const mins = Math.floor(Math.max(0, state.clock) / 60);
      const secs = Math.floor(Math.max(0, state.clock) % 60).toString().padStart(2, '0');
      const periodLabel = state.period === 'ot' ? 'OT' : state.period === 'shootout' ? 'SO' : `P${state.period}`;
      const nextHud = {
        blue: state.score.blue, red: state.score.red, period: periodLabel,
        clock: state.period === 'shootout' ? '' : `${mins}:${secs}`,
        message: msgRef.current, winner: state.winner,
        shootout: state.period === 'shootout' ? state.shootout : null,
        youPenalty: you ? Math.ceil(you.penalty) : 0,
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
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  const periodColor = hud.period === 'OT' ? '#fbbf24' : hud.period === 'SO' ? '#f472b6' : '#f8fafc';

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a1628' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>
          🏒 HOCKEY <span style={{ fontWeight: 600 }}>{hud.blue}-{hud.red}</span>{' '}
          <span style={{ fontSize: 13, color: periodColor }}>{hud.period} {hud.clock}</span>
        </div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {hud.message && !hud.winner && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.85)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700 }}>{hud.message}</div>
        </div>
      )}
      {hud.youPenalty > 0 && (
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(127,29,29,0.9)', color: '#fff', padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
            ⏱️ Penalty box: {fmtClock(hud.youPenalty)}
          </div>
        </div>
      )}
      {hud.shootout && !hud.winner && (
        <div style={{ position: 'absolute', top: 80, left: 12, zIndex: 5, background: 'rgba(15,23,42,0.85)', color: '#f8fafc', padding: '8px 12px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
          SO: 🔵 {hud.shootout.blueMade} — 🔴 {hud.shootout.redMade}
        </div>
      )}
      {/* Pre-game menu card — art wrap (Merlin, 2026-11-01): generated
          ice-rink backdrop + readability scrim; the card contents below
          are untouched inside the relative wrapper. */}
      {!started && !hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: 'url(/images/hockey/hockey-menu-bg.webp)' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.55), rgba(0,0,0,0.88))' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>🏒</div>
          <div style={{ color: '#f8fafc', fontSize: 28, fontWeight: 800 }}>ICE HOCKEY</div>
          <div style={{ color: '#cbd5e1', fontSize: 14, maxWidth: 340, lineHeight: 1.6 }}>
            4v4 with goalies. Real NHL rules: icing, delayed offside, 2:00 penalties, OT, shootout.<br />
            <b>SHOOT</b> tap = wrist · 0.5s hold = backhand · longer hold = slap (power meter)<br />
            <b>PASS</b> feeds the best-placed teammate · <b>CHECK</b> levels the carrier — hitting anyone else is interference
          </div>
          <button type="button" onClick={() => { faceoff(gameRef.current); setStarted(true); }} style={{ marginTop: 8, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 40px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>DROP THE PUCK</button>
          </div>
        </div>
      )}
      {hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: 'url(/images/hockey/hockey-menu-bg.webp)' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.55), rgba(0,0,0,0.88))' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
          <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 800 }}>{hud.winner === 'blue' ? 'YOU WIN!' : 'They win.'}</div>
          <button type="button" onClick={() => { gameRef.current = createHockey(); setHud({ blue: 0, red: 0, period: 'P1', clock: '3:00', message: '', winner: null, shootout: null, youPenalty: 0 }); setStarted(true); }} style={{ marginTop: 8, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>REMATCH</button>
          </div>
        </div>
      )}
      {started && !hud.winner && (
        <>
          <div style={{ position: 'absolute', left: 16, bottom: 24, zIndex: 6 }}>
            <WalkJoystick onMove={(x, y) => { joyRef.current = { x, y }; }} size={120} />
          </div>
          <div style={{ position: 'absolute', right: 16, bottom: 24, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onPointerDown={() => { passRef.current = true; }}
                style={{ width: 72, height: 72, borderRadius: '50%', border: '2px solid #fff', cursor: 'pointer', fontSize: 13, fontWeight: 800, background: '#16a34a', color: '#fff' }}
              >
                PASS
              </button>
              <button
                type="button"
                onPointerDown={() => { checkRef.current = true; }}
                style={{ width: 72, height: 72, borderRadius: '50%', border: '2px solid #fff', cursor: 'pointer', fontSize: 13, fontWeight: 800, background: '#dc2626', color: '#fff' }}
              >
                CHECK
              </button>
            </div>
            <button
              type="button"
              onPointerDown={() => { shootHoldRef.current = { active: true, start: performance.now() }; }}
              onPointerUp={releaseShoot}
              onPointerLeave={releaseShoot}
              onPointerCancel={releaseShoot}
              style={{ width: 104, height: 104, borderRadius: '50%', border: '3px solid #fff', cursor: 'pointer', fontSize: 17, fontWeight: 800, background: '#3b82f6', color: '#fff', touchAction: 'none', userSelect: 'none' }}
            >
              SHOOT
            </button>
            {/* Power meter: fills while SHOOT is held */}
            {shootMeter >= 0 && (
              <div style={{ width: 104, height: 10, borderRadius: 999, background: 'rgba(15,23,42,0.8)', border: '1px solid #475569', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round(shootMeter * 100)}%`,
                  borderRadius: 999,
                  background: shootMeter < 0.25 ? '#22c55e' : shootMeter < 0.5 ? '#fbbf24' : '#fb7185',
                  transition: 'width 60ms linear',
                }} />
              </div>
            )}
            <div style={{ color: '#94a3b8', fontSize: 10 }}>tap=wrist · 0.5s=backhand · hold=slap</div>
          </div>
        </>
      )}
    </div>
  );
}
