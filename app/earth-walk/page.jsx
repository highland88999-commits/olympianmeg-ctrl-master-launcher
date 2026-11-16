'use client';

// app/earth-walk/page.jsx — WALKING ON EARTH (Merlin, Nov 15, 2026).
//
// "Yes — let me jump around Earth too": tap the Earth in the hub
// (parent wires the hub tap after the Earth 1 rework lands) or tap
// the Earth hanging in the Moon's sky, and you land ON Earth on
// foot — the same walker as the Moon (lib/planet-walker.js) under
// Earth's own real gravity (9.81 m/s²). Same 3.0 m/s take-off, so
// the jump here is a small honest hop: apex 0.46 m, hang 0.61 s.
// Walk 6 m/s, eye 1.7 m. The Moon hangs in the sky ahead of you,
// 26° up — tap it to land back on the Moon.
//
// Signed-in only (same rule as /moon and Earth 2). The walker
// stands ON the Earth sphere (lib/earth-walk.js — pure, tested),
// so you can never fall through or drift off into space.
// "← Back to hub" rides the one vortex system home.
//
// NEW route, NEW files — the Earth 1 Mario Kart world (vehicles,
// orbs, missiles) is untouched: nothing here imports it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { createClient } from '@supabase/supabase-js';
import EarthWalkScene from '@/components/EarthWalkScene';
import WalkJoystick from '@/components/world/WalkJoystick';
import OrbButton from '@/components/world/OrbButton';
import { useVortexTravel } from '@/components/VortexTravel';
import { EARTH_WALK_PLANET, EARTH_WALK_SPAWN_FEET } from '@/lib/earth-walk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function EarthWalkPage() {
  const router = useRouter();
  const { travel, overlay } = useVortexTravel();
  const [auth, setAuth] = useState('checking');
  const moveRef = useRef({ x: 0, y: 0 });
  const jumpRef = useRef(false);
  const hudRef = useRef({ height: 0, grounded: true });
  const [hud, setHud] = useState({ height: 0, grounded: true });

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuth(data?.session ? 'open' : 'locked');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live altitude readout (200 ms — cheap DOM text, no canvas re-render).
  useEffect(() => {
    if (auth !== 'open') return;
    const id = setInterval(() => {
      const cur = hudRef.current;
      setHud((prev) =>
        Math.abs(prev.height - cur.height) > 0.02 || prev.grounded !== cur.grounded
          ? { height: cur.height, grounded: cur.grounded }
          : prev
      );
    }, 200);
    return () => clearInterval(id);
  }, [auth]);

  const goBack = useCallback(() => travel('/', 'Hub'), [travel]);

  // Tapping the Moon in the sky lands back on it on foot
  // (Merlin, Nov 15, 2026): the hop is a plain route change, no
  // hub detour.
  const goMoon = useCallback(() => travel('/moon', 'Moon'), [travel]);

  if (auth === 'checking') {
    return (
      <div style={{ minHeight: '100dvh', background: '#050507', color: '#fff', display: 'grid', placeItems: 'center' }}>
        <div>Checking sign-in…</div>
      </div>
    );
  }

  if (auth === 'locked') {
    return (
      <div style={{ minHeight: '100dvh', background: '#050507', color: '#fff', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🌍</div>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Earth — on foot</h1>
          <p style={{ color: '#cfe8ff', margin: '0 0 20px' }}>Sign in to walk on Earth.</p>
          <button
            onClick={() => router.push('/')}
            style={{ padding: '12px 22px', borderRadius: 999, border: '1px solid #ffd700', background: '#ffd700', color: '#111', fontWeight: 800, cursor: 'pointer' }}
          >
            ← Back to hub
          </button>
        </div>
      </div>
    );
  }

  // Spawn camera: feet + surface normal · eye height at the spawn site.
  const spawnUp = {
    x: EARTH_WALK_SPAWN_FEET.x / 55,
    y: EARTH_WALK_SPAWN_FEET.y / 55,
    z: EARTH_WALK_SPAWN_FEET.z / 55,
  };
  const spawnCam = [
    EARTH_WALK_SPAWN_FEET.x + spawnUp.x * EARTH_WALK_PLANET.eyeHeight,
    EARTH_WALK_SPAWN_FEET.y + spawnUp.y * EARTH_WALK_PLANET.eyeHeight,
    EARTH_WALK_SPAWN_FEET.z + spawnUp.z * EARTH_WALK_PLANET.eyeHeight,
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#050507', overflow: 'hidden' }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: spawnCam, fov: 60, near: 0.1, far: 1000 }}
        // The drag-look stage takes the gesture: touch-action none
        // stops iOS pull-to-refresh hijacking a downward look-drag
        // (Merlin, Nov 16, 2026 — looking down reloaded the page).
        style={{ touchAction: 'none' }}
      >
        <EarthWalkScene moveRef={moveRef} jumpRef={jumpRef} hudRef={hudRef} onMoonClick={goMoon} />
      </Canvas>

      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '14px 16px', pointerEvents: 'none',
        }}
      >
        <div style={{ color: '#fff' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>🌍 THE EARTH</div>
          <div style={{ fontSize: 12, color: '#cfe8ff', marginTop: 4 }}>
            On foot · gravity {EARTH_WALK_PLANET.gravity.toFixed(2)} m/s² — the Moon&rsquo;s is a sixth of this
          </div>
          <div style={{ fontSize: 12, color: '#ffd700', marginTop: 4, fontWeight: 700 }}>
            HEIGHT {hud.height.toFixed(1)} m · {hud.grounded ? 'GROUNDED' : 'AIRBORNE'}
          </div>
        </div>
        {/* Back to hub — a plain circle orb, never a pill: the one
            control in the top bar. The JUMP button below is already
            a plain circle. */}
        <OrbButton accent="#ffd700" onClick={goBack} ariaLabel="Back to hub"
          style={{ pointerEvents: 'auto' }}>
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>←</span>
        </OrbButton>
      </div>

      <div
        style={{
          position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center', pointerEvents: 'none',
        }}
      >
        Drag to look · WASD / arrows / stick to walk · Space or JUMP to hop · Tap the Moon to land on it
      </div>

      {/* The move stick, parked bottom-left in thumb reach, level
          with the JUMP button — the Moon's layout, copied. */}
      <div style={{ position: 'absolute', left: 18, bottom: 96 }}>
        <WalkJoystick onMove={(x, y) => { moveRef.current = { x, y }; }} />
      </div>
      <button
        aria-label="Jump"
        onPointerDown={() => {
          jumpRef.current = true;
        }}
        style={{
          position: 'absolute', right: 18, bottom: 96, width: 76, height: 76, borderRadius: '50%',
          border: '2px solid #ffd700', background: 'rgba(255,215,0,0.25)', color: '#ffd700',
          fontWeight: 800, fontSize: 15, cursor: 'pointer', touchAction: 'none',
        }}
      >
        JUMP
      </button>
      {overlay}
    </div>
  );
}
