'use client';

// MUSEUM — the gallery of Merlin's creative output.
// Gallery wing (searchable, series-filtered grid + lightbox), Films wing
// (concept videos), and Concepts wing (curated highlights from the
// 131-concept catalog, with status labels). Kept pieces persist in
// localStorage only. No telemetry.
//
// Gallery images are pay-per-download: C$1.00 = 10 credits, 1 credit =
// 1 download with a reuse license. Purchases and redemptions flow through
// /api/gallery/* (signed-in users only). Previews are watermarked and the
// UI offers no direct file URLs; full files are served only through
// signed, expiring download tokens after a credit is redeemed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  SERIES, ITEMS, VIDEOS, CONCEPTS, STATUSES, STATUS_LABELS,
  seriesById, itemsInSeries, searchItems,
  conceptsByStatus, searchConcepts,
  loadKept, saveKept, toggleKept,
} from '@/lib/museum';
import { LICENSE_TEXT, creditsLabel } from '@/lib/gallery';
import { supabase } from '@/lib/supabase';
import { fx, unlockFx } from '@/lib/fx';

const STATUS_COLORS = {
  shipped: '#7fd08a',
  prototype: '#8fb8ff',
  idea: '#e8c56a',
  spec: '#c9a0ff',
  'not-approved': '#ff8a8a',
};

const TILE = '/images/apollo-shared/apollo-panel-tile.webp';
const MUSEUM_BG = '/images/museum/museum-bg.webp';
const BG_VIDEO = '/images/museum/bg-loop.mp4';
const BG_STILL = '/images/museum/bg-still.jpg';
const BG_KEY = 'museum-bg'; // localStorage: ambience toggle Video → Still → Off

