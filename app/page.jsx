'use client';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Auth from '@/components/Auth';
import { supabase } from '@/lib/supabase';
import { LanguageProvider, useI18n } from '@/lib/i18n';
import { SATELLITES } from '@/lib/i18n/satellites';
import { isOwnerEmail } from '@/lib/owner';
import { AGENT_FORGE_MENU, AGENT_ENGINE_MENU } from '@/lib/god-menus';
import SatelliteMenu from '@/components/SatelliteMenu';
import { MenuHeaderDecor } from '@/components/PortalSeasonalDecor';
import { orbitTime, orbitPositionFor, PLANETS } from '@/lib/god-orbits';
import { GOD_TOWER_SPOTS, GOD_TOWER_POS, BABEL_POS, ARTEMIS_POS } from '@/lib/home-positions';
import SettingsGear from '@/components/SettingsGear';
import { fetchRiderState, saveRiderState, DISMOUNT_EYE, nextFlightAxis } from '@/lib/rider-state';
import { flightAxisLabel } from '@/lib/flight-axis';
import FlightAxisStreaks from '@/components/FlightAxisStreaks';
import ProfileIcon from '@/components/ProfileIcon';
import NotificationsWindow from '@/components/NotificationsWindow';
import EntranceSequence from '@/components/EntranceSequence';
import { createEntranceMachine } from '@/lib/entrance-sequence';
import EarthConsole from '@/components/EarthConsole';
import { generateMarsProfile } from '@/lib/mars/engine';
import { planetSeedFor } from '@/lib/planets/planet-seeds';
import { generatePlanetProfile } from '@/lib/planets/profiles';
import { PLANET_CHOOSERS } from '@/lib/planets/planet-choosers';
import { roamState, beginRoam, endRoam } from '@/lib/earth/roam';
import { kartState, sharedPeerVehicles, clearSpawnPoint } from '@/lib/earth/kart';
import { summonCar } from '@/components/EarthSupercar';
import EarthVehicleSelect from '@/components/EarthVehicleSelect';
import { DEFAULT_CRAFT_ID } from '@/lib/earth/vehicles';
import WalkJoystick from '@/components/world/WalkJoystick';
import { fx, unlockFx } from '@/lib/fx';
import { shadowRealmUrl } from '@/app/shadow-realm/launch';
import { prettifyKey } from '@/lib/tour/itinerary';
import VortexTubeRide from '@/app/nexus-vortex/components/VortexTubeRide.jsx';
import { pickVortexWraps } from '@/lib/vortex/wraps';
import { VORTEX_RIDE_MS } from '@/app/nexus-vortex/lib/tube.js';
import { useRiderPrefs } from '@/lib/use-rider-prefs';
import { useTilt } from '@/lib/use-tilt';
import { useRadio } from '@/components/radio/RadioProvider';
import HubTutorial from '@/components/HubTutorial';
import PortalRoom from '@/components/PortalRoom';
import { heavenUnlocked as portalHeavenUnlocked, usePortalProgress } from '@/lib/portal/progress';
import { SUN_BASE_ROUTE, SUN_BASE_PULL_MS, consumeSunBaseExit } from '@/lib/sun-base';
import { MOON_ROUTE } from '@/lib/moon';
import { OMEGA_ROUTE } from '@/lib/omega-arch';
import {
  shouldShowHubTutorial,
  isHubTutorialSeen,
  markHubTutorialSeen,
  stashHubRegisteredAt,
  resolveHubRegisteredAt,
} from '@/lib/hub-tutorial';
// The Oblivion cycle (Merlin's canon, Nov 19 ~00:16): the hub polls
// the server event; while active, Earth is gone and the timer cube
// floats where the globe was. Earth 2/3/4 stay live throughout.
import { useOblivionState } from '@/lib/oblivion/useOblivionState';
import { hasWitnessFlag, clearWitnessFlag, setWitnessFlag } from '@/lib/oblivion/client';
import { witnessDecision } from '@/lib/oblivion/state';
import { formatCountdown } from '@/lib/earth/oblivion';
// Hub baseball leaderboard (Merlin, Nov 26): the page submits flight
// scores; the scene submits nothing. Client shape mirrors
// lib/mars2/outposts-client.js (Bearer token, 503 → unavailable).
// Verified against the real file: it exports fetchBoard(token) and
// submitFlight(token, { distanceM, eaten, player }) exactly as the
// shared contract specifies.
import { fetchBoard, submitFlight } from '@/lib/hub-baseball/leaderboard-client';

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

