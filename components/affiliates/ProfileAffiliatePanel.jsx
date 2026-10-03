'use client';

// Affiliate panel embedded in /u/[username] (personal AND business views).
// OWNER ONLY: renders nothing at all for anyone else — not even the prompt.
// The ownership check happens server-side in /api/affiliates/profile-panel,
// so a viewer never learns whether the profile owner has an affiliate code.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ProfileAffiliatePanel({ username }) {
  const [panel, setPanel] = useState(null); // null = unknown/hidden
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.access_token) return;
      fetch(`/api/affiliates/profile-panel?username=${encodeURIComponent(username)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d.ok && d.mine) setPanel(d);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!panel) return null;

  const become = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const r = await fetch('/api/affiliates/code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await r.json();
      if (d.ok) {
        const r2 = await fetch(
          `/api/affiliates/profile-panel?username=${encodeURIComponent(username)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const d2 = await r2.json();
        if (d2.ok && d2.mine) setPanel(d2);
      }
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!panel.link) return;
    try {
      await navigator.clipboard.writeText(panel.link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = panel.link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Not an affiliate yet: compact adoption prompt, owner-only.
  if (!panel.is_affiliate) {
    return (
      <section className="pf-section" aria-label="Affiliate program">
        <div
          style={{
            border: '1px dashed rgba(255,209,102,0.45)',
            borderRadius: 10,
            padding: '1rem 1.1rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.8rem',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#b9b9c7' }}>
            Earn 10% of the house&apos;s cut on everything your referrals buy.{' '}
            <span style={{ color: '#8a8a99' }}>Your link, your people, tracked on your account.</span>
          </p>
          <button
            type="button"
            onClick={become}
            disabled={busy}
            className="pf-btn gold"
            style={{ minHeight: 44 }}
          >
            {busy ? 'Creating…' : 'Become an affiliate'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pf-section" aria-label="Affiliate earnings">
      <h2 className="pf-h">Affiliate</h2>
      <div
        style={{
          background: 'rgba(16,16,24,0.9)',
          border: '1px solid rgba(255,209,102,0.22)',
          borderRadius: 10,
          padding: '1.1rem 1.2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.7rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.4rem', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 2, color: '#8a8a99' }}>
              Wallet balance
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffd166' }}>
              {panel.balance_display}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 2, color: '#8a8a99' }}>
              Referred
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{panel.referred_count}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 2, color: '#8a8a99' }}>
              To payout
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{panel.threshold.percent}%</div>
          </div>
        </div>

        {panel.pending_count > 0 && (
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#e8b34a' }}>
            {panel.pending_count} commission{panel.pending_count === 1 ? '' : 's'} awaiting cost
            finalization — not in your balance yet.
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          <code
            style={{
              fontSize: '0.78rem',
              color: '#00f2ff',
              wordBreak: 'break-all',
              flex: '1 1 200px',
            }}
          >
            {panel.link}
          </code>
          <button type="button" onClick={copyLink} className="pf-btn" style={{ minHeight: 44 }}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>

        <p style={{ margin: 0, fontSize: '0.75rem', color: '#8a8a99' }}>
          Only you can see this — your earnings never show on anyone else&apos;s screen.
        </p>
      </div>
    </section>
  );
}
