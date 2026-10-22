// app/communiverse/page.jsx — THE COMMUNIVERSE (Merlin, 2026-10-22).
//
// The shared universe of user-created worlds. Earth is the first planet
// (built in — entering it dives to the hub's real Earth). Every other
// planet is a world a user forged in the World Engine and published from
// their Profile ("My Worlds" → Publish to Communiverse). Clicking any
// planet takes you right to it: orbit preview, then street level.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MiniViewport from '@/components/world-engine/MiniViewport';

function PlanetCard({ world, badge, href, cta }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col hover:border-cyan-300/50 transition-colors"
      aria-label={'Enter ' + world.display_name}
    >
      <div className="relative h-44 w-full bg-[#07070c]">
        <MiniViewport category="world" params={world.generation_params || {}} />
        {badge && (
          <span className="absolute top-2 left-2 text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded bg-amber-300/90 text-black font-bold">
            {badge}
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-1 flex-1">
        <p className="text-base font-bold text-neutral-100 truncate">{world.display_name}</p>
        <p className="text-xs text-neutral-500 flex-1">
          {world.is_earth
            ? 'The home world. The first planet of the Communiverse — diving in takes you to the real Earth in the hub, down to street level.'
            : 'A user-forged world. Click to drop in: orbit first, then down to street level.'}
        </p>
        <span className="mt-2 min-h-[44px] inline-flex items-center justify-center px-4 rounded-lg bg-cyan-300/90 text-black text-sm font-bold">
          {cta}
        </span>
      </div>
    </Link>
  );
}

export default function CommuniversePage() {
  const [earth, setEarth] = useState(null);
  const [worlds, setWorlds] = useState([]);
  const [state, setState] = useState('loading'); // loading | ok | error

  useEffect(() => {
    document.title = 'Communiverse';
    let cancelled = false;
    fetch('/api/communiverse')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data || data.ok === false) { setState('error'); return; }
        setEarth(data.earth || null);
        setWorlds(data.worlds || []);
        setState('ok');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-dvh bg-[#050508] text-neutral-200">
      <div className="sticky top-0 z-20 bg-[#050508]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="min-h-[44px] inline-flex items-center px-3 rounded-lg border border-white/15 text-sm text-neutral-300 hover:bg-white/10">
            ← All satellites
          </Link>
          <div className="text-right">
            <div className="text-[10px] tracking-[0.3em] uppercase text-cyan-300/80">Community universe</div>
            <h1 className="text-lg font-bold tracking-widest">COMMUNIVERSE</h1>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 pt-6 pb-12 flex flex-col gap-6">
        <p className="text-sm text-neutral-400 max-w-2xl">
          Every world users forge can live here. Earth is the first planet; each new
          planet is a world someone built and published from their profile. Click any
          planet to go right to it — orbit, then street level. Own a world? Its owner
          can reshape it any time with Muse, right from the planet or from their profile.
        </p>

        {state === 'loading' && <p className="text-sm text-neutral-500">Loading the universe…</p>}
        {state === 'error' && <p className="text-sm text-red-300">The Communiverse could not load. Try again in a moment.</p>}

        {state === 'ok' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {earth && (
                <PlanetCard world={earth} badge="First planet" href={earth.enter_href || '/?enter=earth'} cta="Dive to Earth" />
              )}
              {worlds.map((w) => (
                <PlanetCard key={w.id} world={w} href={w.enter_href} cta="Enter world" />
              ))}
            </div>
            {worlds.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm text-neutral-400">
                  No user worlds have been published yet — Earth is holding the sky alone.
                  Forge a world in the World Builder, then open{' '}
                  <Link href="/profile" className="text-cyan-300 hover:underline">your profile</Link>{' '}
                  and press <strong className="text-neutral-200">Publish to Communiverse</strong> on it
                  to put the second planet here.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
