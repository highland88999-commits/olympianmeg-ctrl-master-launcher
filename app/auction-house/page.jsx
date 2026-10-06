'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AmbienceBackdrop, { useAmbience, bgModeLabel } from '@/components/ambience/AmbienceBackdrop';
import MiniViewport from '@/components/world-engine/MiniViewport';
import { supabase } from '@/lib/supabase';
import {
  CATEGORIES,
  categoryLabel,
  formatUsdCents,
  dollarsToCents,
  msUntilClose,
  formatCountdown,
  lotStatus,
  minNextBidCents,
  acceptsBids,
  hasBuyNow,
  listingTitle,
  toggleWatch,
  isWatched,
  loadWatchlist,
  saveWatchlist,
  medallionPalette,
  hashString,
  friendlyAuctionError,
} from './auction.js';

// Inline SVG glyph system (zero image weight) — PLUTUS batch.
const PATHS = {
  gavel: 'M13.8 3.1l7.1 7.1-2.1 2.1-7.1-7.1 2.1-2.1zM11.7 7.2l7.1 7.1-1.4 1.4-7.1-7.1 1.4-1.4zM4.3 20.1l3.9-3.9 1.4 1.4-3.9 3.9-2.8 1.4 1.4-2.8z',
  eye: 'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  star: 'M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6 3-6.6 3 6.6 7.1.6-5.4 4.8 1.6 7z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  spark: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7.5A1.5 1.5 0 1 0 7 4.5a1.5 1.5 0 0 0 0 3z',
  // Forge categories (stroke style).
  world: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c2.8 2.8 2.8 17.2 0 20M12 2c-2.8 2.8-2.8 17.2 0 20',
  character: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  weapon: 'M14 3a6 6 0 0 1 6 6v2.5h-7.5V4.5L14 3zM6 21l6.5-9.5M4.5 20.5l2-2',
  vehicle: 'M3 15v-3l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 7l2 5v3M3 15h18M5.5 18.5v.01M18.5 18.5v.01M7 15v3.5M17 15v3.5',
  weather: 'M7 19a4.5 4.5 0 0 1-.4-9A6.5 6.5 0 0 1 19 12a4 4 0 0 1-.5 7.9L7 19z',
  object: 'M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2zM12 11L4 6.5M12 11l8-4.5M12 11v9',
};

const CATEGORY_ICONS = {
  world: 'world',
  character: 'character',
  weapon: 'weapon',
  vehicle: 'vehicle',
  weather: 'weather',
  object: 'object',
};

