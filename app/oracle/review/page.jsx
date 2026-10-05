// app/oracle/review/page.jsx
// ORACLE review queue — Merlin's private surface. MERLIN-LOGIN-GATED:
// visible UI checks the session, but the REAL enforcement is server-side
// (requireReviewer: account check on every review API route).
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ORACLE_NAME, ORACLE_STATUSES, oracleStatusLabel, oracleOriginLabel } from '@/lib/oracle/constants';

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

async function authed(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in first.');
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || 'Something went wrong.');
  return json;
}

export default function OracleReview() {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [state, setState] = useState('loading');
  const [notes, setNotes] = useState({});
  const [slugs, setSlugs] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(async (f) => {
    setState('loading');
    try {
      const json = await authed(`/api/oracle/requests?scope=review${f ? `&status=${f}` : ''}`);
      setRows(json.requests || []);
      setTotals(json.totals || null);
      setState('done');
    } catch (err) {
      setState(err.message.includes('Only') || err.message.includes('allowed') ? 'denied' : 'error');
    }
  }, []);

  useEffect(() => { load(filter); }, [load, filter]);

  async function act(id, action) {
    setBusy(id + action);
    try {
      await authed(`/api/oracle/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          note: notes[id] || '',
          program_slug: slugs[id] || '',
        }),
      });
      load(filter);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <Link href="/oracle" style={styles.link}>← {ORACLE_NAME}</Link>
        <h1 style={styles.h1}>Review queue</h1>
        {totals && (
          <div style={styles.totals}>
            <span>Pending <b>{totals.pending}</b></span>
            <span>Approved <b>{totals.approved}</b></span>
            <span>Built <b>{totals.built}</b></span>
            <span>Open bounties <b>{money(totals.bounty_cents)}</b></span>
          </div>
        )}
        <div style={styles.filters}>
          {['', ...ORACLE_STATUSES].map((s) => (
            <button key={s || 'all'} onClick={() => setFilter(s)}
              style={filter === s ? styles.fActive : styles.fBtn}>
              {s ? oracleStatusLabel(s) : 'All'}
            </button>
          ))}
        </div>
        {state === 'loading' && <p style={styles.note}>Loading…</p>}
        {state === 'denied' && <p style={styles.note}>This queue is Merlin&apos;s eyes only.</p>}
        {state === 'error' && <p style={styles.note}>Could not load the queue.</p>}
        {state === 'done' && rows.length === 0 && <p style={styles.note}>Nothing here.</p>}
        <ul style={styles.list}>
          {rows.map((r) => (
            <li key={r.id} style={styles.item}>
              <div style={styles.top}>
                <b>{r.title}</b>
                <span style={{ display: 'flex', gap: 6 }}>
                  <span style={styles.originBadge}>{oracleOriginLabel(r.origin)}</span>
                  <span style={styles.badge}>{oracleStatusLabel(r.status)}</span>
                </span>
              </div>
              <p style={styles.desc}>{r.description || '—'}</p>
              <div style={styles.meta}>
                <span>{r.god_category}</span>
                <span>Bounty {money(r.bounty_cents)}</span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
                {r.requester_contact && <span>Contact: {r.requester_contact}</span>}
              </div>
              {r.reviewer_note && <p style={styles.prevNote}>Note: {r.reviewer_note}</p>}
              <input style={styles.input} placeholder="Reviewer note (optional)"
                value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <div style={styles.actions}>
                {r.status === 'pending' && (
                  <>
                    <button style={styles.approve} disabled={busy} onClick={() => act(r.id, 'approve')}>
                      {busy === r.id + 'approve' ? '…' : 'Approve'}</button>
                    <button style={styles.decline} disabled={busy} onClick={() => act(r.id, 'decline')}>
                      {busy === r.id + 'decline' ? '…' : 'Decline'}</button>
                  </>
                )}
                {r.status === 'approved' && (
                  <>
                    <input style={{ ...styles.input, maxWidth: 220 }} placeholder="program slug (e.g. neon-garden)"
                      value={slugs[r.id] || ''} onChange={(e) => setSlugs({ ...slugs, [r.id]: e.target.value })} />
                    <button style={styles.approve} disabled={busy} onClick={() => act(r.id, 'build')}>
                      {busy === r.id + 'build' ? '…' : 'Mark built + link'}</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#070b18', color: '#e8ecf8', padding: '40px 20px 120px', fontFamily: 'system-ui, -apple-system, sans-serif' },
  wrap: { maxWidth: 860, margin: '0 auto' },
  h1: { fontSize: 30, margin: '12px 0 16px' },
  link: { color: '#8fa8ff', fontSize: 13, textDecoration: 'none' },
  note: { color: '#8fa2d9', fontSize: 14 },
  totals: { display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#9aa7cf', background: 'rgba(120,140,220,0.07)', border: '1px solid rgba(140,160,230,0.15)', borderRadius: 12, padding: '10px 16px', marginBottom: 16 },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  fBtn: { background: 'transparent', border: '1px solid rgba(140,160,230,0.25)', color: '#b9c4e4', borderRadius: 20, padding: '6px 14px', fontSize: 12, cursor: 'pointer' },
  fActive: { background: '#3b5bff', border: '1px solid #3b5bff', color: '#fff', borderRadius: 20, padding: '6px 14px', fontSize: 12, cursor: 'pointer' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 },
  item: { background: 'rgba(16,22,48,0.8)', border: '1px solid rgba(140,160,230,0.16)', borderRadius: 14, padding: 16 },
  top: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  badge: { fontSize: 11, background: 'rgba(255,200,90,0.14)', color: '#ffcf7a', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' },
  originBadge: { fontSize: 11, background: 'rgba(140,170,255,0.14)', color: '#9db4ff', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' },
  desc: { fontSize: 13, color: '#9aa7cf', margin: '8px 0', whiteSpace: 'pre-wrap' },
  meta: { display: 'flex', gap: 16, fontSize: 12, color: '#8fa2d9', flexWrap: 'wrap' },
  prevNote: { fontSize: 12, color: '#b9c4e4', fontStyle: 'italic' },
  input: { background: '#0b1026', border: '1px solid rgba(140,160,230,0.25)', borderRadius: 10, padding: '8px 12px', color: '#e8ecf8', fontSize: 13, width: '100%', boxSizing: 'border-box', marginTop: 10 },
  actions: { display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' },
  approve: { background: 'linear-gradient(135deg, #2f9e63, #37c978)', border: 'none', borderRadius: 10, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  decline: { background: 'transparent', border: '1px solid rgba(255,140,140,0.4)', borderRadius: 10, padding: '8px 18px', color: '#ff9d9d', fontSize: 13, cursor: 'pointer' },
};
