// Merlin Mandates — a personal mandate ledger.
// Note on the source: highland88999-commits/Merlin-Mandates contained no
// Merlin content at all — it was an ad-style click-through page for a gym
// product (click anywhere navigated to a store page, with "SHOP NOW!" and
// "KAPOW!" overlays). No emails, phones, addresses, or personal data were
// present, so there was nothing private to sweep. This module is a fresh,
// faithful-to-the-name interpretation: a board where Merlin keeps his own
// mandates, stored on this device, with the source's stepped arcade particle
// field as the backdrop.
"use client";

import { useEffect, useRef, useState } from 'react';
import {
  STORAGE_KEY,
  seedMandates,
  createMandate,
  addMandate,
  updateMandate,
  toggleMandate,
  deleteMandate,
  moveMandate,
  stats,
  exportText,
  serializeList,
  deserializeList,
} from './mandates.js';

const BTN =
  'min-h-[44px] px-4 py-2 rounded font-bold tracking-widest text-xs uppercase transition-colors inline-flex items-center justify-center gap-2';

// Inline SVG glyph system (zero image weight) — PLUTUS batch.
const PATHS = {
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  up: 'M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z',
  down: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
  trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
};

function Glyph({ d, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className || 'w-4 h-4 shrink-0'}>
      <path d={d} />
    </svg>
  );
}

// Shared obsidian panel texture under a dark teal wash.
const cardTile = {
  backgroundImage:
    'linear-gradient(rgba(3,8,12,0.9), rgba(3,8,12,0.9)), url(/images/plutus-shared/panel-tile.webp)',
  backgroundSize: 'auto, 200px',
};

