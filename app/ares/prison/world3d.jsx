// app/ares/prison/world3d.jsx — the ARES Prison hall, in 3D.
//
// One long hall. Walkway down the middle, cell blocks on both sides:
// 3 stacked levels x 12 columns x 2 sides = 72 cells, growing a level
// at a time without end (the Warden). Every trapped prisoner stands
// inside its own cell, as it appears — a CGI reflective hovering robot,
// seeded by its scanner signature (lib/ares/prison.js) — in front of
// a screen playing one of the 3 cell videos. Empty cells stay bare:
// no robot, no screen.
//
// GROWTH (Merlin, Nov 15 ~04:52; ever-expanding Nov 27): the Warden
// (lib/ares/prison-expansion.js) grows the hall a level at a time when
// the cells fill — one more level of 24 cells, stacked on top, without
// end. The footprint never moves, so the walkway, the spawn, and the
// walker clamp are untouched; only the hall gets taller and each new
// level gets its own 4-light row. The scene takes the grown layout as
// a prop (hall, levels, light positions) and falls back to the base
// hall when it is null — before the first load lands, the base hall
// renders. IN-RANGE SHOWING (Merlin, Nov 27): only cells within range
// of the walker are shown — the billboard in-view gate
// (components/GodTower.jsx) reused: a per-frame frustum test plus a
// 12 m distance cap (PRISON_IN_RANGE_M). Out-of-range cells are hidden
// outright; a cell video plays only while one of its screens is in view.
//
// LIGHT: TRON Ares red throughout. 8 real red point lights along the
// walkway (PRISON_LIGHT_BUDGET — ghost-rider discipline: light only
// where it guides). Everything else is emissive: cell glow, bars,
// floor strips, robots. No other real lights.
//
// SCREENS (Merlin, Nov 27): each occupied cell gets a screen on its
// back wall playing one of the 3 cell videos. The 3 videos each load
// ONCE (lib/ares/prison-video.js pool — 3 elements, 3 textures, shared
// by every screen); screens alternate (cell i starts at video i%3) and
// cycle 0→1→2→0 on the shared elements' 'ended' events. Sound is ONE
// stream only — the marvel-christmas video's audio, through the user's
// device — toggled by the mute orb (page.jsx).
//
// MOVEMENT: the shared walker (lib/world/walk-controls.js) — the same
// first-person system every realm uses. The walker stays in the
// walkway rectangle (|x| <= 23, |z| <= 2.6); the cells are unreachable
// by clamp, so the bars are never walked through.
//
// THE DOOR (Merlin, Nov 27): a walk-through door in the entrance end
// wall takes the keeper back to the hub — walk into it, no button tap.
//
// ONE-WAY VISIBILITY (Merlin, Nov 15 ~04:46): "I should be able to
// see them, but they should not be able to see me." Robots face INTO
// their cells and only sway there (lib/ares/prison.js
// prisonerFaceYawAt — no spin, no tracking, no look-at). The cell
// front is one-way glass: a near-clear pane facing the walkway and an
// opaque mirror-finish pane facing the cell, each FrontSide only, so
// the keeper sees in and the prisoner sees only its own mirror.
//
// LABELS: drei Html with NO distanceFactor (the Medusa lesson, Nov 15:
// distanceFactor scales a label by 1/distance and fills the phone at
// close range). Constant screen size at any range.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  PRISON_RED,
  PRISON_HALL,
  PRISON_CELL,
  PRISON_LIGHT_POSITIONS,
  PRISON_LIGHT,
  PRISON_WALKER_WORLD,
  PRISON_ONE_WAY,
  cellHasScreen,
  cellInDistanceRange,
  prisonerFaceYawAt,
  oneWayPaneYaw,
  prisonHubDoorFor,
  walkerInDoorTrigger,
} from '@/lib/ares/prison';
import { getPrisonEnvTexture, prisonMaterial } from '@/lib/ares/prison-cgi';
import {
  PRISON_SCREEN_W,
  PRISON_SCREEN_H,
  createCellVideoPool,
} from '@/lib/ares/prison-video';
import { PrisonCgiDressing } from './cgi';
import {
  createWalker,
  stepWalker,
  applyLook,
  walkerCamera,
  LOOK_SENS,
} from '@/lib/world/walk-controls';

