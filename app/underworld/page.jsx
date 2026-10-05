'use client';

// UNDERWORLD — game discovery catalog. Browse 800 curated titles across
// PlayStation, Xbox, Nintendo Switch and VR, search them, and jump to the
// official store. Nothing is sold here; nothing is tracked.
import { useCallback, useEffect, useRef, useState } from 'react';
import { PLATFORMS, getPlatform, searchTitles, paginate, monogram, PAGE_SIZE } from '@/lib/underworld/catalog';
import { useAmbience, AmbienceToggle, panelTileStyle } from '@/lib/hestia/ambience';

// Abstract platform glyphs — no trademarks, just shapes.
function PlatformGlyph({ id }) {
  const p = {
    width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
    className: 'shrink-0',
  };
  switch (id) {
    case 'playstation': // disc
      return (<svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.4" /></svg>);
    case 'xbox': // x in a rounded square
      return (<svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="m9 9 6 6M15 9l-6 6" /></svg>);
    case 'switch': // twin slabs
      return (<svg {...p}><rect x="3" y="7" width="7" height="10" rx="3.5" /><rect x="14" y="7" width="7" height="10" rx="3.5" /></svg>);
    default: // vr headset
      return (<svg {...p}><path d="M3 8h18a1 1 0 0 1 1 1v6a3 3 0 0 1-3 3h-3l-1.6-2.4a1 1 0 0 0-.8-.6h-3.2a1 1 0 0 0-.8.6L8 18H5a3 3 0 0 1-3-3V9a1 1 0 0 1 1-1Z" /></svg>);
  }
}

function Glyph({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {children}
    </svg>
  );
}

// Floating embers — an original underworld motif. Restrained: few particles,
// low alpha, no bloom. Pauses when the tab is hidden.
function Embers() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
    const embers = Array.from({ length: 36 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.8 + 0.6,
      vy: -(Math.random() * 0.35 + 0.12),
      vx: (Math.random() - 0.5) * 0.2,
      a: Math.random() * 0.25 + 0.08,
      ph: Math.random() * Math.PI * 2,
    }));
    const tick = () => {
      raf = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, w, h);
      for (const e of embers) {
        e.ph += 0.02;
        e.x += e.vx + Math.sin(e.ph) * 0.15;
        e.y += e.vy;
        if (e.y < -10) { e.y = h + 10; e.x = Math.random() * w; }
        const flicker = e.a * (0.7 + 0.3 * Math.sin(e.ph * 2));
        ctx.globalAlpha = flicker;
        ctx.fillStyle = '#ff7a3c';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1]"
    />
  );
}

