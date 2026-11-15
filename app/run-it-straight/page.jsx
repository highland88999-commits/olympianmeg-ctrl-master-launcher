// app/run-it-straight/page.jsx — "Run It Straight": one-on-one collision sport.
//
// Two runners, one narrow lane, no sidestepping. MASH (tap!) to build power,
// meet in the middle, and run through them. Best of 5.
// Rules in lib/sports/run-it-straight.js.
//
// PLAYERS (Merlin, 2026-11-02): procedural rigged humanoids — real joint
// hierarchy (hips/knees/shoulders/elbows), run cycle, tackle lean, and a
// full knockback fall for the loser. No auto-run: speed comes only from taps.

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createRunItStraight, startRound, stepRunIt, tapYou, LANE_W, LANE_L, MAX_SPEED } from '@/lib/sports/run-it-straight.js';
import { loadSportPlayer } from '@/lib/sports/player-models.js';

// Mixamo -> game joint name mapping for the Tripo rugby player.
// NOTE: three's GLTFLoader sanitizes node names on load (PropertyBinding.
// sanitizeNodeName strips ':'), so the file's 'mixamorig:Hips' arrives in
// the scene as 'mixamorigHips'. Mapping against the colon form matches
// NOTHING — every joint came back undefined and poseRunner threw
// "Cannot read properties of undefined (reading 'rotation')" every frame
// (Run It Straight scout flaw, Nov 14). These are the as-loaded names,
// verified against public/models/sports/rugby-player.glb (65-joint skin).
// lib/hawkins/rig.js normalizes the same way for the same reason.
const MIXAMO_JOINT_MAP = {
  hips: 'mixamorigHips',
  torso: 'mixamorigSpine2',
  head: 'mixamorigHead',
  shoulderL: 'mixamorigLeftArm',
  elbowL: 'mixamorigLeftForeArm',
  shoulderR: 'mixamorigRightArm',
  elbowR: 'mixamorigRightForeArm',
  hipL: 'mixamorigLeftUpLeg',
  kneeL: 'mixamorigLeftLeg',
  hipR: 'mixamorigRightUpLeg',
  kneeR: 'mixamorigRightLeg',
};

/** Build a rigged humanoid runner. Returns { group, joints }.
 *  Uses the Tripo rugby player GLB (Merlin, 2026-11-03); falls back to
 *  the procedural rig if the GLB fails to load OR if its joints don't
 *  map (a rig with missing joints used to throw in poseRunner every frame).
 *  NOTE: loadSportPlayer's plain .clone() shares the source skeleton, so the
 *  cloned mesh would deform from the CACHED scene's bones, not the clone's
 *  own — posing the clone's bones would move nothing visible. So the clone's
 *  skinned mesh is rebound here to its OWN bones (matched by name; the 65
 *  names are unique), each runner getting its own skeleton. three's
 *  SkeletonUtils.clone can't do this job: it looks bones up by object
 *  identity inside the source hierarchy, and the shared skeleton's bones
 *  live outside the clone — every lookup comes back undefined. */