// OblivionCollapse mounts its own WebGL renderer, so it rides the
// same client-only dynamic path as the hub scene.
const OblivionCollapse = dynamic(() => import('@/components/earth/OblivionCollapse'), {
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
  // Portal room (Merlin, 2026-11-13): clicking a hub portal opens
  // the room (aurora boot, then the holographic carousel). Heaven
  // stays locked until 1 Nether Realm visit.
  const [portalRoomSide, setPortalRoomSide] = useState(null); // 'heaven' | 'nether' | null
  const portalProgress = usePortalProgress();
  const handleHubPortal = useCallback((side) => setPortalRoomSide(side), []);
  // SUN BASE (Merlin, 2026-11-13): clicking the sun PULLS the user
  // into it — the pull is driven inside the Canvas by SequenceController
  // (sunPullRef is the shared mutable request: active/done/from/target/
  // startMs/progress). When the pull lands, a gold flash swallows the
  // screen and the base route opens. The flash is the cut: the camera
  // is already deep inside the sun's glare, so gold is what the user
  // is looking at when the page changes.
  const sunPullRef = useRef({ active: false, done: false, from: null, target: null, startMs: 0, progress: 0 });
  const [sunFlash, setSunFlash] = useState(false);
  const handleSunClick = useCallback(() => {
    const r = sunPullRef.current;
    if (r.active) return;
    r.active = true;
    r.done = false;
    r.from = null;
    r.target = null;
    r.startMs = 0;
    r.progress = 0;
  }, []);
  const handleSunPullDone = useCallback(() => {
    setSunFlash(true);
    window.setTimeout(() => router.push(SUN_BASE_ROUTE), 350);
  }, [router]);
  // SUN BASE EXIT (Merlin, Nov 24 ~07:06): a hub-bound exit from
  // /sun-base lands the user just outside the sun, facing the hub
  // — never at the far default spawn. The one-shot flag is
  // consumed in a layout effect (not a passive one) so it lands
  // before the Canvas's first frame — otherwise the hub intro
  // owns frame one and the exit transition starts a frame late.
  // The gold overlay below is the entry flash in reverse: full
  // gold on arrival, fading over the same 1.4 s as the camera
  // drifts out of the sun.
  const [sunBaseExit, setSunBaseExit] = useState(false);
  const [sunExitFlash, setSunExitFlash] = useState(false);
  const [sunExitFaded, setSunExitFaded] = useState(false);
  useLayoutEffect(() => {
    if (!consumeSunBaseExit()) return;
    setSunBaseExit(true);
    setSunExitFlash(true);
  }, []);
  useEffect(() => {
    if (!sunExitFlash) return undefined;
    const fadeTimer = window.setTimeout(() => setSunExitFaded(true), 50);
    const doneTimer = window.setTimeout(() => setSunExitFlash(false), SUN_BASE_PULL_MS + 150);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [sunExitFlash]);
  // MOON LANDING (Merlin, Nov 13, 2026): clicking the Moon — or flying
  // into it — rides the existing vortex tube to /moon (the one vortex
  // system; satTube already routes on done, same as a satellite drop).
  const handleMoonClick = useCallback(() => {
    satTubeSkinsRef.current = pickVortexWraps(satTubeSkinsRef.current);
    setSatTube({ route: MOON_ROUTE, name: 'The Moon' });
  }, []);
  // Headless probe hook (nether-realm pattern): window.__sunBase.enter
  // starts the pull without raycasting the sun.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__sunBase = { enter: () => handleSunClick() };
    }
  }, [handleSunClick]);
  // Headless probe hook (nether-realm pattern): window.__moon.enter
  // starts the vortex to /moon without raycasting the Moon.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__moon = { enter: () => handleMoonClick() };
    }
  }, [handleMoonClick]);
  // Headless probe hook (nether-realm pattern): window.__portalRoom.open
  // lets a probe open the room and watch the boot → carousel without
  // raycasting a 3D disc. Render state lives in window.__hubPortals.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__portalRoom = { open: (side) => setPortalRoomSide(side === 'heaven' ? 'heaven' : 'nether') };
    }
  }, []);
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [user, setUser] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);
  const [cloudNoteDismissed, setCloudNoteDismissed] = useState(false);

  const [showIntro, setShowIntro] = useState(false);
  const [bgVideoOk, setBgVideoOk] = useState(true);
  const [sweepDone, setSweepDone] = useState(false);
  
  useEffect(() => {
    if (appState === 'hub_freeroam' && !sweepDone) setSweepDone(true);
  }, [appState, sweepDone]);

  // The Concourse's hub tiles drive the hub's own functions from
  // here: Menu toggles the program menu; Intro / Guide replay the
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

  // Oblivion waiting link (Merlin, 2026-10-26): /oblivion's
  // Concourse button lands here with ?concourse=1 so the traveler
  // sees the Concourse scene itself, not the program menu (which
  // is expanded by default on a fresh load). Runs once on mount;
  // never fights a manual toggle afterward.
  const concourseParamApplied = useRef(false);
  useEffect(() => {
    if (concourseParamApplied.current) return;
    concourseParamApplied.current = true;
    try {
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('concourse') === '1') {
        setIsMenuExpanded(false);
      }
    } catch {}
  }, []);
  
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
  // Satellite drop → vortex tube (Merlin, 2026-10-29): when the 3D drop
  // reaches the satellite's portal, the fullscreen tube ride carries the
  // user the last stretch instead of the flat portal ring.
  const [satTube, setSatTube] = useState(null); // { route, name, jumpTo? } | null
  const [pendingJump, setPendingJump] = useState(null); // { x, y, z } | null — consumed by the Canvas
  const satTubeSkinsRef = useRef(null);
  const targetNameRef = useRef('');
  const riderPrefs = useRiderPrefs();

  const [activeSatTarget, setActiveSatTarget] = useState(GOD_TOWER_SPOTS[0].pos);
  const [flightAxis, setFlightAxis] = useState('horizontal');
  // FLIGHT AXIS toggle (Merlin, 2026-11-13): once the user taps the
  // visible toggle, the toggle owns the axis for the session — this ref
  // tells lib/use-tilt.js to stop auto-flipping the axis from the
  // phone's pitch. Tilt still steers climb/descend whenever the axis
  // is vertical; only the axis SELECTION hands over to the tap.
  const manualAxisRef = useRef(false);
  const savedSpawnRef = useRef(null);

  const earthQuatRef = useRef(null);
  const [earthFocus, setEarthFocus] = useState(null);
  const [pendingDest, setPendingDest] = useState(null);
  const [showEarthChooser, setShowEarthChooser] = useState(false);
  // Earth 1 entry (vehicles only, Merlin 2026-11-15): the chooser's
  // Earth 1 button opens ONLY the vehicle menu (select + live 3D
  // preview); the menu's pick step then turns the hub globe into
  // the spawn picker. The chosen craft rides in a ref (the globe
  // click handler reads it) until the driver taps the Earth.
  const [showEarthVehicleSelect, setShowEarthVehicleSelect] = useState(false);
  const [earthPickMode, setEarthPickMode] = useState(false);
  const selectedEarthCraftRef = useRef(DEFAULT_CRAFT_ID);
  const [showJupiterChooser, setShowJupiterChooser] = useState(false);
  const [showMarsChooser, setShowMarsChooser] = useState(false);

  const beginEarthDive = () => {
    if (appState !== 'hub_freeroam') return;
    // Earth chooser (Merlin, 2026-10-31): tapping Earth now offers
    // Earth 1 or Earth 2 — Earth 2 is unlocked for all users.
    setShowEarthChooser(true);
  };

  // The Oblivion cycle, owned by the page: polled from the server,
  // passed to HomeScene (globe ↔ timer cube) and read by the gates
  // below. While active, Earth is gone and the timer cube floats
  // where the globe was. Earth 2/3/4 stay live throughout.
  const oblivion = useOblivionState();
  const [showWitness, setShowWitness] = useState(false);
  // Honest notice when the witness flag says "watch the explosion"
  // but the server disagrees (Nov 21: the arm did not land, yet the
  // collapse played anyway). Tap to dismiss.
  const [oblivionNotice, setOblivionNotice] = useState(null);
  useEffect(() => {
    // Wait for the first server read: before it resolves there is
    // nothing to decide from, and a flag alone must never play
    // the cinematic.
    if (!oblivion.ready) return;
    const decision = witnessDecision({
      flag: hasWitnessFlag(),
      active: oblivion.active,
      error: oblivion.error,
    });
    if (decision === 'play') {
      setOblivionNotice(null);
      setShowWitness(true);
      return;
    }
    if (decision === 'unconfirmed') {
      // The server could not be checked: do NOT play, and do NOT
      // clear the flag — the arm may exist. The next poll re-checks.
      setOblivionNotice('⚡ COULD NOT CONFIRM THE ARM — CHECKING AGAIN');
      return;
    }
    if (decision === 'not-landed') {
      // The flag is set but the server holds no event: the arm did
      // not land. Clear the flag and say so honestly — never play
      // the explosion for an event the server does not have.
      clearWitnessFlag();
      setOblivionNotice('⚡ THE ARM DID NOT LAND — EARTH IS STILL HERE');
    }
  }, [oblivion.ready, oblivion.active, oblivion.error]);
  // Evacuation: anyone on Earth when the cycle arms is pulled to
  // the hub to witness it (the puller travels themselves from J2;
  // Earth users ride this effect). The witness overlay plays once.
  // The Earth pick UI closes too — its globe is gone.
  useEffect(() => {
    if (!oblivion.active) return;
    setShowEarthChooser(false);
    setShowEarthVehicleSelect(false);
    setEarthPickMode(false);
    if (['diving_to_earth', 'earth_surface', 'earth_travel', 'diving_to_street', 'earth_roam'].includes(appState)) {
      setWitnessFlag();
      setShowWitness(true);
      setAppState('hub_freeroam');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oblivion.active, appState]);

  const chooseEarth1 = () => {
    // Oblivion: Earth 1 is gone until the timer runs out — the
    // chooser button already shows the countdown; this guard
    // covers any other path into the vehicle menu.
    if (oblivion.active) return;
    // Vehicles only: Earth 1 opens the vehicle menu, not the dive.
    // The driver picks a vehicle (with a live 3D preview), then
    // taps the Earth globe to spawn — already in the vehicle.
    setShowEarthChooser(false);
    setShowEarthVehicleSelect(true);
  };

  const cancelEarthVehicleSelect = () => {
    setShowEarthVehicleSelect(false);
    setEarthPickMode(false);
  };

  // The menu's pick step calls this with the chosen craft; the
  // globe click below does the spawning.
  const handleEarthVehiclePick = (craftId) => {
    selectedEarthCraftRef.current = craftId;
  };

  // Click-to-spawn (vehicles only): the hub Earth globe tap while
  // the menu's pick banner is up spawns the driver exactly where
  // they tapped, already in the selected vehicle — no overlook,
  // no landmark, no on-foot interlude. The dive goes straight to
  // diving_to_street; the flight controller's descent starts from
  // the current camera and lands on the street rig.
  const handleEarthGlobeClick = ({ lat, lon }) => {
    if (!earthPickMode) return;
    // Oblivion: the globe is gone; a mid-pick arm cancels the pick.
    if (oblivion.active) {
      setEarthPickMode(false);
      setShowEarthVehicleSelect(false);
      return;
    }
    setEarthPickMode(false);
    setShowEarthVehicleSelect(false);
    fx.earthDive();
    // Round 3 — the tapped spawn point is separation-checked
    // against every vehicle already on the planet (rivals from
    // an earlier entry in this session + rendered peers): a
    // re-spawn never lands on top of a vehicle that is already
    // there. On a first entry the list is empty and the tap
    // stands exactly as tapped; the rivals then build around
    // it 800–1500 m out (lib/earth/kart.js buildRivals).
    const spot = clearSpawnPoint(lat, lon, [...kartState.rivals, ...sharedPeerVehicles]);
    setEarthFocus({ lat: spot.lat, lon: spot.lon, label: 'Spawn' });
    beginRoam(roamState, spot.lat, spot.lon, 0);
    summonCar(selectedEarthCraftRef.current);
    setAppState('diving_to_street');
  };

  const chooseEarth2 = () => {
    setShowEarthChooser(false);
    window.location.href = '/earth-2';
  };

  // Earth 3 + Earth 4 (Merlin, 2026-11-14): unlocked — the chooser
  // buttons now take the user straight in, same as Earth 2.
  const chooseEarth3 = () => {
    setShowEarthChooser(false);
    window.location.href = '/new-earth';
  };

  const chooseEarth4 = () => {
    setShowEarthChooser(false);
    window.location.href = '/earth-4';
  };

  // Omega portal street light (Merlin, 2026-10-31): the Omega Arch's
  // portal now lives at the bottom of the Earth chooser instead of
  // behind the Sun. Works exactly like the arch did — the same
  // handleSatellitePortal(OMEGA_ROUTE) the OmegaHubGate called,
  // vortex tube ride and all — and lands on the hub with the
  // Portals 3D hall open (Nov 16, 2026 merge: the 2D Portal Room
  // is gone; OMEGA_ROUTE is the hall deep link).
  const chooseOmegaPortal = () => {
    setShowEarthChooser(false);
    handleSatellitePortal(OMEGA_ROUTE);
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
  // and the Mars chooser offers Mars 1 or Mars 2 (Merlin, 2026-11-15,
  // the same menu Earth got); Mars 1 dives in without leaving this
  // page, exactly like Earth. The standalone /mars page stays as a
  // second door. Realm state is owned here and passed to both the DOM
  // console (MarsConsole) and the scene (HomeScene renders
  // MarsRealmContent in the hub Canvas).
  const marsInputRef = useRef({ keys: { fwd: false, back: false, left: false, right: false, up: false, down: false } });
  const [marsSeed, setMarsSeed] = useState('MARS-PRIME');
  const [marsTime, setMarsTime] = useState(0.32);
  const [marsMode, setMarsMode] = useState('orbit');
  const [marsSelected, setMarsSelected] = useState(null);
  const [marsFocusReq, setMarsFocusReq] = useState(null);
  const marsProfile = useMemo(() => generateMarsProfile(marsSeed), [marsSeed]);

  // Mars chooser (Merlin, 2026-11-15): tapping Mars now offers Mars 1
  // or Mars 2 — the same menu Earth got (Merlin, 2026-10-31). Mars 1 is
  // the in-hub realm below; Mars 2 is the standalone /mars-2 route.
  // The dialog renders from PLANET_CHOOSERS — one source of truth for
  // both menus — and this handler dispatches the pick.
  const beginMarsDive = () => {
    if (appState !== 'hub_freeroam') return;
    setShowMarsChooser(true);
  };

  const pickMars = (opt) => {
    setShowMarsChooser(false);
    if (opt.target.kind === 'route') {
      window.location.href = opt.target.route;
      return;
    }
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
  // Walker's ground position on the planet surface, fed by the
  // scene's CameraGroundTracker; PlanetConsole reads it to name the
  // region underfoot (lib/planets/landscape.js soft biome field).
  const planetPosRef = useRef({ x: 10, z: 26 });
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
    planetPosRef.current = { x: 10, z: 26 };
    setActivePlanet(key);
    setPlanetSelected(null);
    setPlanetFocusReq(null);
    setPlanetMode('orbit');
    setAppState('planet_surface');
  };

  // Jupiter chooser (Merlin, 2026-11-15): tapping Jupiter now offers
  // Jupiter 1 or Jupiter 2 — the same menu Earth got (Merlin,
  // 2026-10-31). Jupiter 1 dives into the hub's gas giant below;
  // Jupiter 2 is the standalone /jupiter-2 route. The dialog renders
  // from PLANET_CHOOSERS (lib/planets/planet-choosers.js) — one source
  // of truth for both menus — and this handler dispatches the pick.
  const beginJupiterDive = () => {
    if (appState !== 'hub_freeroam') return;
    setShowJupiterChooser(true);
  };

  const pickJupiter = (opt) => {
    setShowJupiterChooser(false);
    if (opt.target.kind === 'route') {
      window.location.href = opt.target.route;
      return;
    }
    beginPlanetDive(opt.target.key);
  };

  // Planet tap dispatch (Merlin, 2026-11-15): Jupiter opens its chooser
  // instead of diving straight in; every other outer planet dives
  // exactly as before. Passed to HomeScene as the beginPlanetDive prop
  // so the scene itself needs no change.
  const handlePlanetTap = (key) => {
    if (key === 'jupiter') {
      beginJupiterDive();
      return;
    }
    beginPlanetDive(key);
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

  const arriveEarth = (dest) => {
    setPendingDest(null);
    if (pendingRoamRef.current) {
      pendingRoamRef.current = false;
      // Spawn rule (Merlin, Nov 16 ~04:41): if another user or
      // an agent is already driving at the destination, land the
      // newcomer a little ways away instead of on top of them —
      // same rule as the globe tap.
      const spot = clearSpawnPoint(dest.lat, dest.lon, [...kartState.rivals, ...sharedPeerVehicles]);
      setEarthFocus({ ...dest, lat: spot.lat, lon: spot.lon });
      beginRoam(roamState, spot.lat, spot.lon, 0);
      setAppState('diving_to_street');
    } else {
      setEarthFocus(dest);
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

  const beginStreetDive = () => {
    if (!earthFocus) return;
    fx.earthDive();
    // Spawn rule (Merlin, Nov 16 ~04:41): same check as the
    // globe tap — if another user or an agent is already driving
    // at the focus, dive a little ways away instead of on top
    // of them.
    const spot = clearSpawnPoint(earthFocus.lat, earthFocus.lon, [...kartState.rivals, ...sharedPeerVehicles]);
    setEarthFocus({ ...earthFocus, lat: spot.lat, lon: spot.lon });
    beginRoam(roamState, spot.lat, spot.lon, roamState.yawDeg || 0);
    setAppState('diving_to_street');
  };

  // REMOVED 2026-10-26 (Merlin: "Remove the quantum realm
  // completely"): the double-click / double-tap tile shrink entry
  // and the tile-selection DROP flow are gone with it. Street
  // level is entered only via beginStreetDive, which lands the
  // traveler at normal size on the surface — no shrink, no
  // second level, no tile selection state.
  //
  // REMOVED 2026-11-15 (Merlin: Earth 1 has no landmarks
  // anymore): the landmark spawn list (earthSpawns) and the
  // landmark spawn picker (pickSpawn) are gone with the
  // landmarks — click-to-spawn (handleEarthGlobeClick) replaces
  // them. The old travelToEarth (console search / quick
  // locations) is gone with the old console.

  const controlsRef = useRef({
    moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0, keyW: 0, keyS: 0, keyA: 0, keyD: 0, zoom: 52, lastPinchDist: null
  });

  const bikeRef = useRef(null);
  // Menu index: the 179 registry entries, plus Agent Forge for the owner
  // only (2026-10-28: its home is the ATHENA menu row, not the old footer
  // card). Non-owners never get the entry, so the menu's `if (!sat)` guard
  // skips the row — and search — for them, exactly like OWNER_PORTALS.
  const satIndex = useMemo(() => {
    const map = new Map(SATELLITES.map((s) => [s.key, s]));
    if (isOwner) {
      map.set(AGENT_FORGE_MENU.key, {
        key: AGENT_FORGE_MENU.key,
        route: AGENT_FORGE_MENU.route,
        pos: AGENT_FORGE_MENU.pos,
        section: 'AI PROGRAMS',
        constellation: 'ATHENA',
      });
    }
    // Agent Engine's page bounces non-owners home, so its row is
    // owner-only too: without the entry the menu's `if (!sat)` guard
    // skips the row — and search — for everyone else, instead of
    // showing them a row they cannot open.
    if (!isOwner) map.delete(AGENT_ENGINE_MENU.key);
    return map;
  }, [isOwner]);



  const [joyBase, setJoyBase] = useState({ x: 0, y: 0 });
  const [joyStick, setJoyStick] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  // Earth street joystick (video QA V2-2, 2026-10-26): the page's
  // floating joystick only appears WHILE dragging, so a new
  // player on Earth street level saw no movement control at all
  // and had to guess the invisible left-half drag. During
  // earth_roam a persistent DRIVE stick sits bottom-right
  // (Merlin, 2026-10-26: steering lives in a bottom-right
  // square of the screen), writing the same moveX/moveY
  // channels the supercar reads for steering + thrust. There is
  // no bike any more (vehicles only, 2026-11-15), so the stick
  // never stands down. The first-entry hint shows once, until
  // dismissed or 8 s pass.
  const [earthMoveHint, setEarthMoveHint] = useState(false);
  useEffect(() => {
    if (appState !== 'earth_roam') return undefined;
    let seen = false;
    try { seen = localStorage.getItem('earth-move-hint-seen') === '1'; } catch { seen = true; }
    if (seen) return undefined;
    setEarthMoveHint(true);
    const t = setTimeout(() => {
      setEarthMoveHint(false);
      try { localStorage.setItem('earth-move-hint-seen', '1'); } catch {}
    }, 8000);
    return () => clearTimeout(t);
  }, [appState]);
  const dismissEarthMoveHint = () => {
    setEarthMoveHint(false);
    try { localStorage.setItem('earth-move-hint-seen', '1'); } catch {}
  };
  const lastLook = useRef({ x: 0, y: 0 });
  const isLooking = useRef(false);

  const { tiltMsg } = useTilt({
    controlsRef,
    flightAxis,
    appState,
    joyActive,
    onAutoAxis: setFlightAxis,
    manualAxisRef,
  });

  // FLIGHT AXIS toggle (Merlin, 2026-11-13): one tap switches the hub
  // movement mode between HORIZONTAL and VERTICAL. The tap also hands
  // axis authority to the toggle for the session (manualAxisRef) so
  // tilt stops auto-flipping the mode from the phone's pitch — the
  // control never fights the user. Tilt steering itself is untouched:
  // in vertical mode tilting the phone still climbs/descends, and in
  // horizontal mode tilt steers nothing, so the phone can be held
  // naturally without drifting up or down.
  const toggleFlightAxis = () => {
    try { fx.tap(); } catch {}
    manualAxisRef.current = true;
    setFlightAxis((axis) => nextFlightAxis(axis));
  };

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
          setIsOwner(isOwnerEmail(session.user.email));
          stashHubRegisteredAt(session.user.created_at);
        } else {
          const cached = localStorage.getItem('nexus_user');
          if (cached) setUser(cached);
          setIsOwner(false);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const callsign = session.user.user_metadata?.username || session.user.user_metadata?.callsign || session.user.email?.split('@')[0].toUpperCase();
          localStorage.setItem('nexus_user', callsign);
          setUser(callsign);
          setIsOwner(isOwnerEmail(session.user.email));
          stashHubRegisteredAt(session.user.created_at);
        } else {
          localStorage.removeItem('nexus_user');
          setUser(null);
          setIsOwner(false);
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

  // iOS Safari "Search" pill (Merlin, 2026-11-16 — Earth 1 video):
  // the program menu's search field (components/SatelliteMenu.jsx,
  // inputMode="search") unmounts when the menu collapses, and iOS
  // Safari leaves its floating "Search" pill on screen when a
  // focused search field is removed while focused — the same
  // mechanism as the Erebus jump sheet (app/erebus/page.jsx).
  // Blur on close so the pill never strands. There is no autoFocus
  // input in the Earth 1 flow to remove (the vehicle sheet, the
  // Earth chooser and the landing modal carry no search field at
  // all): the menu search is tap-focused, and this blur is the fix
  // for it — it covers every menu-close path in one place (the
  // collapse button, a launch, a tile, the tube landing).
  useEffect(() => {
    if (!isMenuExpanded && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [isMenuExpanded]);

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

  // HUB BASEBALL (Merlin, Nov 26): the page owns the flight wiring —
  // refs the scene reads/writes, the SWING/QUIT orbs, the flight HUD,
  // and the leaderboard. The scene submits NOTHING; only the page
  // submits, once per flight, on 'end' or QUIT.
  const baseballCmdRef = useRef({ swing: 0, quit: 0 });
  const baseballHudRef = useRef({ flying: false, nearPlate: false, distanceM: 0, maxDistanceM: 0, bestM: 0, eaten: false });
  const [baseballNear, setBaseballNear] = useState(false);
  const [baseballFlight, setBaseballFlight] = useState(null); // { distanceM, maxDistanceM } | null
  const [baseballBoard, setBaseballBoard] = useState(null);
  // Once-only submit guard: the flight id increments on every 'start';
  // the last submitted id is remembered so a natural 'end' and a QUIT
  // tap for the same flight can never double-submit.
  const baseballFlightIdRef = useRef(0);
  const baseballSubmittedRef = useRef(0);

  // Submit one finished flight. Never throws, never breaks the game:
  // a missing token or a failed / 503 leaderboard is swallowed — the
  // board refetch after the flight shows the local-only state.
  const submitBaseballFlight = useCallback(async (flightId, distanceM, eaten) => {
    if (!flightId || baseballSubmittedRef.current === flightId) return;
    baseballSubmittedRef.current = flightId;
    try {
      const token = await getAccessToken();
      if (!token) return;
      await submitFlight(token, { distanceM: Math.round(distanceM || 0), eaten: !!eaten, player: user || 'Player' });
    } catch { /* leaderboard failure must never break the game */ }
  }, [getAccessToken, user]);

  // Board fetch: on mount (user present) and after each flight end.
  // Unavailable (503 / null / error) → null: the scoreboard in the
  // scene falls back to a local-only note.
  const refreshBaseballBoard = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) { setBaseballBoard(null); return; }
      const board = await fetchBoard(token);
      if (!board || board.unavailable || board.ok === false) { setBaseballBoard(null); return; }
      setBaseballBoard(board);
    } catch {
      setBaseballBoard(null);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!user || cloudOffline) return;
    refreshBaseballBoard();
  }, [user, cloudOffline, refreshBaseballBoard]);

  // Scene → page flight events. 'end' submits (once), refetches the
  // board once the submit settles, and hands the camera back to
  // freeroam — the scene teleports to the plate viewpoint first.
  // 'end' deliberately does NOT touch baseballNear: the scene owns
  // proximity and re-reports on flip when the camera lands back at
  // the plate; clearing it here could strand the SWING orb hidden
  // if no flip ever fires.
  const handleBaseballUpdate = useCallback((evt) => {
    if (!evt || typeof evt !== 'object') return;
    if (evt.type === 'proximity') {
      setBaseballNear(!!evt.nearPlate);
    } else if (evt.type === 'start') {
      baseballFlightIdRef.current += 1;
      setBaseballFlight({ distanceM: 0, maxDistanceM: 0 });
    } else if (evt.type === 'tick') {
      setBaseballFlight({ distanceM: evt.distanceM || 0, maxDistanceM: evt.maxDistanceM || 0 });
    } else if (evt.type === 'end') {
      const flightId = baseballFlightIdRef.current;
      setBaseballFlight(null);
      submitBaseballFlight(flightId, evt.maxDistanceM || 0, !!evt.eaten).finally(() => { refreshBaseballBoard(); });
      setAppState('hub_freeroam');
    }
  }, [submitBaseballFlight, refreshBaseballBoard]);

  // QUIT orb: read the final stats from the HUD ref (the scene writes
  // it every frame), submit once for this flight, hand back to
  // freeroam, and tell the scene to abort the flight. If the scene
  // then also fires 'end' for the same flight, the submit guard
  // makes it a no-op. No 'start' seen yet (flight id 0) → nothing
  // to submit; the scene's own 'end' will carry it if it comes.
  const quitBaseballFlight = () => {
    try { fx.tap(); } catch {}
    const hud = baseballHudRef.current || {};
    const flightId = baseballFlightIdRef.current;
    setBaseballFlight(null);
    if (flightId) {
      submitBaseballFlight(flightId, hud.maxDistanceM || 0, !!hud.eaten).finally(() => { refreshBaseballBoard(); });
    }
    setAppState('hub_freeroam');
    baseballCmdRef.current.quit++;
  };

  const swingBaseball = () => {
    try { fx.tap(); } catch {}
    setAppState('baseball_flight');
    baseballCmdRef.current.swing++;
  };

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
    // Display name for the tube ride's "Approaching …" overlay.
    targetNameRef.current =
      typeof satKey === 'string' && satKey
        ? prettifyKey(satKey)
        : prettifyKey(String(route).split('/').filter(Boolean).pop() || 'realm');
    setIsMenuExpanded(false);
    setAppState('returning_to_satellite');
  }, [POS_MAP]);

  // The 3D drop reached the satellite's portal: ride the vortex tube the
  // last stretch, then route. External links skip the tube.
  const handleSatellitePortal = useCallback((route) => {
    if (String(route).startsWith('http')) {
      window.location.href = route;
      return;
    }
    satTubeSkinsRef.current = pickVortexWraps(satTubeSkinsRef.current);
    setSatTube({ route, name: targetNameRef.current || 'Realm' });
  }, []);

  const satTubeDone = useCallback(() => {
    const route = satTube?.route;
    const jumpTo = satTube?.jumpTo;
    setSatTube(null);
    if (jumpTo) {
      // Planet jump: force free-fly (bike mode would overwrite the camera),
      // then hand the position to the Canvas on the next frame.
      setAppState('hub_freeroam');
      setPendingJump(jumpTo);
    } else if (route) {
      // A concourse deep link lands with the hall open: the hub
      // program menu would cover the sheet (z-40000 over z-62), so
      // collapse it as the ride lands — the same thing ?concourse=1
      // does on a fresh hub load (that effect runs once per mount
      // and misses a same-page ride).
      if (String(route).includes('concourse=1')) setIsMenuExpanded(false);
      router.push(route);
    }
  }, [satTube, router]);

  // Planet Portal: vortex ride to a 3D position (not a route).
  // `destination` is { name, position: { x, y, z } }.
  const handlePlanetJump = useCallback((destination) => {
    if (!destination?.position) return;
    satTubeSkinsRef.current = pickVortexWraps(satTubeSkinsRef.current);
    setSatTube({
      route: null,
      name: destination.name || 'Planet',
      jumpTo: destination.position,
    });
  }, []);

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
      // Earth street: the visible drive stick owns the left half —
      // the hub's invisible floating stick stands down here, or
      // the two would fight over the same moveX/moveY channels
      // (the stick's own onMove writes them now). The right-half
      // look drag below is untouched.
      if (appState === 'earth_roam') return;
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

                {/* Overlap repair (2026-10-27): this wrapper used to
                    scroll AND SatelliteMenu scrolled inside it — nested
                    scrollers smeared rows over each other on iPhone
                    momentum scrolls. Now the wrapper is a plain flex
                    column: SatelliteMenu takes the remaining height
                    and its items list is the ONE scroller. */}
                <div className="flex-1 min-h-0 flex flex-col gap-4">
                  <div className="flex-1 min-h-0">
                  <SatelliteMenu
                    t={t}
                    satIndex={satIndex}
                    onLaunch={(route, key, pos) => launchPocketUniverse(route, key, pos)}
                  />
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

      {/* FLIGHT AXIS toggle (Merlin, 2026-11-13): the visible control
          for vertical/horizontal switching for movement within the hub.
          One tap flips the mode; the streaks canvas always depicts the
          CURRENT axis and the label names it, so the user always knows
          which mode they are in. Bottom-center, one thumb's reach, out
          of the look zone (right half) and the walk-stick corner.
          .ui-element so the page's drag-look handler ignores taps on it.
          Shown in hub_freeroam and on_bike — the two states where the
          axis drives movement (freeroam flight + mounted bike flight).
          In vertical mode tilt steering is the primary climb/descend
          input; in horizontal mode tilt steers nothing.
          Hidden while the Earth 1 vehicle sheet is open (Merlin,
          2026-11-16 — Earth 1 video: the pill overlapped the bottom
          of the sheet; the Omega layout rule allows no overlap,
          ever — the sheet is a full-screen overlay, so the pill
          simply stands down until it closes). */}
      {(user || cloudOffline) && (appState === 'hub_freeroam' || appState === 'on_bike') && !showEarthVehicleSelect && (
        <button
          type="button"
          onClick={toggleFlightAxis}
          className="absolute left-1/2 -translate-x-1/2 z-[70] ui-element pointer-events-auto flex items-center gap-2 rounded-full border border-cyan-500/40 bg-zinc-950/90 pl-3 pr-4 py-1.5 shadow-lg backdrop-blur-md"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)', ...chromeHiddenStyle }}
          aria-pressed={flightAxis === 'vertical'}
          aria-label={`Flight axis: ${flightAxisLabel(flightAxis)}. Tap to switch to ${flightAxis === 'vertical' ? 'horizontal' : 'vertical'} movement.`}
          title="Switch flight axis"
        >
          <FlightAxisStreaks axis={flightAxis} />
          <span className="flex flex-col items-start leading-none">
            <span className="text-[8px] font-bold tracking-[0.2em] text-cyan-400/80 uppercase">Flight axis</span>
            <span className="text-[11px] font-bold tracking-wider text-white uppercase">{flightAxisLabel(flightAxis)}</span>
          </span>
        </button>
      )}

      {/* HUB BASEBALL SWING orb (Merlin, Nov 26): shown in freeroam
          while the camera is near the plate (spawn is 55 from the
          plate, so it shows at spawn — discoverable). Bottom-right,
          96×96, plain circle orb — no rectangle, no glow, no video
          wrap — inline baseball SVG. Same spot/size as the QUIT orb
          and the Earth FIRE cluster; the two never show together.
          Bottom 80, NOT 18: at bottom 18 the 96 px orb overlaps the
          bottom-centre FLIGHT AXIS pill by 37 px at 320 wide (17 px
          at 360, 2 px at 390) — the no-overlap rule wins. The pill
          tops out ~66 px (48 px tall at bottom 18), so bottom 80
          clears it by ~14 px at every width; the tap hint stands
          down while this orb is up (see its gate below). */}
      {(user || cloudOffline) && appState === 'hub_freeroam' && baseballNear && !showEarthVehicleSelect && (
        <button
          type="button"
          onClick={swingBaseball}
          className="absolute z-[70] ui-element pointer-events-auto rounded-full border-2 border-red-600/70 bg-white shadow-lg flex items-center justify-center"
          style={{ right: 'calc(env(safe-area-inset-right, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', width: 96, height: 96, ...chromeHiddenStyle }}
          aria-label="Swing at the baseball"
          title="Swing"
        >
          <svg viewBox="0 0 96 96" width="88" height="88" aria-hidden="true">
            <circle cx="48" cy="48" r="44" fill="#f8fafc" stroke="#b91c1c" strokeWidth="2" />
            <path d="M22 16 C 40 32, 40 64, 22 80" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
            <path d="M74 16 C 56 32, 56 64, 74 80" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
            <g stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round">
              <line x1="30" y1="26" x2="38" y2="30" />
              <line x1="32" y1="38" x2="40" y2="42" />
              <line x1="32" y1="54" x2="40" y2="58" />
              <line x1="30" y1="66" x2="38" y2="70" />
              <line x1="66" y1="26" x2="58" y2="30" />
              <line x1="64" y1="38" x2="56" y2="42" />
              <line x1="64" y1="54" x2="56" y2="58" />
              <line x1="66" y1="66" x2="58" y2="70" />
            </g>
          </svg>
        </button>
      )}

      {/* HUB BASEBALL QUIT orb: same spot/size as SWING, shown only
          during the flight — the two never show together. Centred ✕
          glyph (text, not emoji). The FLIGHT AXIS pill and tap hint
          are both hidden during flight, so nothing contests this
          corner while it is up. */}
      {(user || cloudOffline) && appState === 'baseball_flight' && (
        <button
          type="button"
          onClick={quitBaseballFlight}
          className="absolute z-[70] ui-element pointer-events-auto rounded-full border-2 border-zinc-400/70 bg-zinc-950/90 shadow-lg flex items-center justify-center"
          style={{ right: 'calc(env(safe-area-inset-right, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', width: 96, height: 96, ...chromeHiddenStyle }}
          aria-label="Quit the flight"
          title="Quit"
        >
          <span className="text-white text-4xl leading-none" aria-hidden="true">✕</span>
        </button>
      )}

      {/* HUB BASEBALL flight HUD pill: top-centre during the flight,
          same top-5 slot the tilt pill uses (that pill is hidden in
          flight). max-w 92vw + nowrap + pointer-events-none, and the
          text is short (~200 px centred), so it never reaches the
          top-right fullscreen control. Best is the board's own best,
          falling back to the HUD ref's best while the board is
          unavailable. */}
      {(user || cloudOffline) && appState === 'baseball_flight' && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[60] pointer-events-none" style={chromeHiddenStyle}>
          <div className="text-[11px] text-zinc-200 bg-zinc-950/95 border border-cyan-500/40 rounded-full px-4 py-1.5 shadow-lg whitespace-nowrap max-w-[92vw] overflow-hidden text-ellipsis">
            {`${Math.round(baseballFlight?.distanceM ?? 0).toLocaleString()} m · BEST ${Math.round(baseballBoard?.mine?.best ?? baseballHudRef.current.bestM ?? 0).toLocaleString()} m`}
          </div>
        </div>
      )}

      {/* NIGHT GRID retired 2026-10-20: lives in the Concourse (Night tile). */}


      {/* BikeFloatButton retired 2026-10-20: lives in the Concourse (Bike tile). */}


      {(user || cloudOffline) && (appState === 'diving_to_earth' || appState === 'earth_surface' || appState === 'earth_travel' || appState === 'diving_to_street' || appState === 'earth_roam') && (
        <EarthConsole
          focus={earthFocus}
          phase={appState}
          onReturn={returnToOrbit}
          onStreet={beginStreetDive}
          onAscend={() => setAppState('earth_surface')}
        />
      )}

      {/* Persistent Earth street drive stick (video QA V2-2):
          bottom-LEFT square (Merlin, Nov 16 ~04:41 — the
          universal layout, semi-intact: stick left, actions
          right, speedo bottom-middle; one thumb can't steer
          and fire on the same side) — it steers the
          supercar (thrust + turn on the same moveX/moveY
          channels). The wrapper carries .ui-element so the page's
          own drag-look handler ignores touches on the stick.
          TOP LEVEL, NOT inside the hub_freeroam block (Merlin,
          2026-11-15 — the 0 km/h root cause: the stick lived
          inside the (hub_intro || hub_freeroam) fragment, so its
          own appState === 'earth_roam' gate could never fire
          and the stick never rendered on the phone — the only
          throttle was the invisible left-half floating stick).
          BOTTOM EDGE (Merlin, 2026-11-15, annotated screenshot
          — move it DOWN): 18px, so the stick sits at the very
          bottom of the screen; the FIRE cluster now rides at
          18px on the RIGHT, where the stick used to be. */}
      {(user || cloudOffline) && appState === 'earth_roam' && (
        // 104 px stick, not 112 (overlap audit, Merlin Nov 16):
        // at 360 wide a 112 px stick ends at x 130 while a
        // 3-digit speedo starts at ~x 126 — a ~4 px overlap at
        // 100+ km/h. 104 ends at x 122; the speedo's px-3
        // (EarthConsole) starts at ~x 130: 8 px clear at both
        // phone widths. Positions unchanged: stick bottom-left,
        // speedo bottom-centre, FIRE bottom-right.
        <div
          className="absolute z-[70] ui-element pointer-events-auto"
          style={{ left: 'calc(env(safe-area-inset-left, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)' }}
        >
          <WalkJoystick
            size={104}
            onMove={(x, y) => {
              // WalkJoystick reports y fwd-positive (up); the
              // hub channels carry moveY down-positive (the
              // page drag convention the flight controller
              // negates), so flip y here.
              controlsRef.current.moveX = x;
              controlsRef.current.moveY = -y;
            }}
          />
        </div>
      )}

      {/* First-entry Earth movement hint (video QA V2-2).
          Bottom-anchored, NOT top-centre (overlap audit, Merlin
          Nov 16): at top-5 the 71-character nowrap pill measured
          ~420 px wide — wider than a 390 px phone, running off
          both screen edges, with its middle hidden behind the
          console card (card x 102–374, y 16–188; pill y 20–51).
          It now rides 140 px up from the bottom edge — 18 px
          clear of the joystick top and 14 px clear of the FIRE
          column top at both phone heights — wraps to two lines
          inside 92vw, and keeps its copy, tap-to-dismiss and 8 s
          auto-dismiss. */}
      {(user || cloudOffline) && appState === 'earth_roam' && earthMoveHint && (
        <button
          type="button"
          onClick={dismissEarthMoveHint}
          className="absolute left-1/2 -translate-x-1/2 z-[70] ui-element pointer-events-auto rounded-full border border-cyan-500/40 bg-zinc-950/90 px-4 py-2 text-[11px] text-zinc-100 shadow-lg max-w-[92vw] text-center"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 140px)' }}
        >
          Bottom-left stick steers · drag the right side to look · tap to dismiss
        </button>
      )}

      {/* The mapping notice is gone entirely (Merlin,
          2026-11-15, crossed out in his screenshot): the
          notice component is deleted with its mount. The
          Oblivion rule itself is untouched — the only trigger
          in the whole repo is still the Jupiter 2 lever
          (lib/jupiter2/lever.js). */}

      {/* The mapped percentage tracker is gone with the mapping
          system (Merlin, 2026-11-15: the map goes away
          completely) — no pill, no percentage, no tracking. */}
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
          posRef={planetPosRef}
        />
      )}

      {/* Character picker now lives inside EarthConsole menu (not floating) */}

      {/* Hub tap hint — rides ABOVE the FLIGHT AXIS pill (overlap
          audit, Merlin Nov 16): both were bottom-centred at ~18–
          20 px, so the pill (y ~790–826) sat square on the hint
          (y ~794–824). The hint now sits 63 px up (pill top +
          12 px gap) and stands down while the vehicle sheet is
          open, like the pill itself. It also stands down while the
          baseball SWING orb is up (baseballNear): the orb is the
          call to action there, and the hint's right end would run
          under the orb at phone widths. */}
      {(user || cloudOffline) && appState === 'hub_freeroam' && !showEarthVehicleSelect && !baseballNear && (
        <div className="absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 63px)', ...chromeHiddenStyle }}>
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
        onSatellitePortal={handleSatellitePortal}
        onHubPortal={handleHubPortal}
        onSunClick={handleSunClick}
        onSunPullDone={handleSunPullDone}
        onMoonClick={handleMoonClick}
        sunPullRef={sunPullRef}
        sunExit={sunBaseExit}
        heavenUnlocked={portalHeavenUnlocked(portalProgress)}
        onPlanetJump={handlePlanetJump}
        pendingJump={pendingJump}
        onJumpConsumed={() => setPendingJump(null)}
        controlsRef={controlsRef}
        baseballCmdRef={baseballCmdRef}
        baseballHudRef={baseballHudRef}
        baseballBoard={baseballBoard}
        onBaseballUpdate={handleBaseballUpdate}
        flightAxis={flightAxis}
        adWindowRef={adWindowRef}
        activeSatTarget={activeSatTarget}
        bikeRef={bikeRef}
        earthQuatRef={earthQuatRef}
        earthFocus={earthFocus}
        pendingDest={pendingDest}
        arriveEarth={arriveEarth}
        beginEarthDive={beginEarthDive}
        oblivion={oblivion}
        onEarthGlobeClick={handleEarthGlobeClick}
        earthPickMode={earthPickMode}
        beginMarsDive={beginMarsDive}
        marsProfile={marsProfile}
        marsTime={marsTime}
        marsMode={marsMode}
        marsInputRef={marsInputRef}
        marsFocusReq={marsFocusReq}
        onMarsSelect={selectMars}
        marsSelectedId={marsSelected ? marsSelected.id : null}
        beginPlanetDive={handlePlanetTap}
        planetProfile={planetProfile}
        planetTime={planetTime}
        planetMode={planetMode}
        planetInputRef={planetInputRef}
        planetFocusReq={planetFocusReq}
        onPlanetSelect={selectPlanet}
        planetSelectedId={planetSelected ? planetSelected.id : null}
        planetPosRef={planetPosRef}
        onBikeDismount={handleBikeDismount}
        onLaunchExternal={(url, id) => {
          adWindowRef.current = window.open('', '_blank');
          launchPocketUniverse(url, null, null, id);
        }}
      />
      {/* The Oblivion witness (Merlin's canon, Nov 19 ~00:16): the
          puller — and anyone evacuated from Earth — watches Earth
          blow up once, then the hub shows the timer cube. The flag
          clears when the sequence ends so it never replays. */}
      {/* Honest oblivion notice (Nov 21 fix): the flag said "watch"
          but the server disagreed — the arm did not land, or the
          state could not be checked. Tap to dismiss. */}
      {oblivionNotice && (
        <button
          type="button"
          onClick={() => setOblivionNotice(null)}
          className="fixed left-1/2 top-4 z-[2147483003] -translate-x-1/2 rounded-full border border-amber-300/60 bg-black/80 px-4 py-2 text-center text-sm font-semibold text-amber-200"
          aria-label="Oblivion notice, tap to dismiss"
        >
          {oblivionNotice}
        </button>
      )}
      {showWitness && (
        <div className="fixed inset-0" style={{ zIndex: 2147483002 }} role="dialog" aria-label="Earth is gone">
          <OblivionCollapse
            onDone={() => {
              clearWitnessFlag();
              setShowWitness(false);
            }}
          />
        </div>
      )}
      {/* Portal room (Merlin, 2026-11-13): the hub portals' room —
          aurora boot sequence, then the holographic realm carousel. */}
      <PortalRoom
        side={portalRoomSide || 'nether'}
        open={!!portalRoomSide}
        onClose={() => setPortalRoomSide(null)}
      />
      {/* Sun-base pull flash: the gold cut as the pull lands and the
          base route opens — the camera is already inside the sun. */}
      {sunFlash && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 2147483647, pointerEvents: 'none',
            background: 'radial-gradient(90% 90% at 50% 50%, #fff7d6 0%, #ffd98a 45%, #ff9a3c 100%)',
          }}
        />
      )}
      {/* Sun-base exit flash: the entry flash in reverse — full gold
          on arrival from the base, fading over the same 1.4 s as the
          camera drifts out of the sun. */}
      {sunExitFlash && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 2147483647, pointerEvents: 'none',
            background: 'radial-gradient(90% 90% at 50% 50%, #fff7d6 0%, #ffd98a 45%, #ff9a3c 100%)',
            opacity: sunExitFaded ? 0 : 1,
            transition: `opacity ${SUN_BASE_PULL_MS}ms ease-out`,
          }}
        />
      )}
      {/* Satellite drop → vortex tube: the fullscreen ride carries the
          user from the satellite's portal to the realm. */}
      {/* Earth chooser (Merlin, 2026-10-31): tapping the Earth planet
          offers Earth 1, Earth 2, Earth 3 or Earth 4 — all four
          unlocked for all users (Merlin, 2026-11-14). */}
      {showEarthChooser && (
        <div
          className="fixed inset-0 flex items-center justify-center p-6"
          style={{
            zIndex: 2147483001,
            backgroundImage: 'url(/images/earth-chooser-bg.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          role="dialog"
          aria-label="Choose your Earth"
        >
          {/* The card scrolls instead of running off the screen
              (overlap audit, Merlin Nov 16): the four button
              descs wrap to two lines at phone width, so the card
              measures ~712 px tall — past the 692 px available
              at 360×740 — and without a cap it ran ~10 px off
              the top and bottom edges. At 390×844 it still fits
              untouched; the cap only bites on the small phone. */}
          <div className="w-full max-w-sm rounded-2xl bg-slate-900/80 p-6 text-center shadow-2xl backdrop-blur-sm max-h-[calc(100dvh-3rem)] overflow-y-auto">
            <div className="mb-1 text-2xl font-extrabold text-white">Choose your Earth</div>
            <div className="mb-5 text-sm text-slate-300">Four worlds. One tap.</div>
            <button
              type="button"
              onClick={chooseEarth1}
              disabled={oblivion.active}
              className="mb-3 block w-full overflow-hidden rounded-xl text-left text-white transition hover:brightness-110 disabled:opacity-60 disabled:hover:brightness-100"
              style={{
                backgroundImage: 'url(/images/earth1-button-bg.webp)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div className="px-4 py-4" style={{ background: 'linear-gradient(90deg, rgba(0,20,40,0.55) 0%, rgba(0,20,40,0.15) 60%, transparent 100%)' }}>
                <div className="text-lg font-bold">🌍 Earth 1</div>
                <div className="text-sm opacity-90">{oblivion.active ? `Gone — returns in ${formatCountdown(oblivion.remainingMs)}` : 'The world you know. Streets, driving, the grind.'}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={chooseEarth2}
              className="mb-4 block w-full overflow-hidden rounded-xl text-left text-white transition hover:brightness-110"
              style={{
                backgroundImage: 'url(/images/earth2-button-bg.webp)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div className="px-4 py-4" style={{ background: 'linear-gradient(90deg, rgba(20,0,30,0.6) 0%, rgba(20,0,30,0.2) 60%, transparent 100%)' }}>
                <div className="text-lg font-bold">🌑 Earth 2</div>
                <div className="text-sm opacity-90">Monsters, gunplay, land, building — unlock what you want.</div>
              </div>
            </button>
            {/* Earth 3 (Merlin, 2026-11-14): unlocked — tapping it
                takes the user to /new-earth. */}
            <button
              type="button"
              onClick={chooseEarth3}
              className="mb-4 block w-full overflow-hidden rounded-xl text-left text-white transition hover:brightness-110"
              style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              }}
            >
              <div className="px-4 py-4" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)' }}>
                <div className="text-lg font-bold">🌍 Earth 3</div>
                <div className="text-sm opacity-90">The boundless world. 10 billion tiles.</div>
              </div>
            </button>
            {/* Earth 4 (Merlin, 2026-11-14): unlocked — tapping it
                takes the user to /earth-4.
                True Earth size, fully explorable, true textures. */}
            <button
              type="button"
              onClick={chooseEarth4}
              className="mb-4 block w-full overflow-hidden rounded-xl text-left text-white transition hover:brightness-110"
              style={{
                background: 'linear-gradient(135deg, #0f2a1a 0%, #14532d 50%, #166534 100%)',
              }}
            >
              <div className="px-4 py-4" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)' }}>
                <div className="text-lg font-bold">🌍 Earth 4</div>
                <div className="text-sm opacity-90">True Earth size. Fully explorable. True textures.</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowEarthChooser(false)}
              className="mb-4 text-sm text-slate-300 underline"
            >
              Not now
            </button>
            {/* Omega portal street light (Merlin, 2026-10-31): the one
                portal that used to stand behind the Sun, now a glowing
                lamp in a street-light housing at the bottom of the menu. */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={chooseOmegaPortal}
                aria-label="Omega Portal"
                className="rounded-full p-2 transition hover:brightness-125"
                style={{ background: '#0b0b14', boxShadow: '0 0 0 2px #3f3f4d, 0 0 24px rgba(251,191,36,0.35)' }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: 72,
                    height: 72,
                    backgroundImage: 'url(/images/omega-portal-lamp.webp)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    boxShadow: '0 0 18px rgba(251,191,36,0.55), inset 0 0 12px rgba(0,0,0,0.45)',
                  }}
                />
              </button>
              <div className="mt-2 text-xs font-bold tracking-widest text-amber-200/90">Ω OMEGA PORTAL</div>
            </div>
          </div>
        </div>
      )}
      {/* Earth 1 vehicle entry (vehicles only, Merlin 2026-11-15):
          the chooser's Earth 1 button opens ONLY this menu — every
          roster vehicle with a live 3D preview — and the menu's
          pick step turns the hub globe into the spawn picker. The
          menu stays in hub_freeroam; the dive starts on the globe
          tap (handleEarthGlobeClick). */}
      {showEarthVehicleSelect && appState === 'hub_freeroam' && (
        <EarthVehicleSelect
          onSelect={handleEarthVehiclePick}
          onCancel={cancelEarthVehicleSelect}
          onPickModeChange={setEarthPickMode}
        />
      )}
      {/* Jupiter chooser (Merlin, 2026-11-15): tapping the Jupiter planet
          offers Jupiter 1 or Jupiter 2 — the same menu Earth got
          (Merlin, 2026-10-31). Jupiter 1 dives into the hub's gas giant;
          Jupiter 2 is the standalone /jupiter-2 route. */}
      {showJupiterChooser && (
        <div
          className="fixed inset-0 flex items-center justify-center p-6"
          style={{
            zIndex: 2147483001,
            backgroundImage: `url(${PLANET_CHOOSERS.jupiter.background})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          role="dialog"
          aria-label={PLANET_CHOOSERS.jupiter.title}
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900/80 p-6 text-center shadow-2xl backdrop-blur-sm">
            <div className="mb-1 text-2xl font-extrabold text-white">{PLANET_CHOOSERS.jupiter.title}</div>
            <div className="mb-5 text-sm text-slate-300">{PLANET_CHOOSERS.jupiter.subtitle}</div>
            {PLANET_CHOOSERS.jupiter.options.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => pickJupiter(opt)}
                className={`${i === 0 ? 'mb-3' : 'mb-4'} block w-full overflow-hidden rounded-xl text-left text-white transition hover:brightness-110`}
                style={opt.background.startsWith('/')
                  ? { backgroundImage: `url(${opt.background})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: opt.background }}
              >
                <div className="px-4 py-4" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)' }}>
                  <div className="text-lg font-bold">{opt.label}</div>
                  <div className="text-sm opacity-90">{opt.description}</div>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowJupiterChooser(false)}
              className="mb-4 text-sm text-slate-300 underline"
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {/* Mars chooser (Merlin, 2026-11-15): tapping the Mars planet
          offers Mars 1 or Mars 2 — the same menu Earth got
          (Merlin, 2026-10-31). Mars 1 dives into the in-hub realm;
          Mars 2 is the standalone /mars-2 route. */}
      {showMarsChooser && (
        <div
          className="fixed inset-0 flex items-center justify-center p-6"
          style={{
            zIndex: 2147483001,
            backgroundImage: `url(${PLANET_CHOOSERS.mars.background})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          role="dialog"
          aria-label={PLANET_CHOOSERS.mars.title}
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900/80 p-6 text-center shadow-2xl backdrop-blur-sm">
            <div className="mb-1 text-2xl font-extrabold text-white">{PLANET_CHOOSERS.mars.title}</div>
            <div className="mb-5 text-sm text-slate-300">{PLANET_CHOOSERS.mars.subtitle}</div>
            {PLANET_CHOOSERS.mars.options.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => pickMars(opt)}
                className={`${i === 0 ? 'mb-3' : 'mb-4'} block w-full overflow-hidden rounded-xl text-left text-white transition hover:brightness-110`}
                style={opt.background.startsWith('/')
                  ? { backgroundImage: `url(${opt.background})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: opt.background }}
              >
                <div className="px-4 py-4" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)' }}>
                  <div className="text-lg font-bold">{opt.label}</div>
                  <div className="text-sm opacity-90">{opt.description}</div>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMarsChooser(false)}
              className="mb-4 text-sm text-slate-300 underline"
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {satTube && satTubeSkinsRef.current && (
        <div
          className="fixed inset-0 overflow-hidden bg-black"
          style={{ zIndex: 2147483000 }}
          role="dialog"
          aria-label={`Traveling to ${satTube.name}`}
        >
          <VortexTubeRide
            outsideSkin={satTubeSkinsRef.current.outside}
            insideSkin={satTubeSkinsRef.current.inside}
            destinationName={satTube.name}
            durationMs={VORTEX_RIDE_MS}
            onDone={satTubeDone}
            characterPreview={riderPrefs.characterPreview}
            perspective={riderPrefs.perspective}
          />
        </div>
      )}
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