function Glyph({ d, className, outline }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className || 'w-4 h-4 shrink-0'}
      fill={outline ? 'none' : 'currentColor'}
      stroke={outline ? 'currentColor' : 'none'}
      strokeWidth={outline ? 1.7 : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// Shared obsidian panel texture under a dark amber wash.
const cardTile = {
  backgroundImage:
    'linear-gradient(rgba(14,10,4,0.88), rgba(14,10,4,0.88)), url(/images/plutus-shared/panel-tile.webp)',
  backgroundSize: 'auto, 220px',
};

function Medallion({ lotId, size = 96 }) {
  const [c1, c2] = medallionPalette(lotId);
  const h = hashString(lotId + ':rings');
  const rings = 3 + (h % 3);
  const gid = `g-${String(lotId).replace(/[^a-zA-Z0-9]/g, '')}`;
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

/**
 * Lazy 3D thumbnail: renders a live MiniViewport from the listing's
 * generation_params only once the card scrolls near the viewport (keeps
 * phones happy), with the asset image or a medallion as the placeholder.
 */
function LazyThumb({ listing, className }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '240px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const params = listing?.generation_params;
  return (
    <div ref={ref} className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      {visible && params ? (
        <MiniViewport category={listing.category} params={params} />
      ) : listing?.asset_url ? (
        <img src={listing.asset_url} alt="" aria-hidden="true" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Medallion lotId={listing?.id || 'unknown'} size={64} />
        </div>
      )}
    </div>
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

function LotCard({ listing, nowMs, watched, onOpen, onWatch }) {
  const status = lotStatus(listing, nowMs);
  const current = Math.round(Number(listing.current_bid_cents) || 0);
  const buyNow = hasBuyNow(listing);
  return (
    <div className="border border-amber-500/25 rounded-lg p-4 flex flex-col gap-3 hover:border-amber-400/60 transition-colors" style={cardTile}>
      <div className="flex items-start justify-between gap-2">
        <LazyThumb listing={listing} className="w-20 h-20 rounded-md border border-amber-500/20 bg-black/40 shrink-0" />
        <div className="flex flex-col items-end gap-2">
          <StatusPill status={status} />
          <button
            onClick={() => onWatch(listing.id)}
            aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            className={`p-1 ${watched ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-300'}`}
          >
            <Glyph d={PATHS.star} outline={!watched} className="w-6 h-6" />
          </button>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-amber-500/70">
          {categoryLabel(listing.category)}
        </div>
        <h3 className="text-white font-bold mt-1 leading-snug">{listingTitle(listing)}</h3>
        {buyNow && (
          <div className="mt-1 text-[11px] text-sky-300 font-bold">
            Buy now {formatUsdCents(listing.buy_now_price_cents)}
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between mt-auto">
        <div>
          <div className="text-[10px] uppercase text-zinc-500">
            {current > 0 ? 'Current bid' : 'Starting bid'}
          </div>
          <div className="text-amber-300 font-black text-lg">
            {formatUsdCents(current > 0 ? current : listing.starting_bid_cents)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-zinc-500">Closes in</div>
          <div className="text-zinc-200 font-mono text-sm">
            {listing.ends_at ? formatCountdown(msUntilClose(listing, nowMs)) : 'No end date'}
          </div>
        </div>
      </div>
      <button
        onClick={() => onOpen(listing.id)}
        className="mt-1 w-full py-2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm font-bold uppercase tracking-widest hover:bg-amber-500/30 transition-colors inline-flex items-center justify-center gap-2"
      >
        <Glyph d={PATHS.eye} />
        View lot
      </button>
    </div>
  );
}

function maskBidder(bidderId, myId) {
  if (myId && String(bidderId) === String(myId)) return 'You';
  const s = String(bidderId || '');
  return s.length > 4 ? `Bidder ${s.slice(-4).toUpperCase()}` : 'Bidder';
}

function LotDetail({ listing, nowMs, session, watched, onWatch, onClose, onChanged }) {
  const myId = session?.user?.id || null;
  const isOwner = myId && String(listing.seller_id) === String(myId);
  const status = lotStatus(listing, nowMs);
  const canBid = acceptsBids(listing) && status !== 'closed' && !isOwner;
  const buyNow = hasBuyNow(listing) && status !== 'closed' && !isOwner;
  const minNext = minNextBidCents(listing);

  const [bids, setBids] = useState([]);
  const [bidsLoading, setBidsLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState(() => (minNextBidCents(listing) / 100).toFixed(2));
  const [bidMethod, setBidMethod] = useState('wallet');
  const [bidBusy, setBidBusy] = useState(false);
  const [bidMsg, setBidMsg] = useState(null);
  const [buyStep, setBuyStep] = useState('idle'); // idle | confirm | busy | done
  const [buyMethod, setBuyMethod] = useState('wallet');
  const [buyMsg, setBuyMsg] = useState(null);

  const loadBids = async () => {
    setBidsLoading(true);
    try {
      const { data } = await supabase
        .from('auction_bids')
        .select('amount_cents, created_at, bidder_id')
        .eq('listing_id', listing.id)
        .eq('status', 'active')
        .order('amount_cents', { ascending: false })
        .limit(25);
      setBids(data || []);
    } catch {
      setBids([]);
    } finally {
      setBidsLoading(false);
    }
  };

  useEffect(() => {
    loadBids();
    setBuyStep('idle');
    setBuyMsg(null);
    setBidMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  useEffect(() => {
    setBidAmount((minNextBidCents(listing) / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, listing.current_bid_cents]);

  const placeBid = async (e) => {
    e.preventDefault();
    setBidMsg(null);
    const cents = dollarsToCents(bidAmount);
    if (!Number.isFinite(cents) || cents < minNext) {
      setBidMsg({ kind: 'error', text: `Your bid must be at least ${formatUsdCents(minNext)}.` });
      return;
    }
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s?.access_token) {
      setBidMsg({ kind: 'error', text: 'Sign in to place a bid.' });
      return;
    }
    setBidBusy(true);
    try {
      const res = await fetch('/api/auction/bid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.access_token}`,
        },
        body: JSON.stringify({ listing_id: listing.id, amount_cents: cents, pay_method: bidMethod }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setBidMsg({ kind: 'error', text: friendlyAuctionError(data.error) });
      } else {
        setBidMsg({
          kind: 'ok',
          text: data.duplicate
            ? 'That bid is already in — you hold the high bid at this amount.'
            : `Bid placed: ${formatUsdCents(cents)}${bidMethod === 'wallet' ? ' — held in your wallet until the auction settles.' : '.'}`,
        });
        onChanged();
        loadBids();
      }
    } catch {
      setBidMsg({ kind: 'error', text: 'Could not reach the auction house. Try again.' });
    } finally {
      setBidBusy(false);
    }
  };

  const confirmBuy = async () => {
    setBuyMsg(null);
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s?.access_token) {
      setBuyMsg({ kind: 'error', text: 'Sign in to buy.' });
      return;
    }
    setBuyStep('busy');
    try {
      const res = await fetch('/api/auction/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.access_token}`,
        },
        body: JSON.stringify({ listing_id: listing.id, pay_method: buyMethod }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setBuyMsg({ kind: 'error', text: friendlyAuctionError(data.error) });
        setBuyStep('confirm');
      } else {
        setBuyStep('done');
        onChanged();
      }
    } catch {
      setBuyMsg({ kind: 'error', text: 'Could not reach the auction house. Try again.' });
      setBuyStep('confirm');
    }
  };

  const params = listing.generation_params;
  const current = Math.round(Number(listing.current_bid_cents) || 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={listingTitle(listing)}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-950 border border-amber-500/40 rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div key={listing.id} className="w-20 h-20 rounded-md border border-amber-500/20 bg-black/40 shrink-0 relative overflow-hidden">
              {params ? (
                <MiniViewport category={listing.category} params={params} />
              ) : listing.asset_url ? (
                <img src={listing.asset_url} alt="" aria-hidden="true" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Medallion lotId={listing.id} size={56} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-amber-500/70">
                {categoryLabel(listing.category)} · {acceptsBids(listing) ? 'Auction' : 'Fixed price'}
                {acceptsBids(listing) && hasBuyNow(listing) ? ' + buy now' : ''}
              </div>
              <h2 className="text-white text-xl font-black mt-1 leading-snug">{listingTitle(listing)}</h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-white p-1 leading-none shrink-0">
            <Glyph d={PATHS.close} className="w-6 h-6" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <StatusPill status={status} />
          <span className="text-zinc-400 font-mono text-sm">
            {listing.ends_at ? formatCountdown(msUntilClose(listing, nowMs)) : 'No end date'}
          </span>
          <button
            onClick={() => onWatch(listing.id)}
            className={`ml-auto text-sm font-bold uppercase tracking-widest px-3 py-1.5 rounded border inline-flex items-center gap-2 ${
              watched
                ? 'border-amber-400/60 text-amber-300 bg-amber-500/10'
                : 'border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-200'
            }`}
          >
            <Glyph d={PATHS.star} outline={!watched} className="w-4 h-4" />
            {watched ? 'Watching' : 'Watch'}
          </button>
        </div>

        {listing.description && (
          <p className="mt-4 text-zinc-300 text-sm leading-relaxed">{listing.description}</p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="bg-black/50 border border-zinc-800 rounded p-3">
            <div className="text-[10px] uppercase text-zinc-500">Current bid</div>
            <div className="text-amber-300 font-black text-sm mt-1">
              {current > 0 ? formatUsdCents(current) : 'No bids yet'}
            </div>
          </div>
          <div className="bg-black/50 border border-zinc-800 rounded p-3">
            <div className="text-[10px] uppercase text-zinc-500">Bids</div>
            <div className="text-zinc-200 font-bold text-sm mt-1">{bidsLoading ? '…' : bids.length}</div>
          </div>
          <div className="bg-black/50 border border-zinc-800 rounded p-3">
            <div className="text-[10px] uppercase text-zinc-500">Buy now</div>
            <div className="text-sky-300 font-bold text-sm mt-1">
              {hasBuyNow(listing) ? formatUsdCents(listing.buy_now_price_cents) : '—'}
            </div>
          </div>
        </div>

        <h3 className="mt-5 text-xs uppercase tracking-widest text-zinc-500">Bid history</h3>
        {bidsLoading ? (
          <p className="mt-2 text-zinc-500 text-sm">Loading bids…</p>
        ) : bids.length === 0 ? (
          <p className="mt-2 text-zinc-500 text-sm">
            No bids yet. {current <= 0 && `The opening bid is ${formatUsdCents(listing.starting_bid_cents)}.`}
          </p>
        ) : (
          <ol className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {bids.map((b, i) => (
              <li key={i} className="flex justify-between items-center text-sm bg-black/40 border border-zinc-800/60 rounded px-3 py-1.5">
                <span className="text-zinc-300">{maskBidder(b.bidder_id, myId)}</span>
                <span className="text-zinc-500 text-xs">
                  {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                </span>
                <span className="text-amber-200 font-mono">{formatUsdCents(b.amount_cents)}</span>
              </li>
            ))}
          </ol>
        )}

        {!session && (
          <div className="mt-5 rounded border border-zinc-700 bg-zinc-900/60 p-3">
            <p className="text-zinc-300 text-sm">Sign in to bid or buy.</p>
          </div>
        )}

        {isOwner && (
          <div className="mt-5 rounded border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-amber-200 text-sm font-bold">This is your listing.</p>
            <p className="text-zinc-400 text-xs mt-1">You cannot bid on or buy your own item.</p>
          </div>
        )}

        {session && canBid && buyStep !== 'done' && (
          <form onSubmit={placeBid} className="mt-5 rounded border border-amber-500/30 bg-amber-500/5 p-4">
            <label htmlFor="bid-amount" className="text-xs uppercase tracking-widest text-zinc-400">
              Your bid (minimum {formatUsdCents(minNext)})
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                <input
                  id="bid-amount"
                  inputMode="decimal"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full bg-black/60 border border-zinc-700 rounded pl-7 pr-3 py-2.5 text-white font-mono focus:border-amber-400/70 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <button
                type="submit"
                disabled={bidBusy}
                className="px-5 py-2.5 rounded bg-amber-500/25 border border-amber-400/60 text-amber-100 text-sm font-bold uppercase tracking-widest hover:bg-amber-500/40 disabled:opacity-50 transition-colors"
              >
                {bidBusy ? 'Placing…' : 'Place bid'}
              </button>
            </div>
            <div className="mt-3 flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="bid-method"
                  value="wallet"
                  checked={bidMethod === 'wallet'}
                  onChange={() => setBidMethod('wallet')}
                  className="accent-amber-500"
                />
                Wallet balance
              </label>
              <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="bid-method"
                  value="stripe"
                  checked={bidMethod === 'stripe'}
                  onChange={() => setBidMethod('stripe')}
                  className="accent-amber-500"
                />
                Card
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Wallet bids are held (not spent) until the auction settles. Outbid and the hold is released.
            </p>
            {bidMsg && (
              <p className={`mt-3 text-sm ${bidMsg.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
                {bidMsg.text}
              </p>
            )}
          </form>
        )}

        {session && buyNow && buyStep === 'idle' && (
          <button
            onClick={() => setBuyStep('confirm')}
            className="mt-4 w-full py-3 rounded bg-sky-500/15 border border-sky-400/50 text-sky-200 text-sm font-bold uppercase tracking-widest hover:bg-sky-500/30 transition-colors"
          >
            Buy now for {formatUsdCents(listing.buy_now_price_cents)}
          </button>
        )}

        {session && buyNow && buyStep === 'confirm' && (
          <div className="mt-4 rounded border border-sky-400/40 bg-sky-500/5 p-4">
            <p className="text-sky-200 font-bold text-sm">
              Buy this item now for {formatUsdCents(listing.buy_now_price_cents)}?
            </p>
            <p className="text-zinc-400 text-xs mt-1">
              You receive the full working item plus a permanent trophy record. The sale ends the listing.
            </p>
            <div className="mt-3 flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="buy-method"
                  value="wallet"
                  checked={buyMethod === 'wallet'}
                  onChange={() => setBuyMethod('wallet')}
                  className="accent-sky-500"
                />
                Wallet balance
              </label>
              <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="buy-method"
                  value="stripe"
                  checked={buyMethod === 'stripe'}
                  onChange={() => setBuyMethod('stripe')}
                  className="accent-sky-500"
                />
                Card
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirmBuy}
                className="flex-1 py-2.5 rounded bg-sky-500/25 border border-sky-400/60 text-sky-100 text-sm font-bold uppercase tracking-widest hover:bg-sky-500/40 transition-colors"
              >
                Confirm purchase
              </button>
              <button
                onClick={() => { setBuyStep('idle'); setBuyMsg(null); }}
                className="px-4 py-2.5 rounded border border-zinc-700 text-zinc-400 text-sm font-bold uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
            {buyMsg && <p className="mt-3 text-sm text-red-300">{buyMsg.text}</p>}
          </div>
        )}

        {buyStep === 'busy' && (
          <p className="mt-4 text-sky-200 text-sm">Completing your purchase…</p>
        )}

        {buyStep === 'done' && (
          <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-emerald-300 font-bold">Sold — the item is yours.</p>
            <p className="text-zinc-400 text-xs mt-1">
              The full working item is in your backpack, with a permanent trophy record in your profile.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SellModal({ session, onClose, onChanged }) {
  const myId = session?.user?.id || null;
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pickCategory, setPickCategory] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [listingType, setListingType] = useState('auction');
  const [startBid, setStartBid] = useState('');
  const [buyNowPrice, setBuyNowPrice] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!myId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(myId)}/creations?limit=100`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setLoadError(data.error || 'Could not load your creations.');
        } else {
          setCreations((data.creations || []).filter((c) => !c.is_listed));
        }
      } catch {
        setLoadError('Could not load your creations.');
      } finally {
        setLoading(false);
      }
    })();
  }, [myId]);

  const visibleCreations = useMemo(
    () =>
      creations.filter(
        (c) => pickCategory === 'all' || String(c.category || '').toLowerCase() === pickCategory
      ),
    [creations, pickCategory]
  );
  const selected = creations.find((c) => c.id === selectedId) || null;

  const pick = (c) => {
    setSelectedId(c.id);
    setMsg(null);
    if (!title.trim()) setTitle(c.display_name || '');
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!selected) {
      setMsg({ kind: 'error', text: 'Choose one of your creations to list.' });
      return;
    }
    const body = { asset_id: selected.id, listing_type: listingType };
    if (listingType === 'auction' || listingType === 'both') {
      const cents = dollarsToCents(startBid);
      if (!Number.isFinite(cents)) {
        setMsg({ kind: 'error', text: 'Set a starting bid (a number, 0 or more).' });
        return;
      }
      body.starting_bid_cents = cents;
    }
    if (listingType === 'fixed' || listingType === 'both') {
      const cents = dollarsToCents(buyNowPrice);
      if (!Number.isFinite(cents) || cents <= 0) {
        setMsg({ kind: 'error', text: 'Set a buy-now price (more than $0.00).' });
        return;
      }
      body.buy_now_price_cents = cents;
    }
    if (endsAt.trim()) {
      const d = new Date(endsAt);
      if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        setMsg({ kind: 'error', text: 'The end date must be in the future.' });
        return;
      }
      body.ends_at = d.toISOString();
    }
    if (title.trim()) body.title = title.trim().slice(0, 140);
    if (description.trim()) body.description = description.trim().slice(0, 2000);

    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s?.access_token) {
      setMsg({ kind: 'error', text: 'Sign in to list an item.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auction/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg({ kind: 'error', text: friendlyAuctionError(data.error) });
      } else {
        setDone(true);
        onChanged();
      }
    } catch {
      setMsg({ kind: 'error', text: 'Could not reach the auction house. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sell an item"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border border-amber-500/40 rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-500/80">Consign with the house</div>
            <h2 className="text-white text-xl font-black mt-1">Sell an item</h2>
            <p className="text-zinc-400 text-sm mt-1">
              List one of your forged creations. The price you set is frozen on the listing — buyers always pay the listing's price.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-white p-1 leading-none shrink-0">
            <Glyph d={PATHS.close} className="w-6 h-6" />
          </button>
        </div>

        {!myId && (
          <div className="mt-5 rounded border border-zinc-700 bg-zinc-900/60 p-3">
            <p className="text-zinc-300 text-sm">Sign in to sell your creations.</p>
          </div>
        )}

        {myId && done && (
          <div className="mt-5 rounded border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-emerald-300 font-bold">Your item is live in the Auction House.</p>
            <p className="text-zinc-400 text-xs mt-1">Bidders will see it on the floor right away.</p>
            <button
              onClick={onClose}
              className="mt-3 px-5 py-2 rounded bg-amber-500/25 border border-amber-400/60 text-amber-100 text-sm font-bold uppercase tracking-widest hover:bg-amber-500/40 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {myId && !done && (
          <>
            <h3 className="mt-5 text-xs uppercase tracking-widest text-zinc-500">1 · Choose a creation</h3>
            {loading ? (
              <p className="mt-2 text-zinc-500 text-sm">Loading your creations…</p>
            ) : loadError ? (
              <p className="mt-2 text-red-300 text-sm">{loadError}</p>
            ) : creations.length === 0 ? (
              <p className="mt-2 text-zinc-500 text-sm">
                Nothing available to list — every creation you have is already listed, or you have not forged anything yet.
              </p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter creations by category">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setPickCategory(c.value)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest border transition-colors ${
                        pickCategory === c.value
                          ? 'bg-amber-500/25 border-amber-400/70 text-amber-100'
                          : 'border-zinc-800 text-zinc-400 hover:border-amber-500/40 hover:text-amber-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {visibleCreations.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pick(c)}
                      aria-pressed={selectedId === c.id}
                      className={`rounded-lg border p-2 text-left transition-colors ${
                        selectedId === c.id
                          ? 'border-amber-400/80 bg-amber-500/10'
                          : 'border-zinc-800 hover:border-amber-500/40'
                      }`}
                    >
                      <LazyThumb listing={c} className="w-full h-24 rounded bg-black/40" />
                      <div className="mt-1.5 text-[10px] uppercase tracking-widest text-amber-500/70">
                        {categoryLabel(c.category)}
                      </div>
                      <div className="text-zinc-100 text-xs font-bold truncate">
                        {c.display_name || 'Untitled creation'}
                      </div>
                    </button>
                  ))}
                </div>
                {visibleCreations.length === 0 && (
                  <p className="mt-2 text-zinc-500 text-sm">No creations in this category.</p>
                )}
              </>
            )}

            <h3 className="mt-6 text-xs uppercase tracking-widest text-zinc-500">2 · Listing details</h3>
            <form onSubmit={submit} className="mt-2 space-y-3">
              <div>
                <label htmlFor="sell-type" className="text-xs uppercase tracking-widest text-zinc-400">Sale type</label>
                <select
                  id="sell-type"
                  value={listingType}
                  onChange={(e) => setListingType(e.target.value)}
                  className="mt-1 w-full bg-black/60 border border-zinc-700 rounded px-3 py-2.5 text-white focus:border-amber-400/70 focus:outline-none"
                >
                  <option value="auction">Auction — highest bid wins</option>
                  <option value="fixed">Fixed price — buy now only</option>
                  <option value="both">Both — auction with a buy-now option</option>
                </select>
              </div>

              {(listingType === 'auction' || listingType === 'both') && (
                <div>
                  <label htmlFor="sell-start" className="text-xs uppercase tracking-widest text-zinc-400">Starting bid ($)</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                    <input
                      id="sell-start"
                      inputMode="decimal"
                      value={startBid}
                      onChange={(e) => setStartBid(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/60 border border-zinc-700 rounded pl-7 pr-3 py-2.5 text-white font-mono focus:border-amber-400/70 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {(listingType === 'fixed' || listingType === 'both') && (
                <div>
                  <label htmlFor="sell-buynow" className="text-xs uppercase tracking-widest text-zinc-400">Buy-now price ($)</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                    <input
                      id="sell-buynow"
                      inputMode="decimal"
                      value={buyNowPrice}
                      onChange={(e) => setBuyNowPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/60 border border-zinc-700 rounded pl-7 pr-3 py-2.5 text-white font-mono focus:border-amber-400/70 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="sell-ends" className="text-xs uppercase tracking-widest text-zinc-400">
                  Ends <span className="normal-case text-zinc-500">(optional — auctions run open-ended without one)</span>
                </label>
                <input
                  id="sell-ends"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="mt-1 w-full bg-black/60 border border-zinc-700 rounded px-3 py-2.5 text-white focus:border-amber-400/70 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="sell-title" className="text-xs uppercase tracking-widest text-zinc-400">Listing title</label>
                <input
                  id="sell-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={140}
                  placeholder="Give it a name buyers will remember"
                  className="mt-1 w-full bg-black/60 border border-zinc-700 rounded px-3 py-2.5 text-white focus:border-amber-400/70 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="sell-desc" className="text-xs uppercase tracking-widest text-zinc-400">Description</label>
                <textarea
                  id="sell-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="What is it? What makes it worth bidding on?"
                  className="mt-1 w-full bg-black/60 border border-zinc-700 rounded px-3 py-2.5 text-white focus:border-amber-400/70 focus:outline-none"
                />
              </div>

              {msg && (
                <p className={`text-sm ${msg.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
                  {msg.text}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !selected}
                className="w-full py-3 rounded bg-amber-500/25 border border-amber-400/60 text-amber-100 text-sm font-bold uppercase tracking-widest hover:bg-amber-500/40 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
              >
                <Glyph d={PATHS.tag} />
                {busy ? 'Listing…' : 'List this item'}
              </button>
              {!selected && (
                <p className="text-xs text-zinc-500 text-center">Pick a creation above first.</p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuctionHousePage() {
  const [category, setCategory] = useState('all');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [watchlist, setWatchlist] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshTick, setRefreshTick] = useState(0);
  const [session, setSession] = useState(null);
  const [bgMode, cycleBg] = useAmbience('auction-house-bg');
  const openLotRef = useRef(null);

  const loadListings = async (cat) => {
    setLoading(true);
    setLoadError('');
    try {
      const qs = new URLSearchParams({ limit: '48' });
      if (cat && cat !== 'all') qs.set('category', cat);
      const res = await fetch(`/api/auction/listings?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLoadError(data.error || 'Could not load listings.');
        setListings([]);
      } else {
        setListings(data.listings || []);
      }
    } catch {
      setLoadError('Could not reach the auction house. Try again.');
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setWatchlist(loadWatchlist());
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpenId(null);
        setSellOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    loadListings(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, refreshTick]);

  const handleWatch = (id) => {
    setWatchlist((prev) => {
      const next = toggleWatch(prev, id);
      saveWatchlist(next);
      return next;
    });
  };

  const refresh = () => setRefreshTick((t) => t + 1);

  const found = listings.find((l) => l.id === openId);
  if (found) openLotRef.current = found;
  const openLot = found || (openId ? openLotRef.current : null);
  const watchedCount = watchlist.length;

  return (
    <main className="min-h-dvh bg-[#0a0805] text-zinc-200 px-4 py-8 md:px-8 relative">
      <AmbienceBackdrop basePath="/images/auction-house" bgMode={bgMode} />
      <div className="max-w-6xl mx-auto relative">
        <header className="text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-amber-500/80">The Gavel Room</div>
          <h1 className="text-3xl md:text-4xl font-black text-amber-100 mt-2 tracking-wide">AUCTION HOUSE</h1>
          <p className="text-zinc-400 text-sm mt-2 max-w-xl mx-auto">
            Real creations from the World Engine forge, sold by their makers. Bid in the auction
            or buy now — every sale moves real money.
          </p>
          <img
            src="/images/auction-house/header.webp"
            alt=""
            aria-hidden="true"
            className="mt-6 h-32 md:h-44 w-full object-cover rounded-2xl border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.12)]"
          />
          <div className="mt-4 flex justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSellOpen(true)}
              className="min-h-[44px] px-5 rounded-full border border-amber-400/70 bg-amber-500/20 text-amber-100 hover:bg-amber-500/35 text-xs font-bold uppercase tracking-widest inline-flex items-center gap-2 transition-colors"
            >
              <Glyph d={PATHS.tag} />
              Sell an item
            </button>
            <button
              type="button"
              onClick={cycleBg}
              aria-label={`Ambient background is ${bgMode}. Activate to change.`}
              title="Ambient background: video, still, or off"
              className="min-h-[44px] px-4 rounded-full border border-amber-200/40 text-amber-200/90 bg-amber-400/5 hover:bg-amber-300/15 text-xs font-bold uppercase tracking-widest inline-flex items-center gap-2 transition-colors"
            >
              <Glyph d={PATHS.spark} />
              Ambience: {bgModeLabel(bgMode)}
            </button>
          </div>
        </header>

        <nav className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border transition-colors inline-flex items-center gap-2 ${
                category === c.value
                  ? 'bg-amber-500/25 border-amber-400/70 text-amber-100'
                  : 'border-zinc-800 text-zinc-400 hover:border-amber-500/40 hover:text-amber-200'
              }`}
            >
              {CATEGORY_ICONS[c.value] && (
                <Glyph d={PATHS[CATEGORY_ICONS[c.value]]} outline className="w-3.5 h-3.5 shrink-0" />
              )}
              {c.label}
            </button>
          ))}
          <span className="ml-2 self-center text-xs text-zinc-500">
            Watching {watchedCount}
          </span>
        </nav>

        {loading ? (
          <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Loading lots">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-lg border border-amber-500/15 p-4 animate-pulse" style={cardTile}>
                <div className="h-16 w-16 rounded-md bg-amber-500/10" />
                <div className="mt-3 h-4 w-3/4 rounded bg-zinc-800/80" />
                <div className="mt-2 h-4 w-1/2 rounded bg-zinc-800/80" />
                <div className="mt-3 h-9 rounded bg-zinc-800/60" />
              </div>
            ))}
            <span className="sr-only">Loading the catalog…</span>
          </section>
        ) : loadError ? (
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/5 p-10 text-center" role="alert">
            <Glyph d={PATHS.gavel} className="w-8 h-8 mx-auto text-red-400/60" />
            <p className="mt-3 text-red-200 font-bold uppercase text-sm tracking-[0.2em]">The house is unreachable</p>
            <p className="mt-1 text-zinc-400 text-sm">{loadError}</p>
            <button
              onClick={refresh}
              className="mt-4 px-5 py-2 rounded border border-amber-400/60 text-amber-100 text-xs font-bold uppercase tracking-widest hover:bg-amber-500/20 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : listings.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-amber-500/30 p-10 text-center" style={cardTile} role="status">
            <Glyph d={PATHS.gavel} className="w-8 h-8 mx-auto text-amber-500/50" />
            <p className="mt-3 text-amber-100/80 font-bold tracking-[0.2em] uppercase text-sm">The floor is quiet</p>
            <p className="mt-1 text-zinc-500 text-sm">No live listings in this category yet — be the first to consign one.</p>
            <button
              onClick={() => setSellOpen(true)}
              className="mt-4 px-5 py-2 rounded border border-amber-400/60 text-amber-100 text-xs font-bold uppercase tracking-widest hover:bg-amber-500/20 transition-colors inline-flex items-center gap-2"
            >
              <Glyph d={PATHS.tag} className="w-3.5 h-3.5" />
              Sell an item
            </button>
          </div>
        ) : (
          <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Lots">
            {listings.map((listing) => (
              <LotCard
                key={listing.id}
                listing={listing}
                nowMs={nowMs}
                watched={isWatched(watchlist, listing.id)}
                onOpen={setOpenId}
                onWatch={handleWatch}
              />
            ))}
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-zinc-600">
          Listings come from the World Engine forge and are sold by their makers.
          Bids and purchases move real money through your wallet or card.
        </footer>
      </div>

      {openLot && (
        <LotDetail
          listing={openLot}
          nowMs={nowMs}
          session={session}
          watched={isWatched(watchlist, openLot.id)}
          onWatch={handleWatch}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
      {sellOpen && (
        <SellModal
          session={session}
          onClose={() => setSellOpen(false)}
          onChanged={refresh}
        />
      )}
      <div aria-hidden="true" className="player-clear" />
    </main>
  );
}
