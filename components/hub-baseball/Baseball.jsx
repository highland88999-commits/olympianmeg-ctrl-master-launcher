'use client';

// components/hub-baseball/Baseball.jsx — HUB BASEBALL visible pieces.
//
// All procedural (no new assets, no new real lights — MeshBasicMaterial
// for decor, per the house rule for created pieces):
//   (a) the ball: sphere r=BALL_RADIUS, canvas texture (white, two red
//       curved seams + stitch ticks, drawn on an offscreen canvas);
//   (b) home plate: white pentagon (home-plate shape) at PLATE_POS;
//   (c) black holes: a pool of slots (HOLE_POOL) — black sphere + orange
//       torus accretion ring + additive glow sprite from a canvas
//       radial-gradient texture. The controller positions/shows slots
//       from the flight's holes; unlit slots stay hidden;
//   (d) scoreboard: drei Billboard plane 44x26 at SCOREBOARD_POS, canvas
//       texture redrawn from baseballBoard (top 5 global + your stats),
//       or a local-only note when the board is null.
//
// The ball mesh + hole slots register themselves into flightRef (shared
// with BaseballController + SequenceController, created in HubScene):
//   flightRef.current = { flight, ballMesh, holeSlots, lastDir,
//                         handedOff, nearPlate, holeVersion }
// BaseballController owns positioning them every frame; this file only
// renders them and redraws the scoreboard texture.

import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { PLATE_POS, BALL_REST, BALL_RADIUS, SCOREBOARD_POS, SCOREBOARD_SIZE } from '../../lib/hub-baseball/placement';

// Hole render pool: the contract spawns 6 holes per flight; 12 slots
// leaves headroom if the count ever grows, at negligible cost.
export const HOLE_POOL = 12;

// ---------------------------------------------------------------------------
// Canvas textures (deterministic — same drawing every load)
// ---------------------------------------------------------------------------

function drawBallTexture(ctx, w, h) {
  ctx.fillStyle = '#fbfbf7';
  ctx.fillRect(0, 0, w, h);
  // Faint panel shading so the sphere reads round under basic material.
  const shade = ctx.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.10)');
  shade.addColorStop(0.25, 'rgba(0,0,0,0)');
  shade.addColorStop(0.75, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  // Two red curved seams (classic baseball): opposing C-curves, plus
  // stitch ticks sampled along each curve, perpendicular to it.
  ctx.strokeStyle = '#c0392b';
  ctx.fillStyle = '#c0392b';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const seams = [
    { x0: 200, y0: 56, cx: 340, cy: 256, x1: 200, y1: 456 },
    { x0: 824, y0: 56, cx: 684, cy: 256, x1: 824, y1: 456 },
  ];
  for (const s of seams) {
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.quadraticCurveTo(s.cx, s.cy, s.x1, s.y1);
    ctx.stroke();
    // Stitch ticks: sample the quadratic, draw a short tick across it.
    const steps = 14;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * s.x0 + 2 * mt * t * s.cx + t * t * s.x1;
      const y = mt * mt * s.y0 + 2 * mt * t * s.cy + t * t * s.y1;
      // Tangent of the quadratic at t, tick perpendicular to it.
      const dx = 2 * mt * (s.cx - s.x0) + 2 * t * (s.x1 - s.cx);
      const dy = 2 * mt * (s.cy - s.y0) + 2 * t * (s.y1 - s.cy);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const tick = 13;
      ctx.beginPath();
      ctx.moveTo(x - nx * tick, y - ny * tick);
      ctx.lineTo(x + nx * tick, y + ny * tick);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.lineWidth = 5;
  }
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,150,40,0.85)');
  g.addColorStop(0.35, 'rgba(255,110,20,0.35)');
  g.addColorStop(1, 'rgba(255,90,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function formatDistance(m) {
  const n = Math.round(Number(m) || 0);
  return `${n.toLocaleString('en-US')} m`;
}

// Scoreboard canvas: 1024x608 keeps the 44:26 plane ratio (1.69).
const BOARD_W = 1024;
const BOARD_H = 608;

