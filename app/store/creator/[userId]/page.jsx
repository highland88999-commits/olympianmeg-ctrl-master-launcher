'use client';
// /store/creator/<userId> — a creator's storefront: everything one
// user has made in the Custom Product Designer, for sale, on one
// shareable page (Merlin, 2026-10-13). Reached from the marketplace
// ("by <creator>"), from the creator's profile, and by its canonical
// share URL (https://olympusverse.com/store/creator/<userId>).
//
// Data comes from GET /api/store/creations?creator=<userId> (creation
// records — DB once the prepared migration runs, Stripe product
// metadata today). The page shows the creator's PUBLIC display name
// only; no email, no account details. A creator with nothing yet gets
// an honest empty state, not an error.
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { HermesLoader } from '@/components/hermes-ui/HermesUi';
import ShareButton from '@/components/store/ShareButton';
import CreationCard from '@/components/store/CreationCard';
import {
  creatorShareUrl,
  creatorShareTitle,
  creatorShareText,
} from '@/lib/store/share';

function CreatorInner() {
  const params = useParams();
  const userId = typeof params?.userId === 'string' ? params.userId : '';
  const [creations, setCreations] = useState(null);
  const [creatorLabel, setCreatorLabel] = useState('Creator');
  const [error, setError] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (alive) setIsOwner(!!session?.user && session.user.id === userId);
      } catch { /* owner extras are optional */ }
    })();
    (async () => {
      try {
        const res = await fetch(
          `/api/store/creations?creator=${encodeURIComponent(userId)}&limit=100`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (!alive) return;
        if (!res.ok || !data.ok) {
          setCreations([]);
          setError('Could not load this storefront right now. Please try again later.');
          return;
        }
        setCreations(data.creations || []);
        if (data.creator && data.creator.label) setCreatorLabel(data.creator.label);
      } catch {
        if (alive) {
          setCreations([]);
          setError('Could not reach the store right now. Please try again later.');
        }
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  const heading = creatorLabel === 'Creator' ? 'Creator Storefront' : `${creatorLabel}'s Storefront`;

  return (
    <div
      className="min-h-dvh bg-[#06070d] text-white"
      style={{ paddingBottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))' }}
    >
      <header className="sticky top-0 z-50 border-b border-amber-300/20 bg-[#06070d]/90 backdrop-blur">
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/store" className="text-sm text-slate-300 hover:text-white">← Store</Link>
          <h1 className="truncate text-lg font-bold tracking-wide">{heading}</h1>
          <div className="ml-auto shrink-0">
            <ShareButton
              url={creatorShareUrl(userId)}
              title={creatorShareTitle(creatorLabel)}
              text={creatorShareText(creatorLabel)}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href="/store/marketplace" className="text-amber-300 underline">
            Creator Marketplace
          </Link>
          <Link href={`/agora/profile/${encodeURIComponent(userId)}`} className="text-slate-300 underline">
            View profile
          </Link>
          {isOwner && (
            <span className="text-slate-400">This is your storefront — share it anywhere.</span>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-400/50 bg-red-400/10 px-4 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {creations === null ? (
          <HermesLoader label="Loading the storefront" />
        ) : creations.length === 0 && !error ? (
          <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-6 text-sm text-slate-300">
            <p>No creations yet — when this creator designs a product, it will appear here for sale.</p>
            {isOwner && (
              <p className="mt-3">
                <Link
                  href="/store/custom"
                  className="inline-flex items-center justify-center rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black transition hover:bg-amber-200"
                >
                  Design your first product
                </Link>
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creations.map((c) => (
              <CreationCard key={c.id} creation={c} showCreator={false} />
            ))}
          </div>
        )}

        <p className="mt-8 text-xs text-slate-500">
          Printed on demand and made when you order. Each sale pays the creator their markup.
        </p>
      </main>
    </div>
  );
}

export default function CreatorPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#06070d] text-white"><HermesLoader label="Loading the storefront" className="min-h-dvh" /></div>}>
      <CreatorInner />
    </Suspense>
  );
}