function GameCard({ game }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <a
      href={game.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 transition-colors hover:border-orange-500/50"
    >
      <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={panelTileStyle()} />
      <div className="relative flex flex-col flex-1">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-900">
        {imgOk && game.img ? (
          <img
            src={game.img}
            alt={`${game.title} cover art`}
            loading="lazy"
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-black">
            <span className="text-4xl font-black tracking-widest text-orange-500/60">
              {monogram(game.title)}
            </span>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-orange-300">
          {game.origin || 'Store'}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="text-sm font-bold leading-snug text-zinc-100 line-clamp-2 min-h-[2.5em]">
          {game.title}
        </div>
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-orange-400 group-hover:text-orange-300">
          View at official store <span aria-hidden="true">↗</span>
        </span>
      </div>
      </div>
    </a>
  );
}

export default function UnderworldPage() {
  const [platformId, setPlatformId] = useState('playstation');
  const [titles, setTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState('');
  const cache = useRef({});
  const amb = useAmbience('underworld', 'video');

  const platform = getPlatform(platformId);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const loadPlatform = useCallback(async (id) => {
    const p = getPlatform(id);
    if (!p) return;
    if (cache.current[id]) {
      setTitles(cache.current[id]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(p.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data.titles) ? data.titles : [];
      cache.current[id] = list;
      setTitles(list);
    } catch {
      setLoadError(`Couldn't load the ${p.label} list. Check your connection and try again.`);
      setTitles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    loadPlatform(platformId);
  }, [platformId, loadPlatform]);

  const filtered = searchTitles(titles, debounced);
  // "Show more" accumulates: always render from the top through the current page.
  const view = paginate(filtered, 1, page * PAGE_SIZE);

  const switchTab = (id) => {
    setPlatformId(id);
    setQuery('');
    setDebounced('');
  };

  return (
    <main className="min-h-dvh bg-[#0a0705] text-white">
      {/* Ember-cavern ambience — Video → Still → Off, persisted. Embers drift above it. */}
      {amb.hydrated && amb.mode !== 'off' && (
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
          {amb.mode === 'video' ? (
            <video
              autoPlay muted loop playsInline preload="metadata"
              poster="/images/underworld/bg-cavern.webp"
              src="/images/underworld/bg-ambient.mp4"
              className="h-full w-full object-cover opacity-40"
            />
          ) : (
            <img src="/images/underworld/bg-cavern.webp" alt="" className="h-full w-full object-cover opacity-40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0705]/75 via-[#0a0705]/35 to-[#0a0705]/90" />
        </div>
      )}
      <Embers />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <AmbienceToggle mode={amb.mode} onCycle={amb.cycle} />
          </div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.5em] text-orange-500">
            The catalog below
          </div>
          <h1 className="text-3xl font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-br from-orange-400 to-red-600 sm:text-4xl">
            Game Catalog
          </h1>
          <p className="mt-2 text-sm tracking-widest text-zinc-400 uppercase">
            Find your next game
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-xl">
          <label htmlFor="underworld-search" className="sr-only">
            Search game titles
          </label>
          <input
            id="underworld-search"
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search 800 games…"
            autoComplete="off"
            className="min-h-[48px] w-full rounded-lg border border-zinc-700 bg-black/60 px-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-orange-500"
          />
        </div>

        <nav aria-label="Platforms" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLATFORMS.map((p) => {
            const active = p.id === platformId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => switchTab(p.id)}
                aria-pressed={active}
                className={`min-h-[48px] rounded-lg border px-3 py-2 text-sm font-bold uppercase tracking-widest transition-all inline-flex items-center justify-center gap-2 ${
                  active
                    ? 'border-orange-500/70 bg-orange-500/15 text-orange-200'
                    : 'border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                }`}
              >
                <PlatformGlyph id={p.id} />
                {p.label}
              </button>
            );
          })}
        </nav>

        <p className="mt-4 text-center text-xs uppercase tracking-widest text-zinc-500">
          {platform?.blurb}
        </p>

        <div className="mt-6" aria-live="polite">
          {loading ? (
            <div className="relative overflow-hidden rounded-xl border border-orange-500/20 bg-black/50 py-16 text-center" role="status">
              <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={panelTileStyle()} />
              <p className="relative text-sm uppercase tracking-widest text-orange-300/90 animate-pulse">
                Opening the gates…
              </p>
              <div aria-hidden="true" className="relative mx-auto mt-5 h-1 w-40 overflow-hidden rounded bg-white/10">
                <div className="h-full w-1/2 rounded bg-gradient-to-r from-orange-500 to-amber-300 animate-[uw-shimmer_1.4s_ease-in-out_infinite]" />
              </div>
              <style>{`@keyframes uw-shimmer { 0% { transform: translateX(-100%);} 100% { transform: translateX(300%);} }`}</style>
            </div>
          ) : loadError ? (
            <p className="py-16 text-center text-sm text-red-400">{loadError}</p>
          ) : filtered.length === 0 ? (
            <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black/50 py-16 text-center">
              <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={panelTileStyle()} />
              <p className="relative text-sm uppercase tracking-widest text-zinc-500">
                {debounced
                  ? `No games match "${debounced}" on ${platform?.label}.`
                  : `No games listed for ${platform?.label} yet.`}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-xs uppercase tracking-widest text-zinc-500">
                {debounced
                  ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'} for "${debounced}"`
                  : `${filtered.length} games on ${platform?.label}`}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {view.items.map((g, i) => (
                  <GameCard key={`${g.title}-${i}`} game={g} />
                ))}
              </div>
              {view.hasMore && (
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="min-h-[48px] rounded-lg border border-orange-500/50 bg-orange-950/20 px-8 text-sm font-bold uppercase tracking-widest text-orange-300 transition-all hover:bg-orange-900/40 inline-flex items-center gap-2"
                  >
                    Show more ({filtered.length - view.items.length} left)
                    <Glyph size={14}>
                      <path d="m6 9 6 6 6-6" />
                    </Glyph>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="mt-12 border-t border-zinc-800/60 pt-6 text-center">
          <p className="text-[11px] uppercase tracking-widest text-zinc-600">
            Cover art via the RAWG games database · Links open the official stores — nothing is sold here
          </p>
        </footer>
        <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
