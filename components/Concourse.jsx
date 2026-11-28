'use client';

// The Concourse — the hub's one glass holoframe for every floating
// function (Merlin, 2026-10-20). A 3-layer system:
//   Layer 1 · Concourse Orb — the one button on the hub; it opens
//             the merged menu now (Nov 18, 2026 merge: "Concourse
//             becomes the portal menu" — the Concourse landing IS
//             the portal menu, with the Concourse's own tile menu
//             beside it as the second panel)
//   Layer 2 · The merged menu — the portal menu + the tile menu,
//             in components/ConcoursePortals.jsx
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
//   The Concourse  — the merged menu (components/ConcoursePortals.jsx):
//                    the portal menu by default, the Concourse's own
//                    tile menu a swipe away. Click the Orb to open it;
//                    close it from its header or its backdrop. The old
//                    glass box is gone (Nov 18, 2026 merge) — its tiles
//                    live in the tile panel, its chrome re-homed there
//                    and in the header.
//   Tiles          — ALL the same 56×56, in composed order. They live
//                    in the merged menu's tile panel (as video cards,
//                    lib/concourse-actions.js) and as pins on the hub;
//                    TILES below is the pin source and the fireTile map.
//                    Hub (→ /, every page — the way home, Merlin
//                    2026-10-22), Portals, Tour, Intro, Guide,
//                    Portals (the flat portal grid), Night Grid,
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
//     Console (80), program menu (40000) and modal layers — the Orb
//     and the pins live here; the merged menu itself is z-[62]
//   - the Orb anchors bottom-right with safe-area insets; never
//     covers the left-half joystick zone
//   - YIELD: while the Earth bike is out, the Orb (if the user never
//     dragged it) slides up clear of the BikeControls cluster
//   - pointer events only on the glass itself

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { bikeState } from '@/lib/earth/parachute';
import PhoneFrame from './PhoneFrame';
import ConcourseSettings from './ConcourseSettings';
import { fireFintracExplanation, FintracExplanationHost } from './FintracExplanation';
import { CONCOURSE_BG_ART, resolveConcourseBg } from '@/lib/concourse-bg';
import { resolveUiSettings, readUiSettingsCache, writeUiSettingsCache, UI_SETTINGS_EVENT } from '@/lib/ui-settings';
import { isIconDrag, clampIconPx, iconFracToPx, iconPxToFrac, dragIconTopLeft, resolveIconPosition } from '@/lib/concourse-icon';
import { useVortexTravel } from './VortexTravel';
import HubPulseGlow from './HubPulseGlow';
import { HUB_LOADED_EVENT, shouldMountConcoursePortals } from '@/lib/hub-loaded';

// Layer 3 · Portals — loaded only when its tile is first tapped,
// so the portal menu never enters the layout's eager bundle (Concourse
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

// Season guide (Merlin, round 3, 2026-10-23): the season badge,
// tapped in the merged menu's tile chrome row, asks the hub to light
// the way to the season's house function. PumpkinHarvest (inside the Canvas)
// is the Halloween listener — it answers with a golden beacon on
// the first unharvested pumpkin.
export const SEASON_GUIDE_EVENT = 'olympus:season-guide';
// Baseball-orb yield event (Nov 27, 2026): app/page.jsx dispatches
// this on the house bus whenever a baseball orb (SWING in freeroam,
// QUIT in flight) is up, { visible }. The Concourse icon listens
// and lifts clear while it lasts — see yieldLift below.
export const BASEBALL_ORB_EVENT = 'olympus:hub-baseball-orb';

