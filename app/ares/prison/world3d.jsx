// app/ares/prison/world3d.jsx — the ARES Prison hall, in 3D.
//
// One long hall. Walkway down the middle, cell blocks on both sides:
// 3 stacked levels x 12 columns x 2 sides = 72 cells. Every trapped
// prisoner stands inside its own cell, as it appears — its scanner
// form, derived deterministically from its signature (lib/ares/prison.js).
// Empty cells stay empty and visible: the prison has room.
//
// GROWTH (Merlin, Nov 15 ~04:52): the Warden (lib/ares/prison-expansion.js)
// grows the hall a level at a time when the cells fill — one more
// level of 24 cells, stacked on top. The footprint never moves, so
// the walkway, the spawn, and the walker clamp are untouched; only
// the hall gets taller and each new level gets its own 4-light row.
// The scene takes the grown layout as a prop (hall, levels, light
// positions) and falls back to the base hall when it is null —
// before the first load lands, the base hall renders.
//
// LIGHT: blue throughout. 8 real blue point lights along the walkway
// (PRISON_LIGHT_BUDGET — ghost-rider discipline: light only where it
// guides). Everything else is emissive: cell glow, bars, floor strips,
// figures. No other real lights.
//
// MOVEMENT: the shared walker (lib/world/walk-controls.js) — the same
// first-person system every realm uses. The walker stays in the
// walkway rectangle (|x| <= 23, |z| <= 2.6); the cells are unreachable
// by clamp, so the bars are never walked through.
//
// ONE-WAY VISIBILITY (Merlin, Nov 15 ~04:46): "I should be able to
// see them, but they should not be able to see me." Figures face INTO
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

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  PRISON_BLUE,
  PRISON_HALL,
  PRISON_CELL,
  PRISON_LIGHT_POSITIONS,
  PRISON_LIGHT,
  PRISON_WALKER_WORLD,
  PRISON_ONE_WAY,
  prisonerFaceYawAt,
  oneWayPaneYaw,
} from '@/lib/ares/prison';
import {
  createWalker,
  stepWalker,
  applyLook,
  walkerCamera,
  LOOK_SENS,
} from '@/lib/world/walk-controls';

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

// --- prisoner figures -------------------------------------------------------
// One assembly per form kind, built from primitives. Every figure glows
// blue — contained energy, not a living thing. Proportions come from
// the form spec (seeded); the kind sets the silhouette.
//
// ONE-WAY: the figure's face is its local +z (eyes and snout sit at
// +z). It faces INTO its cell and only sways there —
// prisonerFaceYawAt(side, t, form) holds it within PRISON_FACE_SWAY_RAD
// of straight inward. No spin, no tracking, no look-at: the figure
// can never turn its eyes toward the walkway or the keeper. The wisp
// has no face, but it sways the same way — the rule is uniform.
//
//   snooper: low hunched body, long snout cone forward, thin antenna.
//   sweeper: wide flat disc, 4 thin legs, a dish on top.
//   knocker: tall thin body, one big raised arm.
//   rammer: bulky body, two horn cones.
//   script: thin upright wisp with a needle.
//   wisp: floating octahedron core + orbiting shards (the given form).

