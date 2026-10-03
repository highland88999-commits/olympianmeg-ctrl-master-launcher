'use client';

// PerSymphony Tickets — show page. This URL IS the shareable ticket link:
// performers distribute it themselves, the platform lists it. No login needed.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/persymphony/tickets';

const VENUE_LABEL = {
  physical: 'In person',
  virtual: 'Virtual arena',
  livestream: 'Livestream',
  hybrid: 'In person + livestream',
};

export default function TicketShowPage({ params }) {
  const { id } = params;
  const [show, setShow] = useState(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState({});
  const [buying, setBuying] = useState('');
  const [buyError, setBuyError] = useState('');
  const [copied, setCopied] = useState(false);
  const [buyerName, setBuyerName] = useState('');

  useEffect(() => {
    fetch(`/api/persymphony/tickets/shows/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'Could not load this show.');
        setShow(d.show);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function buy(tier) {
    setBuyError('');
    setBuying(tier.id);
    try {
      const q = Math.max(1, Math.min(8, Number(qty[tier.id]) || 1));
      const res = await fetch('/api/persymphony/tickets/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: id, tier_id: tier.id, quantity: q, buyer_name: buyerName }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'Checkout failed.');
      window.location.href = d.url;
    } catch (e) {
      setBuyError(e.message);
      setBuying('');
    }
  }

  function share() {
    const url = window.location.href;
    (navigator.clipboard?.writeText(url) || Promise.reject())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff] px-4 pt-10">
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 max-w-md mx-auto">
          {error}
        </p>
      </div>
    );
  }
  if (!show) {
    return (
      <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff] px-4 pt-10">
        <p className="text-zinc-500 text-sm max-w-md mx-auto">Loading…</p>
      </div>
    );
  }

  const dt = new Date(show.starts_at);
  const soldOut = (show.tiers || []).every((t) => t.quantity - t.sold_count <= 0);

  return (
    <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff]">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        <Link href="/persymphony/tickets" className="text-xs text-[#3a86ff]">
          ← All tickets
        </Link>
        <p className="text-xs tracking-[0.2em] uppercase text-[#3a86ff] mt-4">Persymphony</p>
        <h1 className="text-3xl font-black mt-1">{show.title}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {show.performer ? (
            <Link href={`/persymphony/performers/${show.performer.id}`} className="text-[#3a86ff]">
              {show.performer.display_name}
            </Link>
          ) : (
            'Performer'
          )}{' '}
          · {show.performance_type} · {VENUE_LABEL[show.venue_type] || show.venue_type}
        </p>
        <p className="text-sm text-zinc-300 mt-1">
          {!Number.isNaN(dt.getTime()) &&
            dt.toLocaleString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
        </p>
        {show.description && <p className="text-sm text-zinc-400 mt-3 whitespace-pre-line">{show.description}</p>}

        {(show.venue_type === 'physical' || show.venue_type === 'hybrid') && show.venue_name && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p className="font-semibold">{show.venue_name}</p>
            {show.venue_address && <p className="text-zinc-400 text-xs mt-0.5">{show.venue_address}</p>}
            <p className="text-zinc-500 text-xs mt-1">Show this ticket on your device at the door.</p>
          </div>
        )}
        {show.venue_type === 'livestream' && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p className="text-zinc-400 text-xs">
              Online event — your stream link is revealed after your ticket is checked at entry.
            </p>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={share}
            className="min-h-[44px] px-4 rounded-lg border border-white/15 text-sm"
          >
            {copied ? 'Link copied ✓' : 'Share this show'}
          </button>
          <Link
            href={`/persymphony/tickets/${show.id}/enter`}
            className="min-h-[44px] px-4 rounded-lg border border-white/15 text-sm flex items-center"
          >
            I have a ticket →
          </Link>
        </div>

        <h2 className="font-bold mt-8 mb-3">Tickets</h2>
        {buyError && (
          <p className="mb-3 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {buyError}
          </p>
        )}
        {soldOut && (
          <p className="text-sm text-zinc-400 border border-white/10 rounded-xl p-4">
            Sold out.
          </p>
        )}
        <div className="grid gap-3">
          {(show.tiers || []).map((t) => {
            const left = t.quantity - t.sold_count;
            if (left <= 0) return null;
            return (
              <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-zinc-400">{left} remaining</p>
                  </div>
                  <p className="text-xl font-black">{formatCents(t.price_cents)}</p>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <label className="text-xs text-zinc-400">
                    Name on ticket{' '}
                    <input
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Your name"
                      className="mt-1 w-full min-h-[44px] rounded-lg bg-black/40 border border-white/15 px-3 text-sm text-white"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <select
                    value={qty[t.id] || 1}
                    onChange={(e) => setQty({ ...qty, [t.id]: Number(e.target.value) })}
                    className="min-h-[44px] rounded-lg bg-black/40 border border-white/15 px-3 text-sm"
                    aria-label="Quantity"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].filter((n) => n <= left).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => buy(t)}
                    disabled={buying === t.id}
                    className="flex-1 min-h-[44px] rounded-lg bg-[#3a86ff] text-white font-semibold text-sm disabled:opacity-50"
                  >
                    {buying === t.id ? 'Starting checkout…' : 'Buy'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-zinc-600 mt-6">
          Secure checkout. Your ticket number is issued after payment and checked at entry.
        </p>
      </div>
    </div>
  );
}