// Tile order is composed in four visual movements (Merlin,
// 2026-10-20 — "reorder the icons for best aesthetic pleasure"):
//   Journey · Hub, Menu, Tour, Intro, Guide — the way in
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
// On the hub itself it simply closes the merged menu and stays home. Its
// face is the Orb artwork — the hub's own emblem.
const TILES = [
  { id: 'hub', label: 'Hub', icon: '⌂', art: '/concourse-icons/orb.webp' },
  // Menu (was 'Portals', Nov 16, 2026 merge): this tile toggles the
  // hub program menu — it never opened the portal menu, and the
  // name said otherwise. Exactly one tile is called Portals now,
  // and it opens the 3D hall.
  { id: 'portals', label: 'Menu', icon: '☰', hubOnly: true },
  { id: 'tour', label: 'Tour', icon: '🗺️', art: '/concourse-icons/tour.webp' },
  { id: 'intro', label: 'Intro', icon: '↺', art: '/concourse-icons/intro.webp', hubOnly: true },
  { id: 'guide', label: 'Guide', icon: '?', art: '/concourse-icons/guide.webp', hubOnly: true },
  // Portals — the ONE Portals entry (Nov 16, 2026 merge: the 2D
  // Portal Room is gone). Opens the Portals menu, the one menu.
  { id: 'portalroom', label: 'Portals', icon: 'Ω' },
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
  { id: 'molly', label: 'ARES', icon: '🛡️' },
];

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const isFrac = (v) => v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y);

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { orb: null, pins: {}, bg: null };
    const parsed = JSON.parse(raw);
    const orb = isFrac(parsed?.orb) ? parsed.orb : null;
    const pins = {};
    if (parsed?.pins && typeof parsed.pins === 'object') {
      for (const [id, v] of Object.entries(parsed.pins)) if (isFrac(v)) pins[id] = v;
    }
    const bg = parsed?.bg && typeof parsed.bg === 'object' ? parsed.bg : null;
    return { orb, pins, bg };
  } catch {
    return { orb: null, pins: {}, bg: null };
  }
}

// Merge a new backdrop into the local cache without disturbing the
// orb/pins/box the drag engines own.
function writeLocalBg(bg) {
  try {
    const l = loadLocal();
    localStorage.setItem(LS_KEY, JSON.stringify({ orb: l.orb, pins: l.pins, bg }));
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




// Portals deep link (?portals3d=1 — Nov 16, 2026 merge; the param
// is kept as-is by the Nov 18 flat rework): the
// Omega Arch, the Earth 2 back link, the oblivion waiting page,
// the floor-drop fallback and the /portal-room redirect all land
// here instead of a page that no longer exists. The Concourse is
// mounted in the root layout, so it is the one place that can open
// the menu from any entry point — including a same-page ride, where
// the hub page never remounts. useSearchParams lives in this tiny
// Suspense-wrapped child so the layout itself stays static; the
// param is consumed (history.replaceState) once the menu opens, so
// a reload never re-opens it.
function Portals3dDeepLink({ onOpen }) {
  const searchParams = useSearchParams();
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    if (searchParams?.get('portals3d') !== '1') return;
    appliedRef.current = true;
    onOpen();
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('portals3d');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }, [searchParams, onOpen]);
  return null;
}

