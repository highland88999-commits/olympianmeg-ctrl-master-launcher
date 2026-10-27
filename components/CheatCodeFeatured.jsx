'use client';

// components/CheatCodeFeatured.jsx
// The FEATURED banner for the Social Media Cheat Code room —
// shared by the hub Concourse box and the Portal Room page, so
// the room sits prominent on every portal entry point, never
// buried as an ordinary tile. (The hub program menu carries its
// own featured button in components/SatelliteMenu.jsx, through
// the menu's launch path.) A plain link: tapping it walks
// straight into the room.

import Link from 'next/link';

export default function CheatCodeFeatured() {
  return (
    <Link
      href="/social-media-cheat-code"
      aria-label="Social Media Cheat Code — featured: every town and city hashtag, room by room"
      className="ui-element pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-left transition-all hover:border-red-400/70 hover:bg-red-900/40"
    >
      <span aria-hidden="true" className="text-[10px] font-black tracking-[0.2em] text-red-300">FEATURED</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-black tracking-wide text-zinc-100">Social Media Cheat Code</span>
        <span className="text-[11px] text-zinc-400">Every town and city hashtag, room by room — copy a piece, check it off.</span>
      </span>
      <span aria-hidden="true" className="ml-auto shrink-0 text-lg text-red-300/80">▸</span>
    </Link>
  );
}
