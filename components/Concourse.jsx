'use client';

// The Concourse — the hub's one glass holoframe for every floating
// function (Merlin, 2026-10-20). Named parts, for directing edits:
//   Concourse Orb  — the main button (bottom right by default)
//   The Concourse  — the glass box the Orb opens
//   Tiles          — Tour / Portals / Muse / Radio / Store / Bug /
//                    Alerts / Profile, ALL the same 56×56 size
//   Pins           — a tile held for 2s pops out onto the hub as its
//                    own floating button; hold it again (or drop it
//                    on the Orb) to send it home
//   The Travelator — the tour (Phase 2; the Tour tile is its door)
//
// Nothing here reimplements the functions: tiles fire the real
// actions — an `olympus:concourse-open` window event the rehoused
// components listen for, a router push for the store, a page event
// for the portal menu. The old floaters keep their panels and logic;
// only their launchers moved in here.
//
// CSS etiquette (Merlin: "respectful of other components"):
//   - z-[58]: below the Muse sheet (65), bug form (60+), Earth
//     Console (80), Auth, and modal dismiss layers (88)
//   - anchored bottom-right with safe-area insets, opens up-left in a
//     capped footprint; never covers the left-half joystick zone
//   - YIELD: while the Earth bike is out, the Orb (if the user never
//     dragged it) slides up clear of the BikeControls cluster
//   - pointer events only on the glass itself

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { bikeState } from '@/lib/earth/parachute';

const LS_KEY = 'olympus.concourse.v1';
const SIZE = 56;
const HOLD_MS = 2000;

export const CONCOURSE_EVENT = 'olympus:concourse-open';
export function fireConcourseTile(tile) {
  try {
    window.dispatchEvent(new CustomEvent(CONCOURSE_EVENT, { detail: { tile } }));
  } catch {}
}

const TILES = [
  { id: 'tour', label: 'Tour', icon: '🗺️', soon: true },
  { id: 'portals', label: 'Portals', icon: '🎃', hubOnly: true },
  { id: 'muse', label: 'Muse', icon: '✦' },
  { id: 'radio', label: 'Radio', icon: '🎵' },
  { id: 'store', label: 'Store', icon: '🛍️' },
  { id: 'bug', label: 'Bug', icon: '🐛' },
  { id: 'alerts', label: 'Alerts', icon: '🔔' },
  { id: 'profile', label: 'Profile', icon: '👤' },
];

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { orb: null, pins: {} };
    const parsed = JSON.parse(raw);
    return { orb: parsed?.orb || null, pins: parsed?.pins || {} };
  } catch {
    return { orb: null, pins: {} };
  }
}

