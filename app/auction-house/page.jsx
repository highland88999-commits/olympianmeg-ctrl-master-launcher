'use client';

import { useEffect, useMemo, useState } from 'react';
import { submenuArtFor } from '@/lib/god-menus';
import {
  CATEGORIES,
  getLot,
  lotsByCategory,
  formatUSD,
} from './lots.js';
import {
  anchorLots,
  currentBid,
  bidCount,
  seedBids,
  formatCountdown,
  lotStatus,
  msUntilClose,
  nextMinBid,
  toggleWatch,
  isWatched,
  loadWatchlist,
  saveWatchlist,
  medallionPalette,
  hashString,
} from './auction.js';

function Medallion({ lotId, size = 96 }) {
  const [c1, c2] = medallionPalette(lotId);
  const h = hashString(lotId + ':rings');
  const rings = 3 + (h % 3);
  const gid = `g-${lotId}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={gid} cx="35%" cy="30%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke={c1} strokeWidth="2" opacity="0.7" />
      {Array.from({ length: rings }).map((_, i) => (
        <circle
          key={i}
          cx="50"
          cy="50"
          r={40 - i * (36 / rings)}
          fill={i === rings - 1 ? `url(#${gid})` : 'none'}
          stroke={c1}
          strokeWidth="1.2"
          opacity={0.35 + (i / rings) * 0.5}
        />
      ))}
      <circle cx={50 + ((h >> 3) % 21) - 10} cy={50 + ((h >> 6) % 21) - 10} r="6" fill={c1} opacity="0.9" />
    </svg>
  );
}

