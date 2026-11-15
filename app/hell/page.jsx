// app/hell/page.jsx — HELL: the world itself, base shell only.
//
// BASE SHELL (Merlin, Nov 12, 2026): Abandon all hope — the pit, the burning plain, and the frozen deep.
// TRANCHE 1 (Merlin, Nov 15 ~02:15): the souls spine lands here —
// the Lake of Fire forge, Charon's ferry, soul-guiding. No trial,
// no judgment, no wheel — those come later. First-person walk. WebGL via @react-three/fiber + drei (the
// Erebus / Cerberus stack), SceneContextGuard on the canvas, vortex
// travel on the arches (the Styx pattern). Plain-English HUD,
// mobile-first: touch stick on the left, drag-to-look on the right, no
// desktop-only controls. Reduced motion respected.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Canvas } from '@react-three/fiber';
import { useSceneContextGuard } from '@/components/SceneContextGuard';
import { useVortexTravel } from '@/components/VortexTravel';
import { useRealmInfoFade } from '@/components/useRealmInfoFade';
import { RealmLifeLine } from '@/components/RealmLifeLine';
import { HellScene } from './world3d';
import { PORTALS, RIVER, SPAWN } from '@/lib/hell/world';
import { ANTI_LIFE_PORTAL_NAME, ANTI_LIFE_ROUTE } from '@/lib/afterlife/anti-life-portal';
import {
  clearPendingReconcile,
  deviceId,
  newNonce,
  readLocalDutchmanSouls,
  readPendingReconcile,
  recordRealmVisit,
  reduceLocalDutchmanSouls,
  soulsApi,
  writePendingReconcile,
} from '@/lib/afterlife/souls';
import { FORGE_AETHER_DAILY_CAP, forgeRateText } from '@/lib/afterlife/forge';
import { LAKE_RESPAWN, consumeLakeLanding } from '@/lib/ghost-rider/chain';
import { FERRY_FARE_GOLD, ferryLanding } from '@/lib/afterlife/ferry';

const STICK_RADIUS = 60;

