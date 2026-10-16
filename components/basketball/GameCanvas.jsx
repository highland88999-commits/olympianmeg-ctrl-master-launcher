// Streetball — the 3D canvas: lights, camera rig, ball, aim arc, trail.
'use client';
import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import * as THREE from 'three';
import { CourtScene } from './Court';
import { BALL_R } from '@/lib/basketball/constants';
import { simulateArc } from '@/lib/basketball/physics';

function makeBallTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e2691e';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#1a0d05';
  g.lineWidth = 4;
  // vertical + horizontal seams
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.stroke();
  g.beginPath(); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  // curved side seams
  g.beginPath(); g.arc(0, 64, 52, -Math.PI / 2.6, Math.PI / 2.6); g.stroke();
  g.beginPath(); g.arc(128, 64, 52, Math.PI - Math.PI / 2.6, Math.PI + Math.PI / 2.6); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function BallView({ game }) {
  const mesh = useRef();
  const shadow = useRef();
  const trailRef = useRef();
  const trailPts = useRef([]);
  const tex = useMemo(() => (typeof document !== 'undefined' ? makeBallTexture() : null), []);
  const trailGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    return g;
  }, []);

  useFrame(() => {
    const b = game.ball;
    if (!mesh.current) return;
    mesh.current.position.set(b.p.x, b.p.y, b.p.z);
    // spin the ball in flight for life
    if (b.state === 'flying' || b.state === 'scored') {
      mesh.current.rotation.x -= 0.12;
      mesh.current.rotation.z += 0.02;
    }
    // blob shadow
    if (shadow.current) {
      shadow.current.position.set(b.p.x, 0.025, b.p.z);
      const h = Math.min(1, b.p.y / 5);
      shadow.current.material.opacity = 0.42 * (1 - h * 0.75);
      const s = 1 + h * 1.6;
      shadow.current.scale.set(s, s, s);
    }
    // trail
    const line = trailRef.current;
    if (line) {
      if (b.state === 'flying' || b.state === 'scored') {
        trailPts.current.push(b.p.x, b.p.y, b.p.z);
        while (trailPts.current.length > 24 * 3) trailPts.current.splice(0, 3);
      } else if (trailPts.current.length) {
        trailPts.current.splice(0, 3);
      }
      const pos = trailGeo.attributes.position;
      const n = trailPts.current.length / 3;
      for (let i = 0; i < 24; i++) {
        const src = Math.min(i, n - 1) * 3;
        if (n === 0) { pos.setXYZ(i, 0, -10, 0); continue; }
        pos.setXYZ(i, trailPts.current[src], trailPts.current[src + 1], trailPts.current[src + 2]);
      }
      pos.needsUpdate = true;
      line.visible = n > 1;
    }
  });

  return (
    <group>
      <mesh ref={mesh}>
        <sphereGeometry args={[BALL_R, 24, 18]} />
        {tex ? (
          <meshStandardMaterial map={tex} roughness={0.65} />
        ) : (
          <meshStandardMaterial color="#e2691e" roughness={0.65} />
        )}
      </mesh>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[BALL_R * 1.15, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.42} depthWrite={false} />
      </mesh>
      <line ref={trailRef} geometry={trailGeo}>
        <lineBasicMaterial color="#fb923c" transparent opacity={0.55} />
      </line>
    </group>
  );
}

const ARC_POINTS = 46;

function AimArc({ game }) {
  const lineRef = useRef();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
    return g;
  }, []);

  useFrame(() => {
    const line = lineRef.current;
    if (!line) return;
    if (game.phase !== 'aiming') {
      line.visible = false;
      return;
    }
    line.visible = true;
    const pts = simulateArc(game.ballPos, game.currentShotVelocity(), game.rim, ARC_POINTS);
    const pos = geo.attributes.position;
    for (let i = 0; i < ARC_POINTS; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      pos.setXYZ(i, p.x, Math.max(p.y, 0.03), p.z);
    }
    pos.needsUpdate = true;
    geo.setDrawRange(0, Math.min(pts.length, ARC_POINTS));
  });

  return (
    <line ref={lineRef} geometry={geo}>
      <lineBasicMaterial color="#00f2ff" transparent opacity={0.95} linewidth={2} />
    </line>
  );
}

function CameraRig({ game }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const curLook = useMemo(() => new THREE.Vector3(0, 2, -8), []);

  useFrame((_, dt) => {
    const s = game.snapshot();
    const spots = game.spots;
    const spot = spots[s.spotIndex];
    // camera behind the shooter, looking at the rim
    const behind = s.end === 0 ? 1 : -1; // end 0 attacks -z, so camera sits at +z
    target.set(spot.x * 0.55, 5.1, spot.z + behind * 8.2);
    look.set(spot.x * 0.25, 2.1, -behind * 9.5);
    const k = 1 - Math.exp(-3.2 * Math.min(dt, 0.05));
    camera.position.lerp(target, k);
    curLook.lerp(look, k);
    camera.lookAt(curLook);
  });
  return null;
}

function SimLoop({ game }) {
  useFrame((_, dt) => {
    game.update(Math.min(dt, 0.1));
  });
  return null;
}

export function GameCanvas({ game, snap, children }) {
  // Context-loss guard (fleet rollout 2026-10-15): freeze on loss, heal on
  // restore, recoverable FEED LOST fallback if the context stays gone.
  const sceneGuard = useSceneContextGuard({ label: 'BASKETBALL' });
  return (
    <Canvas
      onCreated={sceneGuard.onCreated}
      dpr={Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}
      camera={{ position: [0, 5.1, 2.5], fov: 55, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#04060c']} />
      <fog attach="fog" args={['#04060c', 34, 95]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#3b82f6', '#0b0b0d', 0.35]} />
      <directionalLight position={[12, 18, 8]} intensity={1.6} color="#e8f4ff" />
      <directionalLight position={[-10, 12, -10]} intensity={0.5} color="#00f2ff" />
      <SimLoop game={game} />
      <CameraRig game={game} />
      <CourtScene spots={game.spots} activeIndex={snap.spotIndex} showSpots={snap.phase === 'idle'} />
      <BallView game={game} />
      <AimArc game={game} />
      {children}
    </Canvas>
  );
}
