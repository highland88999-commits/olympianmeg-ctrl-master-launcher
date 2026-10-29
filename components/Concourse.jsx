'use client';

// The Concourse — the hub's one glass holoframe for every floating
// function (Merlin, 2026-10-20). A 3-layer system:
//   Layer 1 · Concourse Orb — the one button on the hub
//   Layer 2 · The Concourse — the glass box of tiles the Orb opens
//   Layer 3 · the panels & programs the tiles fire
//
// Named parts, for directing edits:
//   Concourse Orb  — main button (bottom right by default). Drag
//                    it anywhere — press and move, no hold (the
//                    Muse FAB model, lib/concourse-icon.js); a tap
//                    still opens the Concourse. Its spot is
//                    remembered per account INDEFINITELY
//                    (localStorage instantly, /api/ui-state across
//                    logins and devices; no expiry anywhere).
//   The Concourse  — transparent glass box; click the Orb to
//                    expand/minimize. Drag the box by its title bar
//                    to put it ANYWHERE on the screen (Merlin,
//                    2026-10-22); its spot is remembered per account
//                    exactly like the Orb's (localStorage instantly,
//                    /api/ui-state across logins and devices).
//   Tiles          — ALL the same 56×56, in composed order:
//                    Hub (→ /, every page — the way home, Merlin
//                    2026-10-22), Portals, Tour, Intro, Guide,
//                    Portals 3D (the 3D portal hall), Night Grid,
//                    Bike, Renewal (hub-only set), Muse, Phone,
//                    Calls (Holographic Calls → /order-67), Radio,
//                    Store, Alerts, Profile, Settings, Bug, FINTRAC
//                    (explanation modal — label reads FINTRAC on the
//                    56px tile, full "FINTRAC explanation" title in
//                    its tooltip, the Program menu, and the modal).
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
import dynamic from 'next/dynamic';
import { bikeState } from '@/lib/earth/parachute';
import { DoomsdayStrip } from './DoomsdayBanner';
import PhoneFrame from './PhoneFrame';
import { SeasonBadge } from './SeasonalDecor';
import CheatCodeFeatured from './CheatCodeFeatured';
import BackpackHud from './backpack/BackpackHud';
import { useRadio } from './radio/RadioProvider';
import { Play, Pause, SkipBack, SkipForward, Music2 } from 'lucide-react';
import ConcourseSettings from './ConcourseSettings';
import { fireFintracExplanation, FintracExplanationHost } from './FintracExplanation';
import { CONCOURSE_BG_ART, resolveConcourseBg } from '@/lib/concourse-bg';
import { resolveUiSettings, readUiSettingsCache, writeUiSettingsCache, UI_SETTINGS_EVENT } from '@/lib/ui-settings';
import { isIconDrag, clampIconPx, iconFracToPx, iconPxToFrac, dragIconTopLeft, resolveIconPosition } from '@/lib/concourse-icon';
import { AnnouncementsBell, AnnouncementsMenu, useAnnouncementUnread } from './concourse/AnnouncementsPanel';

// Layer 3 · Portals 3D — loaded only when its tile is first tapped,
// so three.js never enters the layout's eager bundle (Concourse
// ships on every page).
const ConcoursePortals = dynamic(() => import('./ConcoursePortals'), { ssr: false });
const Travelator = dynamic(() => import('./tour/Travelator'), { ssr: false });

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

// Season guide (Merlin, round 3, 2026-10-23): the SeasonBadge,
// tapped in the box's bottom bar, asks the hub to light the way to
// the season's house function. PumpkinHarvest (inside the Canvas)
// is the Halloween listener — it answers with a golden beacon on
// the first unharvested pumpkin.
export const SEASON_GUIDE_EVENT = 'olympus:season-guide';

