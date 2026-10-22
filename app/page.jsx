'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Auth from '@/components/Auth';
import { supabase } from '@/lib/supabase';
import { LanguageProvider, useI18n } from '@/lib/i18n';
import { SATELLITES } from '@/lib/i18n/satellites';
import SatelliteMenu from '@/components/SatelliteMenu';
import { MenuHeaderDecor } from '@/components/PortalSeasonalDecor';
import { orbitTime, orbitPositionFor, PLANETS } from '@/lib/god-orbits';
import { GOD_TOWER_SPOTS, GOD_TOWER_POS, BABEL_POS, ARTEMIS_POS } from '@/lib/home-positions';
import SettingsGear from '@/components/SettingsGear';
import { fetchRiderState, saveRiderState, DISMOUNT_EYE } from '@/lib/rider-state';
import ProfileIcon from '@/components/ProfileIcon';
import NotificationsWindow from '@/components/NotificationsWindow';
import EntranceSequence from '@/components/EntranceSequence';
import { createEntranceMachine } from '@/lib/entrance-sequence';
import EarthConsole from '@/components/EarthConsole';
import { generateMarsProfile } from '@/lib/mars/engine';
import { planetSeedFor } from '@/lib/planets/planet-seeds';
import { generatePlanetProfile } from '@/lib/planets/profiles';
import { getUserPosition, FALLBACK_POSITION } from '@/lib/geo';
import { roamState, beginRoam, endRoam, landmarkSpawns } from '@/lib/earth/roam';
import { beginParachuteDive } from '@/lib/earth/parachute';
import { QUANTUM_ENABLED } from '@/lib/earth/quantum';
import { fx, unlockFx } from '@/lib/fx';
import { shadowRealmUrl } from '@/app/shadow-realm/launch';
import { useTilt } from '@/lib/use-tilt';
import { useRadio } from '@/components/radio/RadioProvider';
import HubTutorial from '@/components/HubTutorial';
import {
  shouldShowHubTutorial,
  isHubTutorialSeen,
  markHubTutorialSeen,
  stashHubRegisteredAt,
  resolveHubRegisteredAt,
} from '@/lib/hub-tutorial';

const HomeScene = dynamic(() => import('@/components/HomeScene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#050505]" aria-hidden="true" />,
});

// MarsConsole pulls in the Mars scene module (TouchControls), so it
// rides the same client-only dynamic path as HomeScene — the three.js
// stack stays out of the page's static bundle.
const MarsConsole = dynamic(() => import('@/components/MarsConsole'), {
  ssr: false,
});

// PlanetConsole rides the same client-only path (it also pulls in
// the Mars scene module for TouchControls).
const PlanetConsole = dynamic(() => import('@/components/PlanetConsole'), {
  ssr: false,
});

