'use client';

// ConcoursePortals — Layer 3 of the Concourse system: the sheet the
// Portals tile opens (PhoneFrame family: backdrop tap closes,
// glass card, ✕ to close).
//
// THE ONE portal menu (Nov 16, 2026 merge — Merlin: the 2D Portal
// Room is gone; this sheet is the menu now). It carries the room's
// front door in the room's order: the Arch wrap video on top, then
// the categories as the room showed them (the ALL tab + section
// tabs) over the flat portal grid. The grid keeps its
// one-section-at-a-time paging — the categories are the navigation
// over the grid, not a second grid. The room's extras live here too,
// each under the section it fits best: the Social Media Cheat Code
// feature at the head of TOOLS (its registry section), the FINTRAC
// explanation at the head of SHOPPING (payments & creator earnings),
// the owner-only and signed-in portals inside the roster itself
// (Earth 2 under OBSERVATORY), and the search above the tabs.
//
// The sheet opens on the flat grid (Merlin, 2026-11-18: the 3D hall
// is gone — "I don't want the 3d version of portals as seen in the
// video"). The grid is 3 across, one circular video face per program
// with the destination name in BOLD underneath, scrolling
// vertically, one page at a time. Tap a portal and the user is
// sucked into its video fullscreen; when the video finishes, the
// portal system engages (the vortex tube ride, then the realm).
// The categories ride a single horizontal carousel row so the grid
// sits directly under them. The sheet wears the Concourse
// background graphic (the concourse_bg preference, default art on a
// bad value) behind a scrim, so the menu feels like the Concourse.
// No WebGL, no 3D — the grid is plain DOM.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SATELLITES } from '@/lib/i18n/satellites';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { isOwnerEmail } from '@/lib/owner';
import { hasEarth2Access } from '@/lib/earth2/access';
import { OMEGA_WRAP_VIDEO } from '@/lib/omega-arch';
import { CONCOURSE_BG_ART, resolveConcourseBg } from '@/lib/concourse-bg';
import CheatCodeFeatured from './CheatCodeFeatured';
import { FintracExplanationMenuButton } from './FintracExplanation';
import {
  SECTION_ORDER,
  buildPortalRoster,
  filterPortals,
  paginateWall,
  withOwnerPortals,
  withSignedInPortals,
} from '@/lib/portal-roster';
import PortalFlatGrid from './concourse/PortalFlatGrid';
import PortalSuckOverlay from './concourse/PortalSuckOverlay';
import PortalEnterOverlay from './portal/PortalEnterOverlay';
import { useRiderPrefs } from '@/lib/use-rider-prefs';

