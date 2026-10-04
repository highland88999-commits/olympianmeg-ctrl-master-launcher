'use client';

/*
 * TOOLS — the command deck.
 *
 * Hub + index for the launcher's work instruments: the things Merlin picks
 * up to do actual work (code, shell, writing, money, files, calls, security).
 * This is hub + registry work only — every tool route keeps working as-is.
 *
 * Navigation: the deck defines launchPocketUniverse(route, targetPos) with
 * the same signature as the main launcher's navigator. The launcher's
 * version performs the cinematic black-hole dive to the constellation's
 * 3D position; from a module page the established pattern is a direct
 * route push (see app/babel/page.jsx), so this deck resolves each tool's
 * target position from the shared registry and pushes the route.
 *
 * Zero external requests. System fonts only. Glow stays localized
 * (lighting rule). Plain English throughout.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/ui';
import { SATELLITES } from '@/lib/i18n/satellites';

/* ------------------------------------------------------------------ */
/* The deck's instrument list. Order + grouping is deck-only; the      */
/* registry (lib/i18n/satellites.ts) is the source of truth for        */
/* routes, sections, and constellation positions.                      */
/* ------------------------------------------------------------------ */

const GROUPS = [
  {
    id: 'navigate',
    name: 'Navigate',
    blurb: 'Find your way around the universe.',
    keys: ['prime'],
  },
  {
    id: 'build',
    name: 'Build',
    blurb: 'Code, shell, and machines.',
    keys: ['forge', 'terminal', 'holoframe', 'nexus-model-generation'],
  },
  {
    id: 'write',
    name: 'Write',
    blurb: 'Words, from drafts to finished work.',
    keys: ['manuscript-forge', 'nexus-codex', 'resume'],
  },
  {
    id: 'organize',
    name: 'Organize',
    blurb: 'Money, mandates, and your network.',
    keys: ['plutus', 'merlin-mandates', 'cerberus'],
  },
  {
    id: 'connect',
    name: 'Connect & Guard',
    blurb: 'Reach people and watch your back.',
    keys: ['phone-home', 'fortress-of-solitude', 'ares', 'hephaestus'],
  },
];

const DESCRIPTIONS = {  'prime': 'A zoomable star chart of every destination here — pan, dive in, tap a star, and travel.',
  'forge': 'Write and edit code in your browser, with tabs and syntax highlighting.',
  'terminal': 'A command shell on a virtual machine — files, folders, and themes.',
  'holoframe': 'Your shell spread across up to eight holographic monitors.',
  'nexus-model-generation': 'Describe a shape in words and get a 3D model, made on this device.',
  'manuscript-forge': 'Write books chapter by chapter, then export to text, Markdown, or HTML.',
  'nexus-codex': 'Draft a manuscript and watch it take shape as a finished artifact.',
  'resume': 'Build a clean resume from a template — edit, preview, and export.',
  'plutus': 'Track income, spending, budgets, and goals. Your numbers stay on this device.',
  'merlin-mandates': 'A personal ledger for your own mandates and directives.',
  'cerberus': 'Keep your web nodes organized on a living 3D map.',
  'phone-home': 'Voice and video calls plus messaging, from your browser.',
  'fortress-of-solitude': 'Your private 3D vault for files and media.',
  'ares': 'Watch over your apps — threats, probes, and unwanted visitors.',
  'hephaestus': 'The mission forge — commissions, ideas, and the factory loop.',
};

function Glyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}

const IC = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  arrow: <path d="M5 12h14m0 0l-6-6m6 6l-6 6" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  hammer: <><path d="M11 7l7 7" /><path d="M9 5l6 6-2.5 2.5-6-6z" /><path d="M4 20l4.5-4.5" /></>,
  pen: <path d="M17 3l4 4L8 20l-5 1 1-5z" />,
  box: <><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
};

const GROUP_ICONS = {
  navigate: IC.compass,
  build: IC.hammer,
  write: IC.pen,
  organize: IC.box,
  connect: IC.shield,
};