// The robot hovers this high above its cell floor, bobbing on top.
export const PRISON_ROBOT_HOVER_M = 0.85;

// Reused per-frame temporaries for the in-range gate (the GodTower
// billboard pattern — no allocation inside useFrame).
const _rangeProj = new THREE.Matrix4();
const _rangeFrustum = new THREE.Frustum();
const _rangeCentre = new THREE.Vector3();
const _rangeSphere = new THREE.Sphere();

/** Spawn state for the prison walker (shared walker shape). */
export function createPrisonWalker() {
  return createWalker({
    x: PRISON_HALL.spawn.x,
    z: PRISON_HALL.spawn.z,
    yaw: PRISON_HALL.spawn.yaw,
  });
}

/**
 * Camera rig: look-drag + walk, on the shared walker. inputRef is the
 * page's { fwd, strafe, sprint, lookDx } — the same input shape the
 * realm pages feed their rigs.
 */
export function PrisonCameraRig({ walkerRef, inputRef }) {
  const { camera } = useThree();
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const walker = walkerRef.current;
    const input = inputRef.current;
    if (input.lookDx) {
      applyLook(walker, input.lookDx, 0, LOOK_SENS);
      input.lookDx = 0;
    }
    stepWalker(
      walker,
      { fwd: input.fwd || 0, strafe: input.strafe || 0, sprint: !!input.sprint },
      dt,
      PRISON_WALKER_WORLD,
    );
    const cam = walkerCamera(walker, PRISON_WALKER_WORLD);
    camera.position.set(cam.x, cam.y, cam.z);
    camera.rotation.set(walker.pitch || 0, walker.yaw, 0, 'YXZ');
  });
  return null;
}

// --- prisoner robots -------------------------------------------------------
// One CGI reflective hovering robot per prisoner (Merlin, Nov 27, 2026:
// "swap their bodies for that" — the reflective hovering robots).
// The six scanner forms are gone as bodies: every prisoner is the same
// robot, seeded differently by its form (scale from heightM, visor eyes
// from eyeCount, sway/bob phase from phase). The robot is built from
// primitives only — no new binary assets.
//
//   body: dark gunmetal capsule, metalness 0.9, reflecting the red hall
//     through the procedural equirect env texture (lib/ares/prison-cgi).
//   head: dome + a red visor slit (the face, local +z).
//   hover ring: an emissive red torus beneath the body — the hover read.
//   shoulder pods + a dim red chest plate.
//   hover: floats PRISON_ROBOT_HOVER_M above the cell floor, bobbing on
//     the form's bobAmp; the outer group holds the hover height, the
//     inner group only turns and bobs around it.
//
// ONE-WAY: the robot's face is its local +z (the visor sits at +z). It
// faces INTO its cell and only sways there — prisonerFaceYawAt(side, t,
// form) holds it within PRISON_FACE_SWAY_RAD of straight inward. No
// spin, no tracking, no look-at: the robot can never turn its visor
// toward the walkway or the keeper.

function PrisonerRobot({ form, side, envTex }) {
  const groupRef = useRef(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = groupRef.current;
    if (!g) return;
    // Idle sway around the inward facing — never a turn, never a look
    // at the walkway. Seeded phase so no two prisoners move in lockstep.
    g.rotation.y = prisonerFaceYawAt(side, t, form);
    g.position.y = Math.sin(t * 0.9 + form.phase) * form.bobAmp;
  });
  const scale = Math.min(1.2, Math.max(0.85, form.heightM / 1.8));
  const glow = PRISON_RED.flame;
  const core = PRISON_RED.core;
  const dark = '#14181f';
  const metal = {
    color: dark,
    metalness: 0.9,
    roughness: 0.18,
    envMap: envTex || undefined,
    envMapIntensity: 1.2,
  };
  // Extra visor eyes ride the same face, seeded count (1-2).
  const extraEyes = [];
  for (let i = 1; i < form.eyeCount; i += 1) {
    extraEyes.push(
      <mesh key={i} position={[i % 2 === 0 ? -0.14 : 0.14, 1.58, 0.19]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color={core} emissive={core} emissiveIntensity={2.0} />
      </mesh>,
    );
  }
  return (
    <group position={[0, PRISON_ROBOT_HOVER_M, 0]} scale={scale}>
      <group ref={groupRef}>
        {/* body: reflective gunmetal capsule */}
        <mesh position={[0, 0.75, 0]}>
          <capsuleGeometry args={[0.32, 0.7, 8, 16]} />
          <meshStandardMaterial {...metal} />
        </mesh>
        {/* head dome */}
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.24, 16, 16]} />
          <meshStandardMaterial {...metal} />
        </mesh>
        {/* visor slit — the face, +z, facing INTO the cell */}
        <mesh position={[0, 1.58, 0.2]}>
          <boxGeometry args={[0.3, 0.05, 0.06]} />
          <meshStandardMaterial color={core} emissive={core} emissiveIntensity={2.2} />
        </mesh>
        {extraEyes}
        {/* chest plate: a dim red light on the torso */}
        <mesh position={[0, 0.85, 0.3]}>
          <boxGeometry args={[0.34, 0.4, 0.06]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.8} />
        </mesh>
        {/* shoulder pods */}
        {[-0.42, 0.42].map((x) => (
          <mesh key={x} position={[x, 1.15, 0]}>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshStandardMaterial {...metal} />
          </mesh>
        ))}
        {/* hover ring: the emissive red torus the robot floats on */}
        <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.05, 12, 32]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.8} />
        </mesh>
      </group>
    </group>
  );
}

