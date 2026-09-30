// Streetball — static 3D scene: court, markings, two hoops, arena, spot markers.
'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  COURT_W,
  COURT_L,
  RIM_Y,
  RIM_R,
  RIM_TUBE,
  RIM_Z,
  BOARD_Z,
  BOARD_W,
  BOARD_BOTTOM,
  BOARD_TOP,
} from '@/lib/basketball/constants';

const LINE_Y = 0.02;
const LINE_COLOR = '#d7f9ff';

// A flat glowing strip between two court points.
function Strip({ ax, az, bx, bz, width = 0.12, color = LINE_COLOR, y = LINE_Y }) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const rotY = Math.atan2(dx, dz);
  return (
    <mesh position={[(ax + bx) / 2, y, (az + bz) / 2]} rotation={[0, rotY, 0]}>
      <boxGeometry args={[width, 0.015, len]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
    </mesh>
  );
}

function FlatRing({ x, z, inner, outer, thetaStart = 0, thetaLength = Math.PI * 2, color = LINE_COLOR }) {
  return (
    <mesh position={[x, LINE_Y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[inner, outer, 64, 1, thetaStart, thetaLength]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CourtMarkings() {
  const W = COURT_W / 2; // 7.5
  const L = COURT_L / 2; // 14
  const rimZ = RIM_Z; // 12.65
  const threeR = 6.75;
  const cornerX = 6.6;
  // where the corner line meets the arc: dz from rim
  const cornerDz = Math.sqrt(threeR * threeR - cornerX * cornerX); // ~1.41
  return (
    <group>
      {/* boundary */}
      <Strip ax={-W} az={-L} bx={W} bz={-L} />
      <Strip ax={-W} az={L} bx={W} bz={L} />
      <Strip ax={-W} az={-L} bx={-W} bz={L} />
      <Strip ax={W} az={-L} bx={W} bz={L} />
      {/* center line + circle */}
      <Strip ax={-W} az={0} bx={W} bz={0} />
      <FlatRing x={0} z={0} inner={1.74} outer={1.86} />
      {/* three-point arcs + corner lines, both ends */}
      {[1, -1].map((s) => (
        <group key={s}>
          <FlatRing
            x={0}
            z={s * rimZ}
            inner={threeR - 0.06}
            outer={threeR + 0.06}
            thetaStart={s === 1 ? 0 : Math.PI}
            thetaLength={Math.PI}
          />
          <Strip ax={-cornerX} az={s * L} bx={-cornerX} bz={s * (rimZ - cornerDz)} />
          <Strip ax={cornerX} az={s * L} bx={cornerX} bz={s * (rimZ - cornerDz)} />
          {/* key (paint) outline */}
          <Strip ax={-2.45} az={s * L} bx={-2.45} bz={s * (L - 5.8)} />
          <Strip ax={2.45} az={s * L} bx={2.45} bz={s * (L - 5.8)} />
          <Strip ax={-2.45} az={s * (L - 5.8)} bx={2.45} bz={s * (L - 5.8)} />
          {/* free-throw circle */}
          <FlatRing x={0} z={s * (L - 5.8)} inner={1.74} outer={1.86} />
          {/* restricted-area arc */}
          <FlatRing
            x={0}
            z={s * rimZ}
            inner={1.19}
            outer={1.31}
            thetaStart={s === 1 ? 0 : Math.PI}
            thetaLength={Math.PI}
          />
        </group>
      ))}
    </group>
  );
}

function Net({ rimZ }) {
  // wireframe cone under the rim
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(RIM_R * 0.98, 0.13, 0.42, 10, 4, true);
    return g;
  }, []);
  return (
    <mesh position={[0, RIM_Y - 0.22, rimZ]} geometry={geo}>
      <meshBasicMaterial color="#f5f5f5" wireframe transparent opacity={0.85} />
    </mesh>
  );
}

function HoopAssembly({ side }) {
  // side: +1 => rim at z=+RIM_Z (near end), -1 => z=-RIM_Z (far end)
  const rimZ = side * RIM_Z;
  const boardZ = side * BOARD_Z;
  const poleZ = side * (BOARD_Z + 1.1);
  return (
    <group>
      {/* pole */}
      <mesh position={[0, 2.1, poleZ]}>
        <boxGeometry args={[0.35, 4.2, 0.35]} />
        <meshStandardMaterial color="#1a2436" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* arm */}
      <mesh position={[0, 3.9, (poleZ + boardZ) / 2]}>
        <boxGeometry args={[0.22, 0.22, Math.abs(poleZ - boardZ)]} />
        <meshStandardMaterial color="#1a2436" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* backboard */}
      <mesh position={[0, (BOARD_TOP + BOARD_BOTTOM) / 2, boardZ]}>
        <boxGeometry args={[BOARD_W, BOARD_TOP - BOARD_BOTTOM, 0.06]} />
        <meshStandardMaterial
          color="#bfe9ff"
          transparent
          opacity={0.32}
          emissive="#38e1ff"
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* backboard frame (glowing outline) */}
      {(() => {
        const w = BOARD_W + 0.08;
        const h = BOARD_TOP - BOARD_BOTTOM + 0.08;
        const t = 0.07;
        const cy = (BOARD_TOP + BOARD_BOTTOM) / 2;
        const frame = [
          { p: [0, cy + h / 2, boardZ], s: [w, t, 0.05] },
          { p: [0, cy - h / 2, boardZ], s: [w, t, 0.05] },
          { p: [-w / 2, cy, boardZ], s: [t, h, 0.05] },
          { p: [w / 2, cy, boardZ], s: [t, h, 0.05] },
        ];
        return (
          <group>
            {frame.map((f, i) => (
              <mesh key={i} position={f.p}>
                <boxGeometry args={f.s} />
                <meshStandardMaterial color="#00f2ff" emissive="#00f2ff" emissiveIntensity={1.2} />
              </mesh>
            ))}
          </group>
        );
      })()}
      {/* shooter square (outline) */}
      {(() => {
        const w = 0.62;
        const h = 0.46;
        const t = 0.045;
        const cy = RIM_Y + 0.45;
        const cz = boardZ - side * 0.045;
        const sq = [
          { p: [0, cy + h / 2, cz], s: [w, t, 0.02] },
          { p: [0, cy - h / 2, cz], s: [w, t, 0.02] },
          { p: [-w / 2, cy, cz], s: [t, h, 0.02] },
          { p: [w / 2, cy, cz], s: [t, h, 0.02] },
        ];
        return (
          <group>
            {sq.map((f, i) => (
              <mesh key={i} position={f.p}>
                <boxGeometry args={f.s} />
                <meshStandardMaterial color="#a5f3fc" emissive="#00f2ff" emissiveIntensity={1.5} />
              </mesh>
            ))}
          </group>
        );
      })()}
      {/* rim */}
      <mesh position={[0, RIM_Y, rimZ]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RIM_R, RIM_TUBE, 12, 40]} />
        <meshStandardMaterial color="#ff5a1f" emissive="#ff5a1f" emissiveIntensity={1.1} metalness={0.4} roughness={0.35} />
      </mesh>
      {/* rim mount */}
      <mesh position={[0, RIM_Y, (rimZ + boardZ) / 2]}>
        <boxGeometry args={[0.12, 0.08, Math.abs(boardZ - rimZ)]} />
        <meshStandardMaterial color="#ff5a1f" emissive="#ff5a1f" emissiveIntensity={0.8} />
      </mesh>
      <Net rimZ={rimZ} />
    </group>
  );
}