// Stepped particle field, echoing the source's arcade "tier" particles.
function ParticleField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;

    let seed = 777;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const N = 700;
    const parts = Array.from({ length: N }, () => ({
      tier: Math.floor(rnd() * 8),
      x: rnd(),
      z: rnd(),
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
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // Transparent bed: the mandates art behind the canvas glows through.
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      for (const p of parts) {
        // Stepped arcade walk: x advances in discrete steps, like the source.
        const walk = reduced ? p.x : ((t * 0.25 + p.x) % 1);
        const steppedX = Math.floor(walk * 40) / 40;
        const y = (p.tier / 8) * h + Math.sin(t * 2 + p.tier) * 2;
        ctx.fillStyle = 'rgba(0,242,255,0.55)';
        ctx.fillRect(steppedX * w, y, 2.5, 2.5);
      }
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full -z-10 opacity-40"
      style={{ background: '#000 url(/images/merlin-mandates/bg.webp) center/cover' }}
      aria-hidden="true"
    />
  );
}

export default function MerlinMandatesPage() {
  const [list, setList] = useState(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');

  useEffect(() => {
    let initial = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) initial = deserializeList(raw);
    } catch (e) {
      /* corrupted storage: start fresh */
    }
    if (!initial) initial = seedMandates();
    setList(initial);
  }, []);

  useEffect(() => {
    if (!list) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeList(list));
    } catch (e) {
      /* storage blocked: keep working in memory */
    }
  }, [list]);

  function onAdd(e) {
    e.preventDefault();
    try {
      const m = createMandate(title, detail);
      setList((l) => addMandate(l, m));
      setTitle('');
      setDetail('');
    } catch (err) {
      /* empty title: ignore */
    }
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditTitle(m.title);
    setEditDetail(m.detail);
  }

  function saveEdit() {
    if (!editTitle.trim()) return;
    setList((l) => updateMandate(l, editingId, { title: editTitle.trim(), detail: editDetail.trim() }));
    setEditingId(null);
  }

  function onExport() {
    const blob = new Blob([exportText(list)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merlin-mandates.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  if (!list) {
    return (
      <div
        className="min-h-[100dvh] text-zinc-200 flex flex-col gap-4 items-center justify-center"
        style={{ background: '#000 url(/images/merlin-mandates/bg.webp) center/cover' }}
        role="status"
        aria-label="Loading mandates"
      >
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400/25 border-t-cyan-300 animate-spin" aria-hidden="true" />
        <p className="font-mono text-sm tracking-[0.25em]">OPENING THE MANDATES…</p>
      </div>
    );
  }

  const s = stats(list);

  return (
    <div className="min-h-[100dvh] text-zinc-100 relative">
      <ParticleField />

      <header className="px-5 pt-10 pb-4 text-center relative">
        <h1 className="text-3xl md:text-4xl font-bold tracking-[0.25em] uppercase text-cyan-300">
          Mandate Ledger
        </h1>
        <p className="text-xs tracking-[0.3em] uppercase text-zinc-400 mt-2">
          {s.active} active &middot; {s.fulfilled} fulfilled &middot; stored on this device
        </p>
        <img
          src="/images/merlin-mandates/header.webp"
          alt=""
          aria-hidden="true"
          className="mt-6 mx-auto h-32 md:h-40 w-full max-w-2xl object-cover rounded-2xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,242,255,0.1)]"
        />
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-16 relative">
        <form onSubmit={onAdd} className="rounded-xl border border-cyan-900/70 p-4 flex flex-col gap-3" style={cardTile}>
          <input
            className="min-h-[44px] bg-black/60 border border-zinc-700 rounded px-4 text-zinc-100 outline-none focus:border-cyan-500"
            placeholder="New mandate — e.g. Ship the build before midnight"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Mandate title"
          />
          <input
            className="min-h-[44px] bg-black/60 border border-zinc-700 rounded px-4 text-zinc-300 outline-none focus:border-cyan-500"
            placeholder="Detail (optional)"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            aria-label="Mandate detail"
          />
          <button type="submit" className={`${BTN} border border-cyan-500 text-cyan-300 hover:bg-cyan-500 hover:text-black`}>
            <Glyph d={PATHS.add} />
            Add mandate
          </button>
        </form>

        <ul className="mt-6 flex flex-col gap-3">
          {list.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl border p-4 ${
                m.fulfilled ? 'border-zinc-700 opacity-70' : 'border-cyan-900/70'
              }`}
              style={cardTile}
            >
              {editingId === m.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    className="min-h-[44px] bg-black border border-cyan-600 rounded px-3 text-zinc-100"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    aria-label="Edit title"
                  />
                  <input
                    className="min-h-[44px] bg-black border border-zinc-700 rounded px-3 text-zinc-300"
                    value={editDetail}
                    onChange={(e) => setEditDetail(e.target.value)}
                    aria-label="Edit detail"
                  />
                  <div className="flex gap-2">
                    <button type="button" className={`${BTN} border border-cyan-500 text-cyan-300 hover:bg-cyan-500 hover:text-black`} onClick={saveEdit}>
                      <Glyph d={PATHS.check} />
                      Save
                    </button>
                    <button type="button" className={`${BTN} border border-zinc-600 text-zinc-300`} onClick={() => setEditingId(null)}>
                      <Glyph d={PATHS.close} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setList((l) => toggleMandate(l, m.id))}
                    className={`mt-0.5 w-7 h-7 shrink-0 rounded border-2 flex items-center justify-center font-bold ${
                      m.fulfilled ? 'border-cyan-400 bg-cyan-400 text-black' : 'border-zinc-500 text-transparent'
                    }`}
                    aria-label={m.fulfilled ? `Reopen ${m.title}` : `Mark fulfilled: ${m.title}`}
                  >
                    <Glyph d={PATHS.check} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className={`font-bold ${m.fulfilled ? 'line-through text-zinc-400' : 'text-zinc-100'}`}>
                      {m.title}
                    </h2>
                    {m.detail && <p className="text-sm text-zinc-400 mt-1">{m.detail}</p>}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button type="button" className="min-h-[36px] min-w-[40px] px-2 rounded border border-zinc-700 text-xs hover:border-cyan-500 inline-flex items-center justify-center" onClick={() => startEdit(m)} aria-label={`Edit mandate: ${m.title}`}>
                      <Glyph d={PATHS.edit} className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="min-h-[36px] min-w-[40px] px-2 rounded border border-zinc-700 text-xs hover:border-zinc-400 inline-flex items-center justify-center" onClick={() => setList((l) => moveMandate(l, m.id, -1))} title="Move up" aria-label={`Move up: ${m.title}`}>
                      <Glyph d={PATHS.up} className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="min-h-[36px] min-w-[40px] px-2 rounded border border-zinc-700 text-xs hover:border-zinc-400 inline-flex items-center justify-center" onClick={() => setList((l) => moveMandate(l, m.id, 1))} title="Move down" aria-label={`Move down: ${m.title}`}>
                      <Glyph d={PATHS.down} className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="min-h-[36px] min-w-[40px] px-2 rounded border border-zinc-700 text-xs hover:border-rose-500 hover:text-rose-400 inline-flex items-center justify-center"
                      aria-label={`Delete mandate: ${m.title}`}
                      onClick={() => {
                        if (window.confirm(`Delete "${m.title}"?`)) setList((l) => deleteMandate(l, m.id));
                      }}
                    >
                      <Glyph d={PATHS.trash} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {list.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-cyan-500/30 p-10 text-center" style={cardTile} role="status">
            <Glyph d={PATHS.check} className="w-8 h-8 mx-auto text-cyan-400/50" />
            <p className="mt-3 text-cyan-100/80 font-bold tracking-[0.2em] uppercase text-sm">A clear ledger</p>
            <p className="mt-1 text-zinc-500 text-sm">No mandates yet — write the first one above.</p>
          </div>
        )}

        {list.length > 0 && (
          <div className="mt-6 text-center">
            <button type="button" className={`${BTN} border border-zinc-600 text-zinc-300 hover:border-zinc-400`} onClick={onExport}>
              <Glyph d={PATHS.download} />
              Export as text
            </button>
          </div>
        )}
      </main>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