function StatusPill({ status }) {
  const map = {
    live: ['LIVE', 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'],
    'ending-soon': ['ENDING SOON', 'bg-amber-500/20 text-amber-300 border-amber-500/40'],
    closed: ['CLOSED', 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40'],
  };
  const [label, cls] = map[status] || map.live;
  return (
    <span className={`text-[10px] font-bold tracking-widest px-2 py-1 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function LotCard({ lot, nowMs, watched, onOpen, onWatch }) {
  const status = lotStatus(lot, nowMs);
  const bid = currentBid(lot);
  return (
    <div className="bg-black/60 border border-amber-500/25 rounded-lg p-4 flex flex-col gap-3 hover:border-amber-400/60 transition-colors">
      <div className="flex items-start justify-between">
        <Medallion lotId={lot.id} size={72} />
        <div className="flex flex-col items-end gap-2">
          <StatusPill status={status} />
          <button
            onClick={() => onWatch(lot.id)}
            aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            className={`text-xl leading-none ${watched ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-300'}`}
          >
            {watched ? '★' : '☆'}
          </button>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-amber-500/70">{lot.category}</div>
        <h3 className="text-white font-bold mt-1">{lot.title}</h3>
      </div>
      <div className="flex items-baseline justify-between mt-auto">
        <div>
          <div className="text-[10px] uppercase text-zinc-500">Current bid</div>
          <div className="text-amber-300 font-black text-lg">{formatUSD(bid)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-zinc-500">Closes in</div>
          <div className="text-zinc-200 font-mono text-sm">{formatCountdown(msUntilClose(lot, nowMs))}</div>
        </div>
      </div>
      <button
        onClick={() => onOpen(lot.id)}
        className="mt-1 w-full py-2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm font-bold uppercase tracking-widest hover:bg-amber-500/30 transition-colors"
      >
        View lot
      </button>
    </div>
  );
}

function LotDetail({ lot, nowMs, watched, onWatch, onClose }) {
  const bids = useMemo(() => seedBids(lot), [lot]);
  const status = lotStatus(lot, nowMs);
  const bid = bids.length ? bids[bids.length - 1].amount : lot.startBid;
  const [c1] = medallionPalette(lot.id);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lot.title}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-950 border border-amber-500/40 rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Medallion lotId={lot.id} size={84} />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-500/70">
                {lot.category} · {lot.id.toUpperCase()}
              </div>
              <h2 className="text-white text-xl font-black mt-1">{lot.title}</h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <StatusPill status={status} />
          <span className="text-zinc-400 font-mono text-sm">{formatCountdown(msUntilClose(lot, nowMs))}</span>
          <button
            onClick={() => onWatch(lot.id)}
            className={`ml-auto text-sm font-bold uppercase tracking-widest px-3 py-1.5 rounded border ${
              watched
                ? 'border-amber-400/60 text-amber-300 bg-amber-500/10'
                : 'border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-200'
            }`}
          >
            {watched ? '★ Watching' : '☆ Watch'}
          </button>
        </div>

        <p className="mt-4 text-zinc-300 text-sm leading-relaxed">{lot.description}</p>
        <p className="mt-2 text-zinc-500 text-xs italic">{lot.provenance}</p>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="bg-black/50 border border-zinc-800 rounded p-3">
            <div className="text-[10px] uppercase text-zinc-500">Estimate</div>
            <div className="text-zinc-200 font-bold text-sm mt-1">
              {formatUSD(lot.estimateLow)}–{formatUSD(lot.estimateHigh)}
            </div>
          </div>
          <div className="bg-black/50 border border-zinc-800 rounded p-3">
            <div className="text-[10px] uppercase text-zinc-500">Current bid</div>
            <div className="font-black text-sm mt-1" style={{ color: c1 }}>
              {formatUSD(bid)}
            </div>
          </div>
          <div className="bg-black/50 border border-zinc-800 rounded p-3">
            <div className="text-[10px] uppercase text-zinc-500">Bids</div>
            <div className="text-zinc-200 font-bold text-sm mt-1">{bids.length}</div>
          </div>
        </div>

        <h3 className="mt-5 text-xs uppercase tracking-widest text-zinc-500">Bid history (simulated)</h3>
        <ol className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {[...bids].reverse().map((b, i) => (
            <li key={i} className="flex justify-between text-sm bg-black/40 border border-zinc-800/60 rounded px-3 py-1.5">
              <span className="text-zinc-300">{b.bidder}</span>
              <span className="text-amber-200 font-mono">{formatUSD(b.amount)}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="text-amber-200 text-sm font-bold">Bidding is disabled in this demo catalog.</div>
          <p className="text-zinc-400 text-xs mt-1">
            Minimum next bid would be {formatUSD(nextMinBid(bid))}. All lots, bidders, and prices are fictional
            and for showcase only.
          </p>
        </div>
      </div>
    </div>
  );
}


// Menu Art Transfer batch 2 — submenu art. Background image + dark legibility
// scrim; a missing image hides itself via onError so the chip falls back to
// its plain style. Never breaks the UI.
function SubmenuArt({ slot }) {
  return (
    <>
      <img
        src={submenuArtFor(slot)}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/55" />
    </>
  );
}

// Category label -> submenu art slot suffix.
function categoryArtSlug(c) {
  return c.toLowerCase().replace(/ /g, '-');
}

export default function AuctionHousePage() {
  const [category, setCategory] = useState('All');
  const [watchlist, setWatchlist] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lots] = useState(() => anchorLots(Date.now()));

  useEffect(() => {
    setWatchlist(loadWatchlist());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    const onKey = (e) => e.key === 'Escape' && setOpenId(null);
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleWatch = (id) => {
    setWatchlist((prev) => {
      const next = toggleWatch(prev, id);
      saveWatchlist(next);
      return next;
    });
  };

  const visible = lots.filter((l) => category === 'All' || l.category === category);
  const openLot = openId ? lots.find((l) => l.id === openId) : null;
  const watchedCount = watchlist.length;

  return (
    <main className="min-h-dvh bg-[#0a0805] text-zinc-200 px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto">
        <header className="text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-amber-500/80">The Gavel Room</div>
          <h1 className="text-3xl md:text-4xl font-black text-amber-100 mt-2 tracking-wide">AUCTION HOUSE</h1>
          <p className="text-zinc-400 text-sm mt-2 max-w-xl mx-auto">
            A curated showcase of fictional lots. Browse the catalog, follow the demo bidding,
            keep a watchlist — everything here is imaginary.
          </p>
        </header>

        <nav className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`relative min-h-[44px] inline-flex items-center justify-center overflow-hidden px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border transition-colors ${
                category === c
                  ? 'bg-amber-500/25 border-amber-400/70 text-amber-100'
                  : 'border-zinc-800 text-zinc-400 hover:border-amber-500/40 hover:text-amber-200'
              }`}
            >
              {category !== c && <SubmenuArt slot={`submenu-prog-auction-house-${categoryArtSlug(c)}`} />}
              <span className="relative">{c}</span>
            </button>
          ))}
          <span className="ml-2 self-center text-xs text-zinc-500">
            ★ Watching {watchedCount}
          </span>
        </nav>

        <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Lots">
          {visible.map((lot) => (
            <LotCard
              key={lot.id}
              lot={lot}
              nowMs={nowMs}
              watched={isWatched(watchlist, lot.id)}
              onOpen={setOpenId}
              onWatch={handleWatch}
            />
          ))}
        </section>

        <footer className="mt-10 text-center text-xs text-zinc-600">
          All lots, bidders, estimates, and bid activity are fictional and simulated locally.
          Nothing leaves your device.
        </footer>
      </div>

      {openLot && (
        <LotDetail
          lot={openLot}
          nowMs={nowMs}
          watched={isWatched(watchlist, openLot.id)}
          onWatch={handleWatch}
          onClose={() => setOpenId(null)}
        />
      )}
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}