function Arena() {
  return (
    <group>
      {/* surrounding dark floor */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#04060c" roughness={1} />
      </mesh>
      {/* stands */}
      {[
        { p: [0, 2.5, -24], s: [46, 5, 10] },
        { p: [0, 2.5, 24], s: [46, 5, 10] },
        { p: [-24, 2.5, 0], s: [10, 5, 40] },
        { p: [24, 2.5, 0], s: [10, 5, 40] },
      ].map((b, i) => (
        <group key={i}>
          <mesh position={b.p}>
            <boxGeometry args={b.s} />
            <meshStandardMaterial color="#0a1020" roughness={0.9} />
          </mesh>
          <mesh position={[b.p[0], b.p[1] + b.s[1] / 2 + 0.05, b.p[2]]}>
            <boxGeometry args={[b.s[0], 0.1, b.s[2]]} />
            <meshStandardMaterial color="#00f2ff" emissive="#00f2ff" emissiveIntensity={0.7} />
          </mesh>
        </group>
      ))}
      {/* hanging scoreboard */}
      <mesh position={[0, 10.5, 0]}>
        <boxGeometry args={[4.4, 2.2, 4.4]} />
        <meshStandardMaterial color="#0a1020" emissive="#0ea5e9" emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, 10.5, 0]}>
        <boxGeometry args={[4.5, 0.12, 4.5]} />
        <meshStandardMaterial color="#00f2ff" emissive="#00f2ff" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

function SpotMarkers({ spots, activeIndex, visible }) {
  const group = useRef();
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.children.forEach((m, i) => {
      const s = i === activeIndex ? 1 + Math.sin(t * 5) * 0.18 : 1;
      m.scale.set(s, s, s);
    });
  });
  if (!visible) return null;
  return (
    <group ref={group}>
      {spots.map((s, i) => (
        <mesh key={i} position={[s.x, 0.035, s.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[i === activeIndex ? 0.5 : 0.34, 32]} />
          <meshBasicMaterial
            color={i === activeIndex ? '#00f2ff' : '#0e7490'}
            transparent
            opacity={i === activeIndex ? 0.95 : 0.55}
          />
        </mesh>
      ))}
    </group>
  );
}

export function CourtScene({ spots, activeIndex, showSpots }) {
  return (
    <group>
      {/* court floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[COURT_W, COURT_L]} />
        <meshStandardMaterial color="#0c1626" roughness={0.55} metalness={0.15} />
      </mesh>
      {/* painted key areas (subtle) */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, 0.008, s * (14 - 2.9)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.9, 5.8]} />
          <meshStandardMaterial color="#12395e" roughness={0.6} transparent opacity={0.85} />
        </mesh>
      ))}
      <CourtMarkings />
      <HoopAssembly side={1} />
      <HoopAssembly side={-1} />
      <Arena />
      <SpotMarkers spots={spots} activeIndex={activeIndex} visible={showSpots} />
    </group>
  );
}
