// app/tiangong/page.jsx — TIANGONG: The Celestial Palace — jade terraces, peach gardens, and the Silver River.
//
// BASE SHELL (Merlin, Nov 12, 2026): the world only — bright sky,
// The Silver River, The Southern Heaven Gate, The Celestial Palace, the three regions, the entry
// portal, and five portal arches to realms that already exist.
// Peaches in the Peach Gardens are pickable (Merlin, Nov 15,
// 2026) — the garden's first mechanic: a picked peach lands in
// the backpack under Other. No sound engine in the page — that
// system plugs in separately later.
//
// First-person walk. WebGL via @react-three/fiber + drei (the Erebus /
// Cerberus stack), SceneContextGuard on the canvas, vortex travel on
// the arches (the Styx pattern). Plain-English HUD, mobile-first:
// touch stick on the left, drag-to-look on the right, no desktop-only
// controls. Reduced motion respected.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Canvas } from '@react-three/fiber';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { useVortexTravel } from '@/components/VortexTravel';
import { useRealmInfoFade } from '@/components/useRealmInfoFade';
import { RealmLifeLine } from '@/components/RealmLifeLine';
import { TiangongScene } from './world3d';
import { PORTALS, SPAWN } from '@/lib/tiangong/world';
import {
  availablePeaches,
  emptyPeachState,
  peachItem,
  pickPeach,
  sanitizePeachState,
  PEACH_STORAGE_KEY,
} from '@/lib/tiangong/peaches';
import { addItem } from '@/lib/backpack/backpack';
import { updateBackpack } from '@/lib/backpack/store';

const STICK_RADIUS = 60;

