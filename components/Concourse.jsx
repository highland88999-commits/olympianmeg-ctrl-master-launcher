'use client';

// The Concourse — the hub's one glass holoframe for every floating
// function (Merlin, 2026-10-20). A 3-layer system:
//   Layer 1 · Concourse Orb — the one button on the hub
//   Layer 2 · The Concourse — the glass box of tiles the Orb opens
//   Layer 3 · the panels & programs the tiles fire
//
// Named parts, for directing edits:
//   Concourse Orb  — main button (bottom right by default). Hold 2s
//                    to drag it anywhere; its spot is remembered per
//                    account (localStorage instantly, /api/ui-state
//                    across logins and devices).
//   The Concourse  — transparent glass box; click the Orb to
//                    expand/minimize.
//   Tiles          — ALL the same 56×56: Tour, Portals, Intro, Guide,
//                    Renewal, Night Grid, Bike (hub-only), Muse,
//                    Radio, Store, Bug, Alerts, Profile.
//   Pins           — hold a tile 2s to pop it out onto the hub as its
//                    own floating button; drop it on the Orb (or hold
//                    it again and drop it home) to unpin. Pins are
//                    remembered per account too.
//
// Nothing here reimplements the functions: tiles fire the real
// actions — an `olympus:concourse-open` window event the rehoused
// components and the hub page listen for, or a router push.
//
// CSS etiquette (Merlin: "respectful of other components"):
//   - z-[58]: below the Muse sheet (65), bug form (60), Earth
//     Console (80), program menu (40000) and modal layers
//   - anchored bottom-right with safe-area insets, opens up-left in a
//     capped footprint; never covers the left-half joystick zone
//   - YIELD: while the Earth bike is out, the Orb (if the user never
//     dragged it) slides up clear of the BikeControls cluster
//   - pointer events only on the glass itself

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { bikeState } from '@/lib/earth/parachute';
import { DoomsdayStrip } from './DoomsdayBanner';
import PhoneFrame from './PhoneFrame';
import { SeasonBadge } from './SeasonalDecor';

const LS_KEY = 'olympus.concourse.v1';
const SIZE = 56;
const HOLD_MS = 2000;
const SAVE_DEBOUNCE_MS = 600;

export const CONCOURSE_EVENT = 'olympus:concourse-open';
export function fireConcourseTile(tile) {
  try {
    window.dispatchEvent(new CustomEvent(CONCOURSE_EVENT, { detail: { tile } }));
  } catch {}
}

const TILES = [
  { id: 'tour', label: 'Tour', icon: '🗺️', soon: true },
  { id: 'portals', label: 'Portals', icon: '🎃', hubOnly: true },
  { id: 'intro', label: 'Intro', icon: '↺', hubOnly: true },
  { id: 'guide', label: 'Guide', icon: '?', hubOnly: true },
  { id: 'renewal', label: 'Renew', icon: '◈', hubOnly: true },
  { id: 'night', label: 'Night', icon: '🌑', hubOnly: true },
  { id: 'bike', label: 'Bike', icon: '🏍️', hubOnly: true },
  { id: 'muse', label: 'Muse', icon: '✦' },
  { id: 'radio', label: 'Radio', icon: '🎵' },
  { id: 'store', label: 'Store', icon: '🛍️' },
  { id: 'bug', label: 'Bug', icon: '🐛' },
  { id: 'alerts', label: 'Alerts', icon: '🔔' },
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'phone', label: 'Phone', icon: '📱' },
];

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const isFrac = (v) => v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y);

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { orb: null, pins: {} };
    const parsed = JSON.parse(raw);
    const orb = isFrac(parsed?.orb) ? parsed.orb : null;
    const pins = {};
    if (parsed?.pins && typeof parsed.pins === 'object') {
      for (const [id, v] of Object.entries(parsed.pins)) if (isFrac(v)) pins[id] = v;
    }
    return { orb, pins };
  } catch {
    return { orb: null, pins: {} };
  }
}