function drawScoreboard(ctx, board, hud) {
  ctx.fillStyle = '#0b1026';
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, BOARD_W - 16, BOARD_H - 16);
  ctx.strokeStyle = 'rgba(234,179,8,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, BOARD_W - 40, BOARD_H - 40);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd75e';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText('HUB BASEBALL', BOARD_W / 2, 84);

  let y = 140;
  if (!board) {
    ctx.fillStyle = '#9aa3b2';
    ctx.font = 'italic 400 30px system-ui, sans-serif';
    ctx.fillText('Global board lands with the next database update', BOARD_W / 2, y);
    y += 56;
  }

  ctx.fillStyle = '#cfe8ff';
  ctx.font = '700 32px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TOP FLIGHTS', 56, y);
  y += 18;
  ctx.strokeStyle = 'rgba(207,232,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, y);
  ctx.lineTo(BOARD_W - 56, y);
  ctx.stroke();
  y += 52;

  const entries = board && Array.isArray(board.entries) ? board.entries.slice(0, 5) : [];
  ctx.font = '600 34px system-ui, sans-serif';
  if (entries.length === 0) {
    ctx.fillStyle = '#9aa3b2';
    ctx.fillText('No flights on the board yet — take a swing!', 56, y);
    y += 56;
  } else {
    entries.forEach((e, i) => {
      const rank = `${i + 1}.`;
      const player = String(e.player || 'Player').slice(0, 16);
      const dist = formatDistance(e.distance_m);
      const eatenTag = e.eaten ? ' · eaten' : '';
      ctx.fillStyle = i === 0 ? '#ffd75e' : '#f1f5f9';
      ctx.textAlign = 'left';
      ctx.fillText(`${rank} ${player}`, 56, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = e.eaten ? '#fb923c' : '#f1f5f9';
      ctx.fillText(`${dist}${eatenTag}`, BOARD_W - 56, y);
      y += 56;
    });
  }

  // Your stats.
  y = Math.max(y + 8, BOARD_H - 108);
  ctx.strokeStyle = 'rgba(207,232,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(56, y - 44);
  ctx.lineTo(BOARD_W - 56, y - 44);
  ctx.stroke();
  const mine = board ? board.mine : null;
  const hudBest = hud && hud.current ? Number(hud.current.bestM) || 0 : 0;
  const best = mine && mine.best != null ? mine.best : hudBest;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd75e';
  ctx.font = '700 32px system-ui, sans-serif';
  if (mine || best > 0) {
    const last = mine && mine.last != null ? formatDistance(mine.last) : '—';
    const flights = mine && mine.flights != null ? mine.flights : '—';
    const eaten = mine && mine.eaten != null ? mine.eaten : '—';
    ctx.fillText(`YOU — BEST ${formatDistance(best)}  ·  LAST ${last}`, 56, y);
    ctx.fillText(`FLIGHTS ${flights}  ·  EATEN ${eaten}`, 56, y + 46);
  } else {
    ctx.fillText('YOU — No flights yet. Take a swing!', 56, y);
  }
}

// Home-plate pentagon (ShapeGeometry lies in the XY plane, faces +Z):
// flat top, pointed bottom — the real home-plate silhouette.
function homePlateShape(w, h) {
  const s = new THREE.Shape();
  const hw = w / 2;
  const topY = h * 0.42;
  const midY = -h * 0.08;
  const botY = -h * 0.58;
  s.moveTo(-hw, topY);
  s.lineTo(hw, topY);
  s.lineTo(hw, midY);
  s.lineTo(0, botY);
  s.lineTo(-hw, midY);
  s.closePath();
  return s;
}