export default function TiangongPage() {
  const sceneGuard = useSceneContextGuard({ label: 'TIANGONG' });
  const { travel, overlay: vortexOverlay } = useVortexTravel();

  const playerRef = useRef({ x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw });
  const inputRef = useRef({ fwd: 0, strafe: 0, run: false, lookDx: 0 });
  const keysRef = useRef(new Set());
  const dragRef = useRef({ active: false, lastX: 0 });
  const stickRef = useRef({ id: null, ox: 0, oy: 0 });
  const lookTouchRef = useRef({ id: null, lastX: 0 });

  const [region, setRegion] = useState('The Celestial Gate');
  const regionRef = useRef(region);
  const [touchUI, setTouchUI] = useState(false);
  const [reduced, setReduced] = useState(false);
  const { infoHidden, fadeInfo, restoreInfo, infoStyle } = useRealmInfoFade({ reduced });
  const [stick, setStick] = useState({ dx: 0, dy: 0, active: false });

  // PEACHES (Merlin, 2026-11-15): the garden's pick state is
  // device-local (three peaches, each regrowing a day after
  // being picked — lib/tiangong/peaches.js). nearPeach is the
  // standing peach within reach, offered by the scene's rig.
  const [peachState, setPeachState] = useState(() => emptyPeachState());
  const [nearPeach, setNearPeach] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimerRef = useRef(null);

  const savePeachState = useCallback((next) => {
    setPeachState(next);
    try { localStorage.setItem(PEACH_STORAGE_KEY, JSON.stringify(next)); } catch { /* on-device only */ }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PEACH_STORAGE_KEY);
      if (raw) setPeachState(sanitizePeachState(JSON.parse(raw)));
    } catch { /* a fresh garden stands */ }
    return () => { if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); };
  }, []);

  const onPeachNearby = useCallback((spot) => {
    setNearPeach(spot);
  }, []);

  // Pick the peach within reach: it lands in the backpack under
  // Other (kind 'other' — the backpack is the cross-realm
  // carrier), and the spot regrows in a day.
  const pickNearbyPeach = useCallback(() => {
    if (!nearPeach) return;
    const res = pickPeach(peachState, nearPeach.id, Date.now());
    if (!res.ok) return;
    savePeachState(res.state);
    try {
      updateBackpack((rec) => addItem(rec, peachItem(1)));
    } catch { /* pack unavailable — the peach still regrows */ }
    setNearPeach(null);
    setNotice('🍑 Peach of Long Life added to your backpack (Other).');
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  }, [nearPeach, peachState, savePeachState]);

  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  useEffect(() => {
    try {
      setTouchUI(navigator.maxTouchPoints > 0);
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch { /* desktop defaults stand */ }
  }, []);

  // Headless probe hook: window.__tiangong.player / .region / .teleport.
  // teleport() is test instrumentation only (the probe places the player
  // near an arch to prove vortex travel without a two-minute walk at
  // swiftshader frame rates); it changes nothing about the real game.
  useEffect(() => {
    try {
      window.__tiangong = {
        ready: true,
        portals: PORTALS,
        get player() { return { ...playerRef.current }; },
        get region() { return regionRef.current; },
        teleport(x, z) {
          playerRef.current.x = x;
          playerRef.current.z = z;
        },
      };
    } catch { /* probe hook is best-effort */ }
  }, []);

  const applyKeys = useCallback(() => {
    const k = keysRef.current;
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const strafe = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    inputRef.current.fwd = fwd;
    inputRef.current.strafe = strafe;
    inputRef.current.run = k.has('shift');
  }, []);

  useEffect(() => {
    const down = (e) => {
      const key = String(e.key || '').toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
        applyKeys();
      }
    };
    const up = (e) => {
      keysRef.current.delete(String(e.key || '').toLowerCase());
      applyKeys();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [applyKeys]);

  const onPortal = useCallback((portal) => {
    travel(portal.route, portal.label);
  }, [travel]);

  const onRegion = useCallback((name) => {
    setRegion(name);
  }, []);

  // --- mouse drag to look (desktop) ---------------------------------------
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return;
    dragRef.current = { active: true, lastX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.active || e.pointerType !== 'mouse') return;
    inputRef.current.lookDx += e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;
  };
  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  // --- touch stick (left) + drag-to-look (right) ---------------------------
  const onStickStart = (e) => {
    const t = e.changedTouches[0];
    if (!t || stickRef.current.id !== null) return;
    stickRef.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
    setStick({ dx: 0, dy: 0, active: true });
  };
  const onStickMove = (e) => {
    const s = stickRef.current;
    if (s.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== s.id) continue;
      let dx = t.clientX - s.ox;
      let dy = t.clientY - s.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      inputRef.current.strafe = dx / STICK_RADIUS;
      inputRef.current.fwd = -dy / STICK_RADIUS;
      setStick({ dx, dy, active: true });
    }
  };
  const onStickEnd = (e) => {
    const s = stickRef.current;
    if (s.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== s.id) continue;
      stickRef.current = { id: null, ox: 0, oy: 0 };
      inputRef.current.strafe = 0;
      inputRef.current.fwd = 0;
      setStick({ dx: 0, dy: 0, active: false });
    }
  };
  const onLookStart = (e) => {
    const t = e.changedTouches[0];
    if (!t || lookTouchRef.current.id !== null) return;
    lookTouchRef.current = { id: t.identifier, lastX: t.clientX };
  };
  const onLookMove = (e) => {
    const l = lookTouchRef.current;
    if (l.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== l.id) continue;
      inputRef.current.lookDx += t.clientX - l.lastX;
      lookTouchRef.current.lastX = t.clientX;
    }
  };
  const onLookEnd = (e) => {
    const l = lookTouchRef.current;
    if (l.id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== l.id) continue;
      lookTouchRef.current = { id: null, lastX: 0 };
    }
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white" style={{ touchAction: 'none' }} onPointerDown={fadeInfo}>
      {/* 3D world */}
      <div
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          camera={{ fov: 60, near: 0.1, far: 900, position: [SPAWN.x, 2.4, SPAWN.z] }}
          onCreated={sceneGuard.onCreated}
          style={{ width: '100%', height: '100%' }}
        >
          <TiangongScene
            playerRef={playerRef}
            inputRef={inputRef}
            onPortal={onPortal}
            onRegion={onRegion}
            reduced={reduced}
            peaches={availablePeaches(peachState)}
            onPeachNearby={onPeachNearby}
          />
        </Canvas>
      </div>

      {/* touch controls: left stick walks, right side drag looks */}
      {touchUI && (
        <>
          <div
            className="absolute bottom-0 left-0 z-10 h-[45%] w-[45%]"
            style={{ touchAction: 'none' }}
            onTouchStart={onStickStart}
            onTouchMove={onStickMove}
            onTouchEnd={onStickEnd}
            onTouchCancel={onStickEnd}
          >
            <div
              className="absolute bottom-24 left-8 h-28 w-28 rounded-full border-2 border-white/25 bg-white/5"
              style={{ touchAction: 'none' }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/35"
                style={{
                  transform: `translate(calc(-50% + ${stick.dx}px), calc(-50% + ${stick.dy}px))`,
                }}
              />
            </div>
          </div>
          <div
            className="absolute bottom-0 right-0 z-10 h-[45%] w-[55%]"
            style={{ touchAction: 'none' }}
            onTouchStart={onLookStart}
            onTouchMove={onLookMove}
            onTouchEnd={onLookEnd}
            onTouchCancel={onLookEnd}
          />
        </>
      )}

      {/* HUD — plain English, nothing overlaps anything else. The title
          sits below the Leave button (pt-16); the hint sits above the
          global radio bar (bottom-20); the stick sits above it too. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-4 pt-16 text-center" style={infoStyle} aria-hidden={infoHidden}>
        <h1 className="text-2xl font-bold tracking-[0.3em] text-amber-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          TIANGONG
        </h1>
        <p className="mt-1 text-sm text-stone-100 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          The Celestial Palace — jade terraces, peach gardens, and the Silver River.
        </p>
        <p className="mt-1 text-sm font-semibold text-amber-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          You are in: {region}
        </p>
        <p className="mt-3 rounded-full bg-black/55 px-4 py-2 text-xs text-stone-200">
          {touchUI
            ? 'Left stick to walk · drag the right side to look around · walk through a glowing arch to travel'
            : 'WASD or arrows to walk · drag to look around · Shift to run · walk through a glowing arch to travel'}
        </p>
        <RealmLifeLine realmKey="tiangong" />
      </div>

      <div className="absolute left-4 top-4 z-30">
        <Link
          href="/"
          className="pointer-events-auto inline-block rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
        >
          ← Leave Tiangong
        </Link>
      </div>

      {/* Peach pick — the egg-steal pattern: a top-centre button
          appears when a peach is within reach (6 m); one tap
          picks it into the backpack. The notice confirms the
          landing, then clears itself. */}
      {nearPeach && (
        <button
          type="button"
          onClick={pickNearbyPeach}
          className="absolute left-1/2 top-[9.5rem] z-30 -translate-x-1/2 rounded-full border border-amber-200/60 bg-black/70 px-5 py-3 text-sm font-bold text-amber-100"
          aria-label="Pick the peach of long life"
        >
          🍑 Pick peach
        </button>
      )}
      {notice && (
        <p className="absolute left-1/2 top-[13rem] z-30 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-xs text-stone-100" role="status">
          {notice}
        </p>
      )}

      {/* Realm info restore — the faded HUD comes back with one tap. */}
      {infoHidden && (
        <button
          type="button"
          aria-label="Show realm information"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={restoreInfo}
          className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-white/30 bg-black/60 px-3 py-1 text-xs font-semibold text-white"
        >
          ⓘ Info
        </button>
      )}

      {vortexOverlay}
    </main>
  );
}
