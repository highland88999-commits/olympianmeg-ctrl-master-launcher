'use client';

// components/SunBaseScene.jsx — the inside of a sun base.
//
// One reserved interior (farmhouse / barn / windmill —
// lib/earth2/interior-room.js buildInteriorRoom, the same factory
// Earth 2 hangs its rooms from), re-based at the origin, lit warm
// like the inside of the sun: the windows glow, the doorway spills
// light, and a gold sun disc hangs outside the door.
//
// The rig is first-person and deliberately small: drag to look,
// WASD / arrows / the shared WalkJoystick to walk, clamped to the
// room's own walls. The door is a view, not an exit — leaving is
// the page's "Back to hub" button, so nobody walks out of their
// base into the void by accident.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { buildInteriorRoom } from '@/lib/earth2/interior-room';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 3.2;

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    mats.forEach((m) => m.dispose && m.dispose());
  });
}

function BaseRig({ spec, moveRef }) {
  const { camera, gl } = useThree();
  // Arrive facing the door (+Z): the light spill is the first
  // thing the user sees inside their own base.
  const yaw = useRef(Math.PI);
  const pitch = useRef(0);
  const pos = useRef({ x: 0, z: -0.5 });
  const keys = useRef(new Set());
  const dragging = useRef(null);

  useEffect(() => {
    const down = (e) => keys.current.add(String(e.key).toLowerCase());
    const up = (e) => keys.current.delete(String(e.key).toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e) => {
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const d = dragging.current;
      if (!d) return;
      yaw.current -= (e.clientX - d.x) * 0.004;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - (e.clientY - d.y) * 0.004));
      dragging.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      dragging.current = null;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const k = keys.current;
    let fwd =
      (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let strafe =
      (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (moveRef && moveRef.current) {
      fwd += moveRef.current.y || 0;
      strafe += moveRef.current.x || 0;
    }
    const len = Math.hypot(fwd, strafe);
    if (len > 1) {
      fwd /= len;
      strafe /= len;
    }
    if (len > 0) {
      const step = Math.min(delta, 0.05) * WALK_SPEED;
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      // Camera looks -Z rotated by yaw: forward (-sin, 0, -cos),
      // right (cos, 0, -sin). At yaw PI (facing the door, +Z) both
      // read correctly.
      const nx = pos.current.x + (cos * strafe - sin * fwd) * step;
      const nz = pos.current.z + (-sin * strafe - cos * fwd) * step;
      // Clamped to the room's own walls — the base keeps you in.
      const halfW = (spec.widthM * 0.94) / 2 - 0.7;
      const halfD = (spec.depthM * 0.94) / 2 - 0.7;
      pos.current.x = Math.max(-halfW, Math.min(halfW, nx));
      pos.current.z = Math.max(-halfD, Math.min(halfD, nz));
    }
    camera.position.set(pos.current.x, EYE_HEIGHT, pos.current.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch.current, yaw.current, 0);
  });

  return null;
}

export default function SunBaseScene({ spec, moveRef }) {
  const { group } = useMemo(() => buildInteriorRoom(spec, 0), [spec]);
  useEffect(() => () => disposeGroup(group), [group]);
  const D = spec.depthM * 0.94;

  return (
    <>
      <color attach="background" args={['#1c0f02']} />
      <ambientLight intensity={0.55} color="#ffe6b8" />
      <pointLight
        position={[0, Math.max(2.5, spec.heightM * 0.7), 0]}
        intensity={60}
        distance={40}
        color={spec.lightColor}
      />
      <directionalLight position={[4, 8, 6]} intensity={0.7} color="#ffd98a" />
      <primitive object={group} />
      {/* The sun outside the door — a gold disc glowing through the doorway. */}
      <mesh position={[0, 2.2, D / 2 + 4]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[7, 32]} />
        <meshBasicMaterial color="#ffd98a" toneMapped={false} />
      </mesh>
      <BaseRig spec={spec} moveRef={moveRef} />
    </>
  );
}