export default function Concourse() {
  const router = useRouter();
  const pathname = usePathname();
  const onHub = pathname === '/';
  // Concourse tiles ride the vortex like every other entry point
  // (Merlin, 2026-10-29).
  const { travel, overlay: vortexOverlay } = useVortexTravel();

  const [mounted, setMounted] = useState(false);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [orbFrac, setOrbFrac] = useState(null); // {x, y} fractions
  const [orbCustom, setOrbCustom] = useState(false);
  const [pinsFrac, setPinsFrac] = useState({}); // tileId -> {x, y}
  const [drag, setDrag] = useState(null); // {kind, id, x, y, active} px
  const [bikeOut, setBikeOut] = useState(false);
  const [baseballOut, setBaseballOut] = useState(false); // a baseball orb (SWING/QUIT) owns the bottom-right
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [bgPref, setBgPref] = useState({ kind: 'default' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [portal3dOpen, setPortal3dOpen] = useState(false);
  // Deep link (?portals3d=1): open the menu straight from the URL.
  const openPortals3d = useCallback(() => {
    setPortal3dOpen(true);
  }, []);
  // Hub-loaded gate (Merlin, 2026-11-19 — "don't load concourse
  // until after the main hub finishes loading"): on the hub, the
  // portal menu mounts only after the main hub scene signals it
  // finished loading, so its 42 autoplay videos never start decoding
  // while the 3D scene is still mounting (his diagnosis: graphics
  // overload). Off the hub there is no scene to wait for, so the menu
  // mounts as before. A tap on the Orb (or the ?portals3d=1 deep
  // link) before the signal still records the intent in
  // portal3dOpen — the menu appears the moment the hub is up.
  const [hubLoaded, setHubLoaded] = useState(false);
  useEffect(() => {
    const onHubLoaded = () => setHubLoaded(true);
    window.addEventListener(HUB_LOADED_EVENT, onHubLoaded);
    return () => window.removeEventListener(HUB_LOADED_EVENT, onHubLoaded);
  }, []);
  const [travelatorOpen, setTravelatorOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState({ sound: true });

  const dragRef = useRef(null);
  const orbDragRef = useRef(null);
  const suppressClickRef = useRef(0);
  const orbRef = useRef(null);
  const saveTimerRef = useRef(null);
  const saveBgTimerRef = useRef(null);
  const saveSettingsTimerRef = useRef(null);
  const stateRef = useRef({ orb: null, pins: {}, custom: false });
  stateRef.current = { orb: orbFrac, pins: pinsFrac, custom: orbCustom, bg: bgPref };

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
      localStorage.setItem(LS_KEY, JSON.stringify({ orb, pins, bg: stateRef.current.bg }));
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

  // Yield rule: a baseball orb owns the bottom-right while it is up
  // (SWING in freeroam, QUIT in flight — app/page.jsx announces it
  // on BASEBALL_ORB_EVENT). Same pattern as the bike rule: the icon
  // lifts clear, unless the user placed it themselves (orbCustom).
  useEffect(() => {
    const onBaseballOrb = (e) => setBaseballOut(!!e?.detail?.visible);
    window.addEventListener(BASEBALL_ORB_EVENT, onBaseballOrb);
    return () => window.removeEventListener(BASEBALL_ORB_EVENT, onBaseballOrb);
  }, []);

  const fireTile = useCallback(
    (tile) => {
      if (tile.id === 'tour') {
        setTravelatorOpen(true);
        setPortal3dOpen(false);
        return;
      }
      if (tile.id === 'hub') travel('/', 'Hub');
      else if (tile.id === 'molly') travel('/ares', 'ARES');
      else if (tile.id === 'store') travel('/store', 'Store');
      else if (tile.id === 'renewal') travel('/renewal-plan', 'Renew');
      else if (tile.id === 'calls') travel('/order-67', 'Calls'); // Holographic Calls
      else if (tile.id === 'settings') { setSettingsOpen(true); setPortal3dOpen(false); return; }
      else if (tile.id === 'phone') { setPhoneOpen(true); setPortal3dOpen(false); return; }
      else if (tile.id === 'portalroom') { setPortal3dOpen(true); return; }
      else if (tile.id === 'fintrac') { fireFintracExplanation(4); setPortal3dOpen(false); return; }
      else fireConcourseTile(tile.id);
      setPortal3dOpen(false);
    },
    [router, travel]
  );

  // Season guide (Merlin, round 3): the badge in the tile chrome row is
  // a button now. For Halloween it fires the guide event
  // PumpkinHarvest listens for (a golden beacon on the first
  // unharvested pumpkin) and closes the merged menu, so the hub — and the
  // beacon — are what the user sees. Every other season has no
  // guide target yet: the tap lands on the badge's pressed state
  // and nothing else happens. No fake guides.
  const handleSeasonGuide = useCallback((seasonKey) => {
    if (seasonKey !== 'halloween') return;
    try {
      window.dispatchEvent(new CustomEvent(SEASON_GUIDE_EVENT, { detail: { season: seasonKey } }));
    } catch {}
    setPortal3dOpen(false);
  }, []);

  // The hub program menu (god menus) is a layer the merged menu
  // toggles, not a panel inside it (Nov 18, 2026 merge): close the
  // merged menu, then fire the Menu tile's old toggle event.
  const handleTogglePrograms = useCallback(() => {
    setPortal3dOpen(false);
    fireConcourseTile('portals');
  }, []);

  // Pin a tile out from the merged menu's tile panel (hold 2s on a
  // card): it lands at a cascading default spot near the top-left
  // and the user can re-drag it from there (hold 2s on the pin).
  const handlePinTile = useCallback((tileId) => {
    if (pinsFrac[tileId]) return; // already pinned — a hold is a no-op
    const count = Object.keys(pinsFrac).length;
    const next = {
      ...pinsFrac,
      [tileId]: {
        x: clamp01(0.05 + 0.07 * (count % 5)),
        y: clamp01(0.08 + 0.07 * Math.floor(count / 5)),
      },
    };
    setPinsFrac(next);
    const { orb } = stateRef.current;
    persist(orb, next);
  }, [pinsFrac, persist]);

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
      const { pins } = stateRef.current;
      persist(next, pins);
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
      const { orb, pins } = stateRef.current;

      if (id) {
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
  const orbPx = toPx(orbFrac);
  // Yield lift, px the icon rises above its remembered spot.
  // Bike: 270, clears the bike controls while riding.
  // Baseball: 272 (Nov 27, 2026 — glider push 3 correction: the
  // first 176 assumed the glider picker was ONE 40 px row at
  // bottom 216, top edge 256. It is a VERTICAL stack — flex-col
  // gap-2, 3 x 40 px orbs at bottoms 216/264/312, so its real top
  // edge is bottom 352, and 176 left the icon overlapping the top
  // two picker orbs by 16/32 px live at 390 + 320). The icon's
  // default anchor is bottom 96; the baseball orbs sit at right 18,
  // bottom 80 (SWING 56 tall, QUIT 96 tall), and the glider stack
  // above them runs SUMMON at bottom 148 with the vertical picker
  // at bottom 216 (top edge bottom 352). Bottom 96 + 272 =
  // bottom 368, which clears the picker's top edge by 16 px,
  // SUMMON by 164 px, QUIT by 192 px and SWING by 232 px — one
  // lift covers the whole right column, at any viewport height
  // (all of these are bottom-anchored). The lift applies only
  // while a baseball orb is up AND the user never placed the icon
  // themselves (!orbCustom) — a dragged icon stays exactly where
  // the user left it, same as the bike rule. (The bike and baseball
  // lifts never sum: SWING shows only in hub_freeroam, the bike
  // lift only in on_bike.)
  const yieldLift = (bikeOut && !orbCustom ? 270 : 0) + (baseballOut && !orbCustom ? 272 : 0);
  // While the Orb is being dragged, drag x/y are its clamped
  // top-left px (see beginOrbDrag); otherwise it renders at its
  // remembered fractions, lifted clear of the bike controls when
  // the user has never placed it themselves.
  const orbDragPx = drag?.active && drag.kind === 'orb' ? { x: drag.x, y: drag.y } : null;
  const orbRenderY = orbDragPx ? orbDragPx.y : orbPx.y - yieldLift;


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

      {/* Layer 3 · Portals — the flat portal grid (tap a portal to
          be sucked into its video). Mounts only after the hub-loaded
          signal on the hub (see the gate above) — before that, not
          even its chunk downloads, so no portal video starts
          decoding while the 3D scene is still mounting. */}
      {shouldMountConcoursePortals({ hubLoaded, onHub }) && (
      <ConcoursePortals
        open={portal3dOpen}
        onClose={() => setPortal3dOpen(false)}
        onHub={onHub}
        onConcourseAction={(tileId) => fireTile({ id: tileId })}
        onTogglePrograms={handleTogglePrograms}
        onSeasonGuide={handleSeasonGuide}
        onPinTile={handlePinTile}
      />
      )}
      <Suspense fallback={null}>
        <Portals3dDeepLink onOpen={openPortals3d} />
      </Suspense>
      <Travelator open={travelatorOpen} onClose={() => setTravelatorOpen(false)} />
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
        aria-label="Open the Concourse"
        title="The Concourse — drag to move"
        onPointerDown={beginOrbDrag}
        onClick={() => { if (!tapGuard()) { setPortal3dOpen(true); } }}
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
        {/* Hub pulse glow (Merlin, Nov 27, 2026): the hub icon does
            the same 30 s glow as the FLIGHT AXIS pill, on the same
            clock — only while in the hub (pathname '/'). A separate
            ring element, so the orb's own transition-shadow states
            (drag / hover) are untouched. */}
        {pathname === '/' && <HubPulseGlow />}
        <OrbFace />
      </button>
      {vortexOverlay}
    </>
  );
}
