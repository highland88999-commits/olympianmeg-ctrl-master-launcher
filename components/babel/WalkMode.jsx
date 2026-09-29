'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  WALK_EYE,
  getWalkArea,
  clampWalker,
  stepWalker,
  applyLook,
  prefersReducedMotion,
} from '@/lib/babel/walk';

// BABEL walk mode — first-person walker. The page shell owns input:
// it writes key/joystick/look deltas into `inputRef`, this component
// consumes them every frame and drives the camera.
//
//   inputRef.current = {
//     pos: { x, z }, yaw, pitch,       // walker state (page resets on spawn)
//     keys: { fwd, back, left, right },// -1..1 from WASD/arrows
//     joy: { x, y },                   // -1..1 from the touch joystick
//     look: { dx, dy },                // accumulated drag-look pixels
//   }
//
// Transitions are instant (no camera glides) — the page handles the fade.
export default function WalkMode({ view, inputRef, orbitCamera }) {
  const { camera } = useThree();
  const reduced = useRef(false);
  const bobT = useRef(0);

  // Snap the camera to the walk spawn on mount; remember reduced-motion once.
  useEffect(() => {
    reduced.current = prefersReducedMotion();
    const area = getWalkArea(view);
    const s = area ? area.spawn : { x: 0, z: 30, yaw: 0 };
    const inp = inputRef.current;
    inp.pos = { x: s.x, z: s.z };
    inp.yaw = s.yaw;
    inp.pitch = 0;
    inp.look = { dx: 0, dy: 0 };
    camera.rotation.order = 'YXZ';
    return () => {
      // Hand control back to orbit: restore a calm default viewpoint.
      camera.rotation.order = 'XYZ';
      camera.position.set(...orbitCamera.position);
      camera.rotation.set(0, 0, 0);
      camera.lookAt(...orbitCamera.target);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const inp = inputRef.current;

    // Look: consume accumulated drag deltas.
    if (inp.look.dx !== 0 || inp.look.dy !== 0) {
      const l = applyLook(inp.yaw, inp.pitch, inp.look.dx, inp.look.dy);
      inp.yaw = l.yaw;
      inp.pitch = l.pitch;
      inp.look.dx = 0;
      inp.look.dy = 0;
    }

    // Move: keyboard + joystick, clamped inside the walk bounds.
    const fwd = (inp.keys.fwd ? 1 : 0) - (inp.keys.back ? 1 : 0) - inp.joy.y;
    const strafe = (inp.keys.right ? 1 : 0) - (inp.keys.left ? 1 : 0) + inp.joy.x;
    const next = stepWalker(inp.pos, inp.yaw, { fwd, strafe }, dt);
    const clamped = clampWalker(next, view);
    const moving = Math.hypot(clamped.x - inp.pos.x, clamped.z - inp.pos.z) > 1e-5;
    inp.pos = clamped;

    // Gentle walk bob — skipped entirely under reduced motion.
    let y = WALK_EYE;
    if (!reduced.current && moving) {
      bobT.current += dt * 9;
      y += Math.abs(Math.sin(bobT.current)) * 0.06;
    }

    camera.position.set(inp.pos.x, y, inp.pos.z);
    camera.rotation.set(inp.pitch, inp.yaw, 0);
  });

  return null;
}
