// app/trifold/issues/[id]/page.jsx
// Public issue viewer — no login required (acquisition funnel).
// Paginated newspaper reader: lens tabs across the top (The OG / Ruin /
// Radiant), one page visible at a time within the active lens, page
// sequences built from edition.pages when present (new model) with a
// legacy fallback (og_stories / fiction text) when not.
// 7-SECOND HONEST PREVIEW: the content is readable for 7 seconds with a
// visible countdown, then a trial offer appears. The timer is always
// visible, the trial terms are stated plainly, and the offer dismisses
// with one click ("Not now") — no guilt-trip copy, no traps. Dismissing
// leaves a compact signup prompt; the full content stays behind the trial.
// FICTION lenses always render with a FICTION badge.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  TRIFOLD_NAME,
  TRIFOLD_PRICE_LABEL,
  TRIFOLD_TRIAL_LABEL,
  TRIFOLD_TRIAL_DAYS,
  TRIFOLD_LENSES,
} from '@/lib/trifold/constants';

const PREVIEW_SECONDS = 7;
const LEGACY_CHARS_PER_PAGE = 1200;
const LENS_COLORS = { og: '#38bdf8', negative: '#f43f5e', positive: '#34d399' };

// ---- shared bits ------------------------------------------------------

function FictionBadge() {
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', background: '#f43f5e', color: '#fff', borderRadius: 4, padding: '0.2rem 0.5rem', marginLeft: '0.6rem', verticalAlign: 'middle' }}>
      FICTION
    </span>
  );
}

