// app/business-services/page.jsx — Omega Business Services.
//
// A directory of real business resources — grants, loans and financing,
// mentorship and advisory, registration and licensing, taxes, hiring
// help, and exporting and growth — for startups and for businesses
// that are already running, by jurisdiction. Canada first (federal +
// Alberta), then the United States (federal + states).
//
// Every entry links to its official source and says in plain words
// what it is, who it is for, and how to use it. Amounts and deadlines
// appear only when the official source states them. Nothing here is
// bought, and nothing is invented: a program that has ended is left
// out rather than listed as if it were live.
//
// Data lives in lib/business-services/resources.js (a static module —
// no API calls, no accounts, nothing to sign into). Filter state is
// local to the page.
//
// Laws: plain English throughout, normal flow layout (no-overlap).
// The circle-orb law is for game screens only — this is a utility,
// so normal buttons are fine.

'use client';

import { useMemo, useState } from 'react';

import {
  AUDIENCES,
  CATEGORIES,
  JURISDICTIONS,
  RESOURCES,
  categoryById,
  filterResources,
  jurisdictionById,
} from '@/lib/business-services/resources.js';

// --- category graphics ---

// One 900x600 WebP per real business-services category, in
// public/images/business-services/<id>.webp, plus the page background
// at public/images/business-services/background.webp (1920x1080, very dark
// low-contrast gold nebula). Only the 7 real category ids have art:
// a resource whose category is null / unmapped renders NO image —
// never a wrong one, never a broken one.
const CATEGORY_IMAGE_IDS = new Set([
  'grants', 'loans', 'mentorship', 'registration', 'taxes', 'hiring', 'exporting',
]);
const BACKGROUND_IMAGE_SRC = '/images/business-services/background.webp';

function categoryImageSrc(id) {
  if (!id || typeof id !== 'string') return null;
  return CATEGORY_IMAGE_IDS.has(id) ? `/images/business-services/${id}.webp` : null;
}

