// app/oracle/page.jsx
// ORACLE — the program-request system. Public landing: what it is, the
// request form (login to submit), and the public catalog of approved/built
// requests. No login wall to browse.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ORACLE_NAME,
  ORACLE_TAGLINE,
  ORACLE_GOD_CATEGORIES,
  ORACLE_FEE_CENTS,
  oracleStatusLabel,
} from '@/lib/oracle/constants';

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

async function authed(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to submit a request.');
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || 'Something went wrong.');
  return json;
}

export default function OraclePage() {
  const [catalog, setCatalog] = useState([]);
  const [signedIn, setSignedIn] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', god_category: 'ATHENA', bounty: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session?.access_token);
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch('/api/oracle/requests', { headers });
      const json = await res.json();
      if (json.ok) setCatalog(json.catalog || []);
    } catch { /* catalog is best-effort */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const bounty_cents = Math.round(Number(form.bounty || 0) * 100);
      const json = await authed('/api/oracle/requests', {
        method: 'POST',
        body: JSON.stringify({ ...form, bounty_cents }),
      });
      setMsg({ ok: true, text: `Received — "${json.request.title}" is under review.` });
      setForm({ title: '', description: '', god_category: 'ATHENA', bounty: '' });
      load();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.hero}>
        <div style={styles.kicker}>ATHENA · WISDOM & SYSTEMS</div>
        <h1 style={styles.title}>{ORACLE_NAME}</h1>
        <p style={styles.tagline}>{ORACLE_TAGLINE}</p>
        <p style={styles.how}>
          Petition for a new pocket-universe program. Set the price <em>you</em> would pay to have it
          built — your bounty. Merlin reviews every request. Approved programs get built, and every
          transaction on one carries a flat {money(ORACLE_FEE_CENTS)} platform fee that keeps the
          universe running.
        </p>
        <Link href="/human-ai" style={styles.cta}>
          Talk to Muse to request a program →
        </Link>
        <p style={styles.ctaSub}>The fastest way: tell Muse what you want in chat and she files it into the queue for you.</p>
        <div style={styles.steps}>
          <div style={styles.step}><b>1</b> Tell Muse (or use the form below)</div>
          <div style={styles.step}><b>2</b> Merlin reviews the queue</div>
          <div style={styles.step}><b>3</b> Approved programs get built</div>
        </div>
      </header>

      <section style={styles.card}>
        <h2 style={styles.h2}>File it yourself</h2>
        <p style={styles.note}>Prefer typing to talking? The form works too — same queue, same review.</p>
        {!signedIn && (
          <p style={styles.note}>Sign in to submit — browsing the catalog below needs no account.</p>
        )}
        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>Title
            <input style={styles.input} value={form.title} maxLength={120}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Zero-gravity gardening sim" required />
          </label>
          <label style={styles.label}>What should it be?
            <textarea style={{ ...styles.input, minHeight: 110 }} value={form.description} maxLength={5000}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the world you want to walk around in…" />
          </label>
          <div style={styles.row}>
            <label style={{ ...styles.label, flex: 1 }}>God-category
              <select style={styles.input} value={form.god_category}
                onChange={(e) => setForm({ ...form, god_category: e.target.value })}>
                {ORACLE_GOD_CATEGORIES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label style={{ ...styles.label, flex: 1 }}>Your bounty (USD)
              <input style={styles.input} type="number" min="0" max="10000" step="0.01"
                value={form.bounty} onChange={(e) => setForm({ ...form, bounty: e.target.value })}
                placeholder="0.00" />
            </label>
          </div>
          {msg && <p style={msg.ok ? styles.okMsg : styles.errMsg}>{msg.text}</p>}
          <button style={styles.button} disabled={busy || !signedIn} type="submit">
            {busy ? 'Sending…' : signedIn ? 'Submit request' : 'Sign in to submit'}
          </button>
        </form>
      </section>

      <section style={styles.card}>
        <div style={styles.catalogHead}>
          <h2 style={styles.h2}>The catalog</h2>
          <Link href="/oracle/mine" style={styles.link}>My requests →</Link>
        </div>
        {catalog.length === 0 && <p style={styles.note}>Nothing approved yet — yours could be first.</p>}
        <ul style={styles.list}>
          {catalog.map((r) => (
            <li key={r.id} style={styles.item}>
              <div style={styles.itemTop}>
                <b>{r.title}</b>
                <span style={styles.badge}>{oracleStatusLabel(r.status)}</span>
              </div>
              {r.description && <p style={styles.desc}>{r.description.slice(0, 220)}{r.description.length > 220 ? '…' : ''}</p>}
              <div style={styles.meta}>
                <span>{r.god_category}</span>
                <span>Bounty {money(r.bounty_cents)}</span>
                {r.program_slug && <Link href={`/${r.program_slug}`} style={styles.link}>Open →</Link>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'radial-gradient(1200px 600px at 50% -10%, #1e2a6b 0%, #0b1026 55%, #05070f 100%)', color: '#e8ecf8', padding: '48px 20px 120px', fontFamily: 'system-ui, -apple-system, sans-serif' },
  hero: { maxWidth: 760, margin: '0 auto 32px', textAlign: 'center' },
  kicker: { fontSize: 12, letterSpacing: 3, color: '#8fa2d9', marginBottom: 12 },
  title: { fontSize: 56, margin: '0 0 8px', letterSpacing: 8, fontWeight: 800 },
  tagline: { fontSize: 18, color: '#b9c4e4', margin: '0 0 16px' },
  how: { fontSize: 15, lineHeight: 1.7, color: '#9aa7cf', maxWidth: 640, margin: '0 auto 20px' },
  cta: { display: 'inline-block', background: 'linear-gradient(135deg, #3b5bff, #7a4bff)', borderRadius: 14, padding: '14px 28px', color: '#fff', fontSize: 17, fontWeight: 800, textDecoration: 'none', margin: '6px 0 10px', boxShadow: '0 8px 30px rgba(80,110,255,0.35)' },
  ctaSub: { fontSize: 13, color: '#8fa2d9', margin: '0 0 22px' },
  steps: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  step: { background: 'rgba(120,140,220,0.08)', border: '1px solid rgba(140,160,230,0.18)', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#c6cfe9' },
  card: { maxWidth: 760, margin: '0 auto 24px', background: 'rgba(16,22,48,0.72)', border: '1px solid rgba(140,160,230,0.16)', borderRadius: 16, padding: 24, backdropFilter: 'blur(8px)' },
  h2: { margin: '0 0 12px', fontSize: 20 },
  note: { fontSize: 13, color: '#8fa2d9', margin: '0 0 12px' },
  form: { display: 'grid', gap: 14 },
  label: { display: 'grid', gap: 6, fontSize: 13, color: '#b9c4e4' },
  input: { background: '#0b1026', border: '1px solid rgba(140,160,230,0.25)', borderRadius: 10, padding: '10px 12px', color: '#e8ecf8', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  row: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  button: { background: 'linear-gradient(135deg, #3b5bff, #7a4bff)', border: 'none', borderRadius: 12, padding: '12px 20px', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  okMsg: { color: '#7ee2a8', fontSize: 13 },
  errMsg: { color: '#ff9d9d', fontSize: 13 },
  catalogHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  link: { color: '#8fa8ff', fontSize: 13, textDecoration: 'none' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 },
  item: { background: 'rgba(120,140,220,0.06)', border: '1px solid rgba(140,160,230,0.14)', borderRadius: 12, padding: 14 },
  itemTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  badge: { fontSize: 11, background: 'rgba(126,226,168,0.14)', color: '#7ee2a8', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' },
  desc: { fontSize: 13, color: '#9aa7cf', margin: '8px 0' },
  meta: { display: 'flex', gap: 16, fontSize: 12, color: '#8fa2d9' },
};
