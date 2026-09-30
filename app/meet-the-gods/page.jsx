// Meet the Gods — an interactive codex of the Olympian pantheon.
// Port of highland88999-commits/Meet-the-Gods. Browse the fourteen deities,
// search, filter by domain, and open a detail view. Procedural canvas backdrop
// of golden pillars and rising sparks; zero network calls.
"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { GODS, ALL_DOMAINS, searchAndFilter } from './gods.js';

const BTN =
  'min-h-[44px] px-4 py-2 rounded font-bold tracking-widest text-xs uppercase transition-colors';

function PillarsBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();

    // Golden pillars scattered in depth, like the source's pillar field.
    let seed = 20260927;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const pillars = Array.from({ length: 14 }, () => ({
      x: rnd(),
      w: 0.015 + rnd() * 0.035,
      depth: 0.3 + rnd() * 0.7,
      hue: 42 + rnd() * 8,
    }));
    const sparks = Array.from({ length: 120 }, () => ({
      x: rnd(),
      y: rnd(),
      v: 0.0002 + rnd() * 0.0006,
      r: 0.6 + rnd() * 1.6,
    }));

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#050014');
      bg.addColorStop(1, '#02020a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Pillars with localized glow (lighting rule: glow stays on the pillars).
      for (const p of pillars) {
        const px = p.x * w;
        const pw = p.w * w;
        const grad = ctx.createLinearGradient(px - pw, 0, px + pw, 0);
        grad.addColorStop(0, 'rgba(255,180,40,0)');
        grad.addColorStop(0.5, `hsla(${p.hue}, 95%, 55%, ${0.25 * p.depth})`);
        grad.addColorStop(1, 'rgba(255,180,40,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px - pw, 0, pw * 2, h);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${0.5 * p.depth})`;
        ctx.fillRect(px - 1, 0, 2, h);
      }

      // Rising sparks.
      for (const s of sparks) {
        if (!reduced) {
          s.y -= s.v * dt * 60;
          if (s.y < -0.02) {
            s.y = 1.02;
            s.x = Math.random();
          }
        }
        ctx.fillStyle = 'rgba(103,232,249,0.7)';
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full -z-10" aria-hidden="true" />;
}

export default function MeetTheGodsPage() {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const results = useMemo(() => searchAndFilter(query, domain), [query, domain]);
  const selected = selectedId ? GODS.find((g) => g.id === selectedId) : null;

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setSelectedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-[100dvh] text-zinc-100 relative">
      <PillarsBackdrop />

      <header className="px-5 pt-10 pb-4 text-center relative">
        <h1 className="text-4xl md:text-6xl font-bold tracking-[0.2em] uppercase text-white">
          Olympus
        </h1>
        <p className="text-sm md:text-base tracking-[0.5em] uppercase text-cyan-300 mt-2">
          Meet the gods
        </p>
      </header>

      <div className="px-5 max-w-5xl mx-auto flex flex-col md:flex-row gap-3 relative">
        <input
          className="flex-1 min-h-[44px] bg-black/60 border border-cyan-900 rounded px-4 text-zinc-100 outline-none focus:border-cyan-500"
          placeholder="Search name, domain, or symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the pantheon"
        />
        <select
          className="min-h-[44px] bg-black/60 border border-cyan-900 rounded px-4 text-zinc-100 outline-none focus:border-cyan-500"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          aria-label="Filter by domain"
        >
          <option value="">All domains</option>
          {ALL_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <main className="px-5 py-8 max-w-5xl mx-auto relative">
        {results.length === 0 ? (
          <p className="text-center text-zinc-400 py-16">
            No gods answer to that name. Try another search.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {results.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedId(g.id)}
                className="text-left rounded-xl border border-cyan-900/70 bg-black/50 backdrop-blur-sm p-5 hover:border-cyan-500 hover:-translate-y-0.5 transition-all min-h-[44px]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-2xl font-bold tracking-wide" style={{ color: g.color }}>
                    {g.name}
                  </h2>
                  <span className="font-mono text-xs text-zinc-500">{g.greek}</span>
                </div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-400 mt-1">
                  {g.domains.join(' · ')}
                </p>
                <p className="text-sm text-zinc-300 mt-3 leading-relaxed line-clamp-3">{g.summary}</p>
                <span className="inline-block mt-4 text-xs font-bold uppercase tracking-widest text-cyan-400">
                  Open codex entry →
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedId(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.name} codex entry`}
        >
          <div
            className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-xl border bg-[#0a0a14] p-6 md:p-8"
            style={{ borderColor: selected.color }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold" style={{ color: selected.color }}>
                  {selected.name}
                </h2>
                <p className="font-mono text-sm text-zinc-500 mt-1">
                  {selected.greek} · Roman: {selected.roman}
                </p>
              </div>
              <button
                type="button"
                className={`${BTN} border border-zinc-600 text-zinc-300 hover:border-rose-500 hover:text-rose-400`}
                onClick={() => setSelectedId(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="text-zinc-200 leading-relaxed mt-5">{selected.summary}</p>

            <dl className="mt-6 space-y-4 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Domains</dt>
                <dd className="text-zinc-200 mt-1">{selected.domains.join(', ')}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Epithets</dt>
                <dd className="text-zinc-200 mt-1">{selected.epithets.join(' · ')}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Symbols</dt>
                <dd className="text-zinc-200 mt-1">{selected.symbols.join(', ')}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      <footer className="px-5 pb-10 text-center text-[11px] uppercase tracking-[0.3em] text-zinc-500 relative">
        Fourteen entries · stored on this page · no network
      </footer>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