async function mkRiggedRunner(teamColor) {
  try {
    const model = await loadSportPlayer('run-it-straight', false);
    model.userData.setTeamColor(teamColor);
    // Rebind the clone's skinned mesh to the clone's own bones.
    let skinned = null;
    const ownBones = new Map();
    model.traverse((o) => {
      if (o.isBone) ownBones.set(o.name, o);
      if (o.isSkinnedMesh && !skinned) skinned = o;
    });
    if (skinned) {
      const rebound = skinned.skeleton.bones.map((b) => ownBones.get(b.name));
      if (rebound.length === skinned.skeleton.bones.length && rebound.every(Boolean)) {
        const skeleton = skinned.skeleton.clone();
        skeleton.bones = rebound;
        skinned.bind(skeleton, skinned.bindMatrix);
      }
    }
    const group = new THREE.Group();
    group.add(model);
    // Map Mixamo joints to the game's joint names.
    const joints = {};
    model.traverse((o) => {
      if (!o.isBone) return;
      for (const [gameName, mixamoName] of Object.entries(MIXAMO_JOINT_MAP)) {
        if (o.name === mixamoName) joints[gameName] = o;
      }
    });
    // Every joint the pose code touches must be present — otherwise the
    // per-frame pose throws. A partial rig is a broken rig: fall back.
    const missing = Object.keys(MIXAMO_JOINT_MAP).filter((k) => !joints[k]);
    if (missing.length) {
      console.warn('[run-it-straight] Tripo rig missing joints, using procedural rig:', missing.join(', '));
      return mkProceduralRunner(teamColor);
    }
    // The posed joints must be the ones the rendered mesh deforms from.
    if (!skinned || !Object.values(joints).every((j) => skinned.skeleton.bones.includes(j))) {
      console.warn('[run-it-straight] Tripo rig skeleton mismatch, using procedural rig');
      return mkProceduralRunner(teamColor);
    }
    // The game expects hips at y≈0.95; the Tripo model is ~1.8m tall.
    // Wrap in a group so the game's position/rotation logic works.
    return { group, joints };
  } catch (err) {
    // Fallback: procedural rig (original implementation).
    return mkProceduralRunner(teamColor);
  }
}

/** Original procedural rigged runner (fallback). */
function mkProceduralRunner(teamColor) {
  const group = new THREE.Group();
  const joints = {};
  const teamMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#e8b88a', roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7 });

  // Hips root (pivot for falls)
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  group.add(hips);
  joints.hips = hips;

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.24), darkMat);
  hips.add(pelvis);

  // Torso
  const torsoG = new THREE.Group();
  torsoG.position.y = 0.12;
  hips.add(torsoG);
  joints.torso = torsoG;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.34, 4, 10), teamMat);
  torso.position.y = 0.28;
  torsoG.add(torso);

  // Head
  const headG = new THREE.Group();
  headG.position.y = 0.58;
  torsoG.add(headG);
  joints.head = headG;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), skinMat);
  head.position.y = 0.1;
  headG.add(head);

  // Arms: shoulder -> elbow -> hand
  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.26 * side, 0.48, 0);
    torsoG.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 4, 8), teamMat);
    upper.position.y = -0.16;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), skinMat);
    fore.position.y = -0.14;
    elbow.add(fore);
    elbow.rotation.x = -0.5; // natural bend
    return { shoulder, elbow };
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);
  joints.shoulderL = armL.shoulder;
  joints.elbowL = armL.elbow;
  joints.shoulderR = armR.shoulder;
  joints.elbowR = armR.elbow;

  // Legs: hip -> knee -> foot
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(0.13 * side, -0.08, 0);
    hips.add(hip);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), darkMat);
    thigh.position.y = -0.22;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.45;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), darkMat);
    shin.position.y = -0.2;
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), darkMat);
    foot.position.set(0, -0.4, 0.06);
    knee.add(foot);
    return { hip, knee };
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);
  joints.hipL = legL.hip;
  joints.kneeL = legL.knee;
  joints.hipR = legR.hip;
  joints.kneeR = legR.knee;

  return { group, joints };
}

