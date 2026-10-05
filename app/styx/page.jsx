'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LEGS, STORAGE_KEY, sanitizeLeg, advanceLeg, isComplete, stationUrl } from '@/lib/styx/journey';
import { panelTileStyle } from '@/lib/hestia/ambience';

function Glyph({ size = 14, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {children}
    </svg>
  );
}

export default function StyxPage() {
  const router = useRouter();
  const [leg, setLeg] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let next = 0;
    try {
      next = sanitizeLeg(window.localStorage.getItem(STORAGE_KEY));
      const params = new URLSearchParams(window.location.search);
      if (params.get('advanced') === '1') {
        next = advanceLeg(next);
        window.localStorage.setItem(STORAGE_KEY, String(next));
        router.replace('/styx');
      }
    } catch {
      /* private mode — journey simply won't persist */
    }
    setLeg(next);
    setReady(true);
  }, [router]);

  const enter = useCallback(() => {
    const url = stationUrl(leg);
    if (url) router.push(url);
  }, [leg, router]);

  const reset = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '0');
    } catch { /* ignore */ }
    setLeg(0);
  }, []);

  const complete = isComplete(leg);
  const current = LEGS[leg];

  return (
    <main className="min-h-dvh w-full bg-[#060809] text-[#e8e4da] flex flex-col items-center px-6 pt-16"
      style={{ paddingBottom: 'max(4rem, env(safe-area-inset-bottom))' }}>
      {/* The river behind everything — still water, dark. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <img src="/images/styx/bg-river.webp" alt="" className="h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#060809]/70 via-[#060809]/40 to-[#060809]/90" />
      </div>
      <div className="relative z-10 w-full max-w-xl flex flex-col items-center text-center">
        <div aria-hidden="true" className="w-full overflow-hidden rounded-2xl border border-[#ffd700]/20 mb-2">
          <img src="/images/styx/header-ferry.webp" alt="" className="h-36 w-full object-cover opacity-80 sm:h-44" />
        </div>
        <p className="text-xs tracking-[0.4em] uppercase text-[#8a8f98]">A passage in four stations</p>
        <h1 className="mt-3 text-5xl font-light tracking-[0.25em] text-[#ffd700]">THE PASSAGE</h1>
        <div className="mt-6 h-px w-24 bg-gradient-to-r from-transparent via-[#ffd700]/50 to-transparent" />
        <p className="mt-6 text-[#a9adb5] leading-relaxed">
          Four stations. One river. Walk them in order, or wander —
          the water doesn&apos;t mind.
        </p>

        {/* station markers */}
        <div className="mt-10 flex items-center gap-3" aria-label="Journey progress">
          {LEGS.map((s, i) => {
            const done = i < leg;
            const here = i === leg && !complete;
            return (
              <div key={s.numeral} className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-full border flex items-center justify-center text-sm tracking-widest
                    ${done ? 'border-[#ffd700]/70 text-[#ffd700]/80'
                      : here ? 'border-[#ffd700] text-[#ffd700] shadow-[0_0_18px_rgba(212,175,55,0.35)]'
                      : 'border-[#3a3f47] text-[#5a5f68]'}`}
                  aria-label={`Station ${s.numeral}: ${s.title}${done ? ' (visited)' : here ? ' (current)' : ''}`}
                >
                  {done ? '✓' : s.numeral}
                </div>
                {i < LEGS.length - 1 && <div className={`w-8 h-px ${done ? 'bg-[#ffd700]/60' : 'bg-[#2a2e34]'}`} />}
              </div>
            );
          })}
        </div>

        {!ready && (
          <div className="mt-10 w-full rounded-2xl border border-[#2a2e34]/60 bg-[#0b0e11]/60 p-8 text-center" role="status">
            <p className="text-xs tracking-[0.35em] uppercase text-[#8a8f98] animate-pulse">The river remembers…</p>
          </div>
        )}

        {ready && !complete && current && (
          <section className="relative mt-10 w-full rounded-2xl border border-[#2a2e34] bg-[#0b0e11]/80 p-8 overflow-hidden">
            <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={panelTileStyle()} />
            <div className="relative">
            <p className="text-xs tracking-[0.35em] uppercase text-[#8a8f98]">Station {current.numeral} of IV</p>
            <h2 className="mt-2 text-3xl font-light text-[#e8e4da]">{current.title}</h2>
            <p className="mt-4 text-[#a9adb5] leading-relaxed">{current.text}</p>
            <button
              onClick={enter}
              className="mt-8 w-full sm:w-auto px-10 py-4 rounded-full bg-[#ffd700] text-black
                         text-sm tracking-[0.25em] uppercase font-medium hover:bg-[#e5c65a] transition-colors
                         inline-flex items-center justify-center gap-3"
            >
              <Glyph size={15}>
                <path d="M2 20c1.6 1 3.2 1 4.8 0s3.2-1 4.8 0 3.2 1 4.8 0 3.2-1 4.6 0" />
                <path d="M4 17l1.8-7.5h12.4L20 17" />
                <path d="M12 9.5V4" />
                <path d="M12 4l3.5 3.5" />
              </Glyph>
              Enter the station
            </button>
            </div>
          </section>
        )}

        {ready && complete && (
          <section className="mt-10 w-full rounded-2xl border border-[#ffd700]/40 bg-[#0b0e11]/80 p-8">
            <h2 className="text-3xl font-light text-[#ffd700]">The Far Shore</h2>
            <p className="mt-4 text-[#a9adb5] leading-relaxed">
              The passage is complete. The river keeps the rest.
            </p>
            <button
              onClick={reset}
              className="mt-8 px-10 py-4 rounded-full border border-[#ffd700]/60 text-[#ffd700]
                         text-sm tracking-[0.25em] uppercase hover:bg-[#ffd700]/10 transition-colors
                         inline-flex items-center justify-center gap-3"
            >
              <Glyph size={14}>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </Glyph>
              Walk it again
            </button>
          </section>
        )}

        {/* free wandering */}
        <div className="mt-12 w-full">
          <p className="text-xs tracking-[0.35em] uppercase text-[#5a5f68]">Or wander freely</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {LEGS.map((s) => (
              <Link
                key={s.route}
                href={s.route}
                className="rounded-xl border border-[#2a2e34] bg-[#0b0e11]/60 px-4 py-4
                           hover:border-[#ffd700]/50 transition-colors text-left"
              >
                <p className="text-xs tracking-[0.3em] text-[#8a8f98]">{s.numeral}</p>
                <p className="mt-1 text-[#e8e4da]">{s.title}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Client-side nav: keeps the root layout — and the radio — alive. */}
        <Link href="/" className="mt-12 text-sm text-[#5a5f68] hover:text-[#8a8f98] tracking-widest uppercase">
          ← Return to the hub
        </Link>
      </div>
    </main>
  );
}
