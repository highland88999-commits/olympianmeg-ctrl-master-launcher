'use client';

import React, { useMemo, useState } from 'react';
import { useI18n, LANGUAGES } from '../../lib/i18n';
import ALL_LANGUAGES from '../../lib/i18n/all-languages.json';

// ---------------------------------------------------------------------------
// LANGUAGES — every language on Earth, shown in its own script.
// Tapping one of the 31 supported app locales (7 human + 24 AI translations)
// switches the whole app to that language; anything else shows a friendly
// "not yet translated" note — no dead ends.
// ---------------------------------------------------------------------------

const SUPPORTED = new Set(LANGUAGES.map((l) => l.code));
const MACHINE = new Set(LANGUAGES.filter((l) => l.machine).map((l) => l.code));
const SUPPORTED_COUNT = SUPPORTED.size;

// Most-spoken world languages NOT yet machine-translated, shown under supported.
const POPULAR_CODES = ['jv', 'te', 'mr'];

const byCode = new Map(ALL_LANGUAGES.map((l) => [l.code, l]));
const langByCode = new Map(LANGUAGES.map((l) => [l.code, l]));

// Supported first (human translations, then AI machine translations),
// then the most-spoken not-yet-translated languages.
const POPULAR_EXTRA = POPULAR_CODES.map((c) => byCode.get(c)).filter(Boolean);

function LanguageRow({ lang, supported, machine, active, onPick, note }) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onPick(lang)}
        aria-label={lang.name}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 16px',
          minHeight: 64,
          background: active ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)',
          border: active ? '1px solid rgba(129,140,248,0.7)' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          color: '#f1f5f9',
          cursor: 'pointer',
          textAlign: 'left',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            dir="auto"
            style={{
              display: 'block',
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.35,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {lang.native}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 13,
              color: '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {lang.name}
          </span>
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            color: '#64748b',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            padding: '3px 7px',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {lang.code}
        </span>
        {supported && (
          <span style={{ fontSize: 12, color: '#34d399', flexShrink: 0 }}>
            {active ? '●' : '○'}
          </span>
        )}
        {machine && (
          <span
            title="AI machine translation"
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1,
              color: '#a78bfa',
              border: '1px solid rgba(167,139,250,0.4)',
              borderRadius: 6,
              padding: '3px 7px',
              flexShrink: 0,
            }}
          >
            AI
          </span>
        )}
      </button>
      {note && (
        <div
          role="status"
          style={{
            marginTop: 8,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(251,191,36,0.10)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: '#fcd34d',
            fontSize: 14,
          }}
        >
          Not yet translated — currently available in {SUPPORTED_COUNT} languages.
        </div>
      )}
    </div>
  );
}

export default function LanguagesPage() {
  const { lang, setLang, t } = useI18n();
  const [query, setQuery] = useState('');
  const [notedCode, setNotedCode] = useState(null);

  const q = query.trim().toLowerCase();
  const matches = (l) =>
    !q ||
    l.native.toLowerCase().includes(q) ||
    l.name.toLowerCase().includes(q);

  // All 31 app languages first: 7 human translations, then 24 AI translations.
  const supportedRows = useMemo(
    () =>
      LANGUAGES.map((l) => byCode.get(l.code))
        .filter(Boolean)
        .filter(matches),
    [q]
  );
  const popularExtra = useMemo(() => POPULAR_EXTRA.filter(matches), [q]);
  const rest = useMemo(
    () =>
      ALL_LANGUAGES.filter(
        (l) => !SUPPORTED.has(l.code) && !POPULAR_CODES.includes(l.code) && matches(l)
      ),
    [q]
  );

  const pick = (l) => {
    if (SUPPORTED.has(l.code)) {
      setLang(l.code);
      setNotedCode(null);
    } else {
      setNotedCode(l.code);
    }
  };

  const sectionLabel = (text) => (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: '#64748b',
        margin: '26px 0 12px',
      }}
    >
      {text}
    </h2>
  );

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0b1026 0%, #060913 100%)',
        color: '#f1f5f9',
        paddingBottom: 'calc(120px + env(safe-area-inset-bottom))',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Arabic', 'Noto Sans Devanagari', 'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Noto Sans CJK KR', sans-serif",
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
        <header style={{ padding: '28px 0 8px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
            {t('sat.languages.title')}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 15, margin: '6px 0 0' }}>
            {t('sat.languages.subtitle')}
          </p>
        </header>

        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            padding: '12px 0',
            background: 'rgba(6,9,19,0.92)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search languages…"
            aria-label="Search languages"
            enterKeyHint="search"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: 17,
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: '#f1f5f9',
              outline: 'none',
            }}
          />
        </div>

        {supportedRows.length > 0 && (
          <section aria-label="App languages">
            {sectionLabel(`App languages · ${supportedRows.length}`)}
            <div style={{ display: 'grid', gap: 10 }}>
              {supportedRows.map((l) => (
                <LanguageRow
                  key={l.code}
                  lang={l}
                  supported
                  machine={MACHINE.has(l.code)}
                  active={lang === l.code}
                  onPick={pick}
                  note={false}
                />
              ))}
            </div>
          </section>
        )}

        {popularExtra.length > 0 && (
          <section aria-label="Popular languages">
            {sectionLabel(`Popular · ${popularExtra.length}`)}
            <div style={{ display: 'grid', gap: 10 }}>
              {popularExtra.map((l) => (
                <LanguageRow
                  key={l.code}
                  lang={l}
                  supported={false}
                  machine={false}
                  active={false}
                  onPick={pick}
                  note={notedCode === l.code}
                />
              ))}
            </div>
          </section>
        )}

        <section aria-label="All languages">
          {sectionLabel(`All languages · ${rest.length}`)}
          <div style={{ display: 'grid', gap: 10 }}>
            {rest.map((l) => (
              <LanguageRow
                key={l.code}
                lang={l}
                supported={false}
                machine={false}
                active={false}
                onPick={pick}
                note={notedCode === l.code}
              />
            ))}
          </div>
          {rest.length === 0 && popularExtra.length === 0 && supportedRows.length === 0 && (
            <p style={{ color: '#64748b', textAlign: 'center', padding: '40px 0' }}>
              No languages match “{query}”.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
