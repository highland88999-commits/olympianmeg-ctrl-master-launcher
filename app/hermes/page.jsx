// app/hermes/page.jsx
// HERMES — the paid link directory. Server component fetches approved listings;
// interactive pieces are client components below.
import nextDynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import DirectoryGrid from '@/components/hermes/DirectoryGrid';
import SubmitDrawer from '@/components/hermes/SubmitDrawer';
import OnlineMall from '@/components/hermes/OnlineMall';
import { HermesBackdrop } from '@/components/hermes-ui/HermesUi';

export const dynamic = 'force-dynamic';

const GalaxyCanvas = nextDynamic(() => import('@/components/hermes/GalaxyCanvas'), { ssr: false });

async function getListings() {
  try {
    const { data, error } = await supabase
      .from('hermes_links')
      .select('id, name, url, root_domain, category, expires_at')
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
      {/* Merchant-row ambience — sits BEHIND the galaxy canvas (z 0 vs z 0
          canvas, both under the z-10 content). Previously these used negative
          z-indexes, which painted them UNDER the page's own black background —
          the ambience never rendered. Non-negative keeps them visible. */}
      <HermesBackdrop
        src="/images/hermes/bg.webp"
        imgOpacity={0.32}
        scrimTop={0.72}
        scrimBottom={0.9}
        zIndex={0}
        alt=""
      />
      <GalaxyCanvas />

      <div className="relative z-10 max-w-6xl mx-auto px-5 pt-14 sm:pt-20 pb-16">
        <header className="text-center mb-10">
          <p className="text-xs tracking-[0.3em] text-amber-500/80 mb-3">Argus Observatory</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-wide">Mall</h1>
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

        {/* Holiday hook — the seasonal affiliate push. Static, honest: the
            price and terms below are the real ones from lib/hermes/listings.js. */}
        <div className="mb-10 mx-auto max-w-2xl rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-950/50 to-zinc-950/80 px-6 py-5 text-center">
          <p className="text-sm sm:text-base text-amber-100/95 font-semibold tracking-wide">
            🎄 Load your bases for Christmas — list your site before the holiday rush.
          </p>
          <p className="mt-1.5 text-xs sm:text-sm text-zinc-400">
            $2.00/year, one listing per domain. Affiliates: load up your links
            before the holiday traffic.{' '}
            <a href="#hermes-submit" className="text-amber-300 underline underline-offset-2 hover:text-amber-200">
              List your site ↓
            </a>
          </p>
        </div>

        <DirectoryGrid links={listings} />

        <div className="text-center" id="hermes-submit">
          <SubmitDrawer />
        </div>

        {/* Merlin's Online Mall — his original mall build, a distinct section
            below the paid directory. Same paid listings, his mall presentation. */}
        <OnlineMall links={listings.map((l) => ({ ...l, title: l.name }))} />

        <footer className="mt-16 pt-6 border-t border-zinc-800 text-center text-xs text-zinc-600">
          $2.00 USD / 12 months / one per domain. External links open in a new tab.
        </footer>

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
