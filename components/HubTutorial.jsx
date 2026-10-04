// components/HubTutorial.jsx — Main-hub orientation tutorial (Merlin 2026-10-03).
//
// Clean, minimal overlay: one card at a time, dots + Next, and a prominent
// Skip. Skip and completing both dismiss permanently (the hub page persists
// hub_tutorial_seen for either). Dark styling matches the hub aesthetic.

'use client';

import { useState } from 'react';

const CARDS = [
  {
    icon: '✦',
    title: 'Welcome to the hub',
    body: 'Every pocket universe you own launches from here. This is home base.',
  },
  {
    icon: '🏛',
    title: 'God menus',
    body: 'Ten towers, ten domains — HERMES, ARES, APOLLO and more. Tap a tower to open its menu.',
  },
  {
    icon: '🛰',
    title: 'Satellites',
    body: 'Each program is a satellite orbiting the hub. Tap one to dive in.',
  },
  {
    icon: '🔍',
    title: 'Search',
    body: 'Looking for something? Search the satellite menu to find any program instantly.',
  },
  {
    icon: '👤',
    title: 'Your profile',
    body: 'Your experience is mapped to your account — your programs, your progress, on every visit.',
  },
];

export default function HubTutorial({ onDone }) {
  const [step, setStep] = useState(0);
  const last = step === CARDS.length - 1;
  const card = CARDS[step];

  const done = () => { if (onDone) onDone(); };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hub tutorial"
      className="fixed inset-0 z-[50000] flex items-center justify-center p-6 ui-element"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950/95 p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-3">
          <span aria-hidden="true" className="text-4xl">{card.icon}</span>
          <h2 className="text-lg font-bold tracking-wide text-white">{card.title}</h2>
          <p className="text-sm leading-relaxed text-zinc-400">{card.body}</p>
        </div>

        {/* Dots */}
        <div className="mt-5 flex items-center justify-center gap-2" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-cyan-400' : 'w-1.5 bg-zinc-700'}`}
            />
          ))}
        </div>

        {/* Skip is prominent and always available; Next advances. */}
        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={done}
            className="rounded-full px-4 py-2 text-sm font-semibold tracking-wide text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 active:scale-95 transition-all"
          >
            Skip
          </button>
          <button
            onClick={() => { if (last) done(); else setStep(step + 1); }}
            className="rounded-full px-6 py-2 text-sm font-bold tracking-wide text-black bg-cyan-400 hover:bg-cyan-300 active:scale-95 transition-all"
          >
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
