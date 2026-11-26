// app/checker-tracks/page.jsx — Checker Tracks: 11 neon checker tracks.
// Screens: track + car select -> loading -> race -> results.
// Cloned from app/omega-500/page.jsx: same race sim, same car roster,
// same menu pattern. Differences:
//   - MENU: an island carousel — one floating semi-holographic island per
//     track over a full-page holographic-blue space scene, with the UI band
//     centred over it. Tap an island (or the prev/next orbs) to select it;
//     the selected island rises. Drag / swipe spins the carousel.
//   - DISTANCES: the Omega 500 values (5/25/100/250/500 miles, default
//     100) shown as KM (8/40/161/402/805); the race sim keeps miles.
//   - FREE WINDOW Nov 25, 2026 – Feb 25, 2027: no payments are taken, so
//     the page takes none — no paywall, no locking, all 11 tracks free.
//     The payment routes and server files stay in the tree, unwired, for
//     when subscriptions start.
//   - PREVIEW/TRAILER SLOT: a styled placeholder where the UON Visuals
//     reel goes once it is received and licensed — the reel video itself
//     is NOT shipped here.
//   - CIRCLE ORB CONTROLS LAW: every control under the game screen is a
//     plain circle orb (GAS, BOOST, QUIT, fullscreen, SELECT); the
//     fullscreen orb sits at the very top right of the game frame.
'use client';

import { Component, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BackButton } from '@/components/ui';
import {
  listCheckerTracks,
  getCheckerTrack,
  lapsForTrack,
  RACE_DISTANCES,
  DEFAULT_DISTANCE_MILES,
  DEMO_TRACK_ID,
} from '@/lib/checker-tracks/tracks';
import {
  raceCars,
  createRace,
  fmtTime,
  MS_TO_MPH,
  RACE_CAR_IDS,
} from '@/lib/omega-500/race';
import { ensureVehicleModel } from '@/lib/earth/vehicle-model';
import WalkJoystick from '@/components/world/WalkJoystick';
import { mergeRaceInputs, steerFromJoystick } from '@/lib/omega-500/input';

const CheckerScene = dynamic(() => import('@/components/checker-tracks/CheckerScene'), {
  ssr: false,
});

const IslandCarousel = dynamic(() => import('@/components/checker-tracks/IslandCarousel'), {
  ssr: false,
});

const TRACKS = listCheckerTracks();
const CARS = raceCars();

/**
 * Scene error boundary — a failed WebGL context (a device/browser without
 * WebGL) must never take the page down with it. The 3D scene is replaced
 * by its fallback (a static holographic-blue field) and the UI band —
 * track picker, KM orbs, SELECT — keeps working.
 */
class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Swallowed on purpose: the fallback below is the user-visible answer.
  }

  render() {
    if (this.state.failed) return this.props.fallback || null;
    return this.props.children;
  }
}

/** Static holographic-blue field used when the 3D scene cannot start. */
function SceneFallback() {
  return (
    <div
      data-testid="carousel-fallback"
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 40%, #0a2a5a 0%, #04122e 55%, #020617 100%)',
      }}
    />
  );
}

/** Miles to whole kilometres for the distance readout (1 mi = 1.60934 km). */
const MILES_TO_KM = 1.60934;
function milesToKm(miles) {
  return Math.round(miles * MILES_TO_KM);
}

/** Distances, shortest first, for the KM orb row. */
const KM_DISTANCES = [...RACE_DISTANCES].sort((a, b) => a - b);

function StatBox({ label, value }) {
  return (
    <div className="min-w-[86px] flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
      <div className="text-[10px] tracking-widest text-white/50">{label}</div>
      <div className="text-lg font-bold leading-tight text-white">{value}</div>
    </div>
  );
}