export default function HellPage() {
  const sceneGuard = useSceneContextGuard({ label: 'HELL' });
  const { travel, overlay: vortexOverlay } = useVortexTravel();

  const playerRef = useRef({ x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw });
  const inputRef = useRef({ fwd: 0, strafe: 0, run: false, lookDx: 0 });
  const keysRef = useRef(new Set());
  const dragRef = useRef({ active: false, lastX: 0 });
  const stickRef = useRef({ id: null, ox: 0, oy: 0 });
  const lookTouchRef = useRef({ id: null, lastX: 0 });

  const [region, setRegion] = useState('The Descent');
  const regionRef = useRef(region);
  const [touchUI, setTouchUI] = useState(false);
  const [reduced, setReduced] = useState(false);
  const { infoHidden, fadeInfo, restoreInfo, infoStyle } = useRealmInfoFade({ reduced });
  const [stick, setStick] = useState({ dx: 0, dy: 0, active: false });

  // THE SPINE (Merlin, Nov 15 ~02:15, tranche 1): souls are the
  // underworld currency. souls is null until the ledger answers;
  // soulsLive is false while the souls SQL has not run yet
  // (the forge/guide actions then pause honestly — nothing is
  // fake-credited). notice is one plain-English line, auto-cleared.
  const [souls, setSouls] = useState(null);
  const [soulsLive, setSoulsLive] = useState(false);
  const [notice, setNotice] = useState(null);
  const [forgeFlash, setForgeFlash] = useState(0);
  const [ferryZone, setFerryZone] = useState(false);
  const [guidable, setGuidable] = useState(null);
  const [guiding, setGuiding] = useState(null);
  const [deliveredIds, setDeliveredIds] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Record the visit (the ferry's fast-travel list), read the soul
  // balance, and reconcile any device-local Dutchman souls into
  // the server ledger. Signed out or ledger-not-live: the local
  // souls simply wait — nothing is lost, nothing is faked.
  useEffect(() => {
    // GHOST RIDER CHAIN (Merlin, 2026-11-15): a victim burned by the
    // flaming chain respawns in the Lake of Fire — the victim's
    // client sets the lake-landing flag before travelling here, and
    // this mount lands them at the lake's rim instead of the
    // Descent. The flag is consumed once; a plain visit is untouched.
    try {
      if (consumeLakeLanding(window.localStorage)) {
        playerRef.current.x = LAKE_RESPAWN.x;
        playerRef.current.z = LAKE_RESPAWN.z;
        playerRef.current.yaw = LAKE_RESPAWN.yaw;
        setRegion('The Lake of Fire');
        setNotice({ text: '🔥 The chain burned you to ash — you wake in the Lake of Fire. Find your way out.', tone: 'bad' });
      }
    } catch { /* the Descent stands */ }
    recordRealmVisit('hell');
    let cancelled = false;
    (async () => {
      const res = await soulsApi('/api/afterlife/souls');
      if (cancelled) return;
      if (res.ok) {
        setSouls(res.data.souls);
        setSoulsLive(true);
        const pending = readPendingReconcile();
        const local = readLocalDutchmanSouls();
        const job = pending || (local > 0 ? { nonce: newNonce(), deviceId: deviceId(), amount: local } : null);
        if (!job) return;
        writePendingReconcile(job);
        const rec = await soulsApi('/api/afterlife/souls', {
          method: 'POST',
          body: { action: 'reconcile', localSouls: job.amount, nonce: job.nonce, deviceId: job.deviceId },
        });
        if (cancelled) return;
        if (rec.ok || rec.data?.wasDuplicate) {
          reduceLocalDutchmanSouls(job.amount);
          clearPendingReconcile();
          if (typeof rec.data?.souls === 'number') setSouls(rec.data.souls);
          if (rec.ok && !rec.data?.wasDuplicate) {
            setNotice({ text: `${job.amount} Dutchman soul${job.amount === 1 ? '' : 's'} joined the underworld ledger.`, tone: 'good' });
          }
        }
        // On failure the pending row stays — the next visit retries.
      } else if (res.data?.reason === 'souls_setup_required') {
        setSoulsLive(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      setTouchUI(navigator.maxTouchPoints > 0);
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch { /* desktop defaults stand */ }
  }, []);

  // Headless probe hook: window.__hell.player / .region / .teleport.
  // teleport() is test instrumentation only (the probe places the player
  // near an arch to prove vortex travel without a two-minute walk at
  // swiftshader frame rates); it changes nothing about the real game.
  useEffect(() => {
    try {
      window.__hell = {
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
  // ANTI-LIFE PORTAL (Merlin, 2026-11-15): the fall-through floor
  // portal in this realm drops the walker into Anti-Life — where the
  // 10-minute decay effect is granted. Same vortex travel as the
  // arches; the tube is the fall.
  const onAntiLife = useCallback(() => {
    travel(ANTI_LIFE_ROUTE, ANTI_LIFE_PORTAL_NAME);
  }, [travel]);

  const onRegion = useCallback((name) => {
    setRegion(name);
  }, []);

  // --- the spine: forge, ferry, guide ------------------------------------
  // The scene calls these on change (ferry zone, guidable soul) or on
  // the moment (delivery, broken guide) — the page owns the money.

  const castSoul = useCallback(async () => {
    if (busy) return;
    setBusy('forge');
    try {
      const res = await soulsApi('/api/afterlife/forge', { method: 'POST', body: { nonce: newNonce() } });
      if (res.ok) {
        setSouls(res.data.souls);
        setForgeFlash((n) => n + 1);
        setNotice({ text: `+1 aether — the fire burns the damned part away. (${res.data.souls} souls left.)`, tone: 'good' });
      } else if (res.data?.reason === 'aether_cap_reached') {
        setNotice({ text: `The day's aether is spent — ${FORGE_AETHER_DAILY_CAP} a day, shared with the gold refinery. Your soul stays with you.`, tone: 'bad' });
      } else if (res.data?.reason === 'no_souls') {
        setNotice({ text: 'You carry no souls to cast. Guide a fading soul to its rest first.', tone: 'bad' });
      } else if (res.data?.reason === 'souls_setup_required') {
        setSoulsLive(false);
        setNotice({ text: 'The underworld ledger is still waking — the forge opens when it is live.', tone: 'info' });
      } else if (res.status === 401) {
        setNotice({ text: 'Sign in to cast a soul into the fire.', tone: 'bad' });
      } else {
        setNotice({ text: 'The fire did not take. Try again.', tone: 'bad' });
      }
    } catch {
      setNotice({ text: 'The fire did not take. Try again.', tone: 'bad' });
    }
    setBusy(null);
  }, [busy]);

  const ferryCross = useCallback(async () => {
    if (busy) return;
    setBusy('ferry');
    try {
      const res = await soulsApi('/api/afterlife/ferry', { method: 'POST', body: { kind: 'cross', nonce: newNonce() } });
      if (res.ok) {
        const landing = ferryLanding(RIVER, playerRef.current.x, playerRef.current.z);
        if (landing) {
          playerRef.current.x = landing.x;
          playerRef.current.z = landing.z;
        }
        setNotice({ text: `Charon ferries you across — ${FERRY_FARE_GOLD} gold. (${res.data.gold} gold left.)`, tone: 'good' });
      } else if (res.data?.reason === 'not_enough_gold') {
        setNotice({ text: 'Not enough gold — the ferry costs 1 gold.', tone: 'bad' });
      } else if (res.status === 401) {
        setNotice({ text: 'Sign in to ride the ferry.', tone: 'bad' });
      } else {
        setNotice({ text: 'Charon did not come. Try again.', tone: 'bad' });
      }
    } catch {
      setNotice({ text: 'Charon did not come. Try again.', tone: 'bad' });
    }
    setBusy(null);
  }, [busy]);

  const startGuide = useCallback(() => {
    if (!guidable || guiding) return;
    setGuiding(guidable);
    setGuidable(null);
    setNotice({ text: 'Walk the soul to the river bank — do not run off and lose it.', tone: 'info' });
  }, [guidable, guiding]);

  const onDelivered = useCallback(async (g) => {
    setGuiding(null);
    if (busy) return;
    setBusy('guide');
    try {
      const res = await soulsApi('/api/afterlife/guide', {
        method: 'POST',
        body: { realm: 'hell', soulId: g.id, generation: g.generation, nonce: newNonce() },
      });
      if (res.ok) {
        setDeliveredIds((ids) => [...ids, g.id]);
        setSouls(res.data.souls);
        setNotice({ text: '+1 soul — the shade rests. The fire will take it, if you wish.', tone: 'good' });
      } else if (res.data?.reason === 'soul_passed_on') {
        setDeliveredIds((ids) => [...ids, g.id]);
        setNotice({ text: 'That soul has already passed on.', tone: 'info' });
      } else if (res.data?.reason === 'souls_setup_required') {
        setSoulsLive(false);
        setNotice({ text: 'The underworld ledger is still waking — the soul waits with you.', tone: 'info' });
      } else if (res.status === 401) {
        setNotice({ text: 'Sign in to bank a guided soul.', tone: 'bad' });
      } else {
        setNotice({ text: 'The soul slipped away. Try again.', tone: 'bad' });
      }
    } catch {
      setNotice({ text: 'The soul slipped away. Try again.', tone: 'bad' });
    }
    setBusy(null);
  }, [busy]);

  const onGuideBroken = useCallback(() => {
    setGuiding(null);
    setNotice({ text: 'The soul lost you — it drifts back to where it was.', tone: 'info' });
  }, []);

  const onFerryZone = useCallback((near) => {
    setFerryZone(near);
  }, []);

  const onGuidable = useCallback((g) => {
    setGuidable(g);
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
          <HellScene
            playerRef={playerRef}
            inputRef={inputRef}
            onPortal={onPortal}
            onAntiLife={onAntiLife}
            onRegion={onRegion}
            reduced={reduced}
            guiding={guiding}
            deliveredIds={deliveredIds}
            forgeFlash={forgeFlash}
            onFerryZone={onFerryZone}
            onGuidable={onGuidable}
            onGuideBroken={onGuideBroken}
            onDelivered={onDelivered}
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
        <h1 className="text-2xl font-bold tracking-[0.3em] text-red-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          HELL
        </h1>
        <p className="mt-1 text-sm text-stone-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          Abandon all hope — the pit, the burning plain, and the frozen deep.
        </p>
        <p className="mt-1 text-sm font-semibold text-amber-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          You are in: {region}
        </p>
        {soulsLive && (
          <p className="mt-1 text-sm text-violet-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            Souls carried: {souls ?? 0}
          </p>
        )}
        <p className="mt-3 rounded-full bg-black/55 px-4 py-2 text-xs text-stone-200">
          {touchUI
            ? 'Left stick to walk · drag the right side to look around · walk through a glowing arch to travel · step onto the dark Anti-Life disc to fall through'
            : 'WASD or arrows to walk · drag to look around · Shift to run · walk through a glowing arch to travel · step onto the dark Anti-Life disc to fall through'}
        </p>
        {/* The spine: one plain button per deed, only where the deed
            lives. Forge at the Lake of Fire, Charon at the river, the
            guide where a fading soul stands near. */}
        {(region === 'The Lake of Fire' || ferryZone || guidable || guiding) && (
          <div className="pointer-events-auto mt-3 flex flex-col items-center gap-2">
            {region === 'The Lake of Fire' && (
              <button
                type="button"
                onClick={castSoul}
                disabled={busy === 'forge'}
                className="rounded-full border border-orange-400/60 bg-black/60 px-4 py-2 text-sm font-semibold text-orange-200 disabled:opacity-50"
              >
                🔥 Cast a soul into the fire — {forgeRateText()}
              </button>
            )}
            {ferryZone && !guiding && (
              <button
                type="button"
                onClick={ferryCross}
                disabled={busy === 'ferry'}
                className="rounded-full border border-amber-300/60 bg-black/60 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-50"
              >
                ⛴ Call Charon — cross for {FERRY_FARE_GOLD} gold
              </button>
            )}
            {guidable && !guiding && (
              <button
                type="button"
                onClick={startGuide}
                className="rounded-full border border-violet-300/60 bg-black/60 px-4 py-2 text-sm font-semibold text-violet-200"
              >
                🕯 Guide this soul to rest
              </button>
            )}
            {guiding && (
              <p className="rounded-full bg-black/55 px-4 py-2 text-xs text-violet-200">
                Guiding a soul — walk it to the river bank…
              </p>
            )}
          </div>
        )}
        {notice && (
          <p className="mt-3 max-w-md rounded-full bg-black/55 px-4 py-2 text-xs text-stone-200">
            {notice.text}
          </p>
        )}
        <RealmLifeLine realmKey="hell" />
      </div>

      <div className="absolute left-4 top-4 z-30">
        <Link
          href="/"
          className="pointer-events-auto inline-block rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white"
        >
          ← Leave Hell
        </Link>
      </div>

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
