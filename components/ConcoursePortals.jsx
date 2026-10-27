'use client';

// ConcoursePortals — Layer 3 of the Concourse system: the sheet the
// Portals 3D tile opens (PhoneFrame family: backdrop tap closes,
// glass card, ✕ to close).
//
// Inside it, the menu's portals live as 3D objects — a curved wall of
// minimized portal rings, one per program (the same roster as the
// Portal Room, from lib/portal-roster.js), paged by section. Tap a
// mini portal and it expands into a full Omega arch wearing that
// program's video; Step through enters the realm. Minimized until
// expanded — Merlin's spec (2026-10-21): "the 3d objects (portals)
// live inside the program minimized until the user expands them… 3d
// version of our menu — or concourse."
//
// The 3D hall (components/concourse/PortalHallScene.jsx) loads
// lazily and exists only while this sheet is open. The card view IS
// the Portal Room's standard (Merlin, 2026-10-27): the old 3D/List
// toggle and the List branch are gone — every card rotates
// individually in place (hold-pull tilt, device-motion tilt), and a
// tap expands it. If WebGL is unavailable or its context dies, the
// sheet shows an honest retry fallback instead of a wall — never a
// second mode, never a blank stage.

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { SATELLITES } from '@/lib/i18n/satellites';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { isOwnerEmail } from '@/lib/owner';
import {
  SECTION_ORDER,
  buildPortalRoster,
  filterPortals,
  paginateWall,
  withOwnerPortals,
} from '@/lib/portal-roster';
import { probeWebGL } from '@/lib/webgl-support';
import { PortalStyles } from './portal-room/PortalCard';
import PortalEnterOverlay from './portal-room/PortalEnterOverlay';

const PortalHallScene = dynamic(() => import('./concourse/PortalHallScene'), { ssr: false });

