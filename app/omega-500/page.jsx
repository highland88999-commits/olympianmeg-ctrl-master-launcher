// app/omega-500/page.jsx — Omega 500: nine cars, twenty tracks, 500 miles.
// Screens: track + car select -> loading -> race -> results.
// The 3D scene lives in components/omega-500/RaceScene.jsx; this page owns
// the menus, the HUD (normal document flow, above the canvas), the touch
// controls (normal flow, below the canvas), and the keyboard.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BackButton } from '@/components/ui';
import {
  listTracks,
  getTrack,
  lapsForTrack,
  RACE_DISTANCES,
  DEFAULT_DISTANCE_MILES,
} from '@/lib/omega-500/tracks';
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

const RaceScene = dynamic(() => import('@/components/omega-500/RaceScene'), {
  ssr: false,
});

const TRACKS = listTracks();
const CARS = raceCars();

function StatBox({ label, value }) {
  return (
    <div className="min-w-[86px] flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
      <div className="text-[10px] tracking-widest text-white/50">{label}</div>
      <div className="text-lg font-bold leading-tight text-white">{value}</div>
    </div>
  );
}

/** Circular boost ring gauge (SVG) — the boost meter as a ring, never a
 *  rectangular bar (orb law). value 0..100, fed by the ~5 Hz HUD; the
 *  number in the middle is the meter reading. Set showValue false when
 *  the ring wraps a labelled orb, so the number does not fight the label. */
function BoostRing({ value, size = 48, color = '#facc15', showValue = true, strokeWidth = 5, testId = 'boost-ring' }) {
  const r = (size - strokeWidth) / 2 - 1;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(100, value)) / 100;
  const centre = size / 2;
  return (
    <svg
      data-testid={testId}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Boost ${Math.round(value)} percent`}
      style={{ display: 'block' }}
    >
      <circle cx={centre} cy={centre} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={strokeWidth} />
      <circle
        cx={centre}
        cy={centre}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${centre} ${centre})`}
      />
      {showValue ? (
        <text x={centre} y={centre} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize={Math.round(size * 0.3)} fontWeight="bold">
          {Math.round(value)}
        </text>
      ) : null}
    </svg>
  );
}

