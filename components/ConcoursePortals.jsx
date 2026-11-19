'use client';

// ConcoursePortals — THE ONE portal menu (Nov 16, 2026 merge —
// Merlin: the 2D Portal Room is gone; this sheet is the menu now),
// and since the Nov 18, 2026 merge ("Concourse becomes the portal
// menu") the Concourse itself: landing here IS the portal menu —
// the default view — with the Concourse's own tile menu riding
// beside it as the second panel. Two side-by-side panels in the
// one surface; swipe left/right anywhere EXCEPT the category
// carousel to switch between them:
//
//   Portals   — the flat grid (Merlin, 2026-11-18: the 3D hall is
//               gone — "I don't want the 3d version of portals as
//               seen in the video"). 3 across, one circular video
//               face per program with the destination name in BOLD
//               underneath, scrolling vertically, one page at a
//               time. The ALL tab shows ALL portals. Tap a portal
//               and the user is sucked into its video fullscreen;
//               when the video finishes, the portal system engages
//               (the vortex tube ride, then the realm).
//   Concourse — the Concourse's own tiles as video cards in the
//               SAME shared grid (lib/concourse-actions.js): the
//               hub functions, the sheets and panels, and ARES.
//               The 5 exact duplicates (store, order-67,
//               renewal-plan, profile, social-media-cheat-code)
//               are NOT here — each lives once already, as a portal
//               card. A card tap is the action variant: its video
//               plays fullscreen first, then the sheet/panel opens
//               (or the ride engages for Hub/ARES). Hold a tile
//               card 2s to pin it out on the hub.
//
// Gesture zones, strictly separated: a swipe left/right ON the
// category carousel moves through categories ONLY and never flips
// panels (the carousel stops the gesture's propagation and owns
// its own horizontal scroll); a swipe up/down scrolls the portals
// vertically; a horizontal swipe anywhere else flips panels
// (direction detection: horizontal = panel flip, vertical =
// scroll). The panel dots under the panels switch panels by tap.
//
// Box chrome homes in the merged menu: the announcements bell
// rides the header (its menu overlays from here); the Doomsday
// strip crowns the tile panel (hub-only, self-removing Dec 11);
// the season badge, the radio mini-player and the docked backpack
// ride the tile panel's chrome row. The Concourse Orb itself stays
// outside this sheet (components/Concourse.jsx) — it opens the
// merged menu now — and the pin system stays there too: pins still
// float on the hub, and a tile card held 2s pins out from here.
//
// The hub program menu (god menus) is KEPT as a layer, not folded:
// every god-menu destination is a portal card here EXCEPT Agent
// Forge (/agent-forge), which has no registry seat and is reachable
// only through that menu — so the ☰ Programs button in the header
// (hub only) still toggles it, closing this menu on the way out.
// No program becomes unreachable.
//
// The sheet wears the Concourse background graphic (the
// concourse_bg preference, default art on a bad value) behind a
// scrim, so the menu feels like the Concourse. No WebGL, no 3D —
// the grid is plain DOM.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  CONCOURSE_ACTION_ITEMS,
  HUB_ONLY_CONCOURSE_TILE_IDS,
} from '@/lib/concourse-actions';
import PortalFlatGrid from './concourse/PortalFlatGrid';
import PortalSuckOverlay from './concourse/PortalSuckOverlay';
import PortalEnterOverlay from './portal/PortalEnterOverlay';
import { useRiderPrefs } from '@/lib/use-rider-prefs';
import { DoomsdayStrip } from './DoomsdayBanner';
import { SeasonBadge } from './SeasonalDecor';
import ConcourseRadio from './concourse/ConcourseRadio';
import BackpackHud from './backpack/BackpackHud';
import { AnnouncementsBell, AnnouncementsMenu, useAnnouncementUnread } from './concourse/AnnouncementsPanel';

// Panel-flip gesture: a horizontal swipe past this far flips the
// panel; anything shorter is a tap or a scroll. A swipe only counts
// as horizontal once it has moved this far AND is clearly wider
// than it is tall, so a diagonal scroll never flips by accident.
const PANEL_FLIP_MIN_PX = 60;
const PANEL_FLIP_START_PX = 24;
// A drag that moved at all swallows the tap that follows it, so a
// swipe across a card never also opens that card.
const CLICK_SUPPRESS_MS = 350;
// Hold a tile card this long (without wandering) to pin it out.
const PIN_HOLD_MS = 2000;
const PIN_MOVE_PX = 12;

