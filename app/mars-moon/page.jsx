'use client';

// app/mars-moon/page.jsx — THE RED MOON (Merlin, Nov 17, 2026).
//
// Land on Mars's red moon from Mars 2: fly the panel fighter up
// through the atmosphere, into space, and press into the red moon
// — or tap it in space — and the pull carries you here. Walk it
// under the same low gravity as the hub Moon (1.62 m/s² — about
// a sixth of Earth's) and bounce: a jump here rises 2.78 m and
// hangs for 3.70 s. Mars hangs in the sky ahead of you, 26° up.
//
// Signed-in only (same rule as /moon and /sun-base). The walker
// stands ON the moon sphere (lib/mars2/moon.js — pure, tested),
// so you can never fall through or drift off into space.
// "← Back to Mars 2" rides the one vortex system home, and
// tapping Mars in the sky lands you back on Mars 2 on foot.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { createClient } from '@supabase/supabase-js';
import MarsMoonScene from '@/components/mars2/MarsMoonScene';
import WalkJoystick from '@/components/world/WalkJoystick';
import OrbButton from '@/components/world/OrbButton';
import { useVortexTravel } from '@/components/VortexTravel';
import { MARS_MOON_GRAVITY, MARS_MOON_SPAWN_FEET, MARS_MOON_EYE_HEIGHT } from '@/lib/mars2/moon';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function MarsMoonPage() {
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

  const goBack = useCallback(() => travel('/mars-2', 'Mars 2'), [travel]);

  // Tapping Mars in the sky lands on it on foot (the hub Moon's
  // Earth hop, same words): the hop is a plain route change to
  // Mars 2, no hub detour, no menu.
  const goMars2 = useCallback(() => travel('/mars-2', 'Mars 2'), [travel]);

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
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>The Red Moon</h1>
          <p style={{ color: '#ffb08a', margin: '0 0 20px' }}>Sign in to land on Mars&rsquo;s red moon.</p>
          <button
            onClick={() => router.push('/mars-2')}
            style={{ padding: '12px 22px', borderRadius: 999, border: '1px solid #e07840', background: '#e07840', color: '#160a04', fontWeight: 800, cursor: 'pointer' }}
          >← Back to Mars 2</button>
        </div>
      </div>
    );
  }

  // Spawn camera: feet + surface normal · eye height at the spawn site.
  const spawnUp = {
    x: MARS_MOON_SPAWN_FEET.x / 14,
    y: MARS_MOON_SPAWN_FEET.y / 14,
    z: MARS_MOON_SPAWN_FEET.z / 14,
  };
  const spawnCam = [
    MARS_MOON_SPAWN_FEET.x + spawnUp.x * MARS_MOON_EYE_HEIGHT,
    MARS_MOON_SPAWN_FEET.y + spawnUp.y * MARS_MOON_EYE_HEIGHT,
    MARS_MOON_SPAWN_FEET.z + spawnUp.z * MARS_MOON_EYE_HEIGHT,
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#050507', overflow: 'hidden' }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: spawnCam, fov: 60, near: 0.1, far: 1000 }}
        style={{ touchAction: 'none' }}
      >
        <MarsMoonScene moveRef={moveRef} jumpRef={jumpRef} hudRef={hudRef} onMarsClick={goMars2} />
      </Canvas>

      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '14px 16px', pointerEvents: 'none',
        }}
      >
        <div style={{ color: '#fff' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>☾ THE RED MOON</div>
          <div style={{ fontSize: 12, color: '#ffb08a', marginTop: 4 }}>
            Mars&rsquo;s moon · gravity {MARS_MOON_GRAVITY.toFixed(2)} m/s² — about a sixth of Earth&rsquo;s
          </div>
          <div style={{ fontSize: 12, color: '#e07840', marginTop: 4, fontWeight: 700 }}>
            HEIGHT {hud.height.toFixed(1)} m · {hud.grounded ? 'GROUNDED' : 'AIRBORNE'}
          </div>
        </div>
        {/* Back to Mars 2 — a plain circle orb, never a pill. */}
        <OrbButton accent="#e07840" onClick={goBack} ariaLabel="Back to Mars 2"
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
        Drag to look · WASD / arrows / stick to walk · Space or JUMP to bounce · Tap Mars to land on it
      </div>

      <div style={{ position: 'absolute', left: 18, bottom: 96 }}>
        <WalkJoystick onMove={(x, y) => { moveRef.current = { x, y }; }} />
      </div>
      <div style={{ position: 'absolute', right: 18, bottom: 96 }}>
        <OrbButton fn="jump" accent="#e07840" size={76} ariaLabel="Jump"
          onPointerDown={() => { jumpRef.current = true; }} />
      </div>
      {overlay}
    </div>
  );
}
