'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Auth from '@/components/Auth';
import { supabase } from '@/lib/supabase';
import { LanguageProvider, useI18n } from '@/lib/i18n';
import { SATELLITES } from '@/lib/i18n/satellites';
import SatelliteMenu from '@/components/SatelliteMenu';
import { PortalButtonDecor, MenuHeaderDecor } from '@/components/PortalSeasonalDecor';
import { orbitTime, orbitPositionFor } from '@/lib/god-orbits';
import { GOD_TOWER_SPOTS, GOD_TOWER_POS, BABEL_POS, ARTEMIS_POS } from '@/lib/home-positions';
import SettingsGear from '@/components/SettingsGear';
import StoreFloatButton from '@/components/StoreFloatButton';
import BikeFloatButton from '@/components/BikeFloatButton';
import FlightAxisStreaks from '@/components/FlightAxisStreaks';
import { fetchRiderState, saveRiderState, DISMOUNT_EYE } from '@/lib/rider-state';
import ProfileIcon from '@/components/ProfileIcon';
import NotificationsWindow from '@/components/NotificationsWindow';
import EntranceSequence from '@/components/EntranceSequence';
import { createEntranceMachine } from '@/lib/entrance-sequence';
import EarthConsole from '@/components/EarthConsole';
import { getUserPosition, FALLBACK_POSITION } from '@/lib/geo';
import { roamState, beginRoam, endRoam, landmarkSpawns } from '@/lib/earth/roam';
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
    const handleKeyDown = (e) => {
      if (appState === 'hub_intro') setAppState('hub_freeroam');
      if(e.key.toLowerCase()==='w') controlsRef.current.keyW = 1;
      if(e.key.toLowerCase()==='s') controlsRef.current.keyS = 1;
      if(e.key.toLowerCase()==='a') controlsRef.current.keyA = 1;
      if(e.key.toLowerCase()==='d') controlsRef.current.keyD = 1;
    };
    const handleKeyUp = (e) => {
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
      {(user || cloudOffline) && !showIntro && (appState === 'hub_intro' || appState === 'hub_freeroam') && (
        <div className="absolute top-5 left-5 z-50 flex flex-col gap-3 ui-element pointer-events-auto" style={chromeHiddenStyle}>
          <button
            onClick={() => { fx.tap(); setShowIntro(true); }}
            aria-label="Replay intro"
            title="Replay intro"
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl text-zinc-400 border-2 border-zinc-800 bg-zinc-950/80 backdrop-blur-md hover:text-white hover:border-zinc-500 hover:scale-105 active:scale-95 transition-all"
          >
            <span aria-hidden="true">↺</span>
          </button>
          <button
            onClick={() => { fx.tap(); router.push('/renewal-plan'); }}
            aria-label="Open the Renewal Plan timeline"
            title="Renewal Plan"
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl text-teal-300/80 border-2 border-teal-500/30 bg-zinc-950/80 backdrop-blur-md hover:text-teal-100 hover:border-teal-400/60 hover:scale-105 active:scale-95 transition-all"
          >
            <span aria-hidden="true">◈</span>
          </button>
          <button
            onClick={() => { fx.tap(); setShowHubTutorial(true); }}
            aria-label="Replay the hub tutorial"
            title="Tutorial"
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl text-zinc-400 border-2 border-zinc-800 bg-zinc-950/80 backdrop-blur-md hover:text-white hover:border-zinc-500 hover:scale-105 active:scale-95 transition-all"
          >
            <span aria-hidden="true">?</span>
          </button>
        </div>
      )}
      
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
          ) : (
            <div className="absolute bottom-[calc(8.75rem+env(safe-area-inset-bottom))] left-5 z-[80] flex flex-col items-start gap-4 ui-element pointer-events-auto" style={chromeHiddenStyle}>
              <div className="relative">
                <button
                  onClick={() => { fx.menuOpen(); setIsMenuExpanded(true); }}
                  aria-label="Open menu"
                  className="w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(0,242,255,0.4)] hover:scale-105 transition-all overflow-hidden border-2 border-cyan-500 relative bg-cyan-950/60"
                >
                  <video src="/chess/assets/effects/gemini_generated_video_758D2655.mp4" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover scale-110" />
                </button>
                <PortalButtonDecor />
              </div>
            </div>
          )}

          <div
            role="status"
            aria-label={`Flight axis: ${flightAxis}`}
            style={chromeHiddenStyle}
            className="absolute top-5 right-5 z-50 w-14 h-14 rounded-full flex items-center justify-center overflow-hidden border-2 border-cyan-500/50 bg-zinc-950/90 shadow-[0_0_20px_rgba(0,242,255,0.15)] backdrop-blur-md ui-element pointer-events-none"
          >
            <FlightAxisStreaks axis={flightAxis} />
          </div>

          {tiltMsg && (
            <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[60] pointer-events-none" role="status" aria-live="polite" style={radioSheetOpen ? { visibility: 'hidden' } : undefined}>
              <div className="text-[11px] text-zinc-200 bg-zinc-950/95 border border-cyan-500/40 rounded-full px-4 py-1.5 shadow-lg whitespace-nowrap">
                {tiltMsg}
              </div>
            </div>
          )}

          <div style={chromeHiddenStyle} aria-hidden={radioSheetOpen || undefined}>
            <StoreFloatButton />
          </div>

          <div className="absolute top-[5.75rem] right-5 z-50 flex items-center gap-3 ui-element pointer-events-auto" style={chromeHiddenStyle}>
            <NotificationsWindow />
            <ProfileIcon />
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

      {(user || cloudOffline) && (appState === 'hub_intro' || appState === 'hub_freeroam' || appState === 'to_bike' || appState === 'on_bike') && (
        <div
          className="fixed z-40 flex flex-col items-center ui-element pointer-events-auto"
          style={{
            right: 'calc(env(safe-area-inset-right, 0px) + 14px)',
            top: 'calc(50% - 110px)',
            ...(radioSheetOpen ? { visibility: 'hidden', opacity: 0, pointerEvents: 'none' } : {}),
          }}
        >
          <button
            type="button"
            onClick={() => {
              fx.bikeMount();
              launchPocketUniverse(shadowRealmUrl('race'), 'shadow-realm', null, null);
            }}
            aria-label="NIGHT GRID — enter the Shadow Realm"
            title="NIGHT GRID"
            className="w-16 h-16 rounded-full flex items-center justify-center border-2 border-violet-400/70 bg-zinc-950/90 shadow-[0_0_24px_rgba(167,139,250,0.35)] backdrop-blur-md hover:border-violet-300 hover:shadow-[0_0_32px_rgba(167,139,250,0.55)] hover:scale-105 active:scale-95 transition-all"
          >
            <span aria-hidden="true" className="text-3xl">🌑</span>
          </button>
        </div>
      )}

      {(user || cloudOffline) && (appState === 'hub_intro' || appState === 'hub_freeroam' || appState === 'to_bike' || appState === 'on_bike') && (
        <div style={chromeHiddenStyle} aria-hidden={radioSheetOpen || undefined}>
          <BikeFloatButton
            onToggleBike={toggleBike}
            riding={appState === 'on_bike' || appState === 'to_bike'}
          />
        </div>
      )}

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
        />
      )}

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