function NexusHub() {
  const router = useRouter();
  const { t } = useI18n();

  const POS_MAP = useMemo(
    () => ({ ...GOD_TOWER_POS, BABEL_POS, ARTEMIS_POS }),
    []
  );

  const [appState, setAppState] = useState('hub_intro');
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [user, setUser] = useState(null);
  const [cloudOffline, setCloudOffline] = useState(false);
  const [cloudNoteDismissed, setCloudNoteDismissed] = useState(false);

  const [showIntro, setShowIntro] = useState(false);
  const [bgVideoOk, setBgVideoOk] = useState(true);
  const [sweepDone, setSweepDone] = useState(false);
  
  useEffect(() => {
    if (appState === 'hub_freeroam' && !sweepDone) setSweepDone(true);
  }, [appState, sweepDone]);

  // The Concourse's hub tiles drive the hub's own functions from
  // here: Portals toggles the program menu; Intro / Guide replay the
  // intro and tutorial; Night launches the Shadow Realm race; Bike
  // toggles the TRON bike. Phase-gated to the states where those
  // controls used to live on the hub itself.
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  useEffect(() => {
    const HUB = ['hub_intro', 'hub_freeroam'];
    const RIDE = ['hub_intro', 'hub_freeroam', 'to_bike', 'on_bike'];
    const handler = (e) => {
      const tile = e?.detail?.tile;
      const state = appStateRef.current;
      if (tile === 'portals') {
        setIsMenuExpanded((expanded) => {
          if (!expanded) { try { fx.menuOpen(); } catch {} }
          return !expanded;
        });
      } else if (tile === 'intro' && HUB.includes(state)) {
        fx.tap(); setShowIntro(true);
      } else if (tile === 'guide' && HUB.includes(state)) {
        fx.tap(); setShowHubTutorial(true);
      } else if (tile === 'night' && RIDE.includes(state)) {
        fx.bikeMount();
        launchPocketUniverse(shadowRealmUrl('race'), 'shadow-realm', null, null);
      } else if (tile === 'bike' && RIDE.includes(state)) {
        toggleBike();
      }
    };
    window.addEventListener('olympus:concourse-open', handler);
    return () => window.removeEventListener('olympus:concourse-open', handler);
  });
  
  const introAutoPlayed = useRef(false);
  useEffect(() => {
    if ((user || cloudOffline) && !introAutoPlayed.current) {
      introAutoPlayed.current = true;
      try {
        const m = createEntranceMachine(typeof window !== 'undefined' ? window.localStorage : null);
        if (m.shouldAutoPlay()) setShowIntro(true);
      } catch {
        setShowIntro(true);
      }
    }
  }, [user, cloudOffline]);

  const [showHubTutorial, setShowHubTutorial] = useState(false);
  useEffect(() => {
    if (!(user || cloudOffline)) return;
    if (showIntro) return;
    if (isHubTutorialSeen()) return;
    if (shouldShowHubTutorial({ seen: false, now: new Date(), registeredAt: resolveHubRegisteredAt() })) {
      setShowHubTutorial(true);
    }
  }, [user, cloudOffline, showIntro]);

  const targetRouteRef = useRef('');
  const adWindowRef = useRef(null);

  const [activeSatTarget, setActiveSatTarget] = useState(GOD_TOWER_SPOTS[0].pos);
  const [flightAxis, setFlightAxis] = useState('horizontal');
  const savedSpawnRef = useRef(null);

  const earthQuatRef = useRef(null);
  const [earthFocus, setEarthFocus] = useState(null);
  const [pendingDest, setPendingDest] = useState(null);
  // Selected tile for the DROP button (tap a tile, then hit DROP to parachute)
  const [selectedTile, setSelectedTile] = useState(null);

  const beginEarthDive = () => {
    if (appState !== 'hub_freeroam') return;
    fx.earthDive();
    setEarthFocus({ ...FALLBACK_POSITION, label: t('earth.locating') });
    setAppState('diving_to_earth');
    getUserPosition().then((pos) => {
      if (pos) setEarthFocus({ lat: pos.lat, lon: pos.lon, label: t('earth.yourLocation') });
      else setEarthFocus({ ...FALLBACK_POSITION });
    });
  };

  // Communiverse deep link (Merlin, 2026-10-22): Earth is the first planet
  // of the Communiverse, and clicking it there lands here with
  // ?enter=earth — dive straight to Earth as soon as freeroam is live,
  // exactly as if the Earth planet had been tapped in the hub.
  const earthDeepLinkRef = useRef(false);
  useEffect(() => {
    if (earthDeepLinkRef.current) return;
    if (!(user || cloudOffline)) return;
    if (appState !== 'hub_freeroam') return;
    try {
      if (new URLSearchParams(window.location.search).get('enter') === 'earth') {
        earthDeepLinkRef.current = true;
        beginEarthDive();
      }
    } catch { /* a malformed URL must never break the hub */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cloudOffline, appState]);

  // Mars realm (Merlin, 2026-10-21): the seeded exobiology surface
  // lives INSIDE the hub's Mars planet — tap the planet in freeroam
  // and dive in without leaving this page, exactly like Earth. The
  // standalone /mars page stays as a second door. Realm state is
  // owned here and passed to both the DOM console (MarsConsole) and
  // the scene (HomeScene renders MarsRealmContent in the hub Canvas).
  const marsInputRef = useRef({ keys: { fwd: false, back: false, left: false, right: false, up: false, down: false } });
  const [marsSeed, setMarsSeed] = useState('MARS-PRIME');
  const [marsTime, setMarsTime] = useState(0.32);
  const [marsMode, setMarsMode] = useState('orbit');
  const [marsSelected, setMarsSelected] = useState(null);
  const [marsFocusReq, setMarsFocusReq] = useState(null);
  const marsProfile = useMemo(() => generateMarsProfile(marsSeed), [marsSeed]);

  const beginMarsDive = () => {
    if (appState !== 'hub_freeroam') return;
    setAppState('mars_surface');
  };

  const exitMars = () => { setAppState('hub_freeroam'); };

  const selectMars = (sel) => {
    setMarsSelected(sel || null);
    if (sel && marsMode === 'orbit') {
      setMarsFocusReq({ pos: sel.pos, nonce: Date.now() });
    }
  };

  const toggleMarsMode = (m) => {
    setMarsMode((prev) => (prev === m ? 'orbit' : m));
  };

  // Planet realms (Merlin, 2026-10-22 — the Planet Program): every
  // outer planet is clickable into its own in-hub surface realm,
  // following the Mars architecture exactly — this page owns the
  // realm state, HomeScene swaps the hub fragment for
  // PlanetRealmContent on 'planet_surface', and PlanetConsole is the
  // DOM shell. The difference from Mars: a planet's seed is
  // CANONICAL (lib/planets/planet-seeds.js), so there is no seed
  // state to edit — the profile is derived from the active planet.
  // Mars and Earth keep their own doors, untouched.
  const planetInputRef = useRef({ keys: { fwd: false, back: false, left: false, right: false, up: false, down: false } });
  const [activePlanet, setActivePlanet] = useState(null);
  const [planetTime, setPlanetTime] = useState(0.32);
  const [planetMode, setPlanetMode] = useState('orbit');
  const [planetSelected, setPlanetSelected] = useState(null);
  const [planetFocusReq, setPlanetFocusReq] = useState(null);
  const planetSeedEntry = activePlanet ? planetSeedFor(activePlanet) : null;
  const planetProfile = useMemo(() => {
    if (!activePlanet || !planetSeedEntry) return null;
    const planet = PLANETS.find((p) => p.key === activePlanet);
    return planet ? generatePlanetProfile(planetSeedEntry, planet) : null;
  }, [activePlanet, planetSeedEntry]);

  const beginPlanetDive = (key) => {
    if (appState !== 'hub_freeroam') return;
    // Only the eight outer planets dive this way — Mars and Earth
    // have their own doors and are refused here even if called.
    if (!PLANETS.some((p) => p.key === key)) return;
    if (!planetSeedFor(key)) return;
    setActivePlanet(key);
    setPlanetSelected(null);
    setPlanetFocusReq(null);
    setPlanetMode('orbit');
    setAppState('planet_surface');
  };

  const exitPlanet = () => { setActivePlanet(null); setAppState('hub_freeroam'); };

  const selectPlanet = (sel) => {
    setPlanetSelected(sel || null);
    if (sel && planetMode === 'orbit') {
      setPlanetFocusReq({ pos: sel.pos, nonce: Date.now() });
    }
  };

  const togglePlanetMode = (m) => {
    setPlanetMode((prev) => (prev === m ? 'orbit' : m));
  };

  const travelToEarth = (dest) => { setPendingDest(dest); setAppState('earth_travel'); };
  
  const arriveEarth = (dest) => {
    setEarthFocus(dest);
    setPendingDest(null);
    if (pendingRoamRef.current) {
      pendingRoamRef.current = false;
      beginRoam(roamState, dest.lat, dest.lon, 0);
      setAppState('diving_to_street');
    } else {
      setAppState('earth_surface');
    }
  };
  
  const returnToOrbit = () => {
    pendingRoamRef.current = false;
    endRoam(roamState);
    setPendingDest(null);
    setEarthFocus(null);
    setAppState('returning_to_orbit');
  };

  const pendingRoamRef = useRef(false);
  const earthSpawns = useMemo(() => landmarkSpawns(), []);
  
  const beginStreetDive = () => {
    if (!earthFocus) return;
    fx.earthDive();
    beginRoam(roamState, earthFocus.lat, earthFocus.lon, roamState.yawDeg || 0);
    setAppState('diving_to_street');
  };

  // Double-click parachute: user double-clicks a tile → parachute down
  // to street level at that exact lat/lon. The character starts at
  // orbital scale and shrinks during the descent (lib/earth/parachute).
  // QUANTUM OFF (Merlin, 2026-10-22, "for now"): this function is the
  // funnel for EVERY shrink entry — the EarthConsole 🔬 Quantum door
  // (onDropToTile) and the globe's double-click / double-tap handlers
  // (onParachute) both land here — so refusing here closes the realm
  // completely while leaving normal street dives (beginStreetDive,
  // which never parachutes) untouched. One line in lib/earth/
  // quantum.js re-opens it.
  const parachuteTo = ({ lat, lon }) => {
    if (!QUANTUM_ENABLED) return;
    const allowed = ['hub_intro', 'hub_freeroam', 'earth_surface', 'earth_roam'];
    if (!allowed.includes(appState)) return;
    fx.earthDive();
    setEarthFocus({ lat, lon, label: 'Shrink into tile' });
    setSelectedTile(null); // clear selection after dropping
    beginRoam(roamState, lat, lon, roamState.yawDeg || 0);
    beginParachuteDive(); // start the 1x → 0.05x shrink animation
    setAppState('diving_to_street');
  };

  // Tile selection for the DROP button (tap a tile, then hit DROP)
  const handleTileSelect = useCallback(({ lat, lon }) => {
    setSelectedTile({ lat, lon });
  }, []);
  
  const pickSpawn = (dest) => {
    pendingRoamRef.current = true;
    setPendingDest(dest);
    setAppState('earth_travel');
  };

  const controlsRef = useRef({
    moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0, keyW: 0, keyS: 0, keyA: 0, keyD: 0, zoom: 52, lastPinchDist: null
  });

  const bikeRef = useRef(null);
  const satIndex = useMemo(() => new Map(SATELLITES.map((s) => [s.key, s])), []);

  const aiSatMeta = useMemo(() => {
    const match = SATELLITES.find(
      (s) =>
        s.key?.toLowerCase().includes('thoth') ||
        s.key?.toLowerCase().includes('apollo') ||
        s.key?.toLowerCase().includes('athena') ||
        s.programs?.some((p) => p.route === '/human-ai' || p.route === '/alexandria')
    );
    return {
      key: match?.key || 'thoth',
      posKey: match?.pos || 'THOTH_POS',
    };
  }, []);

  const [joyBase, setJoyBase] = useState({ x: 0, y: 0 });
  const [joyStick, setJoyStick] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  const lastLook = useRef({ x: 0, y: 0 });
  const isLooking = useRef(false);

  const { tiltMsg } = useTilt({
    controlsRef,
    flightAxis,
    appState,
    joyActive,
    onAutoAxis: setFlightAxis,
  });

  const { expanded: radioSheetOpen } = useRadio();
  const chromeHiddenStyle = radioSheetOpen
    ? { visibility: 'hidden', opacity: 0, pointerEvents: 'none' }
    : undefined;

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setCloudOffline(true);
      const cached = localStorage.getItem('nexus_user');
      if (cached) setUser(cached);
      return;
    }
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const callsign = session.user.user_metadata?.username || session.user.user_metadata?.callsign || localStorage.getItem('nexus_user') || session.user.email?.split('@')[0].toUpperCase();
          localStorage.setItem('nexus_user', callsign);
          setUser(callsign);
          stashHubRegisteredAt(session.user.created_at);
        } else {
          const cached = localStorage.getItem('nexus_user');
          if (cached) setUser(cached);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const callsign = session.user.user_metadata?.username || session.user.user_metadata?.callsign || session.user.email?.split('@')[0].toUpperCase();
          localStorage.setItem('nexus_user', callsign);
          setUser(callsign);
          stashHubRegisteredAt(session.user.created_at);
        } else {
          localStorage.removeItem('nexus_user');
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    } catch (err) {
      console.warn('Cloud auth unavailable, entering guest mode:', err);
      setCloudOffline(true);
      const cached = localStorage.getItem('nexus_user');
      if (cached) setUser(cached);
    }
  }, []);

  useEffect(() => {
    const unlock = () => unlockFx();
    const onPhase = (e) => { try { fx.entrancePhase(e.detail && e.detail.phase); } catch { } };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('nexus:entrance-phase', onPhase);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('nexus:entrance-phase', onPhase);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsMenuExpanded(false);
    }
  }, []);

  useEffect(() => {
    // Text entry on the hub (the bug report form, Muse chat, search
    // boxes) owns the keyboard while it has focus: the hub's WASD
    // flight keys must never react to letters being typed into a
    // field, and typing must never skip the intro / steer the rig
    // behind the form (text-entry integrity, bug report 2026-10-22).
    const isFormTarget = (e) => {
      const t = e && e.target;
      return !!(
        t &&
        typeof t.closest === 'function' &&
        t.closest('input, textarea, select, [contenteditable]')
      );
    };
    const handleKeyDown = (e) => {
      if (isFormTarget(e)) return;
      if (appState === 'hub_intro') setAppState('hub_freeroam');
      if(e.key.toLowerCase()==='w') controlsRef.current.keyW = 1;
      if(e.key.toLowerCase()==='s') controlsRef.current.keyS = 1;
      if(e.key.toLowerCase()==='a') controlsRef.current.keyA = 1;
      if(e.key.toLowerCase()==='d') controlsRef.current.keyD = 1;
    };
    const handleKeyUp = (e) => {
      if (isFormTarget(e)) return;
      if(e.key.toLowerCase()==='w') controlsRef.current.keyW = 0;
      if(e.key.toLowerCase()==='s') controlsRef.current.keyS = 0;
      if(e.key.toLowerCase()==='a') controlsRef.current.keyA = 0;
      if(e.key.toLowerCase()==='d') controlsRef.current.keyD = 0;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [appState]);

  const getAccessToken = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user || cloudOffline) return;
    let alive = true;
    fetchRiderState(getAccessToken).then((s) => {
      if (!alive || !s) return;
      savedSpawnRef.current = [s.x, s.y, s.z];
    });
    return () => { alive = false; };
  }, [user, cloudOffline, getAccessToken]);

  const handleLogin = (callsign) => setUser(callsign);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
    }
    localStorage.removeItem('nexus_user');
    setUser(null);
  };

  const launchPocketUniverse = useCallback((route, satKey, fallbackPos, directPos) => {
    fx.routeLaunch(route);
    let target = null;
    if (Array.isArray(directPos)) {
      target = directPos;
    } else if (Array.isArray(satKey)) {
      target = satKey;
    } else {
      if (satKey) {
        const p = orbitPositionFor(satKey, orbitTime());
        if (p) target = [p.x, p.y, p.z];
      }
      if (!target) target = POS_MAP[fallbackPos] || GOD_TOWER_SPOTS[0].pos;
    }
    setActiveSatTarget(target);
    targetRouteRef.current = route;
    setIsMenuExpanded(false);
    setAppState('returning_to_satellite');
  }, [POS_MAP]);

  const toggleBike = () => {
    if (appState === 'on_bike' || appState === 'to_bike') {
      fx.bikeDismount();
      setAppState('hub_freeroam');
    } else if (appState === 'hub_intro' || appState === 'hub_freeroam') {
      fx.bikeMount();
      const saved = savedSpawnRef.current;
      if (bikeRef.current && saved) {
        bikeRef.current.position.set(saved[0], saved[1] - DISMOUNT_EYE, saved[2]);
        bikeRef.current.userData.baseY = saved[1] - DISMOUNT_EYE;
        bikeRef.current.userData.flying = false;
      }
      setAppState('to_bike');
    }
  };

  const handleBikeDismount = (pos) => {
    savedSpawnRef.current = [pos.x, pos.y, pos.z];
    if (user && !cloudOffline) {
      saveRiderState(pos, getAccessToken, 'hub');
    }
  };

  const handlePointerDown = (e) => {
    if (e.target.closest('.ui-element')) return;
    // Inside the Mars realm the hub's flight stick/look stand down —
    // the realm's own rig (orbit / drag-look / TouchControls) owns
    // pointer input there, like EarthWalker's does in earth_roam.
    // Same stand-down inside a planet realm ('planet_surface').
    if (appState === 'mars_surface') return;
    if (appState === 'planet_surface') return;
    if (appState === 'hub_intro') setAppState('hub_freeroam');
    
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (clientX < window.innerWidth / 2) {
      setJoyBase({ x: clientX, y: clientY });
      setJoyStick({ x: clientX, y: clientY });
      setJoyActive(true);
    } else {
      isLooking.current = true;
      lastLook.current = { x: clientX, y: clientY };
    }
  };

  const handlePointerMove = (e) => {
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (joyActive) {
      setJoyStick({ x: clientX, y: clientY });
      const dx = clientX - joyBase.x;
      const dy = clientY - joyBase.y;
      const deadzone = 10;
      let dist = Math.hypot(dx, dy);
      
      if (dist > deadzone) {
        const maxDist = 50;
        dist = Math.min(dist, maxDist);
        const normalizedDist = (dist - deadzone) / (maxDist - deadzone);
        const angle = Math.atan2(dy, dx);
        controlsRef.current.moveX = Math.cos(angle) * normalizedDist;
        controlsRef.current.moveY = Math.sin(angle) * normalizedDist;
      } else {
        controlsRef.current.moveX = 0;
        controlsRef.current.moveY = 0;
      }
    } else if (isLooking.current) {
      controlsRef.current.lookDeltaX += clientX - lastLook.current.x;
      controlsRef.current.lookDeltaY += clientY - lastLook.current.y;
      lastLook.current = { x: clientX, y: clientY };
    }
  };

  const handlePointerUp = () => {
    setJoyActive(false);
    isLooking.current = false;
    controlsRef.current.moveX = 0;
    controlsRef.current.moveY = 0;
  };

  return (
    <main 
      className="relative w-screen h-dvh overflow-hidden bg-[#050505] touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={(e) => {
        controlsRef.current.zoom += e.deltaY * 0.05;
        controlsRef.current.zoom = Math.max(20, Math.min(100, controlsRef.current.zoom));
      }}
    >
      {!user && !cloudOffline && <Auth onLogin={handleLogin} />}
      {cloudOffline && !cloudNoteDismissed && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-3 bg-zinc-950/90 border border-amber-500/40 rounded-full pl-4 pr-2 py-2 shadow-lg backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] text-zinc-300 tracking-wide">
              Cloud features are offline — exploring as a guest. Sign-in and cloud saves return once the database is connected.
            </span>
            <button
              onClick={() => { fx.tap(); setCloudNoteDismissed(true); }}
              className="text-zinc-500 hover:text-white text-xs px-2"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {(user || cloudOffline) && showIntro && (
        <EntranceSequence onDone={() => setShowIntro(false)} />
      )}
      {(user || cloudOffline) && showHubTutorial && !showIntro && (
        <HubTutorial onDone={() => { markHubTutorialSeen(); setShowHubTutorial(false); }} />
      )}
      {/* Left column retired 2026-10-20: Replay Intro / Renewal Plan / Tutorial now live in the Concourse (Intro / Renew / Guide tiles). */}
      
      
      {(user || cloudOffline) && (appState === 'hub_intro' || appState === 'hub_freeroam') && (
        <>
          {isMenuExpanded ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Program menu"
              className="fixed inset-0 z-[40000] ui-element"
            >
              <div className="absolute inset-0 bg-zinc-950/[0.98]" aria-hidden="true" />
              <div
                className="relative h-full flex flex-col gap-5 p-4 sm:p-6"
                style={{
                  paddingTop: 'max(1rem, env(safe-area-inset-top))',
                  paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                  paddingLeft: 'max(1rem, env(safe-area-inset-left))',
                  paddingRight: 'max(1rem, env(safe-area-inset-right))',
                }}
              >
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2 shrink-0">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-widest text-white uppercase flex items-center gap-2">Select your satellites <MenuHeaderDecor /></span>
                    <span className="text-[9px] font-mono text-cyan-400 tracking-wider uppercase">{t('ui.operator')}: {user || 'GUEST'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <SettingsGear />
                    <button onClick={() => { fx.menuClose(); setIsMenuExpanded(false); }} title={t('ui.collapse')} className="text-zinc-500 hover:text-white text-xs px-1">[_]</button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                  <SatelliteMenu
                    t={t}
                    satIndex={satIndex}
                    onLaunch={(route, key, pos) => launchPocketUniverse(route, key, pos)}
                  />

                  <div className="pt-2 border-t border-zinc-800/80 shrink-0">
                    <button
                      onClick={() => launchPocketUniverse('/agent-forge', aiSatMeta.key, aiSatMeta.posKey)}
                      className="w-full flex flex-col text-left px-4 py-3 bg-black/40 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-all group"
                    >
                      <span className="text-sm font-black text-emerald-400 tracking-widest uppercase group-hover:text-white">
                        Agent Forge
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase mt-1">
                        Personal AI &amp; Brain Sync
                      </span>
                    </button>
                  </div>
                </div>

                {user && (
                <button
                  onClick={handleSignOut}
                  className="w-full py-2.5 text-[10px] font-bold tracking-widest text-red-400 uppercase transition-all border border-red-500/30 rounded bg-red-950/20 hover:bg-red-900/40 hover:border-red-500/60 mt-1 shrink-0"
                >
                  {t('ui.disconnect')}
                </button>
                )}
              </div>
            </div>
          ) : null}

{/* Flight Axis readout deleted 2026-10-20 (Merlin): a passive display that did nothing when tapped. */}


          {tiltMsg && (
            <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[60] pointer-events-none" role="status" aria-live="polite" style={radioSheetOpen ? { visibility: 'hidden' } : undefined}>
              <div className="text-[11px] text-zinc-200 bg-zinc-950/95 border border-cyan-500/40 rounded-full px-4 py-1.5 shadow-lg whitespace-nowrap">
                {tiltMsg}
              </div>
            </div>
          )}

          {/* StoreFloatButton retired 2026-10-20: the store lives in
              the Concourse now (Store tile → /store). */}

          <div className="absolute top-[5.75rem] right-5 z-50 flex items-center gap-3 ui-element pointer-events-auto" style={chromeHiddenStyle}>
            <NotificationsWindow concourse />
            <ProfileIcon concourse />
          </div>

          {joyActive && Math.hypot(joyStick.x - joyBase.x, joyStick.y - joyBase.y) > 5 && (
            <div
              className="absolute z-40 flex items-center justify-center w-20 h-20 border-2 rounded-full pointer-events-none border-cyan-500/30 bg-cyan-950/20"
              style={{ left: joyBase.x - 40, top: joyBase.y - 40 }}
            >
              <div
                className="w-8 h-8 rounded-full bg-cyan-400/80 shadow-[0_0_15px_#00f2ff]"
                style={{ transform: `translate(${Math.max(-30, Math.min(30, joyStick.x - joyBase.x))}px, ${Math.max(-30, Math.min(30, joyStick.y - joyBase.y))}px)` }}
              />
            </div>
          )}
        </>
      )}

      {/* NIGHT GRID retired 2026-10-20: lives in the Concourse (Night tile). */}


      {/* BikeFloatButton retired 2026-10-20: lives in the Concourse (Bike tile). */}


      {(user || cloudOffline) && (appState === 'diving_to_earth' || appState === 'earth_surface' || appState === 'earth_travel' || appState === 'diving_to_street' || appState === 'earth_roam') && (
        <EarthConsole
          focus={earthFocus}
          phase={appState}
          onTravel={travelToEarth}
          onReturn={returnToOrbit}
          onStreet={beginStreetDive}
          onAscend={() => setAppState('earth_surface')}
          onSpawnPick={pickSpawn}
          spawns={earthSpawns}
          selectedTile={selectedTile}
          onDropToTile={parachuteTo}
          controlsRef={controlsRef}
        />
      )}

      {(user || cloudOffline) && appState === 'mars_surface' && (
        <MarsConsole
          profile={marsProfile}
          seed={marsSeed}
          setSeed={setMarsSeed}
          time={marsTime}
          setTime={setMarsTime}
          mode={marsMode}
          onToggleMode={toggleMarsMode}
          selected={marsSelected}
          onSelect={selectMars}
          inputRef={marsInputRef}
          onExit={exitMars}
        />
      )}

      {(user || cloudOffline) && appState === 'planet_surface' && planetProfile && planetSeedEntry && (
        <PlanetConsole
          profile={planetProfile}
          seedEntry={planetSeedEntry}
          time={planetTime}
          setTime={setPlanetTime}
          mode={planetMode}
          onToggleMode={togglePlanetMode}
          selected={planetSelected}
          onSelect={selectPlanet}
          inputRef={planetInputRef}
          onExit={exitPlanet}
        />
      )}

      {/* Character picker now lives inside EarthConsole menu (not floating) */}

      {(user || cloudOffline) && appState === 'hub_freeroam' && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none" style={chromeHiddenStyle}>
          <div className="text-[10px] tracking-[0.25em] uppercase text-cyan-300/70 bg-black/40 px-4 py-2 rounded-full border border-cyan-500/20">
            {t('earth.tapHint')}
          </div>
        </div>
      )}

      {(user || cloudOffline) && bgVideoOk && !sweepDone && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <video
            src="/media/hub-sweep.mp4"
            autoPlay
            muted
            playsInline
            onEnded={() => setSweepDone(true)}
            onError={() => setBgVideoOk(false)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      )}

      <HomeScene
        bgVideoOk={bgVideoOk}
        radioSheetOpen={radioSheetOpen}
        appState={appState}
        setAppState={setAppState}
        satIndex={satIndex}
        targetRoute={targetRouteRef.current}
        controlsRef={controlsRef}
        flightAxis={flightAxis}
        adWindowRef={adWindowRef}
        activeSatTarget={activeSatTarget}
        bikeRef={bikeRef}
        earthQuatRef={earthQuatRef}
        earthFocus={earthFocus}
        pendingDest={pendingDest}
        arriveEarth={arriveEarth}
        beginEarthDive={beginEarthDive}
        beginMarsDive={beginMarsDive}
        marsProfile={marsProfile}
        marsTime={marsTime}
        marsMode={marsMode}
        marsInputRef={marsInputRef}
        marsFocusReq={marsFocusReq}
        onMarsSelect={selectMars}
        marsSelectedId={marsSelected ? marsSelected.id : null}
        beginPlanetDive={beginPlanetDive}
        planetProfile={planetProfile}
        planetTime={planetTime}
        planetMode={planetMode}
        planetInputRef={planetInputRef}
        planetFocusReq={planetFocusReq}
        onPlanetSelect={selectPlanet}
        planetSelectedId={planetSelected ? planetSelected.id : null}
        onParachute={parachuteTo}
        onTileSelect={appState === 'earth_surface' ? handleTileSelect : null}
        onBikeDismount={handleBikeDismount}
        onLaunchExternal={(url, id) => {
          adWindowRef.current = window.open('', '_blank');
          launchPocketUniverse(url, null, null, id);
        }}
      />
    </main>
  );
}

export default function NexusHubPage() {
  return (
    <LanguageProvider>
      <NexusHub />
    </LanguageProvider>
  );
}