/** Plain circle orb hold-button (GAS / BOOST) — never a rectangle. */
function OrbButton({ label, onHold, active, className }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex select-none items-center justify-center rounded-full font-bold ${
        active ? 'bg-[#39ff14] text-black' : 'bg-white/10 text-white'
      } ${className || 'h-20 w-20 text-base'}`}
      style={{ touchAction: 'none', aspectRatio: '1 / 1' }}
      onPointerDown={(e) => {
        e.preventDefault();
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerLeave={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export default function CheckerTracksPage() {
  const [screen, setScreen] = useState('menu');
  const [trackId, setTrackId] = useState(DEMO_TRACK_ID);
  const [carId, setCarId] = useState('wedge-supercar');
  const [distance, setDistance] = useState(DEFAULT_DISTANCE_MILES);
  const [loadCount, setLoadCount] = useState(0);
  const [race, setRace] = useState(null);
  const [raceKey, setRaceKey] = useState(0);
  const [results, setResults] = useState(null);
  const [hud, setHud] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraFar, setCameraFar] = useState(false);
  const gameRef = useRef(null);

  const keysRef = useRef({ up: false, down: false, left: false, right: false, boost: false });
  // Touch controls: joystick steers (proportional), GAS accelerates,
  // releasing GAS is the brake — no separate brake button.
  const touchRef = useRef({ gas: false, steer: 0, boost: false });
  const inputRef = useRef({ throttle: 0, brake: 0, steer: 0, boost: false });
  const [touchState, setTouchState] = useState({ gas: false, boost: false });
  const [isTouch, setIsTouch] = useState(false);
  const isTouchRef = useRef(false);

  const mergeInputs = useCallback(() => {
    inputRef.current = mergeRaceInputs(keysRef.current, {
      ...touchRef.current,
      isTouch: isTouchRef.current,
    });
  }, []);

  const setTouch = useCallback(
    (key, value) => {
      touchRef.current[key] = value;
      setTouchState((prev) => ({ ...prev, [key]: value }));
      mergeInputs();
    },
    [mergeInputs],
  );

  // Joystick steer: no React state per move (the knob is DOM-managed),
  // or the page would re-render on every pointermove.
  const setTouchSteer = useCallback(
    (x) => {
      touchRef.current.steer = steerFromJoystick(x);
      mergeInputs();
    },
    [mergeInputs],
  );

  // A held control must never survive a screen change (the buttons
  // unmount at the finish, so their pointerup never fires).
  const resetInputs = useCallback(() => {
    keysRef.current = { up: false, down: false, left: false, right: false, boost: false };
    touchRef.current = { gas: false, steer: 0, boost: false };
    setTouchState({ gas: false, boost: false });
    mergeInputs();
  }, [mergeInputs]);

  // Touch devices get the joystick + gas instead of the buttons.
  // useEffect (not initial state) so the server render and the first
  // client render agree — no hydration mismatch.
  useEffect(() => {
    const coarse =
      (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    isTouchRef.current = coarse;
    setIsTouch(coarse);
    mergeInputs();
  }, [mergeInputs]);

  // Fullscreen state follows the browser (Escape exits fullscreen too).
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (gameRef.current) {
      void gameRef.current.requestFullscreen();
    }
  }, []);

  // Keyboard: W/S throttle+brake, A/D steer, Shift boost. Active on the race screen.
  useEffect(() => {
    if (screen !== 'race') return undefined;
    const down = (e) => {
      const k = keysRef.current;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') { k.up = true; e.preventDefault(); }
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') { k.down = true; e.preventDefault(); }
      else if (e.code === 'KeyA' || e.code === 'ArrowLeft') { k.left = true; e.preventDefault(); }
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') { k.right = true; e.preventDefault(); }
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { k.boost = true; }
      else return;
      mergeInputs();
    };
    const up = (e) => {
      const k = keysRef.current;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') k.up = false;
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') k.down = false;
      else if (e.code === 'KeyA' || e.code === 'ArrowLeft') k.left = false;
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') k.right = false;
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') k.boost = false;
      else return;
      mergeInputs();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [screen, mergeInputs]);

  const startRace = useCallback(async () => {
    const track = getCheckerTrack(trackId);
    if (!track) return;
    setLoadCount(0);
    setResults(null);
    setHud(null);
    resetInputs();
    setScreen('loading');
    let done = 0;
    await Promise.all(
      RACE_CAR_IDS.map((id) =>
        ensureVehicleModel(id)
          .catch(() => null)
          .then(() => {
            done += 1;
            setLoadCount(done);
          }),
      ),
    );
    const nextRace = createRace(track, distance, carId);
    setRace(nextRace);
    setRaceKey((k) => k + 1);
    setScreen('race');
  }, [trackId, distance, carId, resetInputs]);

  const onHud = useCallback((h) => setHud(h), []);
  const onFinish = useCallback((r) => {
    setResults(r);
    resetInputs();
    setScreen('results');
  }, [resetInputs]);

  const quitRace = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    setRace(null);
    setResults(null);
    setHud(null);
    resetInputs();
    setScreen('menu');
  }, [resetInputs]);

  const selectedTrack = getCheckerTrack(trackId);
  const selectedCar = CARS.find((c) => c.id === carId) || CARS[0];
  const selectedIndex = Math.max(0, TRACKS.findIndex((t) => t.id === trackId));
  const selectedLaps = selectedTrack ? lapsForTrack(selectedTrack, distance) : 0;
  const selectTrack = useCallback((id) => {
    if (getCheckerTrack(id)) setTrackId(id);
  }, []);
  const selectPrevTrack = useCallback(() => {
    setTrackId(TRACKS[(selectedIndex + TRACKS.length - 1) % TRACKS.length].id);
  }, [selectedIndex]);
  const selectNextTrack = useCallback(() => {
    setTrackId(TRACKS[(selectedIndex + 1) % TRACKS.length].id);
  }, [selectedIndex]);

  // MENU — Merlin's diagram: a full-page 3D background (island carousel
  // over holographic-blue space, stars, planets) with the UI band centred
  // over it — scene visible above and below the band. The band is a plain
  // vertical flex stack (fixed heights, no absolute controls over content),
  // so nothing can overlap at 390px or 320px; only the 3D canvas sits
  // behind it, and the content column is pointer-events-none except for
  // the controls themselves, so drags on the scene still reach the canvas.
  if (screen === 'menu') {
    const selectedTopMph = selectedCar ? Math.round(selectedCar.tuning.maxSpeed * MS_TO_MPH) : 0;
    return (
      <div data-testid="checker-page" className="relative min-h-[100dvh] overflow-hidden bg-[#04122e]">
        {/* Full-page 3D background: the island carousel. */}
        <SceneErrorBoundary fallback={<SceneFallback />}>
          <div className="absolute inset-0">
            <IslandCarousel
              tracks={TRACKS}
              selectedId={trackId}
              onSelect={selectTrack}
              cameraFar={cameraFar}
            />
          </div>
        </SceneErrorBoundary>

        <div className="pointer-events-none relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-4 pb-4">
          {/* Camera control at the very TOP of the phone screen. */}
          <div className="pointer-events-auto flex items-center gap-3 pt-4">
            <BackButton />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black tracking-wide text-[#39ff14]">CHECKER TRACKS</h1>
              <p className="truncate text-xs text-white/60">Eleven tracks. Checker floors. Neon trails.</p>
            </div>
            <button
              type="button"
              aria-label={cameraFar ? 'Camera: wide view — tap for close view' : 'Camera: close view — tap for wide view'}
              title={cameraFar ? 'Camera: wide' : 'Camera: close'}
              onClick={() => setCameraFar((v) => !v)}
              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30"
              style={{ aspectRatio: '1 / 1' }}
            >
              <span className="text-base leading-none">📷</span>
              <span className="text-[8px] font-bold tracking-widest">{cameraFar ? 'WIDE' : 'CLOSE'}</span>
            </button>
          </div>

          {/* Scene visible above the band. */}
          <div className="min-h-6 flex-1" />

          {/* ---- UI band, centred over the world scene ---- */}
          <div className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl bg-black/55 px-3 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-sm">
            <p className="text-center text-xs font-bold text-[#39ff14]">
              Free until February 25, 2027 — all 11 tracks free during the free window.
            </p>

            {/* Track: prev / selected-marker / next orbs, centred, inset. */}
            <div className="mt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label="Previous track"
                onClick={selectPrevTrack}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white ring-1 ring-white/20"
                style={{ aspectRatio: '1 / 1' }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={`Selected track: ${selectedTrack ? selectedTrack.name : ''} — tap to centre it`}
                onClick={() => selectTrack(trackId)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#39ff14] text-lg font-bold text-black"
                style={{ aspectRatio: '1 / 1' }}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Next track"
                onClick={selectNextTrack}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white ring-1 ring-white/20"
                style={{ aspectRatio: '1 / 1' }}
              >
                ›
              </button>
            </div>
            <div className="mt-1 text-center">
              <div className="text-lg font-black leading-tight text-white">
                {selectedTrack ? selectedTrack.name : ''}
              </div>
              <div className="text-xs text-white/60">
                Track {selectedIndex + 1} of {TRACKS.length}
                {selectedTrack ? ` · ${selectedTrack.lengthMiles} mi loop · ${selectedTrack.turns} turns` : ''}
              </div>
              <div className="text-xs text-white/50">{selectedTrack ? selectedTrack.blurb : ''}</div>
            </div>

            {/* Distance: KM orbs in a centred horizontal row, inset. */}
            <div className="mt-3 flex items-center justify-center gap-2">
              {KM_DISTANCES.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-label={`${milesToKm(d)} kilometres`}
                  onClick={() => setDistance(d)}
                  className={`flex h-11 w-11 flex-col items-center justify-center rounded-full font-bold ring-1 ${
                    distance === d
                      ? 'bg-[#39ff14] text-black ring-[#39ff14]'
                      : 'bg-white/10 text-white ring-white/20'
                  }`}
                  style={{ aspectRatio: '1 / 1' }}
                >
                  <span className="text-sm leading-none">{milesToKm(d)}</span>
                  <span className="text-[8px] leading-none tracking-widest">KM</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-center text-xs text-white/60">
              {milesToKm(distance)} KM · {selectedLaps} laps — laps scale so every race totals the distance you pick.
            </p>

            {/* Car picker: compact horizontal row of circular car orbs. */}
            <div className="mt-3 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
              {CARS.map((c) => {
                const selected = c.id === carId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.name}
                    onClick={() => setCarId(c.id)}
                    className="flex w-16 shrink-0 flex-col items-center gap-0.5"
                  >
                    <span
                      className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ring-2 ${
                        selected ? 'bg-[#39ff14]/20 ring-[#39ff14]' : 'bg-white/10 ring-white/20'
                      }`}
                      style={{ aspectRatio: '1 / 1' }}
                    >
                      {c.emoji}
                    </span>
                    <span className={`text-center text-[9px] font-bold leading-tight ${selected ? 'text-[#39ff14]' : 'text-white/70'}`}>
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs text-white/60">
              {selectedCar ? `${selectedCar.name} · top ${selectedTopMph} mph` : ''}
            </p>

            {/* SELECT: plain circle orb, centred — starts the race. */}
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                aria-label={`Select ${selectedTrack ? selectedTrack.name : ''} and start the race`}
                onClick={startRace}
                className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-[#39ff14] font-black text-black shadow-[0_0_24px_rgba(57,255,20,0.45)]"
                style={{ aspectRatio: '1 / 1' }}
              >
                <span className="text-lg leading-none tracking-wide">SELECT</span>
                <span className="mt-1 text-[9px] font-bold leading-none tracking-widest">START RACE</span>
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-white/50">
              You start 9th on the grid. 8 AI drivers, same cars. First across the line after{' '}
              {selectedLaps} laps wins.
            </p>
          </div>

          {/* Scene visible below the band, then the trailer slot at the bottom. */}
          <div className="min-h-6 flex-1" />

          {/* Preview / trailer slot — placeholder only. The UON Visuals reel
              is not received and not licensed, so no video ships here. */}
          <div
            className="pointer-events-auto relative mx-auto w-full max-w-md overflow-hidden rounded-xl border border-white/10"
            style={{
              backgroundImage: 'repeating-conic-gradient(#0a0a0a 0% 25%, #f2f2f2 0% 50%)',
              backgroundSize: '48px 48px',
              minHeight: '72px',
            }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/70 p-2 text-center">
              <div className="text-sm font-black tracking-widest text-white">TRAILER — COMING SOON</div>
              <p className="text-xs text-white/70">
                The checkered tunnel reel by Mike Vos Kakis (UON Visuals) will play here
                once it is received and licensed.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="checker-page" className="mx-auto w-full max-w-5xl px-3 pb-10 pt-4">
      <div className="mb-3 flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-3xl font-black tracking-wide text-[#39ff14]">CHECKER TRACKS</h1>
          <p className="text-sm text-white/60">Eleven tracks. Checker floors. Neon trails. Fast straights, slow twists.</p>
        </div>
      </div>

      {screen === 'loading' && (
        <div className="py-16 text-center">
          <div className="text-xl font-bold text-white">Loading cars… {loadCount}/9</div>
          <p className="mt-2 text-sm text-white/50">The real Earth 1 models, straight off the lot.</p>
        </div>
      )}

      {(screen === 'race' || screen === 'results') && race && (
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <StatBox label="POSITION" value={hud ? `P${hud.position}/9` : 'P9/9'} />
            <StatBox
              label="LAP"
              value={hud ? `${hud.lap}/${hud.totalLaps}` : `1/${race.totalLaps}`}
            />
            <StatBox label="RACE TIME" value={hud ? fmtTime(hud.raceMs) : '0:00.000'} />
            <StatBox label="LAST LAP" value={hud ? fmtTime(hud.lastLapMs) : '--:--.---'} />
            <StatBox label="BEST LAP" value={hud ? fmtTime(hud.bestLapMs) : '--:--.---'} />
            <StatBox label="SPEED" value={hud ? `${hud.speedMph} mph` : '0 mph'} />
            <div className="min-w-[120px] flex-1 rounded-lg bg-white/5 px-3 py-2">
              <div className="text-center text-[10px] tracking-widest text-white/50">BOOST</div>
              <div className="mt-2 h-3 overflow-hidden rounded bg-white/10">
                <div
                  className="h-full bg-[#39ff14]"
                  style={{ width: `${hud ? hud.boost : 100}%` }}
                />
              </div>
            </div>
          </div>

          {screen === 'race' && hud && hud.status === 'countdown' && (
            <div className="mb-2 rounded-xl bg-[#39ff14]/15 py-3 text-center text-2xl font-black text-[#39ff14]">
              {hud.countdownMs > 2000 ? '3' : hud.countdownMs > 1000 ? '2' : hud.countdownMs > 0 ? '1' : 'GO!'}
            </div>
          )}
          {screen === 'race' && (
            <p className="mb-2 text-center text-xs text-white/50">
              {isTouch
                ? 'Joystick steers · hold GAS to go · let go of GAS to brake · hold BOOST for boost.'
                : 'W/↑ throttle · S/↓ brake · A/D steer · Shift boost.'}
            </p>
          )}

          <div
            ref={gameRef}
            className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black"
            style={{ height: 'min(62vh, 560px)' }}
          >
            {/* Fullscreen orb — very top right of the game frame. */}
            <button
              type="button"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={toggleFullscreen}
              className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-lg font-bold text-white ring-1 ring-white/30"
              style={{ aspectRatio: '1 / 1' }}
            >
              {isFullscreen ? '⤢' : '⛶'}
            </button>
            {screen === 'race' && (
              <SceneErrorBoundary
                fallback={
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                    <div className="text-xl font-black text-white">3D unavailable on this device</div>
                    <p className="text-sm text-white/60">The race needs WebGL — try a browser with 3D turned on.</p>
                  </div>
                }
              >
                <CheckerScene
                  key={raceKey}
                  race={race}
                  inputRef={inputRef}
                  onHud={onHud}
                  onFinish={onFinish}
                />
              </SceneErrorBoundary>
            )}
            {screen === 'results' && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="text-3xl font-black text-[#39ff14]">RACE COMPLETE</div>
                <div className="text-white/70">{race.track.name} · {race.distanceMiles} miles</div>
              </div>
            )}
          </div>

          {screen === 'race' && (
            <div className="mt-2">
              {isTouch && (
                <div className="flex items-end justify-between gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <WalkJoystick size={128} onMove={(x) => setTouchSteer(x)} />
                    <span className="text-xs font-bold tracking-widest text-white/60">STEER</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <OrbButton
                      label="BOOST"
                      active={touchState.boost}
                      onHold={(v) => setTouch('boost', v)}
                      className="h-20 w-20 text-base"
                    />
                    <OrbButton
                      label="▲ GAS"
                      active={touchState.gas}
                      onHold={(v) => setTouch('gas', v)}
                      className="h-28 w-28 text-xl"
                    />
                  </div>
                </div>
              )}
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  aria-label="Quit race"
                  onClick={quitRace}
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/20"
                  style={{ aspectRatio: '1 / 1' }}
                >
                  ✕
                  <span className="text-[9px] tracking-widest">QUIT</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {screen === 'results' && results && (
        <div className="mt-4">
          <h2 className="mb-2 text-lg font-bold text-white">Results</h2>
          <div className="overflow-hidden rounded-xl border border-white/10">
            {results.map((r) => (
              <div
                key={r.carId}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                  r.isPlayer ? 'bg-[#39ff14]/15 font-bold text-[#c8ffb8]' : 'bg-white/5 text-white'
                }`}
              >
                <span className="w-10">P{r.position}</span>
                <span className="flex-1">{r.name}{r.isPlayer ? ' (YOU)' : ''}</span>
                <span className="text-white/70">Best {fmtTime(r.bestLapMs)}</span>
                <span className="w-24 text-right text-white/70">
                  {r.finished ? fmtTime(r.finishMs) : r.gap}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col items-center gap-2">
            {/* RACE AGAIN is a start button, so it is a plain circle orb. */}
            <button
              type="button"
              aria-label="Race again"
              onClick={startRace}
              className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-[#39ff14] font-black text-black"
              style={{ aspectRatio: '1 / 1' }}
            >
              <span className="text-base leading-none tracking-wide">RACE</span>
              <span className="text-base leading-none tracking-wide">AGAIN</span>
            </button>
            <button
              type="button"
              aria-label="Change track or car"
              onClick={quitRace}
              className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white/10 font-black text-white ring-1 ring-white/20"
              style={{ aspectRatio: '1 / 1' }}
            >
              <span className="text-base leading-none tracking-wide">CHANGE</span>
              <span className="text-base leading-none tracking-wide">TRACK</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
