'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Auth from '@/components/Auth';
import { supabase } from '@/lib/supabase';
import { LanguageProvider, useI18n } from '@/lib/i18n';
import { SATELLITES } from '@/lib/i18n/satellites';
import SatelliteMenu from '@/components/SatelliteMenu';
import { orbitTime, orbitPositionFor } from '@/lib/god-orbits';
import { GOD_TOWER_SPOTS, GOD_TOWER_POS, BABEL_POS, ARTEMIS_POS } from '@/lib/home-positions';
import SettingsGear from '@/components/SettingsGear';
import EntranceSequence from '@/components/EntranceSequence';
import { createEntranceMachine } from '@/lib/entrance-sequence';
import EarthConsole from '@/components/EarthConsole';
import { getUserPosition, FALLBACK_POSITION } from '@/lib/geo';
import { fx, unlockFx } from '@/lib/fx';

// The 3D hub scene (three.js + god panels) is code-split: it loads only on
// the client, after the page shell, so the heavy 3D stack never blocks the
// DOM/UI. Scene content is byte-identical to the former inline version.
const HomeScene = dynamic(() => import('@/components/HomeScene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#050505]" aria-hidden="true" />,
});


function NexusHub() {
  const router = useRouter();
  const { t } = useI18n();
  // Drop-target fallbacks: the 10 god-tower spots by god name, plus the
  // legacy reference points. (Nothing currently passes fallbackPos, but the
  // map stays honest for any caller that does.)
  const POS_MAP = { ...GOD_TOWER_POS, BABEL_POS, ARTEMIS_POS };

  const [appState, setAppState] = useState('hub_intro');
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [user, setUser] = useState(null);
  // Honest guest mode: true while no Supabase backend is configured (fresh
  // deploy before Merlin's new Supabase project exists). The hub stays fully
  // explorable; the Auth gate is bypassed ONLY in this state. The moment env
  // vars exist, original auth behavior returns unchanged.
  const [cloudOffline, setCloudOffline] = useState(false);
  const [cloudNoteDismissed, setCloudNoteDismissed] = useState(false);

  // Entrance cinematic: auto-plays once per device until explicitly skipped
  // (the skip preference is persisted in localStorage by
  // lib/entrance-sequence.js). It renders OVER the already-mounted orbit
  // scene, so the handoff is a fade — never a blank screen.
  const [showIntro, setShowIntro] = useState(false);
  // Merlin's entrance video as a SHADOWED distant backdrop behind the 3D
  // home scene: true until the <video> reports the file missing, in which
  // case the Canvas keeps its original opaque #050505 background — honest,
  // never a fake video.
  const [bgVideoOk, setBgVideoOk] = useState(true);
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
  
  const targetRouteRef = useRef('');
  const adWindowRef = useRef(null);
  
  const [activeSatTarget, setActiveSatTarget] = useState(GOD_TOWER_SPOTS[0].pos);
  

  const [flightAxis, setFlightAxis] = useState('horizontal'); 

  // --- Explorable Earth: the traveler stands still, the world moves. ---
  // Initialized inside HomeScene (it owns the three.js import now).
  const earthQuatRef = useRef(null);
  const [earthFocus, setEarthFocus] = useState(null);   // { lat, lon, label }
  const [pendingDest, setPendingDest] = useState(null); // destination being brought to us

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
  const arriveEarth = (dest) => { setEarthFocus(dest); setPendingDest(null); setAppState('earth_surface'); };
  const returnToOrbit = () => { setPendingDest(null); setEarthFocus(null); setAppState('returning_to_orbit'); };

  const controlsRef = useRef({
    moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0, keyW: 0, keyS: 0, keyA: 0, keyD: 0, zoom: 52, lastPinchDist: null
  });

  // Parked TRON bike rig (position read by the camera controller).
  const bikeRef = useRef(null);

  // Satellite index for the god menus — top-level hook (never conditional).
  const satIndex = useMemo(() => new Map(SATELLITES.map((s) => [s.key, s])), []);

  const [joyBase, setJoyBase] = useState({ x: 0, y: 0 });
  const [joyStick, setJoyStick] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  const lastLook = useRef({ x: 0, y: 0 });
  const isLooking = useRef(false);

  useEffect(() => {
    // No backend configured yet: enter honest guest mode instead of crashing.
    // lib/supabase.ts throws on first use when NEXT_PUBLIC_SUPABASE_* are
    // missing, so we check before touching the client at all.
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
        } else {
          localStorage.removeItem('nexus_user');
          setUser(null);
        }
      });

      return () => subscription.unsubscribe();
    } catch (err) {
      // Backend unreachable/misconfigured at runtime: degrade honestly,
      // never crash the hub into the error boundary.
      console.warn('Cloud auth unavailable, entering guest mode:', err);
      setCloudOffline(true);
      const cached = localStorage.getItem('nexus_user');
      if (cached) setUser(cached);
    }
  }, []);

  useEffect(() => {
    // FX system: unlock sound+haptics on the first user gesture (autoplay
    // policy keeps audio silent until then, and we never buzz uninvited),
    // and layer entrance-cinematic haptics via the 'nexus:entrance-phase'
    // event (sound for those phases stays in lib/entrance-audio.js).
    const unlock = () => unlockFx();
    const onPhase = (e) => { try { fx.entrancePhase(e.detail && e.detail.phase); } catch { /* noop */ } };
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
    // Device-adaptable menu: start collapsed on phones so the 3D hub is
    // visible first; the bottom-left menu button opens it on demand.
    // Runs only on mount (client side), so no SSR window access.
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

  const handleLogin = (callsign) => setUser(callsign);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Cloud offline: nothing to sign out of server-side.
    }
    localStorage.removeItem('nexus_user');
    setUser(null);
  };

  const launchPocketUniverse = (route, satKey, fallbackPos, directPos) => {
    // Sound + haptics for the launch. Internal routes get the drop fanfare;
    // external affiliate links (stake.com tower panels) get a neutral tap —
    // no fanfare on his inventory, ever.
    fx.routeLaunch(route);
    // The one menu-to-satellite function. Drop target resolution:
    // 1. directPos — explicit 3D position (tower ad panels);
    // 2. the satellite's live orbit-node position (god bands);
    // 3. the constellation tower position the satellite lists.
    let target = null;
    if (directPos) {
      target = directPos;
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
  };

  const toggleBike = () => {
    if (appState === 'on_bike' || appState === 'to_bike') {
      fx.bikeDismount();
      setAppState('hub_freeroam');
    } else if (appState === 'hub_intro' || appState === 'hub_freeroam') {
      fx.bikeMount();
      setAppState('to_bike');
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
      
      {/* Entrance cinematic: plays over the live orbit scene; tap anywhere,
          the Skip button, or Escape to skip (persisted). Replay anytime via
          the ↺ INTRO control. */}
      {(user || cloudOffline) && showIntro && (
        <EntranceSequence onDone={() => setShowIntro(false)} />
      )}
      {(user || cloudOffline) && !showIntro && (appState === 'hub_intro' || appState === 'hub_freeroam') && (
        <div className="absolute top-5 left-5 z-50 flex flex-col gap-2 ui-element pointer-events-auto">
          <button
            onClick={() => { fx.tap(); setShowIntro(true); }}
            aria-label="Replay intro"
            className="px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400 border border-zinc-800 rounded-full bg-zinc-950/80 backdrop-blur-md hover:text-white hover:border-zinc-500 transition-all"
          >
            ↺ INTRO
          </button>
          {/* Merlin's written product roadmap — the 8-node Renewal Plan timeline. */}
          <button
            onClick={() => { fx.tap(); router.push('/renewal-plan'); }}
            aria-label="Open the Renewal Plan timeline"
            className="px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-teal-300/80 border border-teal-500/30 rounded-full bg-zinc-950/80 backdrop-blur-md hover:text-teal-100 hover:border-teal-400/60 transition-all"
          >
            ◈ RENEWAL PLAN
          </button>
        </div>
      )}
      
      {(user || cloudOffline) && (appState === 'hub_intro' || appState === 'hub_freeroam') && (
        <>
          <div className="absolute bottom-[calc(8.75rem+env(safe-area-inset-bottom))] left-5 z-[80] flex flex-col items-start gap-4 ui-element pointer-events-auto">
            {isMenuExpanded ? (
              <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur-md w-[min(16rem,calc(100vw-2.5rem))] max-h-[70dvh] overflow-y-auto custom-scrollbar flex flex-col gap-5">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-widest text-white uppercase">Select your satellites</span>
                    <span className="text-[9px] font-mono text-cyan-400 tracking-wider uppercase">{t('ui.operator')}: {user || 'GUEST'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <SettingsGear />
                    <button onClick={() => { fx.menuClose(); setIsMenuExpanded(false); }} title={t('ui.collapse')} className="text-zinc-500 hover:text-white text-xs px-1">[_]</button>
                  </div>
                </div>
                
                {/* Satellite menu: select your satellites. Each satellite row opens
                    a dropdown of the programming inside it; tapping a program
                    launches it through the one menu-to-satellite function,
                    launchPocketUniverse. */}
                <SatelliteMenu
                  t={t}
                  satIndex={satIndex}
                  onLaunch={(route, key, pos) => launchPocketUniverse(route, key, pos)}
                />

                {/* DISCONNECT — signed-in users only; guests have nothing to disconnect */}
                {user && (
                <button 
                  onClick={handleSignOut}
                  className="w-full py-2.5 text-[10px] font-bold tracking-widest text-red-400 uppercase transition-all border border-red-500/30 rounded bg-red-950/20 hover:bg-red-900/40 hover:border-red-500/60 mt-1"
                >
                  {t('ui.disconnect')}
                </button>
                )}
              </div>
            ) : (
              <button 
                onClick={() => { fx.menuOpen(); setIsMenuExpanded(true); }}
                aria-label="Open menu"
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(0,242,255,0.4)] hover:scale-105 transition-all overflow-hidden border-2 border-cyan-500 relative bg-cyan-950/60"
              >
                <video src="/chess/assets/effects/gemini_generated_video_758D2655.mp4" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover scale-110" />
              </button>
            )}
          </div>

          <button 
            onClick={() => { fx.tap(); setFlightAxis(m => m === 'horizontal' ? 'vertical' : 'horizontal'); }}
            className="absolute top-5 right-5 z-50 px-6 py-4 text-[10px] sm:text-xs font-bold tracking-widest text-cyan-400 uppercase transition-all border border-cyan-500/50 rounded-xl bg-zinc-950/90 shadow-[0_0_20px_rgba(0,242,255,0.15)] backdrop-blur-md hover:bg-cyan-900/40 ui-element pointer-events-auto"
          >
            FLIGHT AXIS: <span className="text-white">{flightAxis}</span>
          </button>

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

      {/* Spawn to Bike — fixed bottom-right, CLEAR of the persistent radio
          bar (z-70, ~8rem tall incl. transport strip + safe-area). Flies the
          camera into the rider's seat on the parked TRON bike; tap again to
          dismount. */}
      {(user || cloudOffline) && (appState === 'hub_intro' || appState === 'hub_freeroam' || appState === 'to_bike' || appState === 'on_bike') && (
        <button
          onClick={toggleBike}
          className="absolute bottom-[calc(8.75rem+env(safe-area-inset-bottom))] right-5 z-[80] px-6 py-4 text-[10px] sm:text-xs font-bold tracking-widest text-teal-300 uppercase transition-all border border-teal-400/50 rounded-xl bg-zinc-950/90 shadow-[0_0_20px_rgba(45,212,191,0.15)] backdrop-blur-md hover:bg-teal-900/40 ui-element pointer-events-auto"
        >
          {(appState === 'on_bike' || appState === 'to_bike') ? 'LEAVE BIKE' : 'SPAWN TO BIKE'}
        </button>
      )}

      {(user || cloudOffline) && (appState === 'diving_to_earth' || appState === 'earth_surface' || appState === 'earth_travel') && (
        <EarthConsole
          focus={earthFocus}
          phase={appState}
          onTravel={travelToEarth}
          onReturn={returnToOrbit}
        />
      )}

      {(user || cloudOffline) && appState === 'hub_freeroam' && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="text-[10px] tracking-[0.25em] uppercase text-cyan-300/70 bg-black/40 px-4 py-2 rounded-full border border-cyan-500/20">
            {t('earth.tapHint')}
          </div>
        </div>
      )}

      {/* Merlin's entrance video — full normal brightness and clarity
          (Merlin 2026-09-30: video brightness universally normal and clear).
          A light veil keeps the live Earth, orbit rings, satellites, and
          parked TRON bike reading in front of it. Looping, muted,
          playsinline. Gated on the hub being visible so it never
          double-plays under the Auth overlay. */}
      {(user || cloudOffline) && bgVideoOk && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <video
            src="/media/entrance.mp4"
            autoPlay
            loop
            muted
            playsInline
            onError={() => setBgVideoOk(false)}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}

      <HomeScene
        bgVideoOk={bgVideoOk}
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
