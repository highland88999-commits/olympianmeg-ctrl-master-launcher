'use client';

// PerSymphony Tickets — marketplace. Every published show, every venue type.
// This is the platform's own distribution: performers also share their links.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/persymphony/tickets';

const VENUE_LABEL = {
  physical: 'In person',
  virtual: 'Virtual arena',
  livestream: 'Livestream',
  hybrid: 'In person + livestream',
};

function minPrice(tiers) {
  if (!tiers || !tiers.length) return null;
  return Math.min(...tiers.map((t) => t.price_cents));
}

function remaining(tiers) {
  return (tiers || []).reduce((s, t) => s + Math.max(0, t.quantity - t.sold_count), 0);
}

export default function TicketsMarketplace() {
  const [shows, setShows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/persymphony/tickets/shows')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'Could not load shows.');
        setShows(d.shows);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff]">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-24">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-[#3a86ff]">Persymphony</p>
            <h1 className="text-2xl font-black mt-1">Tickets</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Live shows, straight from the performers. Every ticket is checked at the door.
            </p>
          </div>
          <Link
            href="/persymphony/tickets/create"
            className="shrink-0 min-h-[44px] px-4 py-2.5 rounded-lg bg-[#3a86ff] text-white text-sm font-semibold"
          >
            Sell tickets
          </Link>
        </div>

        {error && (
          <p className="mt-6 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </p>
        )}
        {shows === null && !error && <p className="mt-8 text-zinc-500 text-sm">Loading shows…</p>}
        {shows && shows.length === 0 && (
          <p className="mt-8 text-zinc-500 text-sm">
            No shows on sale yet. Check back soon — or be the first to{' '}
            <Link href="/persymphony/tickets/create" className="text-[#3a86ff] underline">
              sell tickets
            </Link>
            .
          </p>
        )}

        <div className="mt-6 grid gap-3">
          {(shows || []).map((s) => {
            const left = remaining(s.tiers);
            const from = minPrice(s.tiers);
            const dt = new Date(s.starts_at);
            return (
              <Link
                key={s.id}
                href={`/persymphony/tickets/${s.id}`}
                className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 active:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold truncate">{s.title}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">
                      {s.performer?.display_name || 'Performer'} · {s.performance_type}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-[#3a86ff]/40 text-[#3a86ff]">
                    {VENUE_LABEL[s.venue_type] || s.venue_type}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className="text-zinc-400 text-xs">
                    {Number.isNaN(dt.getTime())
                      ? ''
                      : dt.toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                    {s.venue_name ? ` · ${s.venue_name}` : ''}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {from != null && <span className="text-white font-semibold">{formatCents(from)}+</span>}
                    {left <= 0 ? ' · Sold out' : ` · ${left} left`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
