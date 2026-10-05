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
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070305] gap-4">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
        <circle cx="12" cy="12" r="9" stroke="rgba(255,215,0,0.18)" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="#ffd700" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className="text-sm tracking-[0.3em] uppercase text-[#8a7f66]">Raising the hall…</p>
    </div>
  ),
});

// --- DIONYSUS interior treatment: icon set (no text buttons on this page) ---
const PERSEPHONE_BG = '/images/persephone/bg.webp';
const PERSEPHONE_TILE = '/images/shared/obsidian-gold-tile.webp';
const PERSEPHONE_GLYPHS = {
  crown: 'M3 8l4 4 5-6 5 6 4-4-1.5 10h-15z',
  ticket: 'M4 7h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V8a1 1 0 0 1 1-1zm3.5 4h9V9.5h-9z',
  broadcast: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5a9 9 0 0 1 6.4 2.6l-1.4 1.4A7 7 0 0 0 12 5a7 7 0 0 0-5 2L5.6 5.6A9 9 0 0 1 12 3zM11 14h2v7h-2z',
  ledger: 'M6 2h9l4 4v16H6zm8 1.5V7h3.5zM8.5 12h7v1.5h-7zm0 4h7v1.5h-7z',
  coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3h2v2.2a3 3 0 0 1 0 5.6V15h-2v-1.1a3 3 0 0 1 0-5.6z',
};
function PersephoneIcon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0 text-[#ffd700]/80">
      <path d={PERSEPHONE_GLYPHS[name]} />
    </svg>
  );
}
function SectionMark({ icon, children }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span
        className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#ffd700]/40 bg-black/60"
        style={{ backgroundImage: `url(${PERSEPHONE_TILE})`, backgroundSize: '64px 64px', backgroundBlendMode: 'overlay' }}
      >
        <PersephoneIcon name={icon} size={20} />
      </span>
      <h2 className="text-xs font-bold tracking-[0.35em] uppercase text-[#8a7f66]">{children}</h2>
      <span aria-hidden="true" className="flex-1 h-px bg-gradient-to-r from-[#ffd700]/30 to-transparent" />
    </div>
  );
}

export default function PersephonePage() {
  const [peers, setPeers] = useState([]);
  const handlePeers = useCallback((p) => setPeers(p), []);

  return (
    <main
      className="relative min-h-dvh w-full bg-[#070305] text-[#e8d9b0]"
      style={{ paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
    >
      {/* Ambient backdrop: underworld hall art, fixed behind the scrolling page */}
      <div aria-hidden="true" className="fixed inset-0 bg-cover bg-center opacity-30 pointer-events-none" style={{ backgroundImage: `url(${PERSEPHONE_BG})` }} />
      <div aria-hidden="true" className="fixed inset-0 bg-gradient-to-b from-[#070305]/60 via-[#070305]/45 to-[#070305]/80 pointer-events-none" />
      <div className="relative">
      {/* header */}
      <header className="px-6 pt-10 pb-6 text-center max-w-3xl mx-auto">
        <p className="text-[11px] tracking-[0.45em] uppercase text-[#8a7f66]">Queen of the underworld presents</p>
        <h1 className="mt-3 text-5xl sm:text-6xl font-light tracking-[0.3em] text-[#ffd700] flex items-center justify-center gap-4">
          <PersephoneIcon name="crown" size={34} />
          CONCERT HALL
        </h1>
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
        <SectionMark icon="ticket">Tickets</SectionMark>
        <TicketsPanel />
      </div>

      {/* broadcast room */}
      <div className="mt-12 px-4 sm:px-6 max-w-5xl mx-auto">
        <SectionMark icon="broadcast">Broadcast room</SectionMark>
        <BroadcastRoom />
      </div>

      {/* ledger */}
      <div className="mt-12 px-4 sm:px-6 max-w-5xl mx-auto">
        <SectionMark icon="ledger">House ledger</SectionMark>
        <LedgerPanel />
      </div>

      {/* payout */}
      <div className="mt-12 px-4 sm:px-6 max-w-5xl mx-auto">
        <SectionMark icon="coin">Artist payouts</SectionMark>
        <PayoutMethodPanel />
      </div>

      <footer className="mt-14 text-center">
        {/* Client-side nav: a plain anchor would full-reload the page and kill
            the radio embed. Link keeps the root layout (and the music) alive. */}
        <Link href="/" className="text-sm text-[#5a5f68] hover:text-[#8a8f98] tracking-widest uppercase">
          ← Back to the hub
        </Link>
      </footer>
      </div>
    </main>
  );
}
