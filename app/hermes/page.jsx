// app/hermes/page.jsx
// HERMES — the paid link directory. Server component fetches approved listings;
// interactive pieces are client components below.
import nextDynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import DirectoryGrid from '@/components/hermes/DirectoryGrid';
import SubmitDrawer from '@/components/hermes/SubmitDrawer';

export const dynamic = 'force-dynamic';

const GalaxyCanvas = nextDynamic(() => import('@/components/hermes/GalaxyCanvas'), { ssr: false });

async function getListings() {
  try {
    const { data, error } = await supabase
      .from('hermes_links')
      .select('id, name, url, root_domain, category')
      .eq('payment_status', 'approved')
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export default async function HermesPage({ searchParams }) {
  // getListings() already catches a missing database connection and returns
  // []. Say so honestly instead of showing an empty directory with no context.
  const cloudOffline = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  const listings = await getListings();
  const success = searchParams?.success === 'true';
  const cancelled = searchParams?.cancelled === 'true';

  return (
    <main className="relative min-h-dvh w-full bg-black text-white overflow-x-hidden">
      <GalaxyCanvas />

      <div className="relative z-10 max-w-6xl mx-auto px-5 pt-14 sm:pt-20 pb-16">
        <header className="text-center mb-10">
          <p className="text-xs tracking-[0.3em] text-amber-500/80 mb-3">Argus Observatory</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-wide">HERMES</h1>
          <p className="text-zinc-400 mt-3 max-w-xl mx-auto">
            A curated directory of sites across the multiverse.
          </p>
        </header>

        {success && (
          <div className="mb-8 p-4 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-sm text-center">
            Payment received — your listing is now live in the directory.
          </div>
        )}
        {cancelled && (
          <div className="mb-8 p-4 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 text-sm text-center">
            Checkout was cancelled. Nothing was charged and nothing was saved.
          </div>
        )}

        {cloudOffline && (
          <div className="mb-8 p-4 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-300 text-sm text-center">
            Cloud features are offline — this page needs the database connection.
            Listings will appear here once it&apos;s connected.
          </div>
        )}

        <DirectoryGrid links={listings} />

        <div className="text-center">
          <SubmitDrawer />
        </div>

        <footer className="mt-16 pt-6 border-t border-zinc-800 text-center text-xs text-zinc-600">
          $2.00 USD / 12 months / one per domain. External links open in a new tab.
        </footer>

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