const CSS = `
.tools-root { min-height: 100dvh; background: #050507; color: #f4f4f5;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --tools-noise: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.72 0 0 0 0 0.42 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); }
.tools-still { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
.tools-still img { width: 100%; height: 100%; object-fit: cover; opacity: 0.16; }
.tools-scrim { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(5,4,3,0.6) 0%, rgba(5,4,3,0.3) 40%, rgba(5,4,3,0.75) 100%); }
.tools-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 40% at 50% -5%, rgba(251,146,60,0.06), transparent 70%),
    linear-gradient(rgba(251,146,60,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(251,146,60,0.025) 1px, transparent 1px);
  background-size: auto, 48px 48px, 48px 48px; }
.tools-wrap { position: relative; z-index: 1; max-width: 1120px; margin: 0 auto;
  padding: 28px 16px 72px; }
.tools-top { display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 20px; }
.tools-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
  padding: 10px 16px; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px;
  color: #d4d4d8; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; background: rgba(255,255,255,0.02); cursor: pointer; }
.tools-back:hover { border-color: rgba(251,146,60,0.5); color: #fff; }
.tools-back:focus-visible { outline: 2px solid #fb923c; outline-offset: 2px; }
.tools-count { font-size: 0.75rem; letter-spacing: 0.2em; text-transform: uppercase;
  color: #71717a; }
.tools-head { text-align: center; margin: 8px 0 26px; position: relative; padding: 34px 16px; }
.tools-hero { position: absolute; inset: 0; z-index: -1; overflow: hidden; border-radius: 18px;
  border: 1px solid rgba(251,146,60,0.22); }
.tools-hero img { width: 100%; height: 100%; object-fit: cover; opacity: 0.4; }
.tools-hero::after { content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(5,4,3,0.55) 0%, rgba(5,4,3,0.88) 100%); }
.tools-head h1 { margin: 0; font-size: clamp(2.4rem, 8vw, 4.5rem); font-weight: 900;
  letter-spacing: 0.28em; color: #fff; text-indent: 0.28em; position: relative; }
.tools-head h1 .tools-accent { color: #fdba74;
  text-shadow: 0 0 18px rgba(251,146,60,0.35); }
.tools-head p { margin: 12px auto 0; max-width: 560px; color: #a1a1aa;
  font-size: clamp(0.95rem, 2.6vw, 1.1rem); line-height: 1.6; }
.tools-filter-wrap { position: relative; width: 100%; max-width: 440px; margin: 0 auto 34px; }
.tools-filter-ic { position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
  color: #a16207; display: inline-flex; pointer-events: none; }
.tools-filter { display: block; width: 100%;
  background: rgba(0,0,0,0.5); border: 1px solid rgba(251,146,60,0.25); color: #fff;
  padding: 14px 18px 14px 44px; font-size: 1rem; border-radius: 12px; }
.tools-filter::placeholder { color: #52525b; }
.tools-filter:focus { outline: none; border-color: rgba(251,146,60,0.7);
  box-shadow: 0 0 0 1px rgba(251,146,60,0.4), 0 0 18px rgba(251,146,60,0.12); }
.tools-group { margin-bottom: 36px; }
.tools-group-head { display: flex; align-items: baseline; gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px;
  margin-bottom: 16px; }
.tools-group-head h2 { margin: 0; font-size: 0.8rem; font-weight: 800;
  letter-spacing: 0.3em; text-transform: uppercase; color: #fdba74; }
.tools-group-head span { font-size: 0.85rem; color: #71717a; }
.tools-grid { display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.tools-card { text-align: left; min-height: 132px; padding: 18px; cursor: pointer;
  background-color: rgba(10,10,14,0.85); background-image: var(--tools-noise); background-size: 140px 140px;
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 14px; color: inherit; display: flex; flex-direction: column; gap: 8px;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s; }
.tools-card:hover { border-color: rgba(251,146,60,0.55); transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0,0,0,0.5), 0 0 22px rgba(251,146,60,0.10); }
.tools-card:focus-visible { outline: 2px solid #fb923c; outline-offset: 2px; }
.tools-card h3 { margin: 0; font-size: 1.02rem; font-weight: 800;
  letter-spacing: 0.12em; text-transform: uppercase; color: #fff; }
.tools-card p { margin: 0; font-size: 0.9rem; line-height: 1.55; color: #a1a1aa;
  flex: 1; }
.tools-card .tools-route { font-size: 0.7rem; letter-spacing: 0.18em;
  text-transform: uppercase; color: #63636b; }
.tools-card .tools-launch { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.22em;
  text-transform: uppercase; color: #fdba74; display: inline-flex; align-items: center; gap: 6px; }
.tools-glyph { color: #fb923c; display: inline-flex; margin-bottom: 2px; }
.tools-empty { text-align: center; color: #71717a; padding: 48px 16px;
  font-size: 1rem; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.tools-empty-ic { color: #a16207; display: inline-flex; }
.tools-empty { text-align: center; color: #71717a; padding: 48px 16px;
  font-size: 1rem; }
.tools-foot { text-align: center; margin-top: 44px; color: #52525b; font-size: 0.8rem;
  letter-spacing: 0.06em; line-height: 1.7; }
`;

