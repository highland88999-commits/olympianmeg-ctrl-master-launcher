'use client';
// app/social-assistance/page.jsx — Omega Social Assistance.
// Pick a province, state or territory, see that jurisdiction's

import { useMemo, useState } from 'react';
import {
  CATEGORIES,
  DISCLAIMER,
  JURISDICTIONS,
  categoryById,
  emptyCategoriesFor,
  jurisdictionById,
  programsFor,
} from '../../lib/social-assistance/data';

const GOLD = '#d4a017';
const GOLD_SOFT = '#f5c542';
const INDIGO_BG = '#0d0d1f';
const INDIGO_CARD = '#171730';
const INDIGO_LINE = '#2c2c52';
const TEXT = '#f2f0ff';
const MUTED = '#b9b4d6';

const DEFAULT_JURISDICTION = 'alberta';

// --- category graphics ---

// One 900x600 WebP per program category, in
// public/images/social-assistance/categories/<id>.webp, plus the page
// background at public/images/social-assistance/background.webp
// (1920x1080, very dark low-contrast gold nebula). All 8 real category
// ids have art: a program whose category is null / unmapped renders NO
// image — never a wrong one, never a broken one.
const CATEGORY_IMAGE_IDS = new Set([
  'income', 'disability', 'children', 'food',
  'housing', 'health', 'emergency', 'education',
]);
const BACKGROUND_IMAGE_SRC = '/images/social-assistance/background.webp';

function categoryImageSrc(id) {
  if (!id || typeof id !== 'string') return null;
  return CATEGORY_IMAGE_IDS.has(id) ? `/images/social-assistance/categories/${id}.webp` : null;
}

export default function SocialAssistancePage() {
  const [jurisdictionId, setJurisdictionId] = useState(DEFAULT_JURISDICTION);
  const [categoryId, setCategoryId] = useState(null);

  const jurisdiction = jurisdictionById(jurisdictionId) || JURISDICTIONS[0];
  const visible = useMemo(
    () => programsFor(jurisdiction.id, categoryId),
    [jurisdiction, categoryId],
  );
  const emptyCategories = useMemo(
    () => emptyCategoriesFor(jurisdiction.id),
    [jurisdiction],
  );
  const totalPrograms = useMemo(
    () => JURISDICTIONS.reduce((n, j) => n + programsFor(j.id).length, 0),
    [],
  );

  return (
    <main style={styles.page} data-testid="social-assistance-page">
      <img src={BACKGROUND_IMAGE_SRC} alt="" aria-hidden="true" data-testid="social-assistance-background" style={styles.bgImg} />
      <div style={styles.wrap}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.mark} aria-hidden="true">Ω</div>
          <div>
            <h1 style={styles.title}>Social Assistance</h1>
            <p style={styles.byline}>by Omega</p>
          </div>
          <p style={styles.sourceCount}>
            {totalPrograms} programs · {JURISDICTIONS.length} jurisdictions
          </p>
        </header>

        {/* What this page is — and what it is not */}
        <section style={styles.card} aria-label="About this page">
          <h2 style={styles.h2}>Government help, in plain words</h2>
          <p style={styles.note}>
            Pick where you live and see the assistance programs for that
            place — income support, disability support, help for families,
            food, housing, health coverage, emergency aid and education.
            Every entry says what it is, who it is for, and how to apply,
            with a link to the official government page.
          </p>
          <p style={styles.note}>{DISCLAIMER}</p>
        </section>

        {/* Jurisdiction picker */}
        <section style={styles.card} aria-label="Where do you live?">
          <h2 style={styles.h2}>Where do you live?</h2>
          <div style={styles.chipRow} data-testid="jurisdiction-picker">
            {JURISDICTIONS.map((j) => (
              <button
                key={j.id}
                type="button"
                data-testid={`jurisdiction-${j.id}`}
                onClick={() => { setJurisdictionId(j.id); setCategoryId(null); }}
                style={j.id === jurisdiction.id ? styles.chipActive : styles.chip}
                aria-pressed={j.id === jurisdiction.id}
              >
                {j.name}
              </button>
            ))}
          </div>
          <p style={styles.note}>{jurisdiction.blurb}</p>
          <p style={styles.note}>
            {jurisdiction.startHere}{' '}
            <a href={jurisdiction.startHereUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
              Official starting point
            </a>
          </p>
        </section>

        {/* Category chips */}
        <section style={styles.card} aria-label="What kind of help?">
          <h2 style={styles.h2}>What kind of help?</h2>
          <div style={styles.chipRow}>
            <button
              type="button"
              data-testid="category-all"
              onClick={() => setCategoryId(null)}
              style={categoryId === null ? styles.chipActive : styles.chip}
              aria-pressed={categoryId === null}
            >
              All ({programsFor(jurisdiction.id).length})
            </button>
            {CATEGORIES.map((c) => {
              const count = programsFor(jurisdiction.id, c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`category-${c.id}`}
                  onClick={() => setCategoryId(c.id)}
                  disabled={count === 0}
                  style={count === 0 ? styles.chipDisabled : (categoryId === c.id ? styles.chipActive : styles.chip)}
                  aria-pressed={categoryId === c.id}
                >
                  {c.label} ({count})
                </button>
              );
            })}
          </div>
          {categoryId ? (
            <p style={styles.note}>{categoryById(categoryId)?.blurb}</p>
          ) : null}
        </section>

        {/* Program list */}
        <section style={styles.card} aria-label="Programs" data-testid="program-list">
          <h2 style={styles.h2}>
            {categoryId ? categoryById(categoryId)?.label : 'All programs'} in {jurisdiction.name}
            {' '}({visible.length})
          </h2>
          {visible.length === 0 ? (
            <p style={styles.note}>
              No program of this kind is listed for {jurisdiction.name} yet.
              Try another kind of help, or another place — and the official
              starting point above can still point you to the right office.
            </p>
          ) : null}
          {visible.map((p) => {
            const thumbSrc = categoryImageSrc(p.category);
            return (
            <article key={p.id} style={styles.program} data-testid="program-card" data-program-id={p.id}>
              <div style={styles.programMedia}>
                {thumbSrc ? (
                  <img src={thumbSrc} alt="" data-testid={`program-thumb-${p.category}`} style={styles.programThumb} />
                ) : null}
                <div style={styles.programMain}>
                  <h3 style={styles.h3}>{p.name}</h3>
                  <p style={styles.meta}>{categoryById(p.category)?.label} · {p.source}</p>
                </div>
              </div>
              <p style={styles.field}><strong>What it is: </strong>{p.what}</p>
              <p style={styles.field}><strong>Who it is for: </strong>{p.who}</p>
              <p style={styles.field}><strong>How to apply: </strong>{p.apply}</p>
              <p style={styles.field}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                  Official page — {p.source}
                </a>
              </p>
            </article>
            );
          })}
        </section>

        {/* Honest gaps: categories with nothing listed here */}
        {categoryId === null && emptyCategories.length > 0 ? (
          <section style={styles.card} aria-label="Not listed here">
            <h2 style={styles.h2}>Not listed for {jurisdiction.name}</h2>
            {emptyCategories.map((c) => (
              <p key={c.id} style={styles.note}>
                <strong>{c.label}:</strong> no program of this kind is
                listed for {jurisdiction.name} yet. {c.id === 'food' && jurisdiction.id === 'alberta'
                  ? 'Emergency food help is part of Alberta Supports — call 1-877-644-9992 — and the federal Canada Groceries and Essentials Benefit is listed under Canada — federal.'
                  : c.id === 'emergency' && jurisdiction.id === 'canada'
                    ? 'Federal emergency help runs through the provinces — see Alberta’s Emergency Financial Assistance, or call Service Canada at 1-800-277-9914.'
                    : 'Check the official starting point above — the program may be run under a different name.'}
              </p>
            ))}
          </section>
        ) : null}

        <p style={styles.note}>
          More provinces, states and territories are being added the same
          way — one jurisdiction at a time, from official sources only.
        </p>
      </div>
    </main>
  );
}