// A Concourse card carries a tileId; a portal program does not.
const isConcourseItem = (program) => Boolean(program && program.tileId);

export default function ConcoursePortals({
  open,
  onClose,
  onHub = false,
  onConcourseAction,
  onTogglePrograms,
  onSeasonGuide,
  onPinTile,
}) {
  const router = useRouter();
  const { t } = useI18n();
  // Which panel is showing: 'portals' (the default view — landing
  // here IS the portal menu) or 'tiles' (the Concourse's own menu).
  const [panel, setPanel] = useState('portals');
  const [query, setQuery] = useState('');
  // ALL shows ALL portals — every one (Merlin, Nov 18, 2026).
  const [wallSection, setWallSection] = useState('ALL');
  const [page, setPage] = useState(0);
  // Being sucked into a portal: { program, rect } while the
  // fullscreen video plays; cleared when travel engages or Esc
  // cancels it.
  const [sucking, setSucking] = useState(null);
  const [entering, setEntering] = useState(null);
  // Preloaded so the tube ride starts instantly on tap, with the
  // rider's character in front of them in 3rd person.
  const riderPrefs = useRiderPrefs();
  // Notifications (Merlin, 2026-10-29): the bell in the header opens
  // the notifications menu; its Announcements portal button hosts
  // every past keeper broadcast for replay.
  const [notifOpen, setNotifOpen] = useState(false);
  const [hasUnread, markAnnouncementsSeen] = useAnnouncementUnread();
  // A drag swallows the tap that follows it (panel flip, pin hold).
  const suppressClickRef = useRef(0);
  const flipRef = useRef(null);
  const pinRef = useRef(null);
  const carouselRef = useRef(null);
  const carouselDragRef = useRef(null);

  // Reopening the menu always lands on the portal panel.
  useEffect(() => {
    if (open) setPanel('portals');
  }, [open ]);

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

  // The Concourse's own cards for the tile panel — the hub-only
  // ones (intro, guide, night, bike) drop out off the hub, exactly
  // as the old tile grid's hubOnly tiles did.
  const concourseItems = useMemo(
    () => CONCOURSE_ACTION_ITEMS.filter(
      (item) => onHub || !HUB_ONLY_CONCOURSE_TILE_IDS.includes(item.tileId)
    ),
    [onHub]
  );

  // The wall: one section at a time — ALL shows ALL portals — or,
  // while searching, every match across all sections collapsed into
  // a single results wall.
  const searching = query.trim().length > 0;
  const wallItems = useMemo(() => {
    if (searching) return filterPortals(programs, { section: 'ALL', query });
    if (wallSection === 'ALL') return programs;
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

  // A Concourse card's action, after its video played: the merged
  // menu closes first, so the sheet/panel/overlay the action opens
  // is never hidden behind this dialog (z-[62]) — the bug form
  // sits at z-[60] and would be. The parent (Concourse.jsx) runs
  // the action through its own fireTile.
  const handleConcourseAction = useCallback((item) => {
    handleClose();
    if (onConcourseAction) onConcourseAction(item.tileId);
  }, [handleClose, onConcourseAction]);

  // The hub program menu (god menus) is a layer this menu toggles,
  // not a panel inside it: close this menu, then toggle the menu
  // (the Menu tile's old job, now the ☰ Programs button).
  const handleTogglePrograms = useCallback(() => {
    handleClose();
    if (onTogglePrograms) onTogglePrograms();
  }, [handleClose, onTogglePrograms]);

  // The season badge's guide (Halloween beacon): the parent fires
  // the guide event and closes this menu so the hub — and the
  // beacon — are what the user sees.
  const handleSeasonGuide = useCallback((seasonKey) => {
    if (onSeasonGuide) onSeasonGuide(seasonKey);
  }, [onSeasonGuide]);

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

  // A section tab picks the grid's section; ALL shows every portal.
  const changeSection = (s) => {
    setWallSection(s);
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
  // A Concourse card under reduced motion runs its action at once.
  const handlePortalTap = useCallback((program, rect) => {
    if (Date.now() - suppressClickRef.current < CLICK_SUPPRESS_MS) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      if (isConcourseItem(program)) handleConcourseAction(program);
      else enterProgram(program);
      return;
    }
    setSucking({ program, rect });
  }, [enterProgram, handleConcourseAction]);

  // The suck-in video finished: a portal's travel engages; a
  // Concourse card's action runs (video played, then the sheet
  // opens — the action variant of the card tap).
  const handleSuckDone = useCallback(() => {
    if (!sucking) return;
    const program = sucking.program;
    setSucking(null);
    if (isConcourseItem(program)) handleConcourseAction(program);
    else enterProgram(program);
  }, [sucking, enterProgram, handleConcourseAction]);

  // --- Panel-flip gesture -------------------------------------------
  // A horizontal swipe anywhere on the panels track flips between
  // the portal menu and the Concourse tile menu — EXCEPT on the
  // category carousel, which stops the gesture's propagation and
  // owns its own horizontal scroll (see the carousel below). The
  // track wears touch-action pan-y, so a vertical touch scrolls
  // the grid natively and never reaches the flip; a horizontal
  // touch delivers pointer events here instead. Mouse drags flip
  // the same way. A drag that moved at all swallows the tap that
  // follows it, so a swipe across a card never also opens it.
  const onTrackPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('input, textarea, select')) return;
    const g = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      horizontal: false,
    };
    flipRef.current = g;
    const onMove = (ev) => {
      if (ev.pointerId !== g.pointerId) return;
      const dx = ev.clientX - g.startX;
      const dy = ev.clientY - g.startY;
      if (!g.horizontal && Math.abs(dx) > PANEL_FLIP_START_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
        g.horizontal = true;
      }
    };
    const onUp = (ev) => {
      if (ev.pointerId !== g.pointerId) return;
      cleanup();
      const dx = ev.clientX - g.startX;
      const dy = ev.clientY - g.startY;
      if (g.horizontal && Math.abs(dx) > PANEL_FLIP_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0 && panel === 'portals') setPanel('tiles');
        else if (dx > 0 && panel === 'tiles') setPanel('portals');
      }
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) suppressClickRef.current = Date.now();
    };
    const onCancel = (ev) => {
      if (ev.pointerId !== g.pointerId) return;
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (flipRef.current === g) flipRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };
  const onTrackClickCapture = (e) => {
    if (Date.now() - suppressClickRef.current < CLICK_SUPPRESS_MS) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // --- Carousel drag-scroll ---------------------------------------
  // A swipe on the category carousel moves categories ONLY — but it
  // cannot scroll natively: the track wears touch-action pan-y and
  // the carousel pan-x, and the two intersect to none, so the
  // browser never scrolls the carousel on touch (headless probe,
  // Nov 18, 2026: scrollLeft stayed 0 after a real swipe). The
  // carousel therefore scrolls itself from its pointer events — the
  // same events it already stops from reaching the track's flip —
  // and a drag that moved swallows the tab tap that follows it,
  // through the shared suppressClickRef the track's click-capture
  // honors.
  const onCarouselPointerDown = (e) => {
    e.stopPropagation();
    const el = carouselRef.current;
    if (!el) return;
    carouselDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startScrollLeft: el.scrollLeft };
    try { el.setPointerCapture(e.pointerId); } catch {}
  };
  const onCarouselPointerMove = (e) => {
    e.stopPropagation();
    const d = carouselDragRef.current;
    const el = carouselRef.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    el.scrollLeft = d.startScrollLeft - (e.clientX - d.startX);
  };
  const onCarouselPointerUp = (e) => {
    e.stopPropagation();
    const d = carouselDragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    carouselDragRef.current = null;
    if (Math.abs(e.clientX - d.startX) > 10) suppressClickRef.current = Date.now();
  };

  // --- Hold a tile card to pin it -----------------------------------
  // Press-and-hold a tile card 2s (without wandering) to pin it out
  // onto the hub as its own floating button — the old tile grid's
  // hold-to-pin, now on the card. A swipe or scroll cancels the
  // hold; the tap that follows a pin is swallowed.
  const onTileGridPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const btn = e.target.closest('[data-item-key]');
    if (!btn) return;
    const item = concourseItems.find((it) => it.key === btn.getAttribute('data-item-key'));
    if (!item) return;
    const hold = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      timer: null,
    };
    pinRef.current = hold;
    hold.timer = setTimeout(() => {
      if (pinRef.current !== hold) return;
      pinRef.current = null;
      suppressClickRef.current = Date.now();
      try { navigator.vibrate?.(12); } catch {}
      if (onPinTile) onPinTile(item.tileId);
    }, PIN_HOLD_MS);
    const cancel = () => {
      if (hold.timer) clearTimeout(hold.timer);
      hold.timer = null;
      if (pinRef.current === hold) pinRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onMove = (ev) => {
      if (ev.pointerId !== hold.pointerId) return;
      if (Math.hypot(ev.clientX - hold.startX, ev.clientY - hold.startY) > PIN_MOVE_PX) cancel();
    };
    const onUp = (ev) => {
      if (ev.pointerId !== hold.pointerId) return;
      cancel();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

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
        {/* Header: title + count, Programs toggle, bell, close. The
            title follows the panel — Portals, or Concourse on the
            tile panel. No switch — the grid IS the menu (Merlin,
            2026-11-18: the 3D hall is gone). */}
        <div className="flex items-center justify-between gap-2 px-5 pt-4">
          <div className="flex items-baseline gap-2.5">
            <span aria-hidden="true" className="text-xl text-amber-200 drop-shadow-[0_0_10px_rgba(255,190,80,0.8)]">
              Ω
            </span>
            {panel === 'portals' ? (
              <span className="text-[11px] font-black tracking-[0.3em] uppercase text-cyan-100">Portals</span>
            ) : (
              <span className="text-[11px] font-black tracking-[0.3em] uppercase text-cyan-100">Concourse</span>
            )}
            <span className="text-[11px] tracking-widest text-zinc-500">
              {panel === 'portals' ? `${programs.length} realms` : `${concourseItems.length} tiles`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onHub && (
              <button
                type="button"
                aria-label="Toggle the program menu"
                title="Program menu"
                onClick={handleTogglePrograms}
                className="ui-element pointer-events-auto flex h-7 shrink-0 items-center gap-1 rounded-full border border-white/15 px-2.5 text-[11px] font-bold tracking-wide text-zinc-300 transition hover:border-cyan-300/60 hover:text-white"
              >
                <span aria-hidden="true">☰</span>
                <span>Programs</span>
              </button>
            )}
            <AnnouncementsBell hasUnread={hasUnread} onOpen={() => setNotifOpen(true)} />
            <button
              type="button"
              aria-label="Close Portals"
              onClick={handleClose}
              className="ui-element pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition hover:border-cyan-300/60 hover:text-white"
            >
              <span aria-hidden="true" className="text-sm leading-none">✕</span>
            </button>
          </div>
        </div>

        {/* The two panels, side by side in one track: the portal
            menu, then the Concourse tile menu. A horizontal swipe
            on the track flips between them; the dots below switch
            by tap. The track itself must NEVER carry overflow-hidden:
            it slides -100% to show the tile panel, and a clip on the
            track would cut the second panel away in local space (it
            sits outside the track's own box once translated) — the
            tile panel would render empty and unhittable (headless
            probe, Nov 18, 2026: the Concourse panel was blank, its
            strip, cards and chrome row all clipped away). The
            dialog box above is the viewport clip. */}
        <div
          onPointerDown={onTrackPointerDown}
          onClickCapture={onTrackClickCapture}
          style={{ touchAction: 'pan-y', transform: panel === 'tiles' ? 'translateX(-100%)' : 'translateX(0)' }}
          className="flex min-h-0 flex-1 transition-transform duration-300 ease-out"
        >
        {/* PANEL 1 — the portal menu. */}
        <section aria-label="Portal menu" className="flex min-h-0 w-full shrink-0 flex-col">
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
            sits directly under them. ALL shows ALL portals. A swipe
            left/right ON this carousel moves through categories
            ONLY and never flips panels: the carousel stops the
            gesture's propagation and scrolls itself from its own
            pointer events (native scroll is dead here — the track's
            pan-y and the carousel's pan-x intersect to none), so
            the track's flip never sees it. */}
        <div
          ref={carouselRef}
          onPointerDown={onCarouselPointerDown}
          onPointerMove={onCarouselPointerMove}
          onPointerUp={onCarouselPointerUp}
          onPointerCancel={onCarouselPointerUp}
          style={{ touchAction: 'pan-x' }}
          className="flex flex-nowrap gap-1.5 overflow-x-auto px-5 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
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

        {/* Grid pages — the grid shows one section at a time, or ALL
            of them at once. */}
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
        </section>

        {/* PANEL 2 — the Concourse tile menu: the Concourse's own
            tiles as video cards in the SAME shared grid (one page —
            14 cards on the hub, 10 off it). The Doomsday strip
            crowns it; the season badge, the radio mini-player and
            the docked backpack ride its chrome row. */}
        <section aria-label="Concourse tiles" className="flex min-h-0 w-full shrink-0 flex-col">
        <div className="px-5 pt-3">
          <DoomsdayStrip />
        </div>
        <div
          className="relative mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 pt-1"
          onPointerDown={onTileGridPointerDown}
        >
          <PortalFlatGrid
            pageItems={concourseItems}
            onTap={handlePortalTap}
            paused={Boolean(sucking)}
          />
        </div>
        {/* Bottom chrome row (Merlin, 2026-10-20 + round 3,
            2026-10-23): the season badge — hub-only, like its old
            floating form; renders nothing out of season — now a
            GUIDE button, beside the radio mini-player, the radio's
            living face in the menu, and the backpack, docked in
            this row next to the hub's main controls. One flex row
            with gaps and wrapping: nothing overlaps, nothing is
            positioned over anything. */}
        <div className="flex flex-wrap items-center justify-center gap-2 px-5 pb-1 pt-2">
          {onHub && <SeasonBadge inline onGuide={handleSeasonGuide} />}
          <ConcourseRadio />
          {/* The backpack, opened from the hub — a flow item in
              this row, never overlapping the badge or radio.
              Its home slot: docked in this row next to the
              hub's main controls. */}
          <BackpackHud realm="hub" realmLabel="the hub" docked
            displayNote="The hub keeps its own arms — the pack rides along." />
        </div>
        </section>
        </div>

        {/* Panel dots — tap to switch panels. */}
        <div className="flex items-center justify-center gap-4 pb-1 pt-2">
          <button
            type="button"
            onClick={() => setPanel('portals')}
            aria-label="Show the portal menu"
            aria-current={panel === 'portals'}
            className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-zinc-300 hover:text-white"
          >
            <span aria-hidden="true" className={`h-2 rounded-full transition-all ${panel === 'portals' ? 'w-6 bg-amber-300' : 'w-2 bg-white/25'}`} />
            Portals
          </button>
          <button
            type="button"
            onClick={() => setPanel('tiles')}
            aria-label="Show the Concourse tiles"
            aria-current={panel === 'tiles'}
            className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-zinc-300 hover:text-white"
          >
            <span aria-hidden="true" className={`h-2 rounded-full transition-all ${panel === 'tiles' ? 'w-6 bg-amber-300' : 'w-2 bg-white/25'}`} />
            Concourse
          </button>
        </div>

        {/* Hint bar: what a tap does, per panel. */}
        <div className="border-t border-white/10 bg-black/30 px-5 py-3">
          <p className="text-center text-xs leading-relaxed text-zinc-500">
            {panel === 'portals'
              ? 'Tap a portal to be sucked in — its video plays, then the portal takes you through.'
              : 'Tap a tile to open it — hold a tile 2s to pin it out on the hub. Swipe ← → to switch panels. Drag the Orb → put it anywhere. It stays where you leave it.'}
          </p>
        </div>
        </div>
      </div>

      {/* Notifications (Merlin, 2026-10-29): the bell's menu, whose
          Announcements portal button hosts every past broadcast. */}
      <AnnouncementsMenu open={notifOpen} onClose={() => setNotifOpen(false)} onSeen={markAnnouncementsSeen} />

      {/* The suck-in: tap a grid portal and its video zooms to
          fullscreen; when the video finishes, the portal system
          engages (handleSuckDone → enterProgram → vortex ride). A
          Concourse card's video plays the same way; when it
          finishes, the card's action runs instead. */}
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
