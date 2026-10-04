// app/trifold/issues/[id]/page.jsx
// Public issue viewer — no login required (acquisition funnel).
// 7-SECOND HONEST PREVIEW: the content is readable for 7 seconds with a
// visible countdown, then a trial offer appears. The timer is always
// visible, the trial terms are stated plainly, and the offer dismisses
// with one click ("Not now") — no guilt-trip copy, no traps. Dismissing
// leaves a compact signup prompt; the full content stays behind the trial.
// FICTION lenses always render with a FICTION badge.
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  TRIFOLD_NAME,
  TRIFOLD_PRICE_LABEL,
  TRIFOLD_TRIAL_LABEL,
  TRIFOLD_TRIAL_DAYS,
} from '@/lib/trifold/constants';

const PREVIEW_SECONDS = 7;

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
        Start your <strong style={{ color: '#e8e6df' }}>{TRIFOLD_TRIAL_LABEL} free trial</strong> — then {TRIFOLD_PRICE_LABEL}/month, cancel anytime.
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

export default function IssueViewer({ params }) {
  const id = params?.id;
  const [edition, setEdition] = useState(null);
  const [missing, setMissing] = useState(false);
  const [lens, setLens] = useState('og');
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

  const stories = Array.isArray(edition.og_stories) ? edition.og_stories : [];
  const tabs = [
    { key: 'og', label: 'The OG', color: '#38bdf8', fiction: false },
    { key: 'negative', label: 'Ruin', color: '#f43f5e', fiction: true },
    { key: 'positive', label: 'Radiant', color: '#34d399', fiction: true },
  ];
  const body = lens === 'og'
    ? null
    : lens === 'negative' ? edition.negative_fiction : edition.positive_fiction;

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
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setLens(t.key)}
            style={{
              padding: '0.6rem 1.2rem', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${lens === t.key ? t.color : '#2a3352'}`,
              background: lens === t.key ? `${t.color}22` : '#0d1226',
              color: lens === t.key ? t.color : '#9aa0b5', fontWeight: 700,
            }}>
            {t.label}{t.fiction && <FictionBadge />}
          </button>
        ))}
      </div>

      {locked ? (
        dismissed ? (
          <div style={{ border: '1px dashed #2a3352', borderRadius: 12, padding: '1.4rem', textAlign: 'center', color: '#8b91a8' }}>
            <p style={{ margin: '0 0 0.8rem' }}>The preview has ended. Start your {TRIFOLD_TRIAL_LABEL} free trial to read the full issue.</p>
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
          {lens === 'og' ? (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {stories.length === 0 && <p style={{ color: '#6b7190' }}>Stories coming soon.</p>}
              {stories.map((s, i) => (
                <div key={i} style={{ border: '1px solid #232a45', borderRadius: 10, padding: '1.1rem 1.2rem', background: '#0d1226' }}>
                  <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>{s.title}</h3>
                  {s.summary && <p style={{ margin: 0, color: '#9aa0b5', fontSize: '0.92rem', lineHeight: 1.55 }}>{s.summary}</p>}
                  {s.link && <a href={s.link} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontSize: '0.85rem' }}>Read at {edition.newspaper_name} →</a>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ border: '1px solid #232a45', borderRadius: 10, padding: '1.4rem', background: '#0d1226', whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#c9cede' }}>
              {body || <span style={{ color: '#6b7190' }}>This take is still being written.</span>}
            </div>
          )}
        </article>
      )}

      <p style={{ marginTop: '2.5rem', textAlign: 'center' }}>
        <Link href="/trifold/archive" style={{ color: '#a78bfa' }}>← All issues</Link>
      </p>
    </main>
  );
}