// --- one cell screen --------------------------------------------------------
// The video screen on an occupied cell's back wall, behind the robot.
// It plays one of the 3 cell videos from the shared pool — the screen
// never owns a load. Only occupied cells render one (rule 9): empty
// cells get neither robot nor screen.
function CellScreen({ cellIndex, pos, pool }) {
  const matRef = useRef(null);
  useEffect(() => {
    const mat = matRef.current;
    if (!mat || !pool) return undefined;
    pool.registerScreen(cellIndex, mat);
    return () => pool.unregisterScreen(cellIndex);
  }, [cellIndex, pool]);
  if (!pool) return null;
  const backZ = pos.z + (pos.side === 'left'
    ? -PRISON_CELL.depthM / 2 + 0.18
    : PRISON_CELL.depthM / 2 - 0.18);
  return (
    <mesh
      position={[pos.x, pos.floorY + 1.7, backZ]}
      rotation={[0, pos.side === 'left' ? 0 : Math.PI, 0]}
    >
      <planeGeometry args={[PRISON_SCREEN_W, PRISON_SCREEN_H]} />
      <meshBasicMaterial ref={matRef} toneMapped={false} color="#000000" />
    </mesh>
  );
}

// --- the in-range gate ------------------------------------------------------
// The billboard in-view gate, reused for the prison (components/GodTower.jsx):
// per frame, a cell is shown only while its bounding sphere is inside
// the camera frustum AND within PRISON_IN_RANGE_M of the walker's eye.
// Out-of-range cells are hidden outright (shell and content). A cell
// video plays only while at least one visible screen shows it — the
// pool pauses the rest, keeping their currentTime. The hub door trigger
// lives here too: walk into the doorway and the page navigates home.
function PrisonRangeGate({ cells, walkerRef, cellGroupsRef, pool, hall, onExitToHub }) {
  const { camera } = useThree();
  const doorFiredRef = useRef(false);
  useFrame(() => {
    const walker = walkerRef.current;
    if (!walker || !cells) return;
    _rangeProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _rangeFrustum.setFromProjectionMatrix(_rangeProj);
    const visibleScreens = new Set();
    for (const cell of cells) {
      const pos = cell.position;
      const group = cellGroupsRef.current.get(pos.index);
      _rangeCentre.set(pos.x, pos.floorY + PRISON_CELL.heightM / 2, pos.z);
      _rangeSphere.set(_rangeCentre, 3.2);
      const inRange = _rangeFrustum.intersectsSphere(_rangeSphere)
        && cellInDistanceRange(pos, camera.position);
      if (group) group.visible = inRange;
      if (inRange && cellHasScreen(cell)) visibleScreens.add(pos.index);
    }
    if (pool) pool.refreshPlayback(visibleScreens);
    // The hub door: walk into the doorway and go home. Fires once per
    // entry (the flag resets when the walker steps back out).
    if (walkerInDoorTrigger(walker, hall)) {
      if (!doorFiredRef.current && onExitToHub) {
        doorFiredRef.current = true;
        onExitToHub();
      }
    } else {
      doorFiredRef.current = false;
    }
  });
  return null;
}

