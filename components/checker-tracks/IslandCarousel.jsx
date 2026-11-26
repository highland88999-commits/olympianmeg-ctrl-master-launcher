// components/checker-tracks/IslandCarousel.jsx — Checker Tracks island carousel (client).
//
// The track picker as Merlin drew it: 3D islands in space, one floating
// island per track, on a carousel. The islands are lightweight procedural
// meshes — a checker disc + a miniature track loop in the track's neon
// wall colour + a neon ring — semi-holographic, floating in holographic
// blue space with stars and a distant planet behind them. No binary
// media, no new dependencies: three + @react-three/fiber + drei Stars,
// the repo's existing setup (same patterns as CheckerScene.jsx).
//
// Interaction: tap an island (or the prev/next orbs in the page band) to
// select it; the selected island RISES and grows a little, with a gold
// down-arrow marker above it. Drag / swipe horizontally on the scene to
// spin the carousel; releasing snaps to the nearest island.
//
// Geometry comes from lib/omega-500/tracks.js (buildCenterline) — reused,
// never reimplemented. The carousel is a vertical wheel: islands arc up
// the sides and across the top of the frame, the selected island sits at
// the front-bottom slot, so the world scene stays visible above and below
// the UI band the page lays over the middle of it.
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { buildCenterline } from '@/lib/omega-500/tracks';

/** Wheel radius (world units) and centre height. */
const WHEEL_R = 3.0;
const WHEEL_CY = 1.3;
/** How far the selected island rises above its wheel slot. */
const RISE = 0.9;
/** Camera distance: near (default) / far (camera orb toggled). */
const CAM_NEAR_Z = 11.5;
const CAM_FAR_Z = 15;

/** Procedural black/white checker texture — canvas, no binary asset. */
function makeCheckerTexture(squares = 8) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const step = size / squares;
  for (let y = 0; y < squares; y++) {
    for (let x = 0; x < squares; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f2f2f2' : '#0a0a0a';
      ctx.fillRect(x * step, y * step, step, step);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Miniature track loop as a neon tube, scaled to sit on the island disc. */
function useMiniLoopGeometry(track) {
  return useMemo(() => {
    const line = buildCenterline(track);
    let maxR = 0;
    for (let i = 0; i < line.count; i++) {
      maxR = Math.max(maxR, Math.hypot(line.xs[i], line.zs[i]));
    }
    const scale = 0.78 / Math.max(maxR, 1);
    const pts = [];
    for (let i = 0; i < line.count; i += 8) {
      pts.push(new THREE.Vector3(line.xs[i] * scale, 0.18, line.zs[i] * scale));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    return new THREE.TubeGeometry(curve, 220, 0.045, 6, true);
  }, [track]);
}

/** One floating island: checker disc + rock underside + neon mini-loop + neon ring. */
function Island({ track, selected, onSelect, dragMovedRef }) {
  const checkerTex = useMemo(() => makeCheckerTexture(8), []);
  const loopGeo = useMiniLoopGeometry(track);
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        if (dragMovedRef.current > 8) return;
        onSelect(track.id);
      }}
    >
      {/* Checker disc — the island top. */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[1.05, 0.8, 0.22, 32]} />
        <meshStandardMaterial map={checkerTex} roughness={0.7} transparent opacity={0.9} />
      </mesh>
      {/* Rock underside — the floating-island point, semi-holographic. */}
      <mesh position={[0, -0.45, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.8, 0.7, 24]} />
        <meshStandardMaterial color="#0a2a5a" roughness={0.9} transparent opacity={0.55} />
      </mesh>
      {/* Miniature track loop in the track's neon wall colour. */}
      <mesh geometry={loopGeo}>
        <meshStandardMaterial
          color={track.theme.wall}
          emissive={track.theme.wall}
          emissiveIntensity={1.4}
          roughness={0.4}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Neon ring around the disc edge. */}
      <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.06, 0.05, 8, 48]} />
        <meshStandardMaterial
          color={track.theme.wall}
          emissive={track.theme.wall}
          emissiveIntensity={1.2}
          roughness={0.4}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Gold down-arrow marker above the selected island only. */}
      {selected && (
        <mesh position={[0, 1.55, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.22, 0.5, 4]} />
          <meshStandardMaterial color="#ffd700" emissive="#aa8800" emissiveIntensity={0.8} />
        </mesh>
      )}
    </group>
  );
}

/** Camera rig: lerps the camera distance for the near/far camera control. */
function CameraRig({ cameraFar }) {
  const { camera } = useThree();
  useFrame((state, dt) => {
    const targetZ = cameraFar ? CAM_FAR_Z : CAM_NEAR_Z;
    const k = 1 - Math.exp(-5 * dt);
    camera.position.z += (targetZ - camera.position.z) * k;
    camera.position.y += (0.6 - camera.position.y) * k;
    camera.lookAt(0, 0.8, 0);
    void state;
  });
  return null;
}

