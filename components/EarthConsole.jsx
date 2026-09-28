'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { searchPlaces, formatCoords } from '@/lib/geo';

const QUICK = [
  { label: 'Redwater, Alberta', lat: 53.9486, lon: -113.1067 },
  { label: 'Prince George, BC', lat: 53.9171, lon: -122.7497 },
  { label: 'Edmonton, Alberta', lat: 53.5462, lon: -113.4912 },
  { label: 'Great Pacific Garbage Patch', lat: 38.0, lon: -145.0 },
  { label: 'Mount Olympus, Greece', lat: 40.082, lon: 22.358 },
];

export default function EarthConsole({ focus, phase, onTravel, onReturn }) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

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

  const busy = phase === 'diving_to_earth' || phase === 'earth_travel';

  return (
    <div className="absolute bottom-5 right-5 z-50 w-72 ui-element pointer-events-auto">
      <div className="bg-zinc-950/90 border border-cyan-500/30 rounded-xl p-4 shadow-[0_0_30px_rgba(0,255,255,0.12)] backdrop-blur-md flex flex-col gap-3">
        <div className="border-b border-zinc-800 pb-2">
          <div className="text-xs font-black tracking-[0.25em] uppercase text-cyan-300">
            {t('earth.consoleTitle')}
          </div>
          {focus && (
            <div className="text-[10px] text-zinc-400 mt-1 truncate">
              ◉ {focus.label} · {formatCoords(focus.lat, focus.lon)}
            </div>
          )}
          {busy && (
            <div className="text-[10px] text-cyan-400 mt-1 animate-pulse">
              {phase === 'earth_travel' ? t('earth.traveling') : t('earth.locating')}
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
          {QUICK.map((q) => (
            <button
              key={q.label}
              disabled={busy}
              onClick={() => onTravel(q)}
              className="text-left text-[11px] px-2 py-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-all truncate disabled:opacity-50"
            >
              → {q.label}
            </button>
          ))}
        </div>

        <button
          onClick={onReturn}
          disabled={busy}
          className="w-full py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 border border-zinc-700 rounded hover:border-cyan-500/50 hover:text-white transition-all disabled:opacity-50"
        >
          {t('earth.returnToOrbit')}
        </button>
      </div>
    </div>
  );
}
