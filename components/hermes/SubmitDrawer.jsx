// components/hermes/SubmitDrawer.jsx
// Submit-a-listing form: validates locally, then hands off to the server-priced
// Stripe checkout. Shows the plain-English terms before payment.
'use client';

import React, { useState } from 'react';
import { CATEGORIES, CATEGORY_SLUGS, LISTING_TERMS, normalizeUrl } from '@/lib/hermes/listings.js';
import GoldCheckoutOption from '@/components/economy/GoldCheckoutOption';
import { supabase } from '@/lib/supabase';

export default function SubmitDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('home');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [useGold, setUseGold] = useState(false);

  async function submit() {
    setError('');
    setDone(null);
    if (!name.trim()) return setError('Give your listing a name.');
    const urlCheck = normalizeUrl(url);
    if (!urlCheck.ok) return setError(urlCheck.error);
    if (!CATEGORY_SLUGS.includes(category)) return setError('Pick a category from the list.');

    setBusy(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (useGold) {
        let session = null;
        try {
          ({ data: { session } } = await supabase.auth.getSession());
        } catch {
          session = null;
        }
        if (!session) {
          setError('Sign in from the launcher to use your gold.');
          return;
        }
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/hermes/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim(), url: url.trim(), category, useGold, idemKey: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not start checkout. Try again.');
        return;
      }
      if (data.type === 'gold') {
        setDone(data.notice || 'Paid with gold — your listing is live.');
        setUseGold(false);
        return;
      }
      if (!data.url) {
        setError('Could not start checkout. Try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('The server is unreachable. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-12">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full sm:w-auto px-8 py-3 rounded-lg bg-amber-500 text-black font-bold tracking-wide hover:bg-amber-400 transition-colors"
        >
          Submit your listing
        </button>
      ) : (
        <div className="bg-zinc-950/90 border border-amber-500/30 rounded-xl p-6 max-w-xl mx-auto">
          <h2 className="text-lg font-bold text-zinc-100 mb-1">Submit a listing</h2>
          <p className="text-sm text-zinc-400 mb-5">{LISTING_TERMS.summary}</p>

          <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-1" htmlFor="hermes-name">
            Name
          </label>
          <input
            id="hermes-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Widgets"
            disabled={busy}
            className="w-full mb-4 px-4 py-2.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 outline-none"
          />

          <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-1" htmlFor="hermes-url">
            Website address
          </label>
          <input
            id="hermes-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            disabled={busy}
            className="w-full mb-4 px-4 py-2.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 outline-none"
          />

          <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-1" htmlFor="hermes-category">
            Category
          </label>
          <select
            id="hermes-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={busy}
            className="w-full mb-5 px-4 py-2.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 focus:border-amber-500 outline-none"
          >
            {CATEGORY_SLUGS.map((slug) => (
              <option key={slug} value={slug}>{CATEGORIES[slug]}</option>
            ))}
          </select>

          {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
          {done && <p className="text-sm text-emerald-300 mb-4">🪙 {done}</p>}

          <div className="mb-4">
            <GoldCheckoutOption
              totalCents={LISTING_TERMS.feeCents}
              checked={useGold}
              onToggle={setUseGold}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 px-6 py-3 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {busy ? 'Starting checkout…' : `Pay ${LISTING_TERMS.feeDisplay} with card`}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              disabled={busy}
              className="px-6 py-3 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-zinc-600 mt-4">
            Payment is handled securely by Stripe. Your listing goes live once payment completes.
            Full refund if you ask before approval; approved listings are non-refundable.
          </p>
        </div>
      )}
    </div>
  );
}
