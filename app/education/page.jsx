'use client';

// app/education/page.jsx
// The Education space: every learning option across Olympus in one place,
// with Miles' embark referral link at the top.

import { useState } from 'react';

// Miles' affiliate referral code — set to his real code once confirmed.
const MILES_REFERRAL_CODE = 'MILES';

const OPTIONS = [
  {
    route: '/olympian-education',
    title: 'Lessons',
    name: 'Olympian Education',
    desc: 'Twelve lessons across three schools: Wisdom of Athens, The Open Scrolls, and The Forge. Finish them all to earn the Olympian Scholar achievement.',
    tag: '12 lessons',
  },
  {
    route: '/alexandria',
    title: 'Archive',
    name: 'Alexandria',
    desc: 'The great archive — a library of knowledge for every curious mind.',
    tag: 'Library',
  },
  {
    route: '/playbook',
    title: 'E-Book Reader',
    name: 'Playbook',
    desc: 'Read the books that build worlds, right inside Olympus.',
    tag: 'Reading',
  },
  {
    route: '/iq-test',
    title: '3D Puzzle',
    name: 'IQ Test',
    desc: 'Test your mind in three dimensions.',
    tag: 'Challenge',
  },
  {
    route: '/meet-the-gods',
    title: 'God Guide',
    name: 'Meet the Gods',
    desc: 'Learn who rules Olympus and what each god stands for.',
    tag: 'Guide',
  },
  {
    route: '/trifold',
    title: 'News',
    name: 'News',
    desc: 'The weekly newspaper — read the multiverse every Tuesday.',
    tag: 'Weekly',
  },
];

export default function EducationSpace() {
  const [copied, setCopied] = useState(false);

  const embark = (e) => {
    e.preventDefault();
    const url = `${window.location.origin}/?ref=${encodeURIComponent(MILES_REFERRAL_CODE)}`;
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {}
    );
    window.location.href = url;
  };

  return (
    <main className="min-h-screen bg-[#050508] text-neutral-200 px-4 py-8 max-w-3xl mx-auto">
      <h1 className="text-xl font-black tracking-[0.25em] uppercase text-center">Education</h1>
      <p className="text-center text-[12px] text-neutral-500 mt-1 mb-6">
        Every way to learn in Olympus, gathered in one space.
      </p>

      {/* Miles' embark referral — pinned at the top */}
      <section aria-label="Embark with Miles" className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-5 mb-6 text-center">
        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-amber-200/90">Embark with Miles</p>
        <p className="text-[13px] text-neutral-300 mt-2 mb-4">
          New here? Create your account through Miles&apos; referral link and start your journey with the family.
        </p>
        <button
          type="button"
          onClick={embark}
          className="min-h-[48px] px-6 rounded-xl bg-amber-300/90 text-black text-sm font-black tracking-widest uppercase hover:bg-amber-200"
        >
          {copied ? 'Link copied ✓' : 'Create account'}
        </button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <a
            key={o.route}
            href={o.route}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-cyan-300/40 hover:bg-white/[0.05] transition-colors"
          >
            <span className="inline-block text-[10px] font-black tracking-[0.25em] uppercase text-cyan-300/80 border border-cyan-300/30 rounded-full px-2 py-0.5 mb-2">
              {o.tag}
            </span>
            <span className="block text-[15px] font-bold text-neutral-100">{o.name}</span>
            <span className="block text-[12px] text-neutral-400 mt-1">{o.desc}</span>
          </a>
        ))}
      </div>
    </main>
  );
}
