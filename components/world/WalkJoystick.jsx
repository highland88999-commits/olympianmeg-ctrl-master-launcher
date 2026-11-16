'use client';

// components/world/WalkJoystick.jsx — shared virtual joystick for walk mode.
// Pointer-events based (mouse + touch), follows the new-earth pattern.
// Props: onMove(x, y) with x (strafe) and y (fwd) each -1..1; size in px.

import { useCallback, useEffect, useRef } from 'react';

export default function WalkJoystick({ onMove, size = 120 }) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const activeRef = useRef(null);
  // Latest onMove, for the unmount cleanup below (the effect itself
  // runs once, so it must not close over a stale first-render prop).
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // A lost capture must centre the knob exactly like a release:
  // without this, a capture lost mid-drag (no pointerup fires)
  // would leave the knob deflected and the last move latched.
  // Unmounting mid-drag centres it too, so a move value can never
  // outlive the stick.
  useEffect(() => () => {
    activeRef.current = null;
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
    onMoveRef.current(0, 0);
  }, []);

  const setKnob = (dx, dy) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const handle = useCallback((e) => {
    const base = baseRef.current;
    if (!base || activeRef.current === null) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const max = r.width / 2 - 12;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setKnob(dx, dy);
    onMove(dx / max, -dy / max);
  }, [onMove]);

  const R = size / 2;
  return (
    <div
      ref={baseRef}
      role="slider"
      aria-label="Move"
      aria-valuemin={-1}
      aria-valuemax={1}
      onPointerDown={(e) => {
        activeRef.current = e.pointerId;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        handle(e);
      }}
      onPointerMove={(e) => { if (activeRef.current === e.pointerId) handle(e); }}
      onPointerUp={(e) => {
        if (activeRef.current === e.pointerId) {
          activeRef.current = null; setKnob(0, 0); onMove(0, 0);
        }
      }}
      onPointerCancel={() => { activeRef.current = null; setKnob(0, 0); onMove(0, 0); }}
      onLostPointerCapture={() => { activeRef.current = null; setKnob(0, 0); onMove(0, 0); }}
      style={{
        width: size, height: size, borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.25)',
        background: 'rgba(10,14,20,0.35)',
        position: 'relative', touchAction: 'none',
        WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      <div
        ref={knobRef}
        style={{
          width: size * 0.42, height: size * 0.42, borderRadius: '50%',
          background: 'rgba(255,255,255,0.35)',
          border: '1px solid rgba(255,255,255,0.5)',
          position: 'absolute', left: R - size * 0.21, top: R - size * 0.21,
        }}
      />
    </div>
  );
}
