'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEGS, STORAGE_KEY, sanitizeLeg, advanceLeg, isComplete, stationUrl } from '@/lib/styx/journey';

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
      <div className="w-full max-w-xl flex flex-col items-center text-center">
        <p className="text-xs tracking-[0.4em] uppercase text-[#8a8f98]">A passage in four stations</p>
        <h1 className="mt-3 text-5xl font-light tracking-[0.25em] text-[#ffd700]">STYX</h1>
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

        {ready && !complete && current && (
          <section className="mt-10 w-full rounded-2xl border border-[#2a2e34] bg-[#0b0e11]/80 p-8">
            <p className="text-xs tracking-[0.35em] uppercase text-[#8a8f98]">Station {current.numeral} of IV</p>
            <h2 className="mt-2 text-3xl font-light text-[#e8e4da]">{current.title}</h2>
            <p className="mt-4 text-[#a9adb5] leading-relaxed">{current.text}</p>
            <button
              onClick={enter}
              className="mt-8 w-full sm:w-auto px-10 py-4 rounded-full bg-[#ffd700] text-black
                         text-sm tracking-[0.25em] uppercase font-medium hover:bg-[#e5c65a] transition-colors"
            >
              Enter the station →
            </button>
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
                         text-sm tracking-[0.25em] uppercase hover:bg-[#ffd700]/10 transition-colors"
            >
              Walk it again
            </button>
          </section>
        )}

        {/* free wandering */}
        <div className="mt-12 w-full">
          <p className="text-xs tracking-[0.35em] uppercase text-[#5a5f68]">Or wander freely</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {LEGS.map((s) => (
              <a
                key={s.route}
                href={s.route}
                className="rounded-xl border border-[#2a2e34] bg-[#0b0e11]/60 px-4 py-4
                           hover:border-[#ffd700]/50 transition-colors text-left"
              >
                <p className="text-xs tracking-[0.3em] text-[#8a8f98]">{s.numeral}</p>
                <p className="mt-1 text-[#e8e4da]">{s.title}</p>
              </a>
            ))}
          </div>
        </div>

        <a href="/" className="mt-12 text-sm text-[#5a5f68] hover:text-[#8a8f98] tracking-widest uppercase">
          ← Return to the hub
        </a>
      </div>
    </main>
  );
}
