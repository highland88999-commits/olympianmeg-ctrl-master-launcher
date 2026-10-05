// app/oracle/mine/page.jsx
// Your requests — every petition you filed and where it stands.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ORACLE_NAME, oracleStatusLabel } from '@/lib/oracle/constants';

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function MyOracleRequests() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setState('signin'); return; }
      try {
        const res = await fetch('/api/oracle/requests', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        setRows(json.mine || []);
        setState('done');
      } catch {
        setState('error');
      }
    })();
  }, []);

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <Link href="/oracle" style={styles.link}>← {ORACLE_NAME}</Link>
        <h1 style={styles.h1}>My requests</h1>
        {state === 'loading' && <p style={styles.note}>Loading…</p>}
        {state === 'signin' && <p style={styles.note}>Sign in to see your requests.</p>}
        {state === 'error' && <p style={styles.note}>Could not load your requests. Try again.</p>}
        {state === 'done' && rows.length === 0 && (
          <p style={styles.note}>You haven&apos;t requested anything yet.</p>
        )}
        <ul style={styles.list}>
          {rows.map((r) => (
            <li key={r.id} style={styles.item}>
              <div style={styles.top}>
                <b>{r.title}</b>
                <span style={badgeStyle(r.status)}>{oracleStatusLabel(r.status)}</span>
              </div>
              <div style={styles.meta}>
                <span>{r.god_category}</span>
                <span>Bounty {money(r.bounty_cents)}</span>
                <span>{new Date(r.created_at).toLocaleDateString()}</span>
                {r.program_slug && <Link href={`/${r.program_slug}`} style={styles.link}>Open →</Link>}
              </div>
              {r.reviewer_note && <p style={styles.note2}>Merlin: {r.reviewer_note}</p>}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function badgeStyle(status) {
  const colors = {
    pending: ['rgba(255,200,90,0.14)', '#ffcf7a'],
    approved: ['rgba(140,170,255,0.14)', '#9db4ff'],
    declined: ['rgba(255,140,140,0.12)', '#ff9d9d'],
    built: ['rgba(126,226,168,0.14)', '#7ee2a8'],
  };
  const [bg, fg] = colors[status] || colors.pending;
  return { fontSize: 11, background: bg, color: fg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' };
}

const styles = {
  page: { minHeight: '100vh', background: '#0b1026', color: '#e8ecf8', padding: '40px 20px 120px', fontFamily: 'system-ui, -apple-system, sans-serif' },
  wrap: { maxWidth: 760, margin: '0 auto' },
  h1: { fontSize: 32, margin: '12px 0 20px' },
  link: { color: '#8fa8ff', fontSize: 13, textDecoration: 'none' },
  note: { color: '#8fa2d9', fontSize: 14 },
  note2: { color: '#b9c4e4', fontSize: 13, margin: '8px 0 0', fontStyle: 'italic' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 },
  item: { background: 'rgba(120,140,220,0.06)', border: '1px solid rgba(140,160,230,0.14)', borderRadius: 12, padding: 14 },
  top: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  meta: { display: 'flex', gap: 16, fontSize: 12, color: '#8fa2d9', marginTop: 8, flexWrap: 'wrap' },
};
