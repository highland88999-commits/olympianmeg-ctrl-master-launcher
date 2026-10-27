// components/billboards/PriceNoticePopup.jsx — The advance-notice
// pop-up for the settled billboard price rule (Merlin, 2026-10-27).
// Shows when a paying advertiser has an unacknowledged price notice:
// at 990,000 registered users, prices rise to $50 rotating / $200
// solo when users reach 1,000,000. Two honest exits, no silent
// roll-in: "Keep my ads" acknowledges (the next renewal after the
// flip is at the new price), "Cancel my billboard ads" opts out
// (ads stop, no future charges, current month not refunded).
// Client component; rendered as its own overlay box.

'use client';

export default function PriceNoticePopup({ notice, busy, onKeep, onCancelAll }) {
  if (!notice) return null;
  return (
    <div
      role="dialog"
      aria-label="Upcoming billboard price change"
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'rgba(0,0,0,0.72)', padding: '1rem',
      }}
    >
      <div style={{
        maxWidth: 520, width: '100%', background: '#0d1226', border: '1px solid #fbbf24',
        borderRadius: 16, padding: '1.4rem', color: '#e8e6df',
      }}>
        <h2 style={{ margin: '0 0 0.6rem', fontSize: '1.3rem' }}>Upcoming billboard price change</h2>
        <p style={{ color: '#cbd5e1', lineHeight: 1.55, margin: '0 0 0.8rem' }}>
          Olympus is approaching 1,000,000 registered users. When that line is reached,
          billboard prices rise:
        </p>
        <ul style={{ color: '#e8e6df', lineHeight: 1.7, margin: '0 0 0.8rem' }}>
          <li>Rotating face-slot: <strong>$10 CAD/month → $50 CAD/month</strong></li>
          <li>Whole billboard, solo: <strong>$25 CAD/month → $200 CAD/month</strong></li>
        </ul>
        <p style={{ color: '#cbd5e1', lineHeight: 1.55, margin: '0 0 0.8rem' }}>
          The new price applies only if you keep your subscription — nobody is silently
          rolled into it. If you cancel, your ads stop showing and you will not be
          charged again. The month you already paid for is not refunded.
        </p>
        <p style={{ color: '#8b91a8', fontSize: '0.82rem', margin: '0 0 1rem' }}>
          Billboard revenue feeds the ecosystem, its users, and everything Olympus builds.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onKeep}
            disabled={busy}
            style={{ padding: '0.7rem 1.2rem', borderRadius: 8, border: 'none', background: '#34d399', color: '#0b0e1a', fontWeight: 800, cursor: 'pointer' }}
          >
            Keep my ads
          </button>
          <button
            type="button"
            onClick={onCancelAll}
            disabled={busy}
            style={{ padding: '0.7rem 1.2rem', borderRadius: 8, border: '1px solid #f87171', background: 'transparent', color: '#f87171', fontWeight: 800, cursor: 'pointer' }}
          >
            Cancel my billboard ads (opt out)
          </button>
        </div>
      </div>
    </div>
  );
}