export default function BusinessServicesPage() {
  const [audience, setAudience] = useState('all');
  const [jurisdiction, setJurisdiction] = useState('all');
  const [category, setCategory] = useState('all');

  const shown = useMemo(
    () => filterResources({ audience, jurisdiction, category }),
    [audience, jurisdiction, category],
  );

  const audienceLabel = audience === 'all'
    ? 'startups and existing businesses'
    : audience === 'startup'
      ? 'startups'
      : 'existing businesses';
  const jurisdictionLabel = jurisdiction === 'all'
    ? 'everywhere we cover'
    : (jurisdictionById(jurisdiction) || {}).label || jurisdiction;
  const categoryLabel = category === 'all'
    ? 'every kind of help'
    : (categoryById(category) || {}).label || category;

  return (
    <main style={styles.page}>
      <img src={BACKGROUND_IMAGE_SRC} alt="" aria-hidden="true" data-testid="business-services-background" style={styles.bgImg} />
      <div style={styles.wrap}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.mark} aria-hidden="true">Ω</div>
          <div>
            <h1 style={styles.title}>Business Services</h1>
            <p style={styles.byline}>by Omega</p>
          </div>
          <p style={styles.sourceCount}>
            {RESOURCES.length} resources
          </p>
        </header>

        {/* What this is */}
        <section style={styles.card} aria-label="About this directory">
          <h2 style={styles.h2}>Grants, loans, mentors and the paperwork</h2>
          <p style={styles.note}>
            Real help for starting a business or growing one you already run:
            grants, loans and financing, free mentoring, registration and
            licensing, taxes, hiring help, and exporting. Every entry links
            to its official source — a government business portal, a grant
            program, or a recognised advisory body — and says in plain words
            what it is, who it is for, and how to use it.
          </p>
          <p style={styles.note}>
            Amounts and deadlines appear only when the official source states
            them, checked November 21, 2026. A program that has ended is left
            out on purpose — the Canada Digital Adoption Program, for example,
            closed March 31, 2025 and is not listed. Alberta runs no general
            startup grant: the money here is matched and targeted, so check
            each program’s terms.
          </p>
        </section>

        {/* Filters */}
        <section style={styles.card} aria-label="Filter resources">
          <h2 style={styles.h2}>Find what fits</h2>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Who is it for?</legend>
            <div style={styles.chipRow}>
              <button
                key="all"
                type="button"
                data-testid="audience-all"
                onClick={() => setAudience('all')}
                aria-pressed={audience === 'all'}
                style={audience === 'all' ? styles.chipActive : styles.chip}
              >
                All businesses
              </button>
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  data-testid={`audience-${a.id}`}
                  onClick={() => setAudience(a.id)}
                  aria-pressed={audience === a.id}
                  style={audience === a.id ? styles.chipActive : styles.chip}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Where?</legend>
            <div style={styles.chipRow}>
              <button
                key="all"
                type="button"
                data-testid="jurisdiction-all"
                onClick={() => setJurisdiction('all')}
                aria-pressed={jurisdiction === 'all'}
                style={jurisdiction === 'all' ? styles.chipActive : styles.chip}
              >
                Everywhere
              </button>
              {JURISDICTIONS.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  data-testid={`jurisdiction-${j.id}`}
                  onClick={() => setJurisdiction(j.id)}
                  aria-pressed={jurisdiction === j.id}
                  style={jurisdiction === j.id ? styles.chipActive : styles.chip}
                >
                  {j.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>What kind of help?</legend>
            <div style={styles.chipRow}>
              <button
                key="all"
                type="button"
                data-testid="category-all"
                onClick={() => setCategory('all')}
                aria-pressed={category === 'all'}
                style={category === 'all' ? styles.chipActive : styles.chip}
              >
                All kinds
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`category-${c.id}`}
                  onClick={() => setCategory(c.id)}
                  aria-pressed={category === c.id}
                  style={category === c.id ? styles.chipActive : styles.chip}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>
          {(audience !== 'all' || jurisdiction !== 'all' || category !== 'all') ? (
            <div style={styles.row}>
              <button type="button" onClick={() => { setAudience('all'); setJurisdiction('all'); setCategory('all'); }} style={styles.buttonGhost}>
                Clear all filters
              </button>
            </div>
          ) : null}
        </section>

        {/* Results */}
        <section style={styles.card} aria-label="Resources">
          <h2 style={styles.h2} data-testid="resource-count">
            {shown.length} of {RESOURCES.length} resources
          </h2>
          <p style={styles.note}>
            Showing {categoryLabel} for {audienceLabel} in {jurisdictionLabel}.
          </p>
          {shown.length === 0 ? (
            <p style={styles.note}>Nothing matches those filters — try widening one of them.</p>
          ) : null}
          <div data-testid="resource-list">
            {shown.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </section>

        {/* Still to come */}
        <section style={styles.card} aria-label="Still to come">
          <h2 style={styles.h2}>Still to come</h2>
          <p style={styles.note}>
            More places are coming the same way: more Canadian provinces and
            territories, and more US states — Texas next. The U.S. Small
            Business Development Centers network (free one-to-one advising
            at nearly 1,000 local centers) belongs here too and will be
            added once its official link is confirmed.
          </p>
          <p style={styles.note}>
            Something wrong or out of date? Every link goes to the official
            source — that page is the authority, and this directory follows
            it.
          </p>
        </section>
      </div>
    </main>
  );
}

// --- one resource card ------------------------------------------------------

function ResourceCard({ resource: r }) {
  const category = categoryById(r.category);
  const jurisdiction = jurisdictionById(r.jurisdiction);
  const audienceText = r.audiences.length === 2
    ? 'Startups and existing businesses'
    : r.audiences[0] === 'startup'
      ? 'Startups'
      : 'Existing businesses';
  const thumbSrc = categoryImageSrc(r.category);
  return (
    <article style={styles.resource} data-testid={`resource-${r.id}`}>
      <div style={styles.resourceMedia}>
        {thumbSrc ? (
          <img src={thumbSrc} alt="" data-testid={`resource-thumb-${r.category}`} style={styles.resourceThumb} />
        ) : null}
        <div style={styles.resourceMain}>
      <div style={styles.resourceTop}>
        <h3 style={styles.resourceTitle}>{r.name}</h3>
      </div>
      <p style={styles.tags} data-testid={`resource-tags-${r.id}`}>
        <span style={styles.tag}>{category ? category.label : r.category}</span>
        {' '}
        <span style={styles.tag}>{jurisdiction ? jurisdiction.label : r.jurisdiction}</span>
        {' '}
        <span style={styles.tag}>{audienceText}</span>
      </p>
      <p style={styles.resourceLine}><strong>What it is: </strong>{r.what}</p>
      <p style={styles.resourceLine}><strong>Who it is for: </strong>{r.who}</p>
      <p style={styles.resourceLine}><strong>How to use it: </strong>{r.how}</p>
      {r.amount ? <p style={styles.amount}>{r.amount}</p> : null}
      {r.note ? <p style={styles.resNote}>{r.note}</p> : null}
      <div style={styles.row}>
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`official-source-${r.id}`}
          style={styles.buttonPrimary}
        >
          Official source
        </a>
        <span style={styles.sourceName}>Source: {r.source}</span>
      </div>
        </div>
      </div>
    </article>
  );
}

