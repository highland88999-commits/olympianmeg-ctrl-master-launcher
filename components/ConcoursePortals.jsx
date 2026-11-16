'use client';

// ConcoursePortals — Layer 3 of the Concourse system: the sheet the
// Portals tile opens (PhoneFrame family: backdrop tap closes,
// glass card, ✕ to close).
//
// THE ONE portal menu (Nov 16, 2026 merge — Merlin: the 2D Portal
// Room is gone; this sheet is the menu now). It carries the room's
// front door in the room's order: the Arch wrap video on top, then
// the categories as the room showed them (the ALL tab + section
// tabs, the roster grouped under section headings), then the 3D
// portal wall. The wall keeps its one-section-at-a-time paging —
// the categories are the navigation over the wall, not a second
// wall. The room's extras live here too, each under the section it
// fits best: the Social Media Cheat Code feature at the head of
// TOOLS (its registry section), the FINTRAC explanation at the head
// of SHOPPING (payments & creator earnings), the owner-only and
// signed-in portals inside the roster itself (Earth 2 under
// OBSERVATORY), and the search above the tabs.
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
// lazily and exists only while this sheet is open. The sheet opens
// on the LIST (Merlin, 2026-10-27: "the list form is how I want
// them, like list form was before, by default") — a header switch
// reaches the 3D hall, which stays intact with its per-card tilt.
// If WebGL is unavailable or its context dies while in 3D mode,
// the sheet shows an honest retry fallback instead of a wall.

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { SATELLITES } from '@/lib/i18n/satellites';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { isOwnerEmail } from '@/lib/owner';
import { hasEarth2Access } from '@/lib/earth2/access';
import { OMEGA_WRAP_VIDEO } from '@/lib/omega-arch';
import CheatCodeFeatured from './CheatCodeFeatured';
import { FintracExplanationMenuButton } from './FintracExplanation';
import {
  SECTION_ORDER,
  buildPortalRoster,
  filterPortals,
  groupBySection,
  paginateWall,
  withOwnerPortals,
  withSignedInPortals,
} from '@/lib/portal-roster';
import { probeWebGL } from '@/lib/webgl-support';
import PortalCard, { PortalStyles } from './portal/PortalCard';
import PortalEnterOverlay from './portal/PortalEnterOverlay';
import { useRiderPrefs } from '@/lib/use-rider-prefs';

const PortalHallScene = dynamic(() => import('./concourse/PortalHallScene'), { ssr: false });

