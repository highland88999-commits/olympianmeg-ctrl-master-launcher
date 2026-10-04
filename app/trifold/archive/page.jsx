// app/trifold/archive/page.jsx
// Public issue catalog — browses issues (Issue #1, #2, …), each opening to
// its three parts. One issue per week, no orphans. No login required:
// the catalog is part of the acquisition funnel.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TRIFOLD_NAME } from '@/lib/trifold/constants';

export default function TrifoldArchive() {
  const [editions, setEditions] = useState(null);

  useEffect(() => {
    fetch('/api/trifold/editions')
      .then((r) => r.json())
      .then((d) => setEditions(d.ok ? d.editions : []))
      .catch(() => setEditions([]));
  }, []);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.25rem 4rem', color: '#e8e6df' }}>
      <h1 style={{ margin: '0 0 0.4rem' }}>{TRIFOLD_NAME} archive</h1>
      <p style={{ color: '#8b91a8', margin: '0 0 2rem' }}>Every issue: the real paper, the fictional worst, the fictional best.</p>
      {editions === null && <p style={{ color: '#6b7190' }}>Loading…</p>}
      {editions && editions.length === 0 && (
        <p style={{ color: '#6b7190' }}>No issues yet — the first one lands soon. New issue every week.</p>
      )}
      <div style={{ display: 'grid', gap: '0.9rem' }}>
        {(editions || []).map((e) => (
          <Link key={e.id} href={`/trifold/issues/${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ border: '1px solid #232a45', borderRadius: 12, padding: '1.2rem 1.4rem', background: '#0d1226', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <p style={{ margin: '0 0 0.3rem', color: '#a78bfa', fontSize: '0.78rem', letterSpacing: '0.15em' }}>ISSUE #{e.issue_number ?? '—'}</p>
                <h3 style={{ margin: '0 0 0.2rem' }}>{e.newspaper_name}</h3>
                <p style={{ margin: 0, color: '#8b91a8', fontSize: '0.9rem' }}>{e.newspaper_region} · {(e.og_stories || []).length} stories</p>
              </div>
              <span style={{ color: '#a78bfa', fontSize: '1.4rem' }}>→</span>
            </div>
          </Link>
        ))}
      </div>
      <p style={{ textAlign: 'center', marginTop: '2.5rem' }}>
        <Link href="/trifold" style={{ color: '#a78bfa' }}>← Back to {TRIFOLD_NAME}</Link>
      </p>
    </main>
  );
}