export default function RunItStraightPage() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ you: 0, ai: 0, round: 1, message: 'TAP TO RUN!', winner: null, phase: 'ready', power: 0 });
  const hudPrevRef = useRef('');
  const startedRef = useRef(false);

  if (!gameRef.current) gameRef.current = createRunItStraight();
  useEffect(() => { startedRef.current = started; }, [started]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let cancelled = false;
    let cleanup = null;

    // Async scene setup (Tripo runners load as GLBs).
    (async () => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0f1a0f');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(0, 25, 0);
    scene.add(sun);

    // Lane
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_W, LANE_L),
      new THREE.MeshStandardMaterial({ color: '#3a5f3a', roughness: 0.9 })
    );
    lane.rotation.x = -Math.PI / 2;
    scene.add(lane);
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, LANE_L), edgeMat);
      edge.position.set(sx * LANE_W / 2, 0.01, 0);
      scene.add(edge);
    }
    const midLine = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.02, 0.4), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    midLine.position.y = 0.01;
    scene.add(midLine);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), new THREE.MeshStandardMaterial({ color: '#1e3a1e', roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.05;
    scene.add(grass);

    // Rigged runners: you (blue) face -z, AI (red) face +z
    // (Tripo GLBs load async; the scene starts when both arrive.)
    const [youRig, aiRig] = await Promise.all([
      mkRiggedRunner('#3b82f6'),
      mkRiggedRunner('#ef4444'),
    ]);
    youRig.group.rotation.y = Math.PI; // face -z (up the lane)
    scene.add(youRig.group, aiRig.group);

    // Impact flash
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0 })
    );
    scene.add(flash);

    // Dust puffs (knockback landing)
    const dustPool = [];
    const dustGeo = new THREE.SphereGeometry(0.3, 8, 6);
    const dustMat = new THREE.MeshBasicMaterial({ color: '#a08c6a', transparent: true, opacity: 0 });
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Mesh(dustGeo, dustMat.clone());
      d.visible = false;
      scene.add(d);
      dustPool.push({ mesh: d, t: 0, active: false });
    }
    const puffDust = (x, z) => {
      let n = 0;
      for (const p of dustPool) {
        if (p.active || n >= 4) continue;
        p.active = true;
        p.t = 0;
        p.mesh.visible = true;
        p.mesh.position.set(x + (Math.random() - 0.5) * 0.8, 0.25, z + (Math.random() - 0.5) * 0.8);
        p.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
        n++;
      }
    };

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;
    const msgRef = { current: 'TAP TO RUN!' };
    let dustPuffed = false;

    /** Pose a runner: run cycle, idle, or clash/knockback. */
    const poseRunner = (rig, state, role, now) => {
      const j = rig.joints;
      // Defense in depth: a rig with missing joints must never throw
      // mid-frame — leave it in bind pose instead. mkRiggedRunner already
      // falls back to the procedural rig when joints don't map; this guard
      // covers any future partial rig.
      if (!Object.keys(MIXAMO_JOINT_MAP).every((k) => j[k])) return;
      const t = now * 0.001;
      const speedNorm = Math.min(1, state.speed / MAX_SPEED);

      if (role === 'knockback') {
        // Loser: flying back, falling flat. c.loserFall 0->1.
        const c = gameRef.current.clash;
        const fall = c ? c.loserFall : 0;
        // Rotate hips back to flat (PI/2 = lying on back)
        j.hips.rotation.x = -fall * Math.PI * 0.52;
        j.hips.position.y = 0.95 - fall * 0.55;
        // Limbs splay
        const flail = Math.sin(t * 30) * 0.25 * (1 - fall * 0.5);
        j.hipL.rotation.x = 0.5 + flail;
        j.hipR.rotation.x = -0.4 - flail;
        j.kneeL.rotation.x = 0.4;
        j.kneeR.rotation.x = 0.3;
        j.shoulderL.rotation.x = -1.2 + flail;
        j.shoulderR.rotation.x = -1.0 - flail;
        j.shoulderL.rotation.z = 0.5;
        j.shoulderR.rotation.z = -0.5;
        j.torso.rotation.x = 0.15;
        return;
      }
      if (role === 'winnerStumble') {
        // Winner: 2-3 quick stumble steps through contact
        const st = t * 14;
        j.hipL.rotation.x = Math.sin(st) * 0.9;
        j.hipR.rotation.x = Math.sin(st + Math.PI) * 0.9;
        j.kneeL.rotation.x = Math.max(0, -Math.sin(st)) * 1.1;
        j.kneeR.rotation.x = Math.max(0, Math.sin(st)) * 1.1;
        j.shoulderL.rotation.x = Math.sin(st + Math.PI) * 0.7;
        j.shoulderR.rotation.x = Math.sin(st) * 0.7;
        j.torso.rotation.x = 0.35; // leaning through
        j.hips.position.y = 0.95 + Math.abs(Math.sin(st)) * 0.04;
        return;
      }
      if (role === 'clashContact') {
        // The instant of impact: both lean in, arms up
        j.torso.rotation.x = 0.45;
        j.hipL.rotation.x = 0.5;
        j.hipR.rotation.x = -0.3;
        j.kneeL.rotation.x = 0.5;
        j.kneeR.rotation.x = 0.4;
        j.shoulderL.rotation.x = -1.4;
        j.shoulderR.rotation.x = -1.4;
        j.elbowL.rotation.x = -0.8;
        j.elbowR.rotation.x = -0.8;
        return;
      }
      if (state.speed > 0.3) {
        // RUN cycle: legs/arms pump, torso leans with speed
        const stride = t * (6 + speedNorm * 10);
        j.hipL.rotation.x = Math.sin(stride) * (0.5 + speedNorm * 0.5);
        j.hipR.rotation.x = Math.sin(stride + Math.PI) * (0.5 + speedNorm * 0.5);
        j.kneeL.rotation.x = Math.max(0, -Math.sin(stride)) * (0.6 + speedNorm * 0.7);
        j.kneeR.rotation.x = Math.max(0, Math.sin(stride)) * (0.6 + speedNorm * 0.7);
        j.shoulderL.rotation.x = Math.sin(stride + Math.PI) * (0.4 + speedNorm * 0.5);
        j.shoulderR.rotation.x = Math.sin(stride) * (0.4 + speedNorm * 0.5);
        j.elbowL.rotation.x = -0.6;
        j.elbowR.rotation.x = -0.6;
        j.torso.rotation.x = 0.12 + speedNorm * 0.22; // forward lean
        j.hips.position.y = 0.95 + Math.abs(Math.sin(stride)) * 0.05 * speedNorm;
        j.head.rotation.x = -0.1;
      } else {
        // IDLE: breathe, sway, reset limbs
        const b = Math.sin(t * 2) * 0.03;
        j.hipL.rotation.x *= 0.9;
        j.hipR.rotation.x *= 0.9;
        j.kneeL.rotation.x *= 0.9;
        j.kneeR.rotation.x *= 0.9;
        j.shoulderL.rotation.x = Math.sin(t * 2) * 0.06;
        j.shoulderR.rotation.x = Math.sin(t * 2 + 1) * 0.06;
        j.torso.rotation.x = b;
        j.hips.rotation.x = 0;
        j.hips.position.y = 0.95 + b * 0.5;
      }
    };

    const frame = (now) => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const state = gameRef.current;

      if (startedRef.current && (state.status === 'run' || state.status === 'clash')) {
        stepRunIt(state, dt, Math.random);
        for (const ev of state.events) {
          if (ev.type === 'clash') {
            msgRef.current = ev.winner === 'you'
              ? (ev.attackerWins ? 'RAN THROUGH!' : 'STONEWALLED!')
              : 'THEY GOT YOU';
            flash.position.set(0, 1.2, state.clash.clashZ);
            flash.material.opacity = 0.9;
            dustPuffed = false;
          }
          if (ev.type === 'round') {
            msgRef.current = 'TAP TO RUN!';
          }
        }
      }

      // Sync runner positions + poses
      const c = state.clash;
      if (state.status === 'clash' && c) {
        const loserRig = c.loser === 'you' ? youRig : aiRig;
        const winnerRig = c.winner === 'you' ? youRig : aiRig;
        loserRig.group.position.set(0, 0, c.loserZ);
        winnerRig.group.position.set(0, 0, c.winnerZ);
        poseRunner(loserRig, { speed: 0 }, 'knockback', now);
        poseRunner(winnerRig, { speed: 0 }, 'winnerStumble', now);
        // Dust when the loser hits the ground (fall > 0.6, once)
        if (c.loserFall > 0.6 && !dustPuffed) {
          dustPuffed = true;
          puffDust(0, c.loserZ);
        }
        // Reset the non-involved joints that knockback doesn't touch
        if (c.t < 0.05) {
          // First frames: snap to contact pose then blend into knockback
          poseRunner(loserRig, { speed: 0 }, 'clashContact', now);
        }
      } else {
        youRig.group.position.set(0, 0, state.you.z);
        aiRig.group.position.set(0, 0, state.ai.z);
        poseRunner(youRig, state.you, 'run', now);
        poseRunner(aiRig, state.ai, 'run', now);
      }

      // Dust particles
      for (const p of dustPool) {
        if (!p.active) continue;
        p.t += dt;
        const k = p.t / 0.7;
        if (k >= 1) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
        p.mesh.scale.setScalar(0.6 + k * 1.6);
        p.mesh.material.opacity = 0.55 * (1 - k);
        p.mesh.position.y = 0.25 + k * 0.5;
      }
      flash.material.opacity = Math.max(0, flash.material.opacity - dt * 2);

      // Side camera tracking the action
      const midZ = state.status === 'clash' && c ? c.clashZ : (state.you.z + state.ai.z) / 2;
      const camPush = state.status === 'clash' ? 8.5 : 10; // push in for drama
      camera.position.set(camPush, 5, midZ + 6);
      camera.lookAt(0, 1.2, midZ);

      const nextHud = {
        you: state.score.you, ai: state.score.ai, round: state.round,
        message: msgRef.current, winner: state.winner, phase: state.status,
        power: Math.round(state.you.power * 100),
      };
      const key = JSON.stringify(nextHud);
      if (key !== hudPrevRef.current) {
        hudPrevRef.current = key;
        setHud(nextHud);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

      // (onResize defined earlier in the effect; reused here.)

      cleanup = () => {
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
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, []);

  const begin = () => {
    startRound(gameRef.current);
    setStarted(true);
  };

  // TAP (not hold): each press = one burst of power
  const onTap = (e) => {
    e.currentTarget.style.transform = 'translateX(-50%) scale(0.94)';
    tapYou(gameRef.current);
    window.setTimeout(() => {
      if (e.currentTarget) e.currentTarget.style.transform = 'translateX(-50%)';
    }, 90);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0f1a0f' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', pointerEvents: 'none' }}>
        <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>💥 RUN IT STRAIGHT <span style={{ fontSize: 14 }}>{hud.you}-{hud.ai}</span></div>
        <a href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none', pointerEvents: 'auto' }}>✕ Leave</a>
      </div>
      {hud.message && !hud.winner && (hud.phase === 'run' || hud.phase === 'clash') && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.8)', color: '#fbbf24', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700 }}>{hud.message}</div>
        </div>
      )}
      {/* Power meter */}
      {started && !hud.winner && hud.phase === 'run' && (
        <div style={{ position: 'absolute', top: 84, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ width: 180, height: 10, borderRadius: 999, background: 'rgba(15,23,42,0.7)', border: '1px solid #475569', overflow: 'hidden' }}>
            <div style={{ width: `${hud.power}%`, height: '100%', background: hud.power > 70 ? '#ef4444' : '#f59e0b', transition: 'width 90ms linear' }} />
          </div>
        </div>
      )}
      {!started && !hud.winner && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/run-it-straight/run-it-straight-menu-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.70), rgba(0,0,0,0.55), rgba(0,0,0,0.85))' }} />
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 56 }}>💥</div>
            <div style={{ color: '#f8fafc', fontSize: 26, fontWeight: 800 }}>RUN IT STRAIGHT</div>
            <div style={{ color: '#cbd5e1', fontSize: 15, maxWidth: 320 }}>One lane. No sidestepping. TAP RUN to build power — each tap is a stride. No tap, no run. Meet them head-on. Best of 5 — you attack, then defend.</div>
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
            <button type="button" onClick={() => { gameRef.current = createRunItStraight(); setHud({ you: 0, ai: 0, round: 1, message: 'TAP TO RUN!', winner: null, phase: 'ready', power: 0 }); begin(); }} style={{ marginTop: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>REMATCH</button>
          </div>
        </div>
      )}
      {started && !hud.winner && hud.phase === 'run' && (
        <button
          type="button"
          onPointerDown={onTap}
          style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 6, width: 140, height: 140, borderRadius: '50%', border: '4px solid #fbbf24', cursor: 'pointer', fontSize: 22, fontWeight: 800, background: '#ef4444', color: '#fff', userSelect: 'none', touchAction: 'none', transition: 'transform 90ms ease' }}
        >
          TAP!
        </button>
      )}
    </div>
  );
}
