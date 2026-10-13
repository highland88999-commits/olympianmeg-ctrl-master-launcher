'use client';
// /store/marketplace — the Creator Marketplace: every user creation
// from the Custom Product Designer, for sale in one place (Merlin,
// 2026-10-13). Data comes from GET /api/store/creations (creation
// records: DB once the prepared migration runs, Stripe product
// metadata today — the API is honest about which answered). Buying
// goes through the record-priced custom buy route (see
// components/store/CreationCard.jsx); prices are always re-derived
// server-side from the creation record.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { HermesLoader } from '@/components/hermes-ui/HermesUi';
import ShareButton from '@/components/store/ShareButton';
import CreationCard from '@/components/store/CreationCard';
import {
  marketplaceShareUrl,
  marketplaceShareTitle,
  marketplaceShareText,
} from '@/lib/store/share';

function MarketplaceInner() {
  const [creations, setCreations] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/store/creations?limit=100', { cache: 'no-store' });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok || !data.ok) {
          setCreations([]);
          setError('Could not load the marketplace right now. Please try again later.');
          return;
        }
        setCreations(data.creations || []);
      } catch {
        if (alive) {
          setCreations([]);
          setError('Could not reach the store right now. Please try again later.');
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div
      className="min-h-dvh bg-[#06070d] text-white"
      style={{ paddingBottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))' }}
    >
      <header className="sticky top-0 z-50 border-b border-amber-300/20 bg-[#06070d]/90 backdrop-blur">
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/store" className="text-sm text-slate-300 hover:text-white">← Store</Link>
          <h1 className="text-lg font-bold tracking-wide">Creator Marketplace</h1>
          <div className="ml-auto">
            <ShareButton
              url={marketplaceShareUrl()}
              title={marketplaceShareTitle()}
              text={marketplaceShareText()}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="mb-6 max-w-2xl text-sm text-slate-400">
          Every design here was made by a member of the community in the{' '}
          <Link href="/store/custom" className="text-amber-300 underline">Custom Designer</Link>.
          Each sale pays the creator their markup — the price you see is the price you pay,
          printed on demand and made when you order.
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-red-400/50 bg-red-400/10 px-4 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {creations === null ? (
          <HermesLoader label="Loading the marketplace" />
        ) : creations.length === 0 && !error ? (
          <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-6 text-sm text-slate-300">
            <p>No community creations yet — be the first.</p>
            <p className="mt-3">
              <Link
                href="/store/custom"
                className="inline-flex items-center justify-center rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black transition hover:bg-amber-200"
              >
                Design your own product
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creations.map((c) => (
              <CreationCard key={c.id} creation={c} />
            ))}
          </div>
        )}

        <p className="mt-8 text-xs text-slate-500">
          Printed on demand and made when you order. Prices include each creator&apos;s markup.
        </p>
      </main>
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#06070d] text-white"><HermesLoader label="Loading the marketplace" className="min-h-dvh" /></div>}>
      <MarketplaceInner />
    </Suspense>
  );
}
