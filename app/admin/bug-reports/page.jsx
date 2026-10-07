// app/admin/bug-reports/page.jsx
// Merlin-only bug report inbox. The server enforces Merlin-only on every
// route; this page just won't render anything useful for anyone else.
//
// Status flow: open -> in-progress -> fixed (or wont-fix).
'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

function ts(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso || ''; }
}

const STATUSES = ['open', 'in-progress', 'fixed', 'wont-fix'];

const statusColor = {
  'open': '#f87171',
  'in-progress': '#fbbf24',
  'fixed': '#34d399',
  'wont-fix': '#a1a1aa',
};

const card = {
  border: '1px solid #2a3352', background: '#0d1226', borderRadius: 14, padding: '1.1rem',
};

export default function BugReportsAdminPage() {
  const [reports, setReports] = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authed(`/api/bug-report?status=${filter}&limit=200`);
      setReports(data.reports || []);
      setOpenCount(data.open_count || 0);
    } catch (e) {
      setError(e.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    setBusyId(id);
    try {
      await authed('/api/bug-report', {
        method: 'PATCH',
        body: JSON.stringify({ id, status }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#070d1d', color: '#e8ecf8', padding: '2rem 1rem calc(2rem + env(safe-area-inset-bottom))' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Bug reports</h1>
        <p style={{ color: '#8b93b0', marginBottom: '1.5rem' }}>
          {openCount} open. Filed from the launcher's report-a-bug button.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {['open', 'in-progress', 'fixed', 'wont-fix', ''].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => setFilter(s)}
              style={{
                padding: '0.5rem 1rem', borderRadius: 999,
                border: `1px solid ${filter === s ? '#3a86ff' : '#2a3352'}`,
                background: filter === s ? '#3a86ff22' : 'transparent',
                color: '#e8ecf8', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              {s ? s.replace('-', ' ') : 'all'}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: '#8b93b0' }}>Loading…</p>}
        {error && <p style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</p>}
        {!loading && !error && reports.length === 0 && (
          <p style={{ color: '#8b93b0' }}>No reports here. Clean.</p>
        )}

        {reports.map((r) => (
          <article key={r.id} style={{ ...card, marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
              <div>
                <span style={{
                  display: 'inline-block', padding: '0.2rem 0.7rem', borderRadius: 999,
                  fontSize: '0.75rem', fontWeight: 600,
                  background: `${statusColor[r.status]}22`, color: statusColor[r.status],
                  border: `1px solid ${statusColor[r.status]}55`,
                }}>
                  {r.status.replace('-', ' ')}
                </span>
                <p style={{ color: '#8b93b0', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  {ts(r.created_at)}
                  {r.reporter_email ? ` · ${r.reporter_email}` : ' · anonymous'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {STATUSES.filter((s) => s !== r.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => setStatus(r.id, s)}
                    style={{
                      padding: '0.35rem 0.8rem', borderRadius: 8, fontSize: '0.78rem',
                      border: '1px solid #2a3352', background: 'transparent',
                      color: '#c8d0ea', cursor: 'pointer',
                      opacity: busyId === r.id ? 0.5 : 1,
                    }}
                  >
                    {s.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <p style={{ fontSize: '0.95rem', lineHeight: 1.5, marginBottom: r.steps ? '0.75rem' : 0, whiteSpace: 'pre-wrap' }}>
              {r.description}
            </p>
            {r.steps && (
              <p style={{ fontSize: '0.85rem', lineHeight: 1.5, color: '#aab3d4', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
                <strong style={{ color: '#8b93b0' }}>Was doing:</strong> {r.steps}
              </p>
            )}

            <details style={{ fontSize: '0.78rem', color: '#6b7390' }}>
              <summary style={{ cursor: 'pointer' }}>Technical details</summary>
              <div style={{ marginTop: '0.5rem', wordBreak: 'break-all', lineHeight: 1.6 }}>
                <div>Page: {r.page_url || '—'}</div>
                <div>Viewport: {r.viewport || '—'}</div>
                <div>Browser: {r.user_agent || '—'}</div>
              </div>
            </details>
          </article>
        ))}
      </div>
    </main>
  );
}