function TrialPanel({ onDismiss, compact }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function start(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/trifold/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Could not start checkout.');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <div style={{ border: '1px solid #7c3aed66', borderRadius: 14, padding: compact ? '1.2rem' : '2rem', background: 'linear-gradient(180deg, rgba(124,58,237,0.12), transparent), #0d1226', textAlign: 'center', margin: '1.5rem 0' }}>
      <h3 style={{ margin: '0 0 0.5rem' }}>Keep reading {TRIFOLD_NAME}</h3>
      <p style={{ color: '#9aa0b5', margin: '0 0 0.4rem', lineHeight: 1.6 }}>
        Start your <strong style={{ color: '#e8e6df' }}>{TRIFOLD_TRIAL_LABEL} trial</strong> — then {TRIFOLD_PRICE_LABEL}/month, cancel anytime.
      </p>
      <p style={{ color: '#6b7190', fontSize: '0.82rem', margin: '0 0 1rem' }}>
        Plain terms: {TRIFOLD_TRIAL_DAYS} days free, no charge during the trial, one-click cancel.
      </p>
      <form onSubmit={start} style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email for free trial"
          style={{ padding: '0.7rem 1rem', borderRadius: 10, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', minWidth: 220 }} />
        <button type="submit" disabled={busy}
          style={{ padding: '0.7rem 1.4rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Starting…' : 'Start free trial'}
        </button>
      </form>
      {error && <p style={{ color: '#fda4af', margin: '0.6rem 0 0' }}>{error}</p>}
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#6b7190', marginTop: '1rem', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.88rem' }}>
        Not now
      </button>
    </div>
  );
}

// ---- page-sequence builders --------------------------------------------
// New model: edition.pages = { og: [page], negative: [page], positive: [page] },
// page = { blocks: [block] }, block = { id, kind: 'text'|'image'|'video',
//   text?, url?, embed_url?, caption?, source? }.
// Legacy fallback used whenever edition.pages is absent or empty.

function splitTextPages(text, maxChars) {
  const out = [];
  let rest = (text || '').trim();
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n', maxChars);
    if (cut < maxChars * 0.5) cut = rest.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function buildPageSequences(edition) {
  const raw = edition && edition.pages;
  const useNewModel =
    raw && typeof raw === 'object' &&
    TRIFOLD_LENSES.some((l) => Array.isArray(raw[l.key]) && raw[l.key].length > 0);

  const seq = { og: [], negative: [], positive: [] };

  if (useNewModel) {
    for (const l of TRIFOLD_LENSES) {
      const arr = Array.isArray(raw[l.key]) ? raw[l.key] : [];
      seq[l.key] = arr.filter((p) => p && Array.isArray(p.blocks) && p.blocks.length > 0);
    }
    return seq;
  }

  // Legacy fallback: one page per OG story.
  const stories = Array.isArray(edition.og_stories) ? edition.og_stories : [];
  seq.og = stories.map((s, i) => ({
    title: s && s.title ? s.title : `Story ${i + 1}`,
    blocks: [
      ...(s && s.summary ? [{ id: `sum-${i}`, kind: 'text', text: s.summary }] : []),
      ...(s && s.link ? [{ id: `link-${i}`, kind: 'text', text: '', url: s.link, caption: 'Read the original story' }] : []),
    ],
  }));

  // Legacy fallback: fiction text split across pages.
  for (const key of ['negative', 'positive']) {
    const text = typeof edition[`${key}_fiction`] === 'string' ? edition[`${key}_fiction`] : '';
    seq[key] = splitTextPages(text, LEGACY_CHARS_PER_PAGE).map((t, i) => ({
      blocks: [{ id: `fic-${key}-${i}`, kind: 'text', text: t }],
    }));
  }
  return seq;
}

// ---- block rendering ----------------------------------------------------

function renderBlock(block, key, edition) {
  if (!block || typeof block !== 'object') return null;
  const caption = block.caption || block.source || null;

  if (block.kind === 'image' && block.url) {
    return (
      <figure key={key} style={{ margin: '0 0 1.4rem' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.url} alt={block.caption || 'Illustration'} loading="lazy"
          style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block' }} />
        {caption && <figcaption style={{ color: '#8b91a8', fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center' }}>{caption}</figcaption>}
      </figure>
    );
  }

  if (block.kind === 'video' && (block.url || block.embed_url)) {
    return (
      <figure key={key} style={{ margin: '0 0 1.4rem' }}>
        {block.url ? (
          <video src={block.url} controls playsInline preload="metadata"
            style={{ width: '100%', borderRadius: 10, background: '#000' }} />
        ) : (
          <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
            <iframe src={block.embed_url} title={block.caption || 'Video'} allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
          </div>
        )}
        {caption && <figcaption style={{ color: '#8b91a8', fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center' }}>{caption}</figcaption>}
      </figure>
    );
  }

  // text (default)
  if (block.url && !block.text) {
    // link-only legacy text block (OG story "read original")
    return (
      <p key={key} style={{ margin: '0 0 1rem' }}>
        <a href={block.url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontSize: '0.9rem' }}>
          {block.caption || `Read at ${edition?.newspaper_name || 'the original'} →`}
        </a>
      </p>
    );
  }
  if (!block.text) return null;
  return (
    <div key={key} style={{
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '1.05rem', lineHeight: 1.75, color: '#dfe3ee',
      whiteSpace: 'pre-wrap', margin: '0 0 1.2rem',
    }}>
      {block.text}
    </div>
  );
}

// ---- main --------------------------------------------------------------

export default function IssueViewer({ params }) {
  const id = params?.id;
  const [edition, setEdition] = useState(null);
  const [missing, setMissing] = useState(false);
  const [lens, setLens] = useState('og');
  const [pageIndex, setPageIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PREVIEW_SECONDS);
  const [locked, setLocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    fetch(`/api/trifold/editions/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setEdition(d.edition); else setMissing(true); })
      .catch(() => setMissing(true));
  }, [id]);

  useEffect(() => {
    timer.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer.current);
          setLocked(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, []);

  const sequences = useMemo(() => (edition ? buildPageSequences(edition) : null), [edition]);
  const pages = sequences ? sequences[lens] : [];
  const pageCount = pages.length;
  const page = pages[pageIndex] || null;

  // Reset to first page whenever the lens changes.
  useEffect(() => { setPageIndex(0); }, [lens]);

  // Keyboard navigation (left/right arrows) while unlocked.
  useEffect(() => {
    if (locked || pageCount < 2) return;
    function onKey(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') setPageIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setPageIndex((i) => Math.min(pageCount - 1, i + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, pageCount]);

  if (missing) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.25rem', color: '#e8e6df', textAlign: 'center' }}>
        <h1>Issue not found</h1>
        <p style={{ color: '#8b91a8' }}>It may still be in draft. <Link href="/trifold/archive" style={{ color: '#a78bfa' }}>Browse the archive →</Link></p>
      </main>
    );
  }
  if (!edition) {
    return <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.25rem', color: '#8b91a8' }}>Loading…</main>;
  }

  const activeLens = TRIFOLD_LENSES.find((l) => l.key === lens) || TRIFOLD_LENSES[0];

  const navBtn = (disabled) => ({
    padding: '0.6rem 1.1rem', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
    border: '1px solid #2a3352', background: disabled ? '#0d1226' : '#1a2138',
    color: disabled ? '#4b5170' : '#e8e6df', fontWeight: 700, fontSize: '0.9rem',
    opacity: disabled ? 0.6 : 1,
  });

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1.25rem 4rem', color: '#e8e6df' }}>
      <p style={{ color: '#a78bfa', fontSize: '0.8rem', letterSpacing: '0.2em', margin: '0 0 0.4rem' }}>
        {TRIFOLD_NAME} · ISSUE #{edition.issue_number ?? '—'}
      </p>
      <h1 style={{ margin: '0 0 0.3rem' }}>{edition.newspaper_name}</h1>
      <p style={{ color: '#8b91a8', margin: '0 0 1.4rem' }}>
        {edition.newspaper_region} · Week {edition.week_number}
        {edition.newspaper_url && <> · <a href={edition.newspaper_url} target="_blank" rel="noreferrer" style={{ color: '#a78bfa' }}>original paper</a></>}
      </p>

      {/* Preview honesty: always-visible countdown */}
      {!locked && (
        <div style={{ display: 'inline-block', fontSize: '0.8rem', color: '#0b0e1a', background: '#fbbf24', fontWeight: 700, borderRadius: 20, padding: '0.3rem 0.8rem', marginBottom: '1rem' }}>
          Free preview · {secondsLeft}s
        </div>
      )}

      {/* Lens tabs */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.4rem', flexWrap: 'wrap' }}>
        {TRIFOLD_LENSES.map((t) => {
          const color = LENS_COLORS[t.key] || '#9aa0b5';
          return (
            <button key={t.key} onClick={() => setLens(t.key)}
              style={{
                padding: '0.6rem 1.2rem', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${lens === t.key ? color : '#2a3352'}`,
                background: lens === t.key ? `${color}22` : '#0d1226',
                color: lens === t.key ? color : '#9aa0b5', fontWeight: 700,
              }}>
              {t.name}{t.fiction && <FictionBadge />}
            </button>
          );
        })}
      </div>

      {locked ? (
        dismissed ? (
          <div style={{ border: '1px dashed #2a3352', borderRadius: 12, padding: '1.4rem', textAlign: 'center', color: '#8b91a8' }}>
            <p style={{ margin: '0 0 0.8rem' }}>The preview has ended. Start your {TRIFOLD_TRIAL_LABEL} trial to read the full issue.</p>
            <button onClick={() => setDismissed(false)} style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', border: 'none', borderRadius: 10, padding: '0.7rem 1.4rem', fontWeight: 700, cursor: 'pointer' }}>
              Start free trial
            </button>
            <p style={{ margin: '0.8rem 0 0' }}><Link href="/trifold/archive" style={{ color: '#a78bfa', fontSize: '0.88rem' }}>Browse other issues →</Link></p>
          </div>
        ) : (
          <TrialPanel onDismiss={() => setDismissed(true)} />
        )
      ) : (
        <article>
          {/* Fiction lens header */}
          {activeLens.fiction && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', color: '#8b91a8', fontSize: '0.88rem', lineHeight: 1.6 }}>
              <span>{activeLens.blurb}</span><FictionBadge />
            </div>
          )}

          {pageCount === 0 ? (
            <div style={{ border: '1px dashed #2a3352', borderRadius: 12, padding: '2.2rem 1.4rem', textAlign: 'center', color: '#8b91a8' }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: '1.05rem', color: '#c9cede' }}>
                Nothing on this page yet {activeLens.fiction && <FictionBadge />}
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>The {activeLens.name} take is still being written.</p>
            </div>
          ) : (
            <>
              {/* The page */}
              <div style={{ border: '1px solid #232a45', borderRadius: 12, padding: '1.5rem 1.3rem', background: '#0d1226', marginBottom: '1.2rem' }}>
                {pageIndex === 0 && lens === 'og' && edition.og_file_url && (
                  <p style={{ margin: '0 0 1rem', fontSize: '0.88rem' }}>
                    <a href={edition.og_file_url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>
                      View original upload →
                    </a>
                  </p>
                )}
                {page && page.title && (
                  <h2 style={{ margin: '0 0 0.9rem', fontSize: '1.35rem', lineHeight: 1.35 }}>{page.title}</h2>
                )}
                {page && page.blocks.map((b, i) => renderBlock(b, b.id || `b${i}`, edition))}
              </div>

              {/* Pagination controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
                <button style={navBtn(pageIndex <= 0)} disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))} aria-label="Previous page">
                  ← Prev
                </button>
                <p style={{ margin: 0, color: '#8b91a8', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                  Page {pageIndex + 1} of {pageCount}
                </p>
                <button style={navBtn(pageIndex >= pageCount - 1)} disabled={pageIndex >= pageCount - 1}
                  onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))} aria-label="Next page">
                  Next →
                </button>
              </div>

              {/* Page jumper: dots for short papers, select for long ones */}
              {pageCount > 1 && pageCount <= 12 && (
                <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', marginTop: '0.9rem', flexWrap: 'wrap' }}>
                  {pages.map((_, i) => (
                    <button key={i} onClick={() => setPageIndex(i)} aria-label={`Go to page ${i + 1}`}
                      style={{
                        width: 11, height: 11, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                        background: i === pageIndex ? (LENS_COLORS[lens] || '#a78bfa') : '#2a3352',
                      }} />
                  ))}
                </div>
              )}
              {pageCount > 12 && (
                <div style={{ textAlign: 'center', marginTop: '0.9rem' }}>
                  <select value={pageIndex} onChange={(e) => setPageIndex(Number(e.target.value))}
                    aria-label="Jump to page"
                    style={{ padding: '0.55rem 0.9rem', borderRadius: 10, border: '1px solid #2a3352', background: '#0d1226', color: '#e8e6df' }}>
                    {pages.map((_, i) => (
                      <option key={i} value={i}>Page {i + 1} of {pageCount}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </article>
      )}

      <p style={{ marginTop: '2.5rem', textAlign: 'center' }}>
        <Link href="/trifold/archive" style={{ color: '#a78bfa' }}>← All issues</Link>
      </p>
    </main>
  );
}
