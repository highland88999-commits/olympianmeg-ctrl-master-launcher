'use client';

// app/sun-base/page.jsx — THE SUN BASE (Merlin, Nov 13, 2026).
//
// A base for each user inside the sun. Entry is the hub sun itself
// (components/HomeScene.jsx SunBackground): click it and you are
// PULLED in, or fly through it — either way the pull lands here,
// inside your own room.
//
// THE ROOM: one of the 3 reserved interiors
// (lib/earth2/fittings.js RESERVED_SUN_BASE_INTERIORS). First entry
// asks which of the three is yours; the pick persists device-local
// (lib/sun-base.js — the portal-progress pattern). Change it any
// time from inside the base.
//
// THE GATE: signed-in accounts only (the Earth 2 rule, 2026-10-31:
// signed-out visitors get a plain locked screen, never the room).
// No menu entry: the sun in the hub is the door — menus stay
// untouched (dual-registry rule: nothing half-registered).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { supabase } from '@/lib/supabase';
import SunBaseScene from '@/components/SunBaseScene';
import WalkJoystick from '@/components/world/WalkJoystick';
import {
  SUN_BASE_OPTIONS,
  SUN_BASE_OPTION_LABELS,
  loadSunBasePick,
  saveSunBasePick,
} from '@/lib/sun-base';
import { sunBaseSpecFor } from '@/lib/sun-base-spec';

const GOLD = '#ffd98a';