// Tile order is composed in four visual movements (Merlin,
// 2026-10-20 — "reorder the icons for best aesthetic pleasure"):
//   Journey · Hub, Portals, Tour, Intro, Guide — the way in
//   Hub     · Night, Bike, Renew, Muse — life on the hub
//   Connect · Phone, Calls, Radio, Store — reach out & trade
//   You     · Alerts, Profile, Bug — the personal corner
// Off the hub the hub-only tiles drop out and the same order
// collapses into two clean rows (Muse/Phone/Calls/Radio, then
// Store/Alerts/Profile/Bug).
// The HUB tile leads (Merlin, bug report 2026-10-22: "In concourse
// Add a hub button"): it is deliberately NOT hubOnly — its whole
// job is to be there on every OTHER page as the one-tap way back
// to the hub (and it can be pinned out as a floating home button).
// On the hub itself it simply closes the box and stays home. Its
// face is the Orb artwork — the hub's own emblem.
const TILES = [
  { id: 'hub', label: 'Hub', icon: '⌂', art: '/concourse-icons/orb.webp' },
  { id: 'portals', label: 'Portals', icon: '🎃', art: '/concourse-icons/portals.webp', hubOnly: true },
  { id: 'tour', label: 'Tour', icon: '🗺️', art: '/concourse-icons/tour.webp' },
  { id: 'intro', label: 'Intro', icon: '↺', art: '/concourse-icons/intro.webp', hubOnly: true },
  { id: 'guide', label: 'Guide', icon: '?', art: '/concourse-icons/guide.webp', hubOnly: true },
  { id: 'portalroom', label: 'Portals 3D', icon: 'Ω' },
  { id: 'night', label: 'Night', icon: '🌑', art: '/concourse-icons/night.webp', hubOnly: true },
  { id: 'bike', label: 'Bike', icon: '🏍️', art: '/concourse-icons/bike.webp', hubOnly: true },
  { id: 'renewal', label: 'Renew', icon: '◈', art: '/concourse-icons/renew.webp', hubOnly: true },
  { id: 'muse', label: 'Muse', icon: '✦', art: '/concourse-icons/muse.webp' },
  { id: 'phone', label: 'Phone', icon: '📱', art: '/concourse-icons/phone.webp' },
  { id: 'calls', label: 'Calls', icon: '🔮', art: '/concourse-icons/calls.webp' },
  { id: 'radio', label: 'Radio', icon: '🎵', art: '/concourse-icons/radio.webp' },
  { id: 'store', label: 'Store', icon: '🛍️', art: '/concourse-icons/store.webp' },
  { id: 'alerts', label: 'Alerts', icon: '🔔', art: '/concourse-icons/alerts.webp' },
  { id: 'profile', label: 'Profile', icon: '👤', art: '/concourse-icons/profile.webp' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'bug', label: 'Bug', icon: '🐛', art: '/concourse-icons/bug.webp' },
  { id: 'fintrac', label: 'FINTRAC', title: 'FINTRAC explanation', icon: '⚠️', important: true },
  { id: 'molly', label: 'Molly', icon: '🛡️' },
];

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const isFrac = (v) => v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y);

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { orb: null, pins: {}, bg: null, box: null };
    const parsed = JSON.parse(raw);
    const orb = isFrac(parsed?.orb) ? parsed.orb : null;
    const pins = {};
    if (parsed?.pins && typeof parsed.pins === 'object') {
      for (const [id, v] of Object.entries(parsed.pins)) if (isFrac(v)) pins[id] = v;
    }
    const bg = parsed?.bg && typeof parsed.bg === 'object' ? parsed.bg : null;
    const box = isFrac(parsed?.box) ? parsed.box : null;
    return { orb, pins, bg, box };
  } catch {
    return { orb: null, pins: {}, bg: null, box: null };
  }
}

// Merge a new backdrop into the local cache without disturbing the
// orb/pins/box the drag engines own.
function writeLocalBg(bg) {
  try {
    const l = loadLocal();
    localStorage.setItem(LS_KEY, JSON.stringify({ orb: l.orb, pins: l.pins, bg, box: l.box }));
  } catch {}
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

// Tile glyph — the generated artwork is the face of the tile; the
// original emoji is the fallback if the art is missing or fails to
// load, so the menu never shows a broken-image hole. One component
// serves the box grid, the pins and the drag ghost alike: they all
// read the same TILES entry (icon + art).
function TileGlyph({ tile }) {
  const [failed, setFailed] = useState(false);
  if (!tile.art || failed) {
    return <span aria-hidden="true" className="relative z-10 text-[22px] leading-none">{tile.icon}</span>;
  }
  return (
    <img
      src={tile.art}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailed(true)}
      className="relative z-10 h-[26px] w-[26px] rounded-lg object-cover"
    />
  );
}