// --- one cell -----------------------------------------------------------------
// floorMat / backMat are the CGI dressings from PrisonScene (shared
// prison-cgi materials): the cell floor wears the worn deck, the back
// wall wears stained concrete. The cell FRONT is never dressed here —
// bars, rails and one-way glass stay exactly as built (the
// silver-wraps worker owns the frames).
function PrisonCell({ cell, floorMat, backMat, onSelectPrisoner, cellGroupsRef, pool, envTex }) {
  const pos = cell.position;
  const form = cell.prisoner;
  const frontZ = pos.side === 'left'
    ? -(PRISON_HALL.walkwayHalfM + 0.4)
    : PRISON_HALL.walkwayHalfM + 0.4;
  // One-way glass sits just inside the bars: outer pane (glass) then
  // inner pane (mirror), stepping deeper into the cell. inward is the
  // walkway -> cell direction: -z for left cells, +z for right cells.
  const inward = pos.side === 'left' ? -1 : 1;
  const outerPaneZ = frontZ + inward * 0.03;
  const innerPaneZ = frontZ + inward * 0.06;
  // Bars run along x at the cell front; the figure stands at the cell centre.
  const bars = [];
  const barCount = 5;
  for (let i = 0; i < barCount; i += 1) {
    const bx = pos.x - PRISON_CELL.widthM / 2 + ((i + 0.5) / barCount) * PRISON_CELL.widthM;
    bars.push(bx);
  }
  const labelStyle = {
    background: 'rgba(28, 6, 4, 0.85)',
    border: '1px solid rgba(255, 53, 36, 0.5)',
    borderRadius: '8px',
    padding: '3px 8px',
    color: '#FFE0DB',
    fontSize: '11px',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };
  return (
    <group
      ref={(g) => {
        if (!cellGroupsRef) return;
        if (g) cellGroupsRef.current.set(pos.index, g);
        else cellGroupsRef.current.delete(pos.index);
      }}
    >
      {/* cell floor: a thin slab, not a one-sided plane — the level
          below looks up at its underside, and it must be there.
          CGI: worn deck, shared material from PrisonScene. */}
      <mesh position={[pos.x, pos.floorY + 0.05, pos.z]} material={floorMat}>
        <boxGeometry args={[PRISON_CELL.widthM, 0.1, PRISON_CELL.depthM]} />
      </mesh>
      {/* back wall: the FAR side of the cell — left cells at -z, right
          cells at +z. A sign error once built it at the FRONT, which
          sealed every cell with a solid dark wall: the keeper saw
          black fronts and no prisoner at all (Merlin's phone video,
          Nov 15 ~06:33). The front stays open: bars + one-way glass
          only, so the keeper sees straight in. */}
      {/* CGI: stained concrete, shared material from PrisonScene. */}
      <mesh
        position={[pos.x, pos.floorY + PRISON_CELL.heightM / 2, pos.z + (pos.side === 'left' ? -PRISON_CELL.depthM / 2 : PRISON_CELL.depthM / 2)]}
        material={backMat}
      >
        <boxGeometry args={[PRISON_CELL.widthM, PRISON_CELL.heightM, 0.15]} />
      </mesh>
      {/* occupied cell: red wash on the back wall so the robot reads.
          The plane faces the walkway on both sides (right cells turn). */}
      {form && (
        <mesh
          position={[pos.x, pos.floorY + PRISON_CELL.heightM / 2, pos.z + (pos.side === 'left' ? -PRISON_CELL.depthM / 2 + 0.1 : PRISON_CELL.depthM / 2 - 0.1)]}
          rotation={[0, pos.side === 'left' ? 0 : Math.PI, 0]}
        >
          <planeGeometry args={[PRISON_CELL.widthM - 0.2, PRISON_CELL.heightM - 0.2]} />
          <meshStandardMaterial color={PRISON_RED.deep} emissive={PRISON_RED.light} emissiveIntensity={0.35} />
        </mesh>
      )}
      {/* the cell screen: one of the 3 cell videos, occupied cells only */}
      {form && (
        <CellScreen cellIndex={pos.index} pos={pos} pool={pool} />
      )}
      {/* ONE-WAY GLASS: the keeper sees in, the prisoner sees only its
          own mirror. The outer pane is near-clear glass facing the
          walkway; the inner pane is an opaque mirror finish facing the
          cell interior. Both panes are FrontSide only: from the walkway
          the mirror is culled away, from inside the glass is culled
          away. The bars stay in front of both panes. */}
      <mesh position={[pos.x, pos.floorY + PRISON_CELL.heightM / 2, outerPaneZ]} rotation={[0, oneWayPaneYaw(pos.side, 'outer'), 0]}>
        <planeGeometry args={[PRISON_CELL.widthM, PRISON_CELL.heightM]} />
        <meshStandardMaterial
          color={PRISON_RED.flame}
          transparent
          opacity={PRISON_ONE_WAY.outer.opacity}
          roughness={PRISON_ONE_WAY.outer.roughness}
          metalness={PRISON_ONE_WAY.outer.metalness}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh position={[pos.x, pos.floorY + PRISON_CELL.heightM / 2, innerPaneZ]} rotation={[0, oneWayPaneYaw(pos.side, 'inner'), 0]}>
        <planeGeometry args={[PRISON_CELL.widthM, PRISON_CELL.heightM]} />
        <meshStandardMaterial
          color={PRISON_ONE_WAY.inner.color}
          metalness={PRISON_ONE_WAY.inner.metalness}
          roughness={PRISON_ONE_WAY.inner.roughness}
          emissive={PRISON_RED.light}
          emissiveIntensity={PRISON_ONE_WAY.inner.emissiveIntensity}
          side={THREE.FrontSide}
        />
      </mesh>
      {/* front bars: red energy, the robot visible between them through the glass */}
      {bars.map((bx) => (
        <mesh key={bx} position={[bx, pos.floorY + PRISON_CELL.heightM / 2, frontZ]}>
          <boxGeometry args={[0.09, PRISON_CELL.heightM, 0.09]} />
          <meshStandardMaterial color={PRISON_RED.flame} emissive={PRISON_RED.light} emissiveIntensity={1.6} />
        </mesh>
      ))}
      <mesh position={[pos.x, pos.floorY + PRISON_CELL.heightM - 0.08, frontZ]}>
        <boxGeometry args={[PRISON_CELL.widthM, 0.16, 0.12]} />
        <meshStandardMaterial color={PRISON_RED.flame} emissive={PRISON_RED.light} emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[pos.x, pos.floorY + 0.08, frontZ]}>
        <boxGeometry args={[PRISON_CELL.widthM, 0.16, 0.12]} />
        <meshStandardMaterial color={PRISON_RED.flame} emissive={PRISON_RED.light} emissiveIntensity={1.2} />
      </mesh>
      {/* the prisoner: a reflective hovering robot at the cell centre, facing INTO the cell */}
      {form && (
        <group position={[pos.x, pos.floorY, pos.z]}>
          <PrisonerRobot form={form} side={pos.side} envTex={envTex} />
        </group>
      )}
      {/* cell label: short id + score, constant screen size (no distanceFactor).
          The name is a button: tapping it opens the prisoner's report
          (click the name → report). Only the button takes pointer
          events, so drag-to-look still works across the label. */}
      {form && (
        <Html center position={[pos.x, pos.floorY + PRISON_CELL.heightM + 0.35, frontZ]} zIndexRange={[20, 0]} style={labelStyle}>
          <button
            type="button"
            onClick={() => { if (onSelectPrisoner) onSelectPrisoner(form); }}
            aria-label={`Open report for prisoner ${form.shortId}`}
            style={{ pointerEvents: 'auto', cursor: 'pointer', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', padding: 0 }}
          >
            {form.shortId} · score {form.score}
          </button>
        </Html>
      )}
    </group>
  );
}

// --- the whole hall -----------------------------------------------------------
// layout is the Warden's grown layout ({ hall, levels, lightPositions })
// from lib/ares/prison-expansion.js — null before the first load, in
// which case the base hall renders. The hall grows upward only: the
// walkway and the walker clamp never move.
export function PrisonScene({ cells, walkerRef, inputRef, layout, muted = false, onExitToHub, onSelectPrisoner }) {
  const hall = layout?.hall || PRISON_HALL;
  const levels = layout?.levels || PRISON_CELL.levels;
  const lightPositions = layout?.lightPositions || PRISON_LIGHT_POSITIONS;
  // The door back to the hub, in the entrance end wall.
  const door = useMemo(() => prisonHubDoorFor(hall), [hall]);
  // The cell-video pool: 3 videos, one load each, shared by every
  // screen. Created in an effect (not useMemo) so unmount disposes it —
  // leaving the prison stops the audio. StrictMode-safe: the effect
  // re-runs after its own cleanup and mints a fresh pool.
  const [videoPool, setVideoPool] = useState(null);
  const poolRef = useRef(null);
  useEffect(() => {
    const pool = createCellVideoPool({
      createVideo: (src) => {
        const el = document.createElement('video');
        el.src = src;
        return el;
      },
      createTexture: (el) => new THREE.VideoTexture(el),
    });
    poolRef.current = pool;
    setVideoPool(pool);
    return () => {
      pool.dispose();
      poolRef.current = null;
      setVideoPool(null);
    };
  }, []);
  // The mute orb (page.jsx) toggles the pool's one audio stream.
  useEffect(() => {
    if (videoPool) videoPool.setMuted(muted);
  }, [muted, videoPool]);
  // iOS needs a user gesture before audio plays: the first pointerdown
  // anywhere unlocks the one stream (the mute state still rules it).
  useEffect(() => {
    const unlock = () => { if (poolRef.current) poolRef.current.unlockAudio(); };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);
  // The robot's mirror: the procedural red env texture, painted once.
  const envTex = useMemo(() => getPrisonEnvTexture(), []);
  // Per-cell groups, so the in-range gate can hide out-of-range cells.
  const cellGroupsRef = useRef(new Map());
  // CGI shell materials, built once per scene: the flat colours are
  // gone — the floor wears the worn deck, the ceiling and the level
  // separators wear gunmetal, the end/side walls wear cold concrete.
  // One material per surface (repeat tiled to ~4 m); the cell mats
  // are shared down to every PrisonCell so 72+ cells don't mint
  // 72+ materials. Bars, rails, glass and robots are untouched.
  const shellMats = useMemo(() => ({
    floor: prisonMaterial('prisonDeck', 'prison-hall-floor', '#ffffff', { repeatX: 12, repeatY: 4 }),
    ceiling: prisonMaterial('prisonSteel', 'prison-hall-ceiling', '#ffffff', { repeatX: 12, repeatY: 4 }),
    endWall: prisonMaterial('prisonConcrete', 'prison-hall-end', '#ffffff', { repeatX: 4, repeatY: 3 }),
    sideWall: prisonMaterial('prisonConcrete', 'prison-hall-side', '#ffffff', { repeatX: 12, repeatY: 3 }),
    separator: prisonMaterial('prisonSteel', 'prison-hall-separator', '#ffffff', { repeatX: 12, repeatY: 4 }),
    cellFloor: prisonMaterial('prisonDeck', 'prison-cell-floor'),
    cellBack: prisonMaterial('prisonCellBack', 'prison-cell-back'),
  }), []);
  // Level separator slabs + the walkway floor strips, computed once.
  const separators = useMemo(() => {
    const out = [];
    for (let l = 1; l < levels; l += 1) out.push(l * PRISON_CELL.heightM);
    return out;
  }, [levels]);
  return (
    <>
      {/* base light: dim ambient + faint red hemisphere so nothing is pitch black */}
      <ambientLight intensity={0.35} color="#e8a08f" />
      <hemisphereLight args={['#7a2a27', '#0d0505', 0.5]} />
      {/* THE RED LIGHTS: the Warden's budget — the base row of 8, plus
          one 4-light row per added level, all the prison red */}
      {lightPositions.map((p) => (
        <pointLight
          key={`${p.x},${p.y}`}
          position={[p.x, p.y, p.z]}
          color={PRISON_RED.light}
          intensity={PRISON_LIGHT.intensity}
          distance={PRISON_LIGHT.distance}
        />
      ))}

      {/* CGI dressing: fixture housings over the lights, the Warden's
          dais at the far end, cold dust in the walkway. Additive
          only — no new real lights, no mechanic touched. */}
      <PrisonCgiDressing hall={hall} lightPositions={lightPositions} />

      {/* hall shell: floor, ceiling, end walls — CGI materials now,
          same geometry, same footprint */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={shellMats.floor}>
        <planeGeometry args={[hall.lengthM, hall.widthM]} />
      </mesh>
      <mesh position={[0, hall.heightM, 0]} rotation={[Math.PI / 2, 0, 0]} material={shellMats.ceiling}>
        <planeGeometry args={[hall.lengthM, hall.widthM]} />
      </mesh>
      {[-hall.lengthM / 2, hall.lengthM / 2].map((x) => (
        <mesh key={x} position={[x, hall.heightM / 2, 0]} material={shellMats.endWall}>
          <boxGeometry args={[0.3, hall.heightM, hall.widthM]} />
        </mesh>
      ))}
      {/* side walls behind the cells */}
      {[-hall.widthM / 2, hall.widthM / 2].map((z) => (
        <mesh key={z} position={[0, hall.heightM / 2, z]} material={shellMats.sideWall}>
          <boxGeometry args={[hall.lengthM, hall.heightM, 0.3]} />
        </mesh>
      ))}

      {/* walkway guide strips: red light lines along the aisle edges */}
      {[-hall.walkwayHalfM, hall.walkwayHalfM].map((z) => (
        <mesh key={z} position={[0, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[hall.lengthM - 2, 0.18]} />
          <meshStandardMaterial color={PRISON_RED.flame} emissive={PRISON_RED.light} emissiveIntensity={1.8} />
        </mesh>
      ))}

      {/* level separator slabs (the stacked floors) — real slabs, not
          one-sided planes, so the level below sees a ceiling */}
      {separators.map((y) => (
        <mesh key={y} position={[0, y, 0]} material={shellMats.separator}>
          <boxGeometry args={[hall.lengthM, 0.15, hall.widthM]} />
        </mesh>
      ))}

      {/* the cells — only in-range cells are shown (PrisonRangeGate) */}
      {cells.map((cell) => (
        <PrisonCell
          key={cell.position.index}
          cell={cell}
          floorMat={shellMats.cellFloor}
          backMat={shellMats.cellBack}
          onSelectPrisoner={onSelectPrisoner}
          cellGroupsRef={cellGroupsRef}
          pool={videoPool}
          envTex={envTex}
        />
      ))}

      {/* the walk-through door back to the hub, in the entrance end
          wall (behind the spawn — the Warden's dais holds the far end).
          Walk into it; no button tap. */}
      <group position={[door.x + 0.2, 0, 0]}>
        {[-0.9, 0.9].map((z) => (
          <mesh key={z} position={[0, 1.3, z]}>
            <boxGeometry args={[0.18, 2.6, 0.18]} />
            <meshStandardMaterial color={PRISON_RED.flame} emissive={PRISON_RED.light} emissiveIntensity={1.6} />
          </mesh>
        ))}
        <mesh position={[0, 2.6, 0]}>
          <boxGeometry args={[0.18, 0.18, 1.98]} />
          <meshStandardMaterial color={PRISON_RED.flame} emissive={PRISON_RED.light} emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[0, 1.25, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.8, 2.5]} />
          <meshBasicMaterial color={PRISON_RED.light} transparent opacity={0.35} />
        </mesh>
        <Html
          center
          position={[0.4, 3.1, 0]}
          zIndexRange={[20, 0]}
          style={{
            background: 'rgba(28, 6, 4, 0.85)',
            border: '1px solid rgba(255, 53, 36, 0.6)',
            borderRadius: '10px',
            padding: '6px 12px',
            color: '#FFE0DB',
            fontSize: '13px',
            letterSpacing: '3px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <div>{door.label}</div>
        </Html>
      </group>

      {/* entrance sign, constant size */}
      <Html
        center
        position={[PRISON_HALL.spawn.x + 1.5, 4.2, 0]}
        zIndexRange={[20, 0]}
        style={{
          background: 'rgba(28, 6, 4, 0.85)',
          border: '1px solid rgba(255, 53, 36, 0.6)',
          borderRadius: '10px',
          padding: '6px 12px',
          color: '#FFE0DB',
          fontSize: '13px',
          letterSpacing: '3px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <div>ARES PRISON</div>
      </Html>

      <PrisonCameraRig walkerRef={walkerRef} inputRef={inputRef} />
      <PrisonRangeGate
        cells={cells}
        walkerRef={walkerRef}
        cellGroupsRef={cellGroupsRef}
        pool={videoPool}
        hall={hall}
        onExitToHub={onExitToHub}
      />
    </>
  );
}
