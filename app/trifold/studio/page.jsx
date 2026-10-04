// app/trifold/studio/page.jsx
// TRIFOLD studio — the buddy's editing surface. BUDDY-LOGIN-GATED:
// visible UI checks the session, but the REAL enforcement is server-side
// (requireBuddy: account-ID check on every edit API route). Everyone else
// sees published issues only — no edit UI, no draft traces.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TRIFOLD_NAME, TRIFOLD_AI_PROVIDERS } from '@/lib/trifold/ai';

async function authed(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in first.');
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function SignIn({ onDone }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function go(e) {
    e.preventDefault();
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
      if (error) throw error;
      setSent(true);
    } catch (err) { setError(err.message); }
  }
  if (sent) return <p style={{ color: '#9aa0b5' }}>Check your email for the sign-in link, then come back here.</p>;
  return (
    <form onSubmit={go} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="editor@example.com"
        style={input} />
      <button type="submit" style={btnPrimary}>Email me a sign-in link</button>
      {error && <p style={{ width: '100%', color: '#fda4af' }}>{error}</p>}
    </form>
  );
}

function SettingsPanel({ onSaved }) {
  const [s, setS] = useState(null);
  const [provider, setProvider] = useState('openai');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    authed('/api/trifold/settings').then((d) => {
      setS(d.settings);
      setProvider(d.settings.ai_provider);
      setEmail(d.settings.buddy_email || '');
    }).catch((e) => setMsg(e.message));
  }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const body = { ai_provider: provider, buddy_email: email };
      if (key.trim()) body.api_key = key.trim();
      const d = await authed('/api/trifold/settings', { method: 'POST', body: JSON.stringify(body) });
      setMsg('Saved.' + (d.key_configured ? ' AI key is configured.' : ''));
      setKey('');
      onSaved && onSaved();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }
  if (!s && !msg) return <p style={{ color: '#6b7190' }}>Loading settings…</p>;
  return (
    <form onSubmit={save} style={{ display: 'grid', gap: '0.8rem', maxWidth: 480 }}>
      <p style={{ color: '#9aa0b5', fontSize: '0.9rem', margin: 0 }}>
        Connect <strong>your own</strong> AI account. The key is encrypted on our server and never shown back to anyone — not even you.
        {s?.ai_key_configured ? ' ✓ Key on file.' : ' No key on file yet.'}
      </p>
      <label style={label}>AI provider
        <select value={provider} onChange={(e) => setProvider(e.target.value)} style={input}>
          {TRIFOLD_AI_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label style={label}>Your {provider} API key (write-only)
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s?.ai_key_configured ? '•••••••• (on file — leave blank to keep)' : 'paste your key'} style={input} autoComplete="off" />
      </label>
      <label style={label}>Editor email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={input} />
      </label>
      <div><button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Saving…' : 'Save settings'}</button></div>
      {msg && <p style={{ color: '#9aa0b5', margin: 0 }}>{msg}</p>}
    </form>
  );
}

function EditionEditor({ edition, onChange, onPublish, onNotify, busy }) {
  const [neg, setNeg] = useState(edition.negative_fiction || '');
  const [pos, setPos] = useState(edition.positive_fiction || '');
  const [genBusy, setGenBusy] = useState('');
  useEffect(() => { setNeg(edition.negative_fiction || ''); setPos(edition.positive_fiction || ''); }, [edition.id]);
  async function generate(tone) {
    setGenBusy(tone);
    try {
      await authed('/api/trifold/generate', { method: 'POST', body: JSON.stringify({ edition_id: edition.id, tone }) });
      onChange();
    } catch (e) { alert(e.message); }
    setGenBusy('');
  }
  async function save() {
    try {
      await authed(`/api/trifold/editions/${edition.id}`, { method: 'PATCH', body: JSON.stringify({ negative_fiction: neg, positive_fiction: pos, status: 'review' }) });
      onChange();
    } catch (e) { alert(e.message); }
  }
  const stories = Array.isArray(edition.og_stories) ? edition.og_stories : [];
  return (
    <div style={{ display: 'grid', gap: '1.2rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.4rem' }}>{edition.newspaper_name} <span style={{ color: '#6b7190', fontWeight: 400 }}>({edition.newspaper_region})</span></h3>
        <p style={{ color: '#8b91a8', margin: '0 0 0.8rem' }}>Status: <strong>{edition.status}</strong> · {stories.length} real stories</p>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {stories.map((st, i) => (
            <div key={i} style={{ fontSize: '0.9rem', color: '#9aa0b5' }}><strong style={{ color: '#c9cede' }}>{i + 1}.</strong> {st.title}</div>
          ))}
          {stories.length === 0 && <p style={{ color: '#fbbf24' }}>No stories fetched — paste the week's top stories into the OG section, or re-run the weekly cron.</p>}
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0 }}>Ruin <span style={fictionTag}>FICTION</span></h4>
          <button onClick={() => generate('negative')} disabled={genBusy} style={btnSmall}>{genBusy === 'negative' ? 'Writing…' : '✨ Draft with my AI'}</button>
        </div>
        <textarea value={neg} onChange={(e) => setNeg(e.target.value)} rows={10} style={textarea} placeholder="The fictional worst-case edition…" />
      </div>
      <div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0 }}>Radiant <span style={fictionTag}>FICTION</span></h4>
          <button onClick={() => generate('positive')} disabled={genBusy} style={btnSmall}>{genBusy === 'positive' ? 'Writing…' : '✨ Draft with my AI'}</button>
        </div>
        <textarea value={pos} onChange={(e) => setPos(e.target.value)} rows={10} style={textarea} placeholder="The fictional best-case edition…" />
      </div>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy} style={btnPrimary}>Save draft</button>
        <button onClick={() => generate('both')} disabled={genBusy} style={btnGhost}>{genBusy === 'both' ? 'Writing both…' : '✨ Draft both takes'}</button>
        {edition.status !== 'published' && (
          <button onClick={onPublish} disabled={busy} style={btnGold}>Publish issue</button>
        )}
        {edition.status === 'published' && (
          <button onClick={onNotify} disabled={busy} style={btnGold}>📧 Email subscribers</button>
        )}
      </div>
      <p style={{ color: '#6b7190', fontSize: '0.85rem', margin: 0 }}>
        Review everything before publishing — the machine drafts, you decide. Publishing assigns the next issue number and makes it public.
      </p>
    </div>
  );
}