// Orb face — the generated orb artwork fills the button's circle;
// if it ever fails to load, the original four glowing dots return.
function OrbFace() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span aria-hidden="true" className="grid grid-cols-2 gap-[5px]">
        <span className="h-[9px] w-[9px] rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(0,242,255,0.9)]" />
        <span className="h-[9px] w-[9px] rounded-full bg-teal-300 shadow-[0_0_8px_rgba(45,255,210,0.9)]" />
        <span className="h-[9px] w-[9px] rounded-full bg-violet-300 shadow-[0_0_8px_rgba(196,141,255,0.9)]" />
        <span className="h-[9px] w-[9px] rounded-full bg-amber-300 shadow-[0_0_8px_rgba(255,205,86,0.9)]" />
      </span>
    );
  }
  return (
    <img
      src="/concourse-icons/orb.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailed(true)}
      className="h-full w-full rounded-full object-cover"
    />
  );
}


// Concourse mini-player (Merlin, round 3, 2026-10-23): "the visual
// part stays alive in concourse with the player controls at the
// bottom of concourse next to the season name in its own button."
// The full RadioBar can be minimized — its embed now survives that
// parked — and this pill is the radio's living face in the box:
// transport (prev / play-pause / next) plus the current track.
// Play state is the provider's own, set only by Spotify's real
// playback events, so the pill never shows a state that isn't
// real. Tapping the track face reopens the full radio —
// setMinimized(false) + setExpanded(true), the same end state the
// Radio tile's `olympus:concourse-open` handler lands in. Before
// any track has ever loaded it simply reads as the station and
// still opens the radio.
function ConcourseRadio() {
  const {
    current, playing, engineReady, station,
    togglePlay, next, prev, setMinimized, setExpanded,
  } = useRadio();
  const openRadio = () => { setMinimized(false); setExpanded(true); };
  const skipBtn =
    'ui-element pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300';
  return (
    <div
      role="group"
      aria-label="Radio — mini player"
      className="flex min-w-0 items-center gap-1 rounded-full border border-white/14 bg-zinc-950/55 py-1 pl-1 pr-1.5 backdrop-blur-md"
    >
      <button type="button" onClick={prev} aria-label="Previous track" title="Previous track" className={skipBtn}>
        <SkipBack size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!engineReady}
        aria-label={playing ? 'Pause' : engineReady ? 'Play' : 'Loading Spotify player'}
        title={playing ? 'Pause' : 'Play'}
        className="ui-element pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-300 text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {playing
          ? <Pause size={15} aria-hidden="true" />
          : <Play size={15} aria-hidden="true" className="ml-px" />}
      </button>
      <button type="button" onClick={next} aria-label="Next track" title="Next track" className={skipBtn}>
        <SkipForward size={14} aria-hidden="true" />
      </button>
      <span className="h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />
      <button
        type="button"
        onClick={openRadio}
        aria-label={current ? `Open the radio — now showing ${current.title} by ${current.artist}` : `Open the radio — ${station.shortName}`}
        title="Open the radio"
        className="ui-element pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 text-left transition-all hover:bg-white/10 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
      >
        <Music2 size={13} aria-hidden="true" className="shrink-0 text-teal-300" />
        <span className="block max-w-[76px] truncate text-[10.5px] font-semibold leading-tight text-zinc-100">
          {current ? current.title : station.shortName}
        </span>
        {playing && (
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-teal-300" />
        )}
      </button>
    </div>
  );
}

