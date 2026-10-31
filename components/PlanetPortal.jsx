'use client';

// PlanetPortal — the planet-jump gate, standing opposite the Sun.
// Same concept as the Omega Arch: a physical portal you approach,
// but instead of one destination it lists EVERY planet by name —
// built-in worlds (ours) and user-forged worlds (theirs) — and
// clicking a name fires the vortex to carry you there.
//
// Fully automatic: the list is built live from lib/planet-directory.js,
// so a newly published world appears the moment it's published.

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { paintVanGoghText, isVanGoghActive, useVanGoghActive } from '@/lib/vangogh';
import {
  builtinPlanets,
  userPlanets,
  arrivalPoint,
} from '@/lib/planet-directory';

// Opposite the Sun (Sun at [0, 158.75, 662.5]).
export const PLANET_PORTAL_POSITION = { x: 0, y: 158.75, z: -662.5 };
export const PLANET_PORTAL_RADIUS = 28;

function PortalRing({ position }) {
  const ringRef = useRef();
  const glowRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.15;
    }
    if (glowRef.current) {
      glowRef.current.material.opacity = 0.55 + Math.sin(t * 1.4) * 0.2;
    }
  });

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* Outer ring — brushed gold, distinct from the Omega Arch */}
      <mesh ref={ringRef}>
        <torusGeometry args={[PLANET_PORTAL_RADIUS, 2.2, 24, 72]} />
        <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* Inner glow disc */}
      <mesh ref={glowRef}>
        <circleGeometry args={[PLANET_PORTAL_RADIUS - 3, 48]} />
        <meshBasicMaterial
          color="#7fd4ff"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Label sprite */}
      <LabelSprite text="PLANET PORTAL" y={PLANET_PORTAL_RADIUS + 12} />
    </group>
  );
}

function LabelSprite({ text, y }) {
  const [texture, setTexture] = useState(null);
  const vgogh = useVanGoghActive();
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isVanGoghActive()) {
      // Painterly umber shadow instead of the cyan glow.
      paintVanGoghText(ctx, text, canvas.width / 2, canvas.height / 2, {
        font: '700 64px Georgia, serif',
        fill: '#d8f0ff',
      });
    } else {
      ctx.font = '700 64px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(127, 212, 255, 0.9)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#d8f0ff';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    setTexture(tex);
    return () => tex.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, vgogh]);

  if (!texture) return null;
  return (
    <sprite position={[0, y, 0]} scale={[90, 11.25, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

// The clickable planet list. Rendered as a DOM overlay when the portal
// is open — full planet directory, every world by name.
function PlanetList({ worlds, onSelect, onClose }) {
  const builtins = builtinPlanets();
  const users = userPlanets(worlds);

  return (
    <div
      className="fixed inset-0 z-[2147483001] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Planet directory"
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-cyan-300/30 bg-[#0a1420]/95 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-center text-2xl font-bold text-cyan-100">
          Planet Portal
        </h2>
        <p className="mb-4 text-center text-sm text-cyan-300/70">
          Every world, by name. Pick one — the vortex takes you there.
        </p>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-200/80">
          Our worlds
        </h3>
        <div className="mb-5 space-y-1">
          {builtins.map((p) => (
            <button
              key={p.key}
              onClick={() => onSelect(p)}
              className="block w-full rounded-lg px-4 py-2.5 text-left text-cyan-50 transition-colors hover:bg-cyan-400/15"
            >
              {p.name}
            </button>
          ))}
        </div>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-200/80">
          Forged by travelers
        </h3>
        <div className="space-y-1">
          {users.length === 0 ? (
            <p className="px-4 py-2 text-sm text-cyan-300/50">
              No traveler worlds yet — forge the first.
            </p>
          ) : (
            users.map((p) => (
              <button
                key={p.key}
                onClick={() => onSelect(p)}
                className="block w-full rounded-lg px-4 py-2.5 text-left text-cyan-50 transition-colors hover:bg-cyan-400/15"
              >
                {p.name}
              </button>
            ))
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 block w-full rounded-lg border border-cyan-300/30 px-4 py-2 text-sm text-cyan-200/80 hover:bg-cyan-400/10"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function PlanetPortal({ worlds, onPlanetJump }) {
  const [listOpen, setListOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleSelect = (planet) => {
    setListOpen(false);
    const dest = arrivalPoint(planet);
    onPlanetJump?.({
      name: planet.name,
      position: dest,
    });
  };

  return (
    <>
      <group
        onClick={(e) => {
          e.stopPropagation();
          setListOpen(true);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <PortalRing position={PLANET_PORTAL_POSITION} />
        {/* Invisible click target — bigger than the ring for touch */}
        <mesh position={[PLANET_PORTAL_POSITION.x, PLANET_PORTAL_POSITION.y, PLANET_PORTAL_POSITION.z]}>
          <sphereGeometry args={[PLANET_PORTAL_RADIUS + 12, 16, 16]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </group>
      {listOpen && (
        <PlanetList
          worlds={worlds}
          onSelect={handleSelect}
          onClose={() => setListOpen(false)}
        />
      )}
    </>
  );
}