// --- styles (gold / indigo Omega house family, plain flow layout) ----------
// Same palette as the Job Board (app/job-board/page.jsx): the two Omega
// directories read as one family.

const GOLD = '#d4a017';
const GOLD_SOFT = '#f5c542';
const INDIGO_BG = '#0d0d1f';
const INDIGO_CARD = '#171730';
const INDIGO_LINE = '#2c2c52';
const TEXT = '#f2f0ff';
const MUTED = '#b9b4d6';

const styles = {
  page: { background: INDIGO_BG, color: TEXT, minHeight: '100vh', padding: '16px 12px 48px', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", position: 'relative' },
  wrap: { maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', zIndex: 1 },
  header: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  mark: {
    width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 30, fontWeight: 900, color: '#201600',
    background: 'radial-gradient(circle at 35% 30%, #fff3c4, #ffd700 45%, #c9962e 75%, #8a5a14)',
    border: `2px solid ${GOLD_SOFT}`, boxShadow: '0 0 18px rgba(255, 200, 60, 0.35)',
  },
  title: { margin: 0, fontSize: 30, lineHeight: 1.1, color: GOLD_SOFT },
  byline: { margin: '2px 0 0', color: MUTED, fontSize: 14 },
  sourceCount: { marginLeft: 'auto', color: GOLD_SOFT, fontSize: 13, fontWeight: 600 },
  card: { background: INDIGO_CARD, border: `1px solid ${INDIGO_LINE}`, borderRadius: 14, padding: 16 },
  h2: { margin: '0 0 8px', fontSize: 20, color: GOLD_SOFT },
  h3: { margin: '16px 0 8px', fontSize: 16, color: TEXT },
  note: { margin: '0 0 12px', color: MUTED, fontSize: 14, lineHeight: 1.5 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 },
  buttonPrimary: {
    display: 'inline-block', background: `linear-gradient(180deg, ${GOLD_SOFT}, ${GOLD})`, color: '#201600',
    border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', textDecoration: 'none', textAlign: 'center',
  },
  buttonGhost: {
    background: 'transparent', color: TEXT, border: `1px solid ${INDIGO_LINE}`,
    borderRadius: 10, padding: '10px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  fieldset: { border: `1px solid ${INDIGO_LINE}`, borderRadius: 10, padding: 12, margin: '12px 0 0' },
  legend: { fontSize: 14, fontWeight: 600, padding: '0 6px' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { background: '#0d0d1f', color: TEXT, border: `1px solid ${INDIGO_LINE}`, borderRadius: 999, padding: '9px 14px', fontSize: 14, cursor: 'pointer' },
  chipActive: { background: GOLD, color: '#201600', border: `1px solid ${GOLD_SOFT}`, borderRadius: 999, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  resource: { borderTop: `1px solid ${INDIGO_LINE}`, padding: '14px 0 6px' },
  // Page background graphic, fixed behind the content (the dark page
  // background above stays underneath as the fallback). Dimmed so the
  // text on the opaque cards reads exactly as before.
  bgImg: { position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.35, pointerEvents: 'none' },
  // Thumb row: the category thumb sits left of the resource text,
  // in normal flow — it never overlaps anything, it just widens the
  // card's first row by its own 72 px.
  resourceMedia: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  resourceMain: { flex: 1, minWidth: 0 },
  resourceThumb: { width: 72, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
  resourceTop: { display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' },
  resourceTitle: { margin: 0, fontSize: 16, lineHeight: 1.35, flex: 1 },
  tags: { margin: '6px 0 0', lineHeight: 1.9 },
  // Tag chips stay one line each, but never outgrow the card column:
  // at 320 px the "Startups and existing businesses" chip is 212 px
  // wide in a ~193 px column, which pushed the whole page 3 px past
  // the viewport (probe, Nov 21). maxWidth + ellipsis truncates it
  // instead of overflowing; inline-block so those apply.
  tag: { display: 'inline-block', background: '#262640', color: MUTED, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'top' },
  resourceLine: { margin: '6px 0 0', color: TEXT, fontSize: 14, lineHeight: 1.5 },
  amount: { margin: '8px 0 0', color: GOLD_SOFT, fontSize: 14, fontWeight: 700, lineHeight: 1.45 },
  resNote: { margin: '6px 0 0', color: '#ffcf99', fontSize: 13, lineHeight: 1.45 },
  sourceName: { color: MUTED, fontSize: 13, lineHeight: 1.45 },
};
