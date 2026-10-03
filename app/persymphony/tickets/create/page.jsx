'use client';

// PerSymphony Tickets — performer show creation. Signed-in performers only.
// Any performance type (free text), any venue type. The performer sets their
// own ticket prices and quantities.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const VENUE_TYPES = [
  { id: 'physical', label: 'In person', hint: 'A real venue — address, capacity, door entry.' },
  { id: 'virtual', label: 'Virtual arena', hint: 'An in-house Persymphony arena — online entry.' },
  { id: 'livestream', label: 'Livestream', hint: 'Your stream URL — online gate.' },
  { id: 'hybrid', label: 'Hybrid', hint: 'Physical door plus a livestream.' },
];

const TYPE_SUGGESTIONS = ['music', 'comedy', 'theater', 'dance', 'livestream', 'talk'];

const inputCls =
  'mt-1 w-full min-h-[48px] rounded-lg bg-black/40 border border-white/15 px-3 text-sm text-white';
const labelCls = 'block text-sm text-zinc-300';

function authedHeaders(session) {
  const h = { 'Content-Type': 'application/json' };
  if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
  return h;
}

export default function CreateShowPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    performer_name: '',
    performer_bio: '',
    title: '',
    description: '',
    performance_type: 'music',
    starts_at: '',
    venue_type: 'virtual',
    venue_name: '',
    venue_address: '',
    venue_capacity: '',
    arena_id: 'nebula',
    stream_url: '',
    status: 'published',
  });
  const [tiers, setTiers] = useState([{ name: 'General', price: '20', quantity: '100' }]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session || null);
        setSessionChecked(true);
      })
      .catch(() => setSessionChecked(true));
  }, []);

  function set(k, v) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function setTier(i, k, v) {
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const tierRows = tiers.map((t) => ({
        name: t.name.trim(),
        price_cents: Math.round(Number(t.price) * 100),
        quantity: Number(t.quantity),
      }));
      const res = await fetch('/api/persymphony/tickets/shows', {
        method: 'POST',
        headers: authedHeaders(session),
        body: JSON.stringify({
          ...f,
          venue_capacity: f.venue_capacity === '' ? null : Number(f.venue_capacity),
          tiers: tierRows,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'Could not create the show.');
      router.push(`/persymphony/tickets/${d.show.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff] px-4 pt-10">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff] px-4 pt-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-black">Sell tickets</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Sign in from the launcher first — performers manage their shows from their account.
          </p>
        </div>
      </div>
    );
  }

  const physical = f.venue_type === 'physical' || f.venue_type === 'hybrid';
  const virtual = f.venue_type === 'virtual' || f.venue_type === 'hybrid';
  const stream = f.venue_type === 'livestream' || f.venue_type === 'hybrid';

  return (
    <div className="min-h-screen bg-[#070d1d] text-[#f4f6ff]">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        <Link href="/persymphony/tickets" className="text-xs text-[#3a86ff]">
          ← All tickets
        </Link>
        <h1 className="text-2xl font-black mt-4">Create a show</h1>
        <p className="text-sm text-zinc-400 mt-1">
          You set the prices. We take 10% of net profit — you keep 90%.
        </p>

        {error && (
          <p className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="mt-6 grid gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className={labelCls}>
              Performer name
              <input value={f.performer_name} onChange={(e) => set('performer_name', e.target.value)} placeholder="Your stage name" className={inputCls} />
            </label>
            <label className={labelCls}>
              Performance type
              <input
                value={f.performance_type}
                onChange={(e) => set('performance_type', e.target.value)}
                list="ps-type-suggestions"
                placeholder="music, comedy, theater…"
                className={inputCls}
              />
              <datalist id="ps-type-suggestions">
                {TYPE_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
          </div>
          <label className={labelCls}>
            Bio
            <textarea value={f.performer_bio} onChange={(e) => set('performer_bio', e.target.value)} rows={2} placeholder="A line or two about you." className={inputCls} />
          </label>
          <label className={labelCls}>
            Show title
            <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Friday Night Live" className={inputCls} required />
          </label>
          <label className={labelCls}>
            Description
            <textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} className={inputCls} />
          </label>
          <label className={labelCls}>
            Date &amp; time
            <input type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} className={inputCls} required />
          </label>

          <div>
            <p className={labelCls}>Venue type</p>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {VENUE_TYPES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => set('venue_type', v.id)}
                  className={`min-h-[56px] text-left px-4 py-2 rounded-xl border ${
                    f.venue_type === v.id ? 'border-[#3a86ff] bg-[#3a86ff]/15' : 'border-white/15'
                  }`}
                >
                  <span className="block text-sm font-semibold">{v.label}</span>
                  <span className="block text-xs text-zinc-500">{v.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {physical && (
            <div className="grid sm:grid-cols-2 gap-4 rounded-xl border border-white/10 p-4">
              <label className={labelCls}>
                Venue name
                <input value={f.venue_name} onChange={(e) => set('venue_name', e.target.value)} placeholder="The Grand Hall" className={inputCls} />
              </label>
              <label className={labelCls}>
                Venue address
                <input value={f.venue_address} onChange={(e) => set('venue_address', e.target.value)} placeholder="123 Main St, Edmonton" className={inputCls} />
              </label>
              <label className={labelCls}>
                Capacity <span className="text-zinc-500">(optional)</span>
                <input type="number" min="1" value={f.venue_capacity} onChange={(e) => set('venue_capacity', e.target.value)} placeholder="200" className={inputCls} />
              </label>
            </div>
          )}
          {virtual && (
            <label className={labelCls}>
              Virtual arena
              <select value={f.arena_id} onChange={(e) => set('arena_id', e.target.value)} className={inputCls}>
                {['nebula', 'digital-rain', 'storm-engine', 'burning-fractal', 'canyon', 'mega-city', 'neural-web', 'pearl', 'singularity'].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
          {stream && (
            <label className={labelCls}>
              Stream URL <span className="text-zinc-500">(revealed only after ticket check)</span>
              <input value={f.stream_url} onChange={(e) => set('stream_url', e.target.value)} placeholder="https://…" inputMode="url" className={inputCls} />
            </label>
          )}

          <div>
            <div className="flex items-center justify-between">
              <p className={labelCls}>Ticket tiers — you set the prices</p>
              <button
                type="button"
                onClick={() => setTiers([...tiers, { name: '', price: '', quantity: '' }])}
                className="text-xs text-[#3a86ff] min-h-[44px] px-2"
              >
                + Add tier
              </button>
            </div>
            <div className="grid gap-2 mt-2">
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_84px_84px_40px] gap-2 items-center">
                  <input value={t.name} onChange={(e) => setTier(i, 'name', e.target.value)} placeholder="Tier name" aria-label="Tier name" className={inputCls} />
                  <input value={t.price} onChange={(e) => setTier(i, 'price', e.target.value)} placeholder="$" inputMode="decimal" aria-label="Price in dollars" className={inputCls} />
                  <input value={t.quantity} onChange={(e) => setTier(i, 'quantity', e.target.value)} placeholder="Qty" inputMode="numeric" aria-label="Quantity" className={inputCls} />
                  <button
                    type="button"
                    onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                    disabled={tiers.length <= 1}
                    aria-label="Remove tier"
                    className="min-h-[48px] text-zinc-500 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-zinc-600 mt-1">Price in dollars, e.g. 20 = $20.00.</p>
          </div>

          <label className={labelCls}>
            Status
            <select value={f.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
              <option value="published">Published — on sale now</option>
              <option value="draft">Draft — not listed yet</option>
            </select>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="min-h-[52px] rounded-xl bg-[#3a86ff] text-white font-semibold disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create show'}
          </button>
        </form>
      </div>
    </div>
  );
}