// Inline SVG glyph system (zero image weight) — APOLLO amber/gold treatment.
const G = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flex: 'none' }} {...props} />
);
const IconImage = () => (<G><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M4 18l5-5 3 3 4-4 4 4" /></G>);
const IconFilm = () => (<G><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" /></G>);
const IconBulb = () => (<G><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.8.6 1.5 1.4 1.5 2.1h4c0-.7.7-1.5 1.5-2.1A6 6 0 0 0 12 3z" /></G>);
const IconBolt = () => (<G><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></G>);
const IconClose = () => (<G><path d="M6 6l12 12M18 6 6 18" /></G>);
const IconPrev = () => (<G><path d="M15 5l-7 7 7 7" /></G>);
const IconNext = () => (<G><path d="M9 5l7 7-7 7" /></G>);
const IconHeart = () => (<G><path d="M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 8.2 5c1.6 0 3 .9 3.8 2.2A4.6 4.6 0 0 1 15.8 5a4.6 4.6 0 0 1 4.7 4.6c0 5.8-8.5 10.9-8.5 10.9z" /></G>);
const IconDownload = () => (<G><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></G>);
const IconFrame = () => (<G width="26" height="26"><rect x="4" y="4" width="16" height="16" rx="1" /><rect x="7" y="7" width="10" height="10" /></G>);

export default function MuseumPage() {
  const [tab, setTab] = useState('gallery');
  const [query, setQuery] = useState('');
  const [series, setSeries] = useState('all');
  const [status, setStatus] = useState('all');
  const [kept, setKept] = useState(() => loadKept());
  const [lightbox, setLightbox] = useState(null); // index into visibleItems
  const [bgMode, setBgMode] = useState(() => {
    // Header ambience: Video → Still → Off, persisted. Reduced-motion users start on Still.
    if (typeof window === 'undefined') return 'video';
    try {
      const saved = window.localStorage.getItem(BG_KEY);
      if (saved === 'video' || saved === 'still' || saved === 'off') return saved;
    } catch {}
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'still' : 'video';
  });
  const cycleBg = () => {
    setBgMode((m) => {
      const n = m === 'video' ? 'still' : m === 'still' ? 'off' : 'video';
      try { window.localStorage.setItem(BG_KEY, n); } catch {}
      return n;
    });
    try { fx.tap(); } catch {}
  };

  useEffect(() => {
    saveKept(kept);
  }, [kept]);

  useEffect(() => {
    const onFirst = () => { try { unlockFx(); } catch {} window.removeEventListener('pointerdown', onFirst); };
    window.addEventListener('pointerdown', onFirst);
    return () => window.removeEventListener('pointerdown', onFirst);
  }, []);

  const visibleItems = useMemo(() => {
    let list = query.trim() ? searchItems(query) : ITEMS;
    if (series === 'kept') list = list.filter((i) => kept.includes(i.id));
    else if (series !== 'all') list = list.filter((i) => i.series === series);
    return list;
  }, [query, series, kept]);

  const visibleConcepts = useMemo(() => {
    let list = query.trim() ? searchConcepts(query) : CONCEPTS;
    if (status !== 'all') list = list.filter((c) => c.status === status);
    return list;
  }, [query, status]);

  const openLightbox = useCallback((idx) => {
    try { fx.menuOpen(); } catch {}
    setLightbox(idx);
  }, []);
  const closeLightbox = useCallback(() => {
    try { fx.menuClose(); } catch {}
    setLightbox(null);
  }, []);
  const stepLightbox = useCallback((dir) => {
    setLightbox((prev) => {
      if (prev == null || visibleItems.length === 0) return prev;
      return (prev + dir + visibleItems.length) % visibleItems.length;
    });
    try { fx.tap(); } catch {}
  }, [visibleItems.length]);

  useEffect(() => {
    if (lightbox == null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') stepLightbox(1);
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightbox, closeLightbox, stepLightbox]);

  const toggle = (id) => {
    setKept((prev) => toggleKept(prev, id));
    try { fx.tap(); } catch {}
  };

  const item = lightbox != null ? visibleItems[lightbox] : null;

  // --- Pay-per-download: credit balance + purchase/redeem flows ---
  const [credits, setCredits] = useState(null); // null = unknown (signed out or unconfigured)
  const [creditsLoading, setCreditsLoading] = useState(true); // styled loading shimmer on the chip
  const [creditBusy, setCreditBusy] = useState(null); // 'buying' | 'redeeming' | null
  const [creditMsg, setCreditMsg] = useState('');

  const loadCredits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setCredits(null); return; }
      const res = await fetch('/api/gallery/credits', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setCredits(null); return; }
      const d = await res.json();
      setCredits(typeof d.balance === 'number' ? d.balance : 0);
    } catch { setCredits(null); }
    finally { setCreditsLoading(false); }
  }, []);

  useEffect(() => {
    loadCredits();
    try {
      const params = new URLSearchParams(window.location.search);
      const g = params.get('gallery');
      if (g === 'credits-ok') {
        setCreditMsg('Payment received — your 10 download credits are being added. Refreshing…');
        const t = setTimeout(loadCredits, 3000); // the webhook credits the account a moment later
        params.delete('gallery');
        window.history.replaceState({}, '', window.location.pathname);
        return () => clearTimeout(t);
      }
      if (g === 'credits-cancelled') {
        setCreditMsg('Checkout cancelled — no charge, no credits.');
        params.delete('gallery');
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {}
  }, [loadCredits]);

  const buyCredits = useCallback(async () => {
    setCreditBusy('buying');
    setCreditMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setCreditMsg('Sign in to buy download credits.');
        setCreditBusy(null);
        return;
      }
      const res = await fetch('/api/gallery/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      if (d.url) { window.location.href = d.url; return; }
      setCreditMsg(d.error || 'Checkout is not available right now.');
    } catch {
      setCreditMsg('Checkout is not available right now.');
    }
    setCreditBusy(null);
  }, []);

  const redeemDownload = useCallback(async (itemId) => {
    setCreditBusy('redeeming');
    setCreditMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setCreditMsg('Sign in to download — downloads cost 1 credit ($0.10) each.');
        setCreditBusy(null);
        return;
      }
      const res = await fetch('/api/gallery/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ itemId, idemKey: `${itemId}-${Date.now()}` }),
      });
      const d = await res.json();
      if (d.downloadUrl) {
        if (typeof d.balanceAfter === 'number') setCredits(d.balanceAfter);
        try { fx.checkoutConfirm(); } catch {}
        window.location.href = d.downloadUrl; // signed, expiring attachment download
        return;
      }
      setCreditMsg(d.error || 'Could not redeem your download.');
    } catch {
      setCreditMsg('Could not redeem your download. Please try again.');
    }
    setCreditBusy(null);
  }, []);

  // Image protection: previews never offer a download path in the UI, and
  // OS-level gestures are suppressed. Honest note: nothing on a website can
  // stop a phone's own screenshot/recording — the burned-in file watermark
  // (see scripts) is the real protection; these handlers are the deterrent.
  const protectProps = {
    onContextMenu: (e) => e.preventDefault(),
    onDragStart: (e) => e.preventDefault(),
    draggable: false,
  };

  return (
    <div className="museum-page">
      <header className="museum-head">
        {/* Header ambience: cinematic video loop with still + off fallbacks. */}
        <div className="museum-bg-layer" aria-hidden="true">
          {bgMode === 'video' && (
            <video className="museum-bg-media" src={BG_VIDEO} poster={BG_STILL}
              autoPlay muted loop playsInline preload="metadata" />
          )}
          {bgMode === 'still' && (
            <img className="museum-bg-media" src={BG_STILL} alt="" />
          )}
          <div className="museum-bg-scrim" />
        </div>
        <button
          type="button"
          className="museum-bg-toggle"
          onClick={cycleBg}
          aria-label={`Header ambience: ${bgMode}. Activate to change.`}
          title="Toggle header ambience"
        >
          {bgMode === 'video' ? '◉ Video' : bgMode === 'still' ? '◐ Still' : '○ Off'}
        </button>
        <div className="museum-head-inner">
        <div className="museum-kicker">Olympus Gallery</div>
        <h1 className="museum-title">Museum</h1>
        <p className="museum-sub">
          The collected works of Merlin Ambros — art, films, and concepts.
          Kept for Miles.
        </p>
        <nav className="museum-tabs" role="tablist" aria-label="Museum wings">
          {[
            ['gallery', `Gallery · ${ITEMS.length}`, <IconImage key="i" />],
            ['films', `Films · ${VIDEOS.length}`, <IconFilm key="i" />],
            ['concepts', `Concepts · ${CONCEPTS.length}`, <IconBulb key="i" />],
          ].map(([id, label, icon]) => (
            <button
              key={id} role="tab" aria-selected={tab === id}
              className={tab === id ? 'tab active' : 'tab'}
              onClick={() => { setTab(id); setQuery(''); try { fx.tap(); } catch {} }}
            >
              {icon}{label}
            </button>
          ))}
        </nav>
        </div>
      </header>

      <div className="museum-controls">
        <input
          className="museum-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'concepts' ? 'Search concepts…' : 'Search the collection…'}
          aria-label="Search"
        />
        {tab === 'gallery' && (
          <div className="credit-bar" aria-label="Download credits">
            <span className={`credit-chip${creditsLoading ? ' loading' : ''}`} title="Your download credits">
              <IconBolt /> {creditsLoading ? '···' : credits == null ? '—' : creditsLabel(credits)}
            </span>
            <button
              className="credit-buy"
              onClick={buyCredits}
              disabled={creditBusy === 'buying'}
            >
              <IconBolt />{creditBusy === 'buying' ? 'Opening checkout…' : 'Get credits · $1 = 10 downloads'}
            </button>
          </div>
        )}
        {tab === 'gallery' && creditMsg && (
          <p className="credit-msg" role="status">{creditMsg}</p>
        )}
        {tab === 'gallery' && (
          <div className="chip-row" role="group" aria-label="Filter by series">
            <button className={series === 'all' ? 'chip active' : 'chip'} onClick={() => setSeries('all')}>All</button>
            <button className={series === 'kept' ? 'chip active' : 'chip'} onClick={() => setSeries('kept')}>Kept ♥</button>
            {SERIES.map((s) => (
              <button key={s.id} className={series === s.id ? 'chip active' : 'chip'} onClick={() => setSeries(s.id)}>
                {s.title}
              </button>
            ))}
          </div>
        )}
        {tab === 'concepts' && (
          <div className="chip-row" role="group" aria-label="Filter by status">
            <button className={status === 'all' ? 'chip active' : 'chip'} onClick={() => setStatus('all')}>All</button>
            {STATUSES.map((st) => (
              <button key={st} className={status === st ? 'chip active' : 'chip'} onClick={() => setStatus(st)}>
                {STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'gallery' && (
        <main className="museum-grid" aria-label="Gallery">
          {visibleItems.length === 0 && (
            <div className="empty empty-art" role="status">
              <IconFrame />
              <div className="empty-title">This wing is quiet</div>
              <p>Nothing in this wing yet. Try another search.</p>
            </div>
          )}
          {visibleItems.map((it, idx) => {
            const s = seriesById(it.series);
            const isKept = kept.includes(it.id);
            return (
              <button
                key={it.id} className="tile" onClick={() => openLightbox(idx)}
                aria-label={`${it.title}${s ? ` — ${s.title}` : ''}`}
              >
                <span className="tile-frame wm-wrap">
                  <img src={it.src} alt={it.title} loading="lazy" {...protectProps} />
                  <span className="wm-mark" aria-hidden="true">© Olympus Gallery</span>
                  {isKept && <span className="kept-dot" aria-hidden="true">♥</span>}
                </span>
                <span className="tile-title">{it.title}</span>
                {s && <span className="tile-series">{s.title}</span>}
              </button>
            );
          })}
        </main>
      )}

      {tab === 'films' && (
        <main className="films" aria-label="Concept films">
          {VIDEOS.map((v) => (
            <article key={v.id} className="film-card">
              <div className="film-head">
                <h2 className="film-title">{v.title}</h2>
                <p className="film-blurb">{v.blurb}</p>
              </div>
              <video className="film-video" src={v.src} controls preload="metadata" playsInline>
                Sorry — your browser can’t play this film.
              </video>
            </article>
          ))}
          <p className="films-note">Concept films from the archive. AI-generated studies, kept as history.</p>
        </main>
      )}

      {tab === 'concepts' && (
        <main className="concepts" aria-label="Concept highlights">
          {visibleConcepts.length === 0 && (
            <div className="empty empty-art" role="status">
              <IconFrame />
              <div className="empty-title">No concepts match</div>
              <p>Try another search.</p>
            </div>
          )}
          {visibleConcepts.map((c) => (
            <article key={c.id} className="concept-card">
              <div className="concept-top">
                <h2 className="concept-name">{c.name}</h2>
                <span className="status-badge" style={{ borderColor: STATUS_COLORS[c.status], color: STATUS_COLORS[c.status] }}>
                  {STATUS_LABELS[c.status]}
                </span>
              </div>
              <div className="concept-cat">{c.category}</div>
              <p className="concept-blurb">{c.blurb}</p>
              {/* next/link: client-side nav keeps the radio playing. */}
              {c.route && (
                <Link className="concept-link" href={c.route} onClick={() => { try { fx.tap(); } catch {} }}>
                  Visit →</Link>
              )}
            </article>
          ))}
        </main>
      )}

      {item && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.title} onClick={closeLightbox}>
          <button className="lb-close" aria-label="Close" onClick={closeLightbox}><IconClose /></button>
          <button className="lb-nav lb-prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); stepLightbox(-1); }}><IconPrev /></button>
          <button className="lb-nav lb-next" aria-label="Next" onClick={(e) => { e.stopPropagation(); stepLightbox(1); }}><IconNext /></button>
          <figure className="lb-figure" onClick={(e) => e.stopPropagation()}>
            <div className="lb-img-wrap wm-wrap">
              <img src={item.src} alt={item.title} {...protectProps} />
              <span className="wm-mark" aria-hidden="true">© Olympus Gallery</span>
            </div>
            <figcaption className="lb-cap">
              <div className="lb-row">
                <div>
                  <div className="lb-title">{item.title}</div>
                  <div className="lb-series">{seriesById(item.series)?.title}</div>
                  {item.blurb && <div className="lb-blurb">{item.blurb}</div>}
                </div>
                <div className="lb-actions">
                  <button
                    className={kept.includes(item.id) ? 'keep active' : 'keep'}
                    aria-pressed={kept.includes(item.id)}
                    aria-label={kept.includes(item.id) ? 'Remove from kept' : 'Keep this piece'}
                    onClick={() => toggle(item.id)}
                  >
                    <IconHeart />Keep
                  </button>
                  <button
                    className="dl-btn"
                    onClick={() => redeemDownload(item.id)}
                    disabled={creditBusy === 'redeeming'}
                    title="Redeem 1 download credit ($0.10)"
                  >
                    <IconDownload />{creditBusy === 'redeeming' ? 'Preparing…' : 'Download · 1 credit'}
                  </button>
                </div>
              </div>
              <p className="dl-license">{LICENSE_TEXT}</p>
              <div className="lb-count">{lightbox + 1} of {visibleItems.length}</div>
            </figcaption>
          </figure>
        </div>
      )}

      <div aria-hidden="true" className="player-clear" />

      <style jsx>{`
        .museum-page {
          min-height: 100dvh;
          background: #0b0b0d;
          color: #ece7db;
          font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        }
        .museum-head {
          position: relative;
          overflow: hidden;
          text-align: center;
          padding: 3.5rem 1.25rem 1.25rem;
          border-bottom: 1px solid rgba(201, 168, 106, 0.25);
        }
        .museum-bg-layer { position: absolute; inset: 0; z-index: 0; }
        .museum-bg-media { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.55; }
        .museum-bg-scrim { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(11,11,13,0.45), rgba(11,11,13,0.94)); }
        .museum-head-inner { position: relative; z-index: 1; }
        .museum-bg-toggle {
          position: absolute; top: 12px; right: 12px; z-index: 2;
          background: rgba(11,11,13,0.6); border: 1px solid rgba(201,168,106,0.4);
          color: #c9a86a; border-radius: 999px; padding: 0.4rem 0.8rem;
          font-size: 0.7rem; letter-spacing: 0.12em; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .museum-bg-toggle:hover { border-color: #c9a86a; }
        .museum-kicker {
          font-size: 0.7rem;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: #c9a86a;
          margin-bottom: 0.75rem;
        }
        .museum-title {
          font-family: Georgia, 'Times New Roman', serif;
          font-weight: 400;
          font-size: clamp(2.5rem, 8vw, 4rem);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin: 0 0 0.75rem;
          color: #f4efe3;
        }
        .museum-sub {
          font-family: Georgia, 'Times New Roman', serif;
          font-style: italic;
          color: #a9a294;
          max-width: 34rem;
          margin: 0 auto 1.5rem;
          line-height: 1.6;
          font-size: 1rem;
        }
        .museum-tabs {
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .tab {
          background: transparent;
          border: 1px solid rgba(201, 168, 106, 0.35);
          color: #c9bfae;
          border-radius: 999px;
          padding: 0.55rem 1.1rem;
          font-size: 0.85rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .tab.active {
          background: #c9a86a;
          border-color: #c9a86a;
          color: #0b0b0d;
          font-weight: 600;
        }
        .museum-controls {
          max-width: 72rem;
          margin: 0 auto;
          padding: 1.25rem 1.25rem 0;
        }
        .museum-search {
          width: 100%;
          background: #141416;
          border: 1px solid #2a2a2e;
          color: #ece7db;
          border-radius: 0.6rem;
          padding: 0.8rem 1rem;
          font-size: 1rem;
          margin-bottom: 0.9rem;
        }
        .museum-search::placeholder { color: #6f6a5e; }
        .museum-search:focus {
          outline: none;
          border-color: #c9a86a;
        }
        .chip-row {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 0.25rem;
        }
        .chip {
          background: transparent;
          border: 1px solid #333;
          color: #a9a294;
          border-radius: 999px;
          padding: 0.4rem 0.85rem;
          font-size: 0.8rem;
          cursor: pointer;
          white-space: nowrap;
        }
        .chip.active {
          border-color: #c9a86a;
          color: #e9d9b8;
        }
        .museum-grid {
          max-width: 72rem;
          margin: 0 auto;
          padding: 1.5rem 1.25rem;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 1.1rem;
        }
        @media (min-width: 700px) {
          .museum-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
        }
        .tile {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          text-align: left;
        }
        .tile-frame {
          display: block;
          position: relative;
          aspect-ratio: 1;
          overflow: hidden;
          border-radius: 0.4rem;
          background: #141416;
          border: 1px solid #222;
        }
        .tile-frame img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.35s ease;
        }
        .tile:hover .tile-frame img, .tile:focus .tile-frame img { transform: scale(1.04); }
        .kept-dot {
          position: absolute;
          top: 0.4rem;
          right: 0.5rem;
          color: #e8837a;
          font-size: 1rem;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        }
        .tile-title {
          display: block;
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: #e6e0d2;
          line-height: 1.35;
        }
        .tile-series {
          display: block;
          font-size: 0.72rem;
          color: #8a8474;
          letter-spacing: 0.06em;
        }
        .empty {
          grid-column: 1 / -1;
          text-align: center;
          color: #8a8474;
          padding: 3rem 1rem;
        }
        .empty-art {
          border: 1px dashed rgba(201, 168, 106, 0.4);
          border-radius: 0.8rem;
          padding: 3rem 1.5rem;
          background-image: linear-gradient(rgba(11,11,13,0.78), rgba(11,11,13,0.88)), url(${MUSEUM_BG});
          background-size: cover;
          background-position: center;
          color: #b9b2a1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .empty-art svg { color: #c9a86a; }
        .empty-title { font-size: 1.05rem; letter-spacing: 0.1em; color: #e9d9b8; text-transform: uppercase; }
        .empty-art p { margin: 0; font-size: 0.9rem; line-height: 1.6; }
        .films {
          max-width: 56rem;
          margin: 0 auto;
          padding: 1.5rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .film-card { border: 1px solid #2a2a2e; border-radius: 0.6rem; overflow: hidden; background-color: #101012; background-image: url(${TILE}); background-size: 220px; }
        .film-head { padding: 1.25rem 1.25rem 0.75rem; }
        .film-title {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 1.3rem;
          margin: 0 0 0.4rem;
          color: #f4efe3;
          font-weight: 400;
        }
        .film-blurb { color: #a9a294; margin: 0; line-height: 1.6; font-size: 0.95rem; }
        .film-video { width: 100%; display: block; background: #000; max-height: 70vh; }
        .films-note { text-align: center; color: #6f6a5e; font-size: 0.85rem; font-style: italic; }
        .concepts {
          max-width: 56rem;
          margin: 0 auto;
          padding: 1.5rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .concept-card {
          border: 1px solid #2a2a2e;
          border-radius: 0.6rem;
          padding: 1.1rem 1.25rem;
          background-color: #101012;
          background-image: url(${TILE});
          background-size: 220px;
        }
        .concept-top { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
        .concept-name {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 1.15rem;
          margin: 0;
          color: #f4efe3;
          font-weight: 400;
        }
        .status-badge {
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid;
          border-radius: 999px;
          padding: 0.25rem 0.7rem;
          white-space: nowrap;
        }
        .concept-cat { font-size: 0.75rem; color: #8a8474; margin-top: 0.3rem; letter-spacing: 0.05em; }
        .concept-blurb { color: #b9b2a1; line-height: 1.6; margin: 0.6rem 0 0; font-size: 0.95rem; }
        .concept-link {
          display: inline-block;
          margin-top: 0.8rem;
          color: #c9a86a;
          text-decoration: none;
          font-size: 0.9rem;
        }
        .concept-link:hover { text-decoration: underline; }
        .lightbox {
          position: fixed;
          inset: 0;
          background: rgba(5, 5, 7, 0.96);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          padding-bottom: calc(1rem + env(safe-area-inset-bottom));
        }
        .lb-figure {
          margin: 0;
          max-width: min(92vw, 60rem);
          max-height: 92dvh;
          display: flex;
          flex-direction: column;
        }
        .lb-figure img {
          max-width: 100%;
          max-height: 72dvh;
          object-fit: contain;
          border-radius: 0.3rem;
          background: #111;
        }
        .lb-cap { padding: 0.9rem 0.25rem 0; }
        .lb-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
        .lb-title {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 1.2rem;
          color: #f4efe3;
        }
        .lb-series { font-size: 0.78rem; color: #c9a86a; letter-spacing: 0.08em; margin-top: 0.2rem; }
        .lb-blurb { font-size: 0.9rem; color: #a9a294; margin-top: 0.4rem; line-height: 1.55; max-width: 32rem; }
        .lb-count { font-size: 0.75rem; color: #6f6a5e; margin-top: 0.6rem; }
        .keep {
          background: transparent;
          border: 1px solid #444;
          color: #a9a294;
          border-radius: 999px;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-size: 0.85rem;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .keep.active { border-color: #e8837a; color: #e8837a; }
        .lb-close, .lb-nav {
          position: absolute;
          background: rgba(20, 20, 22, 0.8);
          border: 1px solid #333;
          color: #ece7db;
          border-radius: 50%;
          width: 2.75rem;
          height: 2.75rem;
          font-size: 1.2rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lb-close { top: calc(1rem + env(safe-area-inset-top, 0px)); right: 1rem; }
        .lb-prev { left: 0.75rem; top: 50%; transform: translateY(-50%); }
        .lb-next { right: 0.75rem; top: 50%; transform: translateY(-50%); }
        @media (prefers-reduced-motion: reduce) {
          .tile-frame img { transition: none; }
          .credit-chip.loading { animation: none; }
        }
        /* --- Pay-per-download commerce --- */
        .wm-wrap {
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
        }
        .wm-wrap img { -webkit-user-drag: none; }
        .wm-mark {
          position: absolute;
          right: 0.45rem;
          bottom: 0.45rem;
          font-size: 0.58rem;
          letter-spacing: 0.18em;
          color: rgba(236, 231, 219, 0.8);
          background: rgba(0, 0, 0, 0.45);
          padding: 0.22rem 0.55rem;
          border-radius: 0.25rem;
          pointer-events: none;
        }
        .lb-img-wrap { position: relative; display: inline-block; max-width: 100%; }
        .credit-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin: 0 0 1rem;
        }
        .credit-chip {
          border: 1px solid rgba(201, 168, 106, 0.45);
          color: #e9d9b8;
          border-radius: 999px;
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .credit-chip.loading {
          background: linear-gradient(90deg, rgba(201,168,106,0.06) 25%, rgba(201,168,106,0.18) 50%, rgba(201,168,106,0.06) 75%);
          background-size: 200% 100%;
          animation: creditshimmer 1.4s linear infinite;
        }
        @keyframes creditshimmer { to { background-position: -200% 0; } }
        .credit-buy {
          background: #c9a86a;
          border: none;
          color: #0b0b0d;
          font-weight: 600;
          border-radius: 999px;
          padding: 0.55rem 1.15rem;
          font-size: 0.85rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .credit-buy:disabled { opacity: 0.6; cursor: wait; }
        .credit-msg {
          text-align: center;
          color: #c9a86a;
          font-size: 0.85rem;
          margin: -0.4rem 0 1rem;
        }
        .lb-actions { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end; }
        .dl-btn {
          background: #c9a86a;
          border: none;
          color: #0b0b0d;
          font-weight: 600;
          border-radius: 999px;
          padding: 0.55rem 1.1rem;
          font-size: 0.85rem;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .dl-btn:disabled { opacity: 0.6; cursor: wait; }
        .dl-license {
          font-size: 0.72rem;
          color: #8a8474;
          line-height: 1.5;
          margin: 0.7rem 0 0;
          max-width: 34rem;
        }
      `}</style>
    </div>
  );
}
