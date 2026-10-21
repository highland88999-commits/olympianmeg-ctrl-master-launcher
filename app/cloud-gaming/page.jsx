// app/cloud-gaming/page.jsx
// MOUNT OLYMPUS · CLOUD GAMING — the honest cloud-gaming aggregator.
// Olympus hosts the library; the giant games themselves LAUNCH full-screen
// on the cloud services' own sites (Xbox Cloud, GeForce NOW, Luna), where
// the player signs in with their own account. Those services block framing,
// so there are deliberately NO iframes here — every cloud tile is a plain
// top-level link. Olympus's own games (Shelf 1) play right here as always.
import Link from 'next/link';
import { BackButton } from '@/components/ui';
import { SATELLITES } from '@/lib/i18n/satellites';
import en from '@/lib/i18n/locales/en.json';

export const metadata = {
  title: 'Mount Olympus · Cloud Gaming — Olympus',
  description:
    'Your phone is the window. The cloud is the machine. Play Olympus games here, and launch the giant cloud games full-screen from Mount Olympus.',
};

// Shelf 1 — Olympus's own games, in the order we feature them. Routes come
// from the satellite registry (the same source the hub menu reads); titles
// and subtitles come from the en dictionary the menu renders. A key missing
// from the registry is skipped rather than rendered broken.
const FEATURED_KEYS = [
  'neon-void',
  'tetrus',
  'swamp-run',
  'tidal-rush',
  'enyo',
  'kombat',
  'hawkins',
  'chess',
  'battleship',
  'neon-racer',
  'raptor-rush',
  'colosseum',
];

// Typographic/CSS card art per game — gradients + a glyph, no hotlinked art.
const GAME_ART = {
  'neon-void': { glyph: '🌀', gradient: 'linear-gradient(135deg, #7c3aed, #1e1065)' },
  tetrus: { glyph: '🔷', gradient: 'linear-gradient(135deg, #0ea5e9, #0c2436)' },
  'swamp-run': { glyph: '🐊', gradient: 'linear-gradient(135deg, #16a34a, #052e16)' },
  'tidal-rush': { glyph: '🌊', gradient: 'linear-gradient(135deg, #0284c7, #082f49)' },
  enyo: { glyph: '🎯', gradient: 'linear-gradient(135deg, #dc2626, #450a0a)' },
  kombat: { glyph: '🥊', gradient: 'linear-gradient(135deg, #ea580c, #431407)' },
  hawkins: { glyph: '🔦', gradient: 'linear-gradient(135deg, #334155, #020617)' },
  chess: { glyph: '♟️', gradient: 'linear-gradient(135deg, #6366f1, #1e1b4b)' },
  battleship: { glyph: '🚢', gradient: 'linear-gradient(135deg, #0891b2, #083344)' },
  'neon-racer': { glyph: '🏎️', gradient: 'linear-gradient(135deg, #db2777, #500724)' },
  'raptor-rush': { glyph: '🦖', gradient: 'linear-gradient(135deg, #ca8a04, #422006)' },
  colosseum: { glyph: '🏛️', gradient: 'linear-gradient(135deg, #b45309, #451a03)' },
};

// Shelf 2 — the Cloud Gods. Plain top-level external links ONLY: the games
// open full-screen on each service's own site, on their own accounts.
const SERVICES = [
  {
    name: 'Xbox Cloud Gaming',
    url: 'https://www.xbox.com/play',
    note: 'Streams Xbox games · needs Game Pass Ultimate',
    chips: ['Halo Infinite', 'Forza Horizon 5', 'Fortnite'],
    gradient: 'linear-gradient(135deg, #107c10, #052e05)',
    accent: '#7ed957',
  },
  {
    name: 'NVIDIA GeForce NOW',
    url: 'https://play.geforcenow.com',
    note: 'Streams the PC games you own · free tier available',
    chips: ['Cyberpunk 2077', "Baldur's Gate 3", 'Fortnite'],
    gradient: 'linear-gradient(135deg, #76b900, #1a2e00)',
    accent: '#b8e62e',
  },
  {
    name: 'Amazon Luna',
    url: 'https://luna.amazon.com',
    note: 'Streams with Prime or Luna+',
    chips: ['Fortnite', "Assassin's Creed", 'Jackbox Games'],
    gradient: 'linear-gradient(135deg, #4f46e5, #131044)',
    accent: '#a5b4fc',
  },
];

const PAGE_BG =
  'radial-gradient(1200px 600px at 50% -10%, rgba(124,58,237,0.28), transparent 60%),' +
  'radial-gradient(900px 520px at 88% 18%, rgba(14,165,233,0.16), transparent 60%),' +
  'radial-gradient(700px 500px at 8% 55%, rgba(16,124,16,0.12), transparent 60%),' +
  'linear-gradient(#05070f, #0a0f1c)';

