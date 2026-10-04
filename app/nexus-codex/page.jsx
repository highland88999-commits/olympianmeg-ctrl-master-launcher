'use client';

import { useEffect, useMemo, useState } from 'react';
import { splitChapters, bookStats } from './lib/codex.js';

const NOISE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.72 0 0 0 0 0.42 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E";

function Glyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}

const IC = {
  trash: <><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></>,
  book: <><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19a2 2 0 0 0 2 2h13" /></>,
};

// Nexus Codex — Artifact Writer (Publisher Engine).
// Distinct from the Alexandria archive READER: this is the writing side.
// You draft a manuscript; the Codex renders it live as a paged artifact.
// Everything happens in this page. No accounts, no cloud, no telemetry.

const DEFAULT_MANUSCRIPT = `The Survivor's Playbook
A field manual for the ones who rebuild.

Chapter One — First Light

Every ending is a beginning wearing a disguise. The first thing you learn when the lights go out is which lights were yours all along.

Pack light. Keep the tools that matter: a good blade, a better plan, and the kind of friends who show up when it counts.

Chapter Two — The Long Walk

Move with purpose. Rest without guilt. The road respects the traveler who respects the road.

Write things down. Memory is a faithful dog until the day it runs off with your secrets.`;

export default function NexusCodexPage() {
  const [title, setTitle] = useState("The Survivor's Playbook");
  const [author, setAuthor] = useState('');
  const [manuscript, setManuscript] = useState(DEFAULT_MANUSCRIPT);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (e) => setReduceMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const chapters = useMemo(() => splitChapters(manuscript), [manuscript]);
  const stats = useMemo(() => bookStats(title, author, manuscript), [title, author, manuscript]);
  const displayAuthor = author.trim() || 'Anonymous';

  const scrollToPage = (idx) => {
    const el = document.getElementById(`codex-page-${idx}`);
    if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  };

  return (
    <main style={styles.page}>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'url(/images/nexus-codex/codex-bg.webp)', backgroundSize: 'cover',
        backgroundPosition: 'center', opacity: 0.3 }} />
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(5,3,2,0.75) 0%, rgba(5,3,2,0.45) 40%, rgba(5,3,2,0.9) 100%)' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .codex-carousel { scroll-snap-type: x mandatory; scroll-behavior: ${reduceMotion ? 'auto' : 'smooth'}; }
        .codex-page { scroll-snap-align: start; }
        @media (prefers-reduced-motion: reduce) { .codex-carousel { scroll-behavior: auto; } }
        @media (max-width: 900px) {
          .codex-layout { flex-direction: column !important; }
          .codex-editor, .codex-preview { width: 100% !important; max-height: none !important; }
          .codex-preview { height: 70vh !important; }
        }
      `}</style>

      <header style={{ ...styles.header, position: 'relative', overflow: 'hidden', borderRadius: 12, padding: '36px 16px',
        backgroundImage: 'url(/images/nexus-codex/codex-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center 30%',
        border: '1px solid rgba(249,115,22,0.25)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(5,3,2,0.55) 0%, rgba(5,3,2,0.9) 100%)' }} />
        <div style={{ position: 'relative' }}>
        <p style={styles.kicker}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Glyph size={16}>{IC.book}</Glyph>Nexus Codex</span></p>
        <h1 style={styles.h1}>Artifact Writer</h1>
        <p style={styles.sub}>
          Draft a manuscript on the left; the Codex binds it into a paged artifact on the right.
          Everything stays on this device — no accounts, no cloud, nothing leaves the page.
        </p>
        </div>
      </header>

      <div className="codex-layout" style={styles.layout}>
        {/* Editor */}
        <section className="codex-editor" style={styles.editor} aria-label="Manuscript editor">
          <div style={styles.field}>
            <label style={styles.label} htmlFor="cx-title">Manuscript title</label>
            <input id="cx-title" style={styles.input} value={title} maxLength={120}
              onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Survivor's Playbook" />
          </div>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="cx-author">Author</label>
            <input id="cx-author" style={styles.input} value={author} maxLength={80}
              onChange={(e) => setAuthor(e.target.value)} placeholder="Your name (optional)" />
          </div>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="cx-body">Manuscript — blank lines start a new page</label>
            <textarea id="cx-body" style={styles.textarea} value={manuscript}
              onChange={(e) => setManuscript(e.target.value)}
              placeholder="Start typing. Leave a blank line between chapters to paginate." />
          </div>
          <div style={styles.stats} role="status" aria-live="polite">
            <span><strong>{stats.chapters}</strong> pages</span>
            <span><strong>{stats.words}</strong> words</span>
            <span><strong>{stats.pages}</strong> print pages</span>
          </div>
          <div style={styles.pageNav}>
            {chapters.map((_, i) => (
              <button key={i} type="button" style={styles.pageBtn} onClick={() => scrollToPage(i + 1)}
                aria-label={`Go to page ${i + 1}`}>{i + 1}</button>
            ))}
          </div>
        </section>

        {/* Live artifact preview */}
        <section className="codex-preview" style={styles.previewWrap} aria-label="Live artifact preview">
          <div className="codex-carousel" style={styles.carousel}>
            {/* Cover page */}
            <div className="codex-page" id="codex-page-0" style={{ ...styles.page, ...styles.cover }}>
              <p style={styles.coverKicker}>Nexus Codex Artifact</p>
              <h2 style={styles.coverTitle}>{stats.title}</h2>
              <p style={styles.coverAuthor}>{displayAuthor}</p>
              <p style={styles.coverMeta}>{stats.chapters} {stats.chapters === 1 ? 'page' : 'pages'} · bound locally</p>
            </div>
            {chapters.map((chapter, i) => (
              <article className="codex-page" id={`codex-page-${i + 1}`} key={i} style={styles.page}>
                <div style={styles.pageInner}>
                  <p style={styles.pageNum}>Page {i + 1} of {chapters.length}</p>
                  <p style={styles.chapterText}>{chapter}</p>
                  <footer style={styles.pageFooter}>NEXUS CODEX · {stats.title.toUpperCase()}</footer>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer style={styles.footer}>
        <p>The Artifact Writer is the authoring side of the Codex — the Alexandria module is the reader.
        Works offline. Clear the manuscript to start blank.</p>
        <button type="button" style={{ ...styles.clearBtn, display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
          onClick={() => { setTitle(''); setAuthor(''); setManuscript(''); }}>
          <Glyph>{IC.trash}</Glyph>Clear manuscript
        </button>
      </footer>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100dvh', background: '#050507', color: '#E0E0E0',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    padding: '24px 16px 48px', boxSizing: 'border-box',
  },
  header: { maxWidth: '1100px', margin: '0 auto 20px', textAlign: 'center' },
  kicker: { letterSpacing: '6px', textTransform: 'uppercase', color: '#ffd700', fontSize: '12px', margin: '0 0 8px' },
  h1: { fontSize: 'clamp(1.8rem, 5vw, 3rem)', margin: '0 0 10px', letterSpacing: '3px', color: '#fff' },
  sub: { color: '#9aa', fontSize: '0.95rem', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 },
  layout: { display: 'flex', gap: '16px', maxWidth: '1100px', margin: '0 auto', alignItems: 'stretch' },
  editor: {
    width: '380px', flexShrink: 0, backgroundColor: 'rgba(16,12,8,0.92)',
    backgroundImage: `url("${NOISE}")`, backgroundSize: '140px 140px',
    border: '1px solid rgba(249,115,22,0.28)',
    borderRadius: '10px', padding: '18px', maxHeight: '78vh', overflowY: 'auto', boxSizing: 'border-box',
  },
  previewWrap: { flexGrow: 1, minWidth: 0, height: '78vh' },
  carousel: {
    display: 'flex', width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden',
    border: '1px solid rgba(255,215,0,0.22)', borderRadius: '10px', background: '#08080c',
  },
  page: { minWidth: '100%', height: '100%', display: 'flex', justifyContent: 'center', overflowY: 'auto', padding: '40px 24px', boxSizing: 'border-box' },
  cover: { flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'radial-gradient(ellipse at center, rgba(255,180,80,0.10), #050507 70%)' },
  coverKicker: { letterSpacing: '4px', color: '#ffd700', fontSize: '11px', textTransform: 'uppercase' },
  coverTitle: { fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', color: '#fff', margin: '16px 0', letterSpacing: '2px', lineHeight: 1.2 },
  coverAuthor: { letterSpacing: '5px', textTransform: 'uppercase', color: '#ffb066', fontSize: '1rem' },
  coverMeta: { color: '#777', fontSize: '0.8rem', marginTop: '24px' },
  pageInner: { maxWidth: '560px', width: '100%', margin: 'auto', backgroundColor: 'rgba(16,12,8,0.92)',
    backgroundImage: `url("${NOISE}")`, backgroundSize: '140px 140px',
    border: '1px solid rgba(249,115,22,0.18)', borderRadius: '8px', padding: '40px 32px', boxSizing: 'border-box' },
  pageNum: { textAlign: 'center', color: '#666', fontSize: '0.72rem', letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 24px' },
  chapterText: { whiteSpace: 'pre-wrap', lineHeight: 1.9, color: '#ddd', fontSize: '1.05rem', margin: 0 },
  pageFooter: { marginTop: '40px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center', color: '#666', fontSize: '0.68rem', letterSpacing: '3px' },
  field: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginBottom: '6px' },
  input: { width: '100%', background: '#000', border: '1px solid #333', color: '#ffcf87', borderRadius: '6px', padding: '12px', fontSize: '0.95rem', minHeight: '44px', boxSizing: 'border-box', fontFamily: 'inherit' },
  textarea: { width: '100%', background: '#000', border: '1px solid #333', color: '#ddd', borderRadius: '6px', padding: '12px', fontSize: '0.9rem', minHeight: '320px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 },
  stats: { display: 'flex', gap: '18px', fontSize: '0.82rem', color: '#999', margin: '12px 0' },
  pageNav: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  pageBtn: { minWidth: '44px', minHeight: '44px', border: '1px solid rgba(249,115,22,0.45)', background: 'transparent', color: '#fdba74', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' },
  footer: { maxWidth: '1100px', margin: '24px auto 0', textAlign: 'center', color: '#777', fontSize: '0.82rem', lineHeight: 1.6 },
  clearBtn: { marginTop: '12px', minHeight: '44px', padding: '10px 24px', background: 'transparent', border: '1px solid #f97316', color: '#fdba74', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' },
};
