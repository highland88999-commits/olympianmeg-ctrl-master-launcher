// app/creator/page.jsx
// The creator dashboard: price your worlds, see your listings,
// watch your earnings land. Earnings arrive as CAD CREDIT in the
// wallet (same wallet, same Dec 11, 2027 unlock).
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

async function authed(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to manage your creations.');
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function fmt(cents) {
  const c = Math.round(Number(cents) || 0);
  const sign = c < 0 ? '-' : '';
  const a = Math.abs(c);
  return `$${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

function ts(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso || ''; }
}

const card = {
  border: '1px solid #2a3352', background: 'linear-gradient(180deg, rgba(56,189,248,0.06), transparent 60%), #0d1226',
  borderRadius: 14, padding: '1.2rem', marginBottom: '1rem',
};

const inputStyle = {
  width: '100%', padding: '0.6rem 0.8rem', borderRadius: 8,
  border: '1px solid #2a3352', background: '#0a0f22', color: '#e8eefc', fontSize: '1rem',
};

const btnPrimary = {
  padding: '0.6rem 1.2rem', borderRadius: 8, border: 'none',
  background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#05070f',
  fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem',
};

const btnGhost = {
  padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid #2a3352',
  background: 'transparent', color: '#9fb0d8', cursor: 'pointer', fontSize: '0.9rem',
};

export default function CreatorPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [worlds, setWorlds] = useState([]);
  const [listings, setListings] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [prices, setPrices] = useState({});
  const [saving, setSaving] = useState({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // My worlds (for pricing)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in to manage your creations.');
      // Worlds come from the communiverse profile endpoint
      const wres = await fetch('/api/communiverse', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const wdata = await wres.json().catch(() => ({}));
      const mine = (wdata.worlds || []).filter((w) => w.is_owner);
      setWorlds(mine);

      const l = await authed('/api/creator/listings');
      setListings(l.listings || []);

      const e = await authed('/api/creator/earnings');
      setEarnings(e);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const listingFor = (worldId) => listings.find((l) => l.item_id === worldId);

  const savePrice = async (world) => {
    const raw = prices[world.id];
    if (raw === undefined || raw === '') return;
    const cents = Math.round(Number(raw) * 100);
    setSaving((s) => ({ ...s, [world.id]: true }));
    setNotice('');
    try {
      if (cents <= 0) {
        await authed('/api/creator/list', {
          method: 'POST',
          body: JSON.stringify({ world_id: world.id, price_cents: 0 }),
        });
        setNotice(`"${world.display_name}" unlisted.`);
      } else {
        await authed('/api/creator/list', {
          method: 'POST',
          body: JSON.stringify({ world_id: world.id, price_cents: cents }),
        });
        setNotice(`"${world.display_name}" listed at ${fmt(cents)}.`);
      }
      setPrices((p) => ({ ...p, [world.id]: '' }));
      const l = await authed('/api/creator/listings');
      setListings(l.listings || []);
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    } finally {
      setSaving((s) => ({ ...s, [world.id]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem', color: '#e8eefc' }}>
        <p>Loading your creator studio…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem', color: '#e8eefc' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '0.3rem' }}>Creator Studio</h1>
      <p style={{ color: '#9fb0d8', marginBottom: '1.5rem' }}>
        Price your worlds. When one sells, the earnings land in your{' '}
        <Link href="/wallet" style={{ color: '#38bdf8' }}>wallet</Link> as CAD credit —{' '}
        net of the Stripe fee and a $1.00 platform fee.
      </p>

      {error && (
        <div style={{ ...card, borderColor: '#f43f5e' }}>
          <p style={{ color: '#f43f5e' }}>{error}</p>
        </div>
      )}
      {notice && (
        <div style={{ ...card, borderColor: '#34d399' }}>
          <p style={{ color: '#34d399' }}>{notice}</p>
        </div>
      )}

      {/* Earnings summary */}
      <div style={card}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.8rem' }}>Earnings</h2>
        {earnings ? (
          <>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#9fb0d8' }}>Total earned (net)</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399' }}>
                  {fmt(earnings.totals.net_cents)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#9fb0d8' }}>Sales</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{earnings.totals.count}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#9fb0d8' }}>Gross</div>
                <div style={{ fontSize: '1.2rem' }}>{fmt(earnings.totals.gross_cents)}</div>
              </div>
            </div>
            {earnings.sales.length > 0 ? (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {earnings.sales.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.6rem 0', borderTop: '1px solid #1a2340',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.item_label || 'World sale'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#9fb0d8' }}>{ts(s.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#34d399', fontWeight: 700 }}>+{fmt(s.net_cents)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9fb0d8' }}>
                        {fmt(s.gross_cents)} − {fmt(s.stripe_fee_cents)} fee − {fmt(s.platform_fee_cents)} platform
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#9fb0d8' }}>No sales yet — list a world below to start earning.</p>
            )}
          </>
        ) : (
          <p style={{ color: '#9fb0d8' }}>Could not load earnings.</p>
        )}
      </div>

      {/* My worlds — pricing */}
      <div style={card}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.8rem' }}>Your worlds</h2>
        {worlds.length === 0 ? (
          <p style={{ color: '#9fb0d8' }}>
            You have no published worlds yet.{' '}
            <Link href="/world-engine/studio" style={{ color: '#38bdf8' }}>Forge one</Link> to start earning.
          </p>
        ) : (
          worlds.map((w) => {
            const listing = listingFor(w.id);
            return (
              <div
                key={w.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: '1rem', padding: '0.8rem 0', borderTop: '1px solid #1a2340', flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontWeight: 600 }}>{w.display_name || 'Untitled world'}</div>
                  {listing ? (
                    <div style={{ fontSize: '0.85rem', color: '#34d399' }}>
                      Listed at {fmt(listing.price_cents)}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#9fb0d8' }}>Not listed</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="Price (CAD)"
                    value={prices[w.id] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [w.id]: e.target.value }))}
                    style={{ ...inputStyle, width: 130 }}
                    aria-label={`Price for ${w.display_name}`}
                  />
                  <button
                    onClick={() => savePrice(w)}
                    disabled={!!saving[w.id]}
                    style={btnPrimary}
                  >
                    {saving[w.id] ? 'Saving…' : listing ? 'Update' : 'List'}
                  </button>
                  {listing && (
                    <button
                      onClick={() => { setPrices((p) => ({ ...p, [w.id]: '0' })); }}
                      style={btnGhost}
                      title="Enter 0 and press Update to unlist"
                    >
                      Unlist
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <p style={{ fontSize: '0.8rem', color: '#9fb0d8', marginTop: '0.8rem' }}>
          Minimum $1.00. Set the price to 0 (or press Unlist) to remove a listing.
        </p>
      </div>

      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <Link href="/wallet" style={{ color: '#38bdf8' }}>View wallet →</Link>
      </div>
    </div>
  );
}
