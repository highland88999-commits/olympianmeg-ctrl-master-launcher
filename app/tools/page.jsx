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
import { SATELLITES } from '@/lib/i18n/satellites';

/* ------------------------------------------------------------------ */
/* The deck's instrument list. Order + grouping is deck-only; the      */
/* registry (lib/i18n/satellites.ts) is the source of truth for        */
/* routes, sections, and constellation positions.                      */
/* ------------------------------------------------------------------ */

const GROUPS = [
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

const DESCRIPTIONS = {
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

const CSS = `
.tools-root { min-height: 100vh; background: #050507; color: #f4f4f5;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.tools-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 40% at 50% -5%, rgba(255,0,255,0.06), transparent 70%),
    linear-gradient(rgba(255,0,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,0,255,0.025) 1px, transparent 1px);
  background-size: auto, 48px 48px, 48px 48px; }
.tools-wrap { position: relative; z-index: 1; max-width: 1120px; margin: 0 auto;
  padding: 28px 16px 72px; }
.tools-top { display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 20px; }
.tools-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
  padding: 10px 16px; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px;
  color: #d4d4d8; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; background: rgba(255,255,255,0.02); cursor: pointer; }
.tools-back:hover { border-color: rgba(255,0,255,0.5); color: #fff; }
.tools-back:focus-visible { outline: 2px solid #ff00ff; outline-offset: 2px; }
.tools-count { font-size: 0.75rem; letter-spacing: 0.2em; text-transform: uppercase;
  color: #71717a; }
.tools-head { text-align: center; margin: 8px 0 26px; }
.tools-head h1 { margin: 0; font-size: clamp(2.4rem, 8vw, 4.5rem); font-weight: 900;
  letter-spacing: 0.28em; color: #fff; text-indent: 0.28em; }
.tools-head h1 .tools-accent { color: #ff7bff;
  text-shadow: 0 0 18px rgba(255,0,255,0.35); }
.tools-head p { margin: 12px auto 0; max-width: 560px; color: #a1a1aa;
  font-size: clamp(0.95rem, 2.6vw, 1.1rem); line-height: 1.6; }
.tools-filter { display: block; width: 100%; max-width: 440px; margin: 0 auto 34px;
  background: rgba(0,0,0,0.5); border: 1px solid rgba(255,0,255,0.25); color: #fff;
  padding: 14px 18px; font-size: 1rem; border-radius: 12px; }
.tools-filter::placeholder { color: #52525b; }
.tools-filter:focus { outline: none; border-color: rgba(255,0,255,0.7);
  box-shadow: 0 0 0 1px rgba(255,0,255,0.4), 0 0 18px rgba(255,0,255,0.12); }
.tools-group { margin-bottom: 36px; }
.tools-group-head { display: flex; align-items: baseline; gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px;
  margin-bottom: 16px; }
.tools-group-head h2 { margin: 0; font-size: 0.8rem; font-weight: 800;
  letter-spacing: 0.3em; text-transform: uppercase; color: #ff7bff; }
.tools-group-head span { font-size: 0.85rem; color: #71717a; }
.tools-grid { display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.tools-card { text-align: left; min-height: 132px; padding: 18px; cursor: pointer;
  background: rgba(10,10,14,0.85); border: 1px solid rgba(255,255,255,0.09);
  border-radius: 14px; color: inherit; display: flex; flex-direction: column; gap: 8px;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s; }
.tools-card:hover { border-color: rgba(255,0,255,0.55); transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0,0,0,0.5), 0 0 22px rgba(255,0,255,0.10); }
.tools-card:focus-visible { outline: 2px solid #ff00ff; outline-offset: 2px; }
.tools-card h3 { margin: 0; font-size: 1.02rem; font-weight: 800;
  letter-spacing: 0.12em; text-transform: uppercase; color: #fff; }
.tools-card p { margin: 0; font-size: 0.9rem; line-height: 1.55; color: #a1a1aa;
  flex: 1; }
.tools-card .tools-route { font-size: 0.7rem; letter-spacing: 0.18em;
  text-transform: uppercase; color: #63636b; }
.tools-card .tools-launch { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.22em;
  text-transform: uppercase; color: #ff7bff; }
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
      <div className="tools-bg" aria-hidden="true" />
      <div className="tools-wrap">
        <div className="tools-top">
          <button className="tools-back" onClick={() => router.push('/')} aria-label="Back to the launcher">
            ← Launcher
          </button>
          <span className="tools-count">{visibleCount} instruments</span>
        </div>

        <header className="tools-head">
          <h1>TO<span className="tools-accent">O</span>LS</h1>
          <p>
            The workbench. Every instrument in one place — pick one up
            and get to work.
          </p>
        </header>

        <input
          className="tools-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter tools…"
          aria-label="Filter tools"
        />

        {groups.length === 0 ? (
          <div className="tools-empty">No tools match “{filter}”. Try another word.</div>
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
                      <h3>{key.replace(/-/g, ' ')}</h3>
                      <p>{DESCRIPTIONS[key]}</p>
                      <span className="tools-route">{route}</span>
                      <span className="tools-launch">Launch →</span>
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
        <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
      </div>
    </div>
  );
}
