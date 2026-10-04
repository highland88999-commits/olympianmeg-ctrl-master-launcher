// app/trifold/page.jsx
// TRIFOLD landing — the acquisition funnel. Public, no login.
// Hero -> the 3-part format -> this week's issue -> sample edition ->
// pricing (plain trial terms) -> email trial signup -> archive -> share.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TRIFOLD_NAME,
  TRIFOLD_TAGLINE,
  TRIFOLD_LENSES,
  TRIFOLD_PRICE_LABEL,
  TRIFOLD_TRIAL_LABEL,
  TRIFOLD_TRIAL_DAYS,
} from '@/lib/trifold/constants';

function LensCard({ lens }) {
  const colors = {
    og: { border: '#38bdf8', glow: 'rgba(56,189,248,0.15)', badge: null },
    negative: { border: '#f43f5e', glow: 'rgba(244,63,94,0.12)', badge: 'FICTION' },
    positive: { border: '#34d399', glow: 'rgba(52,211,153,0.12)', badge: 'FICTION' },
  }[lens.key];
  return (
    <div
      style={{
        border: `1px solid ${colors.border}55`,
        background: `linear-gradient(180deg, ${colors.glow}, transparent 70%), #0d1226`,
        borderRadius: 14,
        padding: '1.4rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', color: colors.border }}>{lens.name}</h3>
        {colors.badge && (
          <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em', background: colors.border, color: '#0b0e1a', borderRadius: 4, padding: '0.15rem 0.45rem' }}>
            {colors.badge}
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 0.4rem', color: '#c9cede', fontSize: '0.95rem' }}>{lens.subtitle}</p>
      <p style={{ margin: 0, color: '#8b91a8', fontSize: '0.88rem', lineHeight: 1.5 }}>{lens.blurb}</p>
    </div>
  );
}

function TrialForm() {
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
    <form onSubmit={start} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email for free trial"
        style={{ padding: '0.8rem 1rem', borderRadius: 10, border: '1px solid #2a3352', background: '#0d1226', color: '#e8e6df', minWidth: 240, fontSize: '1rem' }}
      />
      <button
        type="submit"
        disabled={busy}
        style={{ padding: '0.8rem 1.6rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}
      >
        {busy ? 'Starting…' : `Start ${TRIFOLD_TRIAL_LABEL} trial`}
      </button>
      {error && <p style={{ width: '100%', color: '#fda4af', margin: '0.4rem 0 0' }}>{error}</p>}
    </form>
  );
}

export default function TrifoldLanding() {
  const [latest, setLatest] = useState(null);
  const [archive, setArchive] = useState([]);
  useEffect(() => {
    fetch('/api/trifold/editions')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.editions?.length) {
          setLatest(d.editions[0]);
          setArchive(d.editions.slice(1, 5));
        }
      })
      .catch(() => {});
  }, []);

  const shareText = encodeURIComponent(`${TRIFOLD_NAME} — one week, three papers: real, ruin, radiant.`);
  const shareUrl = encodeURIComponent('https://olympusverse.com/trifold');

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '2.5rem 1.25rem 4rem', color: '#e8e6df' }}>
      {/* HERO */}
      <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <p style={{ letterSpacing: '0.35em', color: '#a78bfa', fontSize: '0.8rem', margin: '0 0 0.8rem' }}>A WEEKLY NEWSLETTER</p>
        <h1 style={{ fontSize: '3.2rem', margin: '0 0 0.6rem', letterSpacing: '0.12em', background: 'linear-gradient(135deg,#e8e6df,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {TRIFOLD_NAME}
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#9aa0b5', margin: '0 0 1.6rem' }}>{TRIFOLD_TAGLINE}</p>
        <TrialForm />
        <p style={{ color: '#6b7190', fontSize: '0.82rem', marginTop: '0.8rem' }}>
          {TRIFOLD_TRIAL_LABEL}, then {TRIFOLD_PRICE_LABEL}/month. Cancel anytime. No card charged during the trial.
        </p>
      </header>

      {/* THE FORMAT */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.4rem' }}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem' }}>
          {TRIFOLD_LENSES.map((l) => <LensCard key={l.key} lens={l} />)}
        </div>
        <p style={{ textAlign: 'center', color: '#8b91a8', fontSize: '0.88rem', marginTop: '1.2rem', lineHeight: 1.6 }}>
          Every week, a newspaper from a different place in the world. We post the real stories —
          then two fully fictional rewrites: the week at its worst, and the week at its best.
          Fiction is always labeled <strong style={{ color: '#e8e6df' }}>FICTION</strong>. Never mistaken for news.
        </p>
      </section>

      {/* THIS WEEK */}
      {latest && (
        <section style={{ marginBottom: '3rem', border: '1px solid #2a3352', borderRadius: 16, padding: '1.8rem', background: '#0d1226' }}>
          <p style={{ color: '#a78bfa', fontSize: '0.8rem', letterSpacing: '0.2em', margin: '0 0 0.5rem' }}>THIS WEEK · ISSUE #{latest.issue_number}</p>
          <h2 style={{ margin: '0 0 0.4rem' }}>{latest.newspaper_name}</h2>
          <p style={{ color: '#8b91a8', margin: '0 0 1.2rem' }}>{latest.newspaper_region} · {(latest.og_stories || []).length} stories, three lenses</p>
          <Link href={`/trifold/issues/${latest.id}`} style={{ display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>
            Read the issue
          </Link>
        </section>
      )}

      {/* PRICING */}
      <section id="pricing" style={{ marginBottom: '3rem', textAlign: 'center', border: '1px solid #2a3352', borderRadius: 16, padding: '2rem', background: 'linear-gradient(180deg, rgba(124,58,237,0.08), transparent)' }}>
        <h2 style={{ margin: '0 0 0.6rem' }}>Simple pricing</h2>
        <p style={{ fontSize: '2.2rem', margin: '0.4rem 0' }}><strong>{TRIFOLD_TRIAL_LABEL}</strong></p>
        <p style={{ color: '#9aa0b5', margin: '0 0 1rem' }}>then <strong style={{ color: '#e8e6df' }}>{TRIFOLD_PRICE_LABEL}/month</strong> · cancel anytime</p>
        <p style={{ color: '#6b7190', fontSize: '0.85rem', maxWidth: 520, margin: '0 auto 1rem', lineHeight: 1.6 }}>
          Plain terms: your first {TRIFOLD_TRIAL_DAYS} days cost nothing. After that, {TRIFOLD_PRICE_LABEL} per month
          until you cancel. Cancel in one click, keep reading until the period ends. No hidden fees, no dark patterns.
        </p>
        <TrialForm />
      </section>

      {/* ARCHIVE */}
      <section style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Past issues</h2>
          <Link href="/trifold/archive" style={{ color: '#a78bfa' }}>Full archive →</Link>
        </div>
        {archive.length === 0 && <p style={{ color: '#6b7190' }}>The first issues are on their way. Check back weekly.</p>}
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          {archive.map((e) => (
            <Link key={e.id} href={`/trifold/issues/${e.id}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #232a45', borderRadius: 10, padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', background: '#0d1226' }}>
              <span><strong>Issue #{e.issue_number}</strong> · {e.newspaper_name} <span style={{ color: '#6b7190' }}>({e.newspaper_region})</span></span>
              <span style={{ color: '#a78bfa' }}>→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* SHARE */}
      <section style={{ textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>Spread the word</h2>
        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`} target="_blank" rel="noreferrer" style={shareBtn}>Post on X</a>
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noreferrer" style={shareBtn}>Share on Facebook</a>
          <a href={`https://t.me/share/url?url=${shareUrl}&text=${shareText}`} target="_blank" rel="noreferrer" style={shareBtn}>Share on Telegram</a>
          <button onClick={() => navigator.clipboard?.writeText('https://olympusverse.com/trifold')} style={{ ...shareBtn, cursor: 'pointer' }}>Copy link</button>
        </div>
      </section>
    </main>
  );
}

const shareBtn = {
  padding: '0.7rem 1.3rem', borderRadius: 10, border: '1px solid #2a3352',
  background: '#0d1226', color: '#c9cede', textDecoration: 'none', fontSize: '0.92rem',
};