function featuredGames() {
  const byKey = new Map(SATELLITES.map((s) => [s.key, s]));
  return FEATURED_KEYS.map((key) => {
    const sat = byKey.get(key);
    if (!sat) return null;
    return {
      key,
      route: sat.route,
      title: en[`sat.${key}.title`] || key,
      subtitle: en[`sat.${key}.subtitle`] || '',
      art: GAME_ART[key] || { glyph: '🎮', gradient: 'linear-gradient(135deg, #475569, #0f172a)' },
    };
  }).filter(Boolean);
}

export default function CloudGamingPage() {
  const games = featuredGames();
  return (
    <div className="min-h-dvh text-slate-100" style={{ background: PAGE_BG }}>
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6">
        <BackButton />

        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className="mt-6 text-center">
          <p className="font-['Orbitron'] text-xs font-bold uppercase tracking-[0.45em] text-cyan-300">
            ⛰ Mount Olympus
          </p>
          <h1 className="mt-3 font-['Orbitron'] text-5xl font-black uppercase tracking-wide text-white sm:text-6xl">
            Cloud Gaming
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-xl font-semibold text-slate-100 sm:text-2xl">
            Your phone is the window. The cloud is the machine.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
            Some games are too big for a phone. They run on giant computers far away, and the
            picture streams back to you — so you can play them right here, on any screen.
          </p>
        </header>

        {/* ── Shelf 1: Play here in Olympus ───────────────────── */}
        <section className="mt-14">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-['Orbitron'] text-lg font-bold uppercase tracking-[0.25em] text-white">
              🎮 Play here in Olympus
            </h2>
            <span className="hidden text-sm text-slate-400 sm:block">
              No downloads. No installs. Just play.
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
            {games.map((g) => (
              <Link
                key={g.key}
                href={g.route}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/40 transition hover:border-cyan-300/40 hover:bg-white/[0.06]"
              >
                <div
                  className="flex h-24 items-center justify-center sm:h-28"
                  style={{ background: g.art.gradient }}
                >
                  <span className="text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition group-hover:scale-110 sm:text-6xl">
                    {g.art.glyph}
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-['Orbitron'] text-base font-bold text-white sm:text-lg">
                    {g.title}
                  </p>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-300">{g.subtitle}</p>
                  <p className="mt-3 text-sm font-bold uppercase tracking-wider text-cyan-300">
                    Play in Olympus →
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Shelf 2: The Cloud Gods ──────────────────────────── */}
        <section className="mt-16">
          <h2 className="font-['Orbitron'] text-lg font-bold uppercase tracking-[0.25em] text-white">
            ☁️ The Cloud Gods
          </h2>
          <p className="mt-2 max-w-3xl text-base text-slate-300">
            The biggest games on Earth, streamed from the gods' own machines.
          </p>

          <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-base leading-relaxed text-amber-100">
            🔑 These open on the service's own site, full-screen. You sign in there with your
            own account — <strong>Olympus never sees that password.</strong> The games run on
            their cloud computers, not ours.
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {SERVICES.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/40 transition hover:border-white/30 hover:bg-white/[0.06]"
              >
                <div
                  className="flex h-28 items-center justify-center px-4 sm:h-32"
                  style={{ background: s.gradient }}
                >
                  <span className="text-center font-['Orbitron'] text-2xl font-black uppercase leading-tight tracking-wide text-white drop-shadow-[0_4px_14px_rgba(0,0,0,0.7)] sm:text-3xl">
                    {s.name}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-sm leading-relaxed text-slate-300">{s.note}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-slate-200"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  <p
                    className="mt-4 text-sm font-bold uppercase tracking-wider"
                    style={{ color: s.accent }}
                  >
                    Launch ↗
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section className="mt-16">
          <h2 className="font-['Orbitron'] text-lg font-bold uppercase tracking-[0.25em] text-white">
            How it works
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              { n: '1', text: 'Pick a game.' },
              { n: '2', text: 'It launches on a cloud computer far away.' },
              { n: '3', text: 'You play it here — on any screen.' },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center"
              >
                <p className="font-['Orbitron'] text-4xl font-black text-cyan-300">{step.n}</p>
                <p className="mt-2 text-base font-semibold text-slate-100">{step.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-base text-slate-200">
            🎮 Bluetooth controllers (Xbox, PlayStation) work with these services — pair one
            with your phone and play like a console.
          </p>
        </section>
      </div>
    </div>
  );
}
