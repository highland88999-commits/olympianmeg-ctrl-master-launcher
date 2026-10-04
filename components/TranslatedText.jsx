// components/TranslatedText.jsx
// Renders user content with an optional user-initiated translation.
// The target is the viewer's preferred language (default English —
// Merlin's rule). The original always renders first; a subtle
// "Translate" tap swaps to the translation with a
// "Translated from X · Show original" toggle. Nothing is sent anywhere
// until the user taps.
//
// Drop-in reusable: <TranslatedText as="h3" className="…" text={title} target={lang} />
'use client';

import { useState } from 'react';
import { needsTranslation, targetDefault, isValidLanguageCode, languageName } from '@/lib/translate';

const triggerStyle = {
  display: 'inline-block',
  marginLeft: '0.5rem',
  padding: '0.1rem 0.55rem',
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: '#8ea2c9',
  background: 'rgba(120,150,220,0.10)',
  border: '1px solid rgba(120,150,220,0.22)',
  borderRadius: '999px',
  cursor: 'pointer',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

const tagStyle = {
  display: 'inline-block',
  marginLeft: '0.5rem',
  fontSize: '0.72rem',
  color: '#7d8aa5',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  whiteSpace: 'nowrap',
};

export default function TranslatedText({ text, as: Tag = 'span', className, target, style }) {
  const [phase, setPhase] = useState('idle'); // idle | loading | done | error
  const [translated, setTranslated] = useState('');
  const [sourceName, setSourceName] = useState('');
  const original = String(text || '');
  // The target is the viewer's preferred language (default English).
  // Content already in that language gets no translate UI at all, ever.
  const effTarget = isValidLanguageCode(target) ? target.trim() : targetDefault();
  if (!needsTranslation(original, effTarget)) {
    return <Tag className={className} style={style}>{original}</Tag>;
  }

  async function doTranslate() {
    if (phase === 'loading') return;
    setPhase('loading');
    try {
      const r = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: original, target: effTarget }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || !data.ok || !data.translated) {
        throw new Error((data && data.error) || 'translate failed');
      }
      setTranslated(data.translated);
      setSourceName(data.sourceName || 'another language');
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }

  return (
    <Tag className={className} style={style}>
      {phase === 'done' ? translated : original}
      {phase === 'idle' && (
        <button type="button" style={triggerStyle} onClick={doTranslate} aria-label={`Translate to ${languageName(effTarget)}`}>
          Translate
        </button>
      )}
      {phase === 'loading' && (
        <span style={{ ...triggerStyle, cursor: 'default', opacity: 0.7 }} aria-live="polite">
          Translating…
        </span>
      )}
      {phase === 'done' && (
        <button
          type="button"
          style={tagStyle}
          onClick={() => setPhase('idle')}
          aria-label="Show original text"
        >
          Translated from {sourceName} · Show original
        </button>
      )}
      {phase === 'error' && (
        <span style={{ ...tagStyle, cursor: 'default', textDecoration: 'none' }}>
          Couldn&apos;t translate — showing original
        </span>
      )}
    </Tag>
  );
}
