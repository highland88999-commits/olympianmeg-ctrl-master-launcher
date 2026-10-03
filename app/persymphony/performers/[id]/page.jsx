'use client';

// PerSymphony — public performer profile (in-house). Their shows, on sale.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/persymphony/tickets';

const VENUE_LABEL = {
  physical: 'In person',
  virtual: 'Virtual arena',
  livestream: 'Livestream',
  hybrid: 'In person + livestream',
};

export default function PerformerProfilePage({ params }) {
  const { id } = params;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/persymphony/tickets/performers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || 'Could not load this performer.');
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff]">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        <Link href="/persymphony/tickets" className="text-xs text-[#3a86ff]">
          ← All tickets
        </Link>
        {error && (
          <p className="mt-6 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </p>
        )}
        {!data && !error && <p className="mt-8 text-zinc-500 text-sm">Loading…</p>}
        {data && (
          <>
            <div className="mt-4 flex items-center gap-4">
              {data.performer.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.performer.avatar_url}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover border border-white/15"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#3a86ff]/20 border border-[#3a86ff]/40 flex items-center justify-center text-xl font-black text-[#3a86ff]">
                  {(data.performer.display_name || 'P').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-xs tracking-[0.2em] uppercase text-[#3a86ff]">Performer</p>
                <h1 className="text-2xl font-black">{data.performer.display_name}</h1>
              </div>
            </div>
            {data.performer.bio && (
              <p className="text-sm text-zinc-400 mt-3 whitespace-pre-line">{data.performer.bio}</p>
            )}

            <h2 className="font-bold mt-8 mb-3">Shows</h2>
            <div className="grid gap-3">
              {data.shows.map((s) => {
                const left = (s.tiers || []).reduce(
                  (n, t) => n + Math.max(0, t.quantity - t.sold_count),
                  0
                );
                const from =
                  s.tiers && s.tiers.length ? Math.min(...s.tiers.map((t) => t.price_cents)) : null;
                const dt = new Date(s.starts_at);
                return (
                  <Link
                    key={s.id}
                    href={`/persymphony/tickets/${s.id}`}
                    className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 active:bg-white/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{s.title}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {s.performance_type}
                          {!Number.isNaN(dt.getTime()) &&
                            ` · ${dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-[#3a86ff]/40 text-[#3a86ff]">
                        {VENUE_LABEL[s.venue_type] || s.venue_type}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-2">
                      {from != null && <span className="text-white font-semibold">{formatCents(from)}+</span>}
                      {left <= 0 ? ' · Sold out' : ` · ${left} left`}
                    </p>
                  </Link>
                );
              })}
              {data.shows.length === 0 && (
                <p className="text-sm text-zinc-500">No shows on sale right now.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
