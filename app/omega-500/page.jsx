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

function HoldButton({ label, onHold, active, className }) {
  return (
    <button
      type="button"
      className={`flex-1 select-none rounded-xl px-3 py-4 text-lg font-bold ${
        active ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'
      } ${className || ''}`}
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
  const touchRef = useRef({ up: false, down: false, left: false, right: false, boost: false });
  const inputRef = useRef({ throttle: 0, brake: 0, steer: 0, boost: false });
  const [touchState, setTouchState] = useState({ left: false, right: false, up: false, down: false, boost: false });

  const mergeInputs = useCallback(() => {
    const k = keysRef.current;
    const t = touchRef.current;
    inputRef.current = {
      throttle: k.up || t.up ? 1 : 0,
      brake: k.down || t.down ? 1 : 0,
      steer: (k.left || t.left ? 1 : 0) + (k.right || t.right ? -1 : 0),
      boost: k.boost || t.boost,
    };
  }, []);

  const setTouch = useCallback(
    (key, value) => {
      touchRef.current[key] = value;
      setTouchState((prev) => ({ ...prev, [key]: value }));
      mergeInputs();
    },
    [mergeInputs],
  );

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
  }, [trackId, distance, carId]);

  const onHud = useCallback((h) => setHud(h), []);
  const onFinish = useCallback((r) => {
    setResults(r);
    setScreen('results');
  }, []);

  const quitRace = useCallback(() => {
    setRace(null);
    setResults(null);
    setHud(null);
    setScreen('menu');
  }, []);

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
            <div className="min-w-[120px] flex-1 rounded-lg bg-white/5 px-3 py-2">
              <div className="text-center text-[10px] tracking-widest text-white/50">BOOST</div>
              <div className="mt-2 h-3 overflow-hidden rounded bg-white/10">
                <div
                  className="h-full bg-yellow-400"
                  style={{ width: `${hud ? hud.boost : 100}%` }}
                />
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
              W/↑ throttle · S/↓ brake · A/D steer · Shift boost — or use the buttons below.
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
              <div className="flex gap-2">
                <HoldButton label="◀ STEER" active={touchState.left} onHold={(v) => setTouch('left', v)} />
                <HoldButton label="▲ THROTTLE" active={touchState.up} onHold={(v) => setTouch('up', v)} />
                <HoldButton label="▼ BRAKE" active={touchState.down} onHold={(v) => setTouch('down', v)} />
                <HoldButton label="STEER ▶" active={touchState.right} onHold={(v) => setTouch('right', v)} />
                <HoldButton label="BOOST" active={touchState.boost} onHold={(v) => setTouch('boost', v)} />
              </div>
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