export default function ConcoursePortals({ open, onClose }) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  // The GRID keeps its own section — one section at a time, GAMES
  // first — so the ALL tab never turns the grid into a second list.
  const [wallSection, setWallSection] = useState('GAMES');
  const [page, setPage] = useState(0);
  // Being sucked into a portal: { program, rect } while the
  // fullscreen video plays; cleared when travel engages or Esc
  // cancels it.
  const [sucking, setSucking] = useState(null);
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

  // The sheet wears the Concourse background graphic — the SAME
  // concourse_bg preference the Concourse box wears
  // (lib/concourse-bg.js): the device cache first (instant), then
  // the account copy from /api/ui-state when signed in (it wins,
  // exactly like the box). A malformed value falls back to the
  // default art; the card's own solid base means never a hole.
  const [bgPref, setBgPref] = useState({ kind: 'default' });
  useEffect(() => {
    if (!open) return undefined;
    try {
      const raw = window.localStorage.getItem('olympus.concourse.v1');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.bg && typeof parsed.bg === 'object') {
        setBgPref(resolveConcourseBg(parsed.bg));
      }
    } catch {}
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token || null;
        if (!token || cancelled) return;
        const res = await fetch('/api/ui-state', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (body?.preferences?.concourse_bg) {
          setBgPref(resolveConcourseBg(body.preferences.concourse_bg));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [open ]);

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
  const searching = query.trim().length > 0;
  const wallItems = useMemo(() => {
    if (searching) return filterPortals(programs, { section: 'ALL', query });
    return programs.filter((p) => p.section === wallSection);
  }, [programs, searching, query, wallSection]);
  // The results chip counts what the grid is showing.
  const resultsCount = searching ? wallItems.length : 0;

  const pages = useMemo(() => paginateWall(wallItems), [wallItems]);
  const safePage = Math.min(page, Math.max(0, pages.length - 1));
  const pageItems = pages[safePage] || [];

  const handleClose = useCallback(() => {
    setSucking(null);
    setEntering(null);
    onClose();
  }, [onClose]);

  // Esc: cancel a suck-in first, then close the sheet. (The
  // suck-in overlay also listens for Esc itself; this one covers
  // the sheet while no overlay is up.)
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (entering) return;
      if (sucking) setSucking(null);
      else handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, entering, sucking, handleClose]);

  // A section tab picks the grid's section; ALL leaves the grid's
  // section alone, so the grid never stops being one section at a
  // time.
  const changeSection = (s) => {
    if (s !== 'ALL') setWallSection(s);
    setQuery('');
    setPage(0);
    setSucking(null);
  };
  const changeQuery = (v) => {
    setQuery(v);
    setPage(0);
    setSucking(null);
  };
  const changePage = (n) => {
    setPage(n);
    setSucking(null);
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

  // Tap a portal in the grid: the user is sucked into its video.
  // Reduced motion skips the video and the travel engages at once.
  const handlePortalTap = useCallback((program, rect) => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      enterProgram(program);
      return;
    }
    setSucking({ program, rect });
  }, [enterProgram]);

  // The suck-in video finished: the portal system engages.
  const handleSuckDone = useCallback(() => {
    if (!sucking) return;
    const program = sucking.program;
    setSucking(null);
    enterProgram(program);
  }, [sucking, enterProgram]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[62] flex items-center justify-center p-4"
      role="dialog"
      aria-label="Portals"
    >
      <button
        type="button"
        aria-label="Close Portals"
        onClick={handleClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div className="relative flex h-[min(640px,86dvh)] w-[min(680px,94vw)] flex-col overflow-hidden rounded-[2rem] border border-cyan-200/25 bg-[#070418] shadow-[0_24px_70px_rgba(0,0,0,0.65),0_0_40px_rgba(0,229,255,0.10)] backdrop-blur-xl">
        {/* The Concourse background graphic behind everything — the
            SAME concourse_bg preference the Concourse box wears
            (default art when the preference is malformed; the card's
            solid base means never a hole). The scrim keeps the
            title, pills, and hall legible over a busy photo. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {bgPref?.kind === 'video' && bgPref.url ? (
            <video
              src={bgPref.url}
              autoPlay={
                typeof window === 'undefined' ||
                !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
              }
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              src={bgPref?.kind === 'image' && bgPref.url ? bgPref.url : CONCOURSE_BG_ART}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-[#070418]/75" />
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Header: title + count, close. No switch — the grid IS the
            menu (Merlin, 2026-11-18: the 3D hall is gone). */}
        <div className="flex items-center justify-between gap-2 px-5 pt-4">
          <div className="flex items-baseline gap-2.5">
            <span aria-hidden="true" className="text-xl text-amber-200 drop-shadow-[0_0_10px_rgba(255,190,80,0.8)]">
              Ω
            </span>
            <span className="text-[11px] font-black tracking-[0.3em] uppercase text-cyan-100">
              Portals
            </span>
            <span className="text-[11px] tracking-widest text-zinc-500">{programs.length} realms</span>
          </div>
          <button
            type="button"
            aria-label="Close Portals"
            onClick={handleClose}
            className="ui-element pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition hover:border-cyan-300/60 hover:text-white"
          >
            <span aria-hidden="true" className="text-sm leading-none">✕</span>
          </button>
        </div>

        {/* The Arch itself, wearing its wrap video — the merged
            menu's front door (the 2D Portal Room's top video, kept
            here now that the room is gone). A compact strip so the
            grid keeps its room on a phone. */}
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
            one tab per section — on ONE horizontal carousel row
            (Merlin, 2026-11-17), never a wrapped grid, so the grid
            sits directly under them. The active tab is the grid's
            section; ALL leaves the grid's section alone. */}
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto px-5 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['ALL', ...SECTION_ORDER.filter((s) => counts.has(s))].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeSection(s)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide transition ${
                !searching && wallSection === s
                  ? 'border-amber-300/70 bg-amber-300/15 text-amber-100'
                  : 'border-white/12 bg-white/5 text-zinc-300 hover:border-cyan-300/40'
              }`}
            >
              {s === 'ALL' ? `All · ${programs.length}` : `${s} · ${counts.get(s)}`}
            </button>
          ))}
          {searching && (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-cyan-300/50 bg-cyan-300/10 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-100">
              Results · {resultsCount}
            </span>
          )}
        </div>

        {/* The room's extras, each under the section it fits best —
            never a dumped pile: the Cheat Code feature heads TOOLS
            (its registry section); the FINTRAC explanation heads
            SHOPPING (payments & creator earnings). They used to live
            in the list; the list is gone, so they ride as a banner
            above the grid on their section (hidden while searching,
            when the grid is showing cross-section results). Tapping
            either closes the sheet on the way in. */}
        {!searching && wallSection === 'TOOLS' && (
          <div className="px-5 pt-3" onClick={handleClose}>
            <CheatCodeFeatured />
          </div>
        )}
        {!searching && wallSection === 'SHOPPING' && (
          <div className="px-5 pt-3" onClick={handleClose}>
            <FintracExplanationMenuButton />
          </div>
        )}

        {/* The grid: flat 2D, 3 across, one circular video face per
            program with the destination name in BOLD underneath
            (Merlin, 2026-11-18: the 3D hall is gone — "I don't want
            the 3d version of portals as seen in the video"). It
            scrolls vertically, one page at a time. Tap a portal and
            the user is sucked into its video fullscreen; when the
            video finishes, the portal system engages. */}
        <div className="relative mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 pt-1">
          <PortalFlatGrid
            pageItems={pageItems}
            onTap={handlePortalTap}
            paused={Boolean(sucking)}
          />
          {wallItems.length === 0 && (
            <p className="flex items-center justify-center py-16 text-sm text-zinc-500">
              No realm matches that search yet.
            </p>
          )}
        </div>

        {/* Grid pages — the grid shows one section at a time. */}
        {pages.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-1 pt-1">
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Portal page ${i + 1}`}
                aria-current={i === safePage}
                onClick={() => changePage(i)}
                className={`h-2 rounded-full transition-all ${
                  i === safePage ? 'w-6 bg-amber-300' : 'w-2 bg-white/25 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        )}

        {/* Hint bar: what a tap does. */}
        <div className="border-t border-white/10 bg-black/30 px-5 py-3">
          <p className="text-center text-xs leading-relaxed text-zinc-500">
            Tap a portal to be sucked in — its video plays, then the portal takes you through.
          </p>
        </div>
        </div>
      </div>

      {/* The suck-in: tap a grid portal and its video zooms to
          fullscreen; when the video finishes, the portal system
          engages (handleSuckDone → enterProgram → vortex ride). */}
      {sucking && (
        <PortalSuckOverlay
          program={sucking.program}
          fromRect={sucking.rect}
          onDone={handleSuckDone}
          onCancel={() => setSucking(null)}
        />
      )}

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