export default function Concourse() {
  const router = useRouter();
  const pathname = usePathname();
  const onHub = pathname === '/';

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [orbPos, setOrbPos] = useState(null); // {x, y} px, top-left
  const [orbCustom, setOrbCustom] = useState(false);
  const [pins, setPins] = useState({}); // tileId -> {x, y}
  const [drag, setDrag] = useState(null); // {kind, id, x, y, active}
  const [bikeOut, setBikeOut] = useState(false);

  const dragRef = useRef(null);
  const suppressClickRef = useRef(0);
  const orbRef = useRef(null);

  // Hydrate saved layout (positions are per user, localStorage).
  useEffect(() => {
    const saved = loadSaved();
    if (saved.orb) {
      setOrbPos(saved.orb);
      setOrbCustom(true);
    } else {
      setOrbPos({
        x: Math.max(12, window.innerWidth - 18 - SIZE),
        y: Math.max(12, window.innerHeight - 96 - SIZE),
      });
    }
    setPins(saved.pins || {});
    setMounted(true);
  }, []);

  const persist = useCallback((orb, pinsMap, custom) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ orb: custom ? orb : null, pins: pinsMap }));
    } catch {}
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
      if (tile.id === 'store') {
        router.push('/store');
      } else {
        fireConcourseTile(tile.id);
      }
      setOpen(false);
    },
    [router]
  );

  // --- press & hold drag engine -------------------------------------
  // Tap = action. Hold 2s (without wandering) = lift & drag.
  const beginPress = (kind, id, e) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const info = { kind, id, startX, startY, active: false, timer: null, x: startX, y: startY };
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

      const dropX = ev.clientX;
      const dropY = ev.clientY;
      const orbRect = orbRef.current?.getBoundingClientRect();
      const onOrb = orbRect
        && dropX >= orbRect.left - 8 && dropX <= orbRect.right + 8
        && dropY >= orbRect.top - 8 && dropY <= orbRect.bottom + 8;

      if (kind === 'orb') {
        const next = { x: dropX - SIZE / 2, y: dropY - SIZE / 2 };
        setOrbPos(next);
        setOrbCustom(true);
        persist(next, pins, true);
      } else if (id) {
        setPins((prev) => {
          const nextPins = { ...prev };
          if (onOrb) {
            delete nextPins[id]; // dropped home
          } else {
            nextPins[id] = { x: dropX - SIZE / 2, y: dropY - SIZE / 2 };
          }
          persist(orbPos, nextPins, orbCustom);
          return nextPins;
        });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const tapGuard = () => Date.now() - suppressClickRef.current < 350;

  if (!mounted || !orbPos) return null;

  const visibleTiles = TILES.filter((t) => !t.hubOnly || onHub);
  const boxedTiles = visibleTiles.filter((t) => !pins[t.id]);
  const yieldLift = bikeOut && !orbCustom ? 270 : 0;
  const orbY = orbPos.y - yieldLift;

  const boxW = 4 * SIZE + 3 * 10 + 28; // 4 tiles per row + gaps + padding
  const boxX = Math.max(10, Math.min(orbPos.x + SIZE - boxW, window.innerWidth - boxW - 10));
  const boxY = Math.max(10, orbY - 208);

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
        className={`ui-element pointer-events-auto relative flex flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-md transition-all active:scale-95 select-none touch-none ${
          isDragging
            ? 'border-cyan-300 bg-cyan-400/30 scale-110 shadow-[0_0_28px_rgba(0,242,255,0.55)]'
            : 'border-white/15 bg-white/[0.06] hover:border-cyan-300/50 hover:bg-cyan-400/10 shadow-[0_4px_18px_rgba(0,0,0,0.35)]'
        }`}
        style={{ width: SIZE, height: SIZE }}
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
      {/* The Concourse (glass box) */}
      {open && (
        <div
          role="dialog"
          aria-label="The Concourse"
          className="ui-element fixed z-[58] rounded-3xl border border-cyan-200/25 bg-zinc-950/55 p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.55),0_0_35px_rgba(0,242,255,0.10)] backdrop-blur-xl"
          style={{ left: boxX, top: boxY, width: boxW }}
        >
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
          <div className="flex flex-wrap gap-2.5">
            {boxedTiles.map((t) => tileButton(t))}
            {boxedTiles.length === 0 && (
              <div className="px-1 py-2 text-[11px] text-zinc-400">Everything is pinned out on the hub.</div>
            )}
          </div>
          <div className="mt-2.5 px-0.5 text-[9.5px] leading-relaxed text-zinc-500">
            {note || 'Hold any tile 2 seconds to pin it out on the hub. Hold the Orb to move it.'}
          </div>
        </div>
      )}

      {/* Pinned tiles, floating on the hub */}
      {visibleTiles
        .filter((t) => pins[t.id] && !(drag?.active && drag.id === t.id))
        .map((t) => (
          <div key={t.id} className="ui-element fixed z-[58]" style={{ left: pins[t.id].x, top: pins[t.id].y }}>
            {tileButton(t, { pinned: true })}
          </div>
        ))}

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

      {/* Concourse Orb */}
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
          left: drag?.active && drag.kind === 'orb' ? drag.x - SIZE / 2 : orbPos.x,
          top: drag?.active && drag.kind === 'orb' ? drag.y - SIZE / 2 : orbY,
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