export default function ToolsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('');

  // Same signature as the main launcher's navigator. The launcher's version
  // dives the camera to the constellation's 3D position; from the deck the
  // route push is the established module pattern. The target position is
  // resolved from the shared registry so hub and launcher never drift.
  function launchPocketUniverse(route, targetPos) {
    void targetPos;
    router.push(route);
  }

  const posOf = useMemo(() => {
    const m = {};
    for (const s of SATELLITES) m[s.route] = s.pos;
    return m;
  }, []);

  const q = filter.trim().toLowerCase();
  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        keys: g.keys.filter((k) => {
          if (!q) return true;
          const d = (DESCRIPTIONS[k] || '').toLowerCase();
          return k.toLowerCase().includes(q) || d.includes(q);
        }),
      })).filter((g) => g.keys.length > 0),
    [q]
  );

  const visibleCount = groups.reduce((n, g) => n + g.keys.length, 0);

  return (
    <div className="tools-root">
      <style>{CSS}</style>
      <div className="tools-still" aria-hidden="true"><img src="/images/tools/tools-bg.webp" alt="" /></div>
      <div className="tools-scrim" aria-hidden="true" />
      <div className="tools-bg" aria-hidden="true" />
      <div className="tools-wrap">
        <div className="tools-top">
          <BackButton label="Launcher" />
          <span className="tools-count">{visibleCount} instruments</span>
        </div>

        <header className="tools-head">
          <div className="tools-hero" aria-hidden="true"><img src="/images/tools/tools-bg.webp" alt="" /></div>
          <h1>TO<span className="tools-accent">O</span>LS</h1>
          <p>
            The workbench. Every instrument in one place — pick one up
            and get to work.
          </p>
        </header>

        <div className="tools-filter-wrap">
          <span className="tools-filter-ic"><Glyph size={16}>{IC.search}</Glyph></span>
          <input
            className="tools-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tools…"
            aria-label="Filter tools"
          />
        </div>

        {groups.length === 0 ? (
          <div className="tools-empty">
            <span className="tools-empty-ic"><Glyph size={28}>{IC.search}</Glyph></span>
            <span>No tools match “{filter}”. Try another word.</span>
          </div>
        ) : (
          groups.map((g) => (
            <section className="tools-group" key={g.id} aria-label={g.name}>
              <div className="tools-group-head">
                <h2>{g.name}</h2>
                <span>{g.blurb}</span>
              </div>
              <div className="tools-grid">
                {g.keys.map((key) => {
                  const sat = SATELLITES.find((s) => s.key === key);
                  const route = sat ? sat.route : '/' + key;
                  return (
                    <button
                      key={key}
                      className="tools-card"
                      onClick={() => launchPocketUniverse(route, posOf[route])}
                      aria-label={'Open ' + key}
                    >
                      <span className="tools-glyph"><Glyph size={22}>{GROUP_ICONS[g.id]}</Glyph></span>
                      <h3>{key.replace(/-/g, ' ')}</h3>
                      <p>{DESCRIPTIONS[key]}</p>
                      <span className="tools-route">{route}</span>
                      <span className="tools-launch">Launch <Glyph size={13}>{IC.arrow}</Glyph></span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}

        <footer className="tools-foot">
          The deck is an index — each instrument opens on its own page,
          exactly as it works from the launcher.
        </footer>
        <div aria-hidden="true" className="player-clear" />
      </div>
    </div>
  );
}
