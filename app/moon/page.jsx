'use client';

// app/moon/page.jsx — THE MOON (Merlin, Nov 13, 2026).
//
// Land on the Moon from the hub: click it or fly into it and the
// vortex carries you here. Walk it under real lunar gravity
// (1.62 m/s² — about a sixth of Earth's) and bounce: a jump here
// rises 2.78 m and hangs for 3.70 s, against 0.46 m / 0.61 s on
// Earth. Earth hangs in the sky ahead of the landing pad, 26° up.
//
// Signed-in only (same rule as /sun-base and Earth 2). The walker
// stands ON the Moon sphere (lib/moon.js — pure, tested), so you
// can never fall through or drift off into space. "← Back to hub"
// rides the one vortex system home.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { createClient } from '@supabase/supabase-js';
import MoonScene from '@/components/MoonScene';
import WalkJoystick from '@/components/world/WalkJoystick';
import { useVortexTravel } from '@/components/VortexTravel';
import { MOON_GRAVITY, MOON_SPAWN_FEET, MOON_EYE_HEIGHT } from '@/lib/moon';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function MoonPage() {
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

  // Clicking Earth in the sky opens the Earth menu (Merlin, Nov 15,
  // 2026): vortex ride home, landing with the hub's ?enter=earth
  // deep link — the hub opens its Earth chooser (Earth 1/2/3/4) on
  // arrival, exactly as if the Earth planet had been tapped there.
  const goEarthMenu = useCallback(() => travel('/?enter=earth', 'Earth'), [travel]);

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
          <div style={{ fontSize: 44, marginBottom: 12 }}>☾</div>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>The Moon</h1>
          <p style={{ color: '#cfe8ff', margin: '0 0 20px' }}>Sign in to land on the Moon.</p>
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
    x: MOON_SPAWN_FEET.x / 14,
    y: MOON_SPAWN_FEET.y / 14,
    z: MOON_SPAWN_FEET.z / 14,
  };
  const spawnCam = [
    MOON_SPAWN_FEET.x + spawnUp.x * MOON_EYE_HEIGHT,
    MOON_SPAWN_FEET.y + spawnUp.y * MOON_EYE_HEIGHT,
    MOON_SPAWN_FEET.z + spawnUp.z * MOON_EYE_HEIGHT,
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#050507', overflow: 'hidden' }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: spawnCam, fov: 60, near: 0.1, far: 1000 }}
      >
        <MoonScene moveRef={moveRef} jumpRef={jumpRef} hudRef={hudRef} onEarthClick={goEarthMenu} />
      </Canvas>

      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '14px 16px', pointerEvents: 'none',
        }}
      >
        <div style={{ color: '#fff' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>☾ THE MOON</div>
          <div style={{ fontSize: 12, color: '#cfe8ff', marginTop: 4 }}>
            Lunar landing · gravity {MOON_GRAVITY.toFixed(2)} m/s² — about a sixth of Earth&rsquo;s
          </div>
          <div style={{ fontSize: 12, color: '#ffd700', marginTop: 4, fontWeight: 700 }}>
            HEIGHT {hud.height.toFixed(1)} m · {hud.grounded ? 'GROUNDED' : 'AIRBORNE'}
          </div>
        </div>
        <button
          onClick={goBack}
          style={{
            pointerEvents: 'auto', padding: '10px 16px', borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.45)',
            color: '#fff', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(6px)',
          }}
        >
          ← Back to hub
        </button>
      </div>

      <div
        style={{
          position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center', pointerEvents: 'none',
        }}
      >
        Drag to look · WASD / arrows / stick to walk · Space or JUMP to bounce · Earth hangs ahead of the landing pad
      </div>

      <WalkJoystick onMove={(x, y) => { moveRef.current = { x, y }; }} />
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