function HoldButton({ label, onHold, active, className }) {
  return (
    <button
      type="button"
      className={`select-none rounded-xl font-bold ${
        active ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'
      } ${className || 'flex-1 px-3 py-4 text-lg'}`}
      style={{ touchAction: 'none' }}
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

export default function Omega500Page() {
  const [screen, setScreen] = useState('menu');
  const [trackId, setTrackId] = useState('olympus-superspeedway');
  const [carId, setCarId] = useState('wedge-supercar');
  const [distance, setDistance] = useState(DEFAULT_DISTANCE_MILES);
  const [loadCount, setLoadCount] = useState(0);
  const [race, setRace] = useState(null);
  const [raceKey, setRaceKey] = useState(0);
  const [results, setResults] = useState(null);
  const [hud, setHud] = useState(null);

  const keysRef = useRef({ up: false, down: false, left: false, right: false, boost: false });
  // Touch controls (Merlin, 2026-11-15): joystick steers (proportional),
  // GAS accelerates, releasing GAS is the brake — no separate brake button.
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
    const track = getTrack(trackId);
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
    setRace(null);
    setResults(null);
    setHud(null);
    resetInputs();
    setScreen('menu');
  }, [resetInputs]);

  const selectedTrack = getTrack(trackId);
  const selectedCar = CARS.find((c) => c.id === carId) || CARS[0];

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-10 pt-4">
      <div className="mb-3 flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-3xl font-black tracking-wide text-yellow-300">OMEGA 500</h1>
          <p className="text-sm text-white/60">Nine cars. Twenty tracks. Five hundred miles.</p>
        </div>
      </div>

      {screen === 'menu' && (
        <div>
          <h2 className="mb-2 mt-4 text-lg font-bold text-white">1. Pick a track</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {RACE_DISTANCES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDistance(d)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  distance === d ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'
                }`}
              >
                {d} miles
              </button>
            ))}
            <span className="self-center text-sm text-white/50">
              Laps scale so every race totals the distance you pick.
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TRACKS.map((t) => {
              const laps = lapsForTrack(t, distance);
              const selected = t.id === trackId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrackId(t.id)}
                  className={`rounded-xl border p-3 text-left ${
                    selected ? 'border-yellow-400 bg-yellow-400/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white">{t.name}</span>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/70">
                      {t.type}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {t.lengthMiles} mi · {t.turns} turns · {laps} laps
                  </div>
                  <div className="text-xs text-white/50">{t.blurb}</div>
                  <div className="text-xs text-white/40">{t.banking} · {t.surface}</div>
                </button>
              );
            })}
          </div>

          <h2 className="mb-2 mt-6 text-lg font-bold text-white">2. Pick a car</h2>
          <p className="mb-2 text-sm text-white/50">
            The real Earth 1 models — same cars, same tuning. The Lamborghini Aventador is still the fastest.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CARS.map((c) => {
              const selected = c.id === carId;
              const topMph = Math.round(c.tuning.maxSpeed * MS_TO_MPH);
              const boostMph = Math.round(c.tuning.maxSpeed * c.tuning.boostMult * MS_TO_MPH);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCarId(c.id)}
                  className={`rounded-xl border p-3 text-left ${
                    selected ? 'border-yellow-400 bg-yellow-400/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{c.emoji}</span>
                    <span className="font-bold text-white">{c.name}</span>
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    Top {topMph} mph · boost {boostMph} mph · accel {c.tuning.accel} · turn {c.tuning.turnRate}
                  </div>
                  <div className="text-xs text-white/50">{c.blurb}</div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={startRace}
            className="mt-6 w-full rounded-xl bg-yellow-400 py-4 text-xl font-black tracking-wide text-black"
          >
            START RACE — {selectedTrack ? selectedTrack.name : ''} · {selectedCar ? selectedCar.name : ''}
          </button>
          <p className="mt-2 text-center text-sm text-white/50">
            You start 9th on the grid. 8 AI drivers, same cars. First across the line after{' '}
            {selectedTrack ? lapsForTrack(selectedTrack, distance) : ''} laps wins.
          </p>
        </div>
      )}

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
            <div className="min-w-[86px] flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
              <div className="text-[10px] tracking-widest text-white/50">BOOST</div>
              <div className="mt-1 flex justify-center">
                <BoostRing value={hud ? hud.boost : 100} size={48} color="#facc15" />
              </div>
            </div>
          </div>

          {screen === 'race' && hud && hud.status === 'countdown' && (
            <div className="mb-2 rounded-xl bg-yellow-400/15 py-3 text-center text-2xl font-black text-yellow-300">
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
            className="w-full overflow-hidden rounded-xl border border-white/10 bg-black"
            style={{ height: 'min(62vh, 560px)' }}
          >
            {screen === 'race' && (
              <RaceScene
                key={raceKey}
                race={race}
                inputRef={inputRef}
                onHud={onHud}
                onFinish={onFinish}
              />
            )}
            {screen === 'results' && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="text-3xl font-black text-yellow-300">RACE COMPLETE</div>
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
                    {/* The boost ring wraps the BOOST button — the meter lives
                        on the orb itself, not in a bar. The button is unchanged. */}
                    <div className="relative flex h-[88px] w-[88px] items-center justify-center">
                      <span className="pointer-events-none absolute inset-0">
                        <BoostRing
                          value={hud ? hud.boost : 100}
                          size={88}
                          color="#facc15"
                          showValue={false}
                          testId="boost-ring-orb"
                        />
                      </span>
                      <HoldButton
                        label="BOOST"
                        active={touchState.boost}
                        onHold={(v) => setTouch('boost', v)}
                        className="w-20 px-3 py-6 text-base"
                      />
                    </div>
                    <HoldButton
                      label="▲ GAS"
                      active={touchState.gas}
                      onHold={(v) => setTouch('gas', v)}
                      className="w-28 px-3 py-10 text-xl"
                    />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={quitRace}
                className="mt-2 w-full rounded-xl bg-white/10 py-3 font-bold text-white"
              >
                QUIT RACE
              </button>
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
                  r.isPlayer ? 'bg-yellow-400/15 font-bold text-yellow-200' : 'bg-white/5 text-white'
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
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={startRace}
              className="flex-1 rounded-xl bg-yellow-400 py-3 font-black text-black"
            >
              RACE AGAIN
            </button>
            <button
              type="button"
              onClick={quitRace}
              className="flex-1 rounded-xl bg-white/10 py-3 font-bold text-white"
            >
              CHANGE TRACK / CAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