function FigureBody({ form, side }) {
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
  const h = form.heightM;
  const glow = PRISON_BLUE.flame;
  const dark = '#101826';
  const core = PRISON_BLUE.core;
  const eye = (
    <mesh position={[0, h * 0.78, 0.16]}>
      <sphereGeometry args={[0.09, 12, 12]} />
      <meshStandardMaterial color={core} emissive={core} emissiveIntensity={2.2} />
    </mesh>
  );
  // Extra eyes ride the same face, seeded count (1-2, sweeper has 1).
  const extraEyes = [];
  for (let i = 1; i < form.eyeCount; i += 1) {
    extraEyes.push(
      <mesh key={i} position={[(i % 2 === 0 ? -0.14 : 0.14), h * 0.78, 0.14]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color={core} emissive={core} emissiveIntensity={2.0} />
      </mesh>,
    );
  }
  if (form.kind === 'wisp') {
    // The wisp floats: the outer group holds its 0.4 m hover height,
    // the inner group (groupRef) only turns and bobs around it — the
    // useFrame must never overwrite the hover height.
    return (
      <group position={[0, 0.4, 0]}>
        <group ref={groupRef}>
          <mesh>
            <octahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={1.4} />
          </mesh>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2 + form.phase;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.7, Math.sin(a * 2) * 0.15, Math.sin(a) * 0.7]}>
                <tetrahedronGeometry args={[0.09, 0]} />
                <meshStandardMaterial color={core} emissive={core} emissiveIntensity={1.8} />
              </mesh>
            );
          })}
        </group>
      </group>
    );
  }
  if (form.kind === 'sweeper') {
    return (
      <group ref={groupRef}>
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.75, 0.85, 0.28, 16]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[0, 0.85, 0]}>
          <coneGeometry args={[0.5, 0.3, 16]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={1.0} />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + form.phase;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.7, 0.22, Math.sin(a) * 0.7]} rotation={[0, 0, Math.cos(a) * 0.5]}>
              <cylinderGeometry args={[0.03, 0.03, 0.5, 6]} />
              <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={0.5} />
            </mesh>
          );
        })}
        {eye}
        {extraEyes}
      </group>
    );
  }
  if (form.kind === 'knocker') {
    return (
      <group ref={groupRef}>
        <mesh position={[0, h * 0.5, 0]}>
          <cylinderGeometry args={[0.22, 0.3, h, 10]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[0.42, h * 0.72, 0]} rotation={[0, 0, -0.9]}>
          <boxGeometry args={[0.16, 0.9, 0.16]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={0.9} />
        </mesh>
        <mesh position={[0, h + 0.12, 0]}>
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={1.0} />
        </mesh>
        {eye}
        {extraEyes}
      </group>
    );
  }
  if (form.kind === 'rammer') {
    return (
      <group ref={groupRef}>
        <mesh position={[0, h * 0.45, 0]}>
          <boxGeometry args={[0.95, h * 0.9, 0.6]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={0.6} />
        </mesh>
        {[-0.35, 0.35].map((x) => (
          <mesh key={x} position={[x, h * 0.95, 0]} rotation={[0, 0, x > 0 ? -0.6 : 0.6]}>
            <coneGeometry args={[0.09, 0.5, 8]} />
            <meshStandardMaterial color={core} emissive={core} emissiveIntensity={1.2} />
          </mesh>
        ))}
        <mesh position={[0, h * 0.88, 0]}>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={1.0} />
        </mesh>
        {eye}
        {extraEyes}
      </group>
    );
  }
  if (form.kind === 'script') {
    return (
      <group ref={groupRef}>
        <mesh position={[0, h * 0.5, 0]}>
          <cylinderGeometry args={[0.1, 0.16, h, 8]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.2, h * 0.7, 0]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
          <meshStandardMaterial color={core} emissive={core} emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[0, h + 0.1, 0]}>
          <sphereGeometry args={[0.16, 12, 12]} />
          <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={1.2} />
        </mesh>
        {eye}
        {extraEyes}
      </group>
    );
  }
  // snooper (default): low hunched body, long snout, thin antenna.
  return (
    <group ref={groupRef}>
      <mesh position={[0, h * 0.42, 0]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.7, 0.55, 1.0]} />
        <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, h * 0.5, 0.62]} rotation={[Math.PI / 2.4, 0, 0]}>
        <coneGeometry args={[0.09, 0.7, 8]} />
        <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, h * 0.85, -0.1]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.7, 6]} />
        <meshStandardMaterial color={core} emissive={core} emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0, h * 0.78, 0.1]}>
        <sphereGeometry args={[0.2, 12, 12]} />
        <meshStandardMaterial color={dark} emissive={glow} emissiveIntensity={1.0} />
      </mesh>
      {eye}
      {extraEyes}
    </group>
  );
}