export default function ConcoursePortals({ open, onClose }) {
  const router = useRouter();
  const { t } = useI18n();
  // The repo's shared WebGL probe (memoized; its throwaway context is
  // released, never counted against the live-context limit) decides
  // whether the hall can mount at all. A failed hall shows the retry
  // fallback below; the list view is always available via the switch.
  const [glFailed, setGlFailed] = useState(() => !probeWebGL());
  const [hallKey, setHallKey] = useState(0);
  // View: the list is the default on every open (Merlin, 2026-10-27);
  // the 3D hall is one switch away, never the landing view.
  const [mode, setMode] = useState('list');
  useEffect(() => {
    if (open) setMode('list');
  }, [open]);
  const [query, setQuery] = useState('');
  // The list lands on ALL (the room's default: every section grouped
  // under its heading); the WALL keeps its own section — one section
  // at a time, GAMES first — so the ALL tab never turns the wall
  // into a second list.
  const [section, setSection] = useState('ALL');
  const [wallSection, setWallSection] = useState('GAMES');
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState(null);
  const [entering, setEntering] = useState(null);
  // Preloaded so the tube ride starts instantly on tap, with the
  // rider's character in front of them in 3rd person.
  const riderPrefs = useRiderPrefs();

  // Signed-in portals (Earth 2, open to every signed-in account
  // since Merlin's 2026-10-31 unlock) join the roster for any
  // session, and owner-only portals join it for the owner — the same
  // gate the Portal Room wears (PortalRoomGate). A signed-out
  // visitor's wall is the registry roster untouched.
  const [sessionEmail, setSessionEmail] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const email = data?.session?.user?.email || null;
        if (alive) {
          setSessionEmail(email);
          setIsOwner(isOwnerEmail(email));
        }
      } catch {
        if (alive) {
          setSessionEmail(null);
          setIsOwner(false);
        }
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) {
        const email = session?.user?.email || null;
        setSessionEmail(email);
        setIsOwner(isOwnerEmail(email));
      }
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
      withSignedInPortals(
        buildPortalRoster(SATELLITES, lookup('title'), lookup('subtitle')),
        hasEarth2Access(sessionEmail)
      ),
      isOwner
    );
  }, [t, sessionEmail, isOwner]);

  const counts = useMemo(() => {
    const map = new Map();
    programs.forEach((p) => map.set(p.section, (map.get(p.section) || 0) + 1));
    return map;
  }, [programs]);

  // The wall: one section at a time — or, while searching, every
  // match across all sections collapsed into a single results wall.
  // The list: the room's view — ALL shows every section grouped
  // under its heading; one section shows just that section.
  const searching = query.trim().length > 0;
  const wallItems = useMemo(() => {
    if (searching) return filterPortals(programs, { section: 'ALL', query });
    return programs.filter((p) => p.section === wallSection);
  }, [programs, searching, query, wallSection]);
  const listItems = useMemo(
    () => filterPortals(programs, { section, query }),
    [programs, section, query]
  );
  // The results chip counts what the current view is showing.
  const resultsCount = searching
    ? mode === '3d'
      ? wallItems.length
      : listItems.length
    : 0;

  const pages = useMemo(() => paginateWall(wallItems), [wallItems]);
  // The list groups the filtered list under the room's section
  // headers (mini card grid — Merlin, 2026-10-28: the panel list is
  // a mini version of the Portal Room menu, same cards, smaller).
  const grouped = useMemo(() => groupBySection(listItems), [listItems]);
  const safePage = Math.min(page, Math.max(0, pages.length - 1));
  const pageItems = pages[safePage] || [];
  const expanded = expandedKey
    ? programs.find((p) => p.key === expandedKey) || null
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

  // A section tab picks the list's section AND the wall's section;
  // ALL picks the list's view only — the wall keeps the section it
  // already had, so it never stops being one section at a time.
  const changeSection = (s) => {
    setSection(s);
    if (s !== 'ALL') setWallSection(s);
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
        {/* Header: title + count, the List/3D switch, close. */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
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
            <div role="group" aria-label="View" className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 p-1">
              <button
                type="button"
                aria-pressed={mode === 'list'}
                onClick={() => setMode('list')}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide transition ${
                  mode === 'list'
                    ? 'bg-amber-300/20 text-amber-100'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                List
              </button>
              <button
                type="button"
                aria-pressed={mode === '3d'}
                onClick={() => setMode('3d')}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide transition ${
                  mode === '3d'
                    ? 'bg-amber-300/20 text-amber-100'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                3D
              </button>
            </div>
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

        {/* The Arch itself, wearing its wrap video — the merged
            menu's front door (the 2D Portal Room's top video, kept
            here now that the room is gone). A compact strip so the
            wall keeps its room on a phone. */}
        <div className="mx-5 mt-3 overflow-hidden rounded-2xl border border-amber-300/30 shadow-[0_0_24px_rgba(255,180,60,0.15)]">
          <div className="relative h-[92px] w-full">
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={OMEGA_WRAP_VIDEO}
              autoPlay
              muted
              loop
              playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/60" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                aria-hidden="true"
                className="text-2xl font-bold tracking-[0.3em] text-amber-200 drop-shadow-[0_0_14px_rgba(255,190,80,0.8)]"
              >
                Ω
              </span>
            </div>
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
        {/* Categories as the Portal Room showed them: ALL first, then
            one tab per section. In list mode the active tab is the
            list's section; in 3D mode it is the wall's section. */}
        <div className="flex flex-wrap gap-1.5 px-5 pt-3">
          {['ALL', ...SECTION_ORDER.filter((s) => counts.has(s))].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeSection(s)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide transition ${
                !searching && (mode === '3d' ? wallSection : section) === s
                  ? 'border-amber-300/70 bg-amber-300/15 text-amber-100'
                  : 'border-white/12 bg-white/5 text-zinc-300 hover:border-cyan-300/40'
              }`}
            >
              {s === 'ALL' ? `All · ${programs.length}` : `${s} · ${counts.get(s)}`}
            </button>
          ))}
          {searching && (
            <span className="rounded-full border border-cyan-300/50 bg-cyan-300/10 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-100">
              Results · {resultsCount}
            </span>
          )}
        </div>

        {/* The stage: the realm list by default, or the 3D hall. */}
        <div className="relative mt-3 flex-1 overflow-hidden">
          {mode === 'list' ? (
            <div className="absolute inset-0 overflow-y-auto px-5 pb-2">
              {listItems.length === 0 ? (
                <p className="mt-14 text-center text-sm text-zinc-500">
                  No realm matches that search yet.
                </p>
              ) : (
                grouped.map(({ section: s, items }) => (
                  <section key={s} className="mt-6 first:mt-1">
                    <h2 className="mb-3 text-center text-xs font-semibold tracking-[0.35em] text-cyan-100/70">
                      {s}
                    </h2>
                    {/* The room's extras, each under the section it
                        fits best — never a dumped pile: the Cheat
                        Code feature heads TOOLS (its registry
                        section); the FINTRAC explanation heads
                        SHOPPING (payments & creator earnings). Tapping
                        either closes the sheet on the way in. */}
                    {s === 'TOOLS' && (
                      <div className="mb-4" onClick={handleClose}>
                        <CheatCodeFeatured />
                      </div>
                    )}
                    {s === 'SHOPPING' && (
                      <div className="mb-4" onClick={handleClose}>
                        <FintracExplanationMenuButton />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-5">
                      {items.map((p) => (
                        <PortalCard
                          key={p.key}
                          program={p}
                          selected={expandedKey === p.key}
                          ariaLabel={`View ${p.title}`}
                          onEnter={() => setExpandedKey(p.key)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          ) : glFailed ? (
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
          {mode === '3d' && !glFailed && wallItems.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
              No realm matches that search yet.
            </p>
          )}
        </div>

        {/* Wall pages (3D mode only — the list shows every match). */}
        {mode === '3d' && !glFailed && pages.length > 1 && (
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
              {mode === 'list'
                ? 'Tap a realm to view it.'
                : 'Tap a portal to expand it — hold a card and pull to tilt it, or drag empty space to look around the hall.'}
            </p>
          )}
        </div>
      </div>

      {/* Step-through: the vortex tube ride to the realm, shared with
          the Portal Room. */}
      <PortalEnterOverlay
        program={entering}
        riderPrefs={riderPrefs}
        onDone={() => {
          if (entering) router.push(entering.route);
          handleClose();
        }}
      />
    </div>
  );
}