export default function Baseball({ baseballBoard = null, baseballHudRef = null, flightRef = null }) {
  const ballTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    drawBallTexture(c.getContext('2d'), 1024, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);

  const glowTex = useMemo(() => makeGlowTexture(), []);

  const boardCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = BOARD_W;
    c.height = BOARD_H;
    return c;
  }, []);
  const boardTex = useMemo(() => {
    const tex = new THREE.CanvasTexture(boardCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [boardCanvas]);

  // Redraw the scoreboard whenever the board data or the local best
  // changes. The signature check in useFrame catches hud.bestM moves
  // between board fetches; the effect below catches board swaps.
  const boardSigRef = useRef('');
  const frameRef = useRef(0);
  const redrawBoard = () => {
    const ctx = boardCanvas.getContext('2d');
    if (!ctx) return;
    drawScoreboard(ctx, baseballBoard, baseballHudRef);
    boardTex.needsUpdate = true;
  };
  useEffect(() => {
    redrawBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseballBoard]);
  useFrame(() => {
    frameRef.current += 1;
    if (frameRef.current % 30 !== 0) return;
    const hudBest = baseballHudRef && baseballHudRef.current
      ? Number(baseballHudRef.current.bestM) || 0
      : 0;
    const sig = JSON.stringify(baseballBoard || null) + '|' + hudBest;
    if (sig !== boardSigRef.current) {
      boardSigRef.current = sig;
      redrawBoard();
    }
  });

  useEffect(() => {
    return () => {
      ballTex.dispose();
      glowTex.dispose();
      boardTex.dispose();
    };
  }, [ballTex, glowTex, boardTex]);

  const plateShape = useMemo(() => homePlateShape(18, 17), []);
  const plateBackShape = useMemo(() => homePlateShape(20, 19), []);

  // Register the ball mesh + hole slots into the shared flight ref so
  // the controller can drive them imperatively every frame.
  const registerBall = (mesh) => {
    if (flightRef) flightRef.current.ballMesh = mesh;
  };
  const registerHoleSlot = (i) => (group) => {
    if (!flightRef) return;
    if (!flightRef.current.holeSlots) flightRef.current.holeSlots = [];
    if (group) {
      flightRef.current.holeSlots[i] = {
        group,
        ring: group.userData.ring || null,
        glow: group.userData.glow || null,
      };
    } else {
      flightRef.current.holeSlots[i] = null;
    }
  };

  return (
    <group>
      {/* The ball — floats just above the plate at rest (BALL_REST),
          hidden while flying (the camera IS the ball). */}
      <mesh
        ref={registerBall}
        position={[BALL_REST[0], BALL_REST[1], BALL_REST[2]]}
      >
        <sphereGeometry args={[BALL_RADIUS, 64, 64]} />
        <meshBasicMaterial map={ballTex} toneMapped={false} />
      </mesh>

      {/* Home plate — white pentagon, upright facing +Z (toward the
          plate viewpoint south of the plate), dark rim behind it. */}
      <group position={[PLATE_POS[0], PLATE_POS[1], PLATE_POS[2]]}>
        <mesh position={[0, 0, -0.4]}>
          <shapeGeometry args={[plateBackShape]} />
          <meshBasicMaterial color="#1f2937" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh>
          <shapeGeometry args={[plateShape]} />
          <meshBasicMaterial color="#f8fafc" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>

      {/* Black holes — pool of slots, all hidden until a flight spawns
          them. Slot contents are unit-sized; the controller scales each
          slot's sphere/ring/glow to the hole's radius. */}
      {Array.from({ length: HOLE_POOL }, (_, i) => (
        <group key={i} ref={registerHoleSlot(i)} visible={false}>
          <mesh>
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial color="#000000" toneMapped={false} />
          </mesh>
          <mesh
            ref={(m) => {
              // Stash the ring on the slot group so the controller can
              // spin it without another ref round-trip.
              if (m) m.parent.userData.ring = m;
            }}
            rotation={[0.5, 0, 0]}
          >
            <torusGeometry args={[1.6, 0.1, 8, 64]} />
            <meshBasicMaterial color="#ff7a1a" toneMapped={false} />
          </mesh>
          <sprite
            ref={(s) => {
              if (s) s.parent.userData.glow = s;
            }}
          >
            <spriteMaterial
              map={glowTex}
              color="#ff8c2e"
              transparent
              opacity={0.85}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      ))}

      {/* Scoreboard — Billboard plane, always faces the camera. */}
      <Billboard position={[SCOREBOARD_POS[0], SCOREBOARD_POS[1], SCOREBOARD_POS[2]]}>
        <mesh>
          <planeGeometry args={[SCOREBOARD_SIZE[0], SCOREBOARD_SIZE[1]]} />
          <meshBasicMaterial map={boardTex} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </Billboard>
    </group>
  );
}
