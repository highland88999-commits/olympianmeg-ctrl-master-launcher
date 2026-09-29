// World Engine — dashboard: pick a builder.
//
// The original dashboard hotlinked background videos from catbox.moe and had
// a dead link to a /creatures page that never existed. Both are gone: tiles
// use CSS gradients, and only real pages are listed.
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

const MODULES = [
  { title: 'World Builder', route: '/world-engine/architect', desc: 'Generate full 3D worlds from a description', accent: '#00f0ff' },
  { title: 'Character Builder', route: '/world-engine/characters', desc: 'Design characters and creatures', accent: '#ff00ff' },
  { title: 'Vehicle Builder', route: '/world-engine/vehicles', desc: 'Design ground, air, and space vehicles', accent: '#ff5500' },
  { title: 'Weapon Builder', route: '/world-engine/weapons', desc: 'Design weapons and combat gear', accent: '#ffd700' },
  { title: 'Weather Studio', route: '/world-engine/weather', desc: 'Dial in atmosphere, rain, snow, and storms', accent: '#0055ff' },
  { title: 'Object Builder', route: '/world-engine/objects', desc: 'Build props and set dressing', accent: '#00ffcc' },
  { title: 'Asset Uplink', route: '/world-engine/uplink', desc: 'Bring in external 3D assets by URL', accent: '#00ff00' },
  { title: 'Hologram Studio', route: '/world-engine/studio', desc: 'Design glowing text holograms and export them', accent: '#a78bfa' },
  { title: '3D Engine', route: '/world-engine/engine', desc: 'Walk through your generated world live', accent: '#ffffff' },
];

export default function WorldEngineDashboard() {
  const router = useRouter();

  return (
    <main className="min-h-dvh bg-black text-white font-mono p-6 md:p-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-6">
          <div>
            <p className="text-[#00f0ff] text-[10px] tracking-[0.4em] uppercase mb-2">World Engine</p>
            <h1 className="text-3xl font-bold tracking-[0.2em]">Choose a builder</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/world-engine/credits" className="border border-gray-700 px-4 py-2 text-xs font-bold tracking-widest hover:border-[#00f0ff] hover:text-[#00f0ff] transition-all">
              Credits
            </Link>
            <Link href="/world-engine/settings" className="border border-gray-700 px-4 py-2 text-xs font-bold tracking-widest hover:border-[#00f0ff] hover:text-[#00f0ff] transition-all">
              Settings
            </Link>
            <Link href="/" className="border border-gray-700 px-4 py-2 text-xs font-bold tracking-widest hover:border-white transition-all">
              &larr; Launcher
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {MODULES.map((m) => (
            <button
              key={m.route}
              onClick={() => router.push(m.route)}
              className="group text-left border border-gray-800 bg-gray-950/60 p-0 overflow-hidden transition-all hover:-translate-y-1"
              style={{ '--accent': m.accent }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = m.accent)}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = '')}
            >
              <div
                className="h-28 w-full"
                style={{
                  background: `linear-gradient(135deg, ${m.accent}26 0%, transparent 60%), radial-gradient(circle at 70% 30%, ${m.accent}33, transparent 55%), #050508`,
                }}
              />
              <div className="p-5">
                <h2 className="text-lg font-bold tracking-widest mb-1 group-hover:text-white transition-colors" style={{ color: m.accent }}>
                  {m.title}
                </h2>
                <p className="text-xs text-gray-400 leading-relaxed">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-gray-600 leading-relaxed max-w-3xl">
          Manual controls are free and never leave your browser. AI generation costs
          Aether credits (or one of your 20 free monthly generations). Everything you
          generate is saved to your personal library.
        </p>
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
