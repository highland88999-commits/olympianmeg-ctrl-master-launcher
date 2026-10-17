'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { searchPlaces, formatCoords } from '@/lib/geo';

const QUICK = [
  { label: 'Redwater, Alberta', lat: 53.9486, lon: -113.1067 },
  { label: 'Prince George, BC', lat: 53.9171, lon: -122.7497 },
  { label: 'Edmonton, Alberta', lat: 53.5462, lon: -113.4912 },
  { label: 'Great Pacific Garbage Patch', lat: 38.0, lon: -145.0 },
  { label: 'Mount Olympus, Greece', lat: 40.082, lon: 22.358 },
];

const MIN_KEY = 'earth-console-minimized';

export default function EarthConsole({ focus, phase, onTravel, onReturn, onStreet, onAscend, onSpawnPick, spawns }) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
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
  // the console in the middle of the screen.
  if (minimized) {
    return (
      <button
        onClick={() => setMin(false)}
        aria-label="Open Earth console"
        title={t('earth.consoleTitle')}
        className="absolute right-4 top-[32%] z-[80] w-14 h-14 rounded-full bg-zinc-950/90 border border-cyan-500/50 shadow-[0_0_25px_rgba(0,242,255,0.25)] backdrop-blur-md flex items-center justify-center text-2xl hover:scale-105 active:scale-95 transition-all ui-element pointer-events-auto"
      >
        <span aria-hidden="true">🌍</span>
      </button>
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
                : phase === 'diving_to_street' ? 'Descending to street level…'
                : t('earth.locating')}
            </div>
          )}
          {atStreet && (
            <div className="text-[10px] text-cyan-300 mt-1">
              On foot — left thumb to walk, drag the right side to look around.
            </div>
          )}
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
          <button
            onClick={onAscend}
            className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all"
          >
            ↑ Back to overlook
          </button>
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
                  className="text-left text-[11px] px-2 py-1.5 rounded bg-zinc-900/60 hover:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/40 transition-all truncate disabled:opacity-50 disabled:cursor-not-allowed"
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
    </>
  );
}
