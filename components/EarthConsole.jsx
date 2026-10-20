'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { searchPlaces, formatCoords } from '@/lib/geo';
import { summonBike, dismissBike, toggleMount } from '@/components/EarthBike';
import { beginReanimate, isAtStreetScale, parachuteState, bikeState } from '@/lib/earth/parachute';
import { roamState } from '@/lib/earth/roam';
import { getEmbodimentForSurface } from '@/lib/gta/walker-embodiment';
import CharacterPicker from '@/components/characters/CharacterPicker';

const QUICK = [
  { label: 'Redwater, Alberta', lat: 53.9486, lon: -113.1067 },
  { label: 'Prince George, BC', lat: 53.9171, lon: -122.7497 },
  { label: 'Edmonton, Alberta', lat: 53.5462, lon: -113.4912 },
  { label: 'Great Pacific Garbage Patch', lat: 38.0, lon: -145.0 },
  { label: 'Mount Olympus, Greece', lat: 40.082, lon: 22.358 },
];

const MIN_KEY = 'earth-console-minimized';

export default function EarthConsole({ focus, phase, onTravel, onReturn, onStreet, onAscend, onSpawnPick, spawns, selectedTile, onDropToTile, controlsRef }) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // Bike UI state is POLLED from the shared bikeState singleton: the
  // B / E keys mutate it without any React event, so a local useState
  // set only by the button would desync (and did — Merlin, 2026-10-20:
  // bike controls never appeared). Polling keeps every surface honest.
  const [bikeUi, setBikeUi] = useState({ out: false, mounted: false });
  useEffect(() => {
    const id = setInterval(() => {
      setBikeUi((prev) => {
        const next = { out: !!bikeState.summoned, mounted: !!bikeState.mounted };
        return prev.out === next.out && prev.mounted === next.mounted ? prev : next;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);
  const [minimized, setMinimized] = useState(() => {
    try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; }
  });

  const setMin = (v) => {
    setMinimized(v);
    try { localStorage.setItem(MIN_KEY, v ? '1' : '0'); } catch {}
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!input.trim() || searching) return;
    setSearching(true);
    try {
      setResults(await searchPlaces(input.trim()));
    } catch {
      setResults([]);
    }
    setSearching(false);
  };

  const busy = phase === 'diving_to_earth' || phase === 'earth_travel' || phase === 'diving_to_street';
  const atStreet = phase === 'earth_roam';
  const canWalk = phase === 'earth_surface' || atStreet;

  // If a dive/travel starts while minimized, pop the console back open so the
  // traveling indicator is visible instead of failing silently.
  useEffect(() => {
    if (busy) setMin(false);
  }, [busy]);

  // Minimized: a floating globe icon docked on the right edge. Tap to open
  // the console in the middle of the screen. The bike controls overlay
  // renders in BOTH branches — riding with the menu closed must still
  // show the stick and thrust buttons.
  if (minimized) {
    return (
      <>
        <button
          onClick={() => setMin(false)}
          aria-label="Open Earth console"
          title={t('earth.consoleTitle')}
          className="absolute right-4 top-[32%] z-[80] w-14 h-14 rounded-full bg-zinc-950/90 border border-cyan-500/50 shadow-[0_0_25px_rgba(0,242,255,0.25)] backdrop-blur-md flex items-center justify-center text-2xl hover:scale-105 active:scale-95 transition-all ui-element pointer-events-auto"
        >
          <span aria-hidden="true">🌍</span>
        </button>
        {atStreet && bikeUi.out && (
          <BikeControls mounted={bikeUi.mounted} controlsRef={controlsRef} />
        )}
      </>
    );
  }

  return (
    <>
    {/* Earth console — opens centered; the minimize control collapses it to a
        floating globe icon on the right edge. Kept clear of the persistent
        radio bar (z-80) so its destination list is never buried. */}
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[min(92vw,20rem)] ui-element pointer-events-auto">
      <div className="bg-zinc-950/90 border border-cyan-500/30 rounded-xl p-4 shadow-[0_0_30px_rgba(0,242,255,0.12)] backdrop-blur-md flex flex-col gap-3 max-h-[70dvh] overflow-y-auto custom-scrollbar">
        <div className="border-b border-zinc-800 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-black tracking-[0.25em] uppercase text-cyan-300">
              {t('earth.consoleTitle')}
            </div>
            <button
              onClick={() => setMin(true)}
              aria-label="Minimize Earth console"
              title="Minimize"
              className="w-7 h-7 shrink-0 rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-cyan-500/60 flex items-center justify-center text-sm leading-none transition-all"
            >
              <span aria-hidden="true">—</span>
            </button>
          </div>
          {focus && (
            <div className="text-[10px] text-zinc-400 mt-1 truncate">
              ◉ {focus.label} · {formatCoords(focus.lat, focus.lon)}
            </div>
          )}
          {busy && (
            <div className="text-[10px] text-cyan-400 mt-1 animate-pulse">
              {phase === 'earth_travel' ? t('earth.traveling')
                : phase === 'diving_to_street' ? 'Shrinking into tile world…'
                : t('earth.locating')}
            </div>
          )}
          {atStreet && (
            <div className="text-[10px] text-cyan-300 mt-1">
              {bikeUi.mounted
                ? 'On the bike — left stick steers & thrusts · BOOST / ▲ / ▼ buttons on the right.'
                : 'On foot — left thumb to walk, drag the right side to look around.'}
            </div>
          )}
          {/* Parachute / climb / elevator hints */}
          <div className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
            Double-click any tile to parachute down · Double-click ladders to climb · Double-click monuments for the elevator
          </div>
        </div>

        <form onSubmit={submit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('earth.searchPlaceholder')}
            disabled={busy}
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase bg-cyan-700 hover:bg-cyan-600 rounded transition-colors disabled:opacity-50"
          >
            {searching ? '…' : '›'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar">
            {results.map((r, i) => (
              <button
                key={i}
                disabled={busy}
                onClick={() => { onTravel(r); setResults([]); setInput(''); }}
                className="text-left text-[11px] px-2 py-1.5 rounded bg-zinc-900/60 hover:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/40 transition-all truncate disabled:opacity-50"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <div className="text-[9px] font-bold tracking-[0.25em] uppercase text-zinc-500">
            Quick locations
          </div>
          {QUICK.map((q) => (
            <button
              key={q.label}
              disabled={busy}
              onClick={() => onTravel(q)}
              className="text-left text-[11px] px-2 py-1.5 rounded bg-zinc-900/60 hover:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/40 transition-all truncate disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span aria-hidden="true" className="text-cyan-500 mr-1">→</span>{q.label}
            </button>
          ))}
        </div>

        {/* Street level (Day 2): descend to the ground and walk,
            embodied as your character. Spawn picks travel first,
            then land you on foot at the landmark. */}
        {canWalk && !atStreet && (
          <button
            onClick={onStreet}
            disabled={busy || !focus}
            className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-cyan-200 border border-cyan-600/60 bg-cyan-950/50 rounded hover:border-cyan-400 hover:text-white transition-all disabled:opacity-50"
          >
            ⌄ Street level — walk here
          </button>
        )}
        {atStreet && (
          <>
            <button
              onClick={onAscend}
              className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all"
            >
              ↑ Back to overlook
            </button>
            {/* Summonable TRON bike (B key) */}
            <button
              onClick={() => {
                if (bikeUi.out) dismissBike();
                else summonBike();
              }}
              className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-teal-200 border border-teal-600/60 bg-teal-950/50 rounded hover:border-teal-400 hover:text-white transition-all"
            >
              {bikeUi.out ? '✕ Dismiss bike' : '🏍 Summon bike'} <span className="text-zinc-500 normal-case tracking-normal">(B · E to ride)</span>
            </button>
            {/* Size: Normal View vs Quantum Realm */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => beginReanimate()}
                className="py-2 text-[10px] font-bold tracking-[0.15em] uppercase text-amber-200 border border-amber-600/60 bg-amber-950/50 rounded hover:border-amber-400 hover:text-white transition-all"
              >
                ✦ Normal View
              </button>
              {selectedTile && onDropToTile && (
                <button
                  onClick={() => onDropToTile(selectedTile)}
                  className="py-2 text-[10px] font-bold tracking-[0.15em] uppercase text-cyan-200 border border-cyan-600/60 bg-cyan-950/50 rounded hover:border-cyan-400 hover:text-white transition-all animate-pulse"
                >
                  🔬 Quantum Realm
                </button>
              )}
            </div>
            {/* Character selection — in the menu, not floating */}
            <div className="mt-1">
              <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-1">Character</div>
              <CharacterPicker
                surface="earth"
                accent="#00f2ff"
                onPick={(id) => getEmbodimentForSurface('earth')?.setCharacter(id)}
              />
            </div>
          </>
        )}
        {canWalk && spawns && spawns.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-[9px] font-bold tracking-[0.25em] uppercase text-zinc-500">
              Walk at a landmark
            </div>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto custom-scrollbar">
              {spawns.map((s) => (
                <button
                  key={s.id}
                  disabled={busy}
                  onClick={() => onSpawnPick({ lat: s.lat, lon: s.lon, label: s.name })}
                  className="text-left text-[12px] px-2 py-1.5 rounded bg-zinc-900/60 hover:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span aria-hidden="true" className="text-cyan-500 mr-1">→</span>
                  {s.name} <span className="text-zinc-500">· {formatCoords(s.lat, s.lon)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onReturn}
          disabled={busy}
          className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all disabled:opacity-50"
        >
          {t('earth.returnToOrbit')}
        </button>
      </div>
    </div>
    {atStreet && bikeUi.out && (
      <BikeControls mounted={bikeUi.mounted} controlsRef={controlsRef} />
    )}
    </>
  );
}

// BikeControls — the bike's VISIBLE controls (Merlin, 2026-10-20: "The
// thrust controls for the bike and steering joystick are not seen").
// Before this, Earth riding relied on the invisible touch-anywhere
// joystick and keyboard keys that don't exist on a phone. Now, while
// the bike is out, a persistent glass control cluster is on screen:
//   - left: a steering + thrust stick (push up = thrust, left/right
//     = steer) writing the same moveX/moveY channels everything uses
//   - right: hold-to-press BOOST, RISE ▲ and SINK ▼ buttons writing
//     bikeBoost / bikeUp / bikeDown into the shared controls object
//     (EarthBike reads them alongside the keyboard)
//   - a RIDE / DISMOUNT button so touch users can get on and off
// Premium glass styling, big targets — a 7-year-old can ride it.
function BikeControls({ mounted, controlsRef }) {
  const padRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState({ boost: false, up: false, down: false });

  const writeStick = (dx, dy) => {
    if (!controlsRef?.current) return;
    const max = 38;
    const len = Math.hypot(dx, dy);
    const cl = len > max ? max / len : 1;
    const x = dx * cl;
    const y = dy * cl;
    setKnob({ x, y });
    controlsRef.current.moveX = x / max;
    controlsRef.current.moveY = y / max;
  };
  const releaseStick = () => {
    setKnob({ x: 0, y: 0 });
    if (controlsRef?.current) {
      controlsRef.current.moveX = 0;
      controlsRef.current.moveY = 0;
    }
  };
  const padPoint = (e) => {
    const r = padRef.current.getBoundingClientRect();
    return { dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
  };
  const setFlag = (name, on) => {
    setHeld((h) => ({ ...h, [name]: on }));
    if (controlsRef?.current) {
      if (name === 'boost') controlsRef.current.bikeBoost = on;
      if (name === 'up') controlsRef.current.bikeUp = on;
      if (name === 'down') controlsRef.current.bikeDown = on;
    }
  };
  const holdProps = (name) => ({
    onPointerDown: (e) => { e.preventDefault(); setFlag(name, true); },
    onPointerUp: () => setFlag(name, false),
    onPointerLeave: () => setFlag(name, false),
    onPointerCancel: () => setFlag(name, false),
    onContextMenu: (e) => e.preventDefault(),
  });
  const btnBase = 'ui-element pointer-events-auto select-none touch-none flex items-center justify-center rounded-full border backdrop-blur-md font-black transition-all active:scale-95';

  return (
    <>
      {/* Steering + thrust stick */}
      <div
        className="fixed z-[70] ui-element"
        style={{ left: 'calc(env(safe-area-inset-left, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
      >
        <div
          ref={padRef}
          role="application"
          aria-label="Bike steering and thrust joystick"
          className="ui-element pointer-events-auto relative w-28 h-28 rounded-full border-2 border-teal-400/50 bg-zinc-950/60 shadow-[0_0_30px_rgba(0,255,204,0.25)] backdrop-blur-md touch-none select-none"
          onPointerDown={(e) => { e.preventDefault(); padRef.current.setPointerCapture(e.pointerId); const p = padPoint(e); writeStick(p.dx, p.dy); }}
          onPointerMove={(e) => { if (e.buttons > 0) { const p = padPoint(e); writeStick(p.dx, p.dy); } }}
          onPointerUp={releaseStick}
          onPointerCancel={releaseStick}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="absolute inset-0 flex items-center justify-center text-teal-300/50 text-[9px] font-black tracking-[0.2em] pointer-events-none">THRUST</div>
          <div
            className="absolute left-1/2 top-1/2 w-12 h-12 -ml-6 -mt-6 rounded-full bg-teal-400/85 shadow-[0_0_18px_rgba(0,255,204,0.7)] pointer-events-none"
            style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
          />
        </div>
      </div>

      {/* Boost / rise / sink + mount toggle */}
      <div
        className="fixed z-[70] ui-element flex flex-col items-end gap-2.5"
        style={{ right: 'calc(env(safe-area-inset-right, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
      >
        <button
          type="button"
          onClick={() => toggleMount()}
          className={`${btnBase} px-4 h-10 text-[10px] tracking-[0.18em] uppercase text-zinc-100 border-zinc-500/60 bg-zinc-900/70`}
        >
          {mounted ? '⏏ Dismount' : '🏍 Ride bike'}
        </button>
        {mounted && (
          <>
            <button
              type="button"
              aria-label="Rise"
              {...holdProps('up')}
              className={`${btnBase} w-14 h-14 text-xl text-cyan-100 border-cyan-400/60 ${held.up ? 'bg-cyan-500/60' : 'bg-cyan-950/60'} shadow-[0_0_20px_rgba(0,242,255,0.3)]`}
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="Boost"
              {...holdProps('boost')}
              className={`${btnBase} w-[4.5rem] h-[4.5rem] text-[10px] tracking-[0.15em] text-amber-100 border-amber-400/70 ${held.boost ? 'bg-amber-500/60' : 'bg-amber-950/60'} shadow-[0_0_24px_rgba(255,180,0,0.35)]`}
            >
              BOOST
            </button>
            <button
              type="button"
              aria-label="Sink"
              {...holdProps('down')}
              className={`${btnBase} w-14 h-14 text-xl text-cyan-100 border-cyan-400/60 ${held.down ? 'bg-cyan-500/60' : 'bg-cyan-950/60'} shadow-[0_0_20px_rgba(0,242,255,0.3)]`}
            >
              ▼
            </button>
          </>
        )}
      </div>
    </>
  );
}
