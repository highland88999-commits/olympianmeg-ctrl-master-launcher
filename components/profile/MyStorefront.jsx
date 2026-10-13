'use client';
// Profile — My Storefront: the bridge from the universal rider
// profile to the creator's Omega Store storefront (Merlin,
// 2026-10-13: every user's creations are visible and shareable
// through their profile). Renders only when signed in — the
// storefront URL needs the account id — and links:
//   - "View my storefront"  -> /store/creator/<userId> (the public,
//     shareable page with everything the user has designed for sale)
//   - "Design a new product" -> /store/custom (the Custom Designer)
//   - "Creator Marketplace"  -> /store/marketplace (all creations)
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { creatorPagePath } from '@/lib/store/share';

export default function MyStorefront() {
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) setUserId(session?.user?.id || null);
      } catch {
        if (!cancelled) setUserId(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!userId) return null;
  const storefrontPath = creatorPagePath(userId);
  if (!storefrontPath) return null;

  const linkCls =
    'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-neutral-100 transition hover:border-white/35';

  return (
    <section aria-label="My storefront" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-neutral-100 mb-1">My Storefront</h2>
      <p className="text-xs text-neutral-500 mb-4">
        Products you design in the Custom Designer appear on your public storefront —
        share it anywhere, and every sale pays you your markup.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={storefrontPath} className={linkCls}>View my storefront</Link>
        <Link href="/store/custom" className={linkCls}>Design a new product</Link>
        <Link href="/store/marketplace" className={linkCls}>Creator Marketplace</Link>
      </div>
    </section>
  );
}