const styles = {
  page: { background: INDIGO_BG, color: TEXT, minHeight: '100vh', padding: '16px 12px 48px', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", position: 'relative' },
  // Page background graphic, fixed behind the content (the dark page
  // background above stays underneath as the fallback). Dimmed so the
  // cards and text stay fully legible; cards are opaque.
  bgImg: { position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.35, pointerEvents: 'none' },
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
  h3: { margin: '0 0 4px', fontSize: 16, color: TEXT },
  note: { margin: '0 0 12px', color: MUTED, fontSize: 14, lineHeight: 1.5 },
  meta: { margin: '0 0 10px', color: GOLD_SOFT, fontSize: 13, fontWeight: 600 },
  field: { margin: '0 0 8px', color: TEXT, fontSize: 14, lineHeight: 1.5 },
  link: { color: GOLD_SOFT, fontWeight: 600 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { background: '#0d0d1f', color: TEXT, border: `1px solid ${INDIGO_LINE}`, borderRadius: 999, padding: '9px 14px', fontSize: 14, cursor: 'pointer' },
  chipActive: { background: GOLD, color: '#201600', border: `1px solid ${GOLD_SOFT}`, borderRadius: 999, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  chipDisabled: { background: '#0d0d1f', color: '#6b6690', border: `1px solid ${INDIGO_LINE}`, borderRadius: 999, padding: '9px 14px', fontSize: 14, cursor: 'not-allowed' },
  program: { borderTop: `1px solid ${INDIGO_LINE}`, padding: '14px 0 6px' },
  // Thumb row: the category thumb sits left of the title/meta column,
  // in normal flow — it never overlaps anything, it just widens the
  // card's first row by its own 72 px.
  programMedia: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  programMain: { flex: 1, minWidth: 0 },
  programThumb: { width: 72, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
};