async function getToken() {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

export default function Concourse() {
  const router = useRouter();
  const pathname = usePathname();
  const onHub = pathname === '/';

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [orbFrac, setOrbFrac] = useState(null); // {x, y} fractions
  const [orbCustom, setOrbCustom] = useState(false);
  const [pinsFrac, setPinsFrac] = useState({}); // tileId -> {x, y}
  const [drag, setDrag] = useState(null); // {kind, id, x, y, active} px
  const [bikeOut, setBikeOut] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const dragRef = useRef(null);
  const suppressClickRef = useRef(0);
  const orbRef = useRef(null);
  const saveTimerRef = useRef(null);
  const stateRef = useRef({ orb: null, pins: {}, custom: false });
  stateRef.current = { orb: orbFrac, pins: pinsFrac, custom: orbCustom };

  const toPx = useCallback(
    (frac) => ({
      x: frac.x * Math.max(0, viewport.w - SIZE),
      y: frac.y * Math.max(0, viewport.h - SIZE),
    }),
    [viewport]
  );
  const toFrac = useCallback(
    (px) => ({
      x: clamp01(px.x / Math.max(1, viewport.w - SIZE)),
      y: clamp01(px.y / Math.max(1, viewport.h - SIZE)),
    }),
    [viewport]
  );

  const persist = useCallback((orb, pins) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ orb, pins }));
    } catch {}
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const token = await getToken();
      if (!token) return; // signed out: localStorage only
      try {
        await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferences: { concourse_orb: orb, concourse_pins: pins } }),
        });
      } catch {
        // offline — localStorage already holds it; next drag retries
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Hydrate: localStorage instantly; the account copy wins when
  // signed in (so the layout follows the user across logins).
  useEffect(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    const local = loadLocal();
    let orb = local.orb;
    // Legacy v1 stored raw pixels — convert into fractions.
    if (orb && (orb.x > 1 || orb.y > 1)) {
      orb = {
        x: clamp01(orb.x / Math.max(1, window.innerWidth - SIZE)),
        y: clamp01(orb.y / Math.max(1, window.innerHeight - SIZE)),
      };
    }
    const pins = {};
    for (const [id, v] of Object.entries(local.pins)) {
      pins[id] = v.x > 1 || v.y > 1
        ? { x: clamp01(v.x / Math.max(1, window.innerWidth - SIZE)), y: clamp01(v.y / Math.max(1, window.innerHeight - SIZE)) }
        : v;
    }
    if (orb) {
      setOrbFrac(orb);
      setOrbCustom(true);
    } else {
      setOrbFrac({
        x: clamp01((window.innerWidth - 18 - SIZE) / Math.max(1, window.innerWidth - SIZE)),
        y: clamp01((window.innerHeight - 96 - SIZE) / Math.max(1, window.innerHeight - SIZE)),
      });
    }
    setPinsFrac(pins);
    setMounted(true);

    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      try {
        const res = await fetch('/api/ui-state', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await res.json().catch(() => null);
        const prefs = data?.preferences || {};
        if (cancelled) return;
        if (isFrac(prefs.concourse_orb)) {
          setOrbFrac({ x: clamp01(prefs.concourse_orb.x), y: clamp01(prefs.concourse_orb.y) });
          setOrbCustom(true);
        }
        if (prefs.concourse_pins && typeof prefs.concourse_pins === 'object') {
          const dbPins = {};
          for (const [id, v] of Object.entries(prefs.concourse_pins)) {
            if (isFrac(v)) dbPins[id] = { x: clamp01(v.x), y: clamp01(v.y) };
          }
          setPinsFrac(dbPins);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Track viewport for fraction -> px rendering.
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Yield rule: bike controls own the bottom-right while riding.
  useEffect(() => {
    const id = setInterval(() => setBikeOut(!!bikeState.summoned), 500);
    return () => clearInterval(id);
  }, []);

  const fireTile = useCallback(
    (tile) => {
      if (tile.id === 'tour') {
        setNote('The Travelator arrives in Phase 2 — the gates are being built.');
        return;
      }
      setNote('');
      if (tile.id === 'store') router.push('/store');
      else if (tile.id === 'renewal') router.push('/renewal-plan');
      else if (tile.id === 'phone') { setPhoneOpen(true); setOpen(false); return; }
      else fireConcourseTile(tile.id);
      setOpen(false);
    },
    [router]
  );

  // --- press & hold drag engine -------------------------------------
  // Tap = action. Hold 2s (without wandering) = lift & drag.
  const beginPress = (kind, id, e) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const info = { kind, id, x: startX, y: startY, active: false, timer: null };
    info.timer = setTimeout(() => {
      info.active = true;
      setDrag({ kind, id, x: info.x, y: info.y, active: true });
      try { navigator.vibrate?.(12); } catch {}
    }, HOLD_MS);
    dragRef.current = info;

    const onMove = (ev) => {
      const d = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!info.active && d > 12) {
        clearTimeout(info.timer); // a swipe/scroll, not a hold
        return;
      }
      info.x = ev.clientX;
      info.y = ev.clientY;
      if (info.active) setDrag({ kind, id, x: ev.clientX, y: ev.clientY, active: true });
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      clearTimeout(info.timer);
      const wasActive = info.active;
      dragRef.current = null;
      setDrag(null);
      if (!wasActive) return; // plain tap — the click handler runs
      suppressClickRef.current = Date.now();

      const dropPx = { x: ev.clientX - SIZE / 2, y: ev.clientY - SIZE / 2 };
      const orbRect = orbRef.current?.getBoundingClientRect();
      const onOrb = orbRect
        && ev.clientX >= orbRect.left - 8 && ev.clientX <= orbRect.right + 8
        && ev.clientY >= orbRect.top - 8 && ev.clientY <= orbRect.bottom + 8;
      const { orb, pins } = stateRef.current;

      if (kind === 'orb') {
        const next = toFrac(dropPx);
        setOrbFrac(next);
        setOrbCustom(true);
        persist(next, pins);
      } else if (id) {
        const nextPins = { ...pins };
        if (onOrb) delete nextPins[id]; // dropped home
        else nextPins[id] = toFrac(dropPx);
        setPinsFrac(nextPins);
        persist(orb, nextPins);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const tapGuard = () => Date.now() - suppressClickRef.current < 350;

  if (!mounted || !orbFrac || !viewport.w) return null;

  const visibleTiles = TILES.filter((t) => !t.hubOnly || onHub);
  const boxedTiles = visibleTiles.filter((t) => !pinsFrac[t.id]);
  const orbPx = toPx(orbFrac);
  const yieldLift = bikeOut && !orbCustom ? 270 : 0;
  const orbRenderY = drag?.active && drag.kind === 'orb' ? drag.y - SIZE / 2 : orbPx.y - yieldLift;

  const boxW = 4 * SIZE + 3 * 10 + 28; // 4 tiles per row + gaps + padding
  const boxX = Math.max(10, Math.min(orbPx.x + SIZE - boxW, viewport.w - boxW - 10));
  // The box anchors by its BOTTOM edge, 12px above the Orb — height
  // is whatever the tiles need, and it can never slide down over the
  // Orb or its own footer text (Merlin's screenshot, 2026-10-20).
  const boxBottom = viewport.h - (orbPx.y - yieldLift) + 12;

  const tileButton = (tile, { pinned = false } = {}) => {
    const isDragging = drag?.active && drag.id === tile.id;
    return (
      <button
        key={tile.id}
        type="button"
        aria-label={`${tile.label}${pinned ? ' (pinned to hub)' : ''}`}
        title={tile.label}
        onPointerDown={(e) => beginPress('tile', tile.id, e)}
        onClick={() => { if (!tapGuard()) fireTile(tile); }}
        className={`ui-element pointer-events-auto relative flex flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-md transition-all active:scale-95 select-none touch-none ${pinned ? '' : 'w-full'} ${
          isDragging
            ? 'border-cyan-300 bg-cyan-400/30 scale-110 shadow-[0_0_28px_rgba(0,242,255,0.55)]'
            : 'border-white/15 bg-white/[0.06] hover:border-cyan-300/50 hover:bg-cyan-400/10 shadow-[0_4px_18px_rgba(0,0,0,0.35)]'
        }`}
        style={pinned ? { width: SIZE, height: SIZE } : { height: SIZE }}
      >
        <span aria-hidden="true" className="text-[22px] leading-none">{tile.icon}</span>
        <span className="text-[8.5px] font-black tracking-[0.14em] uppercase text-zinc-200">{tile.label}</span>
        {tile.soon && (
          <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-400 px-1.5 py-px text-[7.5px] font-black tracking-wider text-zinc-950">SOON</span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Layer 2 · The Concourse (glass box) */}
      {open && (
        <div
          role="dialog"
          aria-label="The Concourse"
          className="ui-element fixed z-[58] max-h-[calc(100dvh-110px)] overflow-y-auto rounded-3xl border border-cyan-200/25 bg-zinc-950/55 p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.55),0_0_35px_rgba(0,242,255,0.10)] backdrop-blur-xl"
          style={{ left: boxX, bottom: boxBottom, width: boxW }}
        >
          {/* The golden Doomsday countdown crowns the Concourse
              (Merlin, 2026-10-20) — hub-only, self-removing Dec 11. */}
          <DoomsdayStrip />
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <div className="text-[10px] font-black tracking-[0.3em] uppercase text-cyan-200">The Concourse</div>
            <button
              type="button"
              aria-label="Minimize the Concourse"
              onClick={() => setOpen(false)}
              className="ui-element pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-white hover:border-cyan-300/60 transition-all"
            >
              <span aria-hidden="true" className="text-xs leading-none">—</span>
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {boxedTiles.map((t) => tileButton(t))}
            {boxedTiles.length === 0 && (
              <div className="px-1 py-2 text-[11px] text-zinc-400">Everything is pinned out on the hub.</div>
            )}
          </div>
          <div className="mt-2.5 px-0.5 text-[9.5px] leading-relaxed text-zinc-500">
            {note || (
              <>
                <span className="block">Hold a tile 2s → pin it out on the hub. Drop it on the Orb to send it home.</span>
                <span className="block">Hold the Orb 2s → move it.</span>
              </>
            )}
          </div>
          {/* The season badge lives at the bottom of the Concourse now
              (Merlin, 2026-10-20) — hub-only, like its old floating
              form; renders nothing out of season. */}
          {isHub && (
            <div className="mt-2.5 flex justify-center">
              <SeasonBadge inline />
            </div>
          )}
        </div>
      )}

      {/* Pinned tiles, floating on the hub */}
      {visibleTiles
        .filter((t) => pinsFrac[t.id] && !(drag?.active && drag.id === t.id))
        .map((t) => {
          const p = toPx(pinsFrac[t.id]);
          return (
            <div key={t.id} className="ui-element fixed z-[58]" style={{ left: p.x, top: p.y }}>
              {tileButton(t, { pinned: true })}
            </div>
          );
        })}

      {/* Drag ghost: the tile under your finger while pinning */}
      {drag?.active && drag.kind === 'tile' && drag.id && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[59] flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-cyan-300 bg-cyan-400/30 backdrop-blur-md shadow-[0_0_28px_rgba(0,242,255,0.55)]"
          style={{ left: drag.x - SIZE / 2, top: drag.y - SIZE / 2, width: SIZE, height: SIZE }}
        >
          <span className="text-[22px] leading-none">{TILES.find((t) => t.id === drag.id)?.icon}</span>
          <span className="text-[8.5px] font-black tracking-[0.14em] uppercase text-white">{TILES.find((t) => t.id === drag.id)?.label}</span>
        </div>
      )}

      {/* Layer 3 · the Cloud Phone frame (Phone tile) */}
      <PhoneFrame open={phoneOpen} onClose={() => setPhoneOpen(false)} />

      {/* Layer 1 · Concourse Orb */}
      <button
        ref={orbRef}
        type="button"
        aria-label={open ? 'Minimize the Concourse' : 'Open the Concourse'}
        title="The Concourse — hold to move"
        onPointerDown={(e) => beginPress('orb', null, e)}
        onClick={() => { if (!tapGuard()) { setNote(''); setOpen((o) => !o); } }}
        className={`ui-element pointer-events-auto fixed z-[58] flex items-center justify-center rounded-full border backdrop-blur-xl transition-shadow select-none touch-none ${
          drag?.active && drag.kind === 'orb'
            ? 'border-cyan-300 bg-cyan-950/80 shadow-[0_0_34px_rgba(0,242,255,0.6)]'
            : 'border-cyan-200/40 bg-zinc-950/70 shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_22px_rgba(0,242,255,0.22)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_30px_rgba(0,242,255,0.4)]'
        }`}
        style={{
          left: drag?.active && drag.kind === 'orb' ? drag.x - SIZE / 2 : orbPx.x,
          top: orbRenderY,
          width: SIZE,
          height: SIZE,
        }}
      >
        <span aria-hidden="true" className="grid grid-cols-2 gap-[5px]">
          <span className="h-[9px] w-[9px] rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(0,242,255,0.9)]" />
          <span className="h-[9px] w-[9px] rounded-full bg-teal-300 shadow-[0_0_8px_rgba(45,255,210,0.9)]" />
          <span className="h-[9px] w-[9px] rounded-full bg-violet-300 shadow-[0_0_8px_rgba(196,141,255,0.9)]" />
          <span className="h-[9px] w-[9px] rounded-full bg-amber-300 shadow-[0_0_8px_rgba(255,205,86,0.9)]" />
        </span>
      </button>
    </>
  );
}