// The box backdrop media: the default artwork, the user's own photo,
// or the user's own video (muted, looping; held still — no autoplay —
// under prefers-reduced-motion). Sits under a scrim of the same
// darkness the glass always had (bg-zinc-950/55), so tiles and labels
// read exactly as before.
function ConcourseBackdrop({ bg }) {
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
  if (bg?.kind === 'video' && bg.url) {
    return (
      <video
        src={bg.url}
        autoPlay={!reduceMotion}
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  }
  const src = bg?.kind === 'image' && bg.url ? bg.url : CONCOURSE_BG_ART;
  return <img src={src} alt="" aria-hidden="true" draggable={false} className="h-full w-full object-cover" />;
}

export default function Concourse() {
  const router = useRouter();
  const pathname = usePathname();
  const onHub = pathname === '/';

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Notifications (Merlin, 2026-10-29): the bell in the header opens
  // the notifications menu; its Announcements portal button hosts
  // every past keeper broadcast for replay.
  const [notifOpen, setNotifOpen] = useState(false);
  const [hasUnread, markAnnouncementsSeen] = useAnnouncementUnread();
  const [note, setNote] = useState('');
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [orbFrac, setOrbFrac] = useState(null); // {x, y} fractions
  const [orbCustom, setOrbCustom] = useState(false);
  const [pinsFrac, setPinsFrac] = useState({}); // tileId -> {x, y}
  const [boxFrac, setBoxFrac] = useState(null); // box top-left {x, y} fractions
  const [boxDrag, setBoxDrag] = useState(null); // box top-left px while dragging
  const [boxH, setBoxH] = useState(0); // measured box height (position math)
  const [drag, setDrag] = useState(null); // {kind, id, x, y, active} px
  const [bikeOut, setBikeOut] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [bgPref, setBgPref] = useState({ kind: 'default' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [portal3dOpen, setPortal3dOpen] = useState(false);
  const [travelatorOpen, setTravelatorOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState({ sound: true });

  const dragRef = useRef(null);
  const orbDragRef = useRef(null);
  const suppressClickRef = useRef(0);
  const orbRef = useRef(null);
  const boxRef = useRef(null);
  const saveTimerRef = useRef(null);
  const saveBgTimerRef = useRef(null);
  const saveSettingsTimerRef = useRef(null);
  const stateRef = useRef({ orb: null, pins: {}, custom: false });
  stateRef.current = { orb: orbFrac, pins: pinsFrac, custom: orbCustom, bg: bgPref, box: boxFrac };

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

  const persist = useCallback((orb, pins, box) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ orb, pins, bg: stateRef.current.bg, box: box || null }));
    } catch {}
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const token = await getToken();
      if (!token) return; // signed out: localStorage only
      try {
        await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            preferences: {
              concourse_orb: orb,
              concourse_pins: pins,
              ...(box ? { concourse_box: box } : {}),
            },
          }),
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
    if (local.box) setBoxFrac(local.box);
    if (local.bg) setBgPref(resolveConcourseBg(local.bg));
    const cachedSettings = readUiSettingsCache(window.localStorage);
    if (cachedSettings) setUiSettings(cachedSettings);
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
        // Restore precedence (lib/concourse-icon.js): the account
        // copy wins over the device cache applied above — that is
        // what carries the icon's spot to a new device at login.
        const serverOrb = resolveIconPosition({ server: prefs.concourse_orb });
        if (serverOrb) {
          setOrbFrac({ x: clamp01(serverOrb.x), y: clamp01(serverOrb.y) });
          setOrbCustom(true);
        }
        if (isFrac(prefs.concourse_box)) {
          setBoxFrac({ x: clamp01(prefs.concourse_box.x), y: clamp01(prefs.concourse_box.y) });
        }
        if (prefs.settings) {
          const r = resolveUiSettings(prefs.settings);
          setUiSettings(r);
          writeUiSettingsCache(window.localStorage, r);
          try {
            window.dispatchEvent(new CustomEvent(UI_SETTINGS_EVENT, { detail: { settings: r } }));
          } catch {}
        }
        if (prefs.concourse_bg) {
          const r = resolveConcourseBg(prefs.concourse_bg);
          setBgPref(r);
          writeLocalBg(r);
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
        setTravelatorOpen(true);
        setOpen(false);
        return;
      }
      setNote('');
      if (tile.id === 'hub') router.push('/');
      else if (tile.id === 'molly') router.push('/molly');
      else if (tile.id === 'store') router.push('/store');
      else if (tile.id === 'renewal') router.push('/renewal-plan');
      else if (tile.id === 'calls') router.push('/order-67'); // Holographic Calls
      else if (tile.id === 'settings') { setSettingsOpen(true); setOpen(false); return; }
      else if (tile.id === 'phone') { setPhoneOpen(true); setOpen(false); return; }
      else if (tile.id === 'portalroom') { setPortal3dOpen(true); setOpen(false); return; }
      else if (tile.id === 'fintrac') { fireFintracExplanation(4); setOpen(false); return; }
      else fireConcourseTile(tile.id);
      setOpen(false);
    },
    [router]
  );

  // Season guide (Merlin, round 3): the badge in the bottom bar is
  // a button now. For Halloween it fires the guide event
  // PumpkinHarvest listens for (a golden beacon on the first
  // unharvested pumpkin) and closes the box, so the hub — and the
  // beacon — are what the user sees. Every other season has no
  // guide target yet: the tap lands on the badge's pressed state
  // and nothing else happens. No fake guides.
  const handleSeasonGuide = useCallback((seasonKey) => {
    if (seasonKey !== 'halloween') return;
    try {
      window.dispatchEvent(new CustomEvent(SEASON_GUIDE_EVENT, { detail: { season: seasonKey } }));
    } catch {}
    setOpen(false);
  }, []);

  // Backdrop choice: local cache instantly, account copy debounced
  // (same pattern as the orb/pins persist above).
  const applyBg = useCallback((next) => {
    const resolved = resolveConcourseBg(next);
    setBgPref(resolved);
    writeLocalBg(resolved);
    if (saveBgTimerRef.current) clearTimeout(saveBgTimerRef.current);
    saveBgTimerRef.current = setTimeout(async () => {
      const token = await getToken();
      if (!token) return; // signed out: localStorage only
      try {
        await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferences: { concourse_bg: resolved } }),
        });
      } catch {
        // offline — localStorage already holds it; next change retries
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // UI settings (Sound): cache + broadcast instantly (the radio and
  // hub fx listen), account copy debounced like the backdrop.
  const applySettings = useCallback((next) => {
    const resolved = resolveUiSettings(next);
    setUiSettings(resolved);
    writeUiSettingsCache(typeof window !== 'undefined' ? window.localStorage : null, resolved);
    try {
      window.dispatchEvent(new CustomEvent(UI_SETTINGS_EVENT, { detail: { settings: resolved } }));
    } catch {}
    if (saveSettingsTimerRef.current) clearTimeout(saveSettingsTimerRef.current);
    saveSettingsTimerRef.current = setTimeout(async () => {
      const token = await getToken();
      if (!token) return; // signed out: localStorage only
      try {
        await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferences: { settings: resolved } }),
        });
      } catch {
        // offline — localStorage already holds it; next change retries
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // --- Orb drag engine ------------------------------------------------
  // The icon moves exactly like the old Muse button (Merlin,
  // 2026-10-22): press and MOVE — travel past the 8px threshold
  // (lib/concourse-icon.js) turns the press into a drag; no hold,
  // no timer, so any user can discover it. A press that never
  // crosses the threshold stays a tap and the click opens the
  // Concourse; a real drag swallows its click, so the two never
  // mix. The grab offset is kept (the icon never jumps to center
  // under the finger) and the top-left is clamped live, so the
  // icon stays fully on screen with an 8px margin at every
  // moment of the drag — and because the stored spot is a viewport
  // fraction, resize/rotation keeps it on screen too. The button
  // is touch-none, so a touch-drag never fights page scroll.
  // On drop the spot persists through the same path as always:
  // localStorage instantly + debounced /api/ui-state
  // (concourse_orb), per account, no expiry.
  const beginOrbDrag = (e) => {
    if (e.isPrimary === false) return;
    if (e.button != null && e.button !== 0) return;
    const el = orbRef.current;
    if (!el || !orbFrac) return;
    try { el.setPointerCapture(e.pointerId); } catch {}
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const origin = clampIconPx(iconFracToPx(orbFrac, vw, vh, SIZE), vw, vh, SIZE);
    const info = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: origin.x,
      origY: origin.y,
      x: origin.x,
      y: origin.y,
      moved: false,
    };
    orbDragRef.current = info;

    const onMove = (ev) => {
      if (ev.pointerId !== info.pointerId) return;
      const dx = ev.clientX - info.startX;
      const dy = ev.clientY - info.startY;
      if (!info.moved && !isIconDrag(dx, dy)) return; // still a tap
      info.moved = true;
      const tl = dragIconTopLeft(
        { x: info.origX, y: info.origY },
        { x: info.startX, y: info.startY },
        { x: ev.clientX, y: ev.clientY },
        window.innerWidth,
        window.innerHeight,
        SIZE
      );
      info.x = tl.x;
      info.y = tl.y;
      // For the Orb, drag x/y carry the clamped TOP-LEFT px (tiles
      // below carry pointer px for their ghost instead).
      setDrag({ kind: 'orb', id: null, x: tl.x, y: tl.y, active: true });
    };
    const onUp = (ev) => {
      if (ev.pointerId !== info.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      try { el.releasePointerCapture(info.pointerId); } catch {}
      orbDragRef.current = null;
      setDrag(null);
      if (!info.moved) return; // plain tap — the click handler runs
      suppressClickRef.current = Date.now();
      const next = iconPxToFrac({ x: info.x, y: info.y }, window.innerWidth, window.innerHeight, SIZE);
      setOrbFrac(next);
      setOrbCustom(true);
      const { pins, box } = stateRef.current;
      persist(next, pins, box);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // --- press & hold drag engine (tiles) -------------------------------
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
      const { orb, pins, box } = stateRef.current;

      if (id) {
        const nextPins = { ...pins };
        if (onOrb) delete nextPins[id]; // dropped home
        else nextPins[id] = toFrac(dropPx);
        setPinsFrac(nextPins);
        persist(orb, nextPins, box);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // --- box drag engine ------------------------------------------------
  // The glass box itself is movable (Merlin, 2026-10-22: "concourse
  // should be able to be moved to any place on the screen by any
  // user"). Before this, only the Orb could move — and only via a
  // 2-second hold nobody could discover — while the box stayed
  // welded above it. Now: press the box's title bar and drag, no
  // hold required; a sub-4px press is still a tap (the minimize
  // button and the Doomsday strip keep their own tap targets — the
  // handler stands down over buttons and links). The drop spot is
  // stored as viewport fractions of the box's top-left corner over
  // its free span, persisted through the same path as the Orb, so
  // the box follows the user across sessions and devices.
  const beginBoxDrag = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('button, a')) return;
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const w = rect.width;
    const h = rect.height;
    setBoxH(h);
    let cur = { x: startLeft, y: startTop };
    let moved = false;
    const clampBox = (x, y) => ({
      x: Math.min(Math.max(4, x), Math.max(4, window.innerWidth - w - 4)),
      y: Math.min(Math.max(4, y), Math.max(4, window.innerHeight - h - 4)),
    });
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      cur = clampBox(startLeft + dx, startTop + dy);
      setBoxDrag(cur);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setBoxDrag(null);
      if (!moved) return;
      const frac = {
        x: clamp01(cur.x / Math.max(1, window.innerWidth - w)),
        y: clamp01(cur.y / Math.max(1, window.innerHeight - h)),
      };
      setBoxFrac(frac);
      const { orb, pins } = stateRef.current;
      persist(orb, pins, frac);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Keep the box's measured height current while it is open — the
  // fraction math needs it, and the box's height changes with the
  // tile count and the season strip.
  useEffect(() => {
    if (!open || !boxRef.current) return;
    const h = boxRef.current.offsetHeight;
    setBoxH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  });

  const tapGuard = () => Date.now() - suppressClickRef.current < 350;

  if (!mounted || !orbFrac || !viewport.w) return null;

  const visibleTiles = TILES.filter((t) => !t.hubOnly || onHub);
  const boxedTiles = visibleTiles.filter((t) => !pinsFrac[t.id]);
  const orbPx = toPx(orbFrac);
  const yieldLift = bikeOut && !orbCustom ? 270 : 0;
  // While the Orb is being dragged, drag x/y are its clamped
  // top-left px (see beginOrbDrag); otherwise it renders at its
  // remembered fractions, lifted clear of the bike controls when
  // the user has never placed it themselves.
  const orbDragPx = drag?.active && drag.kind === 'orb' ? { x: drag.x, y: drag.y } : null;
  const orbRenderY = orbDragPx ? orbDragPx.y : orbPx.y - yieldLift;

  // Phone overlap repair (2026-10-27): on narrow viewports the
  // 282px floating box left page content showing beside it and
  // its 55% glass let the page ghost through. On phones the full
  // panel spans the viewport (10px margins) with a solid back so
  // nothing shows through or beside it; the minimized Orb widget
  // keeps floating. Desktop keeps the 4-tile glass box.
  const isPhone = viewport.w > 0 && viewport.w < 640;
  const boxW = isPhone ? viewport.w - 20 : 4 * SIZE + 3 * 10 + 28; // 4 tiles per row + gaps + padding
  const boxX = Math.max(10, Math.min(orbPx.x + SIZE - boxW, viewport.w - boxW - 10));
  // The box anchors by its BOTTOM edge, 12px above the Orb — height
  // is whatever the tiles need, and it can never slide down over the
  // Orb or its own footer text (Merlin's screenshot, 2026-10-20).
  const boxBottom = viewport.h - (orbPx.y - yieldLift) + 12;
  // A user-placed box (dragged by its title bar) overrides the Orb
  // anchor entirely: it renders at its stored fractions, clamped
  // fully on screen, and stays there until dragged again.
  const boxEffH = boxH || 220;
  const boxPx = boxDrag || (boxFrac ? {
    x: Math.min(Math.max(4, boxFrac.x * Math.max(0, viewport.w - boxW)), Math.max(4, viewport.w - boxW - 4)),
    y: Math.min(Math.max(4, boxFrac.y * Math.max(0, viewport.h - boxEffH)), Math.max(4, viewport.h - boxEffH - 4)),
  } : null);
  const boxStyle = boxPx
    ? { left: boxPx.x, top: boxPx.y, width: boxW }
    : { left: boxX, bottom: boxBottom, width: boxW };

  const dragTile = drag?.active && drag.kind === 'tile' && drag.id ? TILES.find((t) => t.id === drag.id) : null;

  const tileButton = (tile, { pinned = false } = {}) => {
    const isDragging = drag?.active && drag.id === tile.id;
    return (
      <button
        key={tile.id}
        type="button"
        aria-label={`${tile.title || tile.label}${pinned ? ' (pinned to hub)' : ''}`}
        title={tile.title || tile.label}
        onPointerDown={(e) => beginPress('tile', tile.id, e)}
        onClick={() => { if (!tapGuard()) fireTile(tile); }}
        className={`ui-element pointer-events-auto relative flex flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-md transition-all active:scale-95 select-none touch-none ${pinned ? '' : 'w-full'} ${
          isDragging
            ? 'border-cyan-300 bg-cyan-400/30 scale-110 shadow-[0_0_28px_rgba(0,242,255,0.55)]'
            : 'border-white/15 bg-white/[0.06] hover:border-cyan-300/50 hover:bg-cyan-400/10 shadow-[0_4px_18px_rgba(0,0,0,0.35)]'
        }`}
        style={pinned ? { width: SIZE, height: SIZE } : { height: SIZE }}
      >
        {/* TRON plate (Merlin, 2026-10-21): the dark circuit plate
            skins every tile; its cyan ring frames the emblem, the
            label rides the plate's black lower fade. */}
        <img
          src="/concourse-icons/tile-plate.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl object-cover"
        />
        <TileGlyph tile={tile} />
        <span className="relative z-10 text-[8.5px] font-black tracking-[0.14em] uppercase text-zinc-200">{tile.label}</span>
        {tile.soon && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-400 px-1.5 py-px text-[7.5px] font-black tracking-wider text-zinc-950">SOON</span>
        )}
        {tile.important && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-red-500 px-1.5 py-px text-[7.5px] font-black tracking-wider text-white">IMPORTANT</span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Layer 2 · The Concourse (glass box) — the header (title +
          minimize) is PINNED above the tile scroll area, so the
          minimize control can never scroll out of reach on a small
          phone, and the title bar doubles as the box's drag handle. */}
      {open && (
        <div
          ref={boxRef}
          role="dialog"
          aria-label="The Concourse"
          className={`ui-element fixed z-[58] flex max-h-[calc(100dvh-110px)] flex-col overflow-hidden rounded-3xl border border-cyan-200/25 ${isPhone ? 'bg-zinc-950' : 'bg-zinc-950/55'} p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.55),0_0_35px_rgba(0,242,255,0.10)] backdrop-blur-xl`}
          style={boxStyle}
        >
          {/* Backdrop: the user's chosen Concourse background under
              a scrim of the glass's own darkness. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
            <ConcourseBackdrop bg={bgPref} />
            <div className="absolute inset-0 bg-zinc-950/55" />
          </div>
          <div className="relative flex min-h-0 flex-col">
          <div className="shrink-0">
          {/* The golden Doomsday countdown crowns the Concourse
              (Merlin, 2026-10-20) — hub-only, self-removing Dec 11. */}
          <DoomsdayStrip />
          <div
            onPointerDown={beginBoxDrag}
            title="Drag to move the Concourse"
            className="mb-2.5 flex cursor-grab touch-none select-none items-center justify-between px-0.5 active:cursor-grabbing"
          >
            <div className="text-[10px] font-black tracking-[0.3em] uppercase text-cyan-200">
              <span aria-hidden="true" className="mr-1.5 tracking-normal text-cyan-400/70">⠿</span>The Concourse
            </div>
            <div className="flex items-center gap-2">
              <AnnouncementsBell hasUnread={hasUnread} onOpen={() => setNotifOpen(true)} />
              <button
                type="button"
                aria-label="Minimize the Concourse"
                onClick={() => setOpen(false)}
                className="ui-element pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-white hover:border-cyan-300/60 transition-all"
              >
                <span aria-hidden="true" className="text-xs leading-none">—</span>
              </button>
            </div>
          </div>
          </div>
          <div className="min-h-0 overflow-y-auto">
          {/* FEATURED — the Social Media Cheat Code room sits at
              the top of the Concourse box (Merlin, 2026-10-26:
              featured on every portal entry point), above the
              ordinary tiles. Tapping it closes the box and walks
              into the room. */}
          <div className="mb-2.5" onClick={() => setOpen(false)}>
            <CheatCodeFeatured />
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
                <span className="block">Drag the title bar → put the Concourse anywhere. It stays where you leave it.</span>
                <span className="block">Hold a tile 2s → pin it out on the hub. Drop it on the Orb to send it home.</span>
                <span className="block">Drag the Orb → put it anywhere. It stays where you leave it.</span>
              </>
            )}
          </div>
          {/* Bottom bar of the Concourse (Merlin, 2026-10-20 +
              round 3, 2026-10-23): the season badge — hub-only,
              like its old floating form; renders nothing out of
              season — now a GUIDE button, beside the radio
              mini-player, the radio's living face in the box.
              One flex row with gaps and wrapping: nothing
              overlaps, nothing is positioned over anything. */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
            {onHub && <SeasonBadge inline onGuide={handleSeasonGuide} />}
            <ConcourseRadio />
            {/* The backpack, opened from the hub — a flow item in
                this row, never overlapping the badge or radio.
                Its home slot: docked in this row next to the
                hub's main controls. */}
            <BackpackHud realm="hub" realmLabel="the hub" docked
              displayNote="The hub keeps its own arms — the pack rides along." />
          </div>
          </div>
          </div>
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
      {drag?.active && drag.kind === 'tile' && drag.id && dragTile && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[59] flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-cyan-300 bg-cyan-400/30 backdrop-blur-md shadow-[0_0_28px_rgba(0,242,255,0.55)]"
          style={{ left: drag.x - SIZE / 2, top: drag.y - SIZE / 2, width: SIZE, height: SIZE }}
        >
          <img
            src="/concourse-icons/tile-plate.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl object-cover"
          />
          <TileGlyph tile={dragTile} />
          <span className="relative z-10 text-[8.5px] font-black tracking-[0.14em] uppercase text-white">{dragTile?.label}</span>
        </div>
      )}

      {/* Layer 3 · the Cloud Phone frame (Phone tile) */}
      <PhoneFrame open={phoneOpen} onClose={() => setPhoneOpen(false)} />

      {/* Layer 3 · Concourse Settings sheet */}
      <ConcourseSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} bg={bgPref} onApplyBg={applyBg} settings={uiSettings} onApplySettings={applySettings} />

      {/* Layer 3 · Portals 3D — the 3D portal hall (minimized
          portals, expanded on tap) */}
      <ConcoursePortals open={portal3dOpen} onClose={() => setPortal3dOpen(false)} />
      <Travelator open={travelatorOpen} onClose={() => setTravelatorOpen(false)} />
      {/* Notifications (Merlin, 2026-10-29): the bell's menu, whose
          Announcements portal button hosts every past broadcast. */}
      <AnnouncementsMenu open={notifOpen} onClose={() => setNotifOpen(false)} onSeen={markAnnouncementsSeen} />

      {/* Layer 3 · FINTRAC explanation — the host lives here so the
          modal survives route changes for the whole app session
          (one auto-show per load) and any menu entry can re-open
          it via the event, from any page. */}
      <FintracExplanationHost
        onTakeTour={() => setTravelatorOpen(true)}
        bgUrl={bgPref?.kind === 'image' && bgPref.url ? bgPref.url : CONCOURSE_BG_ART}
      />

      {/* Layer 1 · Concourse Orb */}
      <button
        ref={orbRef}
        type="button"
        aria-label={open ? 'Minimize the Concourse' : 'Open the Concourse'}
        title="The Concourse — drag to move"
        onPointerDown={beginOrbDrag}
        onClick={() => { if (!tapGuard()) { setNote(''); setOpen((o) => !o); } }}
        className={`ui-element pointer-events-auto fixed z-[58] flex items-center justify-center rounded-full border backdrop-blur-xl transition-shadow select-none touch-none ${
          drag?.active && drag.kind === 'orb'
            ? 'border-cyan-300 bg-cyan-950/80 shadow-[0_0_34px_rgba(0,242,255,0.6)]'
            : 'border-cyan-200/40 bg-zinc-950/70 shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_22px_rgba(0,242,255,0.22)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_30px_rgba(0,242,255,0.4)]'
        }`}
        style={{
          left: orbDragPx ? orbDragPx.x : orbPx.x,
          top: orbRenderY,
          width: SIZE,
          height: SIZE,
        }}
      >
        <OrbFace />
      </button>
    </>
  );
}