export default function ConcoursePortals({ open, onClose }) {
  const router = useRouter();
  const { t } = useI18n();
  // The repo's shared WebGL probe (memoized; its throwaway context is
  // released, never counted against the live-context limit) decides
  // whether the hall can mount at all. A failed hall shows the retry
  // fallback below — there is no second view to fall back to.
  const [glFailed, setGlFailed] = useState(() => !probeWebGL());
  const [hallKey, setHallKey] = useState(0);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('GAMES');
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState(null);
  const [entering, setEntering] = useState(null);

  // Owner-only portals (Earth 2, the Phase 2 test build) join the
  // roster only when the signed-in session is the owner's — the same
  // gate the Portal Room wears (PortalRoomGate). Everyone else's wall
  // is the registry roster untouched.
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (alive) setIsOwner(isOwnerEmail(data?.session?.user?.email));
      } catch {
        if (alive) setIsOwner(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setIsOwner(isOwnerEmail(session?.user?.email));
    });
    return () => {
      alive = false;
      if (sub && sub.subscription) sub.subscription.unsubscribe();
    };
  }, []);

  // The roster: the registry + live i18n lookups (the SatelliteMenu
  // pattern). t() echoes the key itself for a missing string, so a
  // lookup treats an echoed key as "absent" and the builder applies
  // the room's own fallbacks (key for title, '' for subtitle).
  const programs = useMemo(() => {
    const lookup = (suffix) => (key) => {
      const full = `sat.${key}.${suffix}`;
      const v = t(full);
      return v && v !== full ? v : '';
    };
    return withOwnerPortals(
      buildPortalRoster(SATELLITES, lookup('title'), lookup('subtitle')),
      isOwner
    );
  }, [t, isOwner]);

  const counts = useMemo(() => {
    const map = new Map();
    programs.forEach((p) => map.set(p.section, (map.get(p.section) || 0) + 1));
    return map;
  }, [programs]);

  // The wall: one section at a time — or, while searching, every
  // match across all sections collapsed into a single results wall.
  const searching = query.trim().length > 0;
  const wallItems = useMemo(() => {
    if (searching) return filterPortals(programs, { section: 'ALL', query });
    return programs.filter((p) => p.section === section);
  }, [programs, searching, query, section]);

  const pages = useMemo(() => paginateWall(wallItems), [wallItems]);
  const safePage = Math.min(page, Math.max(0, pages.length - 1));
  const pageItems = pages[safePage] || [];
  const expanded = expandedKey
    ? wallItems.find((p) => p.key === expandedKey) || null
    : null;

  const handleClose = useCallback(() => {
    setExpandedKey(null);
    setEntering(null);
    onClose();
  }, [onClose]);

  // Esc: collapse an expanded portal first, then close the sheet.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (entering) return;
      if (expandedKey) setExpandedKey(null);
      else handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, entering, expandedKey, handleClose]);

  const changeSection = (s) => {
    setSection(s);
    setQuery('');
    setPage(0);
    setExpandedKey(null);
  };
  const changeQuery = (v) => {
    setQuery(v);
    setPage(0);
    setExpandedKey(null);
  };
  const changePage = (n) => {
    setPage(n);
    setExpandedKey(null);
  };

  const enterProgram = (program) => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      router.push(program.route);
      handleClose();
      return;
    }
    setEntering(program);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[62] flex items-center justify-center p-4"
      role="dialog"
      aria-label="Portals 3D"
    >
      <PortalStyles />
      <button
        type="button"
        aria-label="Close Portals 3D"
        onClick={handleClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div className="relative flex h-[min(640px,86dvh)] w-[min(680px,94vw)] flex-col overflow-hidden rounded-[2rem] border border-cyan-200/25 bg-[#070418]/92 shadow-[0_24px_70px_rgba(0,0,0,0.65),0_0_40px_rgba(0,229,255,0.10)] backdrop-blur-xl">
        {/* Header: title + count, close. */}
        <div className="flex items-center justify-between gap-2 px-5 pt-4">
          <div className="flex items-baseline gap-2.5">
            <span aria-hidden="true" className="text-xl text-amber-200 drop-shadow-[0_0_10px_rgba(255,190,80,0.8)]">
              Ω
            </span>
            <span className="text-[11px] font-black tracking-[0.3em] uppercase text-cyan-100">
              Portals 3D
            </span>
            <span className="text-[11px] tracking-widest text-zinc-500">{programs.length} realms</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Close Portals 3D"
              onClick={handleClose}
              className="ui-element pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition hover:border-cyan-300/60 hover:text-white"
            >
              <span aria-hidden="true" className="text-sm leading-none">✕</span>
            </button>
          </div>
        </div>

        {/* Find a realm. */}
        <div className="px-5 pt-3">
          <input
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder="Search realms…"
            aria-label="Search realms"
            className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-300/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 px-5 pt-3">
          {SECTION_ORDER.filter((s) => counts.has(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeSection(s)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide transition ${
                !searching && section === s
                  ? 'border-amber-300/70 bg-amber-300/15 text-amber-100'
                  : 'border-white/12 bg-white/5 text-zinc-300 hover:border-cyan-300/40'
              }`}
            >
              {s} · {counts.get(s)}
            </button>
          ))}
          {searching && (
            <span className="rounded-full border border-cyan-300/50 bg-cyan-300/10 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-100">
              Results · {wallItems.length}
            </span>
          )}
        </div>

        {/* The stage: the card hall — the one and only view. */}
        <div className="relative mt-3 flex-1 overflow-hidden">
          {glFailed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm leading-relaxed text-zinc-400">
                The 3D hall needs WebGL, which this device isn&apos;t offering right now.
              </p>
              <button
                type="button"
                onClick={() => {
                  setGlFailed(false);
                  setHallKey((k) => k + 1);
                }}
                className="rounded-full border border-cyan-300/50 bg-cyan-300/10 px-4 py-2 text-xs font-bold tracking-wide text-cyan-100 transition hover:bg-cyan-300/20"
              >
                Retry 3D
              </button>
            </div>
          ) : (
            <div className="absolute inset-0" role="img" aria-label="A curved wall of miniature portals, one for each realm in this section">
              <PortalHallScene
                key={hallKey}
                pageItems={pageItems}
                expanded={expanded}
                onTap={(program) => setExpandedKey(program.key)}
                onGlFail={() => setGlFailed(true)}
              />
            </div>
          )}
          {!glFailed && wallItems.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
              No realm matches that search yet.
            </p>
          )}
        </div>

        {/* Wall pages. */}
        {!glFailed && pages.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-1 pt-1">
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Wall page ${i + 1}`}
                aria-current={i === safePage}
                onClick={() => changePage(i)}
                className={`h-2 rounded-full transition-all ${
                  i === safePage ? 'w-6 bg-amber-300' : 'w-2 bg-white/25 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        )}

        {/* Caption bar: the expanded portal's name and doors — or a
            hint naming what a tap does. */}
        <div className="border-t border-white/10 bg-black/30 px-5 py-3">
          {expanded ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-wide text-zinc-50">
                  {expanded.title}
                </div>
                <div className="truncate text-xs text-zinc-400">
                  {expanded.subtitle ? `${expanded.subtitle} · ` : ''}
                  {expanded.section}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedKey(null)}
                  className="rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:border-cyan-300/50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => enterProgram(expanded)}
                  className="rounded-full border border-amber-300/70 bg-amber-300/15 px-3.5 py-2 text-xs font-bold tracking-wide text-amber-100 transition hover:bg-amber-300/25"
                >
                  Step through
                </button>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs leading-relaxed text-zinc-500">
              Tap a portal to expand it — hold a card and pull to tilt it, or drag empty space to look around the hall.
            </p>
          )}
        </div>
      </div>

      {/* Step-through rush, shared with the Portal Room. */}
      <PortalEnterOverlay
        program={entering}
        onDone={() => {
          if (entering) router.push(entering.route);
          handleClose();
        }}
      />
    </div>
  );
}
