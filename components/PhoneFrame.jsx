'use client';

// PhoneFrame — Layer 3 of the Concourse system (Merlin, 2026-10-20):
// a phone-shaped frame the Phone tile opens, where USER APPS will be
// stored. Pages pan horizontally with snap, like a phone home
// screen. Today it ships the frame and the paging: page 1 carries a
// few built-in Olympus apps (real routes); the remaining slots are
// reserved for the user's own apps from the cloud phone project.

import { useRef, useState } from 'react';
import Link from 'next/link';

const BUILT_INS = [
  { id: 'wallet', label: 'Wallet', icon: '👛', href: '/wallet' },
  { id: 'agora', label: 'Agora', icon: '🏛️', href: '/agora' },
  { id: 'fortress', label: 'Fortress', icon: '🏔️', href: '/fortress-of-solitude' },
  { id: 'renewal', label: 'Renewal', icon: '◈', href: '/renewal-plan' },
];
const USER_SLOTS = 8; // page 2: reserved for the user's own apps
const APPS_PER_PAGE = 8;

export default function PhoneFrame({ open, onClose }) {
  const scrollerRef = useRef(null);
  const [page, setPage] = useState(0);
  const pages = 2;

  if (!open) return null;

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  const appIcon = (app) => (
    <Link
      key={app.id}
      href={app.href}
      onClick={onClose}
      className="ui-element pointer-events-auto flex flex-col items-center gap-1.5 no-underline"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] border border-white/15 bg-white/[0.07] text-[26px] shadow-[0_6px_18px_rgba(0,0,0,0.4)] backdrop-blur-md transition-transform active:scale-95">
        {app.icon}
      </span>
      <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-200">{app.label}</span>
    </Link>
  );

  const emptySlot = (i) => (
    <div key={`slot-${i}`} className="flex flex-col items-center gap-1.5" aria-hidden="true">
      <span className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] border border-dashed border-white/12 bg-white/[0.02] text-[18px] text-zinc-600">
        +
      </span>
      <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-600">Empty</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[62] flex items-center justify-center p-4" role="dialog" aria-label="Cloud phone">
      <button
        type="button"
        aria-label="Close cloud phone"
        onClick={onClose}
        className="ui-element pointer-events-auto absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      {/* The phone */}
      <div className="ui-element pointer-events-auto relative flex h-[min(560px,82dvh)] w-[min(300px,86vw)] flex-col overflow-hidden rounded-[2.4rem] border border-white/20 bg-zinc-950/90 shadow-[0_30px_80px_rgba(0,0,0,0.7),0_0_40px_rgba(0,242,255,0.10)] backdrop-blur-xl">
        {/* notch + status row */}
        <div className="relative flex items-center justify-between px-5 pt-3 pb-1">
          <span className="text-[9px] font-black tracking-[0.25em] uppercase text-cyan-200">Cloud Phone</span>
          <span aria-hidden="true" className="absolute left-1/2 top-2 h-[14px] w-[74px] -translate-x-1/2 rounded-full bg-black border border-white/10" />
          <button
            type="button"
            aria-label="Close cloud phone"
            onClick={onClose}
            className="ui-element pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-white transition-all"
          >
            <span aria-hidden="true" className="text-xs leading-none">✕</span>
          </button>
        </div>

        {/* Panning pages */}
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="grid w-full shrink-0 snap-center grid-cols-4 content-start gap-x-2 gap-y-5 px-4 pt-4">
            {BUILT_INS.map(appIcon)}
            {Array.from({ length: APPS_PER_PAGE - BUILT_INS.length }, (_, i) => emptySlot(i))}
            <div className="col-span-4 mt-2 text-center text-[10px] leading-relaxed text-zinc-500">
              Built-in Olympus apps. Your own apps will live here —
              this is the cloud phone's home screen.
            </div>
          </div>
          <div className="grid w-full shrink-0 snap-center grid-cols-4 content-start gap-x-2 gap-y-5 px-4 pt-4">
            {Array.from({ length: USER_SLOTS }, (_, i) => emptySlot(100 + i))}
            <div className="col-span-4 mt-2 text-center text-[10px] leading-relaxed text-zinc-500">
              Reserved for your apps.
            </div>
          </div>
        </div>

        {/* page dots + home bar */}
        <div className="flex flex-col items-center gap-2 pb-3 pt-1">
          <div className="flex gap-1.5">
            {Array.from({ length: pages }, (_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all ${i === page ? 'w-4 bg-cyan-300' : 'w-1.5 bg-zinc-600'}`}
              />
            ))}
          </div>
          <span aria-hidden="true" className="h-1 w-24 rounded-full bg-white/25" />
        </div>
      </div>
    </div>
  );
}