export default function SunBasePage() {
  const router = useRouter();
  const [gate, setGate] = useState('checking'); // 'checking' | 'open' | 'locked'
  const [pick, setPick] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const moveRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setGate(data?.session?.user ? 'open' : 'locked');
      })
      .catch(() => {
        if (alive) setGate('locked');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (gate !== 'open') return;
    setPick(loadSunBasePick());
    setLoaded(true);
  }, [gate]);

  const spec = useMemo(() => (pick ? sunBaseSpecFor(pick) : null), [pick]);
  const label = pick ? SUN_BASE_OPTION_LABELS[pick] || 'Base' : 'Base';

  const choose = useCallback((assetId) => {
    saveSunBasePick(assetId);
    setPick(assetId);
    setShowPicker(false);
  }, []);

  const pickerOpen = loaded && gate === 'open' && (showPicker || !pick);

  if (gate === 'checking') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#140c02', color: GOLD }}>
        <p style={{ fontSize: 15, opacity: 0.85 }}>Warming up your sun base…</p>
      </div>
    );
  }

  if (gate === 'locked') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', background: 'radial-gradient(90% 90% at 50% 20%, #3a2404 0%, #140c02 70%)', color: '#ffe9c4' }}>
        <div style={{ fontSize: 40 }}>☀️</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Your sun base is inside the sun</h1>
        <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 420 }}>
          Sign in to claim it — one base per account, yours to pick and keep.
        </p>
        <button
          type="button"
          onClick={() => router.push('/')}
          style={{ marginTop: 8, padding: '10px 22px', borderRadius: 999, cursor: 'pointer', background: GOLD, color: '#140c02', fontSize: 14, fontWeight: 800, border: 'none', fontFamily: 'inherit' }}
        >
          ← Back to the hub
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', background: '#1c0f02', color: '#ffe9c4', overflow: 'hidden' }}>
      {/* The room itself (only once a pick exists and resolves). */}
      {spec && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Canvas
            camera={{ position: [0, 1.7, -0.5], fov: 60, near: 0.1, far: 100 }}
            dpr={[1, 1.75]}
            style={{ touchAction: 'none' }}
          >
            <SunBaseScene spec={spec} moveRef={moveRef} />
          </Canvas>
        </div>
      )}
      {!spec && loaded && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(90% 90% at 50% 20%, #3a2404 0%, #140c02 70%)' }} />
      )}

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 16px', pointerEvents: 'none' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.28em', color: GOLD }}>☀ SUN BASE</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
            {spec ? `${label} — your base inside the sun` : 'Pick your base'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {spec && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              style={{ padding: '9px 16px', borderRadius: 999, cursor: 'pointer', background: 'rgba(255,217,138,0.16)', color: '#ffe9c4', fontSize: 13, fontWeight: 700, border: `1px solid ${GOLD}66`, fontFamily: 'inherit' }}
            >
              Change interior
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/')}
            style={{ padding: '9px 16px', borderRadius: 999, cursor: 'pointer', background: GOLD, color: '#140c02', fontSize: 13, fontWeight: 800, border: 'none', fontFamily: 'inherit' }}
          >
            ← Back to hub
          </button>
        </div>
      </div>

      {/* Walk controls (only while standing in the room). */}
      {spec && !pickerOpen && (
        <>
          <div style={{ position: 'absolute', left: 16, bottom: 16 }}>
            <WalkJoystick onMove={(x, y) => { moveRef.current = { x, y }; }} />
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, textAlign: 'center', fontSize: 12, opacity: 0.7, pointerEvents: 'none' }}>
            Drag to look · WASD / arrows / stick to walk
          </div>
        </>
      )}

      {/* Interior picker — first entry, or "Change interior". */}
      {pickerOpen && (
        <div role="dialog" aria-label="Pick your sun base interior" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20, background: 'rgba(20,12,2,0.88)', backdropFilter: 'blur(2px)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.28em', color: GOLD }}>☀ YOUR SUN BASE</div>
            <h2 style={{ fontSize: 'clamp(1.4rem, 6vw, 2rem)', fontWeight: 800, margin: '8px 0 4px' }}>
              {pick ? 'Change your interior' : 'Pick your interior'}
            </h2>
            <p style={{ fontSize: 14, opacity: 0.85, margin: 0 }}>
              One of three rooms lives inside your sun. Pick one — you can change it any time.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 720 }}>
            {SUN_BASE_OPTIONS.map((opt) => {
              const s = sunBaseSpecFor(opt.assetId);
              const size = s ? `${s.widthM} × ${s.depthM} m room` : '';
              const active = pick === opt.assetId;
              return (
                <button
                  key={opt.assetId}
                  type="button"
                  onClick={() => choose(opt.assetId)}
                  style={{
                    flex: '0 1 200px', textAlign: 'left', cursor: 'pointer', borderRadius: 16, padding: '16px 16px 14px',
                    color: '#ffe9c4', fontFamily: 'inherit',
                    background: active ? 'rgba(255,217,138,0.22)' : 'linear-gradient(165deg, rgba(255,217,138,0.14) 0%, rgba(8,8,16,0.85) 60%)',
                    border: `1px solid ${active ? GOLD : `${GOLD}55`}`,
                    boxShadow: `0 0 24px rgba(255,217,138,${active ? 0.35 : 0.15})`,
                  }}
                >
                  <span style={{ display: 'block', width: 14, height: 14, borderRadius: 999, background: s ? s.lightColor : GOLD, boxShadow: `0 0 12px ${s ? s.lightColor : GOLD}` }} />
                  <span style={{ display: 'block', fontSize: 18, fontWeight: 800, marginTop: 10 }}>
                    {SUN_BASE_OPTION_LABELS[opt.assetId] || opt.class}
                  </span>
                  <span style={{ display: 'block', fontSize: 13, opacity: 0.85, marginTop: 4, lineHeight: 1.4 }}>{opt.why}</span>
                  {size && <span style={{ display: 'block', fontSize: 12, opacity: 0.7, marginTop: 8 }}>{size}</span>}
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, marginTop: 10, color: GOLD }}>
                    {active ? 'Your current base ✓' : 'Make it mine →'}
                  </span>
                </button>
              );
            })}
          </div>
          {pick && (
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              style={{ padding: '10px 22px', borderRadius: 999, cursor: 'pointer', background: 'transparent', color: '#ffe9c4', fontSize: 14, fontWeight: 700, border: `1px solid ${GOLD}66`, fontFamily: 'inherit' }}
            >
              ← Keep my {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
