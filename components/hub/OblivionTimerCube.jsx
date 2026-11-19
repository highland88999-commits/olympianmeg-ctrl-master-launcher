// components/hub/OblivionTimerCube.jsx — the 72-hour countdown cube
// where Earth was (Merlin's canon, Nov 19 ~00:16).
//
// When the Oblivion cycle is active, Earth is gone from the hub and
// this cube floats in its place (EARTH_CENTER), counting down to
// Earth's return. It wears the same contract as the waiting room's
// holographic cube (components/earth/OblivionCountdownCube.jsx):
// four side faces around the vertical axis, the countdown on ALL
// FOUR sides so it reads from every angle, slowly rotating with a
// gentle float — and the same BLACKOUT RULE: every face carries an
// OPAQUE BLACK backing behind its display plane, so the opposite
// face's numbers can never bleed through.
//
// The label is "UNTIL EARTH RETURNS" — under the new canon Earth
// respawns exactly as it was; it is NOT Earth 2 (the waiting room's
// cube keeps its own "UNTIL EARTH 2" label for the old genesis flow).
// Phone-cheap: one shared canvas texture for all four faces,
// redrawn only when the displayed second changes.
'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { EARTH_CENTER } from '@/lib/god-orbits';
import { CUBE_FACES, formatCountdown } from '@/lib/earth/oblivion';

const FACE_W = 24;
const FACE_H = 12;
const FACE_R = 12;

function drawFaceTexture(ctx, w, h, text) {
  ctx.clearRect(0, 0, w, h);
  // Glowing frame.
  ctx.strokeStyle = 'rgba(165, 243, 252, 0.9)';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 24;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.shadowBlur = 0;
  // Glowing numerals.
  ctx.fillStyle = '#ecfeff';
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 34;
  ctx.font = '700 190px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 - 30);
  ctx.fillText(text, w / 2, h / 2 - 30);
  // Label, letterspaced by hand (canvas letterSpacing is not
  // universal) so it reads on every phone.
  ctx.shadowBlur = 16;
  ctx.font = '700 52px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#a5f3fc';
  ctx.fillText('U N T I L   E A R T H   R E T U R N S', w / 2, h / 2 + 150);
  ctx.shadowBlur = 0;
}

export default function OblivionTimerCube({ remainingMs }) {
  const groupRef = useRef(null);
  const textRef = useRef(formatCountdown(remainingMs));
  const texRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    drawFaceTexture(ctx, 1024, 512, textRef.current);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    canvasRef.current = canvas;
    ctxRef.current = ctx;
    texRef.current = tex;
    return tex;
  }, []);

  // Keep the shared texture in sync with the displayed second.
  useEffect(() => {
    const next = formatCountdown(remainingMs);
    if (next !== textRef.current) {
      textRef.current = next;
      if (ctxRef.current && texRef.current) {
        drawFaceTexture(ctxRef.current, 1024, 512, next);
        texRef.current.needsUpdate = true;
      }
    }
  }, [remainingMs]);

  useEffect(() => () => {
    if (texRef.current) texRef.current.dispose();
  }, []);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.rotation.y = t * 0.14;
    g.position.y = EARTH_CENTER.y + Math.sin(t * 0.5) * 1.2;
  });

  if (!texture) return null;
  return (
    <group ref={groupRef} position={[EARTH_CENTER.x, EARTH_CENTER.y, EARTH_CENTER.z]}>
      {CUBE_FACES.map((face) => (
        <group key={face.angleDeg} rotation={[0, (face.angleDeg * Math.PI) / 180, 0]}>
          {/* Opaque black backing — the blackout rule, first lock. */}
          <mesh position={[0, 0, FACE_R]}>
            <planeGeometry args={[FACE_W, FACE_H]} />
            <meshBasicMaterial color={0x000000} side={THREE.FrontSide} />
          </mesh>
          {/* The glowing countdown face, 0.05 in front — front-side
              only (backs culled), the second lock. */}
          <mesh position={[0, 0, FACE_R + 0.05]}>
            <planeGeometry args={[FACE_W, FACE_H]} />
            <meshBasicMaterial map={texture} transparent side={THREE.FrontSide} />
          </mesh>
        </group>
      ))}
      {/* Dark caps — not display faces, just closing the block. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FACE_H / 2, 0]}>
        <planeGeometry args={[FACE_W, FACE_W]} />
        <meshBasicMaterial color={0x030303} side={THREE.FrontSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -FACE_H / 2, 0]}>
        <planeGeometry args={[FACE_W, FACE_W]} />
        <meshBasicMaterial color={0x030303} side={THREE.FrontSide} />
      </mesh>
    </group>
  );
}