// --- one cell -----------------------------------------------------------------
function PrisonCell({ cell }) {
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
    background: 'rgba(4, 12, 28, 0.85)',
    border: '1px solid rgba(111, 177, 255, 0.5)',
    borderRadius: '8px',
    padding: '3px 8px',
    color: '#d6e9ff',
    fontSize: '11px',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };
  return (
    <group>
      {/* cell floor: a thin slab, not a one-sided plane — the level
          below looks up at its underside, and it must be there */}
      <mesh position={[pos.x, pos.floorY + 0.05, pos.z]}>
        <boxGeometry args={[PRISON_CELL.widthM, 0.1, PRISON_CELL.depthM]} />
        <meshStandardMaterial color="#0b1220" roughness={0.9} />
      </mesh>
      {/* back wall: the FAR side of the cell — left cells at -z, right
          cells at +z. A sign error once built it at the FRONT, which
          sealed every cell with a solid dark wall: the keeper saw
          black fronts and no prisoner at all (Merlin's phone video,
          Nov 15 ~06:33). The front stays open: bars + one-way glass
          only, so the keeper sees straight in. */}
      <mesh
        position={[pos.x, pos.floorY + PRISON_CELL.heightM / 2, pos.z + (pos.side === 'left' ? -PRISON_CELL.depthM / 2 : PRISON_CELL.depthM / 2)]}
      >
        <boxGeometry args={[PRISON_CELL.widthM, PRISON_CELL.heightM, 0.15]} />
        <meshStandardMaterial color="#0d1526" roughness={0.9} />
      </mesh>
      {/* occupied cell: blue wash on the back wall so the figure reads.
          The plane faces the walkway on both sides (right cells turn). */}
      {form && (
        <mesh
          position={[pos.x, pos.floorY + PRISON_CELL.heightM / 2, pos.z + (pos.side === 'left' ? -PRISON_CELL.depthM / 2 + 0.1 : PRISON_CELL.depthM / 2 - 0.1)]}
          rotation={[0, pos.side === 'left' ? 0 : Math.PI, 0]}
        >
          <planeGeometry args={[PRISON_CELL.widthM - 0.2, PRISON_CELL.heightM - 0.2]} />
          <meshStandardMaterial color={PRISON_BLUE.deep} emissive={PRISON_BLUE.light} emissiveIntensity={0.35} />
        </mesh>
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
          color={PRISON_BLUE.flame}
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
          emissive={PRISON_BLUE.light}
          emissiveIntensity={PRISON_ONE_WAY.inner.emissiveIntensity}
          side={THREE.FrontSide}
        />
      </mesh>
      {/* front bars: blue energy, the figure visible between them through the glass */}
      {bars.map((bx) => (
        <mesh key={bx} position={[bx, pos.floorY + PRISON_CELL.heightM / 2, frontZ]}>
          <boxGeometry args={[0.09, PRISON_CELL.heightM, 0.09]} />
          <meshStandardMaterial color={PRISON_BLUE.flame} emissive={PRISON_BLUE.light} emissiveIntensity={1.6} />
        </mesh>
      ))}
      <mesh position={[pos.x, pos.floorY + PRISON_CELL.heightM - 0.08, frontZ]}>
        <boxGeometry args={[PRISON_CELL.widthM, 0.16, 0.12]} />
        <meshStandardMaterial color={PRISON_BLUE.flame} emissive={PRISON_BLUE.light} emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[pos.x, pos.floorY + 0.08, frontZ]}>
        <boxGeometry args={[PRISON_CELL.widthM, 0.16, 0.12]} />
        <meshStandardMaterial color={PRISON_BLUE.flame} emissive={PRISON_BLUE.light} emissiveIntensity={1.2} />
      </mesh>
      {/* the prisoner, standing at the cell centre, facing INTO the cell */}
      {form && (
        <group position={[pos.x, pos.floorY, pos.z]}>
          <FigureBody form={form} side={pos.side} />
        </group>
      )}
      {/* cell label: short id + score, constant screen size (no distanceFactor) */}
      {form && (
        <Html center position={[pos.x, pos.floorY + PRISON_CELL.heightM + 0.35, frontZ]} zIndexRange={[20, 0]} style={labelStyle}>
          <div>
            {form.shortId} · score {form.score}
          </div>
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
export function PrisonScene({ cells, walkerRef, inputRef, layout }) {
  const hall = layout?.hall || PRISON_HALL;
  const levels = layout?.levels || PRISON_CELL.levels;
  const lightPositions = layout?.lightPositions || PRISON_LIGHT_POSITIONS;
  // Level separator slabs + the walkway floor strips, computed once.
  const separators = useMemo(() => {
    const out = [];
    for (let l = 1; l < levels; l += 1) out.push(l * PRISON_CELL.heightM);
    return out;
  }, [levels]);
  return (
    <>
      {/* base light: dim ambient + faint blue hemisphere so nothing is pitch black */}
      <ambientLight intensity={0.35} color="#8fb4e8" />
      <hemisphereLight args={['#274a7a', '#05070d', 0.5]} />
      {/* THE BLUE LIGHTS: the Warden's budget — the base row of 8, plus
          one 4-light row per added level, all the prison blue */}
      {lightPositions.map((p) => (
        <pointLight
          key={`${p.x},${p.y}`}
          position={[p.x, p.y, p.z]}
          color={PRISON_BLUE.light}
          intensity={PRISON_LIGHT.intensity}
          distance={PRISON_LIGHT.distance}
        />
      ))}

      {/* hall shell: floor, ceiling, end walls */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[hall.lengthM, hall.widthM]} />
        <meshStandardMaterial color="#0a0f1a" roughness={0.85} />
      </mesh>
      <mesh position={[0, hall.heightM, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[hall.lengthM, hall.widthM]} />
        <meshStandardMaterial color="#070b14" roughness={0.95} />
      </mesh>
      {[-hall.lengthM / 2, hall.lengthM / 2].map((x) => (
        <mesh key={x} position={[x, hall.heightM / 2, 0]}>
          <boxGeometry args={[0.3, hall.heightM, hall.widthM]} />
          <meshStandardMaterial color="#0d1526" roughness={0.9} />
        </mesh>
      ))}
      {/* side walls behind the cells */}
      {[-hall.widthM / 2, hall.widthM / 2].map((z) => (
        <mesh key={z} position={[0, hall.heightM / 2, z]}>
          <boxGeometry args={[hall.lengthM, hall.heightM, 0.3]} />
          <meshStandardMaterial color="#0b1220" roughness={0.9} />
        </mesh>
      ))}

      {/* walkway guide strips: blue light lines along the aisle edges */}
      {[-hall.walkwayHalfM, hall.walkwayHalfM].map((z) => (
        <mesh key={z} position={[0, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[hall.lengthM - 2, 0.18]} />
          <meshStandardMaterial color={PRISON_BLUE.flame} emissive={PRISON_BLUE.light} emissiveIntensity={1.8} />
        </mesh>
      ))}

      {/* level separator slabs (the stacked floors) — real slabs, not
          one-sided planes, so the level below sees a ceiling */}
      {separators.map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[hall.lengthM, 0.15, hall.widthM]} />
          <meshStandardMaterial color="#0b1220" roughness={0.9} />
        </mesh>
      ))}

      {/* the cells */}
      {cells.map((cell) => (
        <PrisonCell key={cell.position.index} cell={cell} />
      ))}

      {/* entrance sign, constant size */}
      <Html
        center
        position={[PRISON_HALL.spawn.x + 1.5, 4.2, 0]}
        zIndexRange={[20, 0]}
        style={{
          background: 'rgba(4, 12, 28, 0.85)',
          border: '1px solid rgba(111, 177, 255, 0.6)',
          borderRadius: '10px',
          padding: '6px 12px',
          color: '#d6e9ff',
          fontSize: '13px',
          letterSpacing: '3px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <div>ARES PRISON</div>
      </Html>

      <PrisonCameraRig walkerRef={walkerRef} inputRef={inputRef} />
    </>
  );
}
