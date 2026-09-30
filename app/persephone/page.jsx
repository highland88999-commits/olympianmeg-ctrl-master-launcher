// app/persephone/page.jsx
// PERSEPHONE — queen of the underworld's concert hall.
// A 3D underworld-club hall, real tickets (Stripe), an honest broadcast
// room, the 10%-of-net house ledger, and artist payout preferences.
//
// Honesty rules for this module (see components for details):
// - Attendance shows REAL presence peers only; otherwise it says the doors
//   are open and you're first — no fake crowd.
// - The broadcast room is clearly labeled "not streaming yet" — no fake LIVE.
// - Ticketing uses the repo's existing Stripe checkout pattern.

'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import AttendanceBar from '@/components/persephone/AttendanceBar';
import TicketsPanel from '@/components/persephone/TicketsPanel';
import BroadcastRoom from '@/components/persephone/BroadcastRoom';
import LedgerPanel from '@/components/persephone/LedgerPanel';
import PayoutMethodPanel from '@/components/persephone/PayoutMethodPanel';

// The 3D hall never renders on the server (WebGL + browser APIs).
const HallScene = dynamic(() => import('@/components/persephone/HallScene'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#070305]">
      <p className="text-sm tracking-[0.3em] uppercase text-[#8a7f66]">Raising the hall…</p>
    </div>
  ),
});

export default function PersephonePage() {
  const [peers, setPeers] = useState([]);
  const handlePeers = useCallback((p) => setPeers(p), []);

  return (
    <main
      className="min-h-dvh w-full bg-[#070305] text-[#e8d9b0]"
      style={{ paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
    >
      {/* header */}
      <header className="px-6 pt-10 pb-6 text-center max-w-3xl mx-auto">
        <p className="text-[11px] tracking-[0.45em] uppercase text-[#8a7f66]">Queen of the underworld presents</p>
        <h1 className="mt-3 text-5xl sm:text-6xl font-light tracking-[0.3em] text-[#ffd700]">PERSEPHONE</h1>
        <div className="mt-5 h-px w-28 mx-auto bg-gradient-to-r from-transparent via-[#ffd700]/60 to-transparent" />
        <p className="mt-5 text-[#a89a78] leading-relaxed">
          A concert hall in the dark below — gold on black, embers in the air,
          and the decks on the underworld stage. Come down, take a ticket, stay for the set.
        </p>
      </header>

      {/* the hall */}
      <section aria-label="The concert hall" className="px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="relative w-full overflow-hidden rounded-2xl border border-[#3a2f1a]" style={{ height: '62vh', minHeight: 380 }}>
          <HallScene peers={peers} />
          <div className="pointer-events-none absolute top-0 left-0 right-0 p-4">
            <p className="inline-block bg-black/60 backdrop-blur-sm px-3 py-2 text-[10px] tracking-[0.3em] uppercase text-[#ffd700]/90 border-l-2 border-[#ffd700]/70">
              The hall — walk around with your eyes
            </p>
          </div>
        </div>
        <div className="mt-4">
          <AttendanceBar onPeers={handlePeers} />
        </div>
        <p className="mt-2 text-xs text-[#6a6050] leading-relaxed">
          The figures in the hall are real people who walked in — counted live, never invented.
        </p>
      </section>

      {/* tickets */}
      <div className="mt-12 px-4 sm:px-6 max-w-5xl mx-auto">
        <TicketsPanel />
      </div>

      {/* broadcast room */}
      <div className="mt-12 px-4 sm:px-6 max-w-5xl mx-auto">
        <BroadcastRoom />
      </div>

      {/* ledger */}
      <div className="mt-12 px-4 sm:px-6 max-w-5xl mx-auto">
        <LedgerPanel />
      </div>

      {/* payout */}
      <div className="mt-12 px-4 sm:px-6 max-w-5xl mx-auto">
        <PayoutMethodPanel />
      </div>

      <footer className="mt-14 text-center">
        {/* Client-side nav: a plain anchor would full-reload the page and kill
            the radio embed. Link keeps the root layout (and the music) alive. */}
        <Link href="/" className="text-sm text-[#5a5f68] hover:text-[#8a8f98] tracking-widest uppercase">
          ← Back to the hub
        </Link>
      </footer>
    </main>
  );
}