/** The wheel: positions every island group each frame from the spin angle. */
function Wheel({ tracks, selectedIndex, angleRef, targetRef, onSelect, dragMovedRef }) {
  const groupRefs = useRef([]);
  const riseRefs = useRef(tracks.map(() => 0));
  const step = (Math.PI * 2) / tracks.length;

  useFrame((state, dt) => {
    // Damp the spin angle toward its target (shortest way around).
    let delta = targetRef.current - angleRef.current;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    angleRef.current += delta * (1 - Math.exp(-10 * dt));
    const t = state.clock.elapsedTime;
    for (let i = 0; i < tracks.length; i++) {
      const g = groupRefs.current[i];
      if (!g) continue;
      const th = angleRef.current + i * step;
      const isSel = i === selectedIndex;
      // The selected island rises; the rise itself eases in.
      const riseTarget = isSel ? RISE : 0;
      const riseK = 1 - Math.exp(-6 * dt);
      riseRefs.current[i] += (riseTarget - riseRefs.current[i]) * riseK;
      const bob = Math.sin(t * 1.2 + i * 1.3) * 0.06;
      g.position.set(
        WHEEL_R * Math.cos(th),
        WHEEL_CY + WHEEL_R * Math.sin(th) + riseRefs.current[i] + bob,
        0,
      );
      const scaleTarget = isSel ? 1.18 : 1;
      const s = g.scale.x + (scaleTarget - g.scale.x) * (1 - Math.exp(-8 * dt));
      g.scale.setScalar(s);
    }
  });

  return (
    <group>
      {tracks.map((track, i) => (
        <group
          key={track.id}
          ref={(g) => {
            groupRefs.current[i] = g;
          }}
        >
          <Island
            track={track}
            selected={i === selectedIndex}
            onSelect={onSelect}
            dragMovedRef={dragMovedRef}
          />
        </group>
      ))}
    </group>
  );
}

export default function IslandCarousel({ tracks, selectedId, onSelect, cameraFar }) {
  const step = (Math.PI * 2) / tracks.length;
  const selectedIndex = Math.max(0, tracks.findIndex((t) => t.id === selectedId));
  // Front-bottom slot is angle -PI/2; the selected island is rotated there.
  const angleRef = useRef(-Math.PI / 2 - selectedIndex * step);
  const targetRef = useRef(angleRef.current);
  const dragMovedRef = useRef(0);

  // A new selection (tap, prev/next orb) re-aims the wheel at that island.
  useEffect(() => {
    targetRef.current = -Math.PI / 2 - selectedIndex * step;
  }, [selectedIndex, step]);

  // Horizontal drag spins the wheel; release snaps to the nearest island.
  // Listeners live on window (no pointer capture) so a tap still reaches
  // the canvas and R3F's island onClick keeps working.
  const onPointerDown = (e) => {
    const startX = e.clientX;
    const base = targetRef.current;
    dragMovedRef.current = 0;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      dragMovedRef.current = Math.abs(dx);
      targetRef.current = base + dx * 0.006;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragMovedRef.current > 8) {
        const raw = (-Math.PI / 2 - targetRef.current) / step;
        const n = tracks.length;
        const idx = ((Math.round(raw) % n) + n) % n;
        onSelect(tracks[idx].id);
      }
      // Reset after the click event (which fires after pointerup) has run,
      // so a drag never also counts as a tap on an island.
      setTimeout(() => {
        dragMovedRef.current = 0;
      }, 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="h-full w-full"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
    >
      <Canvas
        camera={{ fov: 55, near: 0.1, far: 200, position: [0, 0.6, CAM_NEAR_Z] }}
        dpr={[1, 2]}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {/* Holographic blue space behind the selection models. */}
        <color attach="background" args={['#04122e']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 8]} intensity={1.0} />
        <Stars radius={80} depth={40} count={2500} factor={3} saturation={0} fade speed={0.6} />
        {/* One distant holographic planet, low and to the side. */}
        <mesh position={[4.5, 5.5, -18]}>
          <sphereGeometry args={[3.2, 32, 32]} />
          <meshBasicMaterial color="#2b7fff" transparent opacity={0.16} />
        </mesh>
        <mesh position={[-5.5, -4.5, -20]}>
          <sphereGeometry args={[2.2, 32, 32]} />
          <meshBasicMaterial color="#39ff14" transparent opacity={0.1} />
        </mesh>
        <CameraRig cameraFar={cameraFar} />
        <Wheel
          tracks={tracks}
          selectedIndex={selectedIndex}
          angleRef={angleRef}
          targetRef={targetRef}
          onSelect={onSelect}
          dragMovedRef={dragMovedRef}
        />
      </Canvas>
    </div>
  );
}
