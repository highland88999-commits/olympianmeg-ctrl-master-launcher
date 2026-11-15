// World Engine — dashboard: pick a builder.
//
// The original dashboard hotlinked background videos from catbox.moe and had
// a dead link to a /creatures page that never existed. Both are gone: tiles
// use CSS gradients, and only real pages are listed.
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

function Glyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}

const IC = {
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  rocket: <><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M14 4c3-2 7-2 7-2s0 4-2 7l-7 7-5-5z" /><circle cx="15" cy="9" r="1.5" /></>,
  zap: <path d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  cloud: <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.5A4 4 0 0 0 7 19z" />,
  box: <><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  upload: <><path d="M12 16V4m0 0L7 9m5-5l5 5" /><path d="M4 20h16" /></>,
  sparkles: <><path d="M12 3l1.9 5.6 5.6 1.4-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /><path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  coins: <><circle cx="9" cy="9" r="6" /><path d="M14.5 5.5a6 6 0 1 1-9 9" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  back: <path d="M19 12H5m0 0l6-6m-6 6l6 6" />,
};

const MODULE_ICONS = {
  '/world-engine/architect': IC.globe,
  '/world-engine/characters': IC.user,
  '/world-engine/vehicles': IC.rocket,
  '/world-engine/weapons': IC.zap,
  '/world-engine/weather': IC.cloud,
  '/world-engine/objects': IC.box,
  '/world-engine/uplink': IC.upload,
  '/world-engine/studio': IC.sparkles,
  '/world-engine/engine': IC.cpu,
};

const MODULES = [
  { title: 'World Builder', route: '/world-engine/architect', desc: 'Generate full 3D worlds from a description', accent: '#00f0ff', graphic: '/images/world-engine/dashboard/world-builder.jpg' },
  { title: 'Character Builder', route: '/world-engine/characters', desc: 'Design characters and creatures', accent: '#ff00ff', graphic: '/images/world-engine/dashboard/character-builder.jpg' },
  { title: 'Vehicle Builder', route: '/world-engine/vehicles', desc: 'Design ground, air, and space vehicles', accent: '#ff5500', graphic: '/images/world-engine/dashboard/vehicle-builder.jpg' },
  { title: 'Weapon Builder', route: '/world-engine/weapons', desc: 'Design weapons and combat gear', accent: '#ffd700', graphic: '/images/world-engine/dashboard/weapon-builder.jpg' },
  { title: 'Weather Studio', route: '/world-engine/weather', desc: 'Dial in atmosphere, rain, snow, and storms', accent: '#0055ff', graphic: '/images/world-engine/dashboard/weather-studio.jpg' },
  { title: 'Object Builder', route: '/world-engine/objects', desc: 'Build props and set dressing', accent: '#00ffcc', graphic: '/images/world-engine/dashboard/object-builder.jpg' },
  { title: 'Asset Uplink', route: '/world-engine/uplink', desc: 'Bring in external 3D assets by URL', accent: '#00ff00', graphic: '/images/world-engine/dashboard/asset-uplink.jpg' },
  { title: 'Hologram Studio', route: '/world-engine/studio', desc: 'Design glowing text holograms and export them', accent: '#a78bfa', graphic: '/images/world-engine/dashboard/hologram-studio.jpg' },
  { title: '3D Engine', route: '/world-engine/engine', desc: 'Walk through your generated world live', accent: '#ffffff', graphic: '/images/world-engine/dashboard/engine-3d.jpg' },
];

export default function WorldEngineDashboard() {
  const router = useRouter();

  return (
    <main className="relative min-h-dvh bg-black text-white font-mono p-6 md:p-10 overflow-hidden">
      <style>{`.we-dash-still { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
.we-dash-still img { width: 100%; height: 100%; object-fit: cover; opacity: 0.2; }
.we-dash-scrim { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.88) 100%); }
.we-head { position: relative; overflow: hidden; border-radius: 14px; padding: 22px;
  border: 1px solid rgba(249,115,22,0.28);
  background-image: url(/images/world-engine/dashboard/dashboard-background.jpg); background-size: cover; background-position: center 30%; }
.we-head::after { content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(3,3,5,0.55) 0%, rgba(3,3,5,0.9) 100%); }
.we-head > * { position: relative; z-index: 1; }
.we-tile-ic { color: var(--accent); display: inline-flex; opacity: 0.92;
  filter: drop-shadow(0 0 14px currentColor); }
.we-band-tex { position: absolute; inset: 0; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 140px 140px; }
.we-link { display: inline-flex; align-items: center; gap: 8px; }`}</style>
      <div className="we-dash-still" aria-hidden="true"><img src="/images/world-engine/dashboard/dashboard-background.jpg" alt="" /></div>
      <div className="we-dash-scrim" aria-hidden="true" />
      <div className="relative z-10 max-w-6xl mx-auto flex flex-col gap-8">
        <header className="we-head flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-6">
          <div>
            <p className="text-[#ffd700] text-[10px] tracking-[0.4em] uppercase mb-2">World Engine</p>
            <h1 className="text-3xl font-bold tracking-[0.2em]">Choose a builder</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/world-engine/credits" className="we-link border border-gray-700 px-4 py-2 text-xs font-bold tracking-widest hover:border-[#f97316] hover:text-[#fdba74] transition-all">
              <Glyph size={14}>{IC.coins}</Glyph>Credits
            </Link>
            <Link href="/world-engine/settings" className="we-link border border-gray-700 px-4 py-2 text-xs font-bold tracking-widest hover:border-[#f97316] hover:text-[#fdba74] transition-all">
              <Glyph size={14}>{IC.gear}</Glyph>Settings
            </Link>
            <Link href="/" className="we-link border border-gray-700 px-4 py-2 text-xs font-bold tracking-widest hover:border-white transition-all">
              <Glyph size={14}>{IC.back}</Glyph>Launcher
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
              <div className="h-28 w-full relative flex items-center justify-center overflow-hidden">
                <img src={m.graphic} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${m.accent}26 0%, transparent 60%), radial-gradient(circle at 70% 30%, ${m.accent}33, transparent 55%), linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)`,
                  }}
                />
                <span className="we-tile-ic relative z-10"><Glyph size={40}>{MODULE_ICONS[m.route]}</Glyph></span>
                <span className="we-band-tex" aria-hidden="true" />
              </div>
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
      <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