export default function TrifoldStudio() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [editions, setEditions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('issues');

  const refresh = useCallback(async () => {
    try {
      const d = await authed('/api/trifold/editions?all=1');
      setEditions(d.editions);
      if (!activeId && d.editions.length) setActiveId(d.editions[0].id);
    } catch { /* not the editor — the API said so */ }
  }, [activeId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data?.session?.user || null); setChecked(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  async function publish() {
    const ed = editions.find((e) => e.id === activeId);
    if (!ed) return;
    if (!window.confirm(`Publish this issue? It becomes Issue #${(editions.filter((e) => e.status === 'published').length) + 1} and goes public.`)) return;
    setBusy(true);
    try {
      await authed(`/api/trifold/editions/${activeId}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
      await refresh();
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function notify() {
    setBusy(true);
    try {
      const d = await authed('/api/trifold/notify', { method: 'POST', body: JSON.stringify({ edition_id: activeId }) });
      alert(`Sent to ${d.sent} subscriber${d.sent === 1 ? '' : 's'}.`);
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  const active = editions.find((e) => e.id === activeId);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.25rem 4rem', color: '#e8e6df' }}>
      <h1 style={{ margin: '0 0 0.3rem' }}>{TRIFOLD_NAME} studio</h1>
      <p style={{ color: '#8b91a8', margin: '0 0 2rem' }}>Editor only. Drafts never leak to the public side.</p>

      {!checked && <p style={{ color: '#6b7190' }}>Loading…</p>}
      {checked && !user && (
        <div style={{ border: '1px solid #2a3352', borderRadius: 12, padding: '1.6rem', background: '#0d1226' }}>
          <h3 style={{ margin: '0 0 0.8rem' }}>Editor sign-in</h3>
          <SignIn />
        </div>
      )}
      {checked && user && (
        <>
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.6rem' }}>
            {[['issues', 'Issues'], ['settings', 'Settings']].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ ...btnGhost, borderColor: tab === k ? '#7c3aed' : '#2a3352', color: tab === k ? '#c4b5fd' : '#9aa0b5' }}>{label}</button>
            ))}
            <span style={{ marginLeft: 'auto', color: '#6b7190', fontSize: '0.85rem', alignSelf: 'center' }}>{user.email}</span>
          </div>

          {tab === 'settings' && <SettingsPanel />}

          {tab === 'issues' && (
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>
              <div>
                {editions.map((e) => (
                  <button key={e.id} onClick={() => setActiveId(e.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.5rem', padding: '0.7rem 0.9rem', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${activeId === e.id ? '#7c3aed' : '#232a45'}`, background: '#0d1226', color: '#e8e6df' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{e.status === 'published' ? `#${e.issue_number}` : '(draft)'} {e.newspaper_name}</div>
                    <div style={{ fontSize: '0.78rem', color: e.status === 'published' ? '#34d399' : '#fbbf24' }}>{e.status}</div>
                  </button>
                ))}
                {editions.length === 0 && <p style={{ color: '#6b7190', fontSize: '0.9rem' }}>No issues yet — the weekly cron drafts one every Monday.</p>}
              </div>
              <div>
                {active
                  ? <EditionEditor edition={active} onChange={refresh} onPublish={publish} onNotify={notify} busy={busy} />
                  : <p style={{ color: '#6b7190' }}>Pick an issue.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

const input = { padding: '0.7rem 1rem', borderRadius: 10, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', width: '100%', boxSizing: 'border-box' };
const label = { display: 'grid', gap: '0.35rem', fontSize: '0.88rem', color: '#9aa0b5' };
const textarea = { width: '100%', boxSizing: 'border-box', padding: '0.9rem', borderRadius: 10, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontFamily: 'inherit', fontSize: '0.92rem', lineHeight: 1.6 };
const btnPrimary = { padding: '0.7rem 1.4rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const btnGold = { padding: '0.7rem 1.4rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b45309,#92400e)', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '0.7rem 1.2rem', borderRadius: 10, border: '1px solid #2a3352', background: 'transparent', color: '#9aa0b5', cursor: 'pointer' };
const btnSmall = { padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0d1226', color: '#c4b5fd', cursor: 'pointer', fontSize: '0.82rem' };
const fictionTag = { fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', background: '#f43f5e', color: '#fff', borderRadius: 4, padding: '0.12rem 0.4rem', marginLeft: '0.4rem' };
